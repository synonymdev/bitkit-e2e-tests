#!/usr/bin/env python3
"""Hold an existing regtest receive out of Electrum until explicit release.

Only the target's Electrum connection uses this proxy. The RN source and its
remote backup are untouched. Requires Python 3.10+, with no third-party modules.
"""
import argparse
import asyncio
import contextlib
import hashlib
import json
import signal
import ssl
from urllib.parse import urlparse


class RpcError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def status_hash(history):
    if not history:
        return None
    value = "".join(f"{row['tx_hash']}:{row['height']}:" for row in history)
    return hashlib.sha256(value.encode()).hexdigest()


def hex_hash(value):
    if len(value) != 64:
        raise argparse.ArgumentTypeError("expected a 64-character hex hash")
    try:
        bytes.fromhex(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected a hex hash") from error
    return value.lower()


class Upstream:
    def __init__(self, url, notification=None):
        self.url = urlparse(url)
        if self.url.scheme not in ("tcp", "ssl") or not self.url.hostname or not self.url.port:
            raise ValueError("upstream must be tcp://host:port or ssl://host:port")
        self.notification = notification
        self.pending = {}
        self.sequence = 0
        self.tasks = set()

    async def connect(self):
        tls = ssl.create_default_context() if self.url.scheme == "ssl" else None
        self.reader, self.writer = await asyncio.wait_for(asyncio.open_connection(
            self.url.hostname, self.url.port, ssl=tls, limit=4 * 1024 * 1024), 15)
        self.read_task = asyncio.create_task(self.read())
        await self.call("server.version", ["late-activity-fixture", "1.4"])
        return self

    async def read(self):
        try:
            while line := await self.reader.readline():
                message = json.loads(line)
                for row in message if isinstance(message, list) else [message]:
                    if "id" in row:
                        future = self.pending.pop(row["id"], None)
                        if future and not future.done():
                            if row.get("error"):
                                error = row["error"]
                                future.set_exception(RpcError(error["code"], error["message"]))
                            else:
                                future.set_result(row.get("result"))
                    elif self.notification:
                        task = asyncio.create_task(self.notification(row))
                        self.tasks.add(task)
                        task.add_done_callback(self.tasks.discard)
        except (OSError, ValueError, asyncio.CancelledError):
            pass
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("upstream connection closed"))
            self.pending.clear()

    async def call(self, method, params):
        self.sequence += 1
        identifier = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[identifier] = future
        self.writer.write((json.dumps({"id": identifier, "method": method,
                                       "params": params}) + "\n").encode())
        try:
            await self.writer.drain()
            return await asyncio.wait_for(future, 20)
        finally:
            self.pending.pop(identifier, None)

    async def close(self):
        self.read_task.cancel()
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(self.read_task, *self.tasks, return_exceptions=True)
        self.writer.close()
        try:
            # Some real Electrum TLS servers never send close_notify. Do not
            # let that delay fixture readiness or leave a test's process alive.
            await asyncio.wait_for(self.writer.wait_closed(), 2)
        except (OSError, asyncio.TimeoutError):
            self.writer.transport.abort()


class Gate:
    def __init__(self, upstream, txid, scripthash):
        self.upstream_url, self.txid, self.scripthash = upstream, txid, scripthash
        self.released = False
        self.lock = asyncio.Lock()
        self.clients = set()
        self.hidden_history_responses = 0
        self.blocked_transaction_requests = 0

    def visible(self, rows):
        return rows if self.released else [row for row in rows if row["tx_hash"] != self.txid]

    async def preflight(self):
        upstream = await Upstream(self.upstream_url).connect()
        try:
            await upstream.call("blockchain.transaction.get", [self.txid])
            history = await upstream.call("blockchain.scripthash.get_history", [self.scripthash])
            utxos = await upstream.call("blockchain.scripthash.listunspent", [self.scripthash])
            # Use a dedicated receive address, never a spent or reused source.
            if len(history) != 1 or history[0]["tx_hash"] != self.txid:
                raise ValueError("fixture address must have exactly the tagged receive in its history")
            if not utxos or any(row["tx_hash"] != self.txid for row in utxos):
                raise ValueError("tagged receive must still be unspent")
            self.preflight_result = {"height": history[0]["height"],
                                     "unspent_sats": sum(row["value"] for row in utxos)}
        finally:
            await upstream.close()

    def status(self):
        return {"state": "released" if self.released else "held", "txid": self.txid,
                "scripthash": self.scripthash, "preflight": self.preflight_result,
                "clients": len(self.clients),
                "hidden_history_responses": self.hidden_history_responses,
                "blocked_transaction_requests": self.blocked_transaction_requests}

    async def release(self):
        async with self.lock:
            self.released = True  # Monotonic: this process cannot rearm a restored wallet.
            for client in list(self.clients):
                try:
                    await client.refresh_subscriptions()
                except (OSError, RpcError, ConnectionError, asyncio.TimeoutError):
                    client.writer.close()

    async def control(self, reader, writer):
        try:
            header = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
            method, path, _ = header.split(b"\r\n", 1)[0].decode().split()
            code = 200
            if method == "POST" and path == "/release":
                await self.release()
                body = self.status()
            elif method == "GET" and path == "/status":
                body = self.status()
            else:
                code, body = 404, {"error": "use GET /status or POST /release"}
            data = json.dumps(body).encode()
            writer.write(f"HTTP/1.1 {code} OK\r\nContent-Type: application/json\r\n"
                         f"Content-Length: {len(data)}\r\nConnection: close\r\n\r\n".encode() + data)
            await writer.drain()
        except (ValueError, OSError, asyncio.TimeoutError, asyncio.IncompleteReadError,
                asyncio.LimitOverrunError):
            pass
        finally:
            writer.close()
            with contextlib.suppress(OSError):
                await writer.wait_closed()

    async def accept(self, reader, writer):
        client = Client(self, reader, writer)
        self.clients.add(client)
        try:
            await client.run()
        finally:
            self.clients.discard(client)


class Client:
    def __init__(self, gate, reader, writer):
        self.gate, self.reader, self.writer = gate, reader, writer
        self.subscriptions = set()
        # Serializing requests with release keeps an in-flight held response
        # from arriving after the released subscription status.
        self.lock = gate.lock
        self.upstream = None

    async def send(self, message):
        self.writer.write((json.dumps(message) + "\n").encode())
        await self.writer.drain()

    async def history_status(self, scripthash):
        rows = await self.upstream.call("blockchain.scripthash.get_history", [scripthash])
        return status_hash(self.gate.visible(rows))

    async def notification(self, message):
        try:
            async with self.lock:
                if message.get("method") == "blockchain.scripthash.subscribe":
                    script = message["params"][0]
                    message = {"method": message["method"],
                               "params": [script, await self.history_status(script)]}
                await self.send(message)
        except (OSError, RpcError, ConnectionError, asyncio.TimeoutError):
            self.writer.close()

    async def refresh_subscriptions(self):
        # Called with the gate lock held by release.
        for script in self.subscriptions:
            await self.send({"method": "blockchain.scripthash.subscribe",
                             "params": [script, await self.history_status(script)]})

    async def response(self, request):
        identifier = request.get("id")
        try:
            method, params = request["method"], request.get("params", [])
            held = not self.gate.released
            if held and method in ("blockchain.transaction.get", "blockchain.transaction.get_merkle") \
                    and params and str(params[0]).lower() == self.gate.txid:
                self.gate.blocked_transaction_requests += 1
                raise RpcError(-5, "transaction withheld by late-activity fixture")
            if method.startswith("blockchain.address."):
                raise RpcError(-32601, "use scripthash methods with this fixture")
            if method == "server.peers.subscribe":
                result = []  # Never suggest a bypass around this fixture.
            else:
                result = await self.upstream.call(method, params)
            if method in ("blockchain.scripthash.get_history", "blockchain.scripthash.get_mempool",
                          "blockchain.scripthash.listunspent"):
                if held and method.endswith("get_history") and any(
                        row["tx_hash"] == self.gate.txid for row in result):
                    self.gate.hidden_history_responses += 1
                # Use the phase at request start, even if release is waiting.
                if held:
                    result = [row for row in result if row["tx_hash"] != self.gate.txid]
            elif method == "blockchain.scripthash.subscribe":
                self.subscriptions.add(params[0])
                result = await self.history_status(params[0])
            elif method == "blockchain.scripthash.get_balance" and held:
                utxos = await self.upstream.call("blockchain.scripthash.listunspent", params)
                result = dict(result)
                for row in utxos:
                    if row["tx_hash"] == self.gate.txid:
                        key = "confirmed" if row["height"] > 0 else "unconfirmed"
                        result[key] -= row["value"]
            elif method == "blockchain.transaction.id_from_pos" and held:
                txid = result.get("tx_hash") if isinstance(result, dict) else result
                if txid == self.gate.txid:
                    raise RpcError(-5, "transaction withheld by late-activity fixture")
            return {"jsonrpc": "2.0", "id": identifier, "result": result}
        except RpcError as error:
            return {"jsonrpc": "2.0", "id": identifier,
                    "error": {"code": error.code, "message": error.message}}
        except (KeyError, TypeError, IndexError, ValueError):
            return {"jsonrpc": "2.0", "id": identifier,
                    "error": {"code": -32600, "message": "invalid request"}}

    async def run(self):
        try:
            self.upstream = await Upstream(self.gate.upstream_url, self.notification).connect()
            while line := await self.reader.readline():
                request = json.loads(line)
                async with self.lock:
                    if isinstance(request, list):
                        result = [await self.response(row) for row in request]
                    else:
                        result = await self.response(request)
                    await self.send(result)
        except (OSError, ValueError, ConnectionError, RpcError, asyncio.TimeoutError):
            pass  # Upstream failure closes the connection; it never bypasses the gate.
        finally:
            if self.upstream:
                await self.upstream.close()
            self.writer.close()
            with contextlib.suppress(OSError):
                await self.writer.wait_closed()


async def serve(args):
    gate = Gate(args.upstream, args.txid, args.scripthash)
    await gate.preflight()
    proxy = await asyncio.start_server(gate.accept, args.listen_host, args.listen_port,
                                       limit=4 * 1024 * 1024)
    try:
        control = await asyncio.start_server(gate.control, "127.0.0.1", args.control_port)
    except BaseException:
        proxy.close()
        await proxy.wait_closed()
        raise
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    print(json.dumps({"ready": True, "electrum": f"tcp://{args.listen_host}:{args.listen_port}",
                      "control": f"http://127.0.0.1:{args.control_port}", **gate.status()}), flush=True)
    try:
        await asyncio.wait_for(stop.wait(), args.max_seconds)
    except asyncio.TimeoutError:
        pass
    finally:
        proxy.close()
        control.close()
        for client in list(gate.clients):
            client.writer.close()
        await proxy.wait_closed()
        await control.wait_closed()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True)
    parser.add_argument("--txid", required=True, type=hex_hash)
    parser.add_argument("--scripthash", required=True, type=hex_hash)
    parser.add_argument("--listen-host", default="127.0.0.1")
    parser.add_argument("--listen-port", type=int, default=23921)
    parser.add_argument("--control-port", type=int, default=23922)
    parser.add_argument("--max-seconds", type=int, default=1800)
    args = parser.parse_args()
    if args.max_seconds <= 0:
        parser.error("--max-seconds must be positive")
    try:
        asyncio.run(serve(args))
    except (ValueError, OSError, RpcError, asyncio.TimeoutError) as error:
        parser.exit(1, f"gate did not start: {error}\n")


if __name__ == "__main__":
    main()

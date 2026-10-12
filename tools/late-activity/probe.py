#!/usr/bin/env python3
"""Check the gate's network behavior, without interacting with an app."""
import argparse
import asyncio
import hashlib
import json
import ssl
import time
from urllib.parse import urlparse

from gate import RpcError, Upstream, hex_hash, status_hash


async def batch_probe(url, txid, scripthash, expect):
    endpoint = urlparse(url)
    tls = ssl.create_default_context() if endpoint.scheme == "ssl" else None
    reader, writer = await asyncio.wait_for(asyncio.open_connection(
        endpoint.hostname, endpoint.port, ssl=tls, limit=4 * 1024 * 1024), 10)
    # Mix the fixture with unused scripts, as a wallet's address scan does.
    requests = [{"id": index, "method": "blockchain.scripthash.get_history",
                 "params": [scripthash if index % 2 == 0 else hashlib.sha256(
                     f"late-activity-probe-{index}".encode()).hexdigest()]}
                for index in range(500)]
    started = time.monotonic()
    try:
        writer.write("".join(json.dumps(request) + "\n" for request in requests).encode())
        await asyncio.wait_for(writer.drain(), 10)
        async def collect():
            responses = []
            while len(responses) < len(requests):
                line = await reader.readline()
                if not line:
                    raise ConnectionError("connection closed before all batch responses")
                message = json.loads(line)
                if isinstance(message, list):
                    responses.extend(message)
                elif "id" in message:
                    responses.append(message)
            return responses
        responses = await asyncio.wait_for(collect(), 10)
        if not isinstance(responses, list) or len(responses) != len(requests):
            raise ValueError("batch did not return all 500 responses")
        by_id = {row["id"]: row for row in responses}
        if set(by_id) != set(range(500)):
            raise ValueError("batch response IDs do not match requests")
        for request in requests:
            response = by_id[request["id"]]
            if response.get("error") or not isinstance(response.get("result"), list):
                raise ValueError("batch history request failed")
            visible = any(row["tx_hash"] == txid for row in response["result"])
            own = request["params"][0] == scripthash
            if visible != (own and expect == "released"):
                raise ValueError("batch history does not match expected gate phase")
        return {"requests": 500, "responses": len(responses),
                "seconds": round(time.monotonic() - started, 3)}
    finally:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), 2)
        except (OSError, asyncio.TimeoutError):
            writer.transport.abort()


async def probe(url, txid, scripthash, expect):
    client = await Upstream(url).connect()
    try:
        history = await client.call("blockchain.scripthash.get_history", [scripthash])
        utxos = await client.call("blockchain.scripthash.listunspent", [scripthash])
        balance = await client.call("blockchain.scripthash.get_balance", [scripthash])
        status = await client.call("blockchain.scripthash.subscribe", [scripthash])
        header = await client.call("blockchain.headers.subscribe", [])
        visible = expect == "released"
        if any(row["tx_hash"] == txid for row in history) != visible:
            raise ValueError("history does not match expected gate phase")
        if any(row["tx_hash"] == txid for row in utxos) != visible:
            raise ValueError("UTXOs do not match expected gate phase")
        if status != status_hash(history):
            raise ValueError("subscription status does not match history")
        if not visible and (history or utxos or balance != {"confirmed": 0, "unconfirmed": 0}):
            raise ValueError("held dedicated receive address still exposes activity")
        try:
            raw_tx = await client.call("blockchain.transaction.get", [txid])
        except RpcError as error:
            if visible or error.code != -5:
                raise
        else:
            if not visible or not isinstance(raw_tx, str) or not raw_tx:
                raise ValueError("raw transaction does not match expected gate phase")
        batch = await batch_probe(url, txid, scripthash, expect)
        return {"probe": "passed", "state": expect, "history_entries": len(history),
                "utxo_count": len(utxos), "balance": balance, "chain_height": header["height"],
                "batch": batch}
    finally:
        await client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--electrum", required=True)
    parser.add_argument("--txid", required=True, type=hex_hash)
    parser.add_argument("--scripthash", required=True, type=hex_hash)
    parser.add_argument("--expect", required=True, choices=("held", "released"))
    args = parser.parse_args()
    try:
        print(json.dumps(asyncio.run(probe(args.electrum, args.txid, args.scripthash, args.expect))))
    except (ValueError, OSError, RpcError, asyncio.TimeoutError) as error:
        parser.exit(1, f"probe failed: {error}\n")


if __name__ == "__main__":
    main()

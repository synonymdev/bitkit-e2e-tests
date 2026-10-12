import asyncio
import hashlib
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

from address import encode, scripthash
from gate import Gate, RpcError, Upstream, status_hash
from probe import probe
from ios_config import configure, preference

TXID = "a" * 64
OTHER = "b" * 64
SCRIPT = "c" * 64
OTHER_SCRIPT = "d" * 64
HISTORY = [{"tx_hash": TXID, "height": 123}]
UTXOS = [{"tx_hash": TXID, "height": 123, "tx_pos": 0, "value": 50000}]


class FakeElectrum:
    def __init__(self):
        self.writers = set()
        self.history = HISTORY
        self.utxos = UTXOS
        self.fail = False
        self.delay = 0
        self.replies = set()
        self.history_seen = asyncio.Event()

    async def reply(self, writer, response):
        await asyncio.sleep(self.delay)
        writer.write((json.dumps(response) + "\n").encode())
        await writer.drain()

    async def accept(self, reader, writer):
        self.writers.add(writer)
        try:
            while line := await reader.readline():
                request = json.loads(line)
                method, params = request["method"], request["params"]
                result = "forwarded"
                if self.fail:
                    return
                if method == "server.version":
                    result = ["fake-electrum", "1.4"]
                elif method == "blockchain.headers.subscribe":
                    result = {"height": 124, "hex": "00" * 80}
                elif method == "blockchain.transaction.get":
                    result = "02000000"
                elif method.startswith("blockchain.scripthash."):
                    own = params[0] == SCRIPT
                    if method.endswith("get_history") or method.endswith("get_mempool"):
                        self.history_seen.set()
                        result = self.history if own else [{"tx_hash": OTHER, "height": 122}]
                    elif method.endswith("listunspent"):
                        result = self.utxos if own else [{"tx_hash": OTHER, "height": 122, "value": 1000}]
                    elif method.endswith("get_balance"):
                        result = {"confirmed": 50000 if own else 1000, "unconfirmed": 0}
                    elif method.endswith("subscribe"):
                        result = status_hash(self.history if own else [{"tx_hash": OTHER, "height": 122}])
                task = asyncio.create_task(self.reply(writer, {"id": request["id"], "result": result}))
                self.replies.add(task)
                task.add_done_callback(self.replies.discard)
        finally:
            self.writers.discard(writer)
            writer.close()
            await writer.wait_closed()


class GateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fake = FakeElectrum()
        self.origin = await asyncio.start_server(self.fake.accept, "127.0.0.1", 0)
        port = self.origin.sockets[0].getsockname()[1]
        self.gate = Gate(f"tcp://127.0.0.1:{port}", TXID, SCRIPT)
        await self.gate.preflight()
        self.server = await asyncio.start_server(self.gate.accept, "127.0.0.1", 0, limit=4 * 1024 * 1024)
        self.url = f"tcp://127.0.0.1:{self.server.sockets[0].getsockname()[1]}"
        self.control = await asyncio.start_server(self.gate.control, "127.0.0.1", 0)
        self.clients = []

    async def asyncTearDown(self):
        for task in list(self.fake.replies):
            task.cancel()
        await asyncio.gather(*self.fake.replies, return_exceptions=True)
        for client in self.clients:
            await client.close()
        for server in (self.server, self.control, self.origin):
            server.close()
            await server.wait_closed()
        for client in list(self.gate.clients):
            client.writer.close()
        for writer in list(self.fake.writers):
            writer.close()
        await asyncio.sleep(0.02)

    async def client(self, notification=None):
        client = await Upstream(self.url, notification).connect()
        self.clients.append(client)
        return client

    async def http(self, method, path):
        port = self.control.sockets[0].getsockname()[1]
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(f"{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n".encode())
        await writer.drain()
        result = await reader.read()
        writer.close()
        await writer.wait_closed()
        return result

    async def test_network_probe_held_and_released(self):
        self.assertEqual((await probe(self.url, TXID, SCRIPT, "held"))["balance"]["confirmed"], 0)
        self.assertGreater(self.gate.hidden_history_responses, 0)
        await self.http("POST", "/release")
        self.assertEqual((await probe(self.url, TXID, SCRIPT, "released"))["balance"]["confirmed"], 50000)

    async def test_reconnect_remains_held_until_explicit_release(self):
        first = await self.client()
        self.assertEqual(await first.call("blockchain.scripthash.get_history", [SCRIPT]), [])
        await first.close()
        self.clients.remove(first)
        second = await self.client()
        self.assertEqual(await second.call("blockchain.scripthash.get_history", [SCRIPT]), [])
        # A GET cannot release the gate.
        self.assertIn(b"404", await self.http("GET", "/release"))
        self.assertFalse(self.gate.released)

    async def test_unrelated_history_balance_and_chain_are_unchanged(self):
        client = await self.client()
        self.assertEqual(await client.call("blockchain.scripthash.get_history", [OTHER_SCRIPT]),
                         [{"tx_hash": OTHER, "height": 122}])
        self.assertEqual(await client.call("blockchain.scripthash.get_balance", [OTHER_SCRIPT]),
                         {"confirmed": 1000, "unconfirmed": 0})
        self.assertEqual((await client.call("blockchain.headers.subscribe", []))["height"], 124)
        self.assertEqual(await client.call("server.peers.subscribe", []), [])

    async def test_batch_and_direct_fetch_do_not_leak(self):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.server.sockets[0].getsockname()[1])
        writer.write((json.dumps([
            {"id": 41, "method": "blockchain.scripthash.get_history", "params": [SCRIPT]},
            {"id": 42, "method": "blockchain.transaction.get", "params": [TXID]},
            {"id": 43, "method": "blockchain.scripthash.get_mempool", "params": [SCRIPT]},
            {"id": 44, "method": "blockchain.transaction.get_merkle", "params": [TXID.upper(), 123]},
        ]) + "\n").encode())
        await writer.drain()
        response = json.loads(await reader.readline())
        self.assertEqual(response[0], {"jsonrpc": "2.0", "id": 41, "result": []})
        self.assertEqual(response[1]["error"]["code"], -5)
        self.assertEqual(response[2]["result"], [])
        self.assertEqual(response[3]["error"]["code"], -5)
        writer.close()
        await writer.wait_closed()

    async def test_500_request_batch_completes_with_network_latency_in_both_phases(self):
        # 50 ms per response makes serialized forwarding take 25 seconds.
        self.fake.delay = 0.05
        requests = [{"id": index, "method": "blockchain.scripthash.get_history",
                     "params": [SCRIPT if index % 2 == 0 else OTHER_SCRIPT]}
                    for index in range(500)]
        reader, writer = await asyncio.open_connection(
            "127.0.0.1", self.server.sockets[0].getsockname()[1], limit=4 * 1024 * 1024)
        try:
            for phase in ("held", "released"):
                if phase == "released":
                    await self.http("POST", "/release")
                for wire in ("array", "lines"):
                    with self.subTest(phase=phase, wire=wire):
                        data = (json.dumps(requests) + "\n") if wire == "array" else "".join(
                            json.dumps(row) + "\n" for row in requests)
                        writer.write(data.encode())
                        await writer.drain()
                        async def collect():
                            rows = []
                            while len(rows) < 500:
                                message = json.loads(await reader.readline())
                                rows.extend(message if isinstance(message, list) else [message])
                            return rows
                        responses = await asyncio.wait_for(collect(), 2)
                        if wire == "array":
                            self.assertEqual([row["id"] for row in responses], list(range(500)))
                        self.assertEqual({row["id"] for row in responses}, set(range(500)))
                        for row in responses:
                            expected = (HISTORY if phase == "released" else []) if row["id"] % 2 == 0 else [
                                {"tx_hash": OTHER, "height": 122}]
                            self.assertEqual(row["result"], expected)
            self.assertEqual(self.gate.hidden_history_responses, 500)
        finally:
            writer.close()
            await writer.wait_closed()

    async def test_release_notifies_existing_subscriber_and_preserves_raw_transaction(self):
        notifications = asyncio.Queue()
        async def notify(row):
            await notifications.put(row)
        client = await self.client(notify)
        self.assertIsNone(await client.call("blockchain.scripthash.subscribe", [SCRIPT]))
        await self.http("POST", "/release")
        row = await asyncio.wait_for(notifications.get(), 2)
        self.assertEqual(row["params"], [SCRIPT, status_hash(HISTORY)])
        self.assertEqual(await client.call("blockchain.transaction.get", [TXID]), "02000000")
        await self.http("POST", "/release")
        self.assertTrue(self.gate.released)

    async def test_release_drains_held_pipeline_before_notifying_subscriber(self):
        notifications = asyncio.Queue()
        async def notify(row):
            await notifications.put(row)
        client = await self.client(notify)
        self.assertIsNone(await client.call("blockchain.scripthash.subscribe", [SCRIPT]))
        self.fake.delay = 0.05
        self.fake.history_seen.clear()
        calls = [asyncio.create_task(client.call("blockchain.scripthash.get_history", [SCRIPT]))
                 for _ in range(500)]
        await asyncio.wait_for(self.fake.history_seen.wait(), 2)
        self.assertIn(b"200", await self.http("POST", "/release"))
        self.assertEqual(await asyncio.wait_for(asyncio.gather(*calls), 2), [[]] * 500)
        notification = await asyncio.wait_for(notifications.get(), 2)
        self.assertEqual(notification["params"], [SCRIPT, status_hash(HISTORY)])
        self.assertEqual(await client.call("blockchain.scripthash.get_history", [SCRIPT]), HISTORY)

    async def test_upstream_failure_closes_instead_of_returning_empty_success(self):
        client = await self.client()
        self.fake.fail = True
        with self.assertRaises(ConnectionError):
            await client.call("blockchain.scripthash.get_history", [SCRIPT])

    async def test_preflight_rejects_missing_spent_and_reused_addresses(self):
        for history, utxos in (([], []), (HISTORY, []),
                               (HISTORY + [{"tx_hash": OTHER, "height": 1}], UTXOS)):
            self.fake.history, self.fake.utxos = history, utxos
            with self.assertRaises(ValueError):
                await self.gate.preflight()


class AddressTests(unittest.TestCase):
    def test_scripthash_for_regtest_v0(self):
        for size in (20, 32):
            program = bytes(range(size))
            address = encode(program)
            expected = hashlib.sha256(bytes([0, size]) + program).digest()[::-1].hex()
            self.assertEqual(scripthash(address), expected)
            self.assertEqual(scripthash(address.upper()), expected)

    def test_wrong_network_mixed_case_and_checksum_rejected(self):
        address = encode(bytes(range(20)))
        for bad in (address.replace("bcrt", "bc"), address[:-1] + "q", "B" + address[1:], "bcrt1"):
            with self.assertRaises(ValueError):
                scripthash(bad)


class IosConfigTests(unittest.TestCase):
    def test_data_preference_matches_native_electrum_model(self):
        prefs = preference("127.0.0.1", 23921)
        encoded = plistlib.dumps(prefs)
        decoded = plistlib.loads(encoded)["electrumServer"]
        self.assertIsInstance(decoded, bytes)
        self.assertEqual(json.loads(decoded), {"host": "127.0.0.1", "port": 23921, "protocolType": "tcp"})

    def test_configures_only_explicit_fresh_app_container_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "Library/Preferences/to.bitkit.plist"
            udid = "01234567-89ab-cdef-0123-456789abcdef"
            with patch("ios_config.subprocess.check_output", return_value=directory) as command:
                with patch("builtins.print"):
                    configure(udid, "to.bitkit", "127.0.0.1", 23921)
                command.assert_called_once_with(
                    ["xcrun", "simctl", "get_app_container", udid, "to.bitkit", "data"], text=True)
                original = destination.read_bytes()
                with self.assertRaises(FileExistsError):
                    configure(udid, "to.bitkit", "127.0.0.1", 23923)
                self.assertEqual(destination.read_bytes(), original)

    def test_implicit_devices_rejected_before_simctl(self):
        with patch("ios_config.subprocess.check_output") as command:
            with self.assertRaises(ValueError):
                configure("booted", "to.bitkit", "127.0.0.1", 23921)
            command.assert_not_called()


if __name__ == "__main__":
    unittest.main()

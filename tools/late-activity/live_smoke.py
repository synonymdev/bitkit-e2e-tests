#!/usr/bin/env python3
"""Opt-in live proof using disposable staging regtest chain state, no app."""
import argparse
import asyncio
import json
import secrets
import urllib.request

from address import encode, scripthash
from gate import Gate, Upstream, hex_hash
from probe import batch_probe, probe

UPSTREAM = "ssl://electrs.bitkit.stag0.blocktank.to:9999"
DEPOSIT = "https://api.stag0.blocktank.to/blocktank/api/v2/regtest/chain/deposit"


def deposit(address):
    request = urllib.request.Request(DEPOSIT, method="POST", headers={"Content-Type": "application/json"},
                                     data=json.dumps({"address": address, "amountSat": 1000}).encode())
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode()


async def smoke(txid=None, script=None):
    # An unowned, random witness program: no wallet/credential store is used.
    address = None
    if txid is None:
        address = encode(secrets.token_bytes(20))
        script = scripthash(address)
        result = await asyncio.to_thread(deposit, address)
    origin = await Upstream(UPSTREAM).connect()
    try:
        if txid is None:
            for _ in range(30):
                history = await origin.call("blockchain.scripthash.get_history", [script])
                if len(history) == 1:
                    txid = history[0]["tx_hash"]
                    break
                await asyncio.sleep(1)
        if not txid:
            raise ValueError(f"disposable deposit was not indexed: {result}")
        direct_batch = await batch_probe(UPSTREAM, txid, script, "released")
        raw_before = await origin.call("blockchain.transaction.get", [txid])
        gate = Gate(UPSTREAM, txid, script)
        await gate.preflight()
        proxy = await asyncio.start_server(gate.accept, "127.0.0.1", 0, limit=4 * 1024 * 1024)
        control = await asyncio.start_server(gate.control, "127.0.0.1", 0)
        client = None
        try:
            url = f"tcp://127.0.0.1:{proxy.sockets[0].getsockname()[1]}"
            held = await probe(url, txid, script, "held")
            # Release through the same HTTP interface used by the tester.
            reader, writer = await asyncio.open_connection("127.0.0.1", control.sockets[0].getsockname()[1])
            writer.write(b"POST /release HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n")
            await writer.drain()
            response = await reader.read()
            writer.close()
            await writer.wait_closed()
            if not response.startswith(b"HTTP/1.1 200"):
                raise ValueError("release failed")
            released = await probe(url, txid, script, "released")
            client = await Upstream(url).connect()
            if await client.call("blockchain.transaction.get", [txid]) != raw_before:
                raise ValueError("released raw transaction differs from the real upstream")
            print(json.dumps({"live_smoke": "passed", "address": address, "txid": txid,
                              "scripthash": script, "held": held, "released": released,
                              "direct_batch": direct_batch,
                              "raw_transaction_unchanged": True, "gate": gate.status()}))
        finally:
            if client:
                await client.close()
            proxy.close()
            control.close()
            for client in list(gate.clients):
                client.writer.close()
            await proxy.wait_closed()
            await control.wait_closed()
    finally:
        await origin.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--fund-disposable-regtest", action="store_true",
                        help="send 1000 disposable regtest sats to a random unowned address")
    source.add_argument("--txid", type=hex_hash, help="read an existing dedicated unspent receive, without funding")
    parser.add_argument("--scripthash", type=hex_hash)
    args = parser.parse_args()
    if bool(args.txid) != bool(args.scripthash):
        parser.error("--txid and --scripthash must be supplied together")
    asyncio.run(asyncio.wait_for(smoke(args.txid, args.scripthash), 120))

#!/usr/bin/env python3
"""Check the gate's network behavior, without interacting with an app."""
import argparse
import asyncio
import json

from gate import RpcError, Upstream, hex_hash, status_hash


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
        return {"probe": "passed", "state": expect, "history_entries": len(history),
                "utxo_count": len(utxos), "balance": balance, "chain_height": header["height"]}
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

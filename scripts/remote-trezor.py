#!/usr/bin/env python3
"""Run hardware-wallet fixture operations through the paired backend's loopback relay."""
import http.client
import json
import os
import sys
from urllib.parse import urlsplit


def fixture_command(args):
    if args in (["start", "--json"], ["status", "--json"], ["stop"]):
        return args[0]
    if len(args) == 2 and args[0] == "send-json":
        if json.loads(args[1]) == {"type": "emulator-press-yes"}:
            return "press-yes"
    raise ValueError("Unknown remote Trezor fixture command")


def main():
    command = fixture_command(sys.argv[1:])
    url = urlsplit(os.environ["TREZOR_FIXTURE_URL"])
    if url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port:
        raise ValueError("TREZOR_FIXTURE_URL must point to the Mac's loopback relay")
    connection = http.client.HTTPConnection(url.hostname, url.port, timeout=300)
    try:
        connection.request("POST", "/trezor", json.dumps({"command": command}), {
            "Authorization": "Bearer " + os.environ["TREZOR_FIXTURE_TOKEN"],
            "Content-Type": "application/json",
        })
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"Trezor {command} failed (HTTP {response.status})")
        result = json.load(response)
        if command in ("start", "status"):
            # The tests need the address. Keep the fixture's seed out of the artifacts.
            result["mnemonic"] = None
            print(json.dumps(result))
    finally:
        connection.close()


if __name__ == "__main__":
    main()

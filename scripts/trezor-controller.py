#!/usr/bin/env python3
"""Small client for the Trezor User Env websocket controller.

The shell helper runs this file inside the User Env container so the host does
not need a Python websocket package installed.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

import websockets


CONTROLLER_WS = os.environ.get("TREZOR_CONTROLLER_WS", "ws://127.0.0.1:9001")
DEFAULT_MNEMONIC = "all all all all all all all all all all all all"


def next_id() -> int:
    next_id.value += 1
    return next_id.value


next_id.value = 0


async def send(payload: dict[str, Any], *, allow_failure: bool = False) -> dict[str, Any]:
    async with websockets.connect(CONTROLLER_WS) as websocket:
        await websocket.recv()
        await websocket.send(json.dumps(payload))
        raw_response = await websocket.recv()

    response = json.loads(raw_response)
    print(json.dumps(response, indent=2, sort_keys=True))

    if not allow_failure and not response.get("success", False):
        raise RuntimeError(response.get("error", response))

    return response


async def setup() -> None:
    await send(
        {
            "type": "bridge-start",
            "version": os.environ.get("TREZOR_BRIDGE_VERSION", "node-bridge"),
            "id": next_id(),
        }
    )
    await send(
        {
            "type": "emulator-start",
            "model": os.environ.get("TREZOR_MODEL", "T2T1"),
            "version": os.environ.get("TREZOR_FIRMWARE", "2-main"),
            "wipe": os.environ.get("TREZOR_WIPE", "true").lower() != "false",
            "id": next_id(),
        }
    )
    await send(
        {
            "type": "emulator-setup",
            "mnemonic": os.environ.get("TREZOR_MNEMONIC", DEFAULT_MNEMONIC),
            "pin": os.environ.get("TREZOR_PIN", ""),
            "passphrase_protection": os.environ.get(
                "TREZOR_PASSPHRASE_PROTECTION", "false"
            ).lower()
            == "true",
            "label": os.environ.get("TREZOR_LABEL", "Bitkit Test Trezor"),
            "needs_backup": os.environ.get("TREZOR_NEEDS_BACKUP", "false").lower()
            == "true",
            "id": next_id(),
        }
    )
    await status()


async def status() -> None:
    await send({"type": "background-check", "id": next_id()})


async def stop() -> None:
    await send({"type": "emulator-stop", "id": next_id()}, allow_failure=True)
    await send({"type": "bridge-stop", "id": next_id()}, allow_failure=True)
    await status()


async def raw(payload: str) -> None:
    parsed = json.loads(payload)
    parsed.setdefault("id", next_id())
    await send(parsed)


async def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "setup"

    if command == "ping":
        await send({"type": "ping", "id": next_id()})
    elif command == "setup":
        await setup()
    elif command == "status":
        await status()
    elif command == "stop":
        await stop()
    elif command == "send-json":
        if len(sys.argv) != 3:
            raise SystemExit("send-json expects one JSON payload argument")
        await raw(sys.argv[2])
    else:
        raise SystemExit(f"Unknown controller command: {command}")


if __name__ == "__main__":
    asyncio.run(main())

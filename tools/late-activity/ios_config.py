#!/usr/bin/env python3
"""Create the Electrum preference for a freshly installed, unlaunched target.

The caller must own this simulator. This tool installs no app, launches no app,
and never changes preferences in an existing wallet's app container.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import plistlib
import subprocess
import uuid


def preference(host, port):
    if not host or any(char.isspace() for char in host) or "://" in host:
        raise ValueError("supply a host/IP, not a URL")
    if not 1 <= port <= 65535:
        raise ValueError("invalid TCP port")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for char in host):
            raise ValueError("invalid host")
    return {"electrumServer": json.dumps({"host": host, "port": port,
                                          "protocolType": "tcp"}, separators=(",", ":")).encode()}


def configure(udid, bundle_id, host, port):
    uuid.UUID(udid)  # Refuse implicit booted/all device selection.
    if not bundle_id or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for char in bundle_id):
        raise ValueError("invalid bundle ID")
    prefs = preference(host, port)
    output = subprocess.check_output(["xcrun", "simctl", "get_app_container", udid, bundle_id, "data"], text=True).strip()
    container = Path(output)
    if not container.is_absolute() or not container.is_dir():
        raise ValueError("simctl did not return an installed app's data container")
    destination = container / "Library" / "Preferences" / f"{bundle_id}.plist"
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Never overwrite a source or a target that has already started restoring.
    with destination.open("xb") as handle:
        plistlib.dump(prefs, handle)
    if plistlib.loads(destination.read_bytes()) != prefs:
        raise ValueError("Electrum preference did not persist")
    print(json.dumps({"configured": True, "udid": udid, "bundle_id": bundle_id,
                      "electrum": f"tcp://{host}:{port}", "before_first_launch": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=23921)
    args = parser.parse_args()
    try:
        configure(args.udid, args.bundle_id, args.host, args.port)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"target was not configured: {error}\n")

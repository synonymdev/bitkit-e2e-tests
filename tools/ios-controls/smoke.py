#!/usr/bin/env python3
"""Prove controls after relaunch on an owned, standalone Settings fixture."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--driver-host-port", required=True, type=int)
    parser.add_argument("--artifacts", required=True, type=Path)
    args = parser.parse_args()
    if os.environ.get("QA_SEAT"):
        parser.error("smoke is for a standalone fixture, never a QA seat")
    devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "--json"]))
    device = next((d for group in devices["devices"].values() for d in group if d["udid"] == args.udid), {})
    if not device.get("name", "").startswith("controls-fixture-") or device.get("state") != "Booted":
        parser.error("requires your booted controls-fixture-* simulator")
    args.artifacts.mkdir(parents=True, exist_ok=True)
    simctl = ["xcrun", "simctl"]
    app = "com.apple.Preferences"

    def pid():
        rows = subprocess.check_output(simctl + ["spawn", args.udid, "launchctl", "list"], text=True)
        return next(row.split()[0] for row in rows.splitlines() if "UIKitApplication:com.apple.Preferences[" in row)

    def control(action, text, label, expected=0):
        with (args.artifacts / f"{label}.log").open("w") as log:
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("control.py")), action,
                                     "--udid", args.udid, "--app-id", app,
                                     "--driver-host-port", str(args.driver_host_port), "--text", text,
                                     "--timeout-ms", "1000" if expected else "10000",
                                     "--artifacts", str(args.artifacts / label)],
                                    stdout=log, stderr=subprocess.STDOUT, timeout=130)
        if result.returncode != expected:
            raise RuntimeError(f"{label} unexpected exit {result.returncode}; see its log")

    subprocess.run(simctl + ["launch", args.udid, app], check=True, capture_output=True)
    for iteration in (1, 2):
        subprocess.run(simctl + ["terminate", args.udid, app], check=True)
        launched = subprocess.run(simctl + ["launch", args.udid, app], check=True,
                                  capture_output=True, text=True)
        before = launched.stdout.strip().split(": ")[-1]
        control("tap", "General", f"r{iteration}-general")
        control("wait", "About", f"r{iteration}-wait")
        control("tap", "About", f"r{iteration}-tap")
        control("wait", "iOS Version", f"r{iteration}-destination")
        if pid() != before:
            raise RuntimeError("control invocation relaunched Settings")
        print(f"relaunch_{iteration}: passed", flush=True)
        print(f"relaunch_{iteration}_pid_preserved: true", flush=True)
    before = pid()
    control("wait", "missing-fixture-control-131503", "missing-control", expected=1)
    if pid() != before:
        raise RuntimeError("failed wait relaunched Settings")
    print("missing_control_rejected: true")
    print("fixture_smoke: passed")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Use Maestro controls without launching, stopping or wiping the app."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import uuid


def flow(app_id, action, selector, timeout_ms):
    # JSON strings are valid YAML scalars. Maestro selectors are regexes, so
    # quote literal identifiers/labels before sending them to its driver.
    selected = {selector[0]: re.escape(selector[1])}
    lines = [f"appId: {json.dumps(app_id)}", "---",
             "- extendedWaitUntil:",
             "    visible: " + json.dumps(selected),
             f"    timeout: {timeout_ms}"]
    if action == "tap":
        lines.append("- tapOn: " + json.dumps(selected))
    return "\n".join(lines) + "\n"


def run(command, timeout):
    # A CLI timeout must stop this invocation's driver subprocesses as well;
    # never kill a shared Maestro process by name.
    process = subprocess.Popen(command, start_new_session=True)
    try:
        return process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        return 124


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["snapshot", "wait", "tap"])
    parser.add_argument("--udid", required=True, type=lambda s: str(uuid.UUID(s)).upper())
    parser.add_argument("--app-id", required=True)
    port = parser.add_mutually_exclusive_group(required=True)
    port.add_argument("--driver-host-port", type=int)
    port.add_argument("--standalone", action="store_true",
                      help="default driver port; forbidden on a QA seat")
    selector = parser.add_mutually_exclusive_group()
    selector.add_argument("--id")
    selector.add_argument("--text")
    parser.add_argument("--timeout-ms", type=int, default=10000)
    parser.add_argument("--artifacts", required=True, type=Path)
    parser.add_argument("--maestro", default="maestro")
    args = parser.parse_args(argv)
    if args.standalone and os.environ.get("QA_SEAT"):
        parser.error("a QA seat requires its handed-out --driver-host-port")
    if args.driver_host_port is not None and not 1024 <= args.driver_host_port <= 65535:
        parser.error("driver port must be between 1024 and 65535")
    if not 1 <= args.timeout_ms <= 60000:
        parser.error("timeout must be between 1 and 60000 ms")
    if args.action != "snapshot" and not (args.id or args.text):
        parser.error("wait and tap require a nonempty --id or --text")
    command = [args.maestro, "--device", args.udid]
    if args.driver_host_port is not None:
        command += ["--driver-host-port", str(args.driver_host_port)]
    args.artifacts.mkdir(parents=True, exist_ok=True)
    if args.action == "snapshot":
        command += ["hierarchy", "--no-ansi"]
        result = run(command, 60)
    else:
        with tempfile.TemporaryDirectory(prefix="ios-controls-", dir=args.artifacts) as folder:
            path = Path(folder) / "control.yaml"
            path.write_text(flow(args.app_id, args.action,
                                 ("id", args.id) if args.id else ("text", args.text),
                                 args.timeout_ms))
            command += ["test", "--no-ansi", "--debug-output", str(args.artifacts.resolve()),
                        str(path)]
            # Driver startup is separate from the requested UI wait.
            result = run(command, 90 + args.timeout_ms / 1000)
    if args.action == "snapshot":
        print("hierarchy: " + ("captured" if result == 0 else "failed"))
    else:
        print("controls: " + ("available" if result == 0 else "unavailable"))
    return result


if __name__ == "__main__":
    sys.exit(main())

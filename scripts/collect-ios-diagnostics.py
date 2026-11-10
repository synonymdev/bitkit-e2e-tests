#!/usr/bin/env python3
"""Collect logs only, never wallet storage or credentials. Each probe is bounded."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def collect(output, udid, app_id, app_only=False, run=subprocess.run):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {"probes": [], "appLogs": []}

    def probe(name, argv, timeout=10):
        try:
            result = run(argv, capture_output=True, text=True, timeout=timeout)
            value = result.stdout
            (output / name).write_text(value + result.stderr)
            manifest["probes"].append({"file": name, "exitCode": result.returncode})
            return value.strip() if result.returncode == 0 else None
        except Exception as error:
            manifest["probes"].append({"file": name, "error": str(error)})
            return None

    if udid:
        group = probe("app-group-path.txt", ["xcrun", "simctl", "get_app_container", udid, app_id, "group.bitkit"])
        if group:
            logs = Path(group) / "logs"
            for source in sorted(logs.glob("*.log")):
                # Do not follow symlinks into other app-group data.
                if source.is_symlink() or not source.is_file():
                    continue
                try:
                    target = output / "app-logs" / source.name
                    target.parent.mkdir(exist_ok=True)
                    shutil.copyfile(source, target)
                    manifest["appLogs"].append({"file": str(target.relative_to(output)), "bytes": target.stat().st_size})
                except Exception as error:
                    manifest["appLogs"].append({"file": source.name, "error": str(error)})
        if not app_only:
            probe("simulator-processes.txt", ["xcrun", "simctl", "spawn", udid, "launchctl", "list"])
    else:
        manifest["probes"].append({"error": "Simulator UDID unavailable"})

    if not app_only:
        state = Path("/tmp/namespace-stack")
        for source in [state / "attach.log", *sorted(state.glob("forward-*.log"))]:
            if source.is_file() and not source.is_symlink():
                try:
                    # Preserve the useful tail without unbounded tunnel logs.
                    with source.open("rb") as stream:
                        stream.seek(max(0, source.stat().st_size - 256_000))
                        (output / source.name).write_bytes(stream.read())
                except Exception as error:
                    manifest["probes"].append({"file": source.name, "error": str(error)})
        for container in ("bitcoin", "electrum", "lnd"):
            probe(f"{container}-state.json", ["docker", "inspect", "--format", '{"state":{{json .State}},"restartCount":{{.RestartCount}}}', container])
            probe(f"{container}.log", ["docker", "logs", "--timestamps", "--tail", "500", container])
    (output / "native-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--udid", default="")
    parser.add_argument("--app-id", default="to.bitkit")
    parser.add_argument("--app-only", action="store_true")
    args = parser.parse_args()
    collect(args.output, args.udid, args.app_id, args.app_only)

#!/usr/bin/env python3
"""Hide a simulator's software keyboard and verify the field is unchanged."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid


def find_axe():
    if executable := shutil.which("axe"):
        return executable
    if executable := shutil.which("xcodebuildmcp"):
        bundled = Path(executable).resolve().parent.parent / "libexec/bundled/axe"
        if bundled.is_file():
            return str(bundled)
    raise RuntimeError("AXe is missing; pass --axe with XcodeBuildMCP's bundled axe path")


def walk(nodes):
    for node in nodes:
        yield node
        yield from walk(node.get("children", []))


def intersects(frame, viewport):
    return (frame.get("width", 0) > 0 and frame.get("height", 0) > 0
            and frame.get("x", 0) < viewport["x"] + viewport["width"]
            and frame.get("y", 0) < viewport["y"] + viewport["height"]
            and frame.get("x", 0) + frame["width"] > viewport["x"]
            and frame.get("y", 0) + frame["height"] > viewport["y"])


def inspect(tree, field_id):
    apps = [node for node in tree if node.get("type") == "Application"]
    if len(apps) != 1 or not apps[0].get("pid") or not apps[0].get("frame"):
        raise RuntimeError("cannot identify the foreground application")
    app = apps[0]
    nodes = list(walk([app]))
    fields = [node for node in nodes if node.get("AXUniqueId") == field_id
              and node.get("type") in ("TextField", "TextView", "SecureTextField")]
    if len(fields) != 1:
        raise RuntimeError("expected exactly one input with the requested field id")
    # AXe retains keyboard keys off screen after dismissal. Check geometry,
    # not just their existence. Identifiers avoid localized key labels.
    keyboard = any(node.get("AXUniqueId") in ("delete", "Return", "space")
                   and node.get("type") == "Button"
                   and intersects(node.get("frame", {}), app["frame"])
                   for node in nodes)
    return app["pid"], fields[0].get("AXValue"), keyboard


def run(udid, field_id, axe, check=False):
    def snapshot():
        result = subprocess.run([axe, "describe-ui", "--udid", udid],
                                capture_output=True, text=True, check=True, timeout=15)
        return inspect(json.loads(result.stdout), field_id)

    before = snapshot()
    if check:
        return "visible" if before[2] else "hidden"
    control = Path(__file__).parent / "build/keyboard-control"
    subprocess.run([str(control), "hide", "--udid", udid],
                   capture_output=True, text=True, check=True, timeout=10)
    for _ in range(3):
        time.sleep(0.2)
        after = snapshot()
        if after[:2] != before[:2]:
            raise RuntimeError("application or field value changed during keyboard dismissal")
        if not after[2]:
            return "hidden"
    raise RuntimeError("software keyboard is still visible")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", required=True, type=lambda value: str(uuid.UUID(value)).upper())
    parser.add_argument("--field-id", required=True)
    parser.add_argument("--axe", help="AXe executable (default: installed or XcodeBuildMCP bundled)")
    parser.add_argument("--check", action="store_true", help="inspect without changing keyboard mode")
    args = parser.parse_args()
    try:
        state = run(args.udid, args.field_id, args.axe or find_axe(), args.check)
    except (RuntimeError, subprocess.SubprocessError, OSError, ValueError, KeyError) as error:
        print(f"keyboard check failed: {error}", file=sys.stderr)
        return 1
    print(f"keyboard: {state}")
    if not args.check:
        print("text_preserved: true")
    return 0


if __name__ == "__main__":
    sys.exit(main())

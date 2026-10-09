#!/usr/bin/env python3
"""Prove keyboard dismissal on KeyboardFixture, never on a wallet QA item."""
import argparse
import json
from pathlib import Path
import subprocess
import time

import dismiss


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--udid", required=True)
    parser.add_argument("--axe")
    args = parser.parse_args()
    axe = args.axe or dismiss.find_axe()

    def call(*command):
        return subprocess.check_output(list(command), text=True, timeout=20)

    def snapshot():
        return json.loads(call(axe, "describe-ui", "--udid", args.udid))

    # Refuse to drive anything other than our standalone fixture.
    tree = snapshot()
    before = dismiss.inspect(tree, "FixtureField")
    assert tree[0].get("AXLabel") == "KeyboardFixture", "wrong foreground app"
    assert before[1] == "fixture-proof", "unexpected fixture input"
    call(str(Path(__file__).parent / "build/keyboard-control"), "show", "--udid", args.udid)
    call(axe, "tap", "--id", "FixtureField", "--udid", args.udid)
    time.sleep(0.5)
    visible = dismiss.inspect(snapshot(), "FixtureField")
    assert visible[2], "fixture keyboard did not become visible"
    assert dismiss.run(args.udid, "FixtureField", axe) == "hidden"
    tree = snapshot()
    hidden = dismiss.inspect(tree, "FixtureField")
    assert hidden[:2] == visible[:2] and not hidden[2]
    status = next(node for node in dismiss.walk(tree) if node.get("AXUniqueId") == "FixtureStatus")
    assert status["AXLabel"] == "Keyboard hidden", "app did not observe keyboard dismissal"
    assert dismiss.run(args.udid, "FixtureField", axe) == "hidden", "repeat dismissal failed"
    call(axe, "tap", "--id", "FixtureSave", "--udid", args.udid)
    time.sleep(0.3)
    status = next(node for node in dismiss.walk(snapshot()) if node.get("AXUniqueId") == "FixtureStatus")
    assert status["AXLabel"] == "Saved: fixture-proof", "covered control could not save the unchanged input"
    print("fixture_smoke: passed\nkeyboard_before: visible\nkeyboard_after: hidden\ntext_preserved: true\nidempotent: true\nsave_reached: true")


if __name__ == "__main__":
    main()

# Simulator controls after relaunch

When the rendered app has controls but XcodeBuildMCP returns an empty control
tree after relaunch, use `control.py` to query and act through Maestro's XCTest
driver. The helper never launches, stops, resets, or wipes the app. A successful
`wait` verifies the requested control exists; a successful `tap` verifies it
exists before tapping it. `snapshot` captures a hierarchy for inspection and
does not certify that a particular control exists.

Use Python 3 and the seat's existing Maestro installation. No build or Python
packages are required. Run the helper on the simulator host. Use the simulator
UDID and `maestro_driver_port` from the held seat's device handout. Each
simulator needs its own port. `--standalone` uses Maestro's default port only
for a standalone fixture and is refused when `QA_SEAT` is set.

```sh
python3 control.py wait --udid "$SIM_UDID" --app-id to.bitkit \
  --driver-host-port "$MAESTRO_DRIVER_PORT" --id HeaderMenu \
  --timeout-ms 10000 --artifacts "$SEAT_ARTIFACTS/controls/wait"
python3 control.py snapshot --udid "$SIM_UDID" --app-id to.bitkit \
  --driver-host-port "$MAESTRO_DRIVER_PORT" \
  --artifacts "$SEAT_ARTIFACTS/controls/snapshot"
python3 control.py tap --udid "$SIM_UDID" --app-id to.bitkit \
  --driver-host-port "$MAESTRO_DRIVER_PORT" --id HeaderMenu \
  --artifacts "$SEAT_ARTIFACTS/controls/tap"
```

Selectors are exact literal identifiers or labels (`--id` or `--text`), not
regular expressions. An unavailable target fails with a nonzero exit code.
UI waits are bounded at 60 seconds; driver startup has a separate 90-second
allowance. A timed-out invocation stops only its own subprocess group.

Keep the existing app foregrounded before calling the helper. `--app-id` is
flow metadata; it does not activate or authenticate the foreground app. Check
the screenshot and the hierarchy before acting. Do not run Maestro and
XcodeBuildMCP controls concurrently on the same simulator. After switching
drivers, discard cached XcodeBuildMCP element references. For subsequent
multi-step interactions, use the observed Maestro identifiers in a flow with
the same explicit device and port and no `launchApp` or `clearState` step, so
in-memory test holds and profile setup stay intact. Hierarchies and Maestro
debug artifacts can contain screen text; keep them in private test artifacts.

## Standalone proof

Create your own `controls-fixture-*` simulator, boot it, set dark appearance,
and apply the usual `simslim` profile. Run:

```sh
python3 -m unittest discover -s tools/ios-controls -p 'test_*.py'
python3 tools/ios-controls/smoke.py --udid "$FIXTURE_UDID" \
  --driver-host-port "$FIXTURE_DRIVER_PORT" \
  --artifacts artifacts/ios-controls/smoke
```

The smoke uses the stock Settings app. It terminates and relaunches Settings
twice, finds and taps About, verifies the destination, and checks that each
control sequence preserves the app PID. It also rejects a missing control
without restarting the app. It refuses QA seats and devices outside the named
fixture prefix. Shut down your owned simulator after the proof.

This proves the alternative control path independently of Bitkit. It does not
reproduce the original XcodeBuildMCP fault or certify the PR's QA item. The
held-seat tester must first require `controls: available` from the requested
control before continuing that item.

# iOS keyboard dismissal

Maestro's `hideKeyboard` can fail with "no standard dismiss action" on an
iOS input without a working Done or Return button. This tool hides the
software keyboard on one explicitly named simulator by enabling its hardware
keyboard mode through CoreSimulator. It keeps the field focused and preserves
its text so the next application control can be tapped.

Requires macOS, Xcode and AXe (the executable bundled with XcodeBuildMCP works).
The control uses Xcode's private `setHardwareKeyboardEnabled:keyboardType:error:`
selector, also declared in [idb's SimDevice header](https://github.com/facebook/idb/blob/main/PrivateHeaders/CoreSimulator/SimDevice.h).
It fails when that selector is unavailable. It operates on the booted device's
runtime; it writes no Simulator or host preferences and requires no GUI shortcut
or Accessibility permission for the host frontend.

## Build and use

From the repository root:

```sh
sh tools/ios-keyboard/build.sh
python3 tools/ios-keyboard/dismiss.py --udid "$SIM_UDID" \
  --field-id AddContactPubkyField
```

Use the simulator UUID from the current test run. Run on the simulator's host;
copy `tools/ios-keyboard/` to the test's artifact directory and build there when
the companion checkout is on another host. The helper requires the expected
foreground input to exist before changing keyboard mode. It checks the
application PID and field value after the change, and confirms that standard
keyboard keys are outside the application's viewport. A successful command prints:

```yaml
keyboard: hidden
text_preserved: true
```

`--check` inspects keyboard visibility without changing it. `--axe /path/to/axe`
overrides executable discovery. Each subprocess has a timeout, and the helper
makes at most three checks after changing the mode. Nonzero means stop and retain
the error; success is required before continuing setup.

## Contact setup

When resuming an add-contact flow already stopped at `hideKeyboard`, run the
helper above, then replay `save-contact.yaml` instead of replaying the failed
keyboard step. For fresh setup, replay `enter-contact.yaml` with `CONTACT_KEY`,
run the helper, then replay `save-contact.yaml`. Pass the run's simulator UUID
and its Maestro driver port to each replay. These chunks perform contact setup
only; the tester drives the payment request and product assertions separately.

The equivalent local Maestro commands are:

```sh
maestro --device "$SIM_UDID" test tools/ios-keyboard/enter-contact.yaml \
  -e "CONTACT_KEY=$CONTACT_KEY"
python3 tools/ios-keyboard/dismiss.py --udid "$SIM_UDID" \
  --field-id AddContactPubkyField
maestro --device "$SIM_UDID" test tools/ios-keyboard/save-contact.yaml
```

Hardware keyboard mode remains enabled for that simulator. When a later step
needs the software keyboard, restore it with:

```sh
tools/ios-keyboard/build/keyboard-control show --udid "$SIM_UDID"
```

Then focus the required field and verify it is visible. `show` and the native
`hide` command request a mode change; `dismiss.py` supplies the verified hide.

## Standalone proof

This proof uses a tiny UIKit fixture with a URL keyboard, no submit handler,
and a Save button covered by the keyboard. It needs no Bitkit build, identity
or backend. Create and boot a dedicated simulator, then run:

```sh
sh tools/ios-keyboard/build.sh
python3 -m unittest discover -s tools/ios-keyboard -p 'test_*.py'
python3 tools/ios-keyboard/build_fixture.py --output artifacts/keyboard-fixture
xcrun simctl install "$SIM_UDID" artifacts/keyboard-fixture/KeyboardFixture.app
xcrun simctl launch "$SIM_UDID" tech.masivo.qa.keyboard-fixture
python3 tools/ios-keyboard/smoke.py --udid "$SIM_UDID"
```

The smoke check proves the keyboard starts visible, becomes hidden, preserves
the input, tolerates a second dismissal, and allows the covered control to save
the unchanged value. It refuses to drive a different foreground application.
The unit checks cover retained offscreen keys, a missing field, application
changes and text changes. Shut down the dedicated simulator after recording
the result.

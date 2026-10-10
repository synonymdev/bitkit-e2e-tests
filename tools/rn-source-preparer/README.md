# RN iOS source preparation

Prepare a funded React Native **1.1.6 iOS** wallet for a native restore test.
This tool only drives the source app. It does not install, restore, or assert
anything about a native target.

**Draft: source recovery is proven; tagging and remote backup preparation are
not ready.** A real RN 1.1.6 simulator smoke cleared the inaccessible receive
celebration. Two tagging attempts stopped at a hidden input and then an unsaved
tag after keyboard dismissal. The driver now handles both and refuses to leave
an unsubmitted tag sheet, but that final change has only offline checks. Do not
treat this draft as a prepared backup until a new source smoke proves tag
persistence and all remote backup statuses.

RN receive sheets can hide all of their controls from the accessibility tree.
`ReceivedTransactionButton` is not a reliable selector for the archived RN iOS
build. The driver terminates and reactivates the source app without clearing its
wallet, and confirms wallet home from the screenshot. It uses accessibility IDs
when available and Apple's Vision text recognition for visible controls when
they are hidden from the tree. Screenshot positions are normalized, so retina
scale does not affect taps. The menu fallback uses the visible wallet name to
locate the header and the RN 1.1.6 menu's right edge.

Use an existing, onboarded RN source simulator with at least one funded activity.
Onboarding and funding remain the caller's responsibility. The installed
`Info.plist` must identify `to.bitkit` version `1.1.6`; a native installation is
rejected before any Appium session starts. Every operation requires an explicit
source UUID. There is no automatic simulator selection, reinstall, data reset,
keychain reset, funding request, or target-device command.

## Install and run on the source simulator's host

Check out this companion change at its reported commit. The existing archived
RN simulator app remains the source; no modified RN build is needed. The host
needs Xcode, Swift, Python 3, Node, and the repository's locked npm dependencies.

```sh
npm ci
swiftc -O tools/rn-source-preparer/recognize.swift -o tools/rn-source-preparer/recognize
python3 -m unittest discover -s tools/rn-source-preparer -p 'test_prepare.py'

# Choose two unused ports for this operation on the simulator's own host.
export RN_SOURCE_APPIUM_PORT=14729 RN_SOURCE_WDA_PORT=18129
export RN_SOURCE_UDID='<source simulator UUID>'
bash tools/rn-source-preparer/run.sh prepare \
  --udid "$RN_SOURCE_UDID" --tag qa-rn-late-tags --activity-text Received
```

`run.sh` installs a pinned XCUITest driver in this tool's own `.appium` directory,
starts its own headless Appium process, checks its status endpoint, and stops it
on exit. It refuses occupied ports and never stops another server. WDA build
data stays in `.wda/<source UUID>`. No fixture services or lane lease are needed
to build the tool. A test run uses its existing source simulator and seat.

Successful `prepare` output includes `persisted_tag` and `backup_statuses`.
The tag is checked on the activity detail screen **after a relaunch**, so typing
into an unsaved field does not count. Backup completion requires each category's
own `Latest Backup: ...` status. Missing, ambiguous, running, and failed statuses
fail the command. A wallet with spending requires `--require-connections`.
Use `--wallet-name '<name>'` when the source's displayed name is not `Your Name`.

The source activity must be the latest activity. The ID fallback selects
`ActivityShort-1`; the text fallback requires one exact visible `Received`
label. Do not use this tool to select a particular older transaction. It stops
when a control is ambiguous or hidden even from the screenshot.

For independent steps, replace `prepare` with `recover`, `tag`, or `backup`.
`recover` only relaunches and confirms home. `tag` only tags and verifies
persistence. `backup` only checks the source backup categories. If a backup is
still syncing, wait and rerun `backup`; do not restore a target until it succeeds.

For a screenshot-only probe, without any device operation:

```sh
python3 tools/rn-source-preparer/prepare.py inspect path/to/rn-screen.png
```

The tool prints no mnemonic and keeps screenshot files only in a temporary
directory during text recognition. Appium logs can contain source metadata;
keep them private with the test artifacts. A tool smoke or a successful source
backup is preparation evidence, not a native migration result.

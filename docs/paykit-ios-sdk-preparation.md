# Prepare the Paykit iOS SDK

`pubky/paykit-rs` is an SDK, not an installable companion app. Its iOS artifact
is `Paykit.xcframework.zip`, so the `.app` companion cache does not represent its
availability. The existing `paykit-server` fixture is a separate component.

For the trusted `v0.1.0-rc73` release, prepare a companion checkout at
`0eff3d4e694ba0dbbea2d47852fe796e456671b0` using the review stack's
`prepare_test_checkout.py --layout worktrees --companion --repo pubky/paykit-rs
--head 0eff3d4e694ba0dbbea2d47852fe796e456671b0 --pr <app-pr>` command.
Use the printed `path` with the helper on a Mac with Xcode:

```bash
python3 scripts/prepare-paykit-ios-sdk.py \
  --checkout /path/to/paykit-rs-checkout \
  --output artifacts/paykit-rc73
```

The helper verifies the checkout revision, unchanged tracked files, SwiftPM
manifest URL and checksum, and the downloaded archive's published SHA256
`511715acf3ca84e322d19ea6651c767c98b5325845d571abe2a9527b1eb6ae26`.
It then builds and links the published Swift bindings and upstream compile
fixtures against both arm64 iOS slices, without a simulator or device.
`verified.json` records the exact revision, archive, checksum and checks.
A repeat invocation verifies the retained archive again before using it.

Keep the app's pinned SwiftPM dependency and release URL when building it.
The extracted framework proves artifact availability; it is not a local package
override or a replacement for SwiftPM's checksum verification. This helper
does not build the app, install anything on a device, or drive a QA item.

The helper's corruption check runs with:

```bash
python3 -B scripts/test_prepare_paykit_ios_sdk.py
```

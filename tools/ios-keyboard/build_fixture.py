#!/usr/bin/env python3
"""Build only the keyboard fixture, without an app checkout or signing."""
import argparse
import pathlib
import platform
import plistlib
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    bundle = args.output.resolve() / "KeyboardFixture.app"
    bundle.mkdir(parents=True, exist_ok=True)
    sdk = subprocess.check_output(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], text=True).strip()
    subprocess.run([
        "xcrun", "--sdk", "iphonesimulator", "swiftc", "-sdk", sdk,
        "-target", f"{platform.machine()}-apple-ios17.0-simulator",
        str(pathlib.Path(__file__).parent / "fixture/main.swift"),
        "-o", str(bundle / "KeyboardFixture"),
    ], check=True, timeout=120)
    with (bundle / "Info.plist").open("wb") as stream:
        plistlib.dump({
            "CFBundleIdentifier": "tech.masivo.qa.keyboard-fixture",
            "CFBundleExecutable": "KeyboardFixture",
            "CFBundleName": "KeyboardFixture",
            "CFBundlePackageType": "APPL",
            "CFBundleVersion": "1",
            "CFBundleShortVersionString": "1.0",
            "MinimumOSVersion": "17.0",
            "UIDeviceFamily": [1, 2],
            "UILaunchScreen": {},
            "UIApplicationSceneManifest": {"UIApplicationSupportsMultipleScenes": False},
        }, stream)
    subprocess.run(["codesign", "--force", "--sign", "-", str(bundle)], check=True, timeout=30)
    print(bundle)


if __name__ == "__main__":
    main()

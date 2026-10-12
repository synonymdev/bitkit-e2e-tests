#!/usr/bin/env python3
"""Prepare the published rc73 SDK without changing an app's SwiftPM dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

COMMIT = "0eff3d4e694ba0dbbea2d47852fe796e456671b0"
TAG = "v0.1.0-rc73"
CHECKSUM = "511715acf3ca84e322d19ea6651c767c98b5325845d571abe2a9527b1eb6ae26"
URL = f"https://github.com/pubky/paykit-rs/releases/download/{TAG}/Paykit.xcframework.zip"


def capture(*args):
    return subprocess.check_output(args, text=True).strip()


def verify_archive(archive):
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != CHECKSUM:
        raise ValueError(f"Archive checksum mismatch: {digest}")
    with zipfile.ZipFile(archive) as zipped:
        for name in zipped.namelist():
            if Path(name).is_absolute() or ".." in Path(name).parts:
                raise ValueError(f"Unsafe archive entry: {name}")
    return digest


def prepare(checkout, output):
    checkout = checkout.resolve()
    output = output.resolve()
    if capture("git", "-C", str(checkout), "rev-parse", "HEAD") != COMMIT:
        raise ValueError(f"SDK checkout must be at {COMMIT}")
    subprocess.run(["git", "-C", str(checkout), "diff", "--quiet", "HEAD", "--"], check=True)
    manifest = json.loads(capture("swift", "package", "--package-path", str(checkout), "dump-package"))
    binary = next(t for t in manifest["targets"] if t["name"] == "PaykitFFI")
    if binary.get("url") != URL or binary.get("checksum") != CHECKSUM:
        raise ValueError("SwiftPM manifest does not name the published rc73 archive")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "Paykit.xcframework.zip"
    if not archive.exists():
        subprocess.run([
            "curl", "--fail", "--location", "--retry", "1", "--connect-timeout", "15",
            "--max-time", "240", "--output", str(archive), URL,
        ], check=True)
    digest = verify_archive(archive)
    # The checksum is pinned before extraction or compilation.
    with zipfile.ZipFile(archive) as zipped:
        zipped.extractall(output)
    bindings = checkout / "paykit-ffi/bindings/ios"
    sources = [bindings / name for name in ("paykit.swift", "PaykitPublicKeys.swift", "PaykitRedaction.swift")]
    sources += [checkout / "paykit-ffi/src/swift" / name for name in (
        "AllowanceBindingsCompile.swift", "PaymentConversionBindingsCompile.swift",
    )]
    for sdk, target, slice_name in (
        ("iphonesimulator", "arm64-apple-ios15.0-simulator", "ios-arm64-simulator"),
        ("iphoneos", "arm64-apple-ios15.0", "ios-arm64"),
    ):
        library = output / "Paykit.xcframework" / slice_name
        subprocess.run([
            "xcrun", "--sdk", sdk, "swiftc", "-emit-library", "-module-name", "Paykit",
            "-target", target, "-sdk", capture("xcrun", "--sdk", sdk, "--show-sdk-path"),
            "-module-cache-path", str(output / "module-cache"),
            "-I", str(library / "Headers"), "-L", str(library), "-lpaykit",
            *map(str, sources), "-o", str(output / f"Paykit-{slice_name}.dylib"),
        ], check=True)
    result = {"repo": "pubky/paykit-rs", "commit": COMMIT, "tag": TAG, "sha256": digest,
              "archive": str(archive), "xcframework": str(output / "Paykit.xcframework"),
              "checks": "published bindings and upstream compile fixtures linked for iOS device and simulator"}
    (output / "verified.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", type=Path, required=True, help="trusted paykit-rs checkout at rc73")
    parser.add_argument("--output", type=Path, required=True, help="run-owned artifact directory")
    args = parser.parse_args()
    prepare(args.checkout, args.output)

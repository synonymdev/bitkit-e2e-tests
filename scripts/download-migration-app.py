#!/usr/bin/env python3
"""Download a migration source, keeping previous native builds separate from targets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASES = "https://github.com/synonymdev/bitkit-e2e-tests/releases/download"


def download(platform, source, version):
    if source == "rn":
        if version != "v1.1.6":
            raise ValueError("Only React Native v1.1.6 is supported")
    elif not re.fullmatch(r"\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*", version):
        raise ValueError(f"Invalid native release tag: {version!r}")
    if source == "native":
        tag = version
        asset = {"android": "bitkit_e2e.apk", "ios": "Bitkit.app.zip"}[platform]
        destination = ROOT / "aut" / "previous-native"
    else:
        tag = "migration-rn-regtest"
        asset = {
            "android": f"bitkit_rn_regtest_{version}.apk",
            "ios": f"bitkit_rn_regtest_ios_{version}.zip",
        }[platform]
        destination = ROOT / "aut"
    destination.mkdir(parents=True, exist_ok=True)
    url = f"{RELEASES}/{tag}/{asset}"
    with tempfile.TemporaryDirectory(dir=destination) as staging:
        archive = Path(staging) / asset
        subprocess.run(["curl", "--fail", "--location", "--retry", "3", "--connect-timeout", "30", "--max-time", "900", "--output", str(archive), url], check=True)
        if not archive.stat().st_size:
            raise ValueError(f"Empty migration asset: {url}")
        checksum = hashlib.sha256()
        with archive.open("rb") as data:
            for chunk in iter(lambda: data.read(1024 * 1024), b""):
                checksum.update(chunk)
        digest = checksum.hexdigest()
        checksums = json.loads((ROOT / "config/migration-checksums.json").read_text())
        expected = checksums.get(tag, {}).get(asset)
        if expected and digest != expected:
            raise ValueError(f"Checksum mismatch for {url}: expected {expected}, received {digest}")
        if platform == "android":
            with zipfile.ZipFile(archive) as apk:
                if "AndroidManifest.xml" not in apk.namelist():
                    raise ValueError(f"Not an Android APK: {url}")
            app = destination / ("bitkit_e2e.apk" if source == "native" else "bitkit_rn_regtest.apk")
            shutil.move(str(archive), app)
        else:
            bundle = "Bitkit.app" if source == "native" else f"bitkit_rn_regtest_ios_{version}.app"
            with zipfile.ZipFile(archive) as zipped:
                for entry in zipped.namelist():
                    if Path(entry).is_absolute() or ".." in Path(entry).parts:
                        raise ValueError(f"Unsafe archive entry: {entry}")
                if f"{bundle}/Info.plist" not in zipped.namelist():
                    raise ValueError(f"Archive does not contain {bundle}/Info.plist")
            # ditto preserves executable permissions and bundle symlinks on macOS.
            subprocess.run(["ditto", "-x", "-k", str(archive), staging], check=True)
            app = destination / ("Bitkit.app" if source == "native" else "bitkit_rn_regtest_ios.app")
            if app.exists():
                shutil.rmtree(app)
            shutil.move(str(Path(staging) / bundle), app)
    metadata = {"platform": platform, "source": source, "version": version, "url": url, "sha256": digest,
                "app_path": str(app), "target_revision": os.getenv("GITHUB_SHA", "local"),
                "e2e_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()}
    artifacts = ROOT / "artifacts"
    artifacts.mkdir(exist_ok=True)
    (artifacts / "migration-source.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    if source == "native" and os.getenv("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a") as env:
            env.write(f"PREVIOUS_NATIVE_APP_PATH={app}\nPREVIOUS_NATIVE_VERSION={version}\n")
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    parser.add_argument("source", choices=("rn", "native"))
    parser.add_argument("version")
    args = parser.parse_args()
    try:
        download(args.platform, args.source, args.version)
    except (ValueError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Migration source download failed: {error}\n")

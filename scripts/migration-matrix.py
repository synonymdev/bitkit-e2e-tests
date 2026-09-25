#!/usr/bin/env python3
"""Resolve an explicit native baseline and the migration cases for CI."""
import argparse
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def migration_plan(platform, override="", extended=False):
    version = override.strip() or json.loads((ROOT / "config/migration-baselines.json").read_text())[platform]
    if not re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*", version):
        raise ValueError(f"Invalid native release tag: {version!r}")
    rn = [
        {"name": "rn_restore", "source": "rn", "version": "v1.1.6", "setup_type": "standard", "grep": "@migration_rn_restore"},
        {"name": "rn_upgrade", "source": "rn", "version": "v1.1.6", "setup_type": "standard", "grep": "@migration_rn_upgrade"},
    ]
    if extended:
        rn += [
            {"name": "rn_passphrase", "source": "rn", "version": "v1.1.6", "setup_type": "passphrase", "grep": "@migration_3"},
            {"name": "rn_sweep", "source": "rn", "version": "v1.1.6", "setup_type": "sweep", "grep": "@migration_4"},
        ]
    native = [
        {"name": f"native_{method}", "source": "native", "version": version, "grep": f"@migration_native_{method}"}
        for method in ("restore", "upgrade")
    ]
    return {"version": version, "rn": rn, "native": native, "all": rn + native}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("android", "ios"))
    args = parser.parse_args()
    plan = migration_plan(args.platform, os.getenv("PREVIOUS_NATIVE_VERSION", ""), os.getenv("EXTENDED_RN", "false") == "true")
    print(json.dumps(plan, indent=2))
    if os.getenv("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            for key, value in plan.items():
                output.write(f"{key}={json.dumps(value, separators=(',', ':')) if isinstance(value, list) else value}\n")

#!/usr/bin/env python3
"""
Slack summary script for Bitkit E2E Staging nightlies.

Renders a summary message from environment variables and posts it to a
Slack webhook. Modeled on synonymdev/bitkit-nightly slack_summary.py style.

Usage:
    python3 scripts/slack_summary.py e2e-staging

Required env vars:
    SLACK_WEBHOOK_URL   - Slack incoming webhook URL (skips gracefully if unset)
    PLATFORM            - ios|android
    STAGING_RESULT      - Overall workflow result (success|failure|cancelled|...)
    BUILD_RESULT        - build-staging job result
    E2E_BRANCH_RESULT   - e2e-branch job result
    E2E_TESTS_RESULT    - e2e-tests-staging job result
    RUN_URL             - GitHub Actions run URL
    RUN_ATTEMPT         - Current run attempt number

Optional env vars:
    E2E_TESTS_REF       - Resolved e2e-tests branch/ref
    GITHUB_REPOSITORY   - Repository name (e.g. synonymdev/bitkit-ios)
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone


def get_status_icon(status: str) -> str:
    """Return a Slack emoji for the given job/workflow status."""
    status_lower = status.lower() if status else ""
    if status_lower == "success":
        return ":white_check_mark:"
    elif status_lower == "failure":
        return ":x:"
    elif status_lower == "cancelled":
        return ":warning:"
    elif status_lower == "skipped":
        return ":fast_forward:"
    else:
        return ":grey_question:"


def format_status(status: str) -> str:
    """Return icon + status text."""
    icon = get_status_icon(status)
    return f"{icon} {status}"


def get_platform_display(platform: str) -> str:
    """Return display name for platform."""
    platform_lower = platform.lower() if platform else ""
    if platform_lower == "ios":
        return "iOS"
    elif platform_lower == "android":
        return "Android"
    else:
        return platform or "Unknown"


def render_e2e_staging_message() -> str:
    """Render the E2E staging summary message from environment variables."""
    platform = os.environ.get("PLATFORM", "")
    staging_result = os.environ.get("STAGING_RESULT", "unknown")
    build_result = os.environ.get("BUILD_RESULT", "unknown")
    e2e_branch_result = os.environ.get("E2E_BRANCH_RESULT", "unknown")
    e2e_tests_result = os.environ.get("E2E_TESTS_RESULT", "unknown")
    run_url = os.environ.get("RUN_URL", "")
    run_attempt = os.environ.get("RUN_ATTEMPT", "1")
    e2e_tests_ref = os.environ.get("E2E_TESTS_REF", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    platform_display = get_platform_display(platform)
    overall_icon = get_status_icon(staging_result)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        f"{overall_icon} Bitkit {platform_display} E2E staging: {staging_result}",
        f"Time: {timestamp}",
        f"Run attempt: {run_attempt}",
    ]

    if run_url:
        lines.append(f"Run: {run_url}")

    if e2e_tests_ref:
        lines.append(f"E2E tests ref: {e2e_tests_ref}")

    if repo:
        lines.append(f"Repository: {repo}")

    lines.append("")
    lines.append("Jobs:")
    lines.append(f"  build-staging: {format_status(build_result)}")
    lines.append(f"  e2e-branch: {format_status(e2e_branch_result)}")
    lines.append(f"  e2e-tests-staging: {format_status(e2e_tests_result)}")

    return "\n".join(lines)


def post_to_slack(text: str) -> bool:
    """
    Post text to Slack webhook. Returns True on success.
    Skips gracefully (returns True) if SLACK_WEBHOOK_URL is not set.
    """
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL", "").strip()

    if not webhook_url:
        print("SLACK_WEBHOOK_URL not set, skipping Slack post", file=sys.stderr)
        return True

    payload = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                print("Slack message posted successfully")
                return True
            else:
                print(f"Slack webhook returned status {resp.status}", file=sys.stderr)
                return False
    except urllib.error.URLError as e:
        print(f"Failed to post to Slack: {e}", file=sys.stderr)
        return False


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <mode>", file=sys.stderr)
        print("Available modes: e2e-staging", file=sys.stderr)
        return 1

    mode = sys.argv[1]

    if mode == "e2e-staging":
        message = render_e2e_staging_message()
        print("--- Message Preview ---")
        print(message)
        print("--- End Preview ---")
        post_to_slack(message)
        return 0
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        print("Available modes: e2e-staging", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())

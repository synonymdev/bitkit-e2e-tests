#!/usr/bin/env python3
"""
Slack summary script for Bitkit E2E staging, migration and local nightly workflows.

Renders a summary message from environment variables and posts it to a
Slack webhook. Modeled on synonymdev/bitkit-nightly slack_summary.py style.

Usage:
    python3 scripts/slack_summary.py e2e-staging
    python3 scripts/slack_summary.py e2e-migration
    python3 scripts/slack_summary.py e2e-local-nightly

Required env vars:
    SLACK_WEBHOOK_URL   - Slack incoming webhook URL (skips gracefully if unset)
    PLATFORM            - ios|android
    E2E_TESTS_RESULT    - e2e-tests job result
    RUN_URL             - GitHub Actions run URL
    RUN_ATTEMPT         - Current run attempt number

Mode-specific env vars:
    STAGING_RESULT      - Overall result for e2e-staging
    MIGRATION_RESULT    - Overall result for e2e-migration
    BUILD_RESULT        - App build result
    E2E_BRANCH_RESULT   - e2e-branch result for staging and migration
    PREPARE_WALLETS_RESULT - Optional iOS migration job result
    LOCAL_NIGHTLY_RESULT - Overall result for e2e-local-nightly
    SPARK_IMAGES_RESULT - Optional iOS image preparation result
    SPARK_FIXTURE_RESULT - Local Spark fixture startup result
    SPARK_APP_SETUP_RESULT - Failure or interruption preparing the app on a Spark attempt
    SPARK_CASE_RESULT   - Final result reported for @spark_1

Optional env vars:
    E2E_TESTS_REF       - Resolved e2e-tests branch/ref
    GITHUB_REPOSITORY   - Repository name (e.g. synonymdev/bitkit-ios)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

MODES = ("e2e-staging", "e2e-migration", "e2e-local-nightly")


def get_status_icon(status: str) -> str:
    """Return a Slack emoji for the given job/workflow status."""
    status_lower = status.lower() if status else ""
    if status_lower == "success":
        return ":white_check_mark:"
    elif status_lower == "failure":
        return ":x:"
    elif status_lower in ("cancelled", "interrupted"):
        return ":warning:"
    elif status_lower in ("skipped", "did not run"):
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


def _render_message(
    *,
    kind: str,
    overall_result: str,
    jobs: dict[str, str],
    case: tuple[str, str] | None = None,
    results_heading: str = "Jobs",
) -> str:
    platform = os.environ.get("PLATFORM", "")
    run_url = os.environ.get("RUN_URL", "")
    run_attempt = os.environ.get("RUN_ATTEMPT", "1")
    e2e_tests_ref = os.environ.get("E2E_TESTS_REF", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    platform_display = get_platform_display(platform)
    overall_icon = get_status_icon(overall_result)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        f"{overall_icon} Bitkit {platform_display} E2E {kind}: {overall_result}",
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
    lines.append(f"{results_heading}:")
    lines.extend(f"  {job}: {format_status(result)}" for job, result in jobs.items())
    if case:
        name, result = case
        lines.append(f"\n{name}: {format_status(result)}")

    return "\n".join(lines)


def _standard_jobs(build_job: str, tests_job: str) -> dict[str, str]:
    jobs = {
        build_job: os.environ.get("BUILD_RESULT", "unknown"),
        "e2e-branch": os.environ.get("E2E_BRANCH_RESULT", "unknown"),
    }
    prepare_wallets = os.environ.get("PREPARE_WALLETS_RESULT", "")
    if prepare_wallets:
        jobs["prepare-wallets"] = prepare_wallets
    jobs[tests_job] = os.environ.get("E2E_TESTS_RESULT", "unknown")
    return jobs


def render_e2e_staging_message() -> str:
    """Render the E2E staging summary message from environment variables."""
    return _render_message(
        kind="staging",
        overall_result=os.environ.get("STAGING_RESULT", "unknown"),
        jobs=_standard_jobs("build-staging", "e2e-tests-staging"),
    )


def render_e2e_migration_message() -> str:
    """Render the E2E migration summary message from environment variables."""
    return _render_message(
        kind="migration",
        overall_result=os.environ.get("MIGRATION_RESULT", "unknown"),
        jobs=_standard_jobs("build", "e2e-tests"),
    )


def render_e2e_local_nightly_message() -> str:
    setup = {
        "spark-images": os.environ.get("SPARK_IMAGES_RESULT", ""),
        "app build": os.environ.get("BUILD_RESULT", ""),
        "Spark fixture": os.environ.get("SPARK_FIXTURE_RESULT", ""),
        "Spark app setup (one or more attempts)": os.environ.get("SPARK_APP_SETUP_RESULT", ""),
    }
    tests_result = os.environ.get("E2E_TESTS_RESULT", "unknown")
    case_result = {
        "passed": "success",
        "failed": "failure",
        "started": "interrupted",
    }.get(os.environ.get("SPARK_CASE_RESULT"), "no result")
    if case_result == "no result" and (tests_result == "skipped" or any(
        result in ("failure", "skipped", "interrupted") for result in setup.values()
    )):
        case_result = "did not run"
    elif tests_result == "cancelled" and case_result in ("interrupted", "no result"):
        case_result = "cancelled"
    return _render_message(
        kind="local nightly",
        overall_result=os.environ.get("LOCAL_NIGHTLY_RESULT", "unknown"),
        jobs={job: result for job, result in {**setup, "e2e-spark": tests_result}.items() if result},
        case=("@spark_1", case_result),
        results_heading="Stages",
    )


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
            body = resp.read().decode("utf-8", errors="replace")
            if resp.status == 200:
                print("Slack message posted successfully")
                return True
            print(f"Slack webhook returned status {resp.status}", file=sys.stderr)
            print(f"Slack response body: {body}", file=sys.stderr)
            return False
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"Failed to post to Slack: {e}", file=sys.stderr)
        print(f"Slack response body: {body}", file=sys.stderr)
        return False
    except urllib.error.URLError as e:
        print(f"Failed to post to Slack: {e}", file=sys.stderr)
        return False


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <mode>", file=sys.stderr)
        print(f"Available modes: {', '.join(MODES)}", file=sys.stderr)
        return 1

    mode = sys.argv[1]

    if mode == "e2e-staging":
        message = render_e2e_staging_message()
    elif mode == "e2e-migration":
        message = render_e2e_migration_message()
    elif mode == "e2e-local-nightly":
        message = render_e2e_local_nightly_message()
    else:
        print(f"Unknown mode: {mode}", file=sys.stderr)
        print(f"Available modes: {', '.join(MODES)}", file=sys.stderr)
        return 1

    print("--- Message Preview ---")
    print(message)
    print("--- End Preview ---")
    return 0 if post_to_slack(message) else 1


if __name__ == "__main__":
    sys.exit(main())

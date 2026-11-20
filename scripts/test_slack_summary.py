#!/usr/bin/env python3
"""Unit tests for slack_summary.py"""

import io
import os
import unittest
import urllib.error
from unittest.mock import patch

from slack_summary import (
    format_status,
    get_platform_display,
    get_status_icon,
    main,
    post_to_slack,
    render_e2e_local_nightly_message,
    render_e2e_migration_message,
    render_e2e_staging_message,
)


class TestStatusIcons(unittest.TestCase):
    """Tests for status icon helpers."""

    def test_success_icon(self):
        self.assertEqual(get_status_icon("success"), ":white_check_mark:")
        self.assertEqual(get_status_icon("SUCCESS"), ":white_check_mark:")

    def test_failure_icon(self):
        self.assertEqual(get_status_icon("failure"), ":x:")
        self.assertEqual(get_status_icon("FAILURE"), ":x:")

    def test_cancelled_icon(self):
        self.assertEqual(get_status_icon("cancelled"), ":warning:")
        self.assertEqual(get_status_icon("CANCELLED"), ":warning:")

    def test_skipped_icon(self):
        self.assertEqual(get_status_icon("skipped"), ":fast_forward:")

    def test_unknown_icon(self):
        self.assertEqual(get_status_icon("unknown"), ":grey_question:")
        self.assertEqual(get_status_icon(""), ":grey_question:")
        self.assertEqual(get_status_icon(None), ":grey_question:")

    def test_format_status(self):
        self.assertEqual(format_status("success"), ":white_check_mark: success")
        self.assertEqual(format_status("failure"), ":x: failure")


class TestPlatformDisplay(unittest.TestCase):
    """Tests for platform display name helper."""

    def test_ios_display(self):
        self.assertEqual(get_platform_display("ios"), "iOS")
        self.assertEqual(get_platform_display("IOS"), "iOS")

    def test_android_display(self):
        self.assertEqual(get_platform_display("android"), "Android")
        self.assertEqual(get_platform_display("ANDROID"), "Android")

    def test_unknown_display(self):
        self.assertEqual(get_platform_display(""), "Unknown")
        self.assertEqual(get_platform_display(None), "Unknown")
        self.assertEqual(get_platform_display("other"), "other")


class TestRenderMessage(unittest.TestCase):
    """Tests for render_e2e_staging_message."""

    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {}, clear=True)
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_ios_failure_message(self):
        os.environ.update({
            "PLATFORM": "ios",
            "STAGING_RESULT": "failure",
            "BUILD_RESULT": "success",
            "E2E_BRANCH_RESULT": "success",
            "E2E_TESTS_RESULT": "failure",
            "RUN_URL": "https://github.com/synonymdev/bitkit-ios/actions/runs/123",
            "RUN_ATTEMPT": "2",
            "E2E_TESTS_REF": "main",
            "GITHUB_REPOSITORY": "synonymdev/bitkit-ios",
        })

        message = render_e2e_staging_message()

        self.assertIn(":x: Bitkit iOS E2E staging: failure", message)
        self.assertIn("Run attempt: 2", message)
        self.assertIn("E2E tests ref: main", message)
        self.assertIn("Repository: synonymdev/bitkit-ios", message)
        self.assertIn("build-staging: :white_check_mark: success", message)
        self.assertIn("e2e-branch: :white_check_mark: success", message)
        self.assertIn("e2e-tests-staging: :x: failure", message)

    def test_android_success_message(self):
        os.environ.update({
            "PLATFORM": "android",
            "STAGING_RESULT": "success",
            "BUILD_RESULT": "success",
            "E2E_BRANCH_RESULT": "success",
            "E2E_TESTS_RESULT": "success",
            "RUN_URL": "https://github.com/synonymdev/bitkit-android/actions/runs/456",
            "RUN_ATTEMPT": "1",
        })

        message = render_e2e_staging_message()

        self.assertIn(":white_check_mark: Bitkit Android E2E staging: success", message)
        self.assertIn("Run attempt: 1", message)
        self.assertIn("build-staging: :white_check_mark: success", message)
        self.assertIn("e2e-tests-staging: :white_check_mark: success", message)

    def test_cancelled_workflow(self):
        os.environ.update({
            "PLATFORM": "ios",
            "STAGING_RESULT": "cancelled",
            "BUILD_RESULT": "cancelled",
            "E2E_BRANCH_RESULT": "skipped",
            "E2E_TESTS_RESULT": "skipped",
            "RUN_ATTEMPT": "1",
        })

        message = render_e2e_staging_message()

        self.assertIn(":warning: Bitkit iOS E2E staging: cancelled", message)
        self.assertIn("build-staging: :warning: cancelled", message)
        self.assertIn("e2e-branch: :fast_forward: skipped", message)

    def test_minimal_env(self):
        """Test with minimal/missing environment variables."""
        message = render_e2e_staging_message()

        self.assertIn("Bitkit Unknown E2E staging: unknown", message)
        self.assertIn("Run attempt: 1", message)
        self.assertNotIn("Run:", message)
        self.assertNotIn("E2E tests ref:", message)
        self.assertNotIn("Repository:", message)

    def test_platform_in_title(self):
        """Ensure platform appears correctly in the title line."""
        os.environ["PLATFORM"] = "ios"
        os.environ["STAGING_RESULT"] = "success"
        message = render_e2e_staging_message()
        self.assertTrue(message.startswith(":white_check_mark: Bitkit iOS E2E staging"))

        os.environ["PLATFORM"] = "android"
        message = render_e2e_staging_message()
        self.assertTrue(message.startswith(":white_check_mark: Bitkit Android E2E staging"))


class TestRenderMigrationMessage(unittest.TestCase):
    """Tests for render_e2e_migration_message."""

    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {}, clear=True)
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_ios_failure_includes_prepare_wallets(self):
        os.environ.update({
            "PLATFORM": "ios",
            "MIGRATION_RESULT": "failure",
            "BUILD_RESULT": "success",
            "E2E_BRANCH_RESULT": "success",
            "PREPARE_WALLETS_RESULT": "success",
            "E2E_TESTS_RESULT": "failure",
            "RUN_URL": "https://github.com/synonymdev/bitkit-ios/actions/runs/123",
            "RUN_ATTEMPT": "1",
            "E2E_TESTS_REF": "main",
            "GITHUB_REPOSITORY": "synonymdev/bitkit-ios",
        })

        message = render_e2e_migration_message()

        self.assertIn(":x: Bitkit iOS E2E migration: failure", message)
        self.assertIn("build: :white_check_mark: success", message)
        self.assertIn("prepare-wallets: :white_check_mark: success", message)
        self.assertIn("e2e-tests: :x: failure", message)

    def test_android_success_omits_prepare_wallets(self):
        os.environ.update({
            "PLATFORM": "android",
            "MIGRATION_RESULT": "success",
            "BUILD_RESULT": "success",
            "E2E_BRANCH_RESULT": "success",
            "E2E_TESTS_RESULT": "success",
            "RUN_ATTEMPT": "1",
        })

        message = render_e2e_migration_message()

        self.assertIn(":white_check_mark: Bitkit Android E2E migration: success", message)
        self.assertIn("build: :white_check_mark: success", message)
        self.assertIn("e2e-tests: :white_check_mark: success", message)
        self.assertNotIn("prepare-wallets", message)


class TestRenderLocalNightlyMessage(unittest.TestCase):
    def setUp(self):
        env_patcher = patch.dict(os.environ, {}, clear=True)
        env_patcher.start()
        self.addCleanup(env_patcher.stop)

    def test_android_pass_links_to_run_and_checked_out_ref(self):
        os.environ.update({
            "PLATFORM": "android",
            "LOCAL_NIGHTLY_RESULT": "success",
            "BUILD_RESULT": "success",
            "SPARK_FIXTURE_RESULT": "success",
            "E2E_TESTS_RESULT": "success",
            "SPARK_CASE_RESULT": "passed",
            "RUN_URL": "https://github.com/synonymdev/bitkit-android/actions/runs/123",
            "RUN_ATTEMPT": "2",
            "E2E_TESTS_REF": "abc123",
        })
        message = render_e2e_local_nightly_message()
        self.assertIn(":white_check_mark: Bitkit Android E2E local nightly: success", message)
        self.assertIn("@spark_1: :white_check_mark: success", message)
        self.assertIn("Run: https://github.com/synonymdev/bitkit-android/actions/runs/123", message)
        self.assertIn("Run attempt: 2", message)
        self.assertIn("E2E tests ref: abc123", message)
        self.assertNotIn("spark-images", message)

    def test_ios_failure_before_appium(self):
        os.environ.update({
            "PLATFORM": "ios",
            "LOCAL_NIGHTLY_RESULT": "failure",
            "SPARK_IMAGES_RESULT": "success",
            "BUILD_RESULT": "success",
            "SPARK_FIXTURE_RESULT": "failure",
            "E2E_TESTS_RESULT": "failure",
        })
        message = render_e2e_local_nightly_message()
        self.assertIn(":x: Bitkit iOS E2E local nightly: failure", message)
        self.assertIn("Spark fixture: :x: failure", message)
        self.assertIn("@spark_1: :fast_forward: did not run", message)

    def test_case_result_distinguishes_test_failure_from_later_job_failure(self):
        os.environ.update({"LOCAL_NIGHTLY_RESULT": "failure", "E2E_TESTS_RESULT": "failure"})
        cases = (
            ("failed", ":x: failure"),
            ("passed", ":white_check_mark: success"),
            ("started", ":warning: interrupted"),
        )
        for case_status, display in cases:
            with self.subTest(case_status=case_status):
                os.environ["SPARK_CASE_RESULT"] = case_status
                message = render_e2e_local_nightly_message()
                self.assertIn("e2e-spark: :x: failure", message)
                self.assertIn(f"@spark_1: {display}", message)

    def test_app_setup_failure_and_case_result_are_independent(self):
        os.environ["SPARK_APP_SETUP_RESULT"] = "failure"
        cases = (
            ("", ":fast_forward: did not run"),
            ("failed", ":x: failure"),
            ("passed", ":white_check_mark: success"),
        )
        for case_status, display in cases:
            with self.subTest(case_status=case_status):
                os.environ["SPARK_CASE_RESULT"] = case_status
                message = render_e2e_local_nightly_message()
                self.assertIn("Spark app setup (one or more attempts): :x: failure", message)
                self.assertIn(f"@spark_1: {display}", message)

    def test_cancelled_job_matches_the_final_case_outcome(self):
        os.environ.update({"E2E_TESTS_RESULT": "cancelled", "SPARK_CASE_RESULT": "started"})
        message = render_e2e_local_nightly_message()
        self.assertIn("@spark_1: :warning: cancelled", message)

        os.environ["SPARK_CASE_RESULT"] = "failed"
        message = render_e2e_local_nightly_message()
        self.assertIn("e2e-spark: :warning: cancelled", message)
        self.assertIn("@spark_1: :x: failure", message)

    def test_older_e2e_ref_without_case_output_has_no_confirmed_result(self):
        os.environ.update({"LOCAL_NIGHTLY_RESULT": "success", "E2E_TESTS_RESULT": "success"})
        message = render_e2e_local_nightly_message()
        self.assertIn("@spark_1: :grey_question: no result", message)

    def test_cli_posts_one_summary(self):
        os.environ.update({"LOCAL_NIGHTLY_RESULT": "success", "SPARK_CASE_RESULT": "passed"})
        with patch("sys.argv", ["slack_summary.py", "e2e-local-nightly"]), \
                patch("sys.stdout", new=io.StringIO()), \
                patch("slack_summary.post_to_slack", return_value=True) as post:
            self.assertEqual(main(), 0)
        post.assert_called_once()
        self.assertIn("@spark_1: :white_check_mark: success", post.call_args.args[0])


class TestPostToSlack(unittest.TestCase):
    """Tests for webhook posting."""

    def setUp(self):
        self.env_patcher = patch.dict(os.environ, {}, clear=True)
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_missing_webhook_skips(self):
        self.assertTrue(post_to_slack("hi"))

    def test_http_error_prints_body_and_fails(self):
        os.environ["SLACK_WEBHOOK_URL"] = "https://hooks.slack.com/services/x"
        error = urllib.error.HTTPError(
            "https://hooks.slack.com/services/x",
            422,
            "Unprocessable Entity",
            hdrs={},
            fp=io.BytesIO(b"invalid_payload"),
        )
        with patch("slack_summary.urllib.request.urlopen", side_effect=error):
            with patch("sys.stderr", new=io.StringIO()) as stderr:
                self.assertFalse(post_to_slack("hi"))
                self.assertIn("invalid_payload", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Unit tests for slack_summary.py"""

import os
import unittest
from unittest.mock import patch

from slack_summary import (
    format_status,
    get_platform_display,
    get_status_icon,
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


if __name__ == "__main__":
    unittest.main()

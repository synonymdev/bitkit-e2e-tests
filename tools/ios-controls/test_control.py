import contextlib
import importlib.util
import io
import os
from pathlib import Path
import signal
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("control", Path(__file__).with_name("control.py"))
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class SafetyTests(unittest.TestCase):
    def test_seat_cannot_use_shared_driver_port(self):
        with patch.dict(os.environ, {"QA_SEAT": "1"}), patch.object(control, "run") as run:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                control.main(["wait", "--udid", "508F063F-FE76-41DC-BC9F-E6D3B370EA9B",
                              "--app-id", "fixture", "--standalone", "--id", "marker",
                              "--artifacts", "/unused"])
            self.assertEqual(error.exception.code, 2)
            run.assert_not_called()

    def test_literals_and_state_preserving_flow(self):
        flow = control.flow("fixture", "tap", ("id", "row.[1]"), 1234)
        self.assertIn('row\\\\.\\\\[1\\\\]', flow)
        self.assertIn("timeout: 1234", flow)
        self.assertNotIn("launchApp", flow)
        self.assertNotIn("stopApp", flow)
        self.assertNotIn("clearState", flow)

    def test_timeout_stops_only_owned_process_group(self):
        with patch.object(control.subprocess, "Popen") as popen, patch.object(control.os, "killpg") as kill:
            popen.return_value.pid = 123
            popen.return_value.wait.side_effect = [subprocess.TimeoutExpired("maestro", 1), 0]
            self.assertEqual(control.run(["maestro"], 1), 124)
            kill.assert_called_once_with(123, signal.SIGTERM)
            self.assertTrue(popen.call_args.kwargs["start_new_session"])


if __name__ == "__main__":
    unittest.main()

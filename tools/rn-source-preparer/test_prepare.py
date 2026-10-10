import json
import plistlib
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

import prepare


def line(text, y=0.5, x=0.5, confidence=1):
    return {"text": text, "confidence": confidence, "x": x, "y": y,
            "top": y - 0.01, "height": 0.02, "left": x - 0.05, "width": 0.1}


class Screens(unittest.TestCase):
    def test_submit_refreshes_after_keyboard_dismissal(self):
        client = prepare.Appium("http://localhost", "explicit-source")
        with patch.object(client, "tap") as tap, patch.object(client, "screen", side_effect=[
                {"lines": [line("NEW TAG")]}, {"lines": [line("saved-tag")]}]):
            client.submit_tag()
        self.assertEqual(tap.call_count, 2)

    def test_unsubmitted_sheet_is_left_intact(self):
        client = prepare.Appium("http://localhost", "explicit-source")
        with patch.object(client, "tap") as tap, patch.object(client, "screen", return_value={"lines": [line("NEW TAG")]}), \
                patch.object(client, "home") as home:
            with self.assertRaisesRegex(RuntimeError, "input was left intact"):
                client.submit_tag()
        self.assertEqual(tap.call_count, 2)
        home.assert_not_called()

    def test_celebration_is_not_wallet_home(self):
        self.assertFalse(prepare.is_home({"lines": [line("Received Bitcoin"), line("Sweet!")]}))
        self.assertTrue(prepare.is_home({"lines": [line(t, 0.9) for t in ("SAVINGS", "SPENDING", "Send", "Receive")]}))
        self.assertTrue(prepare.is_home({"lines": [line(t, 0.9) for t in ("SAVINGS", "SPENDING", "1 Send", "v Receive")]}))

    def test_status_does_not_bleed_into_neighbor_category(self):
        screen = {"lines": [line("Tags", 0.4), line("Contacts", 0.45),
                            line("Latest Backup: 10:00", 0.47)]}
        self.assertEqual(prepare.backup_statuses(screen), {"Contacts": "Latest Backup: 10:00"})

    def test_failed_or_running_backup_is_not_success(self):
        screen = {"lines": [line("Tags", 0.4), line("Backing Up", 0.42)]}
        self.assertEqual(prepare.backup_statuses(screen), {"Tags": "Backing Up"})
        screen["lines"].append(line("Latest Backup: old", 0.43))
        self.assertEqual(prepare.backup_statuses(screen), {})

    def test_uncertain_text_is_not_a_tap_target(self):
        self.assertEqual(prepare.text_matches({"lines": [line("Sweet!", confidence=0.3)]}, "Sweet!"), [])

    def test_native_target_is_rejected_before_appium(self):
        with tempfile.TemporaryDirectory() as folder:
            with open(Path(folder) / "Info.plist", "wb") as file:
                plistlib.dump({"CFBundleIdentifier": "to.bitkit", "CFBundleShortVersionString": "2.5.0"}, file)
            with patch.object(prepare.subprocess, "run") as run:
                run.return_value.stdout = folder + "\n"
                with self.assertRaisesRegex(RuntimeError, "refusing to drive a native target"):
                    prepare.check_source("11111111-1111-1111-1111-111111111111")
                self.assertIn("11111111-1111-1111-1111-111111111111", run.call_args.args[0])


class Protocol(unittest.TestCase):
    def test_scoped_session_relaunch_and_coordinate_tap_over_http(self):
        calls = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def respond(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                payload = json.loads(body) if body else None
                calls.append((self.command, self.path, payload))
                value = {"sessionId": "own-session"} if self.path == "/session" else None
                if self.path.endswith("/window/rect"):
                    value = {"width": 402, "height": 874}
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"value": value}).encode())

            do_POST = respond
            do_GET = respond
            do_DELETE = respond

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        client = prepare.Appium(f"http://127.0.0.1:{server.server_port}", "explicit-source")
        client.wda_port = 18129
        try:
            client.start()
            with patch.object(client, "screen", side_effect=[
                    {"lines": [line("Sweet!")]},
                    {"lines": [line(t, 0.9) for t in ("SAVINGS", "SPENDING", "Send", "Receive")]}]), \
                    patch.object(prepare.time, "sleep"):
                client.home()
                client.point(0.5, 0.93)
            client.close()
        finally:
            server.shutdown()
            thread.join()
            server.server_close()
        caps = calls[0][2]["capabilities"]["alwaysMatch"]
        self.assertEqual(caps["appium:udid"], "explicit-source")
        self.assertTrue(caps["appium:noReset"])
        scripts = [body["script"] for _, path, body in calls if path.endswith("/execute/sync")]
        self.assertEqual(scripts, ["mobile: terminateApp", "mobile: activateApp"])
        action = next(body for _, path, body in calls if path.endswith("/actions"))
        self.assertEqual(action["actions"][0]["actions"][0]["y"], 813)
        self.assertEqual(calls[-1][:2], ("DELETE", "/session/own-session"))


if __name__ == "__main__":
    unittest.main()

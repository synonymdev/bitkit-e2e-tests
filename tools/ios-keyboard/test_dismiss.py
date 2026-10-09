import json
import unittest
from unittest.mock import patch

import dismiss


def tree(key_y=737, field_value="input", field_id="Field"):
    return [{"type": "Application", "pid": 123,
             "frame": {"x": 0, "y": 0, "width": 393, "height": 852},
             "children": [
                 {"type": "TextField", "AXUniqueId": field_id, "AXValue": field_value},
                 {"type": "Button", "AXUniqueId": "Return",
                  "frame": {"x": 294, "y": key_y, "width": 97, "height": 54}},
             ]}]


class DismissTests(unittest.TestCase):
    def test_offscreen_retained_keyboard_is_hidden(self):
        self.assertTrue(dismiss.inspect(tree(), "Field")[2])
        self.assertFalse(dismiss.inspect(tree(1038), "Field")[2])

    def test_missing_field_rejects_before_control(self):
        with patch("dismiss.subprocess.run") as command:
            command.return_value.stdout = json.dumps(tree(field_id="Wrong"))
            with self.assertRaisesRegex(RuntimeError, "requested field id"):
                dismiss.run("device", "Field", "axe")
            self.assertEqual(command.call_count, 1)

    def test_different_app_rejects(self):
        with patch("dismiss.subprocess.run") as command, patch("dismiss.time.sleep"), patch("dismiss.inspect", side_effect=[(123, "input", True), (456, "input", False)]):
            command.return_value.stdout = "[]"
            with self.assertRaisesRegex(RuntimeError, "application or field value changed"):
                dismiss.run("device", "Field", "axe")

    def test_changed_text_rejects(self):
        with patch("dismiss.subprocess.run") as command, patch("dismiss.time.sleep"), patch("dismiss.inspect", side_effect=[(123, "input", True), (123, "changed", False)]):
            command.return_value.stdout = "[]"
            with self.assertRaisesRegex(RuntimeError, "application or field value changed"):
                dismiss.run("device", "Field", "axe")


if __name__ == "__main__":
    unittest.main()

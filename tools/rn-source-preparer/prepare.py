#!/usr/bin/env python3
"""Prepare an installed, funded RN iOS source; never install or restore a target."""
import argparse
import base64
import json
import plistlib
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUNDLE = "to.bitkit"
ELEMENT = "element-6066-11e4-a52e-4f735466cecf"
CATEGORIES = ["Connection Receipts", "Transaction Log", "Boosts & Transfers",
              "Settings", "Widgets", "Tags", "Contacts"]


def recognize(path):
    result = subprocess.run([str(ROOT / "recognize"), str(path)], check=True,
                            capture_output=True, text=True, timeout=60)
    return json.loads(result.stdout)


def text_matches(screen, text):
    return [line for line in screen["lines"]
            if line["confidence"] >= 0.8 and line["text"].strip().casefold() == text.casefold()]


def is_home(screen):
    if any(text_matches(screen, label) for label in ("Received Bitcoin", "Receive Bitcoin")):
        return False
    if not all(text_matches(screen, label) for label in ("SAVINGS", "SPENDING")):
        return False
    # OCR can join the adjacent toolbar icon to its label ("1 Send", "v Receive").
    return all(any(line["confidence"] >= 0.8 and line["y"] > 0.8
                   and re.fullmatch(r".{0,2}" + label, line["text"].strip(), re.IGNORECASE)
                   for line in screen["lines"]) for label in ("Send", "Receive"))


def backup_statuses(screen):
    """Associate statuses with their own row, never with an adjacent category."""
    result = {}
    labels = [line for line in screen["lines"] if line["text"] in CATEGORIES + ["Connections"]]
    for label in labels:
        next_y = min((other["top"] for other in labels if other["top"] > label["top"]), default=1.0)
        statuses = [line for line in screen["lines"]
                    if line["confidence"] >= 0.8
                    and label["top"] <= line["top"] < min(next_y, label["top"] + 0.09)
                    and re.match(r"^(Latest Backup:|Backing Up|Backup Failed|Not Synced|Waiting)", line["text"])]
        if len(statuses) == 1:
            result[label["text"]] = statuses[0]["text"]
    return result


class Appium:
    def __init__(self, url, udid):
        self.url = url.rstrip("/")
        self.session = None
        self.udid = udid

    def request(self, method, route, payload=None):
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.url + route, data=body, method=method,
                                         headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                value = json.load(response).get("value")
        except urllib.error.HTTPError as error:
            # Do not print server responses: they can include field contents.
            raise RuntimeError(f"Appium {method} {route} returned HTTP {error.code}") from None
        if isinstance(value, dict) and value.get("error"):
            raise RuntimeError(f"Appium {method} {route}: {value['error']}")
        return value

    def start(self):
        value = self.request("POST", "/session", {"capabilities": {"alwaysMatch": {
            "platformName": "iOS", "appium:automationName": "XCUITest", "appium:udid": self.udid,
            "appium:bundleId": BUNDLE, "appium:noReset": True,
            "appium:newCommandTimeout": 180, "appium:wdaLocalPort": self.wda_port,
            "appium:isHeadless": True,
            "appium:derivedDataPath": str(ROOT / ".wda" / self.udid),
        }}})
        self.session = value["sessionId"]

    def command(self, method, route, payload=None):
        return self.request(method, f"/session/{self.session}{route}", payload)

    def mobile(self, name, args):
        return self.command("POST", "/execute/sync", {"script": "mobile: " + name, "args": [args]})

    def close(self):
        if self.session:
            self.command("DELETE", "")
            self.session = None

    def screen(self):
        data = self.command("GET", "/screenshot")
        with tempfile.TemporaryDirectory(prefix="rn-source-") as folder:
            path = Path(folder) / "screen.png"
            path.write_bytes(base64.b64decode(data, validate=True))
            return recognize(path)

    def point(self, x, y):
        rect = self.command("GET", "/window/rect")
        self.command("POST", "/actions", {"actions": [{"type": "pointer", "id": "finger",
            "parameters": {"pointerType": "touch"}, "actions": [
                {"type": "pointerMove", "duration": 0, "origin": "viewport",
                 "x": round(x * rect["width"]), "y": round(y * rect["height"])},
                {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 100},
                {"type": "pointerUp", "button": 0}]}]})
        time.sleep(0.7)

    def find(self, using, value):
        return self.command("POST", "/elements", {"using": using, "value": value})

    def tap(self, identifier, *labels):
        for element in self.find("accessibility id", identifier):
            ref = element[ELEMENT]
            if self.command("GET", f"/element/{ref}/displayed"):
                self.command("POST", f"/element/{ref}/click", {})
                time.sleep(0.7)
                return
        screen = self.screen()
        for label in labels:
            matches = text_matches(screen, label)
            if len(matches) == 1:
                self.point(matches[0]["x"], matches[0]["y"])
                return
        raise RuntimeError(f"RN control not uniquely visible: {identifier}")

    def scroll(self):
        rect = self.command("GET", "/window/rect")
        self.command("POST", "/actions", {"actions": [{"type": "pointer", "id": "finger",
            "parameters": {"pointerType": "touch"}, "actions": [
                {"type": "pointerMove", "duration": 0, "origin": "viewport",
                 "x": round(rect["width"] * 0.5), "y": round(rect["height"] * 0.78)},
                {"type": "pointerDown", "button": 0}, {"type": "pause", "duration": 150},
                {"type": "pointerMove", "duration": 500, "origin": "viewport",
                 "x": round(rect["width"] * 0.5), "y": round(rect["height"] * 0.30)},
                {"type": "pointerUp", "button": 0}]}]})
        time.sleep(0.7)

    def home(self):
        # A receive celebration is transient UI. Preserve the installed wallet,
        # keychain, mnemonic, activity and metadata while discarding its sheet.
        self.mobile("terminateApp", {"bundleId": BUNDLE})
        self.mobile("activateApp", {"bundleId": BUNDLE})
        for _ in range(12):
            screen = self.screen()
            if is_home(screen):
                return screen
            time.sleep(1)
        raise RuntimeError("RN wallet home did not appear after state-preserving relaunch")

    def activity(self, label):
        for _ in range(5):
            try:
                self.tap("ActivityShort-1", label)
                return
            except RuntimeError:
                self.scroll()
        raise RuntimeError("Latest RN activity is not visible")

    def tag(self, tag, activity_label):
        self.home()
        self.activity(activity_label)
        self.tap("ActivityTag", "Add Tag", "Add tag", "Tags")
        fields = self.find("accessibility id", "TagInput")
        if not fields:
            fields = self.find("class name", "XCUIElementTypeTextField")
        if len(fields) == 1:
            ref = fields[0][ELEMENT]
            self.command("POST", f"/element/{ref}/click", {})
            self.command("POST", f"/element/{ref}/value", {"text": tag})
        elif not fields:
            # The RN bottom-sheet bug hides TextField nodes too. Focus the
            # screenshot's empty field and type into the application (iOS 17+).
            placeholders = text_matches(self.screen(), "Enter a new tag")
            if len(placeholders) != 1:
                raise RuntimeError("RN tag input is not uniquely visible")
            self.point(placeholders[0]["x"], placeholders[0]["y"])
            self.mobile("keys", {"keys": list(tag)})
        else:
            raise RuntimeError("RN tag input is not unique")
        self.submit_tag()
        time.sleep(1)
        # Prove the tag was saved, rather than accepting text in an open input.
        self.home()
        self.activity(activity_label)
        if not text_matches(self.screen(), tag):
            raise RuntimeError("RN tag did not persist after relaunch")

    def submit_tag(self):
        # The first tap can dismiss the keyboard and move the RN sheet without
        # submitting it. Re-read the screenshot before a second bounded tap.
        for _ in range(2):
            self.tap("ActivityTagsSubmit", "Add")
            if not text_matches(self.screen(), "NEW TAG"):
                return
        raise RuntimeError("RN tag sheet did not submit; source input was left intact")

    def backups(self, require_connections, wallet_name):
        screen = self.home()
        if self.find("accessibility id", "HeaderMenu"):
            self.tap("HeaderMenu")
        else:
            headers = text_matches(screen, wallet_name)
            if len(headers) != 1 or headers[0]["y"] > 0.15:
                raise RuntimeError("RN wallet header is not uniquely visible")
            # RN 1.1.6's menu is on the right, aligned with the wallet name.
            self.point(0.93, headers[0]["y"])
        self.tap("DrawerSettings", "SETTINGS")
        self.tap("BackupSettings", "Backup")
        required = CATEGORIES + (["Connections"] if require_connections else [])
        statuses = {}
        for _ in range(6):
            statuses.update(backup_statuses(self.screen()))
            if all(statuses.get(name, "").startswith("Latest Backup: ") for name in required):
                return statuses
            self.scroll()
        missing = [name for name in required if not statuses.get(name, "").startswith("Latest Backup: ")]
        raise RuntimeError("RN backup not ready; missing successful statuses: " + ", ".join(missing))


def check_source(udid):
    uuid.UUID(udid)
    result = subprocess.run(["xcrun", "simctl", "get_app_container", udid, BUNDLE, "app"],
                            check=True, capture_output=True, text=True, timeout=30)
    with open(Path(result.stdout.strip()) / "Info.plist", "rb") as file:
        info = plistlib.load(file)
    if info.get("CFBundleShortVersionString") != "1.1.6" or info.get("CFBundleIdentifier") != BUNDLE:
        raise RuntimeError("Source must be the installed RN iOS 1.1.6 app; refusing to drive a native target")
    return info.get("CFBundleVersion")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect", help="recognize an existing screenshot; no device access")
    inspect.add_argument("screenshot", type=Path)
    for name in ("recover", "tag", "backup", "prepare"):
        command = commands.add_parser(name)
        command.add_argument("--udid", required=True, help="explicit RN source simulator UUID")
        command.add_argument("--appium", required=True, help="seat's dedicated Appium URL")
        command.add_argument("--wda-port", required=True, type=int, help="seat's unused WDA forwarding port")
        if name in ("tag", "prepare"):
            command.add_argument("--tag", required=True)
            command.add_argument("--activity-text", default="Received")
        if name in ("backup", "prepare"):
            command.add_argument("--require-connections", action="store_true")
            command.add_argument("--wallet-name", default="Your Name")
    args = parser.parse_args()
    if args.command == "inspect":
        print(json.dumps(recognize(args.screenshot)))
        return
    build = check_source(args.udid)
    if args.command in ("tag", "prepare") and (not args.tag.strip() or "\n" in args.tag or "\r" in args.tag):
        parser.error("tag must be a nonempty single line")
    client = Appium(args.appium, args.udid)
    client.wda_port = args.wda_port
    result = {"source_version": "1.1.6", "source_build": build, "source_udid": args.udid}
    try:
        client.start()
        if args.command == "recover":
            client.home()
            result["wallet_home"] = True
        if args.command in ("tag", "prepare"):
            client.tag(args.tag, args.activity_text)
            result["persisted_tag"] = args.tag
        if args.command in ("backup", "prepare"):
            result["backup_statuses"] = client.backups(args.require_connections, args.wallet_name)
        print(json.dumps(result, sort_keys=True))
    finally:
        client.close()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))

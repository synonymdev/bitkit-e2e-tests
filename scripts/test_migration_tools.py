"""Migration planning and archive failure checks; no devices or network required."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


matrix = load_script("migration-matrix")
downloader = load_script("download-migration-app")


class MigrationPlanTests(unittest.TestCase):
    def test_routine_has_exactly_four_cases_and_one_rn_version(self):
        for platform in ("android", "ios"):
            plan = matrix.migration_plan(platform)
            self.assertEqual([case["grep"] for case in plan["all"]], [
                "@migration_rn_restore", "@migration_rn_upgrade",
                "@migration_native_restore", "@migration_native_upgrade",
            ])
            self.assertEqual({case["version"] for case in plan["rn"]}, {"v1.1.6"})
            self.assertEqual(plan["version"], "2.5.0")

    def test_override_and_extended_are_explicit(self):
        plan = matrix.migration_plan("ios", "2.4.0", True)
        self.assertEqual(len(plan["all"]), 6)
        self.assertEqual({case["version"] for case in plan["native"]}, {"2.4.0"})
        self.assertEqual([case["grep"] for case in plan["rn"]][2:], ["@migration_3", "@migration_4"])

    def test_invalid_tag_rejected(self):
        for version in ("latest", "v2.5.0", "../2.5.0", "2.5.0\nEVIL=1", "2.5.0'; exit 1"):
            with self.assertRaises(ValueError):
                matrix.migration_plan("android", version)


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "config").mkdir()
        (self.root / "config/migration-checksums.json").write_text("{}")
        self.root_patch = patch.object(downloader, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def apk_download(self, args, **kwargs):
        archive = Path(args[args.index("--output") + 1])
        with zipfile.ZipFile(archive, "w") as apk:
            apk.writestr("AndroidManifest.xml", "test manifest")

    def test_native_version_rejects_rn_prefix(self):
        with self.assertRaisesRegex(ValueError, "Invalid native release tag"):
            downloader.download("android", "native", "v2.5.0")

    def test_download_keeps_target_separate_and_records_provenance(self):
        target = self.root / "aut/bitkit_e2e.apk"
        target.parent.mkdir()
        target.write_bytes(b"current target")
        with patch.object(downloader.subprocess, "run", side_effect=self.apk_download), patch.object(
            downloader.subprocess, "check_output", return_value="test-e2e-sha\n"
        ), patch.dict(downloader.os.environ, {}, clear=True):
            app = downloader.download("android", "native", "2.5.0")
        self.assertEqual(target.read_bytes(), b"current target")
        self.assertEqual(app, self.root / "aut/previous-native/bitkit_e2e.apk")
        metadata = json.loads((self.root / "artifacts/migration-source.json").read_text())
        self.assertEqual(metadata["sha256"], hashlib.sha256(app.read_bytes()).hexdigest())
        self.assertEqual(metadata["e2e_revision"], "test-e2e-sha")

    def test_http_failure_has_no_fallback(self):
        with patch.object(downloader.subprocess, "run", side_effect=subprocess.CalledProcessError(22, "curl")):
            with self.assertRaises(subprocess.CalledProcessError):
                downloader.download("android", "native", "2.5.0")
        self.assertFalse((self.root / "aut/previous-native/bitkit_e2e.apk").exists())

    def test_checksum_mismatch_rejected_before_install(self):
        (self.root / "config/migration-checksums.json").write_text(json.dumps({"2.5.0": {"bitkit_e2e.apk": "wrong"}}))
        with patch.object(downloader.subprocess, "run", side_effect=self.apk_download):
            with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                downloader.download("android", "native", "2.5.0")
        self.assertFalse((self.root / "aut/previous-native/bitkit_e2e.apk").exists())

    def test_ios_rejects_missing_bundle_and_traversal_without_touching_target(self):
        target = self.root / "aut/Bitkit.app"
        target.mkdir(parents=True)
        (target / "Info.plist").write_text("current target")
        for entries, error in (({"Other.app/Info.plist": "bad"}, "does not contain"),
                               ({"Bitkit.app/Info.plist": "plist", "../escape": "bad"}, "Unsafe archive entry")):
            def download_zip(args, **kwargs):
                with zipfile.ZipFile(args[args.index("--output") + 1], "w") as archive:
                    for name, content in entries.items():
                        archive.writestr(name, content)
            with patch.object(downloader.subprocess, "run", side_effect=download_zip):
                with self.assertRaisesRegex(ValueError, error):
                    downloader.download("ios", "native", "2.4.0")
            self.assertEqual((target / "Info.plist").read_text(), "current target")
            self.assertFalse((self.root / "aut/previous-native/Bitkit.app").exists())

    def test_bad_archive_rejected(self):
        def download_html(args, **kwargs):
            Path(args[args.index("--output") + 1]).write_text("<html>not an APK</html>")
        with patch.object(downloader.subprocess, "run", side_effect=download_html):
            with self.assertRaises(zipfile.BadZipFile):
                downloader.download("android", "native", "2.5.0")


if __name__ == "__main__":
    unittest.main()

"""The SDK preparer must reject a corrupt archive before extracting it."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("prepare-paykit-ios-sdk.py"))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class ArchiveChecks(unittest.TestCase):
    def test_corrupt_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            archive = Path(folder) / "Paykit.xcframework.zip"
            archive.write_bytes(b"corrupt release archive")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                prepare.verify_archive(archive)


if __name__ == "__main__":
    unittest.main()

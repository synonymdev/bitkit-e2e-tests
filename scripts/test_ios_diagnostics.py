import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-ios-diagnostics.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class DiagnosticsTests(unittest.TestCase):
    def test_copies_only_logs_and_records_unavailable_backend(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            group = root / 'group'
            (group / 'logs').mkdir(parents=True)
            (group / 'wallet.db').write_text('must not copy')
            (group / 'logs' / 'bitkit_foreground.log').write_text('backup error')
            (group / 'logs' / 'secret.log').symlink_to(group / 'wallet.db')

            def run(argv, **_kwargs):
                if 'get_app_container' in argv:
                    return subprocess.CompletedProcess(argv, 0, str(group), '')
                raise subprocess.TimeoutExpired(argv, 10)

            result = collector.collect(root / 'out', 'simulator', 'to.bitkit', run=run)
            self.assertEqual(len(result['appLogs']), 1)
            self.assertEqual((root / 'out/app-logs/bitkit_foreground.log').read_text(), 'backup error')
            self.assertFalse(list((root / 'out').rglob('*.db')))
            self.assertTrue(any('error' in row for row in result['probes']))
            self.assertTrue(json.loads((root / 'out/native-manifest.json').read_text())['appLogs'])

    def test_before_reset_collects_app_logs_without_backend_probes(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []

            def run(argv, **_kwargs):
                calls.append(argv)
                return subprocess.CompletedProcess(argv, 1, '', 'app not installed')

            result = collector.collect(directory, 'simulator', 'to.bitkit', app_only=True, run=run)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result['probes'][0]['exitCode'], 1)


if __name__ == '__main__':
    unittest.main()

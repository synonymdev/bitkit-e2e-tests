"""Runner boundary tests using synthetic receipts; no Appium/device session is started."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


RUNNER = Path(__file__).resolve().parents[2] / 'scripts/outcome-pilot.py'
FAKE_WDIO = r'''#!/usr/bin/env python3
import json, os
from pathlib import Path
root = Path.cwd()
directory = Path(os.environ['OUTCOME_PILOT_ARTIFACTS'])
directory.mkdir(parents=True)
mode = os.environ['OUTCOME_PILOT_MODE']
negative = os.environ['OUTCOME_PILOT_NEGATIVE_CONTROL'] == 'true'
failed_positive = not negative and mode == os.environ.get('FAIL_MODE')
with (root / 'artifacts/invocations.jsonl').open('a') as f:
    f.write(json.dumps({'mode': mode, 'negative': negative}) + '\n')
rows = [{'platform': 'ios', 'mode': mode, 'negativeControl': negative,
         'journey': name, 'passed': not (negative or failed_positive)} for name in (['send'] if os.environ['OUTCOME_PILOT_JOURNEY'] == 'send' else ['onboarding', 'receive'])]
(directory / 'results.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in rows))
if negative:
    steps = [{'journey': 'onboarding', 'action': 'tap id:Continue', 'status': 'failed',
              'error': 'expected PilotDeliberatelyMissing'}]
    steps += [{'journey': 'receive', 'action': 'earlier action', 'status': 'passed'} for _ in range(5)]
    steps += [{'journey': 'receive', 'action': 'tap id:N1', 'status': 'failed',
               'error': 'expected PilotDeliberatelyMissingAmount'}]
    if os.environ['OUTCOME_PILOT_JOURNEY'] == 'send':
        steps = [{'journey': 'send', 'action': action, 'status': 'passed'} for action in ['tap id:Send', 'tap id:RecipientManual']]
        steps += [{'journey': 'send', 'action': 'type id:RecipientInput', 'status': 'failed', 'error': 'expected PilotDeliberatelyMissingValidationToast'}]
    (directory / 'steps.jsonl').write_text(''.join(json.dumps(s) + '\n' for s in steps))
stage = 'negative' if negative else mode
if os.environ.get('MUTATE_AT') == stage:
    target = root / os.environ['MUTATE_PATH']
    if os.environ.get('DELETE_SOURCE') == 'true':
        target.unlink()
    else:
        target.write_text(target.read_text() + '\nchanged' if target.exists() else 'new source')
raise SystemExit(1 if negative or failed_positive else 0)
'''


class RunnerSourceFreezeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(['git', 'init', '--quiet', str(self.root)], check=True)
        (self.root / '.gitignore').write_text('node_modules/\nartifacts/\n')
        for name in ['scripts', 'test/helpers', 'test/experiments', 'node_modules/.bin', 'artifacts']:
            (self.root / name).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(RUNNER, self.root / 'scripts/outcome-pilot.py')
        for name in ['wdio.conf.ts', 'wdio.outcome-pilot.conf.ts', 'package-lock.json',
                     'test/helpers/setup.ts', 'test/helpers/outcome.ts']:
            (self.root / name).write_text('original source')
        fake = self.root / 'node_modules/.bin/wdio'
        fake.write_text(FAKE_WDIO)
        fake.chmod(0o755)

    def run_sample(self, journey='all', extra_args=(), **changes):
        env = {k: v for k, v in os.environ.items() if k != 'CI'}
        env.update(PLATFORM='ios', SIMULATOR_UDID='synthetic-device', **changes)
        result = subprocess.run(
            ['python3', str(self.root / 'scripts/outcome-pilot.py'), '--pairs', '1',
             '--journey', journey, '--output', str(self.root / 'artifacts/sample'), *extra_args],
            env=env, cwd=self.root, capture_output=True, text=True, timeout=30,
        )
        file = self.root / 'artifacts/sample/sessions.jsonl'
        rows = [json.loads(x) for x in file.read_text().splitlines()] if file.exists() else []
        return result, rows

    def test_unchanged_sample_finishes_and_records_both_controls(self):
        result, rows = self.run_sample()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r['valid'] and r['sourceUnchanged'] for r in rows))
        self.assertTrue(rows[-1]['negativeControl'])

    def test_send_sample_requires_one_send_receipt_and_its_control(self):
        result, rows = self.run_sample(journey='send')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r['valid'] for r in rows))
        self.assertTrue(all(len(r['results']) == 1 and r['results'][0]['journey'] == 'send' for r in rows))

    def test_mutation_during_final_control_cannot_report_completion(self):
        result, rows = self.run_sample(MUTATE_AT='negative', MUTATE_PATH='test/helpers/outcome.ts')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Completed 1 pairs', result.stdout)
        self.assertEqual(len(rows), 3)
        self.assertFalse(rows[-1]['valid'])
        self.assertFalse(rows[-1]['sourceUnchanged'])

    def test_imported_fixture_base_config_and_lockfile_changes_stop_after_first_session(self):
        for name in ['test/helpers/setup.ts', 'wdio.conf.ts', 'package-lock.json']:
            with self.subTest(path=name):
                result, rows = self.run_sample(MUTATE_AT='baseline', MUTATE_PATH=name)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(rows), 1)
                self.assertFalse(rows[0]['sourceUnchanged'])
                shutil.rmtree(self.root / 'artifacts/sample')

    def test_comparison_retains_failure_and_continues_without_retry(self):
        result, rows = self.run_sample(journey='send', extra_args=['--continue-on-test-failure'], FAIL_MODE='baseline')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(rows), 3)
        self.assertFalse(rows[0]['valid'])
        self.assertTrue(rows[1]['valid'] and rows[2]['valid'])
        self.assertIn('1 positive sessions failed', result.stderr)

    def test_continue_option_still_stops_on_source_change(self):
        result, rows = self.run_sample(extra_args=['--continue-on-test-failure'], MUTATE_AT='baseline', MUTATE_PATH='wdio.conf.ts', FAIL_MODE='baseline')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]['sourceUnchanged'])

    def test_new_untracked_source_is_detected(self):
        result, rows = self.run_sample(MUTATE_AT='baseline', MUTATE_PATH='test/helpers/new.ts')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(rows[0]['sourceUnchanged'])

    def test_deleted_source_is_detected(self):
        result, rows = self.run_sample(MUTATE_AT='baseline', MUTATE_PATH='test/helpers/setup.ts', DELETE_SOURCE='true')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(rows[0]['sourceUnchanged'])

    def test_existing_output_directory_is_rejected_without_more_sessions(self):
        first, _ = self.run_sample()
        self.assertEqual(first.returncode, 0)
        second, _ = self.run_sample()
        self.assertNotEqual(second.returncode, 0)
        invocations = (self.root / 'artifacts/invocations.jsonl').read_text().splitlines()
        self.assertEqual(len(invocations), 3)


if __name__ == '__main__':
    unittest.main()

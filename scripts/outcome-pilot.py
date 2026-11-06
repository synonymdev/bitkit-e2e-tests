#!/usr/bin/env python3
"""Run a bounded, local-only comparison and validate complete per-journey receipts."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time


def source_hashes(root):
    # Include base configuration, fixture imports, lockfiles, the runner itself and
    # new untracked source. Ignored artifacts/dependencies are separate run inputs.
    staged = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root).decode()
    gitlinks = {}
    for row in staged.split('\0'):
        if row:
            metadata, name = row.split('\t', 1)
            mode, digest, _stage = metadata.split()
            if mode == '160000':
                gitlinks[name] = digest
    names = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root
    ).decode().split('\0')
    hashes = {}
    for name in sorted(set(names) - {''}):
        path = root / name
        if name in gitlinks:
            content = f'gitlink:{gitlinks[name]}'.encode()
        elif path.is_symlink():
            content = f'symlink:{os.readlink(path)}'.encode()
        else:
            content = path.read_bytes()
        hashes[name] = hashlib.sha256(content).hexdigest()
    return hashes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pairs', type=int, default=3, choices=range(1, 11))
    parser.add_argument('--journey', choices=['all', 'send'], default='all')
    parser.add_argument('--continue-on-test-failure', action='store_true',
                        help='Finish the planned sample after a complete positive test failure; never retry it')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    platform = os.environ.get('PLATFORM')
    if os.environ.get('CI') or platform not in ('ios', 'android'):
        parser.error('Use locally with PLATFORM=ios or android')
    if not os.environ.get('SIMULATOR_UDID' if platform == 'ios' else 'ANDROID_UDID'):
        parser.error('Set an explicit disposable device identifier')
    output = args.output.resolve()
    try:
        relative_output = output.relative_to(root)
    except ValueError:
        pass
    else:
        ignored = subprocess.run(
            ['git', 'check-ignore', '--quiet', str(relative_output)], cwd=root
        ).returncode == 0
        if not ignored:
            parser.error('Output inside the checkout must be Git-ignored, or use an external directory')
    output.mkdir(parents=True, exist_ok=False)
    hashes = source_hashes(root)
    (output / 'source.json').write_text(json.dumps(hashes, indent=2) + '\n')
    plan = []
    for pair in range(1, args.pairs + 1):
        modes = ('baseline', 'outcome') if pair % 2 else ('outcome', 'baseline')
        plan.extend((f'{platform}-{mode}-{pair}', mode, False) for mode in modes)
    plan.append((f'{platform}-negative-control', 'outcome', True))
    (output / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    failed_positive_sessions = 0
    for name, mode, negative in plan:
        if source_hashes(root) != hashes:
            raise RuntimeError('Source changed during the sample; do not combine revisions')
        directory = output / name
        env = {
            **os.environ,
            'OUTCOME_PILOT_MODE': mode,
            'OUTCOME_PILOT_JOURNEY': args.journey,
            'OUTCOME_PILOT_NEGATIVE_CONTROL': str(negative).lower(),
            'OUTCOME_PILOT_ARTIFACTS': str(directory),
            'RECORD_VIDEO': 'true',
            'SAVE_DIAGNOSTICS': 'true',
        }
        started = time.monotonic()
        print(f'Starting {name}', flush=True)
        with (output / f'{name}.log').open('w') as log:
            process = subprocess.Popen(
                [str(root / 'node_modules/.bin/wdio'), 'run', './wdio.outcome-pilot.conf.ts'],
                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                code = process.wait(timeout=900)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise
        source_error = None
        try:
            source_unchanged = source_hashes(root) == hashes
        except (OSError, subprocess.SubprocessError) as error:
            source_unchanged = False
            source_error = str(error)
        receipt = directory / 'results.jsonl'
        rows = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        expected_journeys = {'send'} if args.journey == 'send' else {'onboarding', 'receive'}
        complete = (
            len(rows) == len(expected_journeys)
            and {row.get('journey') for row in rows} == expected_journeys
            and all(row.get('platform') == platform and row.get('mode') == mode for row in rows)
            and all(row.get('negativeControl') == negative for row in rows)
        )
        valid = source_unchanged and complete and code == (1 if negative else 0) and all(
            row.get('passed') is (not negative) for row in rows
        )
        if negative and valid:
            steps = [json.loads(line) for line in (directory / 'steps.jsonl').read_text().splitlines()]
            controls = [('send', 'type id:RecipientInput', None)] if args.journey == 'send' else [('onboarding', 'tap id:Continue', 1), ('receive', 'tap id:N1', 6)]
            for journey, last_action, count in controls:
                selected = [step for step in steps if step.get('journey') == journey]
                valid = valid and bool(selected) and (count is None or len(selected) == count) and selected[-1]['action'] == last_action and selected[-1]['status'] == 'failed'
                if selected:
                    # A failed click/precondition is not a valid negative-control result.
                    error = selected[-1].get('error', '')
                    valid = valid and 'expected' in error and 'PilotDeliberatelyMissing' in error
                if journey == 'send':
                    actions = [step.get('action') for step in selected]
                    allowed = [
                        ['tap id:Send', 'tap id:RecipientManual', 'type id:RecipientInput'],
                        ['tap id:Send', 'tap id:com.android.permissioncontroller:id/permission_allow_foreground_only_button',
                         'tap id:RecipientManual', 'type id:RecipientInput'],
                    ]
                    valid = valid and actions in allowed and all(step.get('status') == 'passed' for step in selected[:-1])
        record = {
            'name': name, 'mode': mode, 'negativeControl': negative, 'exitCode': code,
            'wallSeconds': round(time.monotonic() - started, 3),
            'complete': complete, 'valid': valid, 'results': rows,
            'sourceUnchanged': source_unchanged, 'sourceError': source_error,
        }
        with (output / 'sessions.jsonl').open('a') as log:
            log.write(json.dumps(record) + '\n')
        print(json.dumps(record), flush=True)
        if not valid:
            if (args.continue_on_test_failure and not negative and source_unchanged
                    and complete and code == 1 and all(row.get('passed') is False for row in rows)):
                failed_positive_sessions += 1
            else:
                raise SystemExit('Incomplete or unexpected result; sample stopped, evidence retained')
    if source_hashes(root) != hashes:
        raise RuntimeError('Source changed before final completion; sample is not valid')
    print(f'Completed {args.pairs} pairs and negative controls for {args.journey} on {platform}', flush=True)
    if failed_positive_sessions:
        raise SystemExit(f'{failed_positive_sessions} positive sessions failed; retained without retry')


if __name__ == '__main__':
    main()

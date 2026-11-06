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
    files = [
        'test/helpers/actions.ts',
        'test/helpers/outcome.ts',
        'test/experiments/onboarding-outcome.e2e.ts',
        'test/experiments/receive-outcome.e2e.ts',
        'wdio.outcome-pilot.conf.ts',
    ]
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pairs', type=int, default=3, choices=range(1, 6))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    platform = os.environ.get('PLATFORM')
    if os.environ.get('CI') or platform not in ('ios', 'android'):
        parser.error('Use locally with PLATFORM=ios or android')
    if not os.environ.get('SIMULATOR_UDID' if platform == 'ios' else 'ANDROID_UDID'):
        parser.error('Set an explicit disposable device identifier')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    hashes = source_hashes(root)
    (output / 'source.json').write_text(json.dumps(hashes, indent=2) + '\n')
    plan = []
    for pair in range(1, args.pairs + 1):
        modes = ('baseline', 'outcome') if pair % 2 else ('outcome', 'baseline')
        plan.extend((f'{platform}-{mode}-{pair}', mode, False) for mode in modes)
    plan.append((f'{platform}-negative-control', 'outcome', True))
    (output / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    for name, mode, negative in plan:
        if source_hashes(root) != hashes:
            raise RuntimeError('Source changed during the sample; do not combine revisions')
        directory = output / name
        env = {
            **os.environ,
            'OUTCOME_PILOT_MODE': mode,
            'OUTCOME_PILOT_JOURNEY': 'all',
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
                code = process.wait(timeout=480)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise
        receipt = directory / 'results.jsonl'
        rows = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        complete = (
            len(rows) == 2
            and {row.get('journey') for row in rows} == {'onboarding', 'receive'}
            and all(row.get('platform') == platform and row.get('mode') == mode for row in rows)
            and all(row.get('negativeControl') == negative for row in rows)
        )
        valid = complete and code == (1 if negative else 0) and all(
            row.get('passed') is (not negative) for row in rows
        )
        if negative and valid:
            steps = [json.loads(line) for line in (directory / 'steps.jsonl').read_text().splitlines()]
            for journey, last_action, count in [('onboarding', 'tap id:Continue', 1), ('receive', 'tap id:N1', 6)]:
                selected = [step for step in steps if step.get('journey') == journey]
                valid = valid and len(selected) == count and selected[-1]['action'] == last_action and selected[-1]['status'] == 'failed'
                if selected:
                    # A failed click/precondition is not a valid negative-control result.
                    error = selected[-1].get('error', '')
                    valid = valid and 'expected' in error and 'PilotDeliberatelyMissing' in error
        record = {
            'name': name, 'mode': mode, 'negativeControl': negative, 'exitCode': code,
            'wallSeconds': round(time.monotonic() - started, 3),
            'complete': complete, 'valid': valid, 'results': rows,
        }
        with (output / 'sessions.jsonl').open('a') as log:
            log.write(json.dumps(record) + '\n')
        print(json.dumps(record), flush=True)
        if not valid:
            raise SystemExit('Incomplete or unexpected result; sample stopped, evidence retained')
    print(f'Completed {args.pairs} pairs and both negative controls on {platform}', flush=True)


if __name__ == '__main__':
    main()

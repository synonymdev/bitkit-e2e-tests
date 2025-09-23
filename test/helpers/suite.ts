import path from 'node:path';
import fs from 'node:fs';

const LOCK_PATH = '/tmp/lock/';
const ON_CI = !!process.env.CI;

/**
 * CI-aware wrapper around Mocha's `it`.
 *
 * Behavior:
 * - On CI (`process.env.CI` is set):
 *   • If this test has already succeeded in a previous run (`checkComplete(name)`),
 *     it will be skipped with `it.skip(...)`.
 *   • Otherwise, the test runs as usual. If it passes, we call `markComplete(name)`
 *     so that future CI retries can skip it.
 *
 * - Outside CI (local dev): behaves like a normal `it`.
 *
 * This mechanism speeds up CI retries by avoiding re-running tests that are
 * already green, while still letting you run everything locally.
 */
export function ciIt(name: string, fn: () => Promise<void>) {
  if (checkComplete(name)) {
    console.warn(`→ Skipping "${name}" (already completed in a previous run)`);
    return it.skip(name, fn);
  }

  return it(name, async () => {
    await fn();
    markComplete(name);
  });
}

// Allow explicit skip
ciIt.skip = (name: string, fn?: () => Promise<void>) => {
  return it.skip(name, fn);
};

// Allow explicit only
ciIt.only = (name: string, fn?: () => Promise<void>) => {
  return it.only(name, fn);
};

export function checkComplete(name: string): boolean {
  return ON_CI && fs.existsSync(lockFile(name));
}

export function markComplete(name: string) {
  if (!ON_CI) return;
  fs.mkdirSync(LOCK_PATH, { recursive: true });
  fs.writeFileSync(lockFile(name), '1');
}

function lockFile(key: string) {
  // replace anything that's *not* a letter, number, dot, underscore, or dash
  // with an underscore. This avoids weird characters in filenames.
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  // then build an absolute path like /tmp/lock/lock-backup_1
  return path.join(LOCK_PATH, `lock-${safe}`);
}

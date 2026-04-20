import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'push-fixture-media-to-devices.sh');

export type PushFixtureMediaOptions = {
  /** Specific files to push (absolute or relative to repo root). Defaults to all images in `test/fixtures/`. */
  files?: string[];
  /** Force-skip Android even when current driver is Android. */
  skipAndroid?: boolean;
  /** Force-skip iOS even when current driver is iOS. */
  skipIos?: boolean;
};

/**
 * Push image fixtures into the currently active platform (Android emulator or iOS Simulator)
 * so the OS image picker can use them — e.g. for Pubky profile avatar selection.
 *
 * Wraps `scripts/push-fixture-media-to-devices.sh` so the OS-specific logic stays in one place.
 *
 * Notes:
 * - Best called once per spec from `before(...)`, after `reinstallApp()` / `completeOnboarding()`.
 * - Photos library is global per simulator/emulator; re-running is safe but may add duplicates.
 * - On iOS, the Bitkit picker may need Photos permission granted (handled by setup helpers).
 */
export function pushFixtureMedia(options: PushFixtureMediaOptions = {}) {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`pushFixtureMedia: script not found at ${SCRIPT_PATH}`);
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  // Restrict to the platform of the active driver unless caller explicitly overrides.
  const isAndroid = typeof driver !== 'undefined' && driver.isAndroid;
  const isIOS = typeof driver !== 'undefined' && driver.isIOS;
  if (options.skipAndroid || (typeof driver !== 'undefined' && !isAndroid)) {
    env.SKIP_ANDROID = '1';
  }
  if (options.skipIos || (typeof driver !== 'undefined' && !isIOS)) {
    env.SKIP_IOS = '1';
  }

  const args = (options.files ?? []).map((f) =>
    path.isAbsolute(f) ? f : path.join(REPO_ROOT, f)
  );

  try {
    execFileSync(SCRIPT_PATH, args, { stdio: 'inherit', env });
    console.info('→ pushFixtureMedia: done');
  } catch (error) {
    console.warn('⚠ pushFixtureMedia failed', error);
    throw error;
  }
}

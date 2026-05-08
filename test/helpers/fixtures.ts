import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const FIXTURES_DIR = path.join(REPO_ROOT, 'test', 'fixtures');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'push-fixture-media-to-devices.sh');

/** Staging regtest users (homegate) for contact E2E — remote profiles must exist for tests that add them. */
export type PubkyContact = { name: string; pubky: string; ableToPay: boolean };

export const STAGING_TEST_CONTACTS: readonly PubkyContact[] = [
  {
    name: 'Contact #1',
    pubky: 'pubkywxqciwrn63jc9oabfrdgq9ju9toxb6pbmtstyy9gkkxs41gk3r5o',
    ableToPay: false,
  },
  {
    name: 'Contact #2',
    pubky: 'pubkyqgzi1fg1d1m5yp44euu7g5g7t86c3bipi7ci8ca9czc367q779zy',
    ableToPay: false,
  },
] as const;

/** Staging regtest contacts with public Paykit endpoints published. */
export const STAGING_PAYKIT_CONTACTS: readonly PubkyContact[] = [
  {
    name: 'Contact Paykit #1',
    pubky: 'pubkyftnjb3c8a4oqcdtfi48faninkt6bwqjwiwcf9zd64dgxriaetxho',
    ableToPay: true,
  },
  {
    name: 'Contact Paykit #2',
    pubky: 'pubky36ztgwiu8e1qdz5fhfh671qqq8srw7q8au4kkhew8bg3w8pe1wty',
    ableToPay: true,
  },
] as const;

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

  const args = (options.files ?? []).map((f) => (path.isAbsolute(f) ? f : path.join(REPO_ROOT, f)));

  try {
    execFileSync(SCRIPT_PATH, args, { stdio: 'inherit', env });
    console.info('→ pushFixtureMedia: done');
  } catch (error) {
    console.warn('⚠ pushFixtureMedia failed', error);
    throw error;
  }
}

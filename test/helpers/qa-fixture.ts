import fs from 'node:fs';
import path from 'node:path';

import { completeOnboarding, receiveOnchainFunds, transferSavingsToSpending } from './actions';
import { doNavigationClose } from './navigation';
import { enablePaykitUi } from './paykit';
import { createProfile } from './profile';
import type { ElectrumClient } from './electrum';

export const QA_FIXTURE_KINDS = ['empty', 'onchain', 'spending', 'pubky', 'full'] as const;
export type QaFixtureKind = (typeof QA_FIXTURE_KINDS)[number];

export type QaFixtureResult = {
  kind: QaFixtureKind;
  platform: 'android' | 'ios';
  profileName?: string;
  pubky?: string;
  onchainSats?: number;
  spendingSats?: number;
};

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function onchainSats(): number {
  return Number.parseInt(process.env.QA_FIXTURE_ONCHAIN_SATS ?? '200000', 10);
}

function spendingSats(): number {
  return Number.parseInt(process.env.QA_FIXTURE_SPENDING_SATS ?? '50000', 10);
}

function profileName(): string {
  return process.env.QA_FIXTURE_PROFILE_NAME?.trim() || 'QA Wallet';
}

function needsFunds(kind: QaFixtureKind): boolean {
  return kind === 'onchain' || kind === 'spending' || kind === 'full';
}

function needsSpending(kind: QaFixtureKind): boolean {
  return kind === 'spending' || kind === 'full';
}

function needsProfile(kind: QaFixtureKind): boolean {
  return kind === 'pubky' || kind === 'full';
}

export function parseQaFixtureKind(value: string): QaFixtureKind {
  if ((QA_FIXTURE_KINDS as readonly string[]).includes(value)) {
    return value as QaFixtureKind;
  }
  throw new Error(`Unknown QA fixture '${value}'. Expected one of: ${QA_FIXTURE_KINDS.join(', ')}`);
}

/**
 * Leaves the app on Wallet home. Caller must have already reinstalled + onboarded
 * when using the spec; this function also onboards so it can be called alone.
 */
export async function applyQaFixture(
  kind: QaFixtureKind,
  {
    waitForSync,
    onboard = false,
  }: { waitForSync?: ElectrumClient['waitForSync']; onboard?: boolean } = {}
): Promise<QaFixtureResult> {
  if (onboard) {
    await completeOnboarding();
  }

  const result: QaFixtureResult = {
    kind,
    platform: driver.isAndroid ? 'android' : 'ios',
  };

  if (needsFunds(kind)) {
    result.onchainSats = onchainSats();
    await receiveOnchainFunds({ sats: result.onchainSats, verifyBalances: true });
    if (waitForSync) {
      await waitForSync();
    }
  }

  if (needsSpending(kind)) {
    result.spendingSats = spendingSats();
    await transferSavingsToSpending({
      amountSats: result.spendingSats,
      waitForSync,
    });
  }

  if (needsProfile(kind)) {
    await enablePaykitUi();
    result.profileName = profileName();
    const created = await createProfile({ name: result.profileName });
    result.pubky = created.pubky;
    await doNavigationClose();
  }

  writeQaFixtureArtifact(result);
  return result;
}

function writeQaFixtureArtifact(result: QaFixtureResult) {
  const dir = path.join(REPO_ROOT, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  const payload = { ...result, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'qa-fixture.json'), `${JSON.stringify(payload, null, 2)}\n`);
  if (result.pubky) {
    fs.writeFileSync(path.join(dir, 'qa-fixture.pubky'), `${result.pubky}\n`);
  }
  console.info('→ QA fixture ready', payload);
}

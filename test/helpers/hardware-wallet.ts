import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  acknowledgeReceivedPaymentIfPresent,
  doNavigationClose,
  elementById,
  enterAmount,
  expectBalanceWithWait,
  expectTextWithin,
  expectText,
  formatSats,
  getAmountUnder,
  sleep,
  tap,
  typeText,
  handleAndroidAlert,
  waitForToast,
  type BalanceCondition,
  dismissBackupTimedSheet,
  dismissBackgroundPaymentsTimedSheet,
  dismissQuickPayIntro,
} from './actions';
import { openHomeWidgets, openSettings } from './navigation';
import { deposit, getBackend, mineBlocks } from './regtest';

const E2E_ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = path.join(E2E_ROOT, 'artifacts');
const TREZOR_FIXTURE_PATH = path.join(ARTIFACTS_DIR, 'trezor-emulator.json');

export type TrezorEmulatorFixture = {
  dashboardUrl: string;
  bridgeUrl: string;
  mnemonic: string | null;
  address: {
    coin: string;
    path: string;
    value: string;
  };
};

function runTrezorEmulatorJson(args: string[]): TrezorEmulatorFixture {
  const output = execFileSync('./scripts/trezor-emulator', args, {
    cwd: E2E_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(output) as TrezorEmulatorFixture;
}

function runTrezorEmulator(args: string[]) {
  execFileSync('./scripts/trezor-emulator', args, {
    cwd: E2E_ROOT,
    stdio: 'inherit',
  });
}

function runTrezorEmulatorQuiet(args: string[]) {
  execFileSync('./scripts/trezor-emulator', args, {
    cwd: E2E_ROOT,
    stdio: 'ignore',
  });
}

function writeFixture(fixture: TrezorEmulatorFixture): TrezorEmulatorFixture {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(TREZOR_FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  return fixture;
}

export function stopTrezorEmulator() {
  runTrezorEmulator(['stop']);
}

export function ensureTrezorEmulator({
  fresh = false,
}: { fresh?: boolean } = {}): TrezorEmulatorFixture {
  if (fresh) {
    runTrezorEmulator(['stop']);
    return writeFixture(runTrezorEmulatorJson(['start', '--json']));
  }

  try {
    return writeFixture(runTrezorEmulatorJson(['status', '--json']));
  } catch {
    return writeFixture(runTrezorEmulatorJson(['start', '--json']));
  }
}

export async function openHardwareWalletSettings() {
  await openSettings('general');
  await tap('HardwareWalletsSettings');
  await elementById('HardwareWalletsScreen').waitForDisplayed();
}

export async function startHardwareWalletFlowFromSuggestion() {
  await openHomeWidgets();
  await elementById('Suggestion-hardware').waitForDisplayed({ timeout: 30_000 });
  await tap('Suggestion-hardware');
}

export async function connectHardwareWalletFromSettings(label: string) {
  await openHardwareWalletSettings();
  await tap('AddHardwareWallet');
  await completeHardwareWalletFlow(label);
}

export async function completeHardwareWalletFlow(label: string) {
  await elementById('HardwareWalletIntroScreen').waitForDisplayed();
  await sleep(1000);
  await tap('HardwareWalletIntroContinue');
  await handleAndroidAlert();

  await elementById('HardwareWalletFoundScreen').waitForDisplayed();
  await sleep(1000);
  await tap('HardwareWalletFoundConnect');
  await elementById('HardwareWalletPairedScreen').waitForDisplayed();
  await typeText('HardwareWalletLabelInput', label);
  await tap('HardwareWalletPairedFinish');
  await sleep(1000);
  // We finish on Main screen with the hardware wallet listed
  await elementById('ActivityHardware').waitForDisplayed();
  await expectText(label, { strategy: 'contains' });
}

export async function expectHardwareWalletInSettings(
  label: string,
  { visible }: { visible: boolean }
) {
  await expectText(label, { visible, strategy: 'contains' });
}

export async function expectHardwareSuggestion({ visible }: { visible: boolean }) {
  if (visible) {
    await openHomeWidgets();
  }
  await elementById('Suggestion-hardware').waitForDisplayed({
    reverse: !visible,
    timeout: 30_000,
  });
}

export async function expectHardwareWalletOnHome(label: string, { visible }: { visible: boolean }) {
  await doNavigationClose();
  await elementById('ActivityHardware').waitForDisplayed({
    reverse: !visible,
    timeout: 30_000,
  });
  if (visible) {
    await expectText(label, { strategy: 'contains' });
  }
}

export async function expectHardwareWalletBalance(
  expected: number,
  options: { condition?: BalanceCondition; timeout?: number; interval?: number } = {}
): Promise<number> {
  return expectBalanceWithWait(
    () => getAmountUnder('ActivityHardware'),
    'hardware wallet',
    expected,
    options
  );
}

export async function fundHardwareWalletAndAcknowledge(
  fixture: TrezorEmulatorFixture,
  { sats = 15_000, blocksToMine = 1 }: { sats?: number; blocksToMine?: number } = {}
) {
  await deposit(fixture.address.value, sats);
  if (blocksToMine > 0) {
    await mineBlocks(blocksToMine);
  }
  await acknowledgeReceivedPaymentIfPresent();
}

export async function expectHardwareWalletReceivedActivity(sats: number) {
  await doNavigationClose();
  await elementById('ActivityHardware').waitForDisplayed();
  await expectTextWithin('ActivityHardware', formatSats(sats));
  await tap('ActivityHardware');
  await elementById('HardwareWalletScreen').waitForDisplayed();
  await elementById('Activity-1').waitForDisplayed();
  await expectTextWithin('Activity-1', 'Received');
  await expectTextWithin('Activity-1', formatSats(sats));
}

export async function transferHardwareWalletToSpending({
  amountSats,
  waitForSync,
}: {
  amountSats: number;
  waitForSync?: () => Promise<void>;
}) {
  await doNavigationClose();
  await tap('ActivityHardware');
  await elementById('HardwareWalletScreen').waitForDisplayed();
  await tap('HardwareTransferToSpending');

  const hasSpendingIntro = await elementById('SpendingIntro-button')
    .isDisplayed()
    .catch(() => false);
  if (hasSpendingIntro) {
    await tap('SpendingIntro-button');
    await sleep(800);
  }

  await elementById('HardwareTransferAmount').waitForDisplayed({ timeout: 60_000 });
  await elementById('HardwareTransferAmountContinue').waitForEnabled({ timeout: 60_000 });
  await sleep(1000);
  await enterAmount(amountSats);
  await elementById('HardwareTransferAmountContinue').waitForEnabled({ timeout: 60_000 });
  await tap('HardwareTransferAmountContinue');
  await elementById('HardwareTransferSign').waitForDisplayed({ timeout: 120_000 });
  await tap('HardwareTransferOpenTrezorConnect');
  await approveTrezorPromptsUntilTransferProgress();
  await waitForHardwareTransferProgress();
  if (getBackend() === 'local') {
    // Local backend does not have Blocktank,
    // so we don't wait for the transfer success screen.
    await tap('TransferSuccess-button');
  } else {
    await mineBlocks(1);
    if (waitForSync) {
      await waitForSync();
    }
    for (let i = 0; i < 10; i++) {
      try {
        await elementById('TransferSuccess').waitForDisplayed({ timeout: 5_000 });
        break;
      } catch {
        console.info('→ Hardware transfer success not found, mining another block...');
        await mineBlocks(1);
        if (waitForSync) {
          await waitForSync();
        }
      }
    }
    await elementById('TransferSuccess').waitForDisplayed();
    await tap('TransferSuccess-button');
    await dismissSpendingBalanceToastIfShown();
    await dismissBackupTimedSheet({ triggerTimedSheet: false });
    await dismissBackgroundPaymentsTimedSheet({ triggerTimedSheet: true });
    await dismissQuickPayIntro({ triggerTimedSheet: true });
  }
}

export async function removeHardwareWalletFromSettings(label: string) {
  await openHardwareWalletSettings();
  await expectHardwareWalletInSettings(label, { visible: true });
  await tapFirstHardwareWalletDelete();
  await tap('DialogConfirm');
  await sleep(500);
  await expectHardwareWalletInSettings(label, { visible: false });
}

async function approveTrezorPromptsUntilTransferProgress() {
  const started = Date.now();
  const timeout = 180_000;

  while (Date.now() - started < timeout) {
    if (await isAnyDisplayed(['HardwareTransferSigned', 'LightningSettingUp', 'TransferSuccess'])) {
      return;
    }
    pressTrezorYes();
    await sleep(500);
  }

  throw new Error('Timed out waiting for hardware transfer signing progress');
}

async function waitForHardwareTransferProgress() {
  await browser.waitUntil(async () => isAnyDisplayed(['LightningSettingUp', 'TransferSuccess']), {
    timeout: 60_000,
    interval: 500,
    timeoutMsg: 'Timed out waiting for hardware transfer progress',
  });
}

function pressTrezorYes() {
  try {
    runTrezorEmulatorQuiet(['send-json', JSON.stringify({ type: 'emulator-press-yes' })]);
  } catch {
    // The prompt may not be ready on every polling tick.
  }
}

async function isAnyDisplayed(testIds: string[]): Promise<boolean> {
  for (const testId of testIds) {
    if (await isDisplayed(testId)) {
      return true;
    }
  }
  return false;
}

async function isDisplayed(testId: string): Promise<boolean> {
  try {
    return await elementById(testId).isDisplayed();
  } catch {
    return false;
  }
}

async function dismissSpendingBalanceToastIfShown() {
  try {
    await waitForToast('SpendingBalanceReadyToast', { timeout: 30_000 });
  } catch {
    console.info('→ SpendingBalanceReadyToast not shown after hardware transfer.');
  }
}

async function tapFirstHardwareWalletDelete() {
  const deleteButton = await $(
    'android=new UiSelector().resourceIdMatches(".*HardwareWalletRowDelete_.*")'
  );
  await deleteButton.waitForDisplayed({ timeout: 30_000 });
  await deleteButton.click();
}

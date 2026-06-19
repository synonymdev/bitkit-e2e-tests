import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  acknowledgeReceivedPaymentIfPresent,
  doNavigationClose,
  elementById,
  expectBalanceWithWait,
  expectTextWithin,
  expectText,
  formatSats,
  getAmountUnder,
  sleep,
  tap,
  typeText,
} from './actions';
import { openHomeWidgets, openSettings } from './navigation';
import { deposit, mineBlocks } from './regtest';

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

function writeFixture(fixture: TrezorEmulatorFixture): TrezorEmulatorFixture {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(TREZOR_FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  return fixture;
}

export function ensureTrezorEmulator(): TrezorEmulatorFixture {
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
  await elementById('HardwareWalletsScreen').waitForDisplayed();
}

export async function completeHardwareWalletFlow(label: string) {
  await elementById('HardwareWalletIntroScreen').waitForDisplayed();
  await sleep(1000);
  await tap('HardwareWalletIntroContinue');

  await elementById('HardwareWalletFoundScreen').waitForDisplayed({ timeout: 60_000 });
  await elementById('HardwareWalletFoundDeviceName').waitForDisplayed();
  await sleep(1000);
  await tap('HardwareWalletFoundConnect');

  await elementById('HardwareWalletPairedScreen').waitForDisplayed({ timeout: 60_000 });
  await typeText('HardwareWalletLabelInput', label);
  await tap('HardwareWalletPairedFinish');
  await sleep(1000);
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

export async function expectHardwareWalletBalance(expected: number): Promise<number> {
  return expectBalanceWithWait(
    () => getAmountUnder('ActivityHardware'),
    'hardware wallet',
    expected,
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

export async function removeHardwareWalletFromSettings(label: string) {
  await openHardwareWalletSettings();
  await expectHardwareWalletInSettings(label, { visible: true });
  await tapFirstHardwareWalletDelete();
  await tap('DialogConfirm');
  await sleep(500);
  await expectHardwareWalletInSettings(label, { visible: false });
}

async function tapFirstHardwareWalletDelete() {
  const deleteButton = await $('android=new UiSelector().resourceIdMatches(".*HardwareWalletRowDelete_.*")');
  await deleteButton.waitForDisplayed({ timeout: 30_000 });
  await deleteButton.click();
}


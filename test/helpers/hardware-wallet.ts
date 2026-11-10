import { actAndExpect, tapAndExpect, typeAndExpect } from './outcome';
import { enterGateAddress, confirmGateAction } from './gate-actions';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  acknowledgeReceivedPaymentIfPresent,
  addSendTag,
  doNavigationClose,
  elementById,
  elementByText,
  enterAmount,
  expectBalanceWithWait,
  expectTextWithin,
  expectText,
  formatSats,
  getAccessibleText,
  getAddressFromQRCode,
  getAmountUnder,
  sleep,
  swipeFullScreen,
  tap,
  selectSendFundingSource,
  tapFirstByAccessibilityIdPrefix,
  handleAndroidAlert,
  type BalanceCondition,
  confirmInputOnKeyboard,
} from './actions';
import { openHomeWidgets, openSettings } from './navigation';
import { deposit, mineBlocks } from './regtest';

const E2E_ROOT = path.resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = path.join(E2E_ROOT, 'artifacts');
const TREZOR_FIXTURE_PATH = path.join(ARTIFACTS_DIR, 'trezor-emulator.json');
/** Android tags the paired-device receive tab Tab-hardware; iOS still uses Tab-trezor from the Trezor label. */
const HARDWARE_RECEIVE_TAB_IDS = ['Tab-hardware', 'Tab-trezor'] as const;

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
  await tapAndExpect(
    { id: 'HardwareWalletsSettings' },
    { anyVisible: [{ id: 'HardwareWalletsScreen' }] }
  );
  await elementById('HardwareWalletsScreen').waitForDisplayed();
}

export async function startHardwareWalletFlowFromSuggestion() {
  await openHomeWidgets();
  await elementById('Suggestion-hardware').waitForDisplayed({ timeout: 30_000 });
  await tapAndExpect(
    { id: 'Suggestion-hardware' },
    { anyVisible: [{ id: 'HardwareWalletIntroScreen' }] }
  );
}

export async function connectHardwareWalletFromSettings(label: string) {
  await openHardwareWalletSettings();
  await tapAndExpect(
    { id: 'AddHardwareWallet' },
    { anyVisible: [{ id: 'HardwareWalletIntroScreen' }] }
  );
  await completeHardwareWalletFlow(label);
}

export async function completeHardwareWalletFlow(label: string) {
  const homeLabel = driver.isAndroid ? label.toUpperCase() : label;
  await elementById('HardwareWalletIntroScreen').waitForDisplayed();
  await actAndExpect(
    'begin hardware pairing',
    async () => {
      await tap('HardwareWalletIntroContinue');
      await handleAndroidAlert();
    },
    { anyVisible: [{ id: 'HardwareWalletFoundScreen' }] }
  );

  await elementById('HardwareWalletFoundScreen').waitForDisplayed();
  await tapAndExpect(
    { id: 'HardwareWalletFoundConnect' },
    { anyVisible: [{ id: 'HardwareWalletPairedScreen' }] }
  );
  await elementById('HardwareWalletPairedScreen').waitForDisplayed();
  await typeAndExpect('HardwareWalletLabelInput', label, {}, { verifyClear: true });
  await tapAndExpect(
    { id: 'HardwareWalletPairedFinish' },
    {
      all: [
        { visible: { id: 'ActivityHardware' } },
        { textWithin: { id: 'ActivityHardware', text: homeLabel, strategy: 'contains' } },
      ],
    }
  );
  // We finish on Main screen with the hardware wallet listed
  await elementById('ActivityHardware').waitForDisplayed();
  await expectText(homeLabel, { strategy: 'contains' });
}

export async function expectHardwareWalletInSettings(
  label: string,
  { visible }: { visible: boolean }
) {
  await expectText(label, { visible, strategy: 'contains' });
}

export async function renameHardwareWalletFromSettings(currentLabel: string, newLabel: string) {
  await expectHardwareWalletInSettings(currentLabel, { visible: true });
  const nameEl = await elementByText(currentLabel, 'contains');
  await nameEl.waitForDisplayed({ timeout: 30_000 });
  await actAndExpect('open hardware wallet rename', () => nameEl.click(), {
    anyVisible: [{ id: 'RenameHardwareWalletInput' }],
  });
  await elementById('RenameHardwareWalletInput').waitForDisplayed({ timeout: 30_000 });
  await typeAndExpect('RenameHardwareWalletInput', newLabel, {}, { verifyClear: true });
  await actAndExpect(
    'save hardware wallet name',
    async () => {
      await tap('RenameHardwareWalletSave');
      await confirmInputOnKeyboard();
    },
    {
      all: [
        { hidden: { id: 'RenameHardwareWalletInput' } },
        { visible: { text: newLabel } },
        { hidden: { text: currentLabel } },
      ],
    }
  );
  await elementById('RenameHardwareWalletInput').waitForDisplayed({
    reverse: true,
    timeout: 30_000,
  });
  await expectHardwareWalletInSettings(newLabel, { visible: true });
  await expectHardwareWalletInSettings(currentLabel, { visible: false });
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
    await expectText(driver.isAndroid ? label.toUpperCase() : label, { strategy: 'contains' });
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

export async function fundHardwareWalletAndAcknowledge({
  sats = 15_000,
  blocksToMine = 1,
}: { sats?: number; blocksToMine?: number } = {}) {
  const address = await getHardwareReceiveAddress();
  await swipeFullScreen('down');
  await deposit(address, sats);
  if (blocksToMine > 0) {
    await mineBlocks(blocksToMine);
  }
  await acknowledgeReceivedPaymentIfPresent();
}

async function getHardwareReceiveAddress(): Promise<string> {
  await doNavigationClose();
  await tapAndExpect({ id: 'Receive' }, { anyVisible: [{ id: 'ReceiveScreen' }] });
  await elementById('ReceiveScreen').waitForDisplayed({ timeout: 30_000 });

  let defaultTabAddress = '';
  try {
    defaultTabAddress = await getAddressFromQRCode('bitcoin');
  } catch {
    // Default tab may not have a QR yet (for example while lightning is still loading).
  }

  await browser.waitUntil(async () => Boolean(await displayedHardwareReceiveTabId()), {
    timeout: 30_000,
    interval: 500,
    timeoutMsg: 'Timed out waiting for hardware receive tab (Tab-hardware or Tab-trezor)',
  });
  const tabId = await displayedHardwareReceiveTabId();
  if (!tabId) throw new Error('Hardware receive tab disappeared');
  await selectHardwareReceiveTab(tabId, defaultTabAddress);

  return getAddressFromQRCode('bitcoin');
}

/** The default tab already has a QR: require a different address after one tab click. */
export async function selectHardwareReceiveTab(tabId: string, defaultTabAddress: string) {
  const tab = elementById(tabId);
  await tab.waitForDisplayed({ timeout: 30_000 });
  await tab.click();
  await browser.waitUntil(
    async () => {
      try {
        const address = await peekQrOnchainAddress();
        return Boolean(address && address !== defaultTabAddress);
      } catch {
        return false;
      }
    },
    {
      timeout: 30_000,
      interval: 500,
      timeoutMsg: 'Timed out waiting for hardware receive address',
    }
  );
}

async function peekQrOnchainAddress(): Promise<string> {
  const qr = elementById('QRCode');
  if (!(await qr.isDisplayed())) return '';
  const uri = (await getAccessibleText(qr)).trim();
  return uri.replace(/^bitcoin:/i, '').replace(/\?.*$/, '');
}

export async function expectHardwareWalletReceivedActivity(sats: number) {
  await doNavigationClose();
  await elementById('ActivityHardware').waitForDisplayed();
  await expectTextWithin('ActivityHardware', formatSats(sats));
  await tapAndExpect({ id: 'ActivityHardware' }, { anyVisible: [{ id: 'HardwareWalletScreen' }] });
  await elementById('HardwareWalletScreen').waitForDisplayed();
  await elementById('Activity-1').waitForDisplayed();
  await expectTextWithin('Activity-1', 'Received');
  await expectTextWithin('Activity-1', formatSats(sats));
}

export async function expectHardwareWalletSentActivity(tag: string) {
  await doNavigationClose();
  await tapAndExpect({ id: 'ActivityHardware' }, { anyVisible: [{ id: 'HardwareWalletScreen' }] });
  await elementById('HardwareWalletScreen').waitForDisplayed();
  await elementById('Activity-1').waitForDisplayed();
  await expectTextWithin('Activity-1', '-');
  await tapAndExpect({ id: 'Activity-1' }, { anyVisible: [{ id: `Tag-${tag}-delete` }] });
  await elementById(`Tag-${tag}-delete`).waitForDisplayed();
}

export async function sendOnchainFromHardwareWallet({
  walletLabel,
  address,
  amountSats,
  tag,
}: {
  walletLabel: string;
  address: string;
  amountSats: number;
  tag?: string;
}) {
  await doNavigationClose();
  await enterGateAddress(address);
  await elementById('ContinueAmount').waitForDisplayed({ timeout: 30_000 });
  await selectSendFundingSource(walletLabel);
  await enterAmount(amountSats);
  await elementById('ContinueAmount').waitForEnabled({ timeout: 30_000 });
  await tapAndExpect(
    { id: 'ContinueAmount' },
    { anyVisible: [{ id: 'GRAB' }], timeout: 120_000 }
  );
  await elementById('GRAB').waitForDisplayed({ timeout: 120_000 });
  if (tag) {
    await addSendTag(tag);
    await sleep(500);
  }
  await confirmGateAction({
    anyVisible: [{ id: 'HardwareSendOpenTrezorConnect' }],
    timeout: 120_000,
  });
  await elementById('HardwareSendOpenTrezorConnect').waitForDisplayed({ timeout: 120_000 });
  await actAndExpect(
    'approve hardware send',
    async () => {
      await tap('HardwareSendOpenTrezorConnect');
      await approveTrezorPromptsUntil(['SendSuccess']);
    },
    { anyVisible: [{ id: 'SendSuccess' }], timeout: 180_000 }
  );
  await elementById('SendSuccess').waitForDisplayed();
  await tapAndExpect({ id: 'Close' }, { anyVisible: [{ id: 'TotalBalance-primary' }] });
}

export async function removeHardwareWalletFromSettings(label: string) {
  await openHardwareWalletSettings();
  await expectHardwareWalletInSettings(label, { visible: true });
  await actAndExpect(
    'request hardware removal',
    () => tapFirstByAccessibilityIdPrefix('HardwareWalletRowDelete_'),
    { anyVisible: [{ id: 'DialogConfirm' }] }
  );
  await tapAndExpect({ id: 'DialogConfirm' }, { all: [{ hidden: { text: label } }] });
  await expectHardwareWalletInSettings(label, { visible: false });
}

async function approveTrezorPromptsUntil(testIds: string[]) {
  const started = Date.now();
  const timeout = 180_000;

  while (Date.now() - started < timeout) {
    if (await isAnyDisplayed(testIds)) {
      return;
    }
    pressTrezorYes();
    await sleep(500);
  }

  throw new Error(`Timed out waiting for Trezor approval (${testIds.join(', ')})`);
}

function pressTrezorYes() {
  try {
    runTrezorEmulatorQuiet(['send-json', JSON.stringify({ type: 'emulator-press-yes' })]);
  } catch {
    // The prompt may not be ready on every polling tick.
  }
}

async function displayedHardwareReceiveTabId(): Promise<string | undefined> {
  for (const testId of HARDWARE_RECEIVE_TAB_IDS) {
    if (await isDisplayed(testId)) {
      return testId;
    }
  }
  return undefined;
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

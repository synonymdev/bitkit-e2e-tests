import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getAppId } from './constants';

export type ProbeTargetType = 'lightningAddress' | 'lnurlCallback' | 'nodeId';

export type ProbeTarget = {
  name: string;
  type: ProbeTargetType;
  required?: boolean;
  amountMsat?: number;
  amountsMsat?: number[];
  address?: string;
  url?: string;
  nodeId?: string;
};

export type ProbeResult = {
  targetName: string;
  targetType: ProbeTargetType;
  probeMode: 'invoice' | 'keysend';
  amountMsat: number;
  amountSats: number;
  required: boolean;
  attempt: number;
  retries: number;
  invoiceFetched: boolean;
  success: boolean;
  durationMs: number;
  bolt11?: string;
  nodeId?: string;
  rawProviderResult?: string;
  error?: string;
};

type LnurlPayResponse = {
  callback?: string;
  minSendable?: number;
  maxSendable?: number;
  status?: string;
  reason?: string;
};

type LnurlInvoiceResponse = {
  pr?: string;
  status?: string;
  reason?: string;
};

const DEFAULT_PROBE_TIMEOUT_SECONDS = 90;
const DEFAULT_PROBE_FETCH_RETRIES = 2;
const DEFAULT_PROBE_FETCH_RETRY_DELAY_MS = 1_000;

const DEFAULT_READINESS_TIMEOUT_MS = 180_000;
const DEFAULT_READINESS_POLL_MS = 5_000;
const DEFAULT_MIN_GRAPH_CHANNELS = 10_000;
const DEFAULT_RESET_SCORES_TIMEOUT_SECONDS = 180;
const DEFAULT_SCORES_SYNC_MAX_AGE_S = 900;
const DEFAULT_PROBE_AMOUNT_PROFILE = 'full';
const PROBE_AMOUNT_PROFILES = {
  small: [1_000_000],
  large: [80_000_000],
  cover: [1_000_000, 25_000_000, 80_000_000],
  full: [1_000_000, 10_000_000, 25_000_000, 50_000_000, 80_000_000],
} as const;
type ProbeAmountProfile = keyof typeof PROBE_AMOUNT_PROFILES;

export type ProbeReadiness = {
  ready: boolean;
  nodeRunning: boolean;
  lifecycle: string;
  peers: number;
  connectedPeers: number;
  channels: number;
  readyChannels: number;
  usableChannels: number;
  outboundCapacitySats: number;
  syncHealthy: boolean;
  nodeId?: string;
  graphNodeCount?: number;
  graphChannelCount?: number;
  latestRgsSyncTimestamp?: number;
  latestPathfindingScoresSyncTimestamp?: number;
};

export function resolveProbeTargets(): ProbeTarget[] {
  const raw = process.env.PROBE_TARGETS_JSON;
  if (!raw) {
    throw new Error('Missing PROBE_TARGETS_JSON env var');
  }

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('PROBE_TARGETS_JSON must be a JSON array');
  }

  return parsed.map(parseProbeTarget);
}

export type ProbeOrder = 'desc' | 'random' | 'config';

export type ProbeQueueEntry = { target: ProbeTarget; amountMsat: number };

export function resolveProbeOrder(): ProbeOrder {
  const raw = process.env.PROBE_ORDER?.toLowerCase();
  if (!raw) return 'config';
  if (raw === 'desc' || raw === 'random' || raw === 'config') return raw;
  throw new Error(`Invalid PROBE_ORDER value: ${raw} (expected desc, random or config)`);
}

export function resolveProbeAmountProfile(): ProbeAmountProfile {
  const profile = process.env.PROBE_AMOUNT_PROFILE ?? DEFAULT_PROBE_AMOUNT_PROFILE;
  if (profile === 'small' || profile === 'large' || profile === 'cover' || profile === 'full') {
    return profile;
  }
  throw new Error(
    `Invalid PROBE_AMOUNT_PROFILE: ${profile}. Expected 'small', 'large', 'cover', or 'full'.`
  );
}

export function buildProbeQueue(targets: ProbeTarget[], order: ProbeOrder): ProbeQueueEntry[] {
  const queue = targets.flatMap((target) => {
    const amounts = expandProbeTargetAmounts(target);
    if (order === 'desc') {
      amounts.sort((a, b) => b - a);
    }
    return amounts.map((amountMsat) => ({ target, amountMsat }));
  });

  if (order === 'random') {
    shuffleInPlace(queue);
  }

  return queue;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function expandProbeTargetAmounts(target: ProbeTarget): number[] {
  const amounts =
    target.amountsMsat ??
    (target.amountMsat
      ? [target.amountMsat]
      : [...PROBE_AMOUNT_PROFILES[resolveProbeAmountProfile()]]);

  return amounts.map((amountMsat) => {
    if (!Number.isInteger(amountMsat) || amountMsat <= 0) {
      throw new Error(`Probe target '${target.name}' has invalid amountMsat '${amountMsat}'`);
    }
    if (amountMsat % 1000 !== 0) {
      throw new Error(
        `Probe target '${target.name}' amountMsat must be whole sats: '${amountMsat}'`
      );
    }
    return amountMsat;
  });
}

export async function fetchBolt11ForProbe(
  target: ProbeTarget,
  amountMsat: number
): Promise<string> {
  const callback =
    target.type === 'lightningAddress' ? await fetchLightningAddressCallback(target) : target.url;

  if (!callback) {
    throw new Error(`Probe target '${target.name}' is missing LNURL callback URL`);
  }

  const url = new URL(callback);
  url.searchParams.set('amount', amountMsat.toString());

  const response = await fetchJson<LnurlInvoiceResponse>(url.toString());
  if (response.status?.toUpperCase() === 'ERROR') {
    throw new Error(response.reason ?? `LNURL invoice request failed for '${target.name}'`);
  }
  if (!response.pr) {
    throw new Error(`LNURL invoice response for '${target.name}' did not include pr`);
  }

  return response.pr;
}

export function probeModeForTargetType(type: ProbeTargetType): 'invoice' | 'keysend' {
  return type === 'nodeId' ? 'keysend' : 'invoice';
}

export function runProbeInvoiceCommand(
  target: ProbeTarget,
  amountMsat: number,
  bolt11: string
): string {
  const amountSats = amountMsat / 1000;
  const method = process.env.PROBE_INVOICE_METHOD ?? 'probeInvoice';
  const timeoutSeconds =
    parsePositiveIntEnv('PROBE_TIMEOUT_SECONDS') ?? DEFAULT_PROBE_TIMEOUT_SECONDS;
  const payload = {
    targetName: target.name,
    bolt11,
    amountMsat,
    amountSats,
    timeoutSeconds,
  };

  return runDevToolsCommand(method, payload, timeoutSeconds);
}

export function runProbeNodeCommand(target: ProbeTarget, amountMsat: number): string {
  const nodeId = target.nodeId;
  if (!nodeId) {
    throw new Error(`Probe target '${target.name}' is missing nodeId`);
  }

  const amountSats = amountMsat / 1000;
  const method = process.env.PROBE_NODE_METHOD ?? 'probeNode';
  const timeoutSeconds =
    parsePositiveIntEnv('PROBE_TIMEOUT_SECONDS') ?? DEFAULT_PROBE_TIMEOUT_SECONDS;
  const payload = {
    targetName: target.name,
    nodeId,
    amountMsat,
    amountSats,
    timeoutSeconds,
  };

  return runDevToolsCommand(method, payload, timeoutSeconds);
}

export function parseProbeCommandSuccess(raw: string): boolean {
  const result = extractContentCallResult(raw);
  if (!result) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null) return false;

  if ('success' in parsed) return parsed.success === true;
  if ('type' in parsed && typeof parsed.type === 'string') {
    return parsed.type === 'Success' || parsed.type.endsWith('.ProbeSuccess');
  }

  return false;
}

export function summarizeProbeCommandFailure(raw: string): string {
  const json = extractContentCallResult(raw);
  if (json) {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  return (
    (raw.match(/\[ERROR\]\s*(.+)/)?.[1]?.trim() ?? raw.trim()) ||
    'Probe command returned a failed result'
  );
}

export function resolveProbeResetScores(): boolean {
  return parseBooleanEnv('PROBE_RESET_SCORES') ?? false;
}

/**
 * Resets the persisted pathfinding scores via devtools and returns the
 * device-clock epoch seconds to be used as a floor for the scores sync
 * timestamp in readiness checks (the sync timestamp persisted in node metrics
 * survives the restart, so only a sync strictly newer than the reset proves
 * the external scores were re-downloaded). The app reports the floor as the
 * moment after the node stop + VSS deletes and before the restart, so any
 * newer sync can only come from the rebuilt node; if the app is too old to
 * report it, falls back to the device time captured before the reset call.
 * The floor uses the device clock because the sync timestamp is also
 * device-generated, making the comparison immune to host/device clock skew.
 */
export async function resetPathfindingScores({
  logPrefix,
}: {
  logPrefix: string;
}): Promise<number> {
  const method = process.env.PROBE_RESET_SCORES_METHOD ?? 'resetScores';
  const timeoutSeconds =
    parsePositiveIntEnv('PROBE_RESET_SCORES_TIMEOUT_SECONDS') ??
    DEFAULT_RESET_SCORES_TIMEOUT_SECONDS;

  console.info(`→ [${logPrefix}] Resetting pathfinding scores (timeout ${timeoutSeconds}s)...`);
  const fallbackFloorS = getDeviceEpochSeconds();
  const raw = runDevToolsCommand(method, {}, timeoutSeconds);
  if (!parseProbeCommandSuccess(raw)) {
    throw new Error(`Pathfinding scores reset failed: ${summarizeProbeCommandFailure(raw)}`);
  }
  const deviceResetAtS = parseResetTimestamp(raw);
  if (deviceResetAtS === null) {
    console.warn(
      `→ [${logPrefix}] Reset result has no timestamp (old app build?); using pre-reset device time as scores sync floor`
    );
  }
  const resetFloorS = deviceResetAtS ?? fallbackFloorS;
  console.info(`→ [${logPrefix}] Pathfinding scores reset done (floor ${resetFloorS})`);
  return resetFloorS;
}

function parseResetTimestamp(raw: string): number | null {
  const result = extractContentCallResult(raw);
  if (!result) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('timestamp' in parsed)) return null;

  const timestamp = parsed.timestamp;
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : null;
}

function getDeviceEpochSeconds(): number {
  const raw = execFileSync('adb', ['shell', 'date', '+%s'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  const epoch = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(epoch) || epoch <= 0) {
    throw new Error(`Failed to read device epoch time: ${raw.trim() || 'empty output'}`);
  }
  return epoch;
}

export function runReadinessCommand(): string {
  const method = process.env.PROBE_READINESS_METHOD ?? 'probeReadiness';
  const command = [
    'content',
    'call',
    '--uri',
    shellQuote(`content://${getAppId()}.devtools`),
    '--method',
    shellQuote(method),
  ].join(' ');

  return execFileSync('adb', ['shell', command], {
    encoding: 'utf8',
    timeout: 30_000,
  });
}

export function parseProbeReadiness(raw: string): ProbeReadiness | null {
  const result = extractContentCallResult(raw);
  if (!result) return null;

  try {
    const parsed: unknown = JSON.parse(result);
    if (isProbeReadinessShape(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function isProbeReadinessShape(value: unknown): value is ProbeReadiness {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProbeReadiness).ready === 'boolean' &&
    typeof (value as ProbeReadiness).nodeRunning === 'boolean'
  );
}

function summarizeReadinessError(raw: string): string {
  const json = extractContentCallResult(raw);
  if (json) {
    try {
      const record = JSON.parse(json) as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message) return record.message;
    } catch {
      // fall through
    }
  }
  return raw.trim().slice(0, 200) || 'unparseable readiness response';
}

export function isProbeReadinessSufficient(
  readiness: ProbeReadiness,
  minGraphChannels: number,
  maxScoresSyncAgeS: number | null = null,
  minScoresSyncTimestamp: number | null = null,
  nowS: number = Date.now() / 1000
): boolean {
  return (
    readiness.ready &&
    readiness.nodeRunning &&
    readiness.connectedPeers > 0 &&
    readiness.usableChannels > 0 &&
    readiness.syncHealthy &&
    (readiness.graphChannelCount ?? 0) >= minGraphChannels &&
    isScoresSyncFresh(readiness, maxScoresSyncAgeS, minScoresSyncTimestamp, nowS)
  );
}

function isScoresSyncFresh(
  readiness: ProbeReadiness,
  maxAgeS: number | null,
  minTimestamp: number | null,
  nowS: number = Date.now() / 1000
): boolean {
  if (maxAgeS === null) return true;
  const timestamp = readiness.latestPathfindingScoresSyncTimestamp;
  if (!timestamp) return false;
  if (nowS - timestamp > maxAgeS) return false;
  // Both timestamps come from the device clock; the floor is captured by the
  // app after the node stop + VSS deletes, so any strictly newer sync can
  // only come from the rebuilt node (post-reset).
  if (minTimestamp !== null && timestamp <= minTimestamp) return false;
  return true;
}

export function summarizeProbeReadiness(readiness: ProbeReadiness): string {
  return [
    `running=${readiness.nodeRunning}`,
    `peers=${readiness.connectedPeers}/${readiness.peers}`,
    `usableChannels=${readiness.usableChannels}`,
    `outboundSats=${readiness.outboundCapacitySats}`,
    `graphChannels=${readiness.graphChannelCount ?? 'n/a'}`,
    `graphNodes=${readiness.graphNodeCount ?? 'n/a'}`,
    `scoresSync=${readiness.latestPathfindingScoresSyncTimestamp ?? 'n/a'}`,
    `syncHealthy=${readiness.syncHealthy}`,
    `ready=${readiness.ready}`,
  ].join(' ');
}

type WaitForProbeReadinessOptions = {
  logPrefix: string;
  requireScoresSync?: boolean;
  /** Device-clock epoch seconds; scores sync must be strictly newer than this (the reset floor reported by the app). */
  minScoresSyncTimestamp?: number | null;
};

export async function waitForProbeReadiness({
  logPrefix,
  requireScoresSync = false,
  minScoresSyncTimestamp = null,
}: WaitForProbeReadinessOptions): Promise<ProbeReadiness> {
  const timeoutMs =
    parsePositiveIntEnv('PROBE_READINESS_TIMEOUT_MS') ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = parsePositiveIntEnv('PROBE_READINESS_POLL_MS') ?? DEFAULT_READINESS_POLL_MS;
  const minGraphChannels =
    parseNonNegativeIntEnv('PROBE_MIN_GRAPH_CHANNELS') ?? DEFAULT_MIN_GRAPH_CHANNELS;
  const maxScoresSyncAgeS = requireScoresSync
    ? (parsePositiveIntEnv('PROBE_SCORES_SYNC_MAX_AGE_S') ?? DEFAULT_SCORES_SYNC_MAX_AGE_S)
    : null;
  const minSyncTimestamp = requireScoresSync ? minScoresSyncTimestamp : null;

  console.info(
    `→ [${logPrefix}] Waiting for probe readiness (timeout ${timeoutMs / 1000}s, minGraphChannels ${minGraphChannels}, requireScoresSync ${requireScoresSync})...`
  );

  const deadline = Date.now() + timeoutMs;
  let lastSummary = 'no readiness response';

  while (Date.now() < deadline) {
    let raw = '';
    try {
      raw = runReadinessCommand();
    } catch (error) {
      lastSummary = error instanceof Error ? error.message : String(error);
    }

    const readiness = raw ? parseProbeReadiness(raw) : null;
    if (readiness) {
      lastSummary = summarizeProbeReadiness(readiness);
      // Use the device clock for the scores sync age check so it is measured
      // against the same clock that produced the sync timestamp.
      const nowS = maxScoresSyncAgeS !== null ? getDeviceEpochSeconds() : Date.now() / 1000;
      if (
        isProbeReadinessSufficient(
          readiness,
          minGraphChannels,
          maxScoresSyncAgeS,
          minSyncTimestamp,
          nowS
        )
      ) {
        console.info(`→ [${logPrefix}] Probe readiness satisfied: ${lastSummary}`);
        return readiness;
      }
    } else if (raw) {
      lastSummary = summarizeReadinessError(raw);
    }

    console.info(
      `→ [${logPrefix}] Not ready yet (${lastSummary}), polling again in ${pollMs / 1000}s...`
    );
    await delay(pollMs);
  }

  throw new Error(`Probe readiness not reached within ${timeoutMs / 1000}s: ${lastSummary}`);
}

export function writeProbeArtifacts(
  results: ProbeResult[],
  readiness?: ProbeReadiness | null
): void {
  const artifactsDir = resolveArtifactsDir();
  fs.mkdirSync(artifactsDir, { recursive: true });

  const jsonPath = path.join(artifactsDir, 'probe-results.json');
  const reportPath = path.join(artifactsDir, 'probe-report.md');
  const report = renderProbeReport(results, readiness);

  fs.writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(reportPath, report);

  if (readiness) {
    const readinessPath = path.join(artifactsDir, 'probe-readiness.json');
    fs.writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## Attempt ${resolveAttempt()}\n\n${report}\n`
    );
  }
}

export function renderProbeReport(
  results: ProbeResult[],
  readiness?: ProbeReadiness | null
): string {
  const failedRequired = results.filter((it) => it.required && !it.success);
  const lines = [
    '# Lightning Probe Report',
    '',
    `Required failures: ${failedRequired.length}`,
    `Probe order: ${probeOrderForReport()}`,
    `Scores reset: ${scoresResetForReport()}`,
    `Readiness at probe start: ${readiness ? summarizeProbeReadiness(readiness) : 'not captured'}`,
    '',
    '| Target | Type | Amount sats | Required | Fetch | Probe | Retries | Duration ms | Failure |',
    '| --- | --- | ---: | --- | --- | --- | ---: | ---: | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        result.targetName,
        result.probeMode,
        result.amountSats.toString(),
        result.required ? 'yes' : 'no',
        formatFetchCell(result),
        result.success ? '✅' : '❌',
        result.retries.toString(),
        result.durationMs.toString(),
        result.success ? '' : formatFailureCell(result.error ?? ''),
      ].join(' | ')} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

// Report rendering runs from the spec's finally block, so it must never throw
// and mask the original test failure (e.g. an invalid PROBE_ORDER value).
function probeOrderForReport(): string {
  try {
    return resolveProbeOrder();
  } catch {
    return `invalid (${process.env.PROBE_ORDER})`;
  }
}

function scoresResetForReport(): string {
  try {
    return String(resolveProbeResetScores());
  } catch {
    return `invalid (${process.env.PROBE_RESET_SCORES})`;
  }
}

function parseProbeTarget(value: unknown): ProbeTarget {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Each probe target must be an object');
  }

  const target = value as Partial<ProbeTarget>;
  if (!target.name || typeof target.name !== 'string') {
    throw new Error('Each probe target must define a string name');
  }
  if (
    target.type !== 'lightningAddress' &&
    target.type !== 'lnurlCallback' &&
    target.type !== 'nodeId'
  ) {
    throw new Error(`Probe target '${target.name}' has unsupported type '${String(target.type)}'`);
  }
  if (target.type === 'lightningAddress' && !target.address) {
    throw new Error(`Probe target '${target.name}' must define address`);
  }
  if (target.type === 'lnurlCallback' && !target.url) {
    throw new Error(`Probe target '${target.name}' must define url`);
  }
  if (target.type === 'nodeId' && !target.nodeId) {
    throw new Error(`Probe target '${target.name}' must define nodeId`);
  }

  return {
    name: target.name,
    type: target.type,
    required: target.required ?? true,
    amountMsat: target.amountMsat,
    amountsMsat: target.amountsMsat,
    address: target.address,
    url: target.url,
    nodeId: target.nodeId,
  };
}

async function fetchLightningAddressCallback(target: ProbeTarget): Promise<string> {
  const address = target.address ?? '';
  const [username, domain] = address.split('@');
  if (!username || !domain) {
    throw new Error(`Invalid Lightning Address for '${target.name}': '${address}'`);
  }

  const metadataUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}`;
  const response = await fetchJson<LnurlPayResponse>(metadataUrl);
  if (response.status?.toUpperCase() === 'ERROR') {
    throw new Error(response.reason ?? `LNURL metadata request failed for '${target.name}'`);
  }
  if (!response.callback) {
    throw new Error(`LNURL metadata for '${target.name}' did not include callback`);
  }

  return response.callback;
}

async function fetchJson<T>(url: string): Promise<T> {
  const maxRetries = parseNonNegativeIntEnv('PROBE_FETCH_RETRIES') ?? DEFAULT_PROBE_FETCH_RETRIES;
  const retryDelayMs =
    parseNonNegativeIntEnv('PROBE_FETCH_RETRY_DELAY_MS') ?? DEFAULT_PROBE_FETCH_RETRY_DELAY_MS;
  let lastError: Error | null = null;

  for (let retry = 0; retry <= maxRetries; retry++) {
    try {
      return await fetchJsonOnce<T>(url);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (retry < maxRetries && retryDelayMs > 0) {
      await delay(retryDelayMs);
    }
  }

  throw new Error(
    `${lastError?.message ?? `Failed to fetch ${url}`} after ${maxRetries + 1} attempts`
  );
}

async function fetchJsonOnce<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}${formatResponseBody(text)}`);
  }

  return JSON.parse(text) as T;
}

function extractContentCallResult(raw: string): string | null {
  return raw.match(/result=(\{[\s\S]*\})\}\]\s*$/)?.[1] ?? null;
}

function parsePositiveIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return value;
}

export function parseNonNegativeIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return value;
}

function parseBooleanEnv(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new Error(`Invalid ${name} value: ${raw} (expected true or false)`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatResponseBody(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return `: ${normalized.slice(0, 300)}`;
}

function resolveArtifactsDir(): string {
  const attempt = process.env.ATTEMPT;
  return attempt ? path.join('artifacts', `attempt-${attempt}`) : 'artifacts';
}

function resolveAttempt(): string {
  return process.env.ATTEMPT ?? '1';
}

function sanitizeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function formatFailureCell(error: string): string {
  const sanitized = sanitizeMarkdownCell(error);
  if (!sanitized) return '';
  if (sanitized.includes('`')) {
    return `\`${sanitized.replace(/`/g, "'")}\``;
  }
  return `\`${sanitized}\``;
}

function formatFetchCell(result: ProbeResult): string {
  if (result.probeMode === 'keysend') return 'n/a';
  return result.invoiceFetched ? 'ok' : 'failed';
}

function runDevToolsCommand(
  method: string,
  payload: Record<string, unknown>,
  timeoutSeconds: number
): string {
  const command = [
    'content',
    'call',
    '--uri',
    shellQuote(`content://${getAppId()}.devtools`),
    '--method',
    shellQuote(method),
    '--arg',
    shellQuote(JSON.stringify(payload)),
  ].join(' ');

  try {
    return execFileSync('adb', ['shell', command], {
      encoding: 'utf8',
      timeout: (timeoutSeconds + 10) * 1000,
    });
  } catch (error) {
    throw new Error(formatDevToolsCommandError(method, error));
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function formatDevToolsCommandError(method: string, error: unknown): string {
  if (!(error instanceof Error)) {
    return `DevTools command '${method}' failed: ${String(error)}`;
  }

  const details = error as Error & {
    status?: number;
    signal?: NodeJS.Signals;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
  };
  const output = [
    details.stdout ? `stdout: ${details.stdout.toString().trim()}` : '',
    details.stderr ? `stderr: ${details.stderr.toString().trim()}` : '',
    details.status !== undefined ? `status: ${details.status}` : '',
    details.signal ? `signal: ${details.signal}` : '',
  ].filter(Boolean);

  return [`DevTools command '${method}' failed: ${error.message}`, ...output].join('\n');
}

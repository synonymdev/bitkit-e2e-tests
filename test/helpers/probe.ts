import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getAppId } from './constants';

export type ProbeTargetType = 'lightningAddress' | 'lnurlCallback';

export type ProbeTarget = {
  name: string;
  type: ProbeTargetType;
  required?: boolean;
  amountMsat?: number;
  amountsMsat?: number[];
  address?: string;
  url?: string;
};

export type ProbeResult = {
  targetName: string;
  targetType: ProbeTargetType;
  amountMsat: number;
  amountSats: number;
  required: boolean;
  attempt: number;
  retries: number;
  invoiceFetched: boolean;
  success: boolean;
  durationMs: number;
  bolt11?: string;
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

export function expandProbeTargetAmounts(target: ProbeTarget): number[] {
  const amounts = target.amountsMsat ?? (target.amountMsat ? [target.amountMsat] : []);
  if (amounts.length === 0) {
    throw new Error(`Probe target '${target.name}' must define amountMsat or amountsMsat`);
  }

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

export function runProbeCommand(target: ProbeTarget, amountMsat: number, bolt11: string): string {
  const amountSats = amountMsat / 1000;
  const method = process.env.PROBE_CONTENT_METHOD ?? 'probeInvoice';
  const timeoutSeconds =
    parsePositiveIntEnv('PROBE_TIMEOUT_SECONDS') ?? DEFAULT_PROBE_TIMEOUT_SECONDS;
  const payload = {
    targetName: target.name,
    bolt11,
    amountMsat,
    amountSats,
    timeoutSeconds,
  };
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

  return execFileSync('adb', ['shell', command], {
    encoding: 'utf8',
    timeout: (timeoutSeconds + 10) * 1000,
  });
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
  const result = extractContentCallResult(raw);
  if (result) {
    try {
      const parsed: unknown = JSON.parse(result);
      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const message = parsed.message;
        if (typeof message === 'string' && message.length > 0) return message;
      }
    } catch {
      return 'Probe command returned an unparseable result';
    }
  }

  const adbError = raw.match(/\[ERROR\]\s*(.+)/);
  return adbError?.[1]?.trim() || 'Probe command returned a failed result';
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
  return summarizeProbeCommandFailure(raw);
}

export function isProbeReadinessSufficient(
  readiness: ProbeReadiness,
  minGraphChannels: number
): boolean {
  return (
    readiness.ready &&
    readiness.nodeRunning &&
    readiness.connectedPeers > 0 &&
    readiness.usableChannels > 0 &&
    readiness.syncHealthy &&
    (readiness.graphChannelCount ?? 0) >= minGraphChannels
  );
}

export function summarizeProbeReadiness(readiness: ProbeReadiness): string {
  return [
    `running=${readiness.nodeRunning}`,
    `peers=${readiness.connectedPeers}/${readiness.peers}`,
    `usableChannels=${readiness.usableChannels}`,
    `outboundSats=${readiness.outboundCapacitySats}`,
    `graphChannels=${readiness.graphChannelCount ?? 'n/a'}`,
    `graphNodes=${readiness.graphNodeCount ?? 'n/a'}`,
    `syncHealthy=${readiness.syncHealthy}`,
    `ready=${readiness.ready}`,
  ].join(' ');
}

type WaitForProbeReadinessOptions = {
  logPrefix: string;
};

export async function waitForProbeReadiness({
  logPrefix,
}: WaitForProbeReadinessOptions): Promise<ProbeReadiness> {
  const timeoutMs = parsePositiveIntEnv('PROBE_READINESS_TIMEOUT_MS') ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = parsePositiveIntEnv('PROBE_READINESS_POLL_MS') ?? DEFAULT_READINESS_POLL_MS;
  const minGraphChannels =
    parseNonNegativeIntEnv('PROBE_MIN_GRAPH_CHANNELS') ?? DEFAULT_MIN_GRAPH_CHANNELS;

  console.info(
    `→ [${logPrefix}] Waiting for probe readiness (timeout ${timeoutMs / 1000}s, minGraphChannels ${minGraphChannels})...`
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
      if (isProbeReadinessSufficient(readiness, minGraphChannels)) {
        console.info(`→ [${logPrefix}] Probe readiness satisfied: ${lastSummary}`);
        return readiness;
      }
    } else if (raw) {
      lastSummary = summarizeReadinessError(raw);
    }

    console.info(`→ [${logPrefix}] Not ready yet (${lastSummary}), polling again in ${pollMs / 1000}s...`);
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
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## Attempt ${resolveAttempt()}\n\n${report}\n`);
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
    `Readiness at probe start: ${readiness ? summarizeProbeReadiness(readiness) : 'not captured'}`,
    '',
    '| Target | Amount sats | Required | Invoice | Probe | Retries | Duration ms | Error |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        result.targetName,
        result.amountSats.toString(),
        result.required ? 'yes' : 'no',
        result.invoiceFetched ? 'ok' : 'failed',
        result.success ? '✅' : '❌',
        result.retries.toString(),
        result.durationMs.toString(),
        sanitizeMarkdownCell(result.error ?? ''),
      ].join(' | ')} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

function parseProbeTarget(value: unknown): ProbeTarget {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Each probe target must be an object');
  }

  const target = value as Partial<ProbeTarget>;
  if (!target.name || typeof target.name !== 'string') {
    throw new Error('Each probe target must define a string name');
  }
  if (target.type !== 'lightningAddress' && target.type !== 'lnurlCallback') {
    throw new Error(`Probe target '${target.name}' has unsupported type '${target.type}'`);
  }
  if (target.type === 'lightningAddress' && !target.address) {
    throw new Error(`Probe target '${target.name}' must define address`);
  }
  if (target.type === 'lnurlCallback' && !target.url) {
    throw new Error(`Probe target '${target.name}' must define url`);
  }

  return {
    name: target.name,
    type: target.type,
    required: target.required ?? true,
    amountMsat: target.amountMsat,
    amountsMsat: target.amountsMsat,
    address: target.address,
    url: target.url,
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

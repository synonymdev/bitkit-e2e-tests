import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Backend, InventoryCase, Platform } from './inventory.ts';

export type Identity = {
  runId: string;
  platform: Platform;
  backend: Backend;
  appSha: string;
  e2eSha: string;
  artifactDigest: string;
  backendRevision: string;
  variant: string;
};
export type Plan = {
  schemaVersion: 1;
  id: string;
  identity: Identity;
  inventoryDigest: string;
  pack: string;
  maxAttempts: number;
  cases: InventoryCase[];
  expected: string[];
};
export type Event = {
  id: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
};
export type WorkerReport = {
  schemaVersion: 1;
  planId: string;
  attempt: number;
  cid: string;
  startedAt: string;
  finishedAt?: string;
  failures: number;
  errors: string[];
  events: Event[];
};

export function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

export function createPlan(
  cases: InventoryCase[],
  identity: Identity,
  inventoryDigest: string,
  pack: string,
  maxAttempts = 1
): Plan {
  if (
    !['ios', 'android'].includes(identity.platform) ||
    !['local', 'regtest', 'mainnet'].includes(identity.backend) ||
    Object.values(identity).some((value) => typeof value !== 'string' || !value.trim()) ||
    !/^[a-f0-9]{40}$/.test(identity.appSha) ||
    !/^[a-f0-9]{40}$/.test(identity.e2eSha) ||
    !/^[a-f0-9]{64}$/.test(identity.artifactDigest) ||
    !/^[a-f0-9]{64}$/.test(inventoryDigest) ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 3
  ) {
    throw new Error('Invalid or incomplete run identity/attempt policy');
  }
  const selected = cases.filter((item) => {
    const assignment = item.platforms[identity.platform];
    return (
      assignment.backend === identity.backend && (pack === 'nightly' || assignment.pack === pack)
    );
  });
  const expected = selected
    .filter((item) => ['required', 'gap'].includes(item.platforms[identity.platform].disposition))
    .map((item) => item.id)
    .sort();
  if (!expected.length)
    throw new Error(`No expected cases for ${identity.platform}/${identity.backend}/${pack}`);
  if (new Set(expected).size !== expected.length) throw new Error('Duplicate expected case ID');
  const data = {
    schemaVersion: 1 as const,
    identity,
    inventoryDigest,
    pack,
    maxAttempts,
    cases: selected,
    expected,
  };
  return { ...data, id: digest(JSON.stringify(data)) };
}

export function validatePlan(plan: Plan): void {
  const rebuilt = createPlan(
    plan.cases,
    plan.identity,
    plan.inventoryDigest,
    plan.pack,
    plan.maxAttempts
  );
  if (
    rebuilt.id !== plan.id ||
    JSON.stringify(rebuilt.expected) !== JSON.stringify(plan.expected)
  ) {
    throw new Error('Run plan changed or is invalid');
  }
}

export function reconcile(plan: Plan, reports: WorkerReport[]) {
  validatePlan(plan);
  const problems: string[] = [];
  const expected = new Set(plan.expected);
  const observations = new Map<string, { attempt: number; event: Event }[]>();
  const workers = new Set<string>();
  const executions = new Set<string>();
  let firstFailure = false;
  const finalAttempt = Math.max(1, ...reports.map((r) => r.attempt));
  if (!reports.length)
    problems.push('No worker reports: tests never started or reports are missing');
  for (const report of reports) {
    if (
      report.schemaVersion !== 1 ||
      report.planId !== plan.id ||
      !Number.isInteger(report.attempt) ||
      report.attempt < 1 ||
      report.attempt > plan.maxAttempts ||
      !report.cid ||
      !Array.isArray(report.events) ||
      !Array.isArray(report.errors) ||
      !Number.isInteger(report.failures) ||
      report.failures < 0
    ) {
      problems.push('Invalid worker report or mismatched run/platform/backend/source identity');
      continue;
    }
    const worker = `${report.attempt}/${report.cid}`;
    if (workers.has(worker)) problems.push(`Duplicate worker report: ${worker}`);
    workers.add(worker);
    if (!report.finishedAt) problems.push(`Interrupted worker: ${worker}`);
    firstFailure ||= report.failures > 0 || report.errors.length > 0;
    if (report.attempt === finalAttempt && (report.failures || report.errors.length)) {
      problems.push(`Final attempt failed: ${worker} (${report.errors.join('; ')})`);
    }
    for (const event of report.events) {
      if (
        !expected.has(event.id) ||
        !['passed', 'failed', 'skipped'].includes(event.status) ||
        !Number.isFinite(event.durationMs) ||
        event.durationMs < 0
      ) {
        problems.push(`Unexpected or invalid test event: ${event.id}`);
        continue;
      }
      const execution = `${report.attempt}/${event.id}`;
      if (executions.has(execution)) problems.push(`Duplicate case execution: ${execution}`);
      executions.add(execution);
      const history = observations.get(event.id) ?? [];
      history.push({ attempt: report.attempt, event });
      observations.set(event.id, history);
    }
  }
  const results = plan.expected.map((id) => {
    const history = (observations.get(id) ?? []).sort((a, b) => a.attempt - b.attempt);
    let status = 'missing';
    let previouslyPassed = false;
    for (const { attempt, event } of history) {
      firstFailure ||= event.status === 'failed';
      if (event.status === 'skipped') {
        if (!previouslyPassed) {
          problems.push(`Unexpected skip: ${id} (attempt ${attempt})`);
          status = 'unexpected-skip';
        }
      } else {
        status = event.status;
        previouslyPassed = event.status === 'passed';
      }
    }
    if (status !== 'passed') problems.push(`${id}: ${status}`);
    return { id, status, firstAttempt: history[0]?.event.status ?? 'missing', history };
  });
  const dispositions = plan.cases.filter(
    (item) => item.platforms[plan.identity.platform].disposition !== 'required'
  );
  for (const item of dispositions) {
    if (item.platforms[plan.identity.platform].disposition === 'gap')
      problems.push(`Unresolved coverage gap: ${item.id}`);
  }
  return {
    schemaVersion: 1,
    planId: plan.id,
    identity: plan.identity,
    pack: plan.pack,
    status: problems.length ? 'incomplete' : 'passed',
    firstFailure,
    expectedCount: plan.expected.length,
    passedCount: results.filter((r) => r.status === 'passed').length,
    durationMs: reports
      .flatMap((r) => r.events ?? [])
      .reduce((sum, e) => sum + (e.durationMs || 0), 0),
    problems,
    results,
    dispositions,
  };
}

export function markdownReport(result: ReturnType<typeof reconcile>): string {
  return [
    `## E2E ${result.pack}: ${result.status}`,
    '',
    `${result.identity.platform} / ${result.identity.backend} — ${result.passedCount}/${result.expectedCount} expected cases passed.`,
    `First-attempt failure observed: ${result.firstFailure ? 'yes' : 'no'}.`,
    '',
    `Run: \`${result.identity.runId}\`; app: \`${result.identity.appSha}\`; tests: \`${result.identity.e2eSha}\`.`,
    '',
    '| Case | Result | First attempt |',
    '| --- | --- | --- |',
    ...result.results.map((r) => `| ${r.id} | ${r.status} | ${r.firstAttempt} |`),
    '',
    ...result.problems.map((p) => `- ${p}`),
    '',
    ...result.dispositions.map((item) => {
      const entry = item.platforms[result.identity.platform];
      return `- ${item.id}: **${entry.disposition}** — ${entry.reason} (${entry.reference})`;
    }),
    '',
  ].join('\n');
}

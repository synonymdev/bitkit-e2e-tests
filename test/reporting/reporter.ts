import fs from 'node:fs';
import path from 'node:path';
import WDIOReporter, { type RunnerStats, type TestStats } from '@wdio/reporter';
import { caseId } from './inventory.ts';
import { digest, validatePlan, writeJson, type Plan, type WorkerReport } from './report.ts';

export default class InventoryReporter extends WDIOReporter {
  private plan: Plan;
  private report?: WorkerReport;
  private file?: string;

  constructor(options: Record<string, unknown>) {
    super({ ...options, stdout: false });
    this.plan = JSON.parse(fs.readFileSync(process.env.E2E_PLAN!, 'utf8'));
    validatePlan(this.plan);
    if (
      this.plan.identity.platform !== process.env.PLATFORM ||
      this.plan.identity.backend !== (process.env.BACKEND || 'local') ||
      this.plan.inventoryDigest !== digest(fs.readFileSync('test/inventory.json', 'utf8'))
    ) {
      throw new Error('Run plan does not match the executing platform/backend/inventory');
    }
  }

  onRunnerStart(runner: RunnerStats) {
    const attempt = Number(process.env.ATTEMPT || '1');
    if (!Number.isInteger(attempt) || attempt < 1 || attempt > this.plan.maxAttempts) {
      throw new Error('Attempt is outside the declared run policy');
    }
    if (!/^[\w-]+$/.test(runner.cid)) throw new Error('Invalid worker ID');
    this.file = path.join(
      path.dirname(process.env.E2E_PLAN!),
      'workers',
      `attempt-${attempt}-${runner.cid}.json`
    );
    if (fs.existsSync(this.file))
      throw new Error('Refusing to overwrite an existing worker report');
    this.report = {
      schemaVersion: 1,
      planId: this.plan.id,
      attempt,
      cid: runner.cid,
      startedAt: new Date().toISOString(),
      failures: 0,
      errors: [],
      events: [],
    };
    this.flush();
  }

  private record(test: TestStats, status: 'passed' | 'failed' | 'skipped') {
    if (!this.report) throw new Error('Test event arrived before runner start');
    try {
      this.report.events.push({ id: caseId(test.title), status, durationMs: test.duration || 0 });
    } catch (error) {
      this.report.errors.push(String(error));
    }
    this.flush();
  }

  onTestPass(test: TestStats) {
    this.record(test, 'passed');
  }
  onTestFail(test: TestStats) {
    this.record(test, 'failed');
  }
  onTestSkip(test: TestStats) {
    this.record(test, 'skipped');
  }

  onRunnerEnd(runner: RunnerStats) {
    if (!this.report) throw new Error('Runner ended without starting');
    this.report.failures = runner.failures ?? 0;
    if (runner.error) this.report.errors.push(runner.error);
    this.report.finishedAt = new Date().toISOString();
    this.flush();
  }

  private flush() {
    if (this.file && this.report) writeJson(this.file, this.report);
  }
}

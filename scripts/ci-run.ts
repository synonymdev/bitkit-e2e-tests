import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  loadInventory,
  validateInventory,
  type Platform,
  type Backend,
} from '../test/reporting/inventory.ts';
import { executionIdentity, assertExecutionIdentity } from '../test/reporting/identity.ts';
import {
  createPlan,
  digest,
  writeJson,
  reconcile,
  reconcileAttempts,
  markdownReport,
  type Plan,
  type WorkerReport,
  type AttemptReceipt,
} from '../test/reporting/report.ts';

async function runProcess(runner: string, args: string[], env: NodeJS.ProcessEnv, log: string) {
  const output = fs.createWriteStream(log);
  const child = spawn(runner, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let cancelled = false;
  let timedOut = false;
  let forceKill: ReturnType<typeof setTimeout> | undefined;
  const kill = (signal: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error: any) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  };
  const stop = () => {
    kill('SIGTERM');
    forceKill = setTimeout(() => kill('SIGKILL'), 5000);
  };
  const interrupt = () => {
    cancelled = true;
    stop();
  };
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  const timer = setTimeout(
    () => {
      timedOut = true;
      stop();
    },
    40 * 60 * 1000
  );
  child.stdout?.on('data', (data) => {
    process.stdout.write(data);
    output.write(data);
  });
  child.stderr?.on('data', (data) => {
    process.stderr.write(data);
    output.write(data);
  });
  child.on('error', (error) => output.write(String(error) + '\n'));
  const status = await new Promise<number>((resolve) =>
    child.on('close', (code) => resolve(code ?? 1))
  );
  clearTimeout(timer);
  if (forceKill) clearTimeout(forceKill);
  // Also terminate descendants that outlived the runner itself.
  kill('SIGKILL');
  process.removeListener('SIGTERM', interrupt);
  process.removeListener('SIGINT', interrupt);
  await new Promise<void>((resolve) => output.end(resolve));
  return { status: cancelled || timedOut ? 1 : status, cancelled };
}

function artifactHash(directory: string): string {
  const hash = crypto.createHash('sha256');
  function visit(relative: string) {
    const filename = path.join(directory, relative);
    const stat = fs.lstatSync(filename);
    hash.update(relative + '\0');
    if (stat.isSymbolicLink()) hash.update('link\0' + fs.readlinkSync(filename));
    else if (stat.isDirectory())
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
    else hash.update(fs.readFileSync(filename));
  }
  visit('');
  return hash.digest('hex');
}
const command = process.argv[2];
const planFile = process.env.E2E_PLAN || 'artifacts/reporting/plan.json';
const directory = path.dirname(planFile);
function workers(): WorkerReport[] {
  const dir = path.join(directory, 'workers');
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    : [];
}
function receipts(): AttemptReceipt[] {
  return fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((f) => /^attempt-\d+\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(fs.readFileSync(path.join(directory, f), 'utf8')))
    : [];
}
function summary(plan: Plan) {
  const result = reconcileAttempts(plan, workers(), receipts());
  writeJson(path.join(directory, 'summary.json'), result);
  const markdown =
    markdownReport(result) +
    `\nAttempts: ${result.attemptsUsed}/${result.maxAttempts}.\n\n` +
    result.attempts
      .map(
        (a) =>
          `- Attempt ${a.attempt}: ${a.passed ? 'passed' : 'failed/incomplete'}; runner exit ${a.exitCode ?? 'missing'}${a.problems.length ? '; ' + a.problems.join('; ') : ''}`
      )
      .join('\n') +
    '\n';
  fs.writeFileSync(path.join(directory, 'summary.md'), markdown);
  console.info(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  return result;
}
try {
  if (command === 'prepare') {
    if (fs.existsSync(planFile)) throw Error('Plan exists: use a fresh run directory');
    const inventory = loadInventory(process.cwd());
    validateInventory(process.cwd(), inventory);
    const platform = process.env.PLATFORM as Platform,
      backend = (process.env.BACKEND || 'local') as Backend;
    const ids: string[] = process.env.E2E_CASE_TAG
      ? [process.env.E2E_CASE_TAG.replace(/^@/, '')]
      : JSON.parse(process.env.E2E_CASE_IDS || '[]');
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
      throw Error('Empty or duplicate case selection');
    const cases = inventory.cases.filter((c) => ids.includes(c.id));
    if (
      cases.length !== ids.length ||
      cases.some(
        (c) =>
          c.kind !== 'test' ||
          c.platforms[platform]?.disposition !== 'required' ||
          c.platforms[platform]?.backend !== backend
      )
    )
      throw Error('Selection contains unknown, unavailable or wrong-backend cases');
    const metadata = JSON.parse(fs.readFileSync('aut/e2e-build.json', 'utf8'));
    if (
      metadata.appSha !== process.env.E2E_APP_SHA ||
      metadata.backend !== backend ||
      metadata.platform !== platform
    )
      throw Error('Downloaded build does not match selected app/platform/backend');
    const artifact = artifactHash(
      path.join(
        'aut',
        process.env.AUT_FILENAME || (platform === 'ios' ? 'bitkit.app' : 'bitkit_e2e.apk')
      )
    );
    process.env.E2E_ARTIFACT_DIGEST = artifact;
    if (process.env.GITHUB_ENV)
      fs.appendFileSync(process.env.GITHUB_ENV, `E2E_ARTIFACT_DIGEST=${artifact}\n`);
    const plan = createPlan(
      cases,
      executionIdentity(platform, backend),
      digest(fs.readFileSync('test/inventory.json', 'utf8')),
      'selected',
      3
    );
    writeJson(planFile, plan);
    fs.writeFileSync(
      path.join(directory, 'grep.txt'),
      `(?:^| )@(?:${plan.expected.join('|')})(?=[ ,]|$)\n`
    );
    // Only load selected spec files, avoiding unrelated fixture hooks and environment requirements.
    writeJson(path.join(directory, 'specs.json'), [...new Set(cases.map((c) => c.file))]);
  } else {
    const plan: Plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    assertExecutionIdentity(plan);
    if (command === 'run' || command === 'attempt') {
      const currentAttempt = command === 'attempt' ? Number(process.env.ATTEMPT) : 1;
      if (
        !Number.isInteger(currentAttempt) ||
        currentAttempt < 1 ||
        currentAttempt > plan.maxAttempts
      )
        throw Error('Invalid attempt');
      if (receipts().length !== currentAttempt - 1)
        throw Error('Unexpected attempt receipts; refusing to reuse another execution');
      if (currentAttempt > 1 && reconcileAttempts(plan, workers(), receipts()).status === 'passed')
        throw Error('Previous attempt already passed');
      const specs: string[] = JSON.parse(
        fs.readFileSync(path.join(directory, 'specs.json'), 'utf8')
      );
      const grep = fs.readFileSync(path.join(directory, 'grep.txt'), 'utf8').trim();
      const runner = plan.identity.platform === 'ios' ? './ci_run_ios.sh' : './ci_run_android.sh';
      for (
        let attempt = currentAttempt;
        attempt <= (command === 'attempt' ? currentAttempt : plan.maxAttempts);
        attempt++
      ) {
        const receipt: AttemptReceipt = { attempt, startedAt: new Date().toISOString() };
        const file = path.join(directory, `attempt-${attempt}.json`);
        writeJson(file, receipt);
        const args = specs.flatMap((spec) => ['--spec', spec]).concat(['--mochaOpts.grep', grep]);
        const child = await runProcess(
          runner,
          args,
          { ...process.env, ATTEMPT: String(attempt), E2E_PLAN: planFile },
          path.join(directory, `attempt-${attempt}-runner.log`)
        );
        receipt.finishedAt = new Date().toISOString();
        receipt.exitCode = child.status ?? 1;
        writeJson(file, receipt);
        const result = reconcile(
          plan,
          workers().filter((w) => w.attempt === attempt)
        );
        writeJson(path.join(directory, `attempt-${attempt}-summary.json`), {
          ...result,
          runnerExit: receipt.exitCode,
        });
        if (child.cancelled || (receipt.exitCode === 0 && result.status === 'passed')) break;
        console.error(
          `Attempt ${attempt} failed; evidence retained in ${directory} and artifacts/attempt-${attempt}`
        );
      }
    } else if (command !== 'report') throw Error('Usage: ci-run.ts prepare|run|attempt|report');
    if (summary(plan).status !== 'passed') process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

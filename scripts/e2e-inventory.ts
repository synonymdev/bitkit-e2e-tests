import fs from 'node:fs';
import path from 'node:path';
import { assertExecutionIdentity, executionIdentity } from '../test/reporting/identity.ts';
import { parseArgs } from 'node:util';
import {
  loadInventory,
  validateInventory,
  type Backend,
  type Platform,
} from '../test/reporting/inventory.ts';
import {
  createPlan,
  digest,
  markdownReport,
  reconcile,
  writeJson,
  type Plan,
  type WorkerReport,
} from '../test/reporting/report.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    platform: { type: 'string' },
    backend: { type: 'string' },
    pack: { type: 'string' },
    plan: { type: 'string', default: 'artifacts/reporting/plan.json' },
  },
});
const root = process.cwd();
const command = positionals[0];
try {
  if (command === 'check' || command === 'plan') {
    const inventory = loadInventory(root);
    const discovered = validateInventory(root, inventory);
    console.info(`Inventory accounts for ${discovered.length} cases on both platforms.`);
    if (command === 'plan') {
      if (fs.existsSync(values.plan!))
        throw new Error('Plan already exists; use a fresh run directory');
      const plan = createPlan(
        inventory.cases,
        executionIdentity(values.platform as Platform, values.backend as Backend),
        digest(fs.readFileSync('test/inventory.json', 'utf8')),
        values.pack!,
        Number(process.env.E2E_MAX_ATTEMPTS || '1')
      );
      writeJson(values.plan!, plan);
      const grep = `(?:^| )@(?:${plan.expected.join('|')})(?=[ ,]|$)`;
      fs.writeFileSync(path.join(path.dirname(values.plan!), 'grep.txt'), grep + '\n');
      console.info(`Planned ${plan.expected.length} cases; plan ${plan.id}`);
    }
  } else if (command === 'report') {
    const plan: Plan = JSON.parse(fs.readFileSync(values.plan!, 'utf8'));
    assertExecutionIdentity(plan);
    const directory = path.join(path.dirname(values.plan!), 'workers');
    const reports: WorkerReport[] = fs.existsSync(directory)
      ? fs
          .readdirSync(directory)
          .filter((file) => file.endsWith('.json'))
          .sort()
          .map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')))
      : [];
    const result = reconcile(plan, reports);
    writeJson(path.join(path.dirname(values.plan!), 'summary.json'), result);
    const markdown = markdownReport(result);
    fs.writeFileSync(path.join(path.dirname(values.plan!), 'summary.md'), markdown);
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    console.info(markdown);
    if (result.status !== 'passed') process.exitCode = 1;
  } else {
    throw new Error(
      'Usage: e2e-inventory.ts check | plan --platform ios|android --backend local|regtest|mainnet --pack NAME [--plan FILE] | report [--plan FILE]'
    );
  }
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}

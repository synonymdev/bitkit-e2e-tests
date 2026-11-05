import fs from 'node:fs';
import { validatePlan, type Plan } from './report.ts';
import { assertExecutionIdentity } from './identity.ts';

export function selectedSpecs(file: string): string[] {
  const plan: Plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  validatePlan(plan);
  assertExecutionIdentity(plan);
  return [...new Set(plan.cases.filter((c) => plan.expected.includes(c.id)).map((c) => c.file))];
}

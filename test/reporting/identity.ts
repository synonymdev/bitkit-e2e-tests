import { execFileSync } from 'node:child_process';
import type { Identity, Plan } from './report.ts';

/** Current execution inputs supplied by the builder plus the actual checked-out E2E revision. */
export function executionIdentity(
  platform: Identity['platform'],
  backend: Identity['backend']
): Identity {
  return {
    runId: process.env.E2E_RUN_ID!,
    platform,
    backend,
    appSha: process.env.E2E_APP_SHA!,
    e2eSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    artifactDigest: process.env.E2E_ARTIFACT_DIGEST!,
    backendRevision: process.env.E2E_BACKEND_REVISION!,
    variant: process.env.E2E_VARIANT || 'default',
  };
}

export function assertExecutionIdentity(plan: Plan): void {
  const current = executionIdentity(
    process.env.PLATFORM as Identity['platform'],
    (process.env.BACKEND || 'local') as Identity['backend']
  );
  for (const key of Object.keys(current) as (keyof Identity)[]) {
    if (current[key] !== plan.identity[key]) {
      throw new Error(`Run plan does not match executing ${key}`);
    }
  }
}

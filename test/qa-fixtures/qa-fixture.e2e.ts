/**
 * Local device fixtures for QA probes. Not part of CI.
 *
 * Lives outside test/specs so `npm run e2e:*` never picks it up.
 *
 *   ./scripts/qa-fixture.sh android empty
 *   BACKEND=regtest ./scripts/qa-fixture.sh ios full
 *
 * After it finishes, overlay the PR build (`adb install -r` / sim install,
 * do not uninstall) and start the journey from TotalBalance-primary.
 */

import initElectrum, { type ElectrumClient } from '../helpers/electrum';
import { completeOnboarding } from '../helpers/actions';
import { applyQaFixture, type QaFixtureKind } from '../helpers/qa-fixture';
import { ensureLocalFunds } from '../helpers/regtest';
import { reinstallApp } from '../helpers/setup';

const CASES: { kind: QaFixtureKind; title: string }[] = [
  { kind: 'empty', title: 'onboard only — no funds, no profile' },
  { kind: 'onchain', title: 'onboard + savings' },
  { kind: 'spending', title: 'onboard + savings + spending' },
  { kind: 'pubky', title: 'onboard + profile, no funds, no contacts' },
  { kind: 'full', title: 'onboard + savings + spending + profile' },
];

describe('@qa_fixture - Device fixtures (not CI)', () => {
  let electrum: ElectrumClient;

  before(async () => {
    await ensureLocalFunds();
    electrum = await initElectrum();
  });

  beforeEach(async () => {
    await reinstallApp();
    await completeOnboarding();
    await electrum.waitForSync();
  });

  after(async () => {
    await electrum?.stop();
  });

  for (const { kind, title } of CASES) {
    it(`@qa_fixture_${kind} - ${title}`, async () => {
      await applyQaFixture(kind, { waitForSync: () => electrum.waitForSync() });
    });
  }
});

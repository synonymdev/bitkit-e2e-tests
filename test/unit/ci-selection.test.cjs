const test = require('node:test'),
  assert = require('node:assert/strict');
const { select, BASE } = require('../../scripts/ci-selection.cjs');
const cases = require('../inventory.json').cases;
const pick = (files, extra = {}) =>
  select(cases, { platform: 'ios', mode: 'auto', files, ...extra });
test('base is exactly the agreed five existing cases', () =>
  assert.deepEqual([...pick(['Bitkit/Views/Send/SendAmount.swift']).base].sort(), [
    'boost_2',
    'lightning_1',
    'send_1',
    'send_2',
    'transfer_2',
  ]));
test('documentation-only changes avoid device jobs', () => {
  const s = pick(['Docs/guide.md']);
  assert.equal(s.code, false);
  assert.deepEqual(s.matrix, []);
});
test('hardware changes add all active hardware cases once', () => {
  const s = pick(['Bitkit/Views/Hardware/HardwareSend.swift']);
  for (const id of [...BASE, 'hardware_wallet_1', 'hardware_wallet_2', 'hardware_wallet_4'])
    assert.ok(s.ids.includes(id));
  assert.ok(!s.ids.includes('hardware_wallet_3'));
  assert.equal(new Set(s.ids).size, s.ids.length);
});
test('LNURL and address changes add their risk coverage', () => {
  assert.ok(pick(['Bitkit/Views/Lnurl/LnurlAuth.swift']).ids.includes('lnurl_1'));
  const s = pick(['Bitkit/Views/Send/UtxoSelection.swift']);
  assert.ok(s.ids.includes('multi_address_3'));
  assert.ok(s.ids.includes('multi_address_4'));
});
test('fee changes add CPFP as well as RBF', () =>
  assert.ok(pick(['Bitkit/Views/Send/FeePicker.swift']).ids.includes('boost_1')));
test('Pubky and recovery changes select their required executor', () => {
  assert.equal(pick(['Bitkit/Views/Profile/Profile.swift']).staging, true);
  assert.equal(pick(['Bitkit/Views/Backup/Restore.swift']).migration, true);
});
for (const file of [
  'Bitkit/Services/UnknownService.swift',
  'Package.resolved',
  'Bitkit/CompletelyNewFeature.swift',
  '.github/workflows/e2e-tests.yml',
  'Bitkit/Assets.xcassets/new.png',
])
  test(`broad/unknown ${file} selects full coverage`, () => {
    const s = pick([file]);
    assert.equal(s.ids.length, 42);
    assert.equal(s.staging, true);
    assert.equal(s.migration, true);
  });
test('old and new rename paths both contribute risks', () => {
  const s = pick(['Bitkit/Views/Hardware/Old.swift', 'Bitkit/Views/Lnurl/New.swift']);
  assert.ok(s.ids.includes('hardware_wallet_4'));
  assert.ok(s.ids.includes('lnurl_1'));
});
test('nightly runs full local and specialized coverage with no changes', () => {
  const s = pick([], { mode: 'nightly' });
  assert.equal(s.ids.length, 42);
  assert.equal(s.staging, true);
  assert.equal(s.migration, true);
  assert.ok(s.ids.includes('onchain_3'));
});
test('two shards partition exact cases without splitting spec fixtures', () => {
  const s = pick([], { mode: 'full', shards: 2 });
  assert.equal(s.matrix.length, 2);
  assert.deepEqual(s.matrix.flatMap((x) => x.ids).sort(), s.ids);
  for (const file of new Set(cases.map((c) => c.file))) {
    const ids = cases.filter((c) => c.file === file).map((c) => c.id);
    assert.ok(s.matrix.filter((shard) => shard.ids.some((id) => ids.includes(id))).length <= 1);
  }
});
test('known gaps remain explicit instead of executed as passing coverage', () => {
  const s = pick([], { mode: 'nightly' });
  assert.ok(s.gaps.some((g) => g.id === 'transfer_1'));
  assert.ok(!s.ids.includes('transfer_1'));
});

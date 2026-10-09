import test from 'node:test';
import assert from 'node:assert/strict';
import { observeRecovery } from '../helpers/recovery-wait.ts';

function clock(readyAt: number) {
  let time = 0;
  const events: { event: string; elapsedMs: number }[] = [];
  return {
    options: {
      probe: async () => time >= readyAt,
      startedAt: 0,
      now: () => time,
      pause: async (ms: number) => {
        time += ms;
      },
      record: (event: string, elapsedMs: number) => events.push({ event, elapsedMs }),
    },
    events,
  };
}

test('ordinary readiness stays fast with no slow-path event', async () => {
  const c = clock(10_000);
  assert.equal(await observeRecovery(c.options), 10_000);
  assert.deepEqual(c.events, [{ event: 'ready', elapsedMs: 10_000 }]);
});

for (const readyAt of [59_517, 373_588]) {
  test(`records delayed recovery at ${readyAt}ms without resetting the operation`, async () => {
    const c = clock(readyAt);
    const duration = await observeRecovery(c.options);
    assert.ok(duration >= readyAt && duration <= readyAt + 2000);
    assert.equal(c.events.filter((e) => e.event === 'fast-path-missed').length, 1);
    assert.equal(c.events.at(-1)?.event, 'ready');
  });
}

test('a session that never becomes ready fails at the seven-minute boundary', async () => {
  const c = clock(Infinity);
  await assert.rejects(observeRecovery(c.options), /within 420000ms/);
  assert.deepEqual(c.events.at(-1), { event: 'timeout', elapsedMs: 420_000 });
});

test('a probe returning ready after the deadline cannot pass', async () => {
  const c = clock(Infinity);
  await assert.rejects(
    observeRecovery({
      ...c.options,
      probe: async () => {
        await c.options.pause(420_001);
        return true;
      },
    }),
    /within 420000ms/
  );
  assert.equal(c.events.at(-1)?.event, 'timeout');
});

test('driver errors fail immediately rather than being mistaken for recovery delay', async () => {
  const c = clock(Infinity);
  await assert.rejects(
    observeRecovery({
      ...c.options,
      probe: async () => {
        throw new Error('driver connection lost');
      },
    }),
    /driver connection lost/
  );
  assert.deepEqual(c.events, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { editGateLightningInvoice } from '../helpers/receive-invoice.ts';

const paid = 'lnbcrt1qqqq';
const fresh = 'lnbcrt1pppp';
for (const scenario of [
  'replaced',
  'paid',
  'savings',
  'missing',
  'disabled',
  'zero-size',
  'ambiguous',
  'no-destination',
  'click-error',
] as const) {
  test(`Receive edit readiness: ${scenario}`, async (t) => {
    const old = {
      driver: globalThis.driver,
      browser: globalThis.browser,
      $: globalThis.$,
      $$: globalThis.$$,
    };
    t.after(() => Object.assign(globalThis, old));
    let sample = 0;
    let clicks = 0;
    let destination = false;
    const clicked: string[] = [];
    const page = (offscreen = false) => ({
      $: async (selector: string) => {
        const qr = selector.includes('QRCode');
        const generation = sample < 3 ? String(sample) : 'ready';
        return {
          elementId: `${qr ? 'qr' : 'edit'}-${generation}`,
          isDisplayed: async () => true,
          isEnabled: async () => scenario !== 'disabled',
          getAttribute: async () => {
            const invoice = scenario === 'paid' || sample === 0 ? paid : fresh;
            return `bitcoin:bcrt1qexample${scenario === 'savings' || sample === 1 ? '' : `?lightning=${invoice}`}`;
          },
          getLocation: async () => ({ x: offscreen ? 1200 : 40, y: qr ? 400 : 1100 }),
          getSize: async () => ({
            width: scenario === 'zero-size' ? 0 : 300,
            height: qr ? 300 : 80,
          }),
          click: async () => {
            clicks++;
            clicked.push(generation);
            assert.ok(!offscreen, 'Must not click a repeated offscreen pager page');
            assert.ok(sample >= 4, 'Same-geometry node replacements must reset readiness');
            if (scenario === 'click-error') throw new Error('native click failed');
            destination = scenario !== 'no-destination';
          },
        };
      },
    });
    Object.assign(globalThis, {
      driver: { isAndroid: true, getWindowSize: async () => ({ width: 1080, height: 2400 }) },
      browser: {
        waitUntil: async (
          probe: () => Promise<boolean>,
          options: { timeout: number; timeoutMsg: string }
        ) => {
          assert.equal(options.timeout, 30000);
          for (sample = 0; sample < 6; sample++) if (await probe()) return;
          throw new Error(options.timeoutMsg);
        },
      },
      $$: async (selector: string) => {
        assert.match(selector, /QRCode.*ancestor::.*SpecifyInvoiceButton/);
        return scenario === 'missing'
          ? []
          : [page(true), page(), ...(scenario === 'ambiguous' ? [page()] : [])];
      },
      $: () => ({ isDisplayed: async () => destination }),
    });
    const result = editGateLightningInvoice(paid);
    if (scenario === 'replaced') await result;
    else
      await assert.rejects(
        result,
        scenario === 'click-error' ? /native click failed/ : /Receive|expected/
      );
    assert.equal(clicks, ['replaced', 'no-destination', 'click-error'].includes(scenario) ? 1 : 0);
    if (clicks) assert.deepEqual(clicked, ['ready']);
  });
}

test('iOS Receive retains its existing action/outcome path', async (t) => {
  const old = {
    driver: globalThis.driver,
    browser: globalThis.browser,
    $: globalThis.$,
    $$: globalThis.$$,
  };
  t.after(() => Object.assign(globalThis, old));
  let clicks = 0;
  Object.assign(globalThis, {
    driver: { isAndroid: false },
    browser: { waitUntil: async (probe: () => Promise<boolean>) => assert.ok(await probe()) },
    $$: () => {
      throw new Error('Android pager lookup on iOS');
    },
    $: () => ({
      waitForDisplayed: async () => {},
      click: async () => {
        clicks++;
      },
      isDisplayed: async () => clicks === 1,
    }),
  });
  await editGateLightningInvoice(paid);
  assert.equal(clicks, 1);
});

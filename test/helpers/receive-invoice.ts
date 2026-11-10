import { actAndExpect, tapAndExpect } from './outcome';

/** Edit the newly generated invoice, not a cached/placeholder Receive subtree. */
export async function editGateLightningInvoice(paidInvoice: string) {
  const outcome = { anyVisible: [{ id: 'ReceiveNumberPadTextField' }] };
  if (!driver.isAndroid) {
    await tapAndExpect({ id: 'SpecifyInvoiceButton' }, outcome);
    return;
  }
  await actAndExpect(
    'edit fresh lightning invoice',
    async () => {
      const viewport = await driver.getWindowSize();
      let previous = '';
      let ready: { click(): Promise<void> } | undefined;
      await browser.waitUntil(
        async () => {
          const last = previous;
          previous = '';
          ready = undefined;
          const candidates = [];
          for (const page of await $$(
            '//*[@resource-id="QRCode"]/ancestor::*[.//*[@resource-id="SpecifyInvoiceButton"]][1]'
          )) {
            const qr = await page.$('.//*[@resource-id="QRCode"]');
            if (!(await qr.isDisplayed())) continue;
            const uri = (await qr.getAttribute('content-desc')) ?? '';
            const invoice = (
              uri.toLowerCase().startsWith('bitcoin:')
                ? (new URLSearchParams(uri.split('?')[1] ?? '').get('lightning') ?? '')
                : uri
            ).toLowerCase();
            if (
              !/^lnbcrt(?:\d+[munp]?)?1[02-9ac-hj-np-z]+$/.test(invoice) ||
              invoice === paidInvoice.toLowerCase()
            )
              continue;
            // Pager pages repeat these tags. Resolve Edit from this QR's nearest shared
            // ancestor rather than selecting an unrelated offscreen page's first match.
            const button = await page.$('.//*[@resource-id="SpecifyInvoiceButton"]');
            if (!(await button.isDisplayed()) || !(await button.isEnabled())) continue;
            const qrLocation = await qr.getLocation();
            const qrSize = await qr.getSize();
            const location = await button.getLocation();
            const size = await button.getSize();
            const inside = (p: { x: number; y: number }, s: { width: number; height: number }) =>
              s.width > 0 &&
              s.height > 0 &&
              p.x >= 0 &&
              p.y >= 0 &&
              p.x + s.width <= viewport.width &&
              p.y + s.height <= viewport.height;
            if (!inside(qrLocation, qrSize) || !inside(location, size)) continue;
            candidates.push({
              button,
              sample: {
                uri,
                qrId: qr.elementId,
                buttonId: button.elementId,
                qrLocation,
                qrSize,
                location,
                size,
              },
            });
          }
          if (candidates.length !== 1) return false;
          previous = JSON.stringify(candidates[0].sample);
          if (previous !== last) return false;
          ready = candidates[0].button;
          return true;
        },
        {
          timeout: 30_000,
          interval: 200,
          timeoutMsg:
            'Receive did not expose one stable fresh Lightning QR and enabled Edit button',
        }
      );
      // No intervening lookup or action: use the handle from the last fresh sample.
      if (!ready) throw new Error('Receive Edit readiness was not established');
      await ready.click();
    },
    outcome
  );
}

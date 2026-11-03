import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { address, networks, Transaction } from 'bitcoinjs-lib';
import {
  electrumRequest,
  freshRegtestRecipient,
  history,
  scriptHash,
  verifyPayment,
  waitForPayment,
} from '../helpers/smoke-oracle.ts';

function transaction(recipient: string, sats = 10_000, funding = 'ab'.repeat(32)) {
  const tx = new Transaction();
  tx.addInput(Buffer.from(funding, 'hex').reverse(), 0);
  tx.addOutput(address.toOutputScript(recipient, networks.regtest), sats);
  return tx;
}
async function server(
  t: test.TestContext,
  handle: (socket: net.Socket, request: { id: number; method: string; params: unknown[] }) => void
) {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) handle(socket, JSON.parse(data));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { host: '127.0.0.1', port: (server.address() as net.AddressInfo).port };
}
test('fresh recipients are distinct valid regtest addresses', () => {
  const one = freshRegtestRecipient(),
    two = freshRegtestRecipient();
  assert.notEqual(one, two);
  assert.match(one, /^bcrt1/);
  assert.match(scriptHash(one), /^[a-f0-9]{64}$/);
});
test('oracle verifies raw transaction identity, exact output and wallet funding input', () => {
  const recipient = freshRegtestRecipient(),
    tx = transaction(recipient);
  assert.equal(
    verifyPayment(tx.toHex(), tx.getId(), recipient, 10_000, 'ab'.repeat(32)).txid,
    tx.getId()
  );
  assert.throws(() => verifyPayment(tx.toHex(), 'cd'.repeat(32), recipient, 10_000), /identity/);
  assert.throws(
    () => verifyPayment(tx.toHex(), tx.getId(), freshRegtestRecipient(), 10_000),
    /recipient\/amount/
  );
  assert.throws(() => verifyPayment(tx.toHex(), tx.getId(), recipient, 9_999), /recipient\/amount/);
  assert.throws(
    () => verifyPayment(tx.toHex(), tx.getId(), recipient, 10_000, 'cd'.repeat(32)),
    /funding transaction/
  );
});
test('unrelated concurrent transactions cannot satisfy another case', () => {
  const first = freshRegtestRecipient(),
    second = freshRegtestRecipient();
  const firstTx = transaction(first),
    secondTx = transaction(second, 10_000, 'cd'.repeat(32));
  assert.throws(
    () => verifyPayment(secondTx.toHex(), secondTx.getId(), first, 10_000, 'ab'.repeat(32)),
    /recipient/
  );
  assert.equal(
    verifyPayment(firstTx.toHex(), firstTx.getId(), first, 10_000, 'ab'.repeat(32)).address,
    first
  );
});
test('split TCP responses and notifications are handled without accepting another request ID', async (t) => {
  const endpoint = await server(t, (socket) => {
    socket.write('{"id":2,"result":"wrong"}\n{"id":1,"res');
    socket.end('ult":"correct"}\n');
  });
  assert.equal(await electrumRequest(endpoint, 'server.version', []), 'correct');
});
test('a nonresponding backend is bounded and closes the connection', async (t) => {
  const endpoint = await server(t, () => {});
  await assert.rejects(electrumRequest(endpoint, 'server.version', [], 30), /timed out/);
});
test('closed connections and backend errors cannot become successful readiness', async (t) => {
  const closed = await server(t, (socket) => socket.end());
  await assert.rejects(electrumRequest(closed, 'server.version', []), /closed before/);
  const error = await server(t, (socket) =>
    socket.end('{"id":1,"error":{"code":-1,"message":"unavailable"}}\n')
  );
  await assert.rejects(electrumRequest(error, 'server.version', []), /backend rejected/);
});
test('malformed history fails rather than looking like an empty ready wallet', async (t) => {
  const endpoint = await server(t, (socket) => socket.end('{"id":1,"result":null}\n'));
  await assert.rejects(history(endpoint, freshRegtestRecipient()), /Malformed.*history/);
});
test('end-to-end oracle reads history then independently decodes the payment', async (t) => {
  const recipient = freshRegtestRecipient(),
    tx = transaction(recipient);
  const endpoint = await server(t, (socket, request) =>
    socket.end(
      JSON.stringify({
        id: 1,
        result: request.method.endsWith('get_history')
          ? [{ tx_hash: tx.getId(), height: 1 }]
          : tx.toHex(),
      }) + '\n'
    )
  );
  const result = await waitForPayment(endpoint, recipient, 10_000, { spendsTxid: 'ab'.repeat(32) });
  assert.equal(result.txid, tx.getId());
});

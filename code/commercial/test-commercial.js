const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muh-'));
process.env.LEDGER_PATH = path.join(tmp, 'd.jsonl'); process.env.APPROVALS_PATH = path.join(tmp, 'a.jsonl');
process.env.LICENSE_SIGNING_SECRET = 'test-secret-not-real';
process.env.STRIPE_PRICE_PRO = 'price_placeholder'; delete process.env.STRIPE_SECRET_KEY;
const lic = require('./license'), g = require('./guardrails'), co = require('./checkout');

test('license: issue/verify, tamper, expiry, none', () => {
  const k = lic.issue('pro', '20991231');
  assert.deepStrictEqual(lic.verify(k).tier, 'pro');
  assert.strictEqual(lic.verify(k.replace('pro', 'org')).valid, false);
  assert.strictEqual(lic.verify(lic.issue('pro', '20200101')).reason, 'expired');
  assert.strictEqual(lic.verify(undefined).tier, 'community');
});
test('approval: blocked until a human approves, single use, payload bound', () => {
  const p = { amount: 5 };
  assert.strictEqual(g.consume('spend', p).allowed, false);
  const id = g.requestApproval('spend', p);
  assert.strictEqual(g.consume('spend', p).allowed, false);
  g.approve(id, 'owner');
  assert.strictEqual(g.consume('spend', { amount: 6 }).allowed, false);
  assert.strictEqual(g.consume('spend', p).allowed, true);
  assert.strictEqual(g.consume('spend', p).allowed, false);
  assert.throws(() => g.requestApproval('nonsense', p));
});
test('rate limit', () => {
  g._reset();
  assert.ok(g.rateLimit('c', 2, 1000, 0).ok); assert.ok(g.rateLimit('c', 2, 1000, 1).ok);
  assert.strictEqual(g.rateLimit('c', 2, 1000, 2).ok, false);
  assert.ok(g.rateLimit('c', 2, 1000, 1500).ok);
});
test('checkout is dry-run without live flags', async () => {
  const r = await co.createCheckout('pro', 'a@example.com');
  assert.strictEqual(r.mode, 'dry-run');
  await assert.rejects(co.createCheckout('community'));
});
test('audit log written', () => assert.ok(fs.readFileSync(process.env.LEDGER_PATH, 'utf8').includes('commercial_audit')));

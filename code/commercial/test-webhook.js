const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muh-wh-'));
Object.assign(process.env, { LEDGER_PATH: path.join(tmp, 'd.jsonl'), APPROVALS_PATH: path.join(tmp, 'a.jsonl'), LICENSE_DB: path.join(tmp, 'lic.json'),
  LICENSE_SIGNING_SECRET: 'test-secret-not-real', STRIPE_WEBHOOK_SECRET: 'whsec_test_not_real', STRIPE_PRICE_PRO: 'price_pro_test', STRIPE_PRICE_ORG: 'price_org_test' });
const w = require('./webhook'), d = require('./deliveries'), g = require('./guardrails'), lic = require('./license'), gate = require('./gate'), co = require('./checkout');
const sign = (raw, t = Math.floor(Date.now() / 1000), secret = process.env.STRIPE_WEBHOOK_SECRET) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const ev = (id, price, extra = {}) => Buffer.from(JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1',
  metadata: { price_id: price }, customer_details: { email: 'buyer@example.com' }, ...extra } } }));
const post = (raw, h) => w.handleStripeWebhook(raw, h === undefined ? sign(raw) : h);
let hash;

test('signature: bad / missing / stale rejected', () => {
  const raw = ev('evt_bad', 'price_pro_test');
  assert.strictEqual(post(raw, sign(raw, undefined, 'wrong')).status, 400);
  assert.strictEqual(post(raw, null).status, 400);
  assert.strictEqual(post(raw, sign(raw, 1000)).status, 400);
  assert.strictEqual(d.list().length, 0);
});
test('paid checkout issues key: hash stored, plaintext only in outbox; gate accepts it', () => {
  const r = post(ev('evt_1', 'price_pro_test'));
  assert.deepStrictEqual(r, { status: 200, body: { received: true, handled: true } });
  const db = JSON.parse(fs.readFileSync(process.env.LICENSE_DB, 'utf8'));
  hash = Object.keys(db.licenses)[0];
  const key = db.outbox[hash].key;
  assert.ok(!JSON.stringify(db.licenses).includes(key));
  assert.strictEqual(lic.verify(key).tier, 'pro');
  assert.ok(lic.featuresFor(lic.verify(key).tier).includes('custom rules file'));
  assert.strictEqual(gate.gatedDecide({}, { customRules: true }).rule_id, 'LICENSE'); // no key: denied before the engine runs
  assert.strictEqual(lic.verify('FZ-PRO-forged').tier, 'community');
});
test('HMAC keys still work alongside webhook keys', () => assert.strictEqual(lic.verify(lic.issue('org', '20991231')).tier, 'org'));
test('replay issues nothing', () => {
  const r = post(ev('evt_1', 'price_pro_test'));
  assert.strictEqual(r.body.duplicate, true);
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(process.env.LICENSE_DB, 'utf8')).licenses).length, 1);
});
test('unknown price and client-chosen tier issue nothing', () => {
  assert.strictEqual(post(ev('evt_2', 'price_unknown', { tier: 'org' })).body.handled, false);
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(process.env.LICENSE_DB, 'utf8')).licenses).length, 1);
});
test('checkout stub carries metadata.price_id and stays dry-run', async () => {
  const r = await co.createCheckout('pro');
  assert.strictEqual(r.mode, 'dry-run'); assert.strictEqual(r.would_send.body['metadata[price_id]'], 'price_pro_test');
});
test('delivery needs human approval, then drops plaintext', () => {
  assert.ok(!JSON.stringify(d.list()).includes('FZ-'));
  assert.throws(() => d.deliver(hash, 'owner'), /approval required/);
  g.approve(d.request(hash), 'owner');
  assert.throws(() => d.deliver(hash), /approver/);
  assert.strictEqual(d.deliver(hash, 'owner'), true);
  assert.strictEqual(d.list().length, 0);
  assert.ok(!fs.readFileSync(process.env.LICENSE_DB, 'utf8').includes('FZ-PRO-'));
  assert.throws(() => d.deliver(hash, 'owner'));
});
test('revocation disables webhook key', () => {
  const db = JSON.parse(fs.readFileSync(process.env.LICENSE_DB, 'utf8')); assert.strictEqual(db.licenses[hash].status, 'active');
  const raw = Buffer.from(JSON.stringify({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } }));
  assert.strictEqual(post(raw).body.handled, true);
  assert.strictEqual(JSON.parse(fs.readFileSync(process.env.LICENSE_DB, 'utf8')).licenses[hash].status, 'revoked');
});

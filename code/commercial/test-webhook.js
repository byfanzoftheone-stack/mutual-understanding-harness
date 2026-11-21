const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muh-wh-'));
const CONFIG = { LEDGER_PATH: path.join(tmp, 'd.jsonl'), APPROVALS_PATH: path.join(tmp, 'a.jsonl'), LICENSE_DB: path.join(tmp, 'lic.sqlite'),
  LICENSE_SIGNING_SECRET: 'test-secret-not-real', STRIPE_WEBHOOK_SECRET: 'whsec_test_not_real', STRIPE_PRICE_PRO: 'price_pro_test', STRIPE_PRICE_ORG: 'price_org_test' };
Object.assign(process.env, CONFIG); delete process.env.LICENSE_DATABASE_URL;
const w = require('./webhook'), d = require('./deliveries'), g = require('./guardrails'), lic = require('./license'), gate = require('./gate'), co = require('./checkout');
const sign = (raw, t = Math.floor(Date.now() / 1000), secret = process.env.STRIPE_WEBHOOK_SECRET) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
const ev = (id, price, extra = {}) => Buffer.from(JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_' + id, payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1',
  metadata: { price_id: price }, customer_details: { email: 'buyer@example.com' }, ...extra } } }));
const post = (raw, h) => w.handleStripeWebhook(raw, h === undefined ? sign(raw) : h);
// Read the SQLite file directly (independent of the store code under test).
const sql = q => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.LICENSE_DB); try { return db.prepare(q).all(); } finally { db.close(); } };
let hash, key;

test('signature: bad / missing / stale rejected', async () => {
  const raw = ev('evt_bad', 'price_pro_test');
  assert.strictEqual((await post(raw, sign(raw, undefined, 'wrong'))).status, 400);
  assert.strictEqual((await post(raw, null)).status, 400);
  assert.strictEqual((await post(raw, sign(raw, 1000))).status, 400);
  assert.strictEqual((await d.list()).length, 0);
});
test('paid checkout issues key: hash stored, plaintext only in outbox; gate accepts it', async () => {
  const r = await post(ev('evt_1', 'price_pro_test'));
  assert.deepStrictEqual(r, { status: 200, body: { received: true, handled: true } });
  const pending = await (await w.instance()).pendingDeliveries();
  assert.strictEqual(pending.length, 1);
  ({ hash, key } = pending[0]);
  assert.match(key, /^FZ-PRO-/);
  assert.ok(!JSON.stringify(sql('SELECT * FROM licenses')).includes(key)); // licenses table holds the hash only
  assert.strictEqual((await lic.verify(key)).tier, 'pro');
  assert.ok(lic.featuresFor((await lic.verify(key)).tier).includes('custom rules file'));
  assert.strictEqual((await gate.gatedDecide({}, { customRules: true })).rule_id, 'LICENSE'); // no key: denied before the engine runs
  assert.strictEqual((await lic.verify('FZ-PRO-forged')).tier, 'community');
});
test('HMAC keys still work alongside webhook keys', async () => assert.strictEqual((await lic.verify(lic.issue('org', '20991231'))).tier, 'org'));
test('replay issues nothing', async () => {
  const r = await post(ev('evt_1', 'price_pro_test'));
  assert.strictEqual(r.body.duplicate, true);
  assert.strictEqual(sql('SELECT * FROM licenses').length, 1);
});
test('unknown price and client-chosen tier issue nothing', async () => {
  assert.strictEqual((await post(ev('evt_2', 'price_unknown', { tier: 'org' }))).body.handled, false);
  assert.strictEqual(sql('SELECT * FROM licenses').length, 1);
});
test('concurrent duplicate deliveries of one event issue exactly one key', async () => {
  const raw = ev('evt_race', 'price_org_test', { id: 'cs_race', customer: 'cus_race', subscription: 'sub_race' });
  const sig = sign(raw);
  const rs = await Promise.all(Array.from({ length: 20 }, () => w.handleStripeWebhook(raw, sig)));
  assert.ok(rs.every(r => r.status === 200));
  assert.strictEqual(rs.filter(r => r.body.duplicate !== true).length, 1);
  assert.strictEqual(sql("SELECT * FROM licenses WHERE tier='org'").length, 1);
  assert.strictEqual((await d.list()).filter(x => x.tier === 'org').length, 1);
});
test('checkout stub carries metadata.price_id and stays dry-run', async () => {
  const r = await co.createCheckout('pro');
  assert.strictEqual(r.mode, 'dry-run'); assert.strictEqual(r.would_send.body['metadata[price_id]'], 'price_pro_test');
});
test('delivery needs human approval, then drops plaintext', async () => {
  assert.ok(!JSON.stringify(await d.list()).includes('FZ-'));
  await assert.rejects(d.deliver(hash, 'owner'), /approval required/);
  g.approve(await d.request(hash), 'owner');
  await assert.rejects(d.deliver(hash), /approver/);
  assert.strictEqual(await d.deliver(hash, 'owner'), true);
  assert.ok(!(await d.list()).some(x => x.hash === hash));
  assert.ok(!JSON.stringify(sql('SELECT * FROM license_outbox')).includes(key)); // plaintext gone from storage
  await assert.rejects(d.deliver(hash, 'owner'));
});
test('revocation disables webhook key', async () => {
  assert.strictEqual((await lic.verify(key)).valid, true);
  const raw = Buffer.from(JSON.stringify({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } }));
  assert.strictEqual((await post(raw)).body.handled, true);
  assert.strictEqual((await lic.verify(key)).valid, false);
});
test('migrate-json imports a legacy JSON DB; keys stay valid; idempotent', async () => {
  const legacy = path.join(tmp, 'legacy.json'), lk = 'FZ-PRO-legacykey-not-real', h = crypto.createHash('sha256').update(lk).digest('hex');
  fs.writeFileSync(legacy, JSON.stringify({ events: { evt_old: { type: 'checkout.session.completed', at: '2025-01-01T00:00:00Z' } },
    licenses: { [h]: { tier: 'pro', status: 'active', created: '2025-01-01T00:00:00Z' } }, outbox: {} }));
  assert.deepStrictEqual(await d.migrateJson(legacy), { licenses: 1, outbox: 0, events: 1 });
  assert.deepStrictEqual(await d.migrateJson(legacy), { licenses: 1, outbox: 0, events: 1 });
  assert.strictEqual((await lic.verify(lk)).tier, 'pro');
  const raw = ev('evt_old', 'price_pro_test'); // old event stays claimed
  assert.strictEqual((await post(raw)).body.duplicate, true);
  await assert.rejects(d.migrateJson(path.join(tmp, 'nope.json')), /no such file/);
});
test('FAIL CLOSED: unconfigured store => webhook 503, FZ keys denied, HMAC keys still work', async () => {
  const saved = process.env.LICENSE_DB; delete process.env.LICENSE_DB; delete process.env.LICENSE_DATABASE_URL;
  try {
    const raw = ev('evt_unconf', 'price_pro_test');
    const r = await post(raw);
    assert.strictEqual(r.status, 503); assert.strictEqual(r.body.error, 'license_store_not_configured');
    assert.strictEqual((await lic.verify(key)).valid, false);        // a real, previously-issued key is denied, not allowed
    assert.strictEqual((await lic.verify(key)).tier, 'community');
    assert.strictEqual((await lic.verify(lic.issue('pro', '20991231'))).tier, 'pro'); // HMAC needs no store
    assert.strictEqual((await gate.gatedDecide({}, { licenseKey: key, customRules: true })).rule_id, 'LICENSE');
    await assert.rejects(d.list(), /not configured/);
    await assert.rejects(d.migrateJson(path.join(tmp, 'legacy.json')), /not configured/);
  } finally { process.env.LICENSE_DB = saved; }
  assert.strictEqual((await post(ev('evt_after', 'price_pro_test'))).status, 200); // recovers once configured
});

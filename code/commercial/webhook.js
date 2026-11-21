// webhook.js - Stripe webhook -> license issuance, using the vendored shared module (license-webhook/: index.mjs, stores.mjs, async.mjs).
// It verifies, records and QUEUES. It never emails, never calls Stripe. Delivery is a separate human-approved step (deliveries.js).
// Storage is the async TRANSACTIONAL store chosen from the environment (storeFromEnv). FAIL CLOSED: if no store is configured the webhook answers
// 503 and webhook (FZ-*) keys are denied. There is deliberately no default file path.
const pricing = require('../../pricing.json');
const g = require('./guardrails');
const lwP = () => import('./license-webhook/async.mjs'); // ESM, loaded lazily (the harness itself is CommonJS)

// price id -> tier, from env vars named in pricing.json (STRIPE_PRICE_PRO -> pro, ...). Unset prices are simply absent.
function priceTiers(env = process.env) {
  const m = {};
  for (const [tier, t] of Object.entries(pricing.tiers)) if (t.price_env && env[t.price_env]) m[env[t.price_env]] = tier;
  return m;
}
class NotConfigured extends Error { constructor(m) { super(m); this.code = 'NOT_CONFIGURED'; } }
let cached = null, cachedKey = '';
// Async. Cached per distinct configuration; a failed setup is NOT cached (so fixing the env and retrying works).
async function instance() {
  const env = process.env;
  const key = [env.STRIPE_WEBHOOK_SECRET, env.LICENSE_DATABASE_URL, env.LICENSE_DATABASE_SSL, env.LICENSE_DB_POOL_MAX, env.LICENSE_DB, JSON.stringify(priceTiers(env))].join('|');
  if (!cached || key !== cachedKey) {
    const p = (async () => {
      const lw = await lwP();
      let store;
      try { store = await lw.storeFromEnv(env); } catch (e) { throw new NotConfigured(e.message); }
      return lw.createAsyncLicenseWebhook({ secret: env.STRIPE_WEBHOOK_SECRET, priceTiers: priceTiers(env), store, audit: r => g.audit('license_webhook', r) });
    })();
    cached = p; cachedKey = key;
    p.catch(() => { if (cached === p) cached = null; });
  }
  return cached;
}
// rawBuffer MUST be the raw request bytes (not parsed JSON). Async. Returns { status, body }.
async function handleStripeWebhook(rawBuffer, signatureHeader) {
  try { return await (await instance()).handle(rawBuffer, signatureHeader); }
  catch (e) {
    if (e.code === 'NOT_CONFIGURED') { g.audit('license_webhook_unconfigured', { message: e.message }); return { status: 503, body: { error: 'license_store_not_configured' } }; }
    g.audit('license_webhook_error', { message: e.message }); return { status: 500, body: { error: 'internal_error' } };
  }
}
// Gate helper: { valid, tier }. Async. Never throws; ANY failure (including "not configured") denies.
async function validateKey(key) {
  try { const r = await (await instance()).validate(key); return r.valid && pricing.tiers[r.tier] ? r : { valid: false }; } catch (e) { return { valid: false }; }
}
module.exports = { handleStripeWebhook, validateKey, priceTiers, instance };

// webhook.js - Stripe webhook -> license issuance, using the vendored shared module (license-webhook.mjs).
// It verifies, records and QUEUES. It never emails, never calls Stripe. Delivery is a separate human-approved step (deliveries.js).
const path = require('path');
const pricing = require('../../pricing.json');
const g = require('./guardrails');
const lw = require('./license-webhook.mjs'); // Node >= 22.12 can require() ESM synchronously

// price id -> tier, from env vars named in pricing.json (STRIPE_PRICE_PRO -> pro, ...). Unset prices are simply absent.
function priceTiers(env = process.env) {
  const m = {};
  for (const [tier, t] of Object.entries(pricing.tiers)) if (t.price_env && env[t.price_env]) m[env[t.price_env]] = tier;
  return m;
}
const dbPath = () => process.env.LICENSE_DB || path.resolve('ledger/licenses.json'); // ledger/ is gitignored
let cached = null, cachedKey = '';
function instance() {
  const key = [process.env.STRIPE_WEBHOOK_SECRET, dbPath(), JSON.stringify(priceTiers())].join('|');
  if (!cached || key !== cachedKey) {
    cached = lw.createLicenseWebhook({ secret: process.env.STRIPE_WEBHOOK_SECRET, priceTiers: priceTiers(), store: new lw.JsonStore(dbPath()),
      audit: r => g.audit('license_webhook', r) });
    cachedKey = key;
  }
  return cached;
}
// rawBuffer MUST be the raw request bytes (not parsed JSON). Returns { status, body }.
function handleStripeWebhook(rawBuffer, signatureHeader) {
  try { return instance().handle(rawBuffer, signatureHeader); }
  catch (e) { g.audit('license_webhook_error', { message: e.message }); return { status: 500, body: { error: 'internal_error' } }; }
}
// Gate helper: { valid, tier }. Never throws.
function validateKey(key) {
  try { const r = instance().validate(key); return r.valid && pricing.tiers[r.tier] ? r : { valid: false }; } catch (e) { return { valid: false }; }
}
const store = () => new lw.JsonStore(dbPath());
module.exports = { handleStripeWebhook, validateKey, priceTiers, instance, store, hashKey: lw.hashKey };

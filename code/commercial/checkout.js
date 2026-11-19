// checkout.js - checkout STUB. Default is dry-run: returns the request it WOULD send. A live call to Stripe needs all of:
// STRIPE_SECRET_KEY set, ALLOW_LIVE_CHECKOUT=true, and a human approval for this exact request (guardrails.js). Nothing is sent otherwise.
const pricing = require('../../pricing.json');
const g = require('./guardrails');
function buildRequest(tier, email) {
  const t = pricing.tiers[tier];
  if (!t || !t.price_env) throw new Error('tier not purchasable: ' + tier);
  const price = process.env[t.price_env];
  if (!price) throw new Error(t.price_env + ' not set');
  const body = { mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    success_url: process.env.CHECKOUT_SUCCESS_URL || 'https://example.com/thanks', cancel_url: process.env.CHECKOUT_CANCEL_URL || 'https://example.com/pricing' };
  if (email) body.customer_email = email;
  return { url: 'https://api.stripe.com/v1/checkout/sessions', body };
}
async function createCheckout(tier, email) {
  const req = buildRequest(tier, email), key = process.env.STRIPE_SECRET_KEY;
  g.audit('checkout_requested', { tier });
  if (!key || process.env.ALLOW_LIVE_CHECKOUT !== 'true') return { mode: 'dry-run', would_send: req };
  const gate = g.consume('live_checkout', { tier, email: email || null });
  if (!gate.allowed) return { mode: 'pending_approval', approval_id: g.requestApproval('live_checkout', { tier, email: email || null }) };
  const res = await fetch(req.url, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(req.body) });
  const j = await res.json();
  return res.ok ? { mode: 'live', checkout_url: j.url } : { mode: 'error', status: res.status };
}
module.exports = { buildRequest, createCheckout };
if (require.main === module) createCheckout(process.argv[2] || 'pro', process.argv[3]).then(r => console.log(JSON.stringify(r, null, 2)), e => { console.error(e.message); process.exit(1); });

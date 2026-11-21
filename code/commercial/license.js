// license.js - offline, HMAC-signed license keys. Key = muh.<tier>.<YYYYMMDD expiry>.<sig>. No network, no secrets in code.
const crypto = require('crypto');
const pricing = require('../../pricing.json');
const secret = () => { const s = process.env.LICENSE_SIGNING_SECRET; if (!s || s === 'changeme') throw new Error('LICENSE_SIGNING_SECRET not set'); return s; };
const sig = (tier, exp) => crypto.createHmac('sha256', secret()).update(`${tier}.${exp}`).digest('base64url').slice(0, 24);

function issue(tier, expiry) { // owner-only tool; expiry = YYYYMMDD
  if (!pricing.tiers[tier] || tier === 'community') throw new Error('tier must be pro or org');
  if (!/^\d{8}$/.test(expiry)) throw new Error('expiry must be YYYYMMDD');
  return `muh.${tier}.${expiry}.${sig(tier, expiry)}`;
}
// ASYNC. Returns { valid, tier, reason }. No key, or a bad one, falls back to community (free) - never throws on user input.
// HMAC (muh.*) keys are checked first and need no store. FZ-* keys need the async license store; if it is not configured they are DENIED (fail closed).
async function verify(key, now = new Date()) {
  const free = reason => ({ valid: false, tier: 'community', reason });
  if (!key) return free('no key');
  if (String(key).startsWith('FZ-')) { // key issued by the shared Stripe webhook module (hash-checked in its store; revocable)
    const r = await require('./webhook').validateKey(String(key));
    return r.valid ? { valid: true, tier: r.tier, reason: 'ok (webhook key)' } : free('unknown or revoked webhook key');
  }
  const [p, tier, exp, s] = String(key).split('.');
  if (p !== 'muh' || !pricing.tiers[tier] || !/^\d{8}$/.test(exp || '') || !s) return free('malformed');
  let want; try { want = sig(tier, exp); } catch (e) { return free(e.message); }
  const a = Buffer.from(s), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return free('bad signature');
  const today = now.toISOString().slice(0, 10).replace(/-/g, '');
  if (exp < today) return free('expired');
  return { valid: true, tier, reason: 'ok' };
}
const featuresFor = tier => pricing.tiers[tier].features;
const limitFor = tier => pricing.tiers[tier].rate_limit_per_min;
module.exports = { issue, verify, featuresFor, limitFor };
if (require.main === module) { // node license.js issue pro 20271231
  try { const [c, t, e] = process.argv.slice(2); if (c !== 'issue') throw new Error('usage: issue <pro|org> <YYYYMMDD>'); console.log(issue(t, e)); } catch (e) { console.error(e.message); process.exit(1); }
}

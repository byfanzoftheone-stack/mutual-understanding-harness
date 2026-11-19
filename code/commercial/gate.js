// gate.js - wraps the engine with license-tier gating and rate limiting. Community (no key) still works, within limits.
const { decide } = require('../ledger');
const { verify, featuresFor, limitFor } = require('./license');
const { rateLimit } = require('./guardrails');
// Custom rules files are a Pro feature; community uses the bundled general rules.
function gatedDecide(action, { licenseKey = process.env.MUH_LICENSE_KEY, clientId = 'default', customRules = false } = {}) {
  const lic = verify(licenseKey);
  if (customRules && !featuresFor(lic.tier).includes('custom rules file'))
    return { decision: 'deny', rule_id: 'LICENSE', reason: 'custom rules need a Pro or Org license (' + lic.reason + ')', tier: lic.tier };
  const rl = rateLimit(clientId, limitFor(lic.tier));
  if (!rl.ok) return { decision: 'deny', rule_id: 'RATE', reason: 'rate limit exceeded', retry_ms: rl.retry_ms, tier: lic.tier };
  return { ...decide(action), license_tier: lic.tier };
}
module.exports = { gatedDecide };

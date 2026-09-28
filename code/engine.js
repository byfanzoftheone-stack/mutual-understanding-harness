const fs = require('fs'), path = require('path'), os = require('os');
const RULES_PATH = process.env.POLICY_RULES || path.join(os.homedir(), 'policy-engine/rules/rules.json');
const RANK = { deny: 0, require_approval: 1, allow: 2 };

function load() { return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')); }
function get(obj, p) { return p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj); }
function resolve(doc, exp) { return (typeof exp === 'string' && exp.startsWith('$')) ? doc[exp.slice(1)] : exp; }

function matches(doc, rule, action) {
  return Object.entries(rule.when).every(([key, exp]) => {
    const want = resolve(doc, exp);
    const got = get(action, key);
    if (want && typeof want === 'object' && !Array.isArray(want) && Array.isArray(want.$not)) return got === undefined || !want.$not.includes(got);
    if (got === undefined) return false;
    return Array.isArray(want) ? want.includes(got) : got === want;
  });
}

function evaluate(action, doc = load()) {
  const base = { rules_version: doc.version, evaluated_at: new Date().toISOString() };
  if (!action || !action.actor_type || !action.action) {
    return { ...base, decision: 'require_approval', rule_id: 'VALIDATION', tier: 2,
      reason: 'Action description incomplete (needs actor_type and action)', matched: [] };
  }
  const hits = doc.rules.filter(r => matches(doc, r, action));
  if (!hits.length) {
    return { ...base, decision: doc.default_decision, rule_id: 'DEFAULT', tier: 3,
      reason: 'No rule matched; safe default', matched: [] };
  }
  hits.sort((a, b) => (RANK[a.decision] - RANK[b.decision]) || (a.tier - b.tier));
  const w = hits[0];
  return { ...base, decision: w.decision, rule_id: w.id, tier: w.tier, reason: w.reason, matched: hits.map(r => r.id) };
}

module.exports = { evaluate, load };

if (require.main === module) {
  try {
    const action = JSON.parse(process.argv[2] || '{}');
    console.log(JSON.stringify(evaluate(action), null, 2));
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
}

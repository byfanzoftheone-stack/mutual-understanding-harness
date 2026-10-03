// ledger.js - records every Policy Engine decision in the Decision Ledger (R12: nothing off the record).
// Append-only. Never edits or deletes existing lines.
const fs = require('fs'), path = require('path'), os = require('os');
const { evaluate } = require('./engine');
const LEDGER_PATH = () => process.env.LEDGER_PATH || path.join(os.homedir(), 'ledger/decisions.jsonl');

function entryFor(action, r) {
  return {
    id: `decision-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    actor: String(action.actor || action.actor_type || 'unknown'),
    type: 'policy_decision',
    status: r.decision,
    reasoning: `${r.rule_id}: ${r.reason}`,
    source_repo: 'policy-engine',
    workspace_ref: String(action.target || action.product || 'n/a'),
    parent_decision: action.parent_decision || null,
    evidence: [`rule:${r.rule_id}`, ...r.matched.map(m => `matched:${m}`), `rules_version:${r.rules_version}`],
    tags: ['policy-engine', `tier-${r.tier}`],
    action: { actor_type: action.actor_type, action: action.action, target: action.target || null, environment: action.environment || null, product: action.product || null }
  };
}

// Decide AND record. If the record cannot be written, the decision becomes deny (R12).
function decide(action) {
  const r = evaluate(action);
  const entry = entryFor(action || {}, r);
  try {
    fs.appendFileSync(LEDGER_PATH(), JSON.stringify(entry) + '\n');
    return { ...r, ledger_id: entry.id };
  } catch (e) {
    return { ...r, decision: 'deny', rule_id: 'R12', tier: 2,
      reason: 'Nothing happens off the record: Ledger write failed (' + e.code + ')', ledger_id: null };
  }
}

module.exports = { decide, entryFor, LEDGER_PATH };

if (require.main === module) {
  try { console.log(JSON.stringify(decide(JSON.parse(process.argv[2] || '{}')), null, 2)); }
  catch (e) { console.error('Error:', e.message); process.exit(1); }
}

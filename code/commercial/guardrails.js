// guardrails.js - human approval for spend/publish/outbound, audit logging, rate limits. Zero dependencies.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const APPROVALS = () => process.env.APPROVALS_PATH || path.resolve('ledger/approvals.jsonl');
const AUDIT = () => process.env.LEDGER_PATH || path.resolve('ledger/decisions.jsonl');
const GATED = new Set(['spend', 'publish', 'outbound_message', 'live_checkout']);
const hash = (kind, payload) => crypto.createHash('sha256').update(kind + JSON.stringify(payload)).digest('hex').slice(0, 16);
const append = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(obj) + '\n'); };
const readAll = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

function audit(event, detail) { append(AUDIT(), { ts: new Date().toISOString(), type: 'commercial_audit', event, ...detail }); }

// An agent or code path asks. Result is always "pending" until a HUMAN runs: node guardrails.js approve <id> <name>
function requestApproval(kind, payload) {
  if (!GATED.has(kind)) throw new Error('unknown gated kind: ' + kind);
  const id = hash(kind, payload);
  if (!readAll(APPROVALS()).some(r => r.id === id && r.status === 'pending')) append(APPROVALS(), { id, kind, payload, status: 'pending', ts: new Date().toISOString() });
  audit('approval_requested', { id, kind });
  return id;
}
function approve(id, approver) {
  if (!approver) throw new Error('approver name required');
  if (!readAll(APPROVALS()).some(r => r.id === id && r.status === 'pending')) throw new Error('no pending request ' + id);
  append(APPROVALS(), { id, status: 'approved', approver, ts: new Date().toISOString() }); audit('approved', { id, approver });
}
// Single-use: an approval is consumed when the action runs. Payload must be identical to what was approved.
function consume(kind, payload) {
  const id = hash(kind, payload), rows = readAll(APPROVALS()).filter(r => r.id === id);
  const approved = rows.filter(r => r.status === 'approved').length, used = rows.filter(r => r.status === 'consumed').length;
  if (approved <= used) { audit('blocked_no_approval', { id, kind }); return { allowed: false, id, reason: 'human approval required' }; }
  append(APPROVALS(), { id, status: 'consumed', ts: new Date().toISOString() }); audit('executed', { id, kind });
  return { allowed: true, id };
}

// Fixed-window in-memory limiter (per process). Use a shared store if you run more than one instance.
const buckets = new Map();
function rateLimit(key, limit, windowMs = 60000, now = Date.now()) {
  const b = buckets.get(key); if (!b || now - b.start >= windowMs) { buckets.set(key, { start: now, n: 1 }); return { ok: true, remaining: limit - 1 }; }
  if (b.n >= limit) { audit('rate_limited', { key }); return { ok: false, remaining: 0, retry_ms: windowMs - (now - b.start) }; }
  b.n++; return { ok: true, remaining: limit - b.n };
}
module.exports = { requestApproval, approve, consume, rateLimit, audit, GATED, _reset: () => buckets.clear() };
if (require.main === module) {
  const [c, a, b] = process.argv.slice(2);
  try {
    if (c === 'pending') console.log(readAll(APPROVALS()).filter(r => r.status === 'pending').map(r => `${r.id} ${r.kind} ${JSON.stringify(r.payload)}`).join('\n') || 'none');
    else if (c === 'approve') { approve(a, b); console.log('approved ' + a); }
    else { console.error('usage: pending | approve <id> <your name>'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}

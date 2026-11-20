// deliveries.js - OWNER tool for queued license keys. Never sends email or calls Stripe: you send the key yourself.
// Delivery counts as an outbound message, so it needs the repo's human approval (guardrails.js), bound to this exact key hash:
//   list                      pending deliveries (key masked)
//   request <hash>            queue an approval request (kind outbound_message)
//   node guardrails.js approve <id> <your name>     <- a human runs this
//   show <hash>               print the plaintext key (owner terminal only), to send by hand
//   deliver <hash> <approver> consumes the approval, then marks delivered and drops the plaintext
const w = require('./webhook'), g = require('./guardrails');
const payload = hash => ({ action: 'deliver_license_key', license_hash: hash });
const find = hash => { const p = w.instance().pendingDeliveries().find(x => x.hash === hash); if (!p) throw new Error('no pending delivery ' + hash); return p; };
const mask = e => e && e.includes('@') ? e[0] + '***@' + e.split('@')[1] : null;
function list() { return w.instance().pendingDeliveries().map(({ hash, tier, email }) => ({ hash, tier, email: mask(email) })); }
function request(hash) { find(hash); return g.requestApproval('outbound_message', payload(hash)); }
function show(hash) { return find(hash).key; }
function deliver(hash, approver) {
  if (!approver) throw new Error('approver name required');
  find(hash);
  const gate = g.consume('outbound_message', payload(hash));
  if (!gate.allowed) throw new Error('human approval required: run "request ' + hash + '", then guardrails.js approve <id> <name>');
  return w.instance().markDelivered(hash, approver);
}
module.exports = { list, request, show, deliver };
if (require.main === module) {
  const [c, a, b] = process.argv.slice(2);
  try {
    if (c === 'list') console.log(list().map(r => `${r.hash} ${r.tier} ${r.email || '-'}`).join('\n') || 'none');
    else if (c === 'request') console.log('approval id ' + request(a) + ' - a human must run: node code/commercial/guardrails.js approve <id> <name>');
    else if (c === 'show') console.log(show(a));
    else if (c === 'deliver') { deliver(a, b); console.log('marked delivered (plaintext dropped)'); }
    else { console.error('usage: list | request <hash> | show <hash> | deliver <hash> <approver>'); process.exit(1); }
  } catch (e) { console.error(e.message); process.exit(1); }
}

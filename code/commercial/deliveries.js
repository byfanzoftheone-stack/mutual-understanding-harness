// deliveries.js - OWNER tool for queued license keys. Never sends email or calls Stripe: you send the key yourself.
// All functions are ASYNC (the license store is async/transactional; see webhook.js). If no store is configured they throw (fail closed).
// Delivery counts as an outbound message, so it needs the repo's human approval (guardrails.js), bound to this exact key hash:
//   list                      pending deliveries (key masked)
//   request <hash>            queue an approval request (kind outbound_message)
//   node guardrails.js approve <id> <your name>     <- a human runs this
//   show <hash>               print the plaintext key (owner terminal only), to send by hand
//   deliver <hash> <approver> consumes the approval, then marks delivered and drops the plaintext
//   migrate-json <file>       one-off, idempotent import of a legacy JSON license DB into the configured store (keys stay valid)
const w = require('./webhook'), g = require('./guardrails');
const payload = hash => ({ action: 'deliver_license_key', license_hash: hash });
const find = async hash => { const p = (await (await w.instance()).pendingDeliveries()).find(x => x.hash === hash); if (!p) throw new Error('no pending delivery ' + hash); return p; };
const mask = e => e && e.includes('@') ? e[0] + '***@' + e.split('@')[1] : null;
async function list() { return (await (await w.instance()).pendingDeliveries()).map(({ hash, tier, email }) => ({ hash, tier, email: mask(email) })); }
async function request(hash) { await find(hash); return g.requestApproval('outbound_message', payload(hash)); }
async function show(hash) { return (await find(hash)).key; }
async function deliver(hash, approver) {
  if (!approver) throw new Error('approver name required');
  await find(hash);
  const gate = g.consume('outbound_message', payload(hash)); // human approval, single use, bound to this hash
  if (!gate.allowed) throw new Error('human approval required: run "request ' + hash + '", then guardrails.js approve <id> <name>');
  return (await w.instance()).markDelivered(hash, approver);
}
// Import a legacy JSON DB (old synchronous JsonStore format) into the store chosen by the environment. Idempotent. Prints counts only, never keys.
async function migrateJson(file) {
  if (!file) throw new Error('usage: migrate-json <file>');
  if (!require('fs').existsSync(file)) throw new Error('no such file: ' + file);
  const lw = await import('./license-webhook/async.mjs');
  let store;
  try { store = await lw.storeFromEnv(process.env); } catch (e) { throw new Error('cannot migrate: ' + e.message); }
  if (store.constructor.name === 'JsonFileStore') throw new Error('migrate-json target must be SQLite (LICENSE_DB=/path/x.sqlite) or Postgres (LICENSE_DATABASE_URL), not a JSON file');
  try { return await lw.migrateFromLegacyJson(file, store); } finally { if (store.close) store.close(); else if (store.pool && store.pool.end) await store.pool.end(); }
}
module.exports = { list, request, show, deliver, migrateJson };
if (require.main === module) {
  const [c, a, b] = process.argv.slice(2);
  (async () => {
    if (c === 'list') console.log((await list()).map(r => `${r.hash} ${r.tier} ${r.email || '-'}`).join('\n') || 'none');
    else if (c === 'request') console.log('approval id ' + await request(a) + ' - a human must run: node code/commercial/guardrails.js approve <id> <name>');
    else if (c === 'show') console.log(await show(a));
    else if (c === 'deliver') { await deliver(a, b); console.log('marked delivered (plaintext dropped)'); }
    else if (c === 'migrate-json') { const n = await migrateJson(a); console.log(`migrated: ${n.licenses} licenses, ${n.outbox} outbox, ${n.events} events`); }
    else { console.error('usage: list | request <hash> | show <hash> | deliver <hash> <approver> | migrate-json <file>'); process.exit(1); }
  })().catch(e => { console.error(e.message); process.exit(1); });
}

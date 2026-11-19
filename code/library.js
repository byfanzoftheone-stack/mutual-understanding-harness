// library.js - RAT-014 (proposed): the Library of governed designs, skills, loops and tools (see LIBRARY.md).
// Every entry carries a WHY, a G12 scope (where, what kind of work, until when, who approved), a review date and the action it
// declares. The policy engine decides what that action is allowed to do. Only a person ratifies. The registry is append-only:
// an entry's state is the fold of its lines, and nothing is edited or deleted.
const fs = require('fs'), path = require('path');
const { evaluate } = require('./engine');
const { LEDGER_PATH } = require('./ledger');

const DIR = () => process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
const RULES = () => JSON.parse(fs.readFileSync(process.env.LIBRARY_RULES || path.join(__dirname, 'rules', 'general.json'), 'utf8'));
const PLACEHOLDER = '_To be written._';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANSWER = { allow: 'proceed', require_approval: 'ask', deny: 'refuse' };

// Kinds are data: add one in library/kinds.json (dir, headings, needs) and it is governed like the rest, with no code change.
const DEFAULT_KINDS = {
  design: { dir: 'designs', needs: [], headings: ['Purpose', 'Who it serves', 'Ask, proceed, refuse', 'What could go wrong', 'How we will understand an incident', 'Exit'] },
  skill: { dir: 'skills', needs: ['declares'], headings: ['Purpose', 'When to use', 'Steps', 'Ask first when', 'Refuses when', 'Exit'] },
  loop: { dir: 'loops', needs: ['declares', 'every', 'exit'], headings: ['Purpose', 'Each pass', 'Stop and ask when', 'Exit'] },
  tool: { dir: 'tools', needs: ['declares'], headings: ['Purpose', 'Interface', 'Reads and writes', 'Refuses when', 'Exit'] }
};
function kinds() {
  try { return { ...DEFAULT_KINDS, ...JSON.parse(fs.readFileSync(path.join(DIR(), 'kinds.json'), 'utf8')) }; }
  catch (e) { if (e.code === 'ENOENT') return DEFAULT_KINDS; throw new Error('library/kinds.json could not be read: ' + e.message); }
}

const str = v => typeof v === 'string' && v.trim().length > 0;
const oneLine = v => str(v) && !/[\r\n]/.test(v);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const today = t => t || new Date().toISOString().slice(0, 10);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function govern(declares) {
  const a = declares || { action: 'draft' };
  const r = evaluate({ actor_type: 'agent', ...a }, RULES());
  return { decision: r.decision, answer: ANSWER[r.decision], rule_id: r.rule_id, reason: r.reason };
}

function readJsonl(file) {
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
const registryPath = () => path.join(DIR(), 'registry.jsonl');
function append(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, JSON.stringify(obj) + '\n'); }

// An entry's state is the fold of its registry lines, oldest first.
function entries() {
  const map = new Map();
  for (const l of readJsonl(registryPath())) {
    if (l.event === 'forged') map.set(l.id, { ...l.entry, id: l.id, status: 'proposed', forged_at: l.ts, forged_by: l.actor, history: [l.event] });
    else if (map.has(l.id)) {
      const e = map.get(l.id); e.history.push(l.event);
      if (l.event === 'ratified') { e.status = 'ratified'; e.released_by = l.released_by; e.review_by = l.review_by; e.scope = { ...e.scope, approved_by: l.released_by }; }
      if (l.event === 'revisited') { e.review_by = l.review_by; e.released_by = l.released_by; }
      if (l.event === 'retired') { e.status = 'retired'; e.retired_by = l.released_by; e.retired_reason = l.reason; }
    }
  }
  return map;
}

function ledger(event, id, e, by, extra) {
  const g = e.governed || {};
  append(LEDGER_PATH(), {
    id: `library-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`, timestamp: new Date().toISOString(), actor: String(by),
    type: 'library_entry', status: event, reasoning: `${e.kind} ${e.name}: ${e.why}`, source_repo: 'mutual-understanding-harness', parent_decision: null,
    evidence: [`entry:${id}`, `kind:${e.kind}`, `event:${event}`, `governed:${g.decision}`, `rule:${g.rule_id}`, ...(extra || [])], tags: ['library', e.kind, event]
  });
}

function validateForge(s, K, t) {
  const p = [];
  if (!isObj(s)) return ['entry must be an object'];
  const allowed = ['kind', 'name', 'why', 'scope', 'declares', 'review_by', 'every', 'exit', 'created_by'];
  for (const k of Object.keys(s)) if (!allowed.includes(k)) p.push(`"${k}" is not part of an entry`);
  if (!K[s.kind]) p.push('kind: one of ' + Object.keys(K).join(', '));
  if (!oneLine(s.name)) p.push('name: one line');
  if (!oneLine(s.why)) p.push('why: one line saying why this exists (every rule and every entry gets a WHY)');
  if (!oneLine(s.created_by)) p.push('created_by: who or what forged it');
  const sc = s.scope;
  if (!isObj(sc)) p.push('scope: where, work, until (the approval itself comes when a person ratifies)');
  else {
    for (const k of ['where', 'work']) if (!oneLine(sc[k])) p.push(`scope.${k}: one line`);
    if (!(str(sc.until) && DATE.test(sc.until))) p.push('scope.until: YYYY-MM-DD, nothing here is open-ended');
    else if (sc.until <= t) p.push('scope.until: must be after today');
    for (const k of Object.keys(sc)) if (!['where', 'work', 'until'].includes(k)) p.push(`scope.${k}: approved_by is set only by a person's ratification`);
  }
  if (!(str(s.review_by) && DATE.test(s.review_by))) p.push('review_by: YYYY-MM-DD');
  else if (s.review_by <= t) p.push('review_by: must be after today');
  else if (isObj(sc) && DATE.test(sc.until || '') && s.review_by > sc.until) p.push('review_by: must be on or before scope.until');
  const needs = (K[s.kind] || {}).needs || [];
  if (needs.includes('declares') && !(isObj(s.declares) && str(s.declares.action))) p.push('declares: the riskiest action it would take, in the action vocabulary (code/harness/action-schema.json)');
  if (s.declares !== undefined && !isObj(s.declares)) p.push('declares: must be an object');
  for (const k of ['every', 'exit']) {
    if (needs.includes(k) && !oneLine(s[k])) p.push(`${k}: a ${s.kind} needs one` + (k === 'exit' ? ' (a loop with no exit is not allowed)' : ''));
    else if (s[k] !== undefined && !oneLine(s[k])) p.push(`${k}: one line`);
  }
  return p;
}

function template(id, e, K) {
  const front = ['---', `id: ${id}`, `kind: ${e.kind}`, 'status: proposed (a person must ratify it)', `why: ${e.why}`,
    `scope: where=${e.scope.where}; work=${e.scope.work}; until=${e.scope.until}; approved_by=(not yet approved)`, `review_by: ${e.review_by}`,
    `governed: ${e.governed.answer} (${e.governed.rule_id}: ${e.governed.reason})`, ...(e.every ? [`every: ${e.every}`] : []), ...(e.exit ? [`exit: ${e.exit}`] : []), '---'];
  return front.join('\n') + `\n\n# ${e.name}\n\n` + K[e.kind].headings.map(h => `## ${h}\n${PLACEHOLDER}\n`).join('\n');
}
const fileOf = (id, e, K) => path.join(K[e.kind].dir, id + '.md');

function forge(spec, opts) {
  const t = today(opts && opts.today);
  let K; try { K = kinds(); } catch (e) { return { ok: false, problems: [e.message] }; }
  const problems = validateForge(spec, K, t);
  if (problems.length) return { ok: false, problems };
  const id = `${spec.kind}-${slug(spec.name)}`;
  if (id === `${spec.kind}-`) return { ok: false, problems: ['name: needs letters or numbers'] };
  if (entries().has(id)) return { ok: false, problems: [`${id} already exists. A change is a revisit or a new entry, never an overwrite.`] };
  const entry = { kind: spec.kind, name: spec.name, why: spec.why, scope: { ...spec.scope }, declares: spec.declares, review_by: spec.review_by, every: spec.every, exit: spec.exit, governed: govern(spec.declares) };
  entry.file = path.join('library', fileOf(id, entry, K));
  const abs = path.join(DIR(), fileOf(id, entry, K));
  if (fs.existsSync(abs)) return { ok: false, problems: [`${entry.file} already exists; nothing was overwritten.`] };
  const done = [];
  try {
    append(registryPath(), { id, ts: new Date().toISOString(), event: 'forged', actor: spec.created_by, entry }); done.push('registry');
    ledger('forged', id, entry, spec.created_by); done.push('ledger');
    fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, template(id, entry, K), { flag: 'wx' }); done.push('file');
  } catch (e) {
    return { ok: false, problems: [`Stopped (${e.code || e.message}). Written so far: ${done.join(', ') || 'nothing'}. Nothing is claimed as recorded beyond that.`], partial: done, id };
  }
  return { ok: true, id, file: entry.file, status: 'proposed', governed: entry.governed, headings: K[spec.kind].headings };
}

function fileProblems(e, K) {
  const abs = path.join(DIR(), fileOf(e.id, e, K));
  let text; try { text = fs.readFileSync(abs, 'utf8'); } catch (err) { return ['file missing: ' + e.file]; }
  const out = [];
  for (const h of K[e.kind].headings) {
    const m = text.match(new RegExp('^## ' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))', 'm'));
    if (!m) out.push(`missing section "${h}"`);
    else if (m[1].includes(PLACEHOLDER) || !m[1].trim()) out.push(`section "${h}" is still empty`);
  }
  return out;
}

function ratify(id, a, opts) {
  const t = today(opts && opts.today), e = entries().get(id), K = kinds();
  if (!e) return { ok: false, problems: ['No entry has the id ' + id] };
  if (e.status !== 'proposed') return { ok: false, problems: [`${id} is ${e.status}. Only a proposed entry is ratified.`] };
  const p = [];
  if (!isObj(a) || !oneLine(a.released_by)) p.push('released_by: a person signs; nothing promotes itself');
  const review = (a && a.review_by) || e.review_by;
  if (!(DATE.test(review || '') && review > t)) p.push('review_by: a date after today');
  else if (review > e.scope.until) p.push('review_by: must be on or before scope.until');
  const g = govern(e.declares);
  if (g.decision === 'deny') p.push(`The rules refuse what this declares (${g.rule_id}: ${g.reason}). Change the rule by ratification, not through the Library.`);
  p.push(...fileProblems(e, K).map(x => 'not ready: ' + x));
  if (p.length) return { ok: false, problems: p };
  const line = { id, ts: new Date().toISOString(), event: 'ratified', actor: a.released_by, released_by: a.released_by, review_by: review };
  try { append(registryPath(), line); ledger('ratified', id, { ...e, governed: g }, a.released_by, [`released_by:${a.released_by}`]); }
  catch (err) { return { ok: false, problems: ['Not recorded: ' + (err.code || err.message)] }; }
  return { ok: true, id, status: 'ratified', answer: g.answer, note: g.answer === 'proceed' ? 'Proceeds inside its approved scope only.' : 'Each use still asks a person.' };
}

function revisit(id, a, opts) {
  const t = today(opts && opts.today), e = entries().get(id);
  if (!e) return { ok: false, problems: ['No entry has the id ' + id] };
  if (e.status !== 'ratified') return { ok: false, problems: [`${id} is ${e.status}. Only a ratified entry is revisited.`] };
  const p = [];
  if (!isObj(a) || !oneLine(a.released_by)) p.push('released_by: a person re-decides');
  if (!oneLine(a && a.note)) p.push('note: one line on what was looked at');
  if (!(DATE.test((a && a.review_by) || '') && a.review_by > t)) p.push('review_by: a date after today');
  else if (a.review_by > e.scope.until) p.push('review_by: must be on or before scope.until. To go further, forge a new entry with a new scope.');
  if (p.length) return { ok: false, problems: p };
  try { append(registryPath(), { id, ts: new Date().toISOString(), event: 'revisited', actor: a.released_by, released_by: a.released_by, review_by: a.review_by, note: a.note }); ledger('revisited', id, { ...e, governed: govern(e.declares) }, a.released_by, [`note:${a.note.slice(0, 120)}`]); }
  catch (err) { return { ok: false, problems: ['Not recorded: ' + (err.code || err.message)] }; }
  return { ok: true, id, review_by: a.review_by };
}

function retire(id, a) {
  const e = entries().get(id);
  if (!e) return { ok: false, problems: ['No entry has the id ' + id] };
  if (e.status === 'retired') return { ok: false, problems: [id + ' is already retired.'] };
  const p = [];
  if (!isObj(a) || !oneLine(a.released_by)) p.push('released_by: a person retires');
  if (!oneLine(a && a.reason)) p.push('reason: one line');
  if (p.length) return { ok: false, problems: p };
  try { append(registryPath(), { id, ts: new Date().toISOString(), event: 'retired', actor: a.released_by, released_by: a.released_by, reason: a.reason }); ledger('retired', id, { ...e, governed: e.governed }, a.released_by, [`reason:${a.reason.slice(0, 120)}`]); }
  catch (err) { return { ok: false, problems: ['Not recorded: ' + (err.code || err.message)] }; }
  return { ok: true, id, status: 'retired' };
}

// Can this entry be used now? An answer, never a guess: proceed, ask or refuse, with the reason.
function gate(id, opts) {
  const t = today(opts && opts.today), e = entries().get(id);
  if (!e) return { answer: 'refuse', reason: `No entry ${id} in the Library.` };
  if (e.status === 'retired') return { answer: 'refuse', reason: `${id} was retired: ${e.retired_reason}.` };
  if (e.status !== 'ratified') return { answer: 'ask', reason: `${id} is only proposed. A person has to ratify it before it is used.` };
  if (e.scope.until < t) return { answer: 'refuse', reason: `${id}'s approved scope ended ${e.scope.until}.` };
  if (e.review_by <= t) return { answer: 'ask', reason: `${id} is due for a person to re-decide (review date ${e.review_by}).` };
  const g = govern(e.declares);
  if (g.answer === 'refuse') return { answer: 'refuse', reason: `${g.rule_id}: ${g.reason}`, rule_id: g.rule_id };
  return { answer: g.answer, reason: g.answer === 'proceed' ? `Inside its approved scope (${e.scope.where}; ${e.scope.work}; until ${e.scope.until}; approved by ${e.scope.approved_by}).` : `${g.rule_id}: ${g.reason}`, rule_id: g.rule_id };
}

function report(opts) {
  const t = today(opts && opts.today), K = kinds(), all = [...entries().values()];
  const rows = all.map(e => {
    const g = e.status === 'retired' ? null : govern(e.declares), problems = [];
    if (e.status !== 'retired') {
      if (e.status === 'ratified') problems.push(...fileProblems(e, K));
      if (!fs.existsSync(path.join(DIR(), fileOf(e.id, e, K)))) problems.push('file missing: ' + e.file);
      if (g && e.governed && g.decision !== e.governed.decision) problems.push(`the rules changed: forged as ${e.governed.answer}, now ${g.answer} (${g.rule_id})`);
    }
    return { id: e.id, kind: e.kind, name: e.name, status: e.status, answer: g && g.answer, review_by: e.review_by, until: e.scope.until, due: e.status === 'ratified' && e.review_by <= t, ended: e.status === 'ratified' && e.scope.until < t, problems: [...new Set(problems)] };
  });
  const count = f => rows.filter(f).length;
  return { as_of: t, total: rows.length, proposed: count(r => r.status === 'proposed'), ratified: count(r => r.status === 'ratified'), retired: count(r => r.status === 'retired'), due: count(r => r.due), ended: count(r => r.ended), with_problems: count(r => r.problems.length), rows };
}

function print(r) {
  const o = [`Library (as of ${r.as_of}): ${r.ratified} ratified, ${r.proposed} proposed, ${r.retired} retired. Due for a person: ${r.due}. Scope ended: ${r.ended}. With problems: ${r.with_problems}.`];
  for (const x of r.rows) o.push(`  ${x.id}  [${x.status}${x.due ? ', DUE' : ''}${x.ended ? ', ENDED' : ''}]  ${x.status === 'retired' ? 'retired' : 'answers ' + x.answer}  review ${x.review_by}${x.problems.length ? '\n      ! ' + x.problems.join('\n      ! ') : ''}`);
  if (!r.rows.length) o.push('  (empty: /forge a design, skill, loop or tool)');
  return o.join('\n');
}

module.exports = { forge, ratify, revisit, retire, gate, report, print, entries, govern, kinds, DEFAULT_KINDS, PLACEHOLDER };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  const J = j => { try { return JSON.parse(j); } catch (e) { console.error('Error: the argument must be JSON'); process.exit(1); } };
  const out = r => { if (r.ok === false) { console.error('Refused:\n- ' + r.problems.join('\n- ')); process.exit(1); } console.log(JSON.stringify(r)); };
  if (cmd === 'forge') out(forge(J(a)));
  else if (cmd === 'ratify') out(ratify(a, J(b)));
  else if (cmd === 'revisit') out(revisit(a, J(b)));
  else if (cmd === 'retire') out(retire(a, J(b)));
  else if (cmd === 'gate') console.log(JSON.stringify(gate(a, { today: b })));
  else if (cmd === 'report') console.log(JSON.stringify(report({ today: a })));
  else if (cmd === 'list') console.log(print(report({ today: a })));
  else { console.error('Usage: library.js forge <json> | ratify <id> <json> | revisit <id> <json> | retire <id> <json> | gate <id> [date] | list [date] | report [date]'); process.exit(1); }
}

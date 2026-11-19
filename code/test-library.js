// test-library.js - RAT-014 (proposed): proves the Library is governed by the real policy engine, that only a person ratifies,
// that an empty scaffold cannot be ratified, that a loop cannot be forged without an exit, and that nothing is ever overwritten.
// Needs no private files.
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'library-test-'));
process.env.LIBRARY_DIR = path.join(tmp, 'library'); process.env.LEDGER_PATH = path.join(tmp, 'ledger', 'decisions.jsonl');
const L = require('./library');
let pass = 0, total = 0; const t = (n, ok) => { total++; if (ok) pass++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };
const T = { today: '2026-11-19' };
const lines = f => fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
const reg = () => lines(path.join(process.env.LIBRARY_DIR, 'registry.jsonl')), led = () => lines(process.env.LEDGER_PATH);
const base = { kind: 'design', name: 'Weekly review design', why: 'People should see what the week held before the next one starts.', scope: { where: 'the harness repo docs', work: 'drafting', until: '2026-12-31' }, review_by: '2026-12-01', created_by: 'Claude (session)' };
const fill = id => { const f = path.join(process.env.LIBRARY_DIR, L.entries().get(id).file.replace(/^library[\\/]/, '')); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(L.PLACEHOLDER).join('Written.')); return f; };

// Forging
const d = L.forge(base, T);
t('a design forges as proposed, with a file, a registry line and a Ledger line', d.ok && d.status === 'proposed' && reg().length === 1 && led().length === 1 && fs.existsSync(path.join(process.env.LIBRARY_DIR, 'designs', d.id + '.md')));
t('the id is the kind and the name, so it reads', d.id === 'design-weekly-review-design');
t('a design with no declared action is a draft, and the engine says proceed (G12c)', d.governed.answer === 'proceed' && d.governed.rule_id === 'G12c');
t('the Ledger line says what was forged, by whom, and what the rules said', led()[0].actor === 'Claude (session)' && led()[0].evidence.includes('governed:allow') && led()[0].type === 'library_entry');
t('the scaffold lists every required section, each empty', d.headings.every(h => fs.readFileSync(path.join(process.env.LIBRARY_DIR, 'designs', d.id + '.md'), 'utf8').includes('## ' + h)));
t('nothing is overwritten: the same name is refused', !L.forge(base, T).ok && reg().length === 1);
t('there is nowhere to set approved_by when forging', !L.forge({ ...base, name: 'x one', scope: { ...base.scope, approved_by: 'me' } }, T).ok);
t('every entry needs a WHY, a created_by and a scope', ['why', 'created_by', 'scope', 'name'].every(k => { const { [k]: _, ...rest } = base; return !L.forge({ ...rest, name: k === 'name' ? undefined : 'no ' + k }, T).ok; }));
t('nothing is open-ended: scope.until and review_by are required dates after today', !L.forge({ ...base, name: 'a', scope: { ...base.scope, until: '2026-11-01' } }, T).ok && !L.forge({ ...base, name: 'b', review_by: '2026-11-19' }, T).ok);
t('review_by cannot be after scope.until', !L.forge({ ...base, name: 'c', review_by: '2027-02-01' }, T).ok);
t('an unknown kind is refused', !L.forge({ ...base, name: 'd', kind: 'wizard' }, T).ok);
t('a field the entry does not define is refused', !L.forge({ ...base, name: 'e', rank: 1 }, T).ok);

// Skills, loops and tools need what the rules need
const skill = { ...base, kind: 'skill', name: 'Summarize notes', declares: { action: 'read', target: 'internal_docs' } };
t('a skill must declare its action', !L.forge({ ...skill, declares: undefined }, T).ok);
const s = L.forge(skill, T);
t('a read of internal docs is a proceed (G12a)', s.ok && s.governed.answer === 'proceed' && s.governed.rule_id === 'G12a');
const loop = { ...base, kind: 'loop', name: 'Nightly triage', declares: { action: 'read', target: 'audit_log' }, every: 'each night at 02:00', exit: 'Stops after 30 passes or when a person says so' };
t('a loop with no exit is not allowed', !L.forge({ ...loop, exit: undefined }, T).ok);
t('a loop with no cadence is not allowed', !L.forge({ ...loop, every: undefined }, T).ok);
t('a complete loop forges', L.forge(loop, T).ok);
t('a message to someone outside is ask (G9), whatever the entry says it is for', L.forge({ ...skill, name: 'Email vendors', declares: { action: 'send_message', flags: { external_recipient: true } } }, T).governed.answer === 'ask');
const child = L.forge({ ...skill, kind: 'tool', name: 'Export school data', declares: { action: 'export', flags: { touches_minor_data: true, internal_only: true } } }, T);
t('exporting data about children is refuse even inside the organization (G11c)', child.ok && child.governed.answer === 'refuse' && child.governed.rule_id === 'G11c');
t('a secret in the output is refuse (G2)', L.forge({ ...skill, kind: 'tool', name: 'Print keys', declares: { action: 'output', flags: { contains_secret: true } } }, T).governed.answer === 'refuse');

// Ratifying: only a person, only when it is ready, never what the rules refuse
t('an empty scaffold cannot be ratified', (r => !r.ok && r.problems.some(p => p.includes('still empty')))(L.ratify(d.id, { released_by: 'Travis Jacobs' }, T)));
t('ratifying needs a named person', !L.ratify(d.id, {}, T).ok && !L.ratify(d.id, { released_by: '' }, T).ok);
t('what the rules refuse cannot be ratified, and the message says to change the rule by ratification', (r => !r.ok && r.problems.some(p => p.includes('G11c') && p.includes('ratification')))(L.ratify(child.id, { released_by: 'Travis Jacobs' }, T)));
t('an entry missing from the Library is refused', !L.ratify('design-nope', { released_by: 'x' }, T).ok);
const before = fs.readFileSync(path.join(process.env.LIBRARY_DIR, 'registry.jsonl'), 'utf8');
fill(d.id);
t('a written design ratifies when a person signs it', L.ratify(d.id, { released_by: 'Travis Jacobs' }, T).ok);
const after = fs.readFileSync(path.join(process.env.LIBRARY_DIR, 'registry.jsonl'), 'utf8');
t('append-only: every earlier byte of the registry is unchanged', after.startsWith(before) && after.length > before.length);
t('the entry now carries who approved it, in the scope', L.entries().get(d.id).scope.approved_by === 'Travis Jacobs' && L.entries().get(d.id).status === 'ratified');
t('the Ledger carries the ratification with the person', led().some(l => l.status === 'ratified' && l.actor === 'Travis Jacobs'));
t('ratifying twice is refused', !L.ratify(d.id, { released_by: 'Travis Jacobs' }, T).ok);

// The gate: proceed, ask or refuse, with the reason
t('gate: an unknown entry is refuse', L.gate('skill-nope', T).answer === 'refuse');
t('gate: a proposed entry is ask, not proceed', L.gate(s.id, T).answer === 'ask' && /only proposed/.test(L.gate(s.id, T).reason));
t('gate: a ratified design proceeds inside its scope and names who approved it', (g => g.answer === 'proceed' && g.reason.includes('Travis Jacobs'))(L.gate(d.id, T)));
fill(s.id); L.ratify(s.id, { released_by: 'Travis Jacobs' }, T);
t('gate: a ratified skill that reads internal docs proceeds', L.gate(s.id, T).answer === 'proceed');
const ext = L.forge({ ...skill, name: 'Email vendors two', declares: { action: 'send_message', flags: { external_recipient: true } } }, T);
fill(ext.id); L.ratify(ext.id, { released_by: 'Travis Jacobs' }, T);
t('gate: a ratified entry that sends outside still asks on every use (G9)', L.gate(ext.id, T).answer === 'ask');
t('gate: past its review date it asks a person to re-decide', (g => g.answer === 'ask' && /re-decide/.test(g.reason))(L.gate(d.id, { today: '2026-12-01' })));
t('gate: past its approved scope it refuses', L.gate(d.id, { today: '2027-01-01' }).answer === 'refuse');

// Revisit and retire
t('a revisit needs a person, a note and a later date', !L.revisit(d.id, { released_by: 'T', review_by: '2026-12-15' }, T).ok && !L.revisit(d.id, { released_by: 'T', note: 'n', review_by: '2026-11-01' }, T).ok);
t('a revisit cannot run past the approved scope', !L.revisit(d.id, { released_by: 'T', note: 'n', review_by: '2027-03-01' }, T).ok);
t('a person revisiting moves the review date, and the gate proceeds again', L.revisit(d.id, { released_by: 'Travis Jacobs', note: 'Read it; still right.', review_by: '2026-12-20' }, T).ok && L.gate(d.id, { today: '2026-12-01' }).answer === 'proceed');
t('a proposed entry cannot be revisited', !L.revisit(child.id, { released_by: 'T', note: 'n', review_by: '2026-12-20' }, T).ok);
t('retiring needs a person and a reason', !L.retire(s.id, { released_by: 'T' }).ok && !L.retire(s.id, { reason: 'r' }).ok);
t('a retired entry is refuse, with the reason', L.retire(s.id, { released_by: 'Travis Jacobs', reason: 'Replaced by a better one' }).ok && (g => g.answer === 'refuse' && g.reason.includes('Replaced'))(L.gate(s.id, T)));
t('a retired entry stays in the registry: nothing is deleted', L.entries().has(s.id) && reg().filter(l => l.id === s.id).length === 3);

// The report
const r = L.report({ today: '2026-12-02' });
t('the report counts by state, and shows what is due', r.total === L.entries().size && r.retired === 1 && r.ratified >= 2 && r.proposed >= 1);
t('the report names an entry whose review date has passed', L.report({ today: '2026-12-25' }).rows.find(x => x.id === d.id).due === true);
t('the report flags a missing file', (() => { const f = path.join(process.env.LIBRARY_DIR, 'designs', d.id + '.md'); const keep = fs.readFileSync(f, 'utf8'); fs.unlinkSync(f); const bad = L.report(T).rows.find(x => x.id === d.id).problems.some(p => p.includes('file missing')); fs.writeFileSync(f, keep); return bad; })());
t('the report flags a section emptied after ratification', (() => { const f = path.join(process.env.LIBRARY_DIR, 'designs', d.id + '.md'); const keep = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, keep.replace('Written.', L.PLACEHOLDER)); const bad = L.report(T).rows.find(x => x.id === d.id).problems.some(p => p.includes('still empty')); fs.writeFileSync(f, keep); return bad; })());
t('the report flags an entry whose answer changed because the rules did', (() => { const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'rules', 'general.json'), 'utf8')); rules.rules = rules.rules.filter(x => x.id !== 'G12c'); const alt = path.join(tmp, 'rules.json'); fs.writeFileSync(alt, JSON.stringify(rules)); process.env.LIBRARY_RULES = alt; const row = L.report(T).rows.find(x => x.id === d.id); delete process.env.LIBRARY_RULES; return row.problems.some(p => p.includes('rules changed')); })());
t('the report prints in plain words', /ratified, \d+ proposed/.test(L.print(r)));

// A new kind needs no code
fs.writeFileSync(path.join(process.env.LIBRARY_DIR, 'kinds.json'), JSON.stringify({ morph: { dir: 'morphs', needs: ['declares'], headings: ['Purpose', 'From', 'To', 'Exit'] } }));
const m = L.forge({ ...base, kind: 'morph', name: 'Draft to brief', declares: { action: 'draft' } }, T);
t('a kind added in library/kinds.json is governed like the rest, with no code change', m.ok && m.governed.answer === 'proceed' && fs.readFileSync(path.join(process.env.LIBRARY_DIR, 'morphs', m.id + '.md'), 'utf8').includes('## From'));
t('the built-in kinds still work beside it', L.forge({ ...base, name: 'Another design' }, T).ok);
fs.writeFileSync(path.join(process.env.LIBRARY_DIR, 'kinds.json'), '{ nope');
t('a broken kinds file is a plain refusal, not a crash', (r => !r.ok && r.problems[0].includes('kinds.json'))(L.forge({ ...base, name: 'Yet another' }, T)));
fs.unlinkSync(path.join(process.env.LIBRARY_DIR, 'kinds.json'));

// Honest about failure
process.env.LEDGER_PATH = path.join(tmp, 'file-not-dir', 'decisions.jsonl'); fs.writeFileSync(path.join(tmp, 'file-not-dir'), 'x');
const bad = L.forge({ ...base, name: 'Ledger breaks' }, T);
t('if the Ledger cannot be written, it says exactly what was and was not written', !bad.ok && bad.partial.join() === 'registry' && /Written so far: registry/.test(bad.problems[0]));

console.log(`\n${pass}/${total} passed`); process.exit(pass === total ? 0 : 1);

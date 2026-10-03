// test-general-harness.js - proves the shuffled general harness deals, balances, scores, and records correctly.
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-test-')); process.env.LEDGER_PATH = path.join(tmp, 'decisions.jsonl');
const G = require('./general-harness'); const L = G.load();
let pass = 0, total = 0; const t = (n, ok) => { total++; if (ok) pass++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };
const d = G.deal(L), d2 = G.deal(L);
t('all 60 answer keys match the rules', G.check(L).every(x => x.ok));
t('deal: three sheets of 19 plus 3 set aside', d.sheets.every(s => s.length === 19) && d.setAside.length === 3);
t('deal: every scenario used exactly once', new Set([...d.sheets.flat(), ...d.setAside]).size === 60);
t('same seed gives the same deal (S2)', JSON.stringify(d.sheets) === JSON.stringify(d2.sheets) && d.used === d2.used);
t('every sheet is balanced (S3)', G.balanced(L, d.sheets));
t('holdout cards never appear on a sheet (S4)', d.setAside.every(id => !d.sheets.flat().includes(id)));
const ideal = sheet => d.sheets[sheet - 1].map(id => id + ' ' + { allow: 'proceed', require_approval: 'ask', deny: 'refuse' }[L.byId[id].expected]).join('\n');
t('perfect answers: every scored item correct and every safety stop held, on every sheet', [1, 2, 3].every(n => { const s = G.score(L, d, n, G.parse(ideal(n))); return s.correct === s.total && s.safety.held === s.safety.total && s.total + s.safety.total === 19; }));
const all = w => d.sheets[0].map(id => id + ' ' + w).join(' ');
const refuse = G.score(L, d, 1, G.parse(all('refuse'))), proceed = G.score(L, d, 1, G.parse(all('proceed')));
t('always-refuse is caught as too cautious', refuse.too_cautious > 0 && refuse.unsafe === 0);
t('always-proceed is caught as unsafe', proceed.unsafe > 0);
const two = Object.values(L.byId).find(s => s.accept); const d3 = G.deal(L); const sheetOf = [0, 1, 2].find(i => d3.sheets[i].includes(two.id));
if (sheetOf !== undefined) { const both = two.accept.map(k => G.score(L, d3, sheetOf + 1, G.parse(two.id + ' ' + { allow: 'proceed', require_approval: 'ask', deny: 'refuse' }[k])).rows.find(r => r.id === two.id).result); t('two-answer scenario accepts both answers', both.every(r => r === 'correct')); } else t('two-answer scenario accepts both answers (in holdout this seed)', true);
t('one-line replies are read in full', Object.keys(G.parse('X01 ask X02 refuse X03 proceed')).length === 3);
const id = G.record(L, d, 1, 'test-agent', G.score(L, d, 1, G.parse(ideal(1)))); const line = JSON.parse(fs.readFileSync(process.env.LEDGER_PATH, 'utf8').trim());
t('Ledger entry records seed, sheet, mixer, rules, and scenario fingerprints', line.id === id && ['seed_used:', 'sheet:', 'mixer:fanzo-shuffle-1.0:', 'rules:g-0.5:', 'scenarios:gs-0.6:'].every(p => line.evidence.some(e => e.startsWith(p))));
process.env.LEDGER_PATH = path.join(tmp, 'nope', 'x.jsonl'); let threw = false; try { G.record(L, d, 1, 'x', G.score(L, d, 1, {})); } catch (e) { threw = true; }
t('unwritable Ledger means the score does not count', threw);
console.log(`\n${pass}/${total} passed (reference seed ${d.used}, ${d.attempts} deal(s) tried)`); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(pass === total ? 0 : 1);

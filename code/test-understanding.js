// test-understanding.js - RAT-013 (proposed): proves a review can be opened and closed, that a limit cannot be recorded without an exit,
// that there is nowhere to write blame, and that the Ledger stays append-only. Needs no private files.
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-')); process.env.LEDGER_PATH = path.join(tmp, 'decisions.jsonl');
const U = require('./understanding');
let pass = 0, total = 0; const t = (n, ok) => { total++; if (ok) pass++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); };
const lines = () => fs.readFileSync(process.env.LEDGER_PATH, 'utf8').trim().split('\n').map(JSON.parse);
const base = { date: '2026-10-01', recorded_by: 'maintainer', kind: 'near_miss', what_happened: 'The AI proceeded on an export it believed was internal; a person caught it before it left.' };
const closing = { ai_understood: 'I read "the team" as everyone in the workspace.', human_understood: 'I meant the three named people and assumed that was obvious.', gaps: ['unclear_scope'],
  response: { step: 'say', what: 'The ask now names the people. Scope is approved in four parts.' }, checked: 'Reran the same situation in a sealed room: the AI asked.', released_by: 'Travis Jacobs' };

// Opening
t('a review opens with only the facts of the incident', U.open(base).ok);
t('opening needs a date, who recorded it, a kind and what happened', ['date', 'recorded_by', 'kind', 'what_happened'].every(k => { const { [k]: _, ...rest } = base; return !U.open(rest).ok; }));
t('an unknown kind is refused', !U.open({ ...base, kind: 'bad_ai' }).ok);
t('there is nowhere to write blame, a score or a rank', ['fault', 'blame', 'culprit', 'score', 'rank', 'grade', 'penalty'].every(k => { const r = U.open({ ...base, [k]: 'x' }); return !r.ok && r.problems.some(p => p.includes(k)); }));
t('the same holds inside the response and the restraint', !U.open({ ...base, response: { step: 'say', what: 'x', blame: 'y' } }).ok);
const openId = lines()[0].id;
t('the open line is typed, open, and points to nothing', lines()[0].type === 'understanding_review' && lines()[0].status === 'open' && lines()[0].parent_decision === null);

// Closing
t('closing needs a person\'s name', !U.close(openId, { ...closing, released_by: '' }).ok);
t('closing needs both readings, or an honest "not provided" with a reason', !U.close(openId, { ...closing, human_understood: undefined }).ok && !U.close(openId, { ...closing, human_understood: { not_provided: '' } }).ok);
t('closing needs a check, even if only to say it cannot be tested', !U.close(openId, { ...closing, checked: '  ' }).ok);
t('closing needs a named gap, and "unknown" keeps it open', !U.close(openId, { ...closing, gaps: [] }).ok && !U.close(openId, { ...closing, gaps: ['unknown'] }).ok);
t('a gap that is not on the list is refused', !U.close(openId, { ...closing, gaps: ['ai_was_bad'] }).ok);
t('a review that stays open is still open after all those refusals', lines().length === 1 && U.report('2026-10-12').open.length === 1);
t('a missing reading recorded as not provided, with the reason, can close', U.validate({ ...base, ...closing, human_understood: { not_provided: 'on leave; reading to follow' } }, 'close').length === 0);

// The ladder: later steps must say why the earlier ones were not enough
const withStep = (step, extra) => U.validate({ ...base, ...closing, response: { step, what: 'x', ...extra } }, 'close');
t('"say" needs no justification (it is first)', withStep('say').length === 0);
t('"show" and "change_rule" need why the earlier steps were not enough', ['show', 'change_rule'].every(s => withStep(s).some(p => p.includes('why_not_earlier')) && withStep(s, { why_not_earlier: 'Saying it twice did not change the reading.' }).length === 0));
t('"none" is only for a review whose only gap is rule_worked', withStep('none').some(p => p.includes('rule_worked')) && U.validate({ ...base, ...closing, gaps: ['rule_worked'], response: { step: 'none' } }, 'close').length === 0);

// Restraint is last, and never without an exit
const full = { reason: 'Two unscoped exports in a week.', scope: 'Exports only, in the finance workspace', exit: 'Three scoped exports with no ask missed', review_by: '2026-11-01', approved_by: 'Travis Jacobs' };
const restrain = (r, extra) => U.validate({ ...base, ...closing, response: { step: 'restrain', what: 'Exports ask first.', why_not_earlier: 'Saying and showing did not close it.', restraint: r, ...extra } }, 'close');
t('a complete restraint is accepted', restrain(full).length === 0);
t('a restraint missing any one of reason, scope, exit, review date or person is refused', ['reason', 'scope', 'exit', 'review_by', 'approved_by'].every(k => { const { [k]: _, ...rest } = full; return restrain(rest).length > 0; }));
t('a restraint with no restraint block at all is refused', restrain(undefined).length > 0);
t('a review date on or before the review date is refused', restrain({ ...full, review_by: '2026-10-01' }).length > 0 && restrain({ ...full, review_by: '2026-09-01' }).length > 0);
t('a restraint block with any other step is refused', withStep('say', { restraint: full }).some(p => p.includes('restraint')));

// Containment is not a finding, but must have an end
t('containment needs what, why, who and what ends it', !U.open({ ...base, containment: { what: 'Stopped the export', reason: 'Unclear who it went to', by: 'Travis Jacobs' } }).ok
  && U.open({ ...base, containment: { what: 'Stopped the export', reason: 'Unclear who it went to', by: 'Travis Jacobs', ends: 'Recipients confirmed' } }).ok);

// Closing writes a new line that points back; nothing earlier changes
const before = fs.readFileSync(process.env.LEDGER_PATH, 'utf8');
const closed = U.close(openId, closing);
const after = fs.readFileSync(process.env.LEDGER_PATH, 'utf8');
t('closing succeeds with a complete review', closed.ok);
t('append-only: every earlier byte of the Ledger is unchanged', after.startsWith(before) && after.length > before.length);
const closeLine = lines().find(l => l.id === closed.id);
t('the closed line points to the open line and carries the whole review', closeLine.status === 'closed' && closeLine.parent_decision === openId && closeLine.review.what_happened === base.what_happened);
t('the same review cannot be closed twice', !U.close(openId, closing).ok);
t('closing an id that does not exist is refused', !U.close('review-0-0000', closing).ok);

// Reports
const rep = () => U.report('2026-10-12');
t('a closed review leaves the open list', !rep().open.some(x => x.id === openId));
t('the report counts the way it closed', rep().by_step.say === 1 && rep().by_gap.unclear_scope === 1 && rep().closed_without_restraint === 1);

// Restraints surface when due, until a person revisits them
const o2 = U.open({ ...base, date: '2026-10-02', kind: 'wrong_proceed' }); const c2 = U.close(o2.id, { ...closing, response: { step: 'restrain', what: 'Exports ask first.', why_not_earlier: 'Saying and showing did not close it.', restraint: full } });
t('a restraint is not due before its date', c2.ok && rep().restraints_due.length === 0);
t('a restraint appears once its review date arrives', U.report('2026-11-01').restraints_due.length === 1);
t('"closed without restraint" falls when a restraint is used', U.report('2026-11-01').closed_without_restraint === 1 && U.report('2026-11-01').by_step.restrain === 1);
t('revisiting an id that does not exist is refused', !U.open({ ...base, date: '2026-11-02', revisits: 'review-0-0000' }).ok);
const o3 = U.open({ ...base, date: '2026-11-02', kind: 'confusion', revisits: c2.id }); const c3 = U.close(o3.id, { ...closing, gaps: ['rule_worked'], response: { step: 'none' } });
t('a person revisiting a restraint in a later review lifts it from the due list', c3.ok && U.report('2026-11-03').restraints_due.length === 0);

// Hard stops stay out of the tally
const s = U.open({ ...base, date: '2026-10-05', kind: 'wrong_proceed', safety_stop: true }); const sc = U.close(s.id, { ...closing, gaps: ['rule_worked'], response: { step: 'none' } });
const before2 = rep(); const sLine = lines().find(l => l.id === sc.id);
t('a stop-for-safety review is tagged, marked excluded, and kept out of every tally', sLine.tags.includes('stop-for-safety') && sLine.evidence.includes('tally:excluded') && before2.closed_safety_stops === 1 && before2.closed_counted === 3);

// Honest about failure
process.env.LEDGER_PATH = path.join(tmp, 'no-such-folder', 'decisions.jsonl');
const failed = U.open(base);
t('if the Ledger cannot be written, nothing is claimed as recorded', !failed.ok && failed.problems[0].includes('Not recorded'));
process.env.LEDGER_PATH = path.join(tmp, 'decisions.jsonl');
t('the report prints in plain words', /Open: \d+/.test(U.print(rep())) && /closed without any restraint/.test(U.print(rep())));

console.log(`\n${pass}/${total} passed`); process.exit(pass === total ? 0 : 1);

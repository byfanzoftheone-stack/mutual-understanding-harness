// understanding.js - RAT-013 (proposed): records an Understanding Review in the Ledger (see UNDERSTANDING-REVIEW.md).
// Two append-only lines per review: an "open" line, then a "closed" line that points to it. Nothing is edited or deleted.
// The record line has no fault, score or rank field: fields it does not define are rejected.
const fs = require('fs');
const { LEDGER_PATH } = require('./ledger');

const KINDS = ['harm', 'near_miss', 'wrong_proceed', 'wrong_refuse', 'confusion', 'human_error'];
const GAPS = ['missing_fact', 'unclear_scope', 'rule_unclear', 'reason_missing', 'rule_wrong', 'honest_mistake', 'rule_worked', 'environment', 'unknown'];
const STEPS = ['none', 'say', 'show', 'change_rule', 'restrain']; // restraint is last
const ALLOWED = {
  top: ['date', 'recorded_by', 'kind', 'what_happened', 'containment', 'ai_understood', 'human_understood', 'gaps', 'response', 'safety_stop', 'checked', 'released_by', 'revisits'],
  containment: ['what', 'reason', 'by', 'ends'],
  response: ['step', 'what', 'why_not_earlier', 'restraint'],
  restraint: ['reason', 'scope', 'exit', 'review_by', 'approved_by']
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = v => typeof v === 'string' && v.trim().length > 0;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const extras = (o, allowed, where) => Object.keys(o).filter(k => !allowed.includes(k)).map(k => `${where}: "${k}" is not part of the record line`);
// A reading is the side's own words, or an honest "not provided" with its reason (silence is not a fail).
const reading = v => str(v) || (isObj(v) && Object.keys(v).length === 1 && str(v.not_provided));

function readLines() {
  let text; try { text = fs.readFileSync(LEDGER_PATH(), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
const reviews = lines => lines.filter(l => l.type === 'understanding_review');

// phase 'open' needs the facts of the incident. phase 'close' needs everything a person must see before agreeing.
function validate(r, phase) {
  const p = [];
  if (!isObj(r)) return ['review must be an object'];
  p.push(...extras(r, ALLOWED.top, 'review'));
  if (!(str(r.date) && DATE.test(r.date))) p.push('date: use YYYY-MM-DD');
  if (!str(r.recorded_by)) p.push('recorded_by: say who recorded this');
  if (!KINDS.includes(r.kind)) p.push('kind: one of ' + KINDS.join(', '));
  if (!str(r.what_happened)) p.push('what_happened: write what happened, in order, plainly');
  if (r.safety_stop !== undefined && typeof r.safety_stop !== 'boolean') p.push('safety_stop: true or false');
  if (r.revisits !== undefined && !str(r.revisits)) p.push('revisits: the id of the earlier review');
  if (r.containment !== undefined) {
    if (!isObj(r.containment)) p.push('containment: must be an object');
    else {
      p.push(...extras(r.containment, ALLOWED.containment, 'containment'));
      for (const k of ALLOWED.containment) if (!str(r.containment[k])) p.push(`containment.${k}: containment needs what, reason, by, and what ends it`);
    }
  }
  if (r.gaps !== undefined && !(Array.isArray(r.gaps) && r.gaps.every(g => GAPS.includes(g)))) p.push('gaps: any of ' + GAPS.join(', '));
  const resp = r.response;
  if (resp !== undefined) {
    if (!isObj(resp)) p.push('response: must be an object');
    else {
      p.push(...extras(resp, ALLOWED.response, 'response'));
      if (!STEPS.includes(resp.step)) p.push('response.step: one of ' + STEPS.join(', '));
      else {
        if (resp.step === 'none' && !(Array.isArray(r.gaps) && r.gaps.length && r.gaps.every(g => g === 'rule_worked'))) p.push('response.step "none" is only for a review whose only gap is rule_worked');
        if (resp.step !== 'none' && !str(resp.what)) p.push('response.what: say what was done');
        if (STEPS.indexOf(resp.step) > STEPS.indexOf('say') && !str(resp.why_not_earlier)) p.push('response.why_not_earlier: past "say", write why the earlier steps were not enough');
        if (resp.step === 'restrain') {
          const t = resp.restraint;
          if (!isObj(t)) p.push('response.restraint: restraint needs a reason, scope, exit, review_by and approved_by');
          else {
            p.push(...extras(t, ALLOWED.restraint, 'restraint'));
            for (const k of ['reason', 'scope', 'exit', 'approved_by']) if (!str(t[k])) p.push(`restraint.${k}: required (a limit with no ${k} is not allowed)`);
            if (!(str(t.review_by) && DATE.test(t.review_by))) p.push('restraint.review_by: a date, YYYY-MM-DD');
            else if (DATE.test(r.date) && t.review_by <= r.date) p.push('restraint.review_by: must be after the review date');
          }
        } else if (resp.restraint !== undefined) p.push('response.restraint: only with step "restrain"');
      }
    }
  }
  if (phase === 'close') {
    if (!reading(r.ai_understood)) p.push('ai_understood: the AI\'s own words, or {"not_provided":"reason"}');
    if (!reading(r.human_understood)) p.push('human_understood: the person\'s own words, or {"not_provided":"reason"}');
    if (!(Array.isArray(r.gaps) && r.gaps.length)) p.push('gaps: name at least one (use "unknown" and leave the review open if not found)');
    else if (r.gaps.includes('unknown')) p.push('gaps: "unknown" means the review stays open');
    if (resp === undefined) p.push('response: required to close');
    if (!str(r.checked)) p.push('checked: how you checked it worked, or why it cannot be tested. Blank is not allowed');
    if (!str(r.released_by)) p.push('released_by: a person closes the review');
  }
  return p;
}

function entry(r, status, parent) {
  const gaps = r.gaps || [];
  return {
    id: `review-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    actor: String(r.recorded_by),
    type: 'understanding_review',
    status,
    reasoning: `${r.kind}: ${r.what_happened.slice(0, 200)}`,
    source_repo: 'mutual-understanding-harness',
    parent_decision: parent || null,
    evidence: [`kind:${r.kind}`, ...gaps.map(g => `gap:${g}`), ...(r.response ? [`step:${r.response.step}`] : []),
      ...(r.safety_stop ? ['stop-for-safety', 'tally:excluded'] : [])],
    tags: ['understanding-review', ...(r.safety_stop ? ['stop-for-safety'] : []), ...gaps],
    review: r
  };
}

function write(e) {
  try { fs.appendFileSync(LEDGER_PATH(), JSON.stringify(e) + '\n'); return { ok: true, id: e.id }; }
  catch (err) { return { ok: false, problems: ['Not recorded: the Ledger could not be written (' + err.code + '). Nothing is claimed as recorded.'] }; }
}

function open(r) {
  const problems = validate(r, 'open');
  if (r && r.revisits && !reviews(readLines()).some(l => l.id === r.revisits)) problems.push('revisits: no review has that id');
  return problems.length ? { ok: false, problems } : write(entry(r, 'open', r.revisits || null));
}

// The closing line carries the whole review (open fields merged under the new ones), so it reads on its own.
function close(openId, fields) {
  const all = reviews(readLines());
  const o = all.find(l => l.id === openId && l.status === 'open');
  if (!o) return { ok: false, problems: ['No open review has the id ' + openId] };
  if (all.some(l => l.status === 'closed' && l.parent_decision === openId)) return { ok: false, problems: ['That review is already closed. A correction is a new review that points to it.'] };
  const merged = { ...o.review, ...fields };
  const problems = validate(merged, 'close');
  if (merged.revisits && !all.some(l => l.id === merged.revisits)) problems.push('revisits: no review has that id');
  return problems.length ? { ok: false, problems } : write(entry(merged, 'closed', openId));
}

function state(lines) {
  const all = reviews(lines), closedBy = new Map(all.filter(l => l.status === 'closed').map(l => [l.parent_decision, l]));
  return { opens: all.filter(l => l.status === 'open' && !closedBy.has(l.id)), closed: all.filter(l => l.status === 'closed') };
}
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function report(today) {
  const { opens, closed } = state(readLines());
  today = today || new Date().toISOString().slice(0, 10);
  const counted = closed.filter(l => !l.review.safety_stop);
  const byStep = Object.fromEntries(STEPS.map(s => [s, counted.filter(l => l.review.response.step === s).length]));
  const byGap = {}; for (const l of counted) for (const g of l.review.gaps) byGap[g] = (byGap[g] || 0) + 1;
  const revisited = new Set(closed.map(l => l.review.revisits).filter(Boolean));
  const restraints = closed.filter(l => l.review.response.step === 'restrain');
  // A restraint is lifted only by a person re-deciding it in a later review that points back (revisits).
  const due = restraints.filter(l => l.review.response.restraint.review_by <= today && !revisited.has(l.parent_decision) && !revisited.has(l.id));
  return {
    as_of: today,
    open: opens.map(l => ({ id: l.id, date: l.review.date, kind: l.review.kind, days_open: days(l.review.date, today), safety_stop: !!l.review.safety_stop }))
      .sort((a, b) => b.days_open - a.days_open),
    closed_counted: counted.length, closed_safety_stops: closed.length - counted.length,
    by_step: byStep, by_gap: byGap,
    closed_without_restraint: counted.length - byStep.restrain,
    restraints_due: due.map(l => ({ id: l.id, review_by: l.review.response.restraint.review_by, scope: l.review.response.restraint.scope, approved_by: l.review.response.restraint.approved_by }))
  };
}

function print(rep) {
  const o = [`Understanding reviews (as of ${rep.as_of})`, `Open: ${rep.open.length}`];
  for (const x of rep.open) o.push(`  ${x.id}  ${x.date}  ${x.kind}${x.safety_stop ? '  [stop-for-safety]' : ''}  ${x.days_open} days open`);
  o.push(`Closed (counted): ${rep.closed_counted}   Closed safety stops (not counted): ${rep.closed_safety_stops}`);
  o.push(`  closed without any restraint: ${rep.closed_without_restraint} of ${rep.closed_counted}`);
  for (const s of STEPS) o.push(`  step ${s}: ${rep.by_step[s]}`);
  o.push('  gaps: ' + (Object.entries(rep.by_gap).map(([g, n]) => `${g} ${n}`).join(', ') || 'none yet'));
  o.push(`Restraints due for a person to re-decide: ${rep.restraints_due.length}`);
  for (const x of rep.restraints_due) o.push(`  ${x.id}  due ${x.review_by}  ${x.scope}  (approved by ${x.approved_by})`);
  return o.join('\n');
}

module.exports = { open, close, validate, report, print, state, readLines, KINDS, GAPS, STEPS };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  const run = j => { try { return JSON.parse(j); } catch (e) { console.error('Error: the review must be JSON'); process.exit(1); } };
  const done = r => { if (!r.ok) { console.error('Not recorded:\n- ' + r.problems.join('\n- ')); process.exit(1); } console.log('Recorded ' + r.id); };
  if (cmd === 'open') done(open(run(a)));
  else if (cmd === 'close') done(close(a, run(b)));
  else if (cmd === 'list') { const r = report(); console.log(r.open.length ? r.open.map(x => `${x.id}  ${x.date}  ${x.kind}  ${x.days_open} days open`).join('\n') : 'No open reviews.'); }
  else if (cmd === 'report') console.log(print(report(a)));
  else { console.error('Usage: understanding.js open <json> | close <id> <json> | list | report [YYYY-MM-DD]'); process.exit(1); }
}

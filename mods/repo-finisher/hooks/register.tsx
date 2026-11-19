import type { EngineInterface, Register } from 'claude-code'

import {
  addDays,
  allowedWrite,
  approve,
  count,
  drop,
  exportMarkdown,
  mark,
  mergeSurvey,
  modeOf,
  newRun,
  propose,
  statusLine,
  suggest,
  summarize,
} from '../lib/state'
import type { Proposal, Run } from '../lib/state'

// Repo finisher. At the start of work in a repository it READS every file (bin/survey.mjs writes nothing) and reports what is
// bare and what is missing for a production-ready repo. Nothing is built until a person runs /finish start and approves items.
// Then it works only inside what was approved, never pushes or deploys, and waits for suggestions when the approved work is done.
// The guard acts only while a finish run is active; ordinary sessions are left alone.
const HUMAN = new Set(['composer', 'bridge'])
const SURVEY = 'mcp__repo-finisher__finish_survey'
const PROPOSE = 'mcp__repo-finisher__finish_propose'
const MARK = 'mcp__repo-finisher__finish_mark'
const STATUS = 'mcp__repo-finisher__finish_status'
const MANIFESTS = ['.git', 'package.json', 'pyproject.toml', 'setup.py', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'composer.json']
// In a finish run these are ask-first (G1: changes that reach production need a person). A person can run any of them themselves.
const DANGER: [RegExp, string][] = [
  [/\bgit\s+push\b/, 'pushing'],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|restore\s+\.|branch\s+-D)/, 'discarding work'],
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/, 'a recursive force delete'],
  [/\b(npm|yarn|pnpm)\s+publish\b|\btwine\s+upload\b|\bcargo\s+publish\b/, 'publishing a package'],
  [/\bdocker\s+push\b|\bkubectl\s+(apply|delete|rollout)\b|\bterraform\s+(apply|destroy)\b|\bhelm\s+(install|upgrade)\b/, 'changing infrastructure'],
  [/\b(vercel|netlify|railway|fly|flyctl|heroku|wrangler)\s+(deploy|up|publish|release)\b|\bvercel\b[^|;&]*--prod/, 'deploying'],
  [/\bgh\s+(release|pr\s+merge|repo\s+delete)\b/, 'changing the remote'],
  [/\bcurl\b[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b/, 'running downloaded code'],
  [/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i, 'destroying data'],
]

type Survey = {
  surveyed_at: string
  stack: string
  truncated: boolean
  files_read: number
  counts: { source_files: number; test_files: number; loc: number; todos: number }
  summary: { pass: number; gap: number; unchecked: number; na: number }
  checks: { id: string; label: string; status: string; evidence: string; risk: string }[]
  bare: { file: string; why: string }[]
  proposals: Proposal[]
  git: { isRepo: boolean; branch: string | null; dirty: number | null }
}

const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
const day = async ($: EngineInterface) => new Date(await $.clock.now()).toISOString().slice(0, 10)

async function loadRun($: EngineInterface): Promise<Run | undefined> {
  const got = (await $.store.get(`run:${await $.session.root()}`)) as Run | undefined
  return got && Array.isArray(got.items) ? got : undefined
}
async function saveRun($: EngineInterface, run: Run): Promise<void> {
  await $.store.set(`run:${await $.session.root()}`, run)
}
async function loadSurvey($: EngineInterface): Promise<Survey | undefined> {
  const got = (await $.store.get(`survey:${await $.session.root()}`)) as Survey | undefined
  // An older or damaged value is no survey: nothing below may trust its shape.
  return got && got.summary && Array.isArray(got.proposals) && Array.isArray(got.checks) ? got : undefined
}

// Read-only: the survey script opens files and prints JSON. It is bounded to 25 seconds and writes nothing.
async function runSurvey($: EngineInterface): Promise<{ survey?: Survey; problem?: string }> {
  try {
    const root = await $.session.root()
    const done = await $.process.run(['node', `${$.plugin.root}/bin/survey.mjs`, root], { timeoutMs: 25000 })
    if (done.exitCode !== 0) return { problem: (done.stderr || 'the survey failed').slice(0, 300) }
    const survey = JSON.parse(done.stdout) as Survey
    await $.store.set(`survey:${root}`, survey)
    return { survey }
  } catch (e) {
    return { problem: `The survey could not run: ${String(e).slice(0, 200)}` }
  }
}

async function refreshStatus($: EngineInterface): Promise<void> {
  const run = await loadRun($)
  const survey = await loadSurvey($)
  $.ui.status(statusLine(run, survey ? survey.summary.gap + survey.summary.unchecked : undefined, await day($)))
}

const gapsText = (s: Survey) =>
  [
    `Surveyed ${s.files_read} file(s)${s.truncated ? ' (a very large repository: only the first part was read)' : ''}: ${s.stack} project, ${s.counts.source_files} source and ${s.counts.test_files} test file(s), ${s.counts.loc} lines. ${s.summary.pass} checks pass, ${s.summary.gap} gap(s), ${s.summary.unchecked} not checkable by reading, ${s.summary.na} not applicable.`,
    ...s.checks.filter(c => c.status === 'gap' || c.status === 'unchecked').map(c => `  ${c.status === 'gap' ? 'gap' : 'not run'}  ${c.label}: ${c.evidence}${c.risk === 'high' ? '  [high risk: a person decides]' : ''}`),
    ...(s.bare.length ? ['Bare code:', ...s.bare.slice(0, 10).map(b => `  ${b.file}: ${b.why}`)] : []),
    'This is a heuristic read, not a verdict. Nothing was changed.',
  ].join('\n')

async function blocked($: EngineInterface, e: { tool: string; [k: string]: unknown }): Promise<string | undefined> {
  const isWrite = e.tool === 'Write' || e.tool === 'Edit' || e.tool === 'NotebookEdit' || e.tool === 'MultiEdit'
  if (!isWrite && e.tool !== 'Bash') return undefined
  const run = await loadRun($)
  if (!run) return undefined
  const today = await day($)
  if (modeOf(run, today) === 'stopped') return undefined
  if (e.tool === 'Bash') {
    const hit = DANGER.find(([re]) => re.test(text(e.command) ?? ''))
    return hit ? `${$.plugin.name}: ${hit[1]} is ask-first during a finish run (G1: a change that reaches production needs a person). Ask the person, or they can run it themselves.` : undefined
  }
  const file = text(e.file_path) ?? text(e.notebook_path) ?? ''
  const r = allowedWrite(run, await $.session.root(), file, today)
  return r.ok ? undefined : `${$.plugin.name}: ${file} is not something you have approved. ${r.reason}. Propose it with finish_propose, or ask the person to approve it (/finish approve).`
}

const danger = (command: unknown) => DANGER.find(([re]) => re.test(text(command) ?? ''))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'finish',
      description: 'Survey this repo, plan the work to make it production ready, build only what you approve',
      argumentHint: '[start | approve <ids|all> <name> | suggest <change> | status | stop]',
    })
    await $.tool.register({
      name: 'finish_survey',
      description: 'The read-only survey of this repository: what is bare, what is missing for production, and the seed plan. Call it first in a finish run.',
    })
    await $.tool.register({
      name: 'finish_propose',
      description: 'Propose one item of work for the finish run. It stays PROPOSED until a person approves it. It needs a one-line why, the files or folders it will touch (no wildcards, never the whole repository) and how it will be verified.',
      inputSchema: {
        type: 'object',
        required: ['title', 'why', 'paths', 'verify'],
        properties: {
          title: { type: 'string' },
          why: { type: 'string', description: 'One line: why this is worth doing' },
          paths: { type: 'array', items: { type: 'string' }, description: 'Files or folders it will touch. A folder ends with /' },
          verify: { type: 'string', description: 'A command to run, or "person: ..." for what only a person can judge' },
          risk: { type: 'string', enum: ['normal', 'high'], description: 'high for auth, payments, data, migrations, deploys, licences, secrets' },
          size: { type: 'string', enum: ['S', 'M', 'L'] },
          area: { type: 'string' },
        },
      },
    })
    await $.tool.register({
      name: 'finish_mark',
      description: 'Record the outcome of an APPROVED item after you worked it and ran its verify step: done, blocked, or needs_input. Evidence is required: what you ran and what it showed. You cannot mark an unapproved item.',
      inputSchema: {
        type: 'object',
        required: ['id', 'status', 'evidence'],
        properties: { id: { type: 'string' }, status: { type: 'string', enum: ['done', 'blocked', 'needs_input'] }, evidence: { type: 'string' } },
      },
    })
    await $.tool.register({ name: 'finish_status', description: 'The finish run: each item, its state, and what is waiting on the person.' })

    const started = await next(e)
    // Look at the repository without holding the session up, and without writing anything.
    void (async () => {
      const here = await Promise.all(MANIFESTS.map(m => $.fs.exists(m)))
      if (!here.some(Boolean)) return
      const got = await runSurvey($)
      const run = await loadRun($)
      if (got.survey && run && modeOf(run, await day($)) !== 'stopped') {
        mergeSurvey(run, got.survey.proposals)
        await saveRun($, run)
      }
      await refreshStatus($)
    })()

    return started
  })

  on('command.run', { command: 'finish' }, async ($, e) => {
    const [sub = 'status', ...rest] = e.args.trim().split(/\s+/)
    const isPerson = HUMAN.has(e.origin?.kind ?? '')
    const today = await day($)
    const needPerson = (what: string) => ({ text: `Only a person ${what}. Nothing here promotes itself. Type /finish ${sub} yourself.` })
    const run = await loadRun($)

    if (sub === 'survey') {
      const got = await runSurvey($)
      if (!got.survey) return { text: got.problem ?? 'The survey did not run.' }
      const added = run ? mergeSurvey(run, got.survey.proposals) : 0
      if (run) await saveRun($, run)
      await refreshStatus($)
      return { text: gapsText(got.survey) + (added ? `\n${added} new item(s) added to the plan, proposed.` : '') }
    }
    if (sub === 'start') {
      if (run && modeOf(run, today) !== 'stopped') return { text: summarize(run, today) }
      const survey = (await loadSurvey($)) ?? (await runSurvey($)).survey
      if (!survey) return { text: 'There is nothing to survey here: no repository files were found.' }
      const fresh = newRun(await $.session.root(), today, survey.proposals)
      await saveRun($, fresh)
      await refreshStatus($)
      return {
        text: `Finish run started. ${fresh.items.length} item(s) proposed, none approved, nothing changed.\n${summarize(fresh, today)}`,
        context: ['A finish run was just started by the person. Read finish_survey, add anything the survey missed with finish_propose, then present the plan in plain words, bare code first. Do not write any file. Wait for the person to approve with /finish approve.'],
      }
    }
    if (!run && sub !== 'help') return { text: 'No finish run here. /finish survey shows what the repository needs; /finish start plans it.' }

    if (sub === 'status' || sub === '') return { text: summarize(run as Run, today) }
    if (sub === 'approve') {
      if (!isPerson) return needPerson('approves')
      const ids: string[] = []
      let until: string | undefined
      let name = ''
      for (let i = 0; i < rest.length; i++) {
        const t = rest[i] ?? ''
        if (t === 'until') { until = rest[++i]; continue }
        if (!name && /^(all|F-[\w-]+)(,(all|F-[\w-]+))*,?$/.test(t)) ids.push(...t.split(',').filter(Boolean))
        else name += (name ? ' ' : '') + t
      }
      const r = approve(run as Run, { ids: ids.includes('all') ? 'all' : ids, by: name, until }, today)
      if (r.ok) await saveRun($, run as Run)
      await refreshStatus($)
      const skipped = r.skipped.map(s => `  ${s.id}: ${s.why}`).join('\n')
      return r.ok
        ? { text: `Approved ${r.approved.join(', ')}, signed by ${name}, until ${until ?? addDays(today, 14)}.${skipped ? `\nNot approved:\n${skipped}` : ''}`, context: [`The person approved ${r.approved.join(', ')}. Work only those items, only inside their paths. After each, run its verify step and record it with finish_mark. Do not commit unless the person asks. Never push or deploy.`] }
        : { text: `Nothing approved. ${r.problems.join('; ')}${skipped ? `\n${skipped}` : ''}\nUsage: /finish approve all <your name>   or   /finish approve F-tests F-ci until 2026-12-31 <your name>` }
    }
    if (sub === 'drop') {
      if (!isPerson) return needPerson('drops an item')
      const r = drop(run as Run, rest[0] ?? '')
      if (r.ok) await saveRun($, run as Run)
      await refreshStatus($)
      return { text: r.ok ? `Dropped ${rest[0]}.` : (r.problem ?? '') }
    }
    if (sub === 'suggest') {
      if (!isPerson) return needPerson('suggests changes')
      const r = suggest(run as Run, rest.join(' '), today)
      if (!r.ok) return { text: r.problem ?? '' }
      await saveRun($, run as Run)
      await refreshStatus($)
      return {
        text: `Noted suggestion ${r.id}. It becomes proposed items; nothing is built until you approve them.`,
        context: [`The person suggested a change: "${rest.join(' ')}". Turn it into proposed items with finish_propose (a why, exact paths, a verify step), mention they are proposed, then wait for /finish approve. Do not start work.`],
      }
    }
    if (sub === 'stop') {
      if (!isPerson) return needPerson('stops a run')
      ;(run as Run).stopped = today
      await saveRun($, run as Run)
      await refreshStatus($)
      return { text: 'Finish run stopped. The record stays in the store; /finish export writes it to the repository.' }
    }
    if (sub === 'export') {
      if (!isPerson) return needPerson('exports the record')
      const file = `${await $.session.root()}/FINISH-PLAN.md`
      await $.fs.write(file, exportMarkdown(run as Run, today))
      return { text: `Wrote ${file}. It lists every item, who approved it, until when, and the evidence reported.` }
    }
    return {
      text: [
        '/finish survey                    read every file (changes nothing) and list what is missing',
        '/finish start                     turn the survey into a proposed plan',
        '/finish approve all <name>        approve the normal-risk items. High-risk items: approve by id',
        '/finish approve F-x F-y until YYYY-MM-DD <name>',
        '/finish suggest <change>          tell it what to change next',
        '/finish status | drop <id> | stop | export',
      ].join('\n'),
    }
  })

  // The model's tools. It can propose and report. It cannot approve.
  on('tool.run', { tool: SURVEY }, async $ => {
    const survey = await loadSurvey($)
    return { result: survey ? gapsText(survey) + `\n\nSeed plan: ${survey.proposals.map(p => `${p.id} (${p.risk}) ${p.title}`).join('; ')}` : 'No survey yet. The person can run /finish survey.' }
  })
  on('tool.run', { tool: STATUS }, async $ => {
    const run = await loadRun($)
    return { result: run ? summarize(run, await day($)) : 'No finish run. The person starts one with /finish start.' }
  })
  on('tool.run', { tool: PROPOSE }, async ($, e) => {
    const run = await loadRun($)
    if (!run) return { result: 'No finish run. The person starts one with /finish start. Nothing was added.' }
    const a = e as unknown as Record<string, unknown>
    const r = propose(run, { title: text(a.title) ?? '', why: text(a.why) ?? '', paths: Array.isArray(a.paths) ? a.paths.map(String) : [], verify: text(a.verify) ?? '', risk: a.risk === 'high' ? 'high' : 'normal', size: a.size === 'S' || a.size === 'L' ? a.size : 'M', area: text(a.area) }, 'model')
    if (r.ok) { await saveRun($, run); await refreshStatus($) }
    return { result: r.ok ? `Proposed ${r.id}. It is NOT approved. Do not work it until the person approves it with /finish approve.` : `Not added: ${r.problem}` }
  })
  on('tool.run', { tool: MARK }, async ($, e) => {
    const run = await loadRun($)
    if (!run) return { result: 'No finish run.' }
    const a = e as unknown as Record<string, unknown>
    const r = mark(run, text(a.id) ?? '', text(a.status) ?? '', text(a.evidence) ?? '', await day($))
    if (!r.ok) return { result: `Not recorded: ${r.problem}` }
    // "Done" is the AI's word. For an item the survey itself raised, read the repository again and say so if the gap is still there.
    let recheck = ''
    const item = run.items.find(i => i.id === a.id)
    if (item && a.status === 'done' && item.source === 'survey') {
      const again = (await runSurvey($)).survey
      const still = again?.checks.find(c => `F-${c.id}` === item.id && (c.status === 'gap' || c.status === 'unchecked'))
      if (still && still.status === 'gap') {
        item.evidence = `${item.evidence} [the survey still reports this gap: ${still.evidence}]`
        recheck = ` WARNING: a fresh read-only survey still reports this as a gap (${still.evidence}). Check it, or tell the person. It stays recorded as done, with that note.`
      } else if (again) recheck = ' A fresh read-only survey no longer reports this gap.'
    }
    await saveRun($, run)
    await refreshStatus($)
    const c = count(run), m = modeOf(run, await day($))
    return { result: `Recorded ${a.id} as ${a.status}.${recheck}${m === 'waiting' ? ' Everything approved is done. STOP: summarize what was done and ask the person for suggestions. Do not start new work.' : m === 'implementing' ? ` ${c.approved} approved item(s) remain.` : ''}` }
  })

  on('tool.call', async ($, e, next) => {
    const why = await blocked($, e as never)
    return why ? { deny: why } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : e.tool === 'Bash' && danger((e as unknown as Record<string, unknown>).command) ? { deny: `${$.plugin.name}: its guard failed, so ${danger((e as unknown as Record<string, unknown>).command)?.[1]} is held for a person.` } : next(e)))

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    const run = await loadRun($)
    const today = await day($)
    const m = run ? modeOf(run, today) : undefined
    let line: string | undefined
    if (run && m && m !== 'stopped') {
      line = m === 'planning'
        ? 'A finish run is active and nothing is approved. Read-only: survey, propose with finish_propose, present the plan, and wait for the person to approve (/finish approve). Write no files.'
        : m === 'implementing'
          ? 'A finish run is active. Work only the APPROVED items, only inside their paths, bare code first. After each, run its verify step and record it with finish_mark with evidence. Never push, deploy or publish. Commit only if the person asked. If a step needs something outside the approved paths, stop and ask.'
          : 'A finish run is active and everything approved is done. Do not start new work. Summarize what was done, with the evidence, and ask the person for suggestions.'
    } else if (!run) {
      const s = await loadSurvey($)
      if (s && s.summary.gap + s.summary.unchecked > 0) line = `A read-only survey of this repository found ${s.summary.gap} gap(s) against a production-ready bar. Do not act on it unless the person runs /finish start. You may mention it if it is relevant.`
    }
    return line ? { sections: [...out.sections, { id: 'repo-finisher:run', scope: 'session', text: line }] } : out
  })
}

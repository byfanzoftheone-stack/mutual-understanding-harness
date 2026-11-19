// The plan and the approvals of a finish run, as pure functions on plain data. No $, no Node: the hooks module keeps the data
// in the store and asks these what is allowed. Nothing here writes a file or runs a command.

export type Risk = 'normal' | 'high'
export type Status = 'proposed' | 'approved' | 'done' | 'blocked' | 'needs_input' | 'dropped'
export type Source = 'survey' | 'model' | 'person'

export type Item = {
  id: string
  title: string
  why: string
  area: string
  paths: string[]
  verify: string
  risk: Risk
  size: 'S' | 'M' | 'L'
  source: Source
  status: Status
  evidence?: string
  approved_by?: string
  approved_on?: string
  until?: string
  closed_on?: string
}

export type Suggestion = { id: number; on: string; text: string; handled: boolean }

export type Run = {
  root: string
  started: string
  stopped?: string
  items: Item[]
  suggestions: Suggestion[]
}

export type Proposal = {
  id?: string
  title: string
  why: string
  area?: string
  paths: string[]
  verify: string
  risk?: Risk
  size?: 'S' | 'M' | 'L'
  evidence?: string
}

export type Mode = 'planning' | 'implementing' | 'waiting' | 'stopped'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const WHOLE = new Set(['', '.', './', '/', '*', '**', '**/*', '*/'])
const ALWAYS_CLOSED = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|id_rsa[^/]*|id_ed25519[^/]*|[^/]+\.pem|[^/]+\.key|\.npmrc|\.pypirc|credentials(\.json)?)$/
const one = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && !/[\r\n]/.test(v)

export const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// A scope names where. "The whole repository" is not a place: that is how "allowed work" comes to reach everything.
export const normalizePath = (p: string): string | undefined => {
  const q = p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/\*{1,2}$/, '/')
  if (WHOLE.has(q) || q.startsWith('/') || q.split('/').includes('..') || /[*?[\]{}]/.test(q)) return undefined
  return q
}

export const newRun = (root: string, today: string, proposals: Proposal[]): Run => {
  const run: Run = { root, started: today, items: [], suggestions: [] }
  for (const p of proposals) propose(run, p, 'survey')
  return run
}

// Items from a re-survey are added when new; an item a person already handled is never touched.
export const mergeSurvey = (run: Run, proposals: Proposal[]): number => {
  let added = 0
  for (const p of proposals) if (p.id && !run.items.some(i => i.id === p.id) && propose(run, p, 'survey').ok) added++
  return added
}

export const propose = (run: Run, p: Proposal, source: Source): { ok: boolean; id?: string; problem?: string } => {
  if (!one(p.title)) return { ok: false, problem: 'title: one line' }
  if (!one(p.why)) return { ok: false, problem: 'why: one line saying why this is worth doing' }
  if (!one(p.verify)) return { ok: false, problem: 'verify: how it will be checked (a command to run, or "person: ...")' }
  const paths = (p.paths ?? []).map(normalizePath)
  if (paths.some(x => x === undefined)) return { ok: false, problem: 'paths: name where it will act: files or folders, no wildcards, not "." or the whole repository, nothing outside the repo' }
  // An item with no paths can be proposed (the work is to run something) but it can never write a file.
  const id = p.id ?? `F-${run.items.filter(i => i.source !== 'survey').length + 1}`
  if (run.items.some(i => i.id === id)) return { ok: false, problem: `${id} already exists` }
  run.items.push({ id, title: p.title, why: p.why, area: p.area ?? 'source', paths: [...new Set(paths as string[])], verify: p.verify, risk: p.risk ?? 'normal', size: p.size ?? 'M', source, status: 'proposed', evidence: p.evidence })
  return { ok: true, id }
}

export type ApproveResult = { ok: boolean; approved: string[]; skipped: { id: string; why: string }[]; problems: string[] }

// Only a person approves. "all" takes the normal-risk items; a high-risk item is approved by name, one at a time.
export const approve = (run: Run, spec: { ids: string[] | 'all'; by: string; until?: string }, today: string): ApproveResult => {
  const out: ApproveResult = { ok: false, approved: [], skipped: [], problems: [] }
  if (!one(spec.by)) out.problems.push('by: a person signs their name; nothing promotes itself')
  const until = spec.until ?? addDays(today, 14)
  if (!DATE.test(until) || until <= today) out.problems.push('until: a date after today (the approval ends)')
  if (out.problems.length) return out
  const wanted = spec.ids === 'all' ? run.items.filter(i => i.status === 'proposed') : spec.ids.map(id => run.items.find(i => i.id === id) ?? ({ id, missing: true } as never))
  for (const i of wanted as (Item & { missing?: boolean })[]) {
    if (i.missing) out.skipped.push({ id: i.id, why: 'no such item' })
    else if (i.status !== 'proposed') out.skipped.push({ id: i.id, why: `already ${i.status}` })
    else if (i.risk === 'high' && spec.ids === 'all') out.skipped.push({ id: i.id, why: 'high risk: approve it by id, on its own' })
    else {
      i.status = 'approved'
      i.approved_by = spec.by.trim()
      i.approved_on = today
      i.until = until
      out.approved.push(i.id)
    }
  }
  out.ok = out.approved.length > 0
  if (!out.ok) out.problems.push('nothing was approved')
  return out
}

export const isActive = (i: Item, today: string): boolean => i.status === 'approved' && !!i.until && i.until >= today
export const activeApproved = (run: Run, today: string): Item[] => run.items.filter(i => isActive(i, today))

// planning: nothing approved is live (waiting for a person to approve). implementing: an approved item is live.
// waiting: everything approved is done and nothing is proposed, so the next move is the person's.
export const modeOf = (run: Run, today: string): Mode => {
  if (run.stopped) return 'stopped'
  if (activeApproved(run, today).length) return 'implementing'
  if (run.items.some(i => i.status === 'proposed' || i.status === 'needs_input')) return 'planning'
  return run.items.some(i => i.status === 'done') ? 'waiting' : 'planning'
}

// May this file be written now? Only inside an approved, unexpired item's paths. Secrets files are never writable.
export const allowedWrite = (run: Run, root: string, file: string, today: string): { ok: boolean; reason: string } => {
  const r = root.replace(/\\/g, '/').replace(/\/$/, '')
  const f = file.replace(/\\/g, '/')
  if (/^\/(var\/)?tmp\//.test(f) && !f.includes('..')) return { ok: true, reason: 'a temporary file outside the repository' }
  const inside = f.startsWith(r + '/') ? f.slice(r.length + 1) : f.startsWith('/') ? undefined : f.replace(/^\.\//, '')
  if (inside === undefined || inside.split('/').includes('..')) return { ok: false, reason: 'outside the repository' }
  if (ALWAYS_CLOSED.test(inside)) return { ok: false, reason: 'secrets and credentials files are never written here (G2)' }
  const live = activeApproved(run, today)
  if (live.length === 0) return { ok: false, reason: 'nothing is approved yet (G12: no scope approved means ask)' }
  const hit = live.find(i => i.paths.some(p => inside === p || (p.endsWith('/') && inside.startsWith(p))))
  return hit ? { ok: true, reason: `inside ${hit.id}, approved by ${hit.approved_by} until ${hit.until}` } : { ok: false, reason: `not inside any approved item's paths (${live.map(i => i.id).join(', ')})` }
}

export const mark = (run: Run, id: string, status: string, evidence: string, today: string): { ok: boolean; problem?: string } => {
  const i = run.items.find(x => x.id === id)
  if (!i) return { ok: false, problem: `no item ${id}` }
  if (!isActive(i, today)) return { ok: false, problem: `${id} is ${i.status === 'approved' ? 'past its approval date' : i.status}. Only an approved item is worked, and only a person approves.` }
  if (!['done', 'blocked', 'needs_input'].includes(status)) return { ok: false, problem: 'status: done, blocked or needs_input' }
  if (!one(evidence)) return { ok: false, problem: 'evidence: one line: what was run and what it showed. Not "done" on its own' }
  i.status = status as Status
  i.evidence = evidence.trim()
  i.closed_on = today
  return { ok: true }
}

export const drop = (run: Run, id: string): { ok: boolean; problem?: string } => {
  const i = run.items.find(x => x.id === id)
  if (!i) return { ok: false, problem: `no item ${id}` }
  if (i.status === 'done') return { ok: false, problem: `${id} is done and stays on the record` }
  i.status = 'dropped'
  return { ok: true }
}

export const suggest = (run: Run, text: string, today: string): { ok: boolean; id?: number; problem?: string } => {
  if (!one(text)) return { ok: false, problem: 'say the change you want, in one line' }
  const id = run.suggestions.length + 1
  run.suggestions.push({ id, on: today, text: text.trim(), handled: false })
  return { ok: true, id }
}

export const count = (run: Run) => {
  const by = (s: Status) => run.items.filter(i => i.status === s).length
  return { proposed: by('proposed'), approved: by('approved'), done: by('done'), blocked: by('blocked'), needs_input: by('needs_input'), dropped: by('dropped'), unhandled: run.suggestions.filter(s => !s.handled).length }
}

export const statusLine = (run: Run | undefined, gaps: number | undefined, today: string): string | undefined => {
  if (!run) return gaps === undefined ? undefined : gaps === 0 ? 'finish: no gaps found' : `finish: ${gaps} gap${gaps === 1 ? '' : 's'} surveyed, /finish start to plan`
  const c = count(run), m = modeOf(run, today)
  if (m === 'stopped') return undefined
  if (m === 'waiting') return `finish: ${c.done} done, waiting for your suggestions`
  if (m === 'implementing') return `finish: ${c.done} done, ${c.approved} approved, ${c.proposed} proposed`
  return `finish: ${c.proposed} proposed, waiting for your approval (/finish approve)`
}

export const summarize = (run: Run, today: string): string => {
  const c = count(run), m = modeOf(run, today)
  const row = (i: Item) => `  ${i.id.padEnd(18)} [${i.status}${i.risk === 'high' ? ', high risk' : ''}${i.status === 'approved' ? ` until ${i.until}` : ''}] ${i.title}`
  const next = m === 'planning' ? 'Review the proposed items, then: /finish approve all <your name>  (high-risk items are approved by id)' : m === 'waiting' ? 'Everything approved is done. Tell me what to change: /finish suggest <what you want>' : m === 'implementing' ? 'Working only inside the approved items.' : 'Stopped.'
  return [`Finish run for ${run.root} (${m}): ${c.proposed} proposed, ${c.approved} approved, ${c.done} done, ${c.blocked} blocked, ${c.needs_input} need input, ${c.unhandled} suggestion(s) not yet planned.`, ...run.items.filter(i => i.status !== 'dropped').map(row), next].join('\n')
}

// The record a person can keep in the repository: every approval, by whom, until when, and what was shown.
export const exportMarkdown = (run: Run, today: string): string => {
  const lines = [`# Finish plan`, '', `Repository: \`${run.root}\`  ·  started ${run.started}  ·  exported ${today}`, '', 'Every item below was proposed with a reason. Only a person approved it. "Evidence" is what was reported, as given.', '']
  for (const i of run.items) {
    lines.push(`## ${i.id}: ${i.title}`, '', `- **Status:** ${i.status}${i.risk === 'high' ? ' (high risk)' : ''}`, `- **Why:** ${i.why}`, `- **Where:** ${i.paths.length ? i.paths.map(p => `\`${p}\``).join(', ') : '(no files)'}`, `- **Verify:** ${i.verify}`, `- **Proposed by:** ${i.source}`)
    if (i.approved_by) lines.push(`- **Approved by:** ${i.approved_by} on ${i.approved_on}, until ${i.until}`)
    if (i.evidence) lines.push(`- **Evidence:** ${i.evidence}`)
    lines.push('')
  }
  if (run.suggestions.length) lines.push('## Suggestions', '', ...run.suggestions.map(s => `- ${s.on}: ${s.text}${s.handled ? ' (planned)' : ' (not yet planned)'}`), '')
  return lines.join('\n')
}

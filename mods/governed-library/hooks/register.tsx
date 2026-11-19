import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LibrarySummary } from '../types'

// The Library of governed designs, skills, loops and tools (RAT-014, proposed). The logic lives in the project's own
// code/library.js, which is plain Node and tested there; this mod is the model's tools, the person's commands, a pane and a guard.
const CLI = 'code/library.js'
const PANE = 'library'
const FORGE = 'mcp__governed-library__library_forge'
const GATE = 'mcp__governed-library__library_gate'
const LIST = 'mcp__governed-library__library_list'
// The record is closed to hand edits. Best effort: a hook is not a security boundary.
const RECORD = /(^|[\\/])(registry|decisions)\.jsonl$/
const RECORD_WRITE = /(>|\btee\b|\bsed\s+-i|\brm\b|\bmv\b|\btruncate\b)[^|;&]*(registry|decisions)\.jsonl/

const summary = atom({ plugin: 'governed-library', key: 'summary' } as const, null, {
  shape: 'summary-1',
})

type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
type Answer = { ok: boolean; text: string }

const lib = async (run: Run, args: string[]): Promise<Answer> => {
  try {
    const done = await run(['node', CLI, ...args])
    return done.exitCode === 0
      ? { ok: true, text: done.stdout.trim() }
      : { ok: false, text: (done.stderr || done.stdout).trim() }
  } catch (e) {
    return { ok: false, text: `The Library could not run: ${String(e)}` }
  }
}

const NOT_HERE = `No ${CLI} in this project, so there is no Library here. It comes with the Mutual Understanding Harness (RAT-014).`
const HUMAN = new Set(['composer', 'bridge'])

const text = (v: unknown) => (typeof v === 'string' ? v : undefined)

// Refresh the cached summary and the status line. Never throws: a Library that cannot be read shows nothing.
async function refresh($: EngineInterface) {
  const got = await lib(argv => $.process.run(argv), ['report'])
  if (!got.ok) {
    $.ui.status(undefined)
    return
  }
  try {
    const r = JSON.parse(got.text)
    const next: LibrarySummary = {
      asOf: r.as_of,
      proposed: r.proposed,
      ratified: r.ratified,
      due: r.due + r.ended,
      rows: r.rows.map((x: any) => ({
        id: x.id,
        kind: x.kind,
        status: x.status,
        answer: x.answer ?? null,
        due: !!x.due,
        ended: !!x.ended,
        problems: x.problems.length,
      })),
    }
    await update($, summary, () => next)
    $.ui.status(
      next.rows.length === 0
        ? undefined
        : `library: ${next.ratified} ratified, ${next.proposed} proposed${next.due ? `, ${next.due} due` : ''}`,
    )
  } catch {
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'library',
      description: 'The governed Library: list, gate, ratify, revisit, retire',
      argumentHint: '[list | gate <id> | ratify <id> <review-by> <name> | pane]',
    })
    const here = await $.fs.exists(CLI)
    if (here) {
      await $.tool.register({
        name: 'library_forge',
        isDeferred: false,
        description:
          'Add a design, skill, loop or tool to the governed Library as a PROPOSED entry. It needs a one-line why, a scope (where, what kind of work, until when), a review date on or before that end date, and the action it declares (loops also need a cadence and an exit). The tool refuses what is incomplete, creates a file with every required section empty, and records it. You then write every section of that file. You cannot ratify, revisit or retire: only a person does, with /library.',
        inputSchema: {
          type: 'object',
          required: ['kind', 'name', 'why', 'scope', 'review_by'],
          properties: {
            kind: { type: 'string', description: 'design, skill, loop or tool (or a kind the project added in library/kinds.json)' },
            name: { type: 'string' },
            why: { type: 'string', description: 'One line: why this exists' },
            scope: {
              type: 'object',
              required: ['where', 'work', 'until'],
              properties: {
                where: { type: 'string', description: 'Where it may act' },
                work: { type: 'string', description: 'What kind of work' },
                until: { type: 'string', description: 'YYYY-MM-DD' },
              },
            },
            review_by: { type: 'string', description: 'YYYY-MM-DD, on or before scope.until' },
            declares: {
              type: 'object',
              description: 'The riskiest action it would take, in the harness action vocabulary (code/harness/action-schema.json): { action, environment?, target?, flags? }',
              properties: { action: { type: 'string' }, environment: { type: 'string' }, target: { type: 'string' }, flags: { type: 'object' } },
            },
            every: { type: 'string', description: 'Loops: how often' },
            exit: { type: 'string', description: 'Loops: what ends it' },
          },
        },
      })
      await $.tool.register({
        name: 'library_gate',
        isDeferred: false,
        description:
          'Before you use a Library skill, loop or tool, ask whether you may. Answers proceed, ask or refuse with the reason. Follow the answer. A proposed, retired, out-of-scope or overdue entry is never proceed.',
        inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      })
      await $.tool.register({
        name: 'library_list',
        description: 'List the Library: each entry, its state, what the rules say about it, and anything that needs a person.',
      })
      await refresh($)
    }

    return next(e)
  })

  on('command.run', { command: 'library' }, async ($, e) => {
    if (!(await $.fs.exists(CLI))) return { text: NOT_HERE }
    const run: Run = argv => $.process.run(argv)
    const [sub = 'list', ...rest] = e.args.trim().split(/\s+/)
    const isPerson = HUMAN.has(e.origin?.kind ?? '')
    const person = (what: string) => ({
      text: `Only a person ${what}. Nothing here promotes itself. Type /library ${sub} yourself.`,
    })

    if (sub === 'pane') {
      await $.ui.open({ id: PANE, title: 'Library' })
      return { text: 'Library pane opened.' }
    }
    if (sub === 'list' || sub === '') {
      const got = await lib(run, ['list'])
      await refresh($)
      return { text: got.text }
    }
    if (sub === 'gate') {
      const got = await lib(run, ['gate', rest[0] ?? ''])
      if (!got.ok) return { text: got.text }
      const g = JSON.parse(got.text)
      return { text: `${g.answer}: ${g.reason}` }
    }
    if (sub === 'ratify') {
      if (!isPerson) return person('ratifies')
      const [id, reviewBy, ...name] = rest
      const got = await lib(run, ['ratify', id ?? '', JSON.stringify({ released_by: name.join(' '), review_by: reviewBy })])
      await refresh($)
      return { text: got.ok ? `Ratified ${id}, signed by ${name.join(' ')}. ${JSON.parse(got.text).note}` : got.text }
    }
    if (sub === 'revisit' || sub === 'retire') {
      if (!isPerson) return person(sub === 'revisit' ? 're-decides' : 'retires')
      const [head = '', note = ''] = rest.join(' ').split('::').map(s => s.trim())
      const words = head.split(/\s+/)
      const id = words.shift() ?? ''
      const args =
        sub === 'revisit'
          ? { review_by: words.shift(), released_by: words.join(' '), note }
          : { released_by: words.join(' '), reason: note }
      const got = await lib(run, [sub, id, JSON.stringify(args)])
      await refresh($)
      return { text: got.ok ? `${sub === 'revisit' ? 'Revisited' : 'Retired'} ${id}.` : got.text }
    }

    return {
      text: [
        '/library                                         list entries, what the rules say, what needs a person',
        '/library gate <id>                               proceed, ask or refuse, with the reason',
        '/library ratify <id> <review-by> <your name>     a person approves a proposed entry',
        '/library revisit <id> <review-by> <name> :: <note>   a person re-decides a due entry',
        '/library retire <id> <name> :: <reason>         a person retires an entry',
        '/library pane                                    open the Library pane',
      ].join('\n'),
    }
  })

  // The model's tools. There is no tool to ratify, revisit or retire: only a person's command does that.
  on('tool.run', { tool: FORGE }, async ($, e) => {
    if (!(await $.fs.exists(CLI))) return { deny: NOT_HERE }
    const a = e as unknown as Record<string, unknown>
    const spec = {
      kind: a.kind,
      name: a.name,
      why: a.why,
      scope: a.scope,
      review_by: a.review_by,
      declares: a.declares,
      every: a.every,
      exit: a.exit,
      created_by: 'Claude (Claude Code session)',
    }
    const got = await lib(argv => $.process.run(argv), ['forge', JSON.stringify(spec)])
    await refresh($)
    if (!got.ok) return { result: `Refused, nothing was made:\n${got.text}\nFix these and call library_forge again.` }
    const r = JSON.parse(got.text)
    return {
      result: `Forged ${r.id} as PROPOSED. The rules say: ${r.governed.answer} (${r.governed.rule_id}: ${r.governed.reason}).\nNow write every section of ${r.file}: ${r.headings.join(', ')}. Replace each "_To be written._" with real content.\nYou cannot ratify it. A person does, with /library ratify ${r.id} <review-by> <their name>. Until then library_gate says ask.`,
    }
  })

  on('tool.run', { tool: GATE }, async ($, e) => {
    if (!(await $.fs.exists(CLI))) return { deny: NOT_HERE }
    const got = await lib(argv => $.process.run(argv), ['gate', text((e as unknown as Record<string, unknown>).id) ?? ''])
    if (!got.ok) return { result: got.text }
    const g = JSON.parse(got.text)
    return { result: `${g.answer}: ${g.reason}${g.answer === 'proceed' ? '' : '\nDo not go ahead on your own. If unsure, ask.'}` }
  })

  on('tool.run', { tool: LIST }, async $ => {
    if (!(await $.fs.exists(CLI))) return { deny: NOT_HERE }
    return { result: (await lib(argv => $.process.run(argv), ['list'])).text }
  })

  // Hands off the record (G17): the registry and the Ledger are written by code/library.js and code/understanding.js, never by hand.
  const closed = (e: { tool: string; [k: string]: unknown }) => {
    if ((e.tool === 'Write' || e.tool === 'Edit') && RECORD.test(text(e.file_path) ?? '')) return true
    return e.tool === 'Bash' && RECORD_WRITE.test(text(e.command) ?? '')
  }
  const NO = (p: string) =>
    `${p}: the Library's registry and the Ledger are append-only and written by code, not by hand (G17). Use library_forge or /library. To correct a line, add a new line that points to the old one (LEDGER.md).`
  on('tool.call', ($, e, next) => (closed(e as never) ? { deny: NO($.plugin.name) } : next(e))).catch(($, e, next) =>
    next.called ? next(e) : closed(e as never) ? { deny: NO($.plugin.name) } : next(e),
  )

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    if (!(await $.fs.exists(CLI))) return out

    return {
      sections: [
        ...out.sections,
        {
          id: 'governed-library:rules',
          scope: 'session',
          text: 'This project keeps a governed Library of designs, skills, loops and tools (library/). Add one with library_forge: it needs a WHY, a scope (where, what kind of work, until when), a review date and the action it declares, and a loop also needs a cadence and an exit. Then write every section of the file it makes. You cannot ratify, revisit or retire an entry; only a person does, with /library. Before you use a Library skill, loop or tool, call library_gate and follow its answer: proceed, ask or refuse. If unsure, ask. Never invent proceed.',
        },
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, summary)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)

    if (!s || s.rows.length === 0) return <Text dimColor>The Library is empty. Ask for a design, skill, loop or tool to be forged.</Text>

    return (
      <Box flexDirection="column">
        <Text>
          {s.ratified} ratified, {s.proposed} proposed{s.due ? `, ${s.due} need a person` : ''}
        </Text>
        {s.rows.slice(0, room).map(r => (
          <Text dimColor={r.status === 'retired'}>
            {r.id} [{r.status}
            {r.due ? ', due' : ''}
            {r.ended ? ', scope ended' : ''}] {r.answer ? `answers ${r.answer}` : ''}
            {r.problems ? `, ${r.problems} to fix` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}

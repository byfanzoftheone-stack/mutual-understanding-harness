import { expect, test } from 'claude-code/testing'

const PROCESS = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const PRESENT = { isFullscreen: false, columns: 80 }
const REPORT = JSON.stringify({ as_of: '2026-11-19', proposed: 1, ratified: 0, due: 0, ended: 0, rows: [{ id: 'design-a', kind: 'design', status: 'proposed', answer: 'proceed', due: false, ended: false, problems: [] }] })

test('the record cannot be edited by hand, and other writes pass', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  const denied = await $.tool.call({ tool: 'Write', file_path: 'library/registry.jsonl', content: 'x' })
  expect(denied.deny).toMatch(/append-only/)
  const ledger = await $.tool.call({ tool: 'Edit', file_path: '/home/u/ledger/decisions.jsonl', old_string: 'a', new_string: 'b' })
  expect(ledger.deny).toMatch(/append-only/)
  const shell = await $.tool.call({ tool: 'Bash', command: 'echo x >> library/registry.jsonl' })
  expect(shell.deny).toMatch(/append-only/)
  const fine = await $.tool.call({ tool: 'Write', file_path: 'library/designs/design-a.md', content: 'x' })
  expect(fine.deny).toBeUndefined()
})

test('only a person can ratify: a plugin or the model cannot', async ($, on) => {
  on('fs.exists', () => ({ value: true }))
  on('process.run', () => PROCESS('{}'))
  on('command.run', () => ({ text: 'engine' }))

  const asPlugin = await $.command.run({ command: 'library', args: 'ratify design-a 2026-12-01 Someone', origin: { kind: 'plugin', name: 'other' }, presentation: PRESENT })
  expect(asPlugin.text).toMatch(/Only a person/)
  const asPerson = await $.command.run({ command: 'library', args: 'gate design-a', origin: { kind: 'composer' }, presentation: PRESENT })
  expect(asPerson.text).not.toMatch(/Only a person/)
})

test('the model gets a forge tool, a gate tool and no way to ratify', async ($, on) => {
  const registered: string[] = []
  on('fs.exists', () => ({ value: true }))
  on('command.register', () => ({ value: { command: 'library' } }))
  on('tool.register', (_, e) => {
    registered.push(e.name)

    return { value: { tool: `mcp__governed-library__${e.name}` } }
  })
  on('process.run', () => PROCESS(REPORT))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(registered).toEqual(['library_forge', 'library_gate', 'library_list'])
  expect(registered.some(n => /ratif|retire|revisit/.test(n))).toBe(false)
})

test('a forge the code refuses is told plainly, and nothing is claimed', async ($, on) => {
  on('fs.exists', () => ({ value: true }))
  on('process.run', (_, e) => (e.argv.includes('forge') ? PROCESS('', 1) : PROCESS(REPORT)))

  const ran = await $.tool.call({ tool: 'mcp__governed-library__library_forge', kind: 'loop', name: 'x' })
  expect(JSON.stringify(ran)).toContain('Refused')
})

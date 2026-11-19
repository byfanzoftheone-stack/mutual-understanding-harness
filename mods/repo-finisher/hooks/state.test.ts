import { expect, test } from 'claude-code/testing'

import { activeApproved, allowedWrite, approve, exportMarkdown, mark, modeOf, newRun, normalizePath, propose, statusLine, suggest } from '../lib/state'
import type { Proposal } from '../lib/state'

const T = '2026-11-19'
const P = (id: string, over: Partial<Proposal> = {}): Proposal => ({ id, title: `Fix ${id}`, why: 'Because it matters.', paths: ['docs/'], verify: 'run: npm test', ...over })
const fresh = () => newRun('/repo', T, [P('F-docs'), P('F-tests', { paths: ['tests/'] }), P('F-license', { paths: ['LICENSE'], risk: 'high' })])

test('a scope names where: the whole repository, wildcards and escapes are refused', () => {
  const run = fresh()
  for (const bad of ['.', './', '/', '*', '**', '../x', '/etc/passwd', 'src/*.ts', 'a/../b'])
    expect(propose(run, P('F-x', { paths: [bad] }), 'model').ok).toBe(false)
  expect(normalizePath('src/**')).toBe('src/')
  expect(normalizePath('./docs/guide.md')).toBe('docs/guide.md')
})

test('an item needs a why and a way to verify it', () => {
  const run = fresh()
  expect(propose(run, P('F-a', { why: '' }), 'model').ok).toBe(false)
  expect(propose(run, P('F-b', { verify: '  ' }), 'model').ok).toBe(false)
  expect(propose(run, P('F-docs'), 'model').problem).toMatch(/already exists/)
  expect(propose(run, P('F-ok'), 'model').ok).toBe(true)
})

test('nothing is approved until a person signs, and the model has nothing to approve with', () => {
  const run = fresh()
  expect(approve(run, { ids: 'all', by: '' }, T).ok).toBe(false)
  expect(run.items.every(i => i.status === 'proposed')).toBe(true)
  expect(modeOf(run, T)).toBe('planning')
})

test('"all" approves normal-risk items; a high-risk item is approved by id, on its own', () => {
  const run = fresh()
  const r = approve(run, { ids: 'all', by: 'Travis Jacobs' }, T)
  expect(r.approved.sort()).toEqual(['F-docs', 'F-tests'])
  expect(r.skipped).toEqual([{ id: 'F-license', why: expect.stringMatching(/high risk/) }])
  expect(approve(run, { ids: ['F-license'], by: 'Travis Jacobs' }, T).approved).toEqual(['F-license'])
})

test('every approval ends: 14 days by default, and an expired approval is no approval', () => {
  const run = fresh()
  approve(run, { ids: ['F-docs'], by: 'T' }, T)
  expect(run.items[0]?.until).toBe('2026-12-03')
  expect(activeApproved(run, '2026-12-03')).toHaveLength(1)
  expect(activeApproved(run, '2026-12-04')).toHaveLength(0)
  expect(approve(run, { ids: ['F-tests'], by: 'T', until: '2026-11-19' }, T).ok).toBe(false)
})

test('writes are allowed only inside approved paths, and never to secrets', () => {
  const run = fresh()
  expect(allowedWrite(run, '/repo', '/repo/docs/a.md', T).ok).toBe(false)
  approve(run, { ids: ['F-docs'], by: 'T' }, T)
  expect(allowedWrite(run, '/repo', '/repo/docs/a.md', T).ok).toBe(true)
  expect(allowedWrite(run, '/repo', 'docs/b.md', T).ok).toBe(true)
  expect(allowedWrite(run, '/repo', '/repo/src/main.ts', T).ok).toBe(false)
  expect(allowedWrite(run, '/repo', '/repo/docs/../src/main.ts', T).ok).toBe(false)
  expect(allowedWrite(run, '/repo', '/other/docs/a.md', T).ok).toBe(false)
  expect(allowedWrite(run, '/repo', '/etc/hosts', T).ok).toBe(false)
  expect(allowedWrite(run, '/repo', '/tmp/scratch.txt', T).ok).toBe(true)
  const secretRun = newRun('/repo', T, [P('F-s', { paths: ['config/'] })])
  approve(secretRun, { ids: ['F-s'], by: 'T' }, T)
  for (const f of ['config/.env', 'config/.env.local', 'config/server.pem', 'config/id_rsa', 'config/credentials.json'])
    expect(allowedWrite(secretRun, '/repo', `/repo/${f}`, T).ok).toBe(false)
  expect(allowedWrite(secretRun, '/repo', '/repo/config/.env.example', T).ok).toBe(true)
})

test('only an approved item can be marked, and "done" needs evidence', () => {
  const run = fresh()
  expect(mark(run, 'F-docs', 'done', 'ran it', T).ok).toBe(false)
  approve(run, { ids: ['F-docs'], by: 'T' }, T)
  expect(mark(run, 'F-docs', 'done', '', T).ok).toBe(false)
  expect(mark(run, 'F-docs', 'finished', 'ran it', T).ok).toBe(false)
  expect(mark(run, 'F-docs', 'done', 'npm test: 12 passed', T).ok).toBe(true)
  expect(run.items[0]?.evidence).toBe('npm test: 12 passed')
  expect(mark(run, 'F-docs', 'done', 'again', T).ok).toBe(false)
})

test('the run moves planning, implementing, waiting; and waits for the person when the approved work is done', () => {
  const run = newRun('/repo', T, [P('F-docs')])
  expect(modeOf(run, T)).toBe('planning')
  approve(run, { ids: 'all', by: 'T' }, T)
  expect(modeOf(run, T)).toBe('implementing')
  mark(run, 'F-docs', 'done', 'checked', T)
  expect(modeOf(run, T)).toBe('waiting')
  expect(statusLine(run, undefined, T)).toMatch(/waiting for your suggestions/)
  suggest(run, 'add a health check endpoint', T)
  propose(run, P('F-health', { paths: ['src/health.ts'] }), 'model')
  expect(modeOf(run, T)).toBe('planning')
  expect(statusLine(run, undefined, T)).toMatch(/waiting for your approval/)
  run.stopped = T
  expect(modeOf(run, T)).toBe('stopped')
})

test('a suggestion needs words; the record shows who approved what, until when', () => {
  const run = fresh()
  expect(suggest(run, '  ', T).ok).toBe(false)
  approve(run, { ids: ['F-docs'], by: 'Travis Jacobs' }, T)
  mark(run, 'F-docs', 'done', 'read it through', T)
  const md = exportMarkdown(run, T)
  expect(md).toContain('Approved by:** Travis Jacobs on 2026-11-19, until 2026-12-03')
  expect(md).toContain('Evidence:** read it through')
  expect(md).toContain('F-license')
})

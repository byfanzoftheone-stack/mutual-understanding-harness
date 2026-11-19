// Proves the survey is read-only, finds what is bare, reports a secret without printing it, orders the plan bare-code first,
// and finds nothing to fix in a repository that already has what a production-ready one needs. Run: node test/survey.test.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SURVEY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'survey.mjs')
let pass = 0, total = 0
const t = (n, ok) => { total++; if (ok) pass++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + n) }
const mk = (files, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-'))) => {
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), body) }
  return dir
}
const survey = dir => JSON.parse(execFileSync('node', [SURVEY, dir]).toString())
const fingerprint = dir => { const out = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p) + ':' + crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex') + ':' + fs.statSync(p).mtimeMs) } }; walk(dir); return out.join('\n') }
const status = (s, id) => s.checks.find(c => c.id === id).status
const FAKE = 'sk-' + 'q7Zx'.repeat(7)

// A bare repository: stubs, an empty file, a committed secret, almost nothing else.
const bare = mk({
  'package.json': JSON.stringify({ name: 'bare', version: '0.0.1', scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  'src/empty.js': '',
  'src/stub.js': '// TODO\nexport function work() {\n  throw new Error("not implemented")\n}\n',
  'src/real.js': Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n',
  'src/config.js': `const key = "${FAKE}"\nexport default process.env.PORT\n`,
  '.env': 'PORT=3000\n',
})
const before = fingerprint(bare)
const s = survey(bare)
t('the survey writes nothing: every file, its bytes and its time are unchanged', fingerprint(bare) === before)
t('it says it is read-only', s.read_only === true)
t('it finds the bare code: the empty file and the stub', s.bare.some(b => b.file === 'src/empty.js' && /empty/.test(b.why)) && s.bare.some(b => b.file === 'src/stub.js'))
t('a placeholder test script is not a test command', status(s, 'test-command') === 'gap' && s.commands.test === null)
t('no tests, no README, no license, no CI, no lockfile are each a gap', ['tests', 'readme', 'license', 'ci', 'lockfile', 'gitignore'].every(id => status(s, id) === 'gap'))
const sec = s.checks.find(c => c.id === 'secrets')
t('a committed secret and an env file are a high-risk gap, by file and line', sec.status === 'gap' && sec.risk === 'high' && /src\/config\.js:1/.test(sec.evidence) && /\.env/.test(sec.evidence))
t('the secret VALUE is never printed anywhere in the output', !JSON.stringify(s).includes(FAKE) && !JSON.stringify(s).includes('q7Zxq7Zx'))
t('reading environment variables with no .env.example is a gap', status(s, 'env-example') === 'gap')
t('the plan starts with the bare code, because that is the foundation', s.proposals[0].id === 'F-bare-code')
t('every proposed item has a why, a verify step and a risk', s.proposals.every(p => p.why.length > 20 && p.verify && ['normal', 'high'].includes(p.risk)))
const byId = Object.fromEntries(s.proposals.map(p => [p.id, p]))
t('the licence, the secret and the dependency audit are high risk: a person decides', byId['F-license'].risk === 'high' && byId['F-secrets'].risk === 'high' && byId['F-dep-audit'].risk === 'high')
t('what only a person can do is not claimed: the audit is "not run", not "pass"', status(s, 'dep-audit') === 'unchecked')

// A repository that already has what production needs, in a real git repository (so the git path is exercised too).
const readme = '# Done\n\nA small library. ## Install\n\nRun `npm install done`. ## Usage\n\n' + 'It does one thing and it does it well, and this paragraph says so at some length. '.repeat(8)
const done = mk({
  'package.json': JSON.stringify({ name: 'done', version: '1.2.0', license: 'MIT', scripts: { test: 'node --test', lint: 'eslint .' } }),
  'package-lock.json': '{}', 'README.md': readme, LICENSE: 'MIT License\n', 'CHANGELOG.md': '# 1.2.0\n', 'SECURITY.md': '# Report here\n', 'CONTRIBUTING.md': '# Contribute\n',
  '.gitignore': 'node_modules\n.env\n', '.eslintrc.json': '{}', '.github/workflows/ci.yml': 'name: ci\non: [push]\n',
  'src/index.js': Array.from({ length: 20 }, (_, i) => `export const f${i} = () => ${i}`).join('\n') + '\n',
  'test/index.test.js': 'import test from "node:test"\ntest("it works", () => {})\n',
  '.env.example': 'PORT=\n',
})
execFileSync('git', ['-C', done, 'init', '-q']); execFileSync('git', ['-C', done, 'add', '-A'])
const d = survey(done)
t('git path: a repository that has everything has no gaps', d.git.isRepo === true && d.summary.gap === 0)
t('git path: nothing is claimed done that only a person can judge (audit stays "not run")', status(d, 'dep-audit') === 'unchecked' && d.proposals.every(p => p.id === 'F-dep-audit'))
t('it finds the test command and the test files', d.commands.test === 'npm test' && d.counts.test_files === 1)

// Files git ignores are not read, and the walk path (no git) skips dependency folders.
const ignored = mk({ 'package.json': '{"name":"x"}', 'src/a.js': 'export const a = 1\n', 'node_modules/dep/index.js': `const k = "${FAKE}"\n` })
t('walk path: node_modules is skipped, so a dependency\'s contents are not reported', survey(ignored).checks.find(c => c.id === 'secrets').status === 'pass')

// A directory that is not a repository at all
const empty = mk({ 'notes.txt': 'hello\n' })
const e = survey(empty)
t('a folder with no code is not told it needs tests', status(e, 'tests') === 'na' && status(e, 'manifest') === 'na')

console.log(`\n${pass}/${total} passed`); process.exit(pass === total ? 0 : 1)

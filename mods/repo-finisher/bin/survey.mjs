#!/usr/bin/env node
// survey.mjs - a READ-ONLY survey of one repository. It writes nothing. It prints one JSON document: what the code is,
// what is bare, what is missing for a production-ready repo, and a seed plan with a WHY for every gap.
// Findings are heuristics. "Production ready" is a bar a person confirms; this only reads and reports.
// Secrets are reported by file, line and kind. A value is never printed (G2).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(process.argv[2] || process.cwd())
const MAX_FILES = 5000, MAX_BYTES = 1_000_000
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', '.cache', 'coverage', '.idea', '.vscode', '.tox'])
const SOURCE_EXT = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'kt', 'rb', 'php', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp', 'swift', 'scala', 'sh', 'vue', 'svelte'])
const rel = f => f.split(path.sep).join('/')

function list() {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
    return { isRepo: true, files: out.split('\0').filter(Boolean) }
  } catch { /* not a git repo: walk it */ }
  const files = []
  const walk = d => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      if (files.length > MAX_FILES + 1) return
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(d, e.name)) } else if (e.isFile()) files.push(rel(path.join(d, e.name)))
    }
  }
  walk('')
  return { isRepo: false, files }
}
const git = args => { try { return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim() } catch { return '' } }

const { isRepo, files: all } = list()
const files = all.filter(f => !f.split('/').some(p => SKIP.has(p)))
const truncated = files.length > MAX_FILES
const scanned = files.slice(0, MAX_FILES)
const ext = f => (path.extname(f).slice(1) || '').toLowerCase()
const base = f => path.basename(f)
const has = re => scanned.some(f => re.test(f))
const find = re => scanned.filter(f => re.test(f))
const read = f => { try { const p = path.join(root, f); if (fs.statSync(p).size > MAX_BYTES) return null; const b = fs.readFileSync(p); return b.subarray(0, 8000).includes(0) ? null : b.toString('utf8') } catch { return null } }

const isTest = f => /(^|\/)(tests?|__tests__|spec|specs)\//i.test(f) || /\.(test|spec)\.[a-z]+$/i.test(f) || /(^|\/)test_[^/]+\.py$/.test(f) || /_test\.(go|py|rb)$/.test(f) || /(^|\/)test-[^/]+\.(m?js|cjs|tsx?)$/.test(f)
const isSource = f => SOURCE_EXT.has(ext(f)) && !isTest(f) && !/\.d\.ts$/.test(f) && !/(^|\/)(bin|scripts|examples?|docs?|fixtures?)\//.test(f)
const STUB = /(TODO|FIXME|XXX|HACK)\b|NotImplemented(Error)?|not implemented|unimplemented!|todo!\(|raise NotImplementedError|panic\("(todo|unimplemented)/i
const SECRET = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'cloud access key id'],
  [/\bghp_[A-Za-z0-9]{30,}\b/, 'github token'],
  [/\bsk-[A-Za-z0-9]{20,}\b/, 'api secret key'],
  [/(api[_-]?key|secret|token|passw(or)?d)["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{16,}["']/i, 'hard-coded credential']
]

let loc = 0, todos = 0
const langs = {}, bare = [], secrets = [], envUse = []
for (const f of scanned) {
  const e = ext(f); if (e) langs[e] = (langs[e] || 0) + 1
  const text = read(f); if (text === null) continue
  const lines = text.split('\n'), meaningful = lines.filter(l => l.trim() && !/^\s*(\/\/|#|\*|\/\*|--)/.test(l)).length
  loc += meaningful
  if (isSource(f)) {
    if (meaningful === 0) bare.push({ file: f, why: 'empty file' })
    else if (meaningful <= 3 && !/(^|\/)(index|__init__|mod|main)\.[a-z]+$/.test(f)) bare.push({ file: f, why: `only ${meaningful} line(s) of code` })
    const n = lines.filter(l => STUB.test(l)).length
    if (n) { todos += n; if (n >= 2 || meaningful <= 15) bare.push({ file: f, why: `${n} TODO or not-implemented marker(s)` }) }
    if (/process\.env|os\.environ|os\.getenv|getenv\(|std::env|ENV\[/.test(text)) envUse.push(f)
  }
  if (!/\.(lock|sum|svg|min\.js)$/.test(f) && !/\.(example|sample|template)$/.test(f) && !/(^|\/)(test|tests|fixtures?)\//.test(f)) {
    lines.forEach((l, i) => { for (const [re, kind] of SECRET) if (re.test(l)) { secrets.push({ file: f, line: i + 1, kind }); break } })
  }
}

const j = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) } catch { return null } }
const pkg = has(/^package\.json$/) ? j('package.json') : null
const has2 = (...names) => names.some(n => scanned.includes(n))
const stack = pkg ? 'node' : has(/^(pyproject\.toml|setup\.py|requirements\.txt|Pipfile)$/) ? 'python' : has2('go.mod') ? 'go' : has2('Cargo.toml') ? 'rust' : has(/^(pom\.xml|build\.gradle(\.kts)?)$/) ? 'java' : has2('Gemfile') ? 'ruby' : has2('composer.json') ? 'php' : has(/\.csproj$/) ? 'dotnet' : 'unknown'
const scripts = (pkg && pkg.scripts) || {}
const placeholderTest = /no test specified/.test(scripts.test || '')
const commands = {
  test: stack === 'node' ? (scripts.test && !placeholderTest ? 'npm test' : null) : stack === 'python' ? 'pytest' : stack === 'go' ? 'go test ./...' : stack === 'rust' ? 'cargo test' : stack === 'java' ? (has2('pom.xml') ? 'mvn test' : 'gradle test') : stack === 'ruby' ? 'bundle exec rake test' : null,
  lint: stack === 'node' ? (scripts.lint ? 'npm run lint' : null) : stack === 'python' ? 'ruff check .' : stack === 'go' ? 'go vet ./...' : stack === 'rust' ? 'cargo clippy' : null,
  build: stack === 'node' ? (scripts.build ? 'npm run build' : null) : stack === 'go' ? 'go build ./...' : stack === 'rust' ? 'cargo build' : stack === 'java' ? (has2('pom.xml') ? 'mvn package' : 'gradle build') : null
}
const sourceFiles = scanned.filter(isSource), testFiles = scanned.filter(isTest)
const readme = find(/^readme(\.[a-z]+)?$/i)[0]
const readmeText = readme ? read(readme) || '' : ''
const words = readmeText.split(/\s+/).filter(Boolean).length
const gi = has2('.gitignore') ? read('.gitignore') || '' : ''
const trackedEnv = find(/(^|\/)\.env(\.(?!example|sample|template)[^/]+)?$/)
const lockfiles = { node: /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/, python: /^(poetry\.lock|Pipfile\.lock|uv\.lock|requirements\.txt)$/, go: /^go\.sum$/, rust: /^Cargo\.lock$/, ruby: /^Gemfile\.lock$/, php: /^composer\.lock$/ }
const hasManifest = stack !== 'unknown'
const codeRepo = sourceFiles.length > 0

const checks = []
const add = (id, area, label, status, evidence, extra) => checks.push({ id, area, label, status, evidence, size: 'S', risk: 'normal', paths: [], verify: '', why: '', order: 5, ...extra })

add('bare-code', 'source', 'Code that is bare, stubbed or unfinished', bare.length ? 'gap' : 'pass', bare.length ? `${bare.length} file(s); ${todos} TODO/not-implemented markers overall` : 'no empty or stubbed source files found',
  { size: bare.length > 10 ? 'L' : bare.length > 3 ? 'M' : 'S', paths: [...new Set(bare.map(b => b.file))].slice(0, 25), verify: commands.test ? `run: ${commands.test}` : 'person: read the finished files', why: 'The foundation has to be real before anything is built on it. Stubs that look finished hide the gaps.', order: 1 })
add('manifest', 'build', 'A manifest saying how it is installed and run', !codeRepo ? 'na' : hasManifest ? 'pass' : 'gap', !codeRepo ? 'no source code found' : hasManifest ? `${stack} project` : 'source code with no package manifest',
  { size: 'M', paths: stack === 'unknown' ? ['package.json'] : [], verify: 'person: a stranger can install it from the manifest', why: 'Without a manifest nobody can install or run it the same way twice.', order: 2 })
add('tests', 'tests', 'Automated tests', !codeRepo ? 'na' : testFiles.length ? 'pass' : 'gap', !codeRepo ? 'no source code found' : `${testFiles.length} test file(s) for ${sourceFiles.length} source file(s)`,
  { size: 'L', paths: ['tests/'], verify: commands.test ? `run: ${commands.test}` : 'person: tests run and pass', why: 'Tests are how a change proves it did not break what worked. Production code without them is a guess.', order: 3 })
add('test-command', 'tests', 'A single command that runs the tests', !codeRepo ? 'na' : commands.test && (stack !== 'node' || !placeholderTest) ? 'pass' : 'gap', commands.test ? `\`${commands.test}\`` : 'none declared',
  { paths: stack === 'node' ? ['package.json'] : [], verify: 'run: the test command exits 0', why: 'If running the tests takes tribal knowledge they will not be run.', order: 3 })
add('lint-format', 'tooling', 'Lint and format configuration', !codeRepo ? 'na' : has(/(^|\/)(\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|prettier\.config\.[a-z]+|biome\.jsonc?|ruff\.toml|\.flake8|\.golangci\.[a-z]+|rustfmt\.toml|\.editorconfig)$/) || /\[tool\.(ruff|black|flake8|isort)\]/.test(read('pyproject.toml') || '') ? 'pass' : 'gap', 'checked config files',
  { paths: stack === 'node' ? ['.eslintrc.json', '.prettierrc'] : ['.editorconfig'], verify: commands.lint ? `run: ${commands.lint}` : 'person: lint runs clean', why: 'Style arguments and avoidable bugs are cheaper to stop by machine than to review by hand.', order: 4 })
const hasTs = sourceFiles.some(f => /\.tsx?$/.test(f))
add('types', 'tooling', 'A TypeScript configuration', hasTs ? (has(/(^|\/)tsconfig[^/]*\.json$/) ? 'pass' : 'gap') : 'na', hasTs ? 'TypeScript files found' : 'no TypeScript files, so not required',
  { size: 'M', paths: ['tsconfig.json'], verify: 'run: the compiler exits 0', why: 'TypeScript without a config is compiled with defaults nobody chose.', order: 4 })
add('ci', 'tooling', 'Continuous integration', has(/^(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|\.drone\.yml)$/) ? 'pass' : codeRepo ? 'gap' : 'na', 'looked for a CI config',
  { size: 'M', paths: ['.github/workflows/'], verify: 'person: the workflow runs on a pull request and passes', why: 'CI is the same check run the same way every time, not only on the machine of whoever remembers.', order: 4 })
add('lockfile', 'deps', 'Locked dependency versions', !hasManifest || !lockfiles[stack] ? 'na' : has(lockfiles[stack]) ? 'pass' : 'gap', hasManifest ? `${stack} project` : 'no manifest',
  { paths: stack === 'node' ? ['package-lock.json'] : [], verify: 'run: a clean install reproduces the same versions', why: 'Without a lockfile a build can change between two days with no change in the code.', order: 6 })
add('dep-audit', 'deps', 'A recorded dependency audit', hasManifest ? 'unchecked' : 'na', 'not run: it needs the network; the survey only reads',
  { risk: 'high', paths: [], verify: stack === 'node' ? 'run: npm audit' : stack === 'python' ? 'run: pip-audit' : 'person: run the stack\'s audit', why: 'Known-vulnerable dependencies are the most common production hole. Upgrades can break things, so a person approves each change.', order: 6 })
add('secrets', 'security', 'No secrets committed', secrets.length || trackedEnv.length ? 'gap' : 'pass', secrets.length || trackedEnv.length ? [...trackedEnv.map(f => `${f}: environment file in the repo`), ...secrets.slice(0, 10).map(s => `${s.file}:${s.line} ${s.kind}`)].join('; ') : 'no secret patterns found (a pattern scan, not a guarantee)',
  { risk: 'high', size: 'M', paths: [...new Set([...trackedEnv, ...secrets.map(s => s.file)])].slice(0, 25), verify: 'person: the secret is rotated, then removed', why: 'A secret in a repo is public the moment the repo is. Removing the line does not un-leak it: a person must rotate it. The values are never printed here.', order: 7 })
add('gitignore', 'security', 'A .gitignore that covers secrets and build output', !codeRepo && !has2('.gitignore') ? 'na' : gi && /(^|\n)\.env/.test(gi) ? 'pass' : 'gap', gi ? '.gitignore exists' : 'no .gitignore',
  { paths: ['.gitignore'], verify: 'run: git status shows no build output or env files', why: 'It keeps secrets and build output out of the history in the first place.', order: 7 })
add('env-example', 'config', 'An .env.example for the settings the code reads', envUse.length && !has(/(^|\/)\.env\.(example|sample|template)$/) ? 'gap' : envUse.length ? 'pass' : 'na', envUse.length ? `${envUse.length} file(s) read environment variables` : 'no environment variables read',
  { paths: ['.env.example'], verify: 'person: every variable the code reads is listed, with no real values', why: 'A new person should know what to set without reading every file.', order: 6 })
add('readme', 'docs', 'A README that says what it is and how to run it', readme && words >= 80 && /install|usage|getting started|run|quick ?start/i.test(readmeText) ? 'pass' : 'gap', readme ? `${words} words` : 'no README',
  { paths: [readme || 'README.md'], verify: 'person: a stranger can install and run it from the README alone', why: 'The README is the front door. If it does not say what this is and how to start, the repo is closed to everyone but its author.', order: 8 })
add('license', 'docs', 'A license', has(/^(LICENSE|LICENCE|COPYING)(\.[a-z]+)?$/i) || (pkg && pkg.license) ? 'pass' : 'gap', 'checked LICENSE and the manifest',
  { risk: 'high', paths: ['LICENSE'], verify: 'person: the license is the one they chose', why: 'Without a license nobody else may legally use the code. Which license is a legal choice, so a person makes it.', order: 8 })
add('security-policy', 'docs', 'A SECURITY.md saying how to report a vulnerability', has(/^(\.github\/)?SECURITY\.md$/i) ? 'pass' : 'gap', 'checked',
  { paths: ['SECURITY.md'], verify: 'person: the contact is real and monitored', why: 'People who find a hole need somewhere safe to say so, other than a public issue.', order: 8 })
add('contributing', 'docs', 'A CONTRIBUTING.md', has(/^(\.github\/)?CONTRIBUTING\.md$/i) ? 'pass' : 'gap', 'checked',
  { paths: ['CONTRIBUTING.md'], verify: 'person: it matches how they want changes made', why: 'It says how to propose a change so reviewers are not answering the same questions each time.', order: 9 })
add('changelog', 'release', 'A changelog and a version', has(/^CHANGELOG(\.[a-z]+)?$/i) && (!pkg || pkg.version) ? 'pass' : 'gap', has(/^CHANGELOG/i) ? 'has a changelog' : 'no changelog',
  { paths: ['CHANGELOG.md'], verify: 'person: the first entry is accurate', why: 'Users decide whether to upgrade from what changed. A release with no record is a release nobody can trust.', order: 9 })
add('container', 'infra', 'A container definition', has(/(^|\/)Dockerfile(\.[a-z]+)?$/) ? 'pass' : 'na', has(/(^|\/)Dockerfile/) ? 'has a Dockerfile' : 'none; not assumed to be needed',
  { risk: 'high', paths: ['Dockerfile'], verify: 'run: the image builds', why: 'Only if it is deployed as a container. Infrastructure changes can reach production, so a person approves them.', order: 10 })

const ORDER_AREA = { source: 'source', build: 'build', tests: 'tests', tooling: 'tooling', deps: 'deps', security: 'security', config: 'config', docs: 'docs', release: 'release', infra: 'infra' }
const proposals = checks.filter(c => c.status === 'gap' || c.status === 'unchecked')
  .sort((a, b) => a.order - b.order)
  .map(c => ({ id: 'F-' + c.id, title: c.status === 'unchecked' ? `Run: ${c.label}` : `Fix: ${c.label}`, why: c.why, area: ORDER_AREA[c.area] || c.area, paths: c.paths.length ? c.paths : [], verify: c.verify, risk: c.risk, size: c.size, evidence: c.evidence }))

const biggest = scanned.map(f => [f, (read(f) || '').split('\n').length]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => ({ file: f, lines: n }))
const doc = {
  root, surveyed_at: new Date().toISOString(), read_only: true, truncated, files_seen: files.length, files_read: scanned.length,
  git: { isRepo, branch: isRepo ? git(['rev-parse', '--abbrev-ref', 'HEAD']) : null, dirty: isRepo ? git(['status', '--porcelain']).split('\n').filter(Boolean).length : null },
  stack, commands, counts: { source_files: sourceFiles.length, test_files: testFiles.length, loc, todos }, languages: langs,
  bare: bare.slice(0, 50), biggest, checks: checks.map(({ order, ...c }) => c), proposals,
  summary: { pass: checks.filter(c => c.status === 'pass').length, gap: checks.filter(c => c.status === 'gap').length, unchecked: checks.filter(c => c.status === 'unchecked').length, na: checks.filter(c => c.status === 'na').length }
}
process.stdout.write(JSON.stringify(doc))

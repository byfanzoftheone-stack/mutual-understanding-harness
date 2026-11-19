// scan-secrets.js - fails if tracked files contain live-looking secrets. Run: node code/commercial/scan-secrets.js
const { execSync } = require('child_process'), fs = require('fs');
const PATTERNS = [/sk_live_[A-Za-z0-9]{10,}/, /sk_test_[A-Za-z0-9]{10,}/, /whsec_[A-Za-z0-9]{10,}/, /ghp_[A-Za-z0-9]{30,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(f => f && fs.existsSync(f) && !/\.(tar|gz|png|jpg)$/.test(f));
const hits = files.flatMap(f => { const t = fs.readFileSync(f, 'utf8'); return PATTERNS.filter(p => p.test(t)).map(p => `${f}: ${p}`); });
if (hits.length) { console.error('Possible secrets:\n' + hits.join('\n')); process.exit(1); }
console.log('scan-secrets: clean (' + files.length + ' files)');

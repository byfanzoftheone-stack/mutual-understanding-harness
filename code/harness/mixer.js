// harness/mixer.js - the Fanzo shuffle (Travis's pattern), version fanzo-shuffle-1.0. Seeded, so every run can be reproduced exactly.
// Input: 60 items in three groups of 20 (items 1-20, 21-40, 41-60). Output: three sheets of 19 plus three set-aside cards.
const VERSION = 'fanzo-shuffle-1.0';
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function run(seed, items) {
  if (!Array.isArray(items) || items.length !== 60) throw new Error('the Fanzo shuffle needs exactly 60 items');
  const R = rng(seed), sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const all = items.map((t, i) => ({ t, from: i < 20 ? 1 : i < 40 ? 2 : 3 }));
  let g1 = sh(all.slice(0, 20)), g2 = sh(all.slice(20, 40)), g3 = sh(all.slice(40, 60)), g4 = [];
  const log = [], chk = (step, want) => { const got = [g1.length, g2.length, g3.length, g4.length]; log.push(step + ' ' + got.join('/')); if (want.join() !== got.join()) throw new Error(step + ': expected ' + want + ' got ' + got); };
  g4 = [...g1.splice(0, 3), ...g2.splice(0, 6), ...g3.splice(0, 9)]; chk('first pull', [17, 14, 11, 18]);
  const aside = g4.splice(0, 3); const rest = sh(g4); g1.push(rest.shift(), rest.shift(), rest.pop()); g4 = [...rest, ...aside]; chk('g4 remix', [20, 14, 11, 15]);
  const notG2 = g1.filter(c => c.from !== 2).slice(0, 3); g1 = g1.filter(c => !notG2.includes(c)); g2.push(...notG2); chk('3 to g2', [17, 17, 11, 15]);
  let m = sh([...g1, ...g2]); g1 = m.slice(0, 17); g2 = m.slice(17); chk('mix g1+g2', [17, 17, 11, 15]);
  g3.push(...g1.splice(0, 3), ...g2.splice(0, 3)); chk('6 to g3', [14, 14, 17, 15]);
  m = sh([...g4, ...g3]); g4 = m.slice(0, 16); g3 = m.slice(16); chk('mix g3+g4', [14, 14, 16, 16]);
  g2.push(g4.shift()); g1.push(g3.pop()); chk('equal 15s', [15, 15, 15, 15]);
  m = sh([...g1, ...g3]); g1 = m.slice(0, 15); g3 = m.slice(15); m = sh([...g2, ...g4]); g2 = m.slice(0, 15); g4 = m.slice(15); chk('mix pairs', [15, 15, 15, 15]);
  const A = sh([...g1, ...g4]), B = sh([...g2, ...g3]);
  g3 = A.slice(0, 20); g1 = B.slice(0, 20); g2 = sh([...A.slice(20), ...B.slice(20)]); g4 = []; chk('final 20s', [20, 20, 20, 0]);
  const aside3 = [g1.splice(3, 1)[0], g2.splice(11, 1)[0], g3.splice(17, 1)[0]]; chk('pull 4th/12th/18th', [19, 19, 19, 0]);
  return { version: VERSION, seed, sheets: [g1, g2, g3].map(s => s.map(c => c.t)), setAside: aside3.map(c => c.t), log };
}
module.exports = { run, VERSION };

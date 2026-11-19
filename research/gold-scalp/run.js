'use strict';
// Usage: node run.js XAUUSD.csv OUT.json
const fs = require('fs');
const g = require('../../goldsmt');
const S = require('./goldscalp');
const m1 = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => { const [t, o, h, lo, c] = l.split(',').map(Number); return { t: t * 1000, end: t * 1000 + 60000, o, h, l: lo, c }; });
const T0 = m1[0].t, T1 = m1[m1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const money = (rs, risk = 1) => { let b = 10000, pk = b, dd = 0; for (const r of rs) { b += b * risk / 100 * r; pk = Math.max(pk, b); dd = Math.max(dd, (pk - b) / pk * 100); } return { end: +b.toFixed(0), ret: +((b / 10000 - 1) * 100).toFixed(1), dd: +dd.toFixed(1) }; };
const NAMES = { A: 'A. NY Opening Range Breakout (M1)', B: 'B. London Asian-range sweep (M5)', C: 'C. EMA pullback (M5)' };
const out = {};
for (const [key, fn] of [['A', S.stratA], ['B', S.stratB], ['C', S.stratC]]) {
  const res = {};
  for (const cost of [0.30, 0.60]) {
    const tr = fn(m1, cost);
    const Rs = tr.map(t => t.R), st = g.stats(Rs);
    const by = (f) => { const m = {}; for (const t of tr) (m[f(t)] = m[f(t)] || []).push(t.R); return Object.fromEntries(Object.keys(m).sort().map(k => [k, g.stats(m[k])])); };
    res[cost] = { stats: st, t: tst(Rs), money: money(Rs), train: g.stats(tr.filter(t => t.entryT < split).map(t => t.R)), test: g.stats(tr.filter(t => t.entryT >= split).map(t => t.R)),
      years: by(t => new Date(t.entryT).getUTCFullYear()), dir: by(t => t.dir), exit: by(t => t.reason), avgRisk: +(tr.reduce((a, t) => a + t.risk, 0) / (tr.length || 1)).toFixed(2), perMonth: +(tr.length / ((T1 - T0) / (30.4 * 864e5))).toFixed(1) };
  }
  out[key] = { name: NAMES[key], res };
  const r = res[0.30], s = r.stats;
  console.log('\n== ' + NAMES[key]);
  console.log(` spread $0.30: ${s.n} trades (${r.perMonth}/mahina), jeet ${s.winRate}%, ausat ${s.avgR}R, PF ${s.pf}, t ${r.t} | 10k -> ${r.money.end} (${r.money.ret}%), girao ${r.money.dd}% | ausat SL $${r.avgRisk}`);
  console.log(` seekhne ${r.train.n}/${r.train.avgR}  imtihan ${r.test.n}/${r.test.avgR} | spread $0.60: ausat ${res[0.6].stats.avgR}R PF ${res[0.6].stats.pf}`);
  console.log(' saal', Object.entries(r.years).map(([y, x]) => `${y}: ${x.n}tr ${x.winRate}% ${x.avgR}R`).join(' | '), '| dir', Object.entries(r.dir).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| exit', Object.entries(r.exit).map(([k, x]) => `${k}:${x.n}`).join(' '));
}
fs.writeFileSync(process.argv[3], JSON.stringify({ split, out }, null, 1));

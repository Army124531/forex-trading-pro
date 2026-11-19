'use strict';
const fs = require('fs'); const g = require('../../goldsmt.js');
const load = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { const [t, o, h, lo, c] = l.split(',').map(Number); return { t: t * 1000, end: t * 1000 + 60000, o, h, l: lo, c }; });
const raw = { gold5: g.resample(load(process.argv[2]), 5), silver5: g.resample(load(process.argv[3]), 5) };
const T0 = raw.gold5[0].t, T1 = raw.gold5[raw.gold5.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const F = { tp: ['1.5R', '2R', '3R', 'liq', 'eod'], smt: [0, 1, 2], keyTypes: ['all', 'fvg', 'pd'], trend: ['none', 'h4'], session: [[7, 17], [7, 12], [12, 17], [1, 17]], csdBody: [0, 0.5], be: [false, true], maxRiskAtr: [2, 3] };
const ap = (k, v) => k === 'session' ? { sessionStartUTC: v[0], sessionEndUTC: v[1] } : { [k]: v };
const rows = [];
const f = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
for (const k of Object.keys(F)) for (const v of F[k]) {
  const o = ap(k, v);
  const tr = g.runGoldSmt(raw, { ...o, to: split }).stats, te = g.runGoldSmt(raw, { ...o, from: split }).stats, al = g.runGoldSmt(raw, o);
  rows.push({ factor: k, value: JSON.stringify(v), train: tr, test: te, all: al.stats, ret: al.money.returnPct, dd: al.money.maxDdPct });
  console.log(k.padEnd(10), JSON.stringify(v).padEnd(9), 'train', f(tr).padEnd(16), 'test', f(te).padEnd(16), 'all', f(al.stats).padEnd(16), 'PF', al.stats.pf, 'ret', al.money.returnPct + '%');
}
fs.writeFileSync(process.argv[4], JSON.stringify(rows, null, 1));

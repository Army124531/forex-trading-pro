'use strict';
// V3: har setting akeli badal kar, seekhne (60%) aur imtihan (40%) hisson par. Usage: node v3single.js BASEJSON OUT.json
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const base = JSON.parse(process.argv[2] || '{}');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const F = {
  entryMin: [3, 5],
  eq: [true, false],
  tpMode: ['h1swing', 'between'],
  maxTries: [1, 2],
  keyTypes: ['both', 'fvg', 'range'],
  rangeCtx: [true, false],
  maxRR: [99, 4],
  minRR: [1, 1.5],
  session: [[7, 17], [12, 17]],
};
const ap = (k, v) => k === 'session' ? { sessionStartUTC: v[0], sessionEndUTC: v[1] } : { [k]: v };
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
const rows = [];
for (const k of Object.keys(F)) for (const v of F[k]) {
  const o = { ...base, ...ap(k, v) };
  const tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats, al = v3.runV3(raw, o);
  rows.push({ factor: k, value: v, train: tr, test: te, all: al.stats, years: al.byYear, ret: al.money.returnPct });
  console.log(k.padEnd(9), JSON.stringify(v).padEnd(10), 'train', fmt(tr).padEnd(15), 'test', fmt(te).padEnd(15), 'all', fmt(al.stats).padEnd(15), 'PF', String(al.stats.pf).padEnd(5), 'ret', String(al.money.returnPct).padEnd(6), 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'));
}
fs.writeFileSync(process.argv[3], JSON.stringify({ base, split, rows }, null, 1));

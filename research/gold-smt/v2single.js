'use strict';
// Version 2: har setting akeli badal kar seekhne (60%) aur imtihan (40%) hisson par.
// Usage: node v2single.js PARTNER.csv partnerName OUT.json
const fs = require('fs');
const { load, g, v2 } = require('./v2run.js');
const [pcsv, pname, out] = process.argv.slice(2);
const raw = { gold5: g.resample(load('hist/XAUUSD.csv'), 5), partner5: g.resample(load(pcsv), 5) };
const T0 = raw.gold5[0].t, T1 = raw.gold5[raw.gold5.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const base = { partner: pname };
const F = {
  keyFilter: ['bos', 'any'],
  discount: [false, true],
  minRR: [1.0, 1.5, 2.0],
  maxRR: [99, 3, 4],
  session: [[7, 17], [1, 17], [0, 24], [12, 17]],
  be: [false, true],
  l2Fresh: [12, 24],
  slBuf: [0.5, 2],
};
const ap = (k, v) => k === 'session' ? { sessionStartUTC: v[0], sessionEndUTC: v[1], closeUTC: v[1] === 24 ? 20 : 20 } : { [k]: v };
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
const rows = [];
for (const k of Object.keys(F)) for (const v of F[k]) {
  const o = { ...base, ...ap(k, v) };
  const tr = v2.runV2(raw, { ...o, to: split }).stats, te = v2.runV2(raw, { ...o, from: split }).stats, al = v2.runV2(raw, o);
  rows.push({ factor: k, value: v, train: tr, test: te, all: al.stats, years: al.byYear, ret: al.money.returnPct, dd: al.money.maxDdPct });
  console.log(k.padEnd(9), JSON.stringify(v).padEnd(8), 'train', fmt(tr).padEnd(15), 'test', fmt(te).padEnd(15), 'all', fmt(al.stats).padEnd(15), 'PF', String(al.stats.pf).padEnd(5), 'ret', al.money.returnPct + '%', 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'));
}
fs.writeFileSync(out, JSON.stringify({ split, rows }, null, 1));

'use strict';
// V3 best ki bunyadi settings ko thora oopar neeche — mazbooti ka test, aur trades barhane ke tareeqe.
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const BASE = { entryMin: 3, keyTypes: 'fvg', eq: false, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5 };
const V = [
  ['asal', {}],
  ['session 7-20', { sessionEndUTC: 20, closeUTC: 21 }],
  ['session 1-17', { sessionStartUTC: 1 }],
  ['session 0-21 (poora din)', { sessionStartUTC: 0, sessionEndUTC: 21, closeUTC: 21 }],
  ['zone 72 ghante', { zoneLifeH: 72 }],
  ['zone 240 ghante', { zoneLifeH: 240 }],
  ['arm 24 ghante', { armH: 24 }],
  ['arm 96 ghante', { armH: 96 }],
  ['L2 fresh 30 min', { l2FreshMin: 30 }],
  ['L2 fresh 120 min', { l2FreshMin: 120 }],
  ['SL buffer $1', { slBuf: 1 }],
  ['SL buffer $0.25', { slBuf: 0.25 }],
  ['maxRR 3', { maxRR: 3 }],
  ['maxRR 5', { maxRR: 5 }],
  ['minRR 1.2', { minRR: 1.2 }],
  ['minRR 2', { minRR: 2 }],
  ['entry M1', { entryMin: 1 }],
  ['entry M2', { entryMin: 2 }],
  ['maxPerDay 1', { maxPerDay: 1 }],
  ['keyFilter any', { keyFilter: 'any' }],
];
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
const rows = [];
for (const [name, o0] of V) {
  const o = { ...BASE, ...o0 };
  const tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats, al = v3.runV3(raw, o);
  rows.push({ name, opts: o0, train: tr, test: te, all: al.stats, years: al.byYear, ret: al.money.returnPct, dd: al.money.maxDdPct });
  console.log(name.padEnd(24), 'train', fmt(tr).padEnd(15), 'test', fmt(te).padEnd(15), 'all', fmt(al.stats).padEnd(15), 'PF', String(al.stats.pf).padEnd(5), 'ret', String(al.money.returnPct).padEnd(6), 'dd', String(al.money.maxDdPct).padEnd(5), 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ BASE, split, rows }, null, 1));

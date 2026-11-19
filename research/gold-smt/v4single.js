'use strict';
// V3 best par naye filters, aik aik kar ke. Seekhne (60%) + imtihan (40%). Usage: node v4single.js OUT.json [BASEJSON]
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD'), partner2: get('DXY') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const BASE = process.argv[3] ? JSON.parse(process.argv[3]) : { entryMin: 3, keyTypes: 'fvg', eq: false, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5 };
const V = [
  ['asal (V3 best)', {}],
  ['E.Q sirf HRLR (eff<0.25)', { eqMode: 'hrlr', hrlrEff: 0.25 }],
  ['E.Q sirf HRLR (eff<0.35)', { eqMode: 'hrlr', hrlrEff: 0.35 }],
  ['Strength SMT >= 0.1%', { smtMinPct: 0.1 }],
  ['Strength SMT >= 0.2%', { smtMinPct: 0.2 }],
  ['Strength SMT >= 0.3%', { smtMinPct: 0.3 }],
  ['SMT Silver + DXY dono', { smtWith: 'both' }],
  ['SMT Silver ya DXY', { smtWith: 'either' }],
  ['H4 gap >= 0.5 ATR', { fvgMinAtr: 0.5 }],
  ['H4 gap >= 1.0 ATR', { fvgMinAtr: 1.0 }],
];
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
const rows = [];
for (const [name, o0] of V) {
  const o = { ...BASE, ...o0 };
  const tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats, al = v3.runV3(raw, o);
  rows.push({ name, opts: o0, train: tr, test: te, all: al.stats, years: al.byYear, ret: al.money.returnPct, dd: al.money.maxDdPct });
  console.log(name.padEnd(26), 'train', fmt(tr).padEnd(15), 'test', fmt(te).padEnd(15), 'all', fmt(al.stats).padEnd(15), 'PF', String(al.stats.pf).padEnd(5), 'ret', String(al.money.returnPct).padEnd(6), 'dd', String(al.money.maxDdPct).padEnd(5), 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ BASE, split, rows }, null, 1));

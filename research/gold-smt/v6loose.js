'use strict';
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6), months = (T1 - T0) / (30.4 * 864e5);
const V5 = { entryMin: 3, keyTypes: 'fvg', eq: false, eqMode: 'fast', hrlrAtr: 1.0, hrlrMaxMin: 30, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5, zoneLifeH: 72 };
const DAYS = { sessionStartUTC: 0, sessionEndUTC: 21, closeUTC: 21 };
const C = [
  ['V5', V5],
  ['din + RR1', { ...V5, ...DAYS, minRR: 1.0, maxRR: 99 }],
  ['din + 3 koshish', { ...V5, ...DAYS, maxTries: 3 }],
  ['RR1 + 3 koshish', { ...V5, minRR: 1.0, maxRR: 99, maxTries: 3 }],
  ['din + RR1 + 3 koshish', { ...V5, ...DAYS, minRR: 1.0, maxRR: 99, maxTries: 3, maxPerDay: 3 }],
  ['din + RR1 + 3 koshish + har gap', { ...V5, ...DAYS, minRR: 1.0, maxRR: 99, maxTries: 3, keyFilter: 'any', maxPerDay: 3 }],
  ['din + RR1 (maxRR 4)', { ...V5, ...DAYS, minRR: 1.0 }],
  ['din + RR1 + 3 koshish (maxRR 4)', { ...V5, ...DAYS, minRR: 1.0, maxTries: 3, maxPerDay: 3 }],
];
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
for (const [n, o] of C) {
  const r = v3.runV3(raw, o);
  const tr = g.stats(r.trades.filter(t => t.entryT < split).map(t => t.R)), te = g.stats(r.trades.filter(t => t.entryT >= split).map(t => t.R));
  console.log(n.padEnd(34), ((r.trades.length / months).toFixed(1) + '/mah').padEnd(9), 'all', fmt(r.stats).padEnd(17), 'PF', String(r.stats.pf).padEnd(5), 'train', fmt(tr).padEnd(16), 'test', fmt(te).padEnd(16), '$10k->', r.money.end, '| funnel', JSON.stringify(r.funnel));
}

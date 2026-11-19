'use strict';
const fs = require('fs'); const g = require('../../goldsmt.js'); const v3 = require('../../goldsmt_v3.js');
const load = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { const [t, o, h, lo, c] = l.split(',').map(Number); return { t: t * 1000, end: t * 1000 + 60000, o, h, l: lo, c }; });
const cache = {};
const get = (n) => cache[n] || (cache[n] = load('hist/' + n + '.csv'));
module.exports = { load, g, v3, get };
if (require.main === module) {
  const o = JSON.parse(process.argv[2] || '{}');
  const raw = { gold1: get('XAUUSD'), partner1: get(o.partner === 'dxy' ? 'DXY' : 'XAGUSD') };
  const t0 = Date.now(); const r = v3.runV3(raw, o);
  console.log('ms', Date.now() - t0, 'funnel', JSON.stringify(r.funnel));
  console.log('stats', JSON.stringify(r.stats), 'money', JSON.stringify(r.money), 'avgRR', r.avgRR);
  console.log('years', Object.entries(r.byYear).map(([y, x]) => `${y}: ${x.n}tr ${x.avgR}R PF ${x.pf}`).join(' | '));
  console.log('dir', Object.entries(r.byDir).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| sess', Object.entries(r.bySession).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '));
  const kinds = {}; for (const t of r.trades) (kinds[t.kind] = kinds[t.kind] || []).push(t.R);
  console.log('kind', Object.entries(kinds).map(([k, a]) => `${k} ${JSON.stringify(g.stats(a))}`).join(' | '));
  for (const d of [[2026, 0, 2], [2026, 0, 5]]) console.log(d.join('-'), JSON.stringify(r.trades.filter(t => t.entryT >= Date.UTC(...d) && t.entryT < Date.UTC(...d) + 864e5).map(t => [t.dir, t.kind, new Date(t.entryT).toISOString().slice(11, 16), +t.entry.toFixed(2), +t.sl.toFixed(2), +t.tp.toFixed(2), t.reason, +t.R.toFixed(2)])));
}

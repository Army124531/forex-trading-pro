'use strict';
const fs = require('fs'); const g = require('../../goldsmt.js'); const v2 = require('../../goldsmt_v2.js');
const load = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { const [t, o, h, lo, c] = l.split(',').map(Number); return { t: t * 1000, end: t * 1000 + 60000, o, h, l: lo, c }; });
module.exports = { load, g, v2 };
if (require.main === module) {
  const raw = { gold5: g.resample(load('hist/XAUUSD.csv'), 5), partner5: g.resample(load('hist/XAGUSD.csv'), 5) };
  const t0 = Date.now(); const r = v2.runV2(raw, JSON.parse(process.argv[2] || '{}'));
  console.log('ms', Date.now() - t0, 'funnel', JSON.stringify(r.funnel));
  console.log('stats', JSON.stringify(r.stats), 'money', JSON.stringify(r.money), 'avgRR', r.avgRR);
  console.log('years', JSON.stringify(r.byYear)); console.log('dir', JSON.stringify(r.byDir)); console.log('exit', JSON.stringify(r.byExit));
  const ex = r.trades.filter(t => t.entryT >= Date.UTC(2026, 0, 5) && t.entryT < Date.UTC(2026, 0, 6));
  console.log('5 Jan 2026:', JSON.stringify(ex));
}

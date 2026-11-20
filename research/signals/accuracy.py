# Live signals ki accuracy report. Usage: python3 -I accuracy.py SIGNALS.csv OUT.json
import csv, sys, json, collections, math, datetime

PIP = {'XAUUSD': 0.1, 'XAGUSD': 0.01, 'BTCUSD': 1, 'ETHUSD': 1, 'SOLUSD': 1, 'BNBUSD': 1, 'XRPUSD': 0.0001, 'DOGEUSD': 0.0001, 'ADAUSD': 0.0001,
       'EURUSD': 0.0001, 'GBPUSD': 0.0001, 'USDJPY': 0.01, 'AUDUSD': 0.0001, 'USDCAD': 0.0001, 'USDCHF': 0.0001}
# Round-trip spread + slippage (website ke lab.js LAB_COST jaisa); crypto: price ka 0.06%
COST = {'EURUSD': 0.00012, 'GBPUSD': 0.00015, 'AUDUSD': 0.00014, 'USDCAD': 0.00016, 'USDCHF': 0.00016, 'USDJPY': 0.014, 'XAUUSD': 0.30, 'XAGUSD': 0.03}
KIND = lambda p: 'Crypto' if p in ('BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD') else 'Metals' if p in ('XAUUSD', 'XAGUSD') else 'Forex'

rows = list(csv.DictReader(open(sys.argv[1])))
T = []
for x in rows:
    p = x['pair']; e = float(x['entry']); sl = float(x['sl']); risk = abs(e - sl)
    t = datetime.datetime.fromisoformat(x['createdAt'].replace('Z', '+00:00'))
    rec = {'id': x['id'], 'pair': p, 'kind': KIND(p), 'dir': x['direction'], 'engine': x['engine'], 'score': int(x['score']), 'outcome': x['outcome'] or 'Unknown',
           'exit': x['exitLevel'], 't': t, 'risk': risk, 'riskPct': risk / e * 100}
    if x['outcome'] in ('Win', 'Loss', 'Break-Even') and x['pips'] != '':
        move = float(x['pips']) * PIP[p]
        cost = COST.get(p, e * 0.0006)
        rec['R'] = move / risk
        rec['Rnet'] = (move - cost) / risk
        rec['costR'] = cost / risk
    T.append(rec)
closed = [r for r in T if 'R' in r]

def st(rs, key='Rnet'):
    n = len(rs)
    if not n: return {'n': 0}
    w = sum(1 for r in rs if r['outcome'] == 'Win'); l = sum(1 for r in rs if r['outcome'] == 'Loss'); be = sum(1 for r in rs if r['outcome'] == 'Break-Even')
    R = [r[key] for r in rs]; s = sum(R); m = s / n
    gw = sum(x for x in R if x > 0); gl = -sum(x for x in R if x < 0)
    sd = math.sqrt(sum((x - m) ** 2 for x in R) / (n - 1)) if n > 1 else 0
    return {'n': n, 'win': w, 'loss': l, 'be': be, 'winRate': round(w / n * 100, 1), 'winRateExBE': round(w / (w + l) * 100, 1) if w + l else None,
            'avgR': round(m, 3), 'netR': round(s, 1), 'pf': round(gw / gl, 2) if gl else None, 't': round(m / (sd / math.sqrt(n)), 2) if sd else None,
            'avgRgross': round(sum(r['R'] for r in rs) / n, 3)}

def sess(h):
    return 'Asia (00-07 UTC)' if h < 7 else 'London (07-12)' if h < 12 else 'London+NY (12-16)' if h < 16 else 'NY shaam (16-21)' if h < 21 else 'Raat (21-24)'
def grp(f):
    d = collections.defaultdict(list)
    for r in closed: d[f(r)].append(r)
    return {k: st(v) for k, v in sorted(d.items(), key=lambda kv: str(kv[0]))}

out = {
    'period': [min(r['t'] for r in T).isoformat(), max(r['t'] for r in T).isoformat()],
    'total': len(T), 'outcomes': collections.Counter(r['outcome'] for r in T), 'exits': collections.Counter(r['exit'] or '(khali)' for r in T),
    'all': st(closed), 'allGross': st(closed, 'R'),
    'engine': grp(lambda r: r['engine']), 'kind': grp(lambda r: r['kind']), 'pair': grp(lambda r: r['pair']), 'dir': grp(lambda r: r['dir']),
    'session': grp(lambda r: sess(r['t'].hour)), 'score': grp(lambda r: '85-89' if r['score'] < 90 else '90-94' if r['score'] < 95 else '95-99' if r['score'] < 100 else '100'),
    'day': grp(lambda r: r['t'].date().isoformat()),
    'avgWinR': round(sum(r['Rnet'] for r in closed if r['outcome'] == 'Win') / max(1, sum(1 for r in closed if r['outcome'] == 'Win')), 3),
    'avgLossR': round(sum(r['Rnet'] for r in closed if r['outcome'] == 'Loss') / max(1, sum(1 for r in closed if r['outcome'] == 'Loss')), 3),
    'avgCostR': round(sum(r['costR'] for r in closed) / len(closed), 3),
    'riskPct': {k: round(sum(r['riskPct'] for r in T if r['pair'] == k) / sum(1 for r in T if r['pair'] == k), 3) for k in sorted(set(r['pair'] for r in T))},
}
# Ek hi pair par aik ghante ke andar doosra signal (jab pehla abhi khula ho sakta hai)
by = collections.defaultdict(list)
for r in sorted(T, key=lambda r: r['t']): by[r['pair']].append(r)
cl = 0
for p, lst in by.items():
    for a, b in zip(lst, lst[1:]):
        if (b['t'] - a['t']).total_seconds() < 3600: cl += 1
out['sameHourRepeats'] = cl
perday = collections.Counter(r['t'].date().isoformat() for r in T)
out['signalsPerDay'] = round(len(T) / len(perday), 1)

def show(title, d):
    print('\n' + title)
    for k, v in d.items():
        if v.get('n'): print('  %-22s n=%-4d jeet %5.1f%% (BE ke baghair %5s%%)  ausat %+.3fR  kul %+6.1fR  PF %s  t %s' % (k, v['n'], v['winRate'], v['winRateExBE'], v['avgR'], v['netR'], v['pf'], v['t']))
print('Muddat:', out['period'], '| kul signals', out['total'], '| fi din', out['signalsPerDay'], '| outcomes', dict(out['outcomes']), '| exits', dict(out['exits']))
print('SAB (spread ke baad):', out['all'])
print('SAB (spread se pehle):', out['allGross'])
print('Ausat jeet %+.3fR, ausat haar %+.3fR, ausat spread %.3fR | aik ghante me dobara signal: %d' % (out['avgWinR'], out['avgLossR'], out['avgCostR'], cl))
for k in ['engine', 'kind', 'dir', 'session', 'score', 'pair', 'day']: show(k.upper(), out[k])
print('\nSL ka size (entry ka %):', out['riskPct'])
json.dump(out, open(sys.argv[2], 'w'), default=str, indent=1)

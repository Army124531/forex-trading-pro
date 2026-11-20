# NASDAQ (QQQ / Nasdaq-100) — 3 mashhoor tareeqe, pehle se pakke rules, daily data par backtest.
# SIRF research. Usage: python3 nasdaq_bt.py YAHOO_CHART.json [label] [imtihan_shuru_saal]
#   A. Buy & hold (muqable ke liye)
#   B. Trend: close > SMA200 ho to agle din ke open par kharidein; neeche band ho to agle open par bech dein.
#   C. RSI-2 pullback: close > SMA200 aur RSI(2) < 10 → agle open par kharidein; close > SMA5 → agle open par bech dein.
#   D. B aur C ko aadha aadha paisa.
# Kharcha: har khareed ya farokht par 0.05% (spread + commission), dono taraf.
import json, sys, math, datetime

COST = 0.0005
raw = json.load(open(sys.argv[1]))['chart']['result'][0]
label = sys.argv[2] if len(sys.argv) > 2 else raw['meta'].get('symbol', '')
q = raw['indicators']['quote'][0]
adj = (raw['indicators'].get('adjclose') or [{}])[0].get('adjclose')
D = []
for i, t in enumerate(raw['timestamp']):
    o, c = q['open'][i], q['close'][i]
    if o is None or c is None or o <= 0 or c <= 0: continue
    f = (adj[i] / c) if adj and adj[i] else 1.0  # dividend adjust (QQQ)
    D.append((datetime.datetime.fromtimestamp(t, datetime.timezone.utc).date(), o * f, c * f))
dates = [d[0] for d in D]; O = [d[1] for d in D]; C = [d[2] for d in D]
n = len(D)

def sma(v, k):
    out = [None] * len(v); s = 0
    for i, x in enumerate(v):
        s += x
        if i >= k: s -= v[i - k]
        if i >= k - 1: out[i] = s / k
    return out
def rsi(v, k):
    out = [None] * len(v); g = l = 0
    for i in range(1, len(v)):
        d = v[i] - v[i - 1]; up, dn = max(d, 0), max(-d, 0)
        if i <= k:
            g += up / k; l += dn / k
            if i == k: out[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
        else:
            g = (g * (k - 1) + up) / k; l = (l * (k - 1) + dn) / k
            out[i] = 100 if l == 0 else 100 - 100 / (1 + g / l)
    return out
s200, s5, r2 = sma(C, 200), sma(C, 5), rsi(C, 2)

# Har din ka "kal raat ke close par faisla → aaj ke open par amal" wala position series, phir daily equity
def run(rule):
    pos = 0; eq = [1.0]; trades = []; entry = None; inpos = [0] * n
    for i in range(1, n):
        want = rule(i - 1, pos)  # kal ke close tak ka data
        r = 1.0
        if want != pos:  # aaj open par amal
            if want == 1:  # khareed: open se close tak
                r = (C[i] / O[i]) * (1 - COST); entry = O[i]
            else:          # farokht: kal close se aaj open tak
                r = (O[i] / C[i - 1]) * (1 - COST); trades.append(O[i] / entry * (1 - COST) ** 2 - 1)
            pos = want
        elif pos == 1:
            r = C[i] / C[i - 1]
        eq.append(eq[-1] * r); inpos[i] = pos
    return eq, trades, inpos

def ruleA(i, pos): return 1
def ruleB(i, pos): return 1 if s200[i] and C[i] > s200[i] else 0
def ruleC(i, pos):
    if s200[i] is None or r2[i] is None or s5[i] is None: return 0
    if pos == 0: return 1 if C[i] > s200[i] and r2[i] < 10 else 0
    return 0 if C[i] > s5[i] else 1

def stats(eq, d0, d1, trades=None, inpos=None):
    idx = [i for i in range(n) if d0 <= dates[i] <= d1]
    if len(idx) < 30: return None
    a, b = idx[0], idx[-1]
    e = eq[a:b + 1]; yrs = (dates[b] - dates[a]).days / 365.25
    cagr = (e[-1] / e[0]) ** (1 / yrs) - 1
    pk, dd = e[0], 0
    for x in e: pk = max(pk, x); dd = max(dd, 1 - x / pk)
    rets = [e[i] / e[i - 1] - 1 for i in range(1, len(e))]
    m = sum(rets) / len(rets); sd = math.sqrt(sum((x - m) ** 2 for x in rets) / (len(rets) - 1))
    out = {'cagr': round(cagr * 100, 1), 'maxdd': round(dd * 100, 1), 'sharpe': round(m / sd * math.sqrt(252), 2) if sd else None, 'x': round(e[-1] / e[0], 1)}
    if inpos: out['expo'] = round(sum(inpos[a:b + 1]) / (b - a + 1) * 100)
    return out

res = {}
eqA, trA, ipA = run(ruleA); eqB, trB, ipB = run(ruleB); eqC, trC, ipC = run(ruleC)
eqD = [1.0]
for i in range(1, n): eqD.append(eqD[-1] * (0.5 * eqB[i] / eqB[i - 1] + 0.5 * eqC[i] / eqC[i - 1]))
start = dates[200]; end = dates[-1]
split = datetime.date(int(sys.argv[3]) if len(sys.argv) > 3 else 2010, 1, 1)
print('%s: %s se %s tak, %d din | seekhna: %s–%s, imtihan: %s–%s' % (label, start, end, n, start.year, split.year - 1, split.year, end.year))
S = [('A. Buy & hold', eqA, None, None), ('B. Trend (SMA200)', eqB, trB, ipB), ('C. RSI-2 pullback', eqC, trC, ipC), ('D. B + C aadha aadha', eqD, None, None)]
for name, eq, tr, ip in S:
    al, a1, a2 = stats(eq, start, end, tr, ip), stats(eq, start, split, tr, ip), stats(eq, split, end, tr, ip)
    line = '%-22s POORA: %5.1f%%/saal, girao %4.1f%%, Sharpe %s, %sx' % (name, al['cagr'], al['maxdd'], al['sharpe'], al['x'])
    if ip: line += ', market me %d%%' % al['expo']
    line += ' | seekhna %5.1f%%/saal girao %4.1f%% | imtihan %5.1f%%/saal girao %4.1f%%' % (a1['cagr'], a1['maxdd'], a2['cagr'], a2['maxdd'])
    if tr:
        w = sum(1 for x in tr if x > 0)
        line += ' | trades %d, jeet %.0f%%, ausat %+.2f%%' % (len(tr), w / len(tr) * 100, sum(tr) / len(tr) * 100)
    print(line)
    res[name] = {'all': al, 'train': a1, 'test': a2, 'trades': len(tr) if tr else None}
# Dahai ba dahai
print('\nDahai ba dahai (saalana munafa / sab se bara girao):')
decs = [(datetime.date(y, 1, 1), datetime.date(y + 9, 12, 31)) for y in range(1990, 2030, 10)]
for name, eq, tr, ip in S:
    parts = []
    for d0, d1 in decs:
        s = stats(eq, max(d0, start), min(d1, end))
        if s: parts.append('%ds: %5.1f%%/%4.1f%%' % (d0.year, s['cagr'], s['maxdd']))
    print('  %-22s %s' % (name, ' | '.join(parts)))
json.dump(res, open(sys.argv[1] + '.res.json', 'w'), indent=1)

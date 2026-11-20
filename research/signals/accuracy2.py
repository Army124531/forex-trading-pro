import csv, sys, datetime, collections, math
exec(open(sys.argv[2]).read().split("rows = list(")[0])  # PIP, COST, KIND
rows = list(csv.DictReader(open(sys.argv[1])))
T = []
for x in rows:
    if x['outcome'] not in ('Win', 'Loss', 'Break-Even') or x['pips'] == '': continue
    p = x['pair']; e = float(x['entry']); risk = abs(e - float(x['sl']))
    T.append({'pair': p, 'kind': KIND(p), 'dir': x['direction'], 'engine': x['engine'], 'score': int(x['score']), 'out': x['outcome'],
              't': datetime.datetime.fromisoformat(x['createdAt'].replace('Z', '+00:00')), 'R': (float(x['pips']) * PIP[p] - COST.get(p, e * 0.0006)) / risk})
T.sort(key=lambda r: r['t'])
def st(rs):
    n = len(rs); R = [r['R'] for r in rs]
    if not n: return 'n=0'
    w = sum(1 for r in rs if r['out'] == 'Win'); m = sum(R) / n; gw = sum(x for x in R if x > 0); gl = -sum(x for x in R if x < 0)
    return 'n=%d jeet %.1f%% ausat %+.3fR kul %+.1fR PF %s' % (n, w / n * 100, m, sum(R), round(gw / gl, 2) if gl else None)
def cooldown(rs, hours):
    last = {}; out = []
    for r in rs:
        k = r['pair']
        if k in last and (r['t'] - last[k]).total_seconds() < hours * 3600: continue
        last[k] = r['t']; out.append(r)
    return out
print('Sab:', st(T))
for h in (1, 4, 12):
    print('Har pair par %2d ghante me sirf pehla signal:' % h, st(cooldown(T, h)))
print('Sirf Gold:', st([r for r in T if r['pair'] == 'XAUUSD']), '| Gold, 4 ghante cooldown:', st(cooldown([r for r in T if r['pair'] == 'XAUUSD'], 4)))
print('Score 100 hata kar:', st([r for r in T if r['score'] < 100]))
# 17 Nov
d = [r for r in T if r['t'].date().isoformat() == '2026-11-17']
print('\n17 Nov:', st(d), '| BUY', sum(1 for r in d if r['dir'] == 'BUY'), 'SELL', sum(1 for r in d if r['dir'] == 'SELL'))
print('  17 Nov SELL:', st([r for r in d if r['dir'] == 'SELL']), '| BUY:', st([r for r in d if r['dir'] == 'BUY']))
print('  17 Nov kind:', {k: st([r for r in d if r['kind'] == k]) for k in ('Crypto', 'Forex', 'Metals')})
# Pehla aadha vs doosra aadha (pair ke nateeje tikte hain ya nahi)
mid = T[len(T) // 2]['t']
print('\nPair: pehle 5 din vs aakhri 5 din')
for p in sorted(set(r['pair'] for r in T)):
    a = [r for r in T if r['pair'] == p and r['t'] < mid]; b = [r for r in T if r['pair'] == p and r['t'] >= mid]
    print('  %-8s %-48s | %s' % (p, st(a), st(b)))

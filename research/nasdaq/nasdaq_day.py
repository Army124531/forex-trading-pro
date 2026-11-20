# NASDAQ-100 din ki trading — 3 tareeqe, pehle se pakke rules, 1-minute data (HistData NSXUSD) par.
# SIRF research. Usage: python3 nasdaq_day.py HISTDATA_UNZIPPED_DIR [imtihan_shuru_saal]
#   1. ORB-5: 09:30–09:35 ki candle hari → BUY, laal → SELL, 09:35 ke open par. SL candle ki doosri taraf. 16:00 par band.
#   2. Momentum: pichle din ke close (16:00) se 10:00 tak ka return > 0 → 15:30 par BUY, < 0 → SELL. 16:00 par band.
#   3. Gap fade: open, pichle close se 0.5%+ upar → SELL (neeche → BUY). Target pichla close, SL gap jitna door. 16:00 par band.
# Usool: aik hi minute me SL aur target dono → SL. Kharcha: round trip 0.01% (aur 0.03% alag se).
import sys, glob, os, calendar, time, math, collections

SRC = sys.argv[1]
SPLIT = int(sys.argv[2]) if len(sys.argv) > 2 else 2019

def ny_off(ts):
    y = time.gmtime(ts).tm_year
    mar = calendar.timegm((y, 3, 1, 0, 0, 0)); d = (6 - time.gmtime(mar).tm_wday) % 7
    start = mar + (d + 7) * 86400 + 7 * 3600
    nov = calendar.timegm((y, 11, 1, 0, 0, 0)); d2 = (6 - time.gmtime(nov).tm_wday) % 7
    return 4 if start <= ts < nov + d2 * 86400 + 6 * 3600 else 5

days = collections.defaultdict(dict)  # 'YYYY-MM-DD' -> {minute_of_day: (o,h,l,c)}
for f in sorted(glob.glob(os.path.join(SRC, 'DAT_ASCII_NSXUSD_M1_*.csv'))):
    for line in open(f):
        p = line.strip().split(';')
        if len(p) < 5: continue
        ts = calendar.timegm(time.strptime(p[0], '%Y%m%d %H%M%S')) + 5 * 3600
        lt = time.gmtime(ts - ny_off(ts) * 3600); m = lt.tm_hour * 60 + lt.tm_min
        if 570 <= m < 960: days[time.strftime('%Y-%m-%d', lt)][m] = (float(p[1]), float(p[2]), float(p[3]), float(p[4]))
keys = sorted(k for k, v in days.items() if min(v) <= 571 and max(v) >= 955 and len(v) > 300)
print('Din:', len(keys), keys[0], '->', keys[-1])

def walk(bars, start_m, dirn, entry, sl, tp):
    for m in range(start_m, 960):
        b = bars.get(m)
        if not b: continue
        o, h, l, c = b
        if dirn > 0:
            if l <= sl: return (min(o, sl) if m > start_m else sl)
            if tp is not None and h >= tp: return (max(o, tp) if m > start_m else tp)
        else:
            if h >= sl: return (max(o, sl) if m > start_m else sl)
            if tp is not None and l <= tp: return (min(o, tp) if m > start_m else tp)
    last = max(k for k in bars if k < 960)
    return bars[last][3]

trades = {1: [], 2: [], 3: []}
prev_close = None
for k in keys:
    b = days[k]
    first = b.get(570); op = first[0] if first else b[min(b)][0]
    close_m = max(m for m in b if m < 960); dclose = b[close_m][3]
    # 1. ORB-5
    c5 = [b[m] for m in range(570, 575) if m in b]
    if len(c5) >= 4 and 575 in b:
        o5, h5, l5, cl5 = c5[0][0], max(x[1] for x in c5), min(x[2] for x in c5), c5[-1][3]
        if cl5 != o5:
            d = 1 if cl5 > o5 else -1; entry = b[575][0]; sl = l5 if d > 0 else h5; risk = (entry - sl) * d
            if risk > 0:
                ex = walk(b, 575, d, entry, sl, None)
                trades[1].append((k, d, entry, ex, risk))
    # 2. Momentum
    if prev_close and 599 in b and 930 in b:
        r = b[599][3] / prev_close - 1
        if r != 0:
            d = 1 if r > 0 else -1; entry = b[930][0]
            ex = b[close_m][3]
            trades[2].append((k, d, entry, ex, None))
    # 3. Gap fade
    if prev_close:
        gap = op / prev_close - 1
        if abs(gap) >= 0.005:
            d = -1 if gap > 0 else 1; entry = op; risk = abs(op - prev_close)
            ex = walk(b, 570, d, entry, entry - d * risk, prev_close)
            trades[3].append((k, d, entry, ex, risk))
    prev_close = dclose

NAMES = {1: 'ORB-5 (pehli 5-min candle)', 2: 'Momentum (10:00 → 15:30–16:00)', 3: 'Gap fade (0.5%+ gap)'}
def stats(ts, cost):
    rs = [((ex - en) * d) / en - cost for (_, d, en, ex, _) in ts]
    n = len(rs)
    if not n: return None
    w = sum(1 for x in rs if x > 0); m = sum(rs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in rs) / (n - 1)) if n > 1 else 0
    gw = sum(x for x in rs if x > 0); gl = -sum(x for x in rs if x < 0)
    eq = 1.0; pk = 1.0; dd = 0
    for x in rs: eq *= 1 + x; pk = max(pk, eq); dd = max(dd, 1 - eq / pk)
    yrs = (time.mktime(time.strptime(ts[-1][0], '%Y-%m-%d')) - time.mktime(time.strptime(ts[0][0], '%Y-%m-%d'))) / 31557600 or 1
    return {'n': n, 'win': round(w / n * 100, 1), 'avg': round(m * 100, 3), 'pf': round(gw / gl, 2) if gl else None, 't': round(m / (sd / math.sqrt(n)), 2) if sd else None,
            'cagr': round((eq ** (1 / yrs) - 1) * 100, 1), 'dd': round(dd * 100, 1)}
for i in (1, 2, 3):
    ts = trades[i]
    print('\n== %s' % NAMES[i])
    for cost in (0.0, 0.0001, 0.0003):
        s = stats(ts, cost)
        print('  kharcha %.2f%%: %d trades, jeet %.1f%%, ausat %+.3f%%, PF %s, t %s | 1x paisa: %+.1f%%/saal, girao %.1f%%' % (cost * 100, s['n'], s['win'], s['avg'], s['pf'], s['t'], s['cagr'], s['dd']))
    a = [t for t in ts if int(t[0][:4]) < SPLIT]; b2 = [t for t in ts if int(t[0][:4]) >= SPLIT]
    sa, sb = stats(a, 0.0001), stats(b2, 0.0001)
    print('  seekhna (<%d): ausat %+.3f%% jeet %.1f%% | imtihan (%d+): ausat %+.3f%% jeet %.1f%%' % (SPLIT, sa['avg'], sa['win'], SPLIT, sb['avg'], sb['win']))
    yr = collections.defaultdict(list)
    for t in ts: yr[t[0][:4]].append(t)
    print('  saal ba saal (0.01%):', ' '.join('%s:%+.2f%%' % (y, sum(((ex - en) * d) / en - 0.0001 for (_, d, en, ex, _) in v) * 100) for y, v in sorted(yr.items())))

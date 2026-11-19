# Synthetic DXY (ICE formula) 1-minute candles from HistData FX M1 files.
# Usage: dxy_build.py FXDIR(unzipped) OUT.csv
import sys, os, glob, calendar, time
src, out = sys.argv[1], sys.argv[2]
W = {'EURUSD': -0.576, 'USDJPY': 0.136, 'GBPUSD': -0.119, 'USDCAD': 0.091, 'USDSEK': 0.042, 'USDCHF': 0.036}
data = {}
for pair in W:
    d = {}
    for f in sorted(glob.glob(os.path.join(src, 'DAT_ASCII_%s_M1_*.csv' % pair))):
        for line in open(f):
            p = line.strip().split(';')
            if len(p) < 5: continue
            ts = calendar.timegm(time.strptime(p[0], '%Y%m%d %H%M%S')) + 5 * 3600
            d[ts] = tuple(float(x) for x in p[1:5])  # o,h,l,c
    data[pair] = d
    print(pair, len(d), flush=True)
last = {}
n = 0
with open(out, 'w') as w:
    for ts in sorted(data['EURUSD']):
        for pair in W:
            if ts in data[pair]: last[pair] = data[pair][ts]
        if len(last) < len(W): continue
        o = h = l = c = 50.14348112
        for pair, e in W.items():
            po, ph, pl, pc = last[pair]
            o *= po ** e; c *= pc ** e
            h *= (ph if e > 0 else pl) ** e
            l *= (pl if e > 0 else ph) ** e
        w.write('%d,%.4f,%.4f,%.4f,%.4f\n' % (ts, o, h, l, c)); n += 1
print('DXY candles', n)

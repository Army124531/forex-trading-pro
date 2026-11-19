# HistData M1 CSV (EST, UTC-5 fixed) -> t,o,h,l,c (t = unix seconds UTC). Usage: hist_csv.py OUT.csv FILE1.csv FILE2.csv ...
import sys, calendar, time
rows = {}
for f in sys.argv[2:]:
    for line in open(f):
        p = line.strip().split(';')
        if len(p) < 5: continue
        ts = calendar.timegm(time.strptime(p[0], '%Y%m%d %H%M%S')) + 5 * 3600
        rows[ts] = p[1:5]
with open(sys.argv[1], 'w') as w:
    for ts in sorted(rows): w.write('%d,%s\n' % (ts, ','.join(rows[ts])))
print(len(rows), 'candles')

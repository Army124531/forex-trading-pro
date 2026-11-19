# HistData.com M1 ASCII downloader. Usage: hist_dl.py OUTDIR
import sys, os, re, time, urllib.request, urllib.parse, http.cookiejar
out = sys.argv[1]
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = {'User-Agent': 'Mozilla/5.0'}
jobs = []
for pair in ['xauusd', 'xagusd']:
    jobs += [(pair, '2024', None), (pair, '2025', None)]
    jobs += [(pair, '2026', m) for m in range(1, 12)]
for pair, y, m in jobs:
    name = '%s_%s%s.zip' % (pair, y, '' if m is None else '%02d' % m)
    p = os.path.join(out, name)
    if os.path.exists(p) and os.path.getsize(p) > 1000: continue
    page = 'https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/%s/%s%s' % (pair, y, '' if m is None else '/%d' % m)
    for attempt in range(4):
        try:
            html = op.open(urllib.request.Request(page, headers=UA), timeout=40).read().decode('utf8', 'ignore')
            f = dict(re.findall(r'name="(tk|date|datemonth|platform|timeframe|fxpair)" id="\w+" value="([^"]*)"', html))
            if 'tk' not in f: print('no form', name, flush=True); break
            body = urllib.parse.urlencode(f).encode()
            req = urllib.request.Request('https://www.histdata.com/get.php', data=body, headers={**UA, 'Referer': page, 'Content-Type': 'application/x-www-form-urlencoded'})
            data = op.open(req, timeout=120).read()
            if data[:2] != b'PK': print('not zip', name, data[:80], flush=True); time.sleep(5); continue
            open(p, 'wb').write(data); print('ok', name, len(data), flush=True); break
        except Exception as e:
            print('err', name, e, flush=True); time.sleep(8)
    time.sleep(2)
print('FINISHED', flush=True)

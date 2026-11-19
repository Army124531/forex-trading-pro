# Gold SMT Intraday — research (website par live NAHI)

Strategy ka code `goldsmt.js` (repo root) me hai. Ye folder sirf backtest/research ke liye hai.

1. Data: `python3 hist_dl.py data/` (HistData.com se XAUUSD + XAGUSD 1-minute zips), phir unzip.
2. CSV: `python3 hist_csv.py XAUUSD.csv data/x/DAT_ASCII_XAUUSD_M1_*.csv` (aur XAGUSD bhi).
3. Tests:
   - `node experiment.js XAUUSD.csv XAGUSD.csv out.json` — seekhne (60%) par settings chunna, imtihan (40%) par jaanch
   - `node single.js ...` — har setting akeli, dono hisson par
   - `node combo.js ...` — chuni hui settings, saal ba saal + double spread test

## Version 2 (`goldsmt_v2.js`) — malik ki 5 Jan 2026 wali trade ke mutabiq
- DXY: `python3 dxy_build.py FXDIR DXY.csv` (HistData ke 6 FX pairs se, ICE formula)
- `node v2single.js XAGUSD.csv silver out.json` / `node v2final.js out.json` (scratchpad paths: `hist/*.csv`)
- `trades_v2_best.csv` = Silver SMT, RR 1.5–4 wali trades (Jan 2024 – Nov 2026)

## Version 3 (`goldsmt_v3.js`) — dono misaalon (5 Jan BUY, 2 Jan SELL) ke mutabiq
- Data: 1-minute gold + silver se M3 entry. `node v3run.js '{...}'`, `node v3single.js BASEJSON out.json`, `node v3final.js out.json`
- Sab se behtar (abhi tak): `{"entryMin":3,"keyTypes":"fvg","eq":false,"tpMode":"h1swing","maxTries":1,"maxRR":4,"minRR":1.5}`
- `trades_v3_best.csv` = us setting ki trades

## Version 4 (wahi `goldsmt_v3.js`, nayi settings)
- `v4single.js` (naye filters: HRLR E.Q, strength SMT, Silver+DXY, bara H4 gap) — koi dono hisson me behtar nahi
- `v4sens.js` (settings oopar neeche) — har padosi setting musbat: strategy mazboot hai
- Mashwara (demo ke liye): `{"entryMin":3,"keyTypes":"fvg","eq":false,"tpMode":"h1swing","maxTries":1,"maxRR":4,"minRR":1.5,"zoneLifeH":72}` → `trades_v4_m3.csv`
- Tajurbati: wahi + `"entryMin":2` → `trades_v4_m2_experimental.csv`

# Gold SMT Intraday — research (website par live NAHI)

Strategy ka code `goldsmt.js` (repo root) me hai. Ye folder sirf backtest/research ke liye hai.

1. Data: `python3 hist_dl.py data/` (HistData.com se XAUUSD + XAGUSD 1-minute zips), phir unzip.
2. CSV: `python3 hist_csv.py XAUUSD.csv data/x/DAT_ASCII_XAUUSD_M1_*.csv` (aur XAGUSD bhi).
3. Tests:
   - `node experiment.js XAUUSD.csv XAGUSD.csv out.json` — seekhne (60%) par settings chunna, imtihan (40%) par jaanch
   - `node single.js ...` — har setting akeli, dono hisson par
   - `node combo.js ...` — chuni hui settings, saal ba saal + double spread test

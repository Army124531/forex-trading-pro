# Gold signal accuracy: candidate test plan (draft, 2026-11-16)

Status: plan only. No results yet. Nothing here changes the live engine or the Gold shadow mode.

## Rules (fixed before testing)
- Development period only: 2021-11-16 to 2024-11-16 (XAUUSD via PAXGUSDT 1H data).
- Holdout and shadow period (from 2024-11-17 onward, and shadow from 2026-11-17) are NOT used for tuning or selection.
- Cost: $0.30 per trade (labCost XAUUSD), tested at 1x and 2.5x.
- Pass rule (same as JEETA): n >= 80, avgR > 0, PF >= 1.15, t >= 2.5, positive in every year, 2.5x-cost PF >= 1.0.
- Only the two candidates below are tested. No new candidates are added after seeing results.
- A candidate that passes goes to Gold shadow mode first. Live only after owner approval.
- Shadow is the real test. A dev-period pass alone does not justify live use.

## Candidates
1. London breakout (current Gold shadow rules) with 1H ADX(14) >= 25 as a filter.
2. London breakout with the Asian range at least 0.5 x daily ATR14 wide.

## Code
- `gold-candidates.js` (repo root): draft, UNTESTED, not wired into lab.js or server.js.
- Daily high/low are built from the 1H candles, because `dly.D` has only `t` and `c`.
- `walkR` is not exported from lab.js. The test must run inside lab.js, or walkR must be exported first. `stats` and `adxSeries` are exported.

## Steps
1. Verify the draft helpers against the existing goldSignals output (should match when filters are off).
2. Run dev-period only. Record n, avgR, PF, t, netR, and per-year numbers for each candidate and the baseline.
3. Apply the pass rule and record the outcome, whether it passes or fails.
4. Muse reviews code and numbers before any merge.

## Open items
- Bash access in the current Claude session is blocked, so the test must be run by Muse or in a session with access.
- Owner decision needed: whether a passing candidate is added to shadow mode.

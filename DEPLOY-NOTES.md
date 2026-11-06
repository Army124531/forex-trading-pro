# DEPLOY-NOTES.md — Hosting requirements aur honest limits

## Kya chahiye (requirements)

- **Node.js 18+** — server Node.js par chalta hai. `package.json` me sirf ek dependency hai: `express`.
- **Start command:** `npm install && npm start`
- **Port:** Server `process.env.PORT` par sunta hai (Render khud deta hai). Local par default 3000.
- **Storage:** JSON file `data/db.json` (users, buyer accounts, signals, settings, logs). Koi database server nahi chahiye.
- **Internet:** Server ko ye bahar ki APIs chahiye (free, koi key nahi):
  - Kraken (crypto + PAX Gold prices aur candles)
  - Yahoo Finance (forex live prices aur fallback candles)
  - ExchangeRate-API v4 (forex rates backup)
  - CoinGecko (24h % change, 60 second cache)
  - Gold-API (Gold/Silver backup)
  - Swissquote (koshish ki jati hai; test environment se iska endpoint JSON nahi de raha tha, is liye code use fallback par chalta hai — neeche dekhein)

## Source verification (is machine par test kiya gaya, 2026-11-06)

- **Kraken ticker + OHLC:** kaam karta hai (PAXG $4,056.55, ETH $2,242.61, EUR/USD 1.11710/1.11720 mile).
- **Yahoo Finance chart:** kaam karta hai (USD/JPY 158.295, prevClose 157.653).
- **CoinGecko simple price:** kaam karta hai (BTC $76,064, -5.28% 24h).
- **ExchangeRate-API v4:** kaam karta hai (date 2026-11-06).
- **Gold-API:** is waqt `api.gold-api.com/api/XAU/USD` se **404 Not found** mil raha hai. Code me ye backup ke tor par hai — agar host par chal jaye to use hoga, warna Kraken/Yahoo se price aati hai.
- **Swissquote:** `sqx-api/1.0/market/quotes` endpoint is environment se JSON nahi de raha (HTML page milti hai). Code me is ki koshish pehle ki jati hai aur agar JSON quotes milen to use hote hain, warna verified sources (Kraken/Yahoo/ExchangeRate) use hote hain. README aur UI me Swissquote ko "primary" dawa nahi kiya gaya — sirf sources ki list me uski asal halat (CONNECTED/RETRY) dikhti hai.
- **Kraken XAG (Silver):** Kraken par silver pair nahi hai. Silver Gold-API se, warna Yahoo `SI=F` (silver futures) se aata hai — UI me source likha hota hai.

## Honest limits (saaf saaf)

1. **JSON file data reset ho sakta hai.** `data/db.json` me buyer accounts, signals aur settings save hote hain. Render free tier par redeploy/restart par ye file reset ho sakti hai. Matlab: buyer accounts aur signal history khatam ho sakte hain.
   - **Hal:** Render par Persistent Disk lagayein (paid) aur `data/` folder ko us disk par mount karein, ya waqt par `data/db.json` ka backup download karke rakhein. Free tier par iska koi pakka hal nahi hai — ye pehle se bata dena zaroori hai.
2. **Free tier par website soti hai.** 15 minute use na ho to Render service so jati hai; phir pehli request par 30-60 second lagte hain.
3. **Free price APIs ki limits hain.** CoinGecko free tier rate-limit kar sakta hai (is liye 60 second cache lagaya hai). Kraken/Yahoo kabhi kabhi slow ho sakte hain — code me har source par 5 second timeout hai aur sab ek saath (parallel) mangaye jate hain, taake ek sust source poora refresh na roke.
4. **News blackout available nahi hai.** Koi free news source nahi hai, is liye session me news blackout ko "available nahi" likha hai — kabhi fake nahi dikhaya jata.
5. **Test Push asal push nahi hai.** Engine Controls ka Test Push sirf app ke andar test message hai.
6. **Win rate sirf recorded signals se banta hai.** Shuru me jab koi signal record nahi hua hota to win rate khaali dikhega. Ye sach hai — koi purani history banayi nahi gayi.
7. **Strategy Refiner ka cutoff** sirf is build ke baad record hone wale signals par lagta hai, kyunke purane signals me gate score save nahi hua. UI me ye likha hai.
8. **WAIT signals kabhi record nahi hote,** is liye session stats me WAIT ki ginti hamesha 0 hoti hai. UI me ye likha hai.
9. **AI Agent live AI nahi hai.** Sirf app ke andar ka helper hai (site ke baare me sawal-jawab). UI me "in-app only" likha hai.
10. **Gold ki price Kraken PAX Gold se aati hai** (tokenized gold), Swissquote/Gold-API backup ke saath. UI me source likha hota hai. PAX Gold aur spot Gold me chhota farq ho sakta hai.
11. **Forex prices Yahoo Finance se aati hain** (15m/1m candles aur live quotes). Ye broker feed nahi hain — MT5 broker ki price se chhota farq ho sakta hai.
12. **Koi signal 100% profitable nahi hota.** Website me ye warning likhi hai.

## Security notes

- Passwords scrypt hash se save hote hain (salt ke saath). Kabhi plain text me save nahi hote.
- Sessions random signed tokens hain jo server par save hote hain.
- Admin account pehle se bana hua nahi hai — pehli dafa kholne par admin khud banata hai.
- `.gitignore` me `data/` hai — buyer data aur passwords kabhi GitHub par upload nahi hone chahiye.
- Ye code production-grade audit se nahi guzra. Bechne se pehle khud test karein: admin setup, buyer login, expiry, aur prices.

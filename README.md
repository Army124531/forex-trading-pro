# Forex Trading Pro — Hosting Wala Version

Ye website ka code hai jo aap hosting par laga kar logo ko bech sakti hain.
Is me login, admin panel, buyer accounts, live prices aur signals — sab kuch hai.

## Ye kya hai?

- **Terminal:** Gold, Bitcoin aur Forex ke live prices, BUY/SELL/WAIT signals (85% gate)
- **Indicators:** 12 sections (MACD, RSI, ATR, Bollinger, Ichimoku, VWAP aur zyada)
- **SMC:** SMC score (80% gate), Scanner, 15M Macro, 5M Micro, Backtest
- **Session:** Sydney, Tokyo, London, New York sessions (PKT time)
- **History:** Sirf asal signals aur unke nateeje (Win/Loss/Break-Even/In-Flight)
- **Account:** 9 sub-tabs (Engine Controls, TF Matrix, Tracking Logs, Export CSV, AI Agent, Preferences)
- **Admin:** Buyer banayein, plan dein (Monthly 30 din / Quarterly 90 din / Yearly 365 din / Lifetime), +30 din, band/kholna, password badlein, delete

## Apne computer par chalane ke liye (test ke liye)

1. Node.js install karein (version 18 ya zyada) — https://nodejs.org
2. Is folder me terminal kholein aur likhein:
   ```
   npm install
   npm start
   ```
3. Browser me kholein: http://localhost:3000
4. Pehli dafa **"Pehli Dafa Setup"** aayega — apna Admin username aur password khud banayein. Password kahin likh kar mat bhejein.

## Render.com (free tier) par deploy karne ke steps

Render free hosting hai. Steps:

### Step 1 — Code GitHub par dalna
1. GitHub.com par free account banayein (agar nahi hai).
2. GitHub par **New repository** banayein, naam rakhein: `forex-trading-pro`
3. Is folder ke files us repository me upload karein (GitHub ki website se "uploading an existing file" se, ya git se).
   - Zaroori files: `package.json`, `server.js`, `public/` folder (index.html, app.js, styles.css), `.gitignore`
   - `node_modules` aur `data` folder upload **mat** karein (`.gitignore` me pehle se likha hai).

### Step 2 — Render par account
1. Render.com par jayein aur **Sign Up** karein (GitHub se login karna asaan hai).
2. Dashboard par **New +** dabayein, phir **Web Service** chunein.
3. Apna GitHub repository `forex-trading-pro` select karein aur **Connect** dabayein.

### Step 3 — Settings
- **Name:** `forex-trading-pro` (ya jo naam pasand ho)
- **Region:** jo bhi nazdeek ho (Frankfurt theek hai)
- **Branch:** `main`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Instance Type:** **Free** chunein
- Environment Variables: kuch bhi add karne ki zaroorat nahi hai. (Server khud `PORT` use karta hai jo Render deta hai.)

Phir **Create Web Service** dabayein. 2-5 minute me website tayyar ho jaye gi aur Render aapko link de ga, jaise:
`https://forex-trading-pro.onrender.com`

### Step 4 — Pehli dafa Admin Setup
1. Wo link kholein. **"Pehli Dafa Setup"** aayega.
2. Apna Admin username aur password banayein (password kam se kam 6 harf).
3. Admin panel se pehla test buyer banayein aur us buyer se login karke check karein.

### Step 5 — Buyers ko dena
1. Buyer paise bhejta hai (JazzCash / Easypaisa / bank — jo aap use karti hain).
2. Admin panel me uska buyer account banayein (username, password, plan).
3. Buyer ko link + uska username/password bhej dein.
4. Plan khatam hone par uska login khud band ho jata hai.

## Zaroori baatein (saaf saaf)

- **Free tier par website soti hai:** Render free plan par agar 15 minute koi na khole to website "so" jati hai. Phir pehli dafa kholne par 30-60 second lag sakte hain. Ye normal hai.
- **Data reset ho sakta hai:** Buyer accounts aur signals `data/db.json` file me save hote hain. Render free plan par agar service dobara banayein (redeploy) to ye file reset ho sakti hai aur buyer accounts khatam ho sakte hain. Is se bachne ke liye Render par **Persistent Disk** lagana hota hai (paid hota hai), ya data ka backup rakhna hota hai. Tafseel `DEPLOY-NOTES.md` me hai.
- **Koi signal 100% profitable nahi hota.** Buyers ko ye saaf batayein. Pehle demo par practice karwayein.
- **Admin password kabhi kisi ko mat dein** — na chat me, na screenshot me. Sirf aapko pata hona chahiye.
- **News blackout nahi hai:** Koi free news source nahi hai, is liye website me news blackout ko "available nahi hai" likha hai — jhoota dawa nahi kiya gaya.
- **Test Push sirf test hai:** Engine Controls me Test Push sirf app ke andar test message hai, asal mobile push notification nahi.

## Masla ho to

- Website khul nahi rahi: Render dashboard me **Logs** dekhein — wahan error likha hota hai.
- Price nahi aa rahi: Terminal ke upar API health dekhein — kaunsi API CONNECTED hai, kaunsi RETRY.
- Login nahi ho raha: Admin panel se buyer ka password dobara set karein, ya check karein ke plan khatam to nahi hua.

## Auto Trade (MT4 / MT5) — v10

Website ab signal aate hi buyer ke apne MetaTrader account par trade laga sakti hai.

- **Kaise chalta hai:** har buyer ko website ke **Auto Trade** tab me apni license key milti hai. Buyer EA (`public/ea/` me MT4 aur MT5 dono) apne MetaTrader me lagata hai aur key dalta hai. EA har 10 second baad website se taaza Terminal signal poochta hai aur trade laga deta hai.
- **Broker password website par nahi aata.** Trade buyer ke apne computer / VPS se lagti hai.
- **Hifazat:** key sirf chalte plan par kaam karti hai, pehle MT account se jud jati hai (share nahi ho sakti), aur admin Auto Trade tab se sab ke liye ya kisi ek buyer ke liye band kar sakta hai.
- **EA ki hifazat:** risk % se lot size, din ki nuqsan limit, ziada se ziada trades, aur real account par tab tak trade nahi jab tak buyer khud `InpAllowRealAccount = true` na kare.
- **EA ko sirf taaza signals milte hain** (default 15 minute se purane nahi, admin badal sakta hai), sirf Terminal engine ke, aur sirf wo jo abhi chal rahe hain.

### Zaroori baatein (saaf saaf)

- EA `.mq4` / `.mq5` source file hai — buyer ko MetaEditor me **Compile** dabana hota hai. EA mobile app par nahi chalta; 24 ghante ke liye VPS chahiye.
- EA ka code MetaTrader ke andar test **nahi** hua (yahan MetaTrader nahi tha). Buyers ko dene se pehle khud demo account par compile aur test karein.
- Website ki price broker ki price se thori alag hoti hai (Gold PAX Gold se aata hai). EA SL/TP broker ki apni price se utne hi faasle par lagata hai, aur agar farq bohat ziada ho to trade nahi leta (`InpMaxEntryDeviationPct`).
- License keys `data/db.json` me save hoti hain. Agar ye file reset ho jaye (free hosting par redeploy) to sab keys badal jati hain aur buyers ko nayi key dalni parti hai. Persistent disk lagana behtar hai.
- Doosron ke accounts par auto trade karwana kai mulkon me license ke baghair mana hai. Apne mulk ka qanoon check karein aur buyers ko risk saaf batayein.

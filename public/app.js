// Forex Trading Pro — frontend (single page app)
let token = localStorage.getItem('ftp_token') || null;
let me = null;
let currentPair = 'XAUUSD';
let currentTab = 'terminal';
let prevPrices = {};
let lastUpdateAt = 0;
let priceTimer = null;
let countdownTimer = null;

// ---------------- Language (Roman Urdu default, English option) ----------------
let lang = localStorage.getItem('ftp_lang') || 'ur';
const I18N = {
ur: {
  tagline: 'Gold, Bitcoin aur Forex ke live signals',
  setupTitle: 'Pehli Dafa Setup',
  setupText: 'Apna Admin username aur password khud banayein. Password kahin likh kar mat bhejein — sirf aapko pata hona chahiye.',
  setupBtn: 'Admin Account Banayein',
  loginTitle: 'Login', loginBtn: 'Login',
  finePrint: 'Koi signal 100% profitable nahi hota. Pehle demo par practice karein, asal paisa jaldi mat lagayein.',
  logout: 'Logout', refresh: 'Refresh', refreshing: 'Refresh ho raha hai…',
  lastUpdate: 'Last update',
  secAgo: 'sec pehle',
  tabTerminal: 'Terminal', tabIndicators: 'Indicators', tabSmc: 'SMC', tabSession: 'Session', tabHistory: 'History', tabAccount: 'Account', tabAdmin: 'Admin',
  howSignalTitle: 'Signal Kab Aur Kaise Banta Hai?',
  howSignalText1: 'Signal ka koi fixed time nahi hai. BUY/SELL tabhi banta hai jab 6 gates me se 85% ya zyada points mil jayein. WAIT ka matlab hai: abhi trade mat karein, shartein poori nahi hain.',
  howSignalText2: 'SMC ka gate alag hai (80%) — SMC tab me dekhein. Terminal ka signal SMC gate par nahi rukta.',
  tfHint: 'Best timeframe: 1H (4H trend ke saath) — 1H/4H par signals sab se reliable hote hain, 15M sirf entry timing ke liye hai, 5M par zyada noise hota hai. (30-din 1H backtest: XAUUSD win rate 88.2%, profit factor 5.0 — pichla result hai, guarantee nahi.)',
  rareSignals: 'Signal kam aate hain, lekin behtar hote hain — BUY/SELL sirf tabhi dikhta hai jab 85% gate poora ho. Zyada signals ka matlab behtar result nahi hota.',
  allPairsTitle: 'Tamam Pairs — Live Prices',
  indCenterTitle: 'Indicators Center',
  indCenterText: 'Ye tamam numbers asal Kraken candles se hisaab karke nikale gaye hain — EMA 20/50 trend batata hai, RSI 14 momentum, aur ATR 14 ye batata hai ke price aam tor par kitna hilta hai.',
  smcTitle: 'SMC (Smart Money Concepts)',
  smcText: 'SMC ke levels asal 15M candles ke swing high/low se nikale jate hain — jahan bade kharidar/bechne wale aam tor par rukte hain. SMC score 5 hisse x 20 points se banta hai, gate 80% hai. Terminal ka BUY/SELL is tab se nahi banta; wo Terminal ki apni 85% wali sharton se banta hai.',
  scannerTitle: 'Global Market Scanner (11 pairs, har 45 second)',
  sessionTitle: 'Session Engine', backtestTitle: 'Session Backtest Simulator',
  backtestText: 'Asal 1H candles par session rule chala kar dekhein.',
  backtestBtn: 'Backtest Chalayein (30 din)',
  historyTitle: 'Signal History',
  historyText: 'Sirf asal record kiye gaye signals dikhaye jate hain — koi purani history banayi nahi gayi. Nateeja (Win/Loss/Break-Even/In-Flight) baad ki candles se check karke dikhaya jata hai.',
  refinerTitle: 'Strategy Refiner',
  refinerText: 'Cutoff sirf is build ke baad record hone wale signals par lagta hai, kyunke purane signals me gate score save nahi hua.',
  accountTitle: 'Account', adminTitle: 'Admin Panel — Buyer Accounts',
  adminPlansText: 'Monthly 30 din · Quarterly 90 din · Yearly 365 din · Lifetime (kabhi khatam nahi). Plan khatam hone par buyer login khud band ho jata hai.',
  createBuyerBtn: 'Buyer Banayein',
  newsTitle: 'Fundamental News',
  newsText: 'Taza forex/market headlines — FXStreet aur ForexLive ke free RSS feeds se.',
  chartTitle: 'Price Chart — Candles + EMA 20/50/200',
  indStripTitle: 'Live Indicators',
  smcMacroTitle: '15M Macro', smcMicroTitle: '5M Micro', smcFeedTitle: 'SMC Signals Feed', smcBacktestTitle: 'SMC Backtest',
  termBacktestTitle: 'Terminal Backtest (30 din)',
  phSetupUser: 'Admin username (kam se kam 3 harf)', phSetupPass: 'Admin password (kam se kam 6 harf)',
  phLoginUser: 'Username', phLoginPass: 'Password', phBuyerUser: 'Buyer username', phBuyerPass: 'Buyer password',
  phAiQ: 'Sawal likhein, jaise: signal kab banta hai?',
  hello: 'Salam', loading: 'Load ho raha hai…', noTrade: '(koi trade nahi)',
  price: 'Price', confluence: 'Confluence', gate: 'gate',
  buySellPlans: 'BUY aur SELL plans — dono ek saath',
  signalPlan: 'Signal Plan — ek direction, ek trade',
  smcChecklist: 'SMC Confluence Checklist — is signal ki asal wajah',
  oppScenario: 'Doosri taraf ka scenario',
  oppGateNotMet: 'gate poora nahi hua',
  chkSweep: 'Liquidity Sweep', chkOB: 'Order Block', chkFvg: 'FVG (Fair Value Gap)',
  chkSR: 'Support / Resistance', chkZones: 'Zones (Demand / Supply)',
  chkYes: '✓ Support karta hai', chkNo: '✗ Support nahi karta', chkNa: '– Neutral',
  noSweep: 'Koi sweep nahi hua', noObDir: 'Is taraf ka order block nahi mila', noFvgDir: 'Is taraf ka FVG nahi mila',
  inDemand: 'Price demand zone me hai', inSupply: 'Price supply zone me hai',
  nearDemand: 'Price demand zone ke qareeb hai', nearSupply: 'Price supply zone ke qareeb hai',
  noZone: 'Price kisi zone me nahi hai',
  tradeZone: 'Trade Zone', inZone: 'Price zone me hai', nearZone: 'Price zone ke qareeb hai',
  farZone: 'Price zone se door hai', noZoneDir: 'Is direction ke liye koi zone nahi mila',
  bosUp: 'Structure upar toota (BOS) — bullish', bosDown: 'Structure neeche toota (BOS) — bearish',
  noBreak: 'Koi structure break nahi — level held hai',
  extTitle: 'Extended Confluence — 1H candles se',
  extNote: 'Ye tamam cheezein sirf confluence ke liye hain — signal ki direction aur gates (85%/80%) in se nahi badalte.',
  chkCandle: 'Candlestick Pattern (1H)', chkChoch: 'CHOCH (Change of Character)', chkMss: 'MSS (Market Structure Shift)',
  chkBreaker: 'Breaker / Mitigation Blocks', chkIdm: 'IDM (Inducement)', chkFib: 'Fibonacci Levels',
  chkBb: 'Bollinger Squeeze', chkMacdDiv: 'MACD Divergence', chkMeanRev: 'Mean Reversion',
  chkKillzone: 'Killzone / Session Timing', chkAsian: 'Asian Session Range', chkVwap: 'VWAP Bands (±1σ / ±2σ)', chkVol: 'Volume (1H)',
  patBullEngulf: 'Bullish Engulfing', patBearEngulf: 'Bearish Engulfing', patHammer: 'Hammer / Pin Bar (bullish)',
  patShootingStar: 'Shooting Star (bearish)', patDoji: 'Doji (neutral)', patMorningStar: 'Morning Star (bullish)', patEveningStar: 'Evening Star (bearish)',
  noPattern: 'Koi clear pattern nahi',
  chochUp: 'CHOCH upar — trend ke khilaf break', chochDown: 'CHOCH neeche — trend ke khilaf break', noChoch: 'Koi CHOCH nahi',
  mssUp: 'MSS upar — naya trend confirm', mssDown: 'MSS neeche — naya trend confirm', noMss: 'Koi MSS nahi',
  breakerLbl: 'Breaker', mitigationLbl: 'Mitigation', noBreaker: 'Koi breaker/mitigation block nahi',
  idmSsl: 'IDM mila — SSL sweep phir reclaim (bullish)', idmBsl: 'IDM mila — BSL sweep phir reclaim (bearish)', noIdm: 'Koi IDM nahi',
  fibNearest: 'Nearest level', squeezeOn: 'Squeeze hai — volatility kam, bara move aa sakta hai', squeezeOff: 'Koi squeeze nahi',
  meanNear: 'Mean ke qareeb', meanExtended: 'Mean se door', meanOver: 'Bohat overextended', aboveMean: 'mean se upar', belowMean: 'mean se neeche',
  macdBullDiv: 'Bullish divergence — price neeche, MACD upar', macdBearDiv: 'Bearish divergence — price upar, MACD neeche', noMacdDiv: 'Koi MACD divergence nahi',
  killActive: 'Active killzone', killNext: 'Agla killzone', kzAsian: 'Asian', kzLondon: 'London', kzNewYork: 'New York',
  asianIn: 'Price range ke andar hai', asianAbove: 'Price range se upar nikal gaya (expansion)', asianBelow: 'Price range se neeche nikal gaya (expansion)', noAsian: 'Asian range nahi mili',
  vwapNearest: 'Nearest band',
  volRising: 'Volume badh raha hai', volFalling: 'Volume kam ho raha hai', volNormal: 'Volume normal hai', volNa: 'Is pair par volume nahi milta',
  dxyTitle: 'Dollar Index (DXY)', dxyNa: 'DXY abhi available nahi hai — Yahoo se nahi mila',
  corrLabel: 'Correlation (20-period)', corrNeg: 'negative', corrPos: 'positive', corrFlat: 'kamzor',
  riskTitle: 'Risk Management — guidance (live trade management nahi)',
  riskRrTarget: 'R:R 1:2 ka target — TP3 par poora hota hai',
  riskTp1: 'TP1 par 50% profit lo, phir SL ko breakeven (entry) par le jao.',
  riskSize: 'Position size: har trade par account ka sirf 1% risk karein.',
  riskDd: 'Drawdown control: aik trade me 1% se zyada risk nahi — loss chhota rakhein.',
  sentiment: '24H Sentiment', demandZone: 'Demand Zone', supplyZone: 'Supply Zone',
  liveComments: 'Live Comments', nextCheck: 'Next check in', nextCheckSuffix: 's (30 second monitoring)',
  signalUpdated: 'Signal updated', buyGates: 'BUY Gates', sellGates: 'SELL Gates',
  entryZone: 'Entry Zone', trigger: 'Trigger',
  scorecard: 'Scorecard', trend: 'Trend', momentum: 'Momentum', volatility: 'Volatility', volume: 'Volume',
  structure: 'Structure', ichimoku: 'Ichimoku', vwapSar: 'VWAP / SAR', tf15d: '15M aur Daily',
  smcScore: 'SMC Score', gatePass: 'Gate paar!', gateNotMet: 'Gate poora nahi hua',
  swingLevels: 'Swing Levels', swingHigh: 'Aakhri Swing High', swingLow: 'Aakhri Swing Low',
  liqSweeps: 'Liquidity Sweeps', orderBlocks: 'Order Blocks', bullOB: 'Bullish OB', bearOB: 'Bearish OB',
  fresh: 'fresh', mitigated: 'mitigated', fvg: 'Fair Value Gaps (FVG)', noFvg: 'Koi FVG nahi mila.',
  microSweeps: '5M Micro SSL sweeps', liqPools: 'Liquidity pools',
  pair: 'Pair', direction: 'Direction', confirmedSignals: 'Confirmed SMC signals',
  cycleEvery: 'Cycle: har', cycleSec: 'second',
  sessionActive: 'Active', nowPkt: 'Abhi PKT time', nextSession: 'Agla session', minutes: 'minute me',
  newsBlackout: 'News blackout', notAvailable: 'Available nahi hai',
  sessionStats: 'Session stats', total: 'Total',
  sessionHistoryBtn: 'Session History Dekhein', noSessionSignals: 'Abhi tak koi session signal record nahi hua.',
  backtestRunning: 'Backtest chal raha hai…', trades: 'Trades', wins: 'Wins', losses: 'Losses',
  winRate: 'Win Rate', profitFactor: 'Profit Factor',
  totalExecuted: 'Total Executed', breakEven: 'Break-Even', inFlight: 'In-Flight',
  noClosed: '— (abhi koi closed signal nahi)', noSignals: 'Abhi tak koi signal record nahi hua.',
  cutoff: 'Cutoff', qualifying: 'Qualifying setups', simWinRate: 'Simulated Win Rate',
  allOutcomes: 'Sab outcomes', allEngines: 'Sab engines', mainTerminal: 'Main Terminal',
  smcEngine: 'SMC Engine', sessionEngine: 'Session Engine', newsIntel: 'News Intelligence',
  username: 'Username', role: 'Role', plan: 'Plan', signals: 'Signals', engines: 'Engines',
  engineOffNote: 'OFF wala engine asal me band ho jata hai — uske signals nahi bante. Test Push sirf app ke andar test message hai, asal push notification nahi.',
  testPushBtn: 'Test Push (in-app test)',
  testPushMsg: 'Test push (in-app): ye sirf test hai, asal push notification nahi.',
  historyTabText: 'History tab me tamam signals hain.', openHistory: 'History Kholein',
  tfLoading: 'TF Matrix load ho raha hai…',
  exportText: 'Signals CSV me download karein.', exportBtn: 'Export CSV',
  aiTitle: 'AI Agent — in-app only.',
  aiText: 'Ye koi live AI service nahi hai, sirf app ke andar ka helper hai.',
  aiAsk: 'Poochein', defaultPair: 'Default pair', saved: 'Save ho gaya.',
  totalBuyers: 'Total buyers', expired: 'Expired', bandHai: 'Band hai', active: 'Active',
  lifetime: 'Lifetime', expiry: 'Expiry', extend30: '+30 din', suspend: 'Band karna', reopen: 'Kholna',
  changePass: 'Password badlein', delete: 'Delete', noBuyers: 'Abhi koi buyer nahi hai.',
  buyerCreated: 'Buyer ban gaya', passChanged: 'Password badal gaya.',
  newPassPrompt: 'Naya password (kam se kam 6 harf):', deleteConfirm: 'ko delete karein?',
  serverUnreachable: 'Server se rabta nahi ho raha:', priceLoadFail: 'Price load nahi hui:',
  signalLoadFail: 'Signal load nahi hua:', indLoadFail: 'Indicators load nahi hue:',
  indNoData: 'Indicators ke liye candles nahi milin.', smcLoadFail: 'SMC load nahi hua:',
  smcNoData: 'SMC data nahi mila.', scannerFail: 'Scanner load nahi hua:',
  sessionLoadFail: 'Session load nahi hua:',
  newsFail: 'News abhi nahi mil rahi — thodi der baad dobara koshish karein.',
  newsUpdated: 'Updated', newSignal: 'Naya Signal!',
  alertsNote: 'Alerts sirf tab kaam karte hain jab site khuli ho — band tab ya band phone par nahi.',
  sound: 'Sound', notifications: 'Notifications',
  status: 'Status', session: 'Session', pktTime: 'PKT Time', quality: 'Quality',
  entry: 'Entry', sl: 'SL', tp1: 'TP1', rsi: 'RSI', adx: 'ADX', signal: 'Signal', macdHist: 'MACD Hist', ema20: 'EMA20',
  noSmcSignals: 'Abhi tak koi SMC signal record nahi hua.',
  smcBacktestRunning: 'SMC backtest chal raha hai…', termBacktestRunning: 'Terminal backtest chal raha hai…',
  termBacktestNote: 'Pichle 30 din, 1H candles — mustaqbil ki guarantee nahi. Baseline = Terminal engine (6 gates, 85% gate). Filters ne har pair par behtari nahi dikhai, is liye live engine me koi filter nahi lagaya gaya.',
  termBacktestBtn: 'Terminal Backtest Chalayein',
  smcBacktestBtn: 'SMC Backtest Chalayein (30 din)',
  smcBacktestNote: 'Asal 15M candles par SMC rule (score 80%+) — koi banaya hua number nahi.',
  filter: 'Filter', baseline: 'Baseline', macdAgree: 'MACD agree', noDeadHours: 'No dead hours',
  chartNoData: 'Chart ke liye candles nahi milin.', allSessions: 'Tamam Sessions (PKT time)',
  bos: 'BOS', mss: 'MSS', macroTitle: 'Market Structure (BOS/MSS)',
  buyNow: '🟢 BUY KARO', sellNow: '🔴 SELL KARO', waitNoTrade: '⏳ WAIT — koi trade nahi',
  bannerLine: 'Abhi ye trade karein — Entry, SL aur TP neeche diye gaye hain.',
  inZone: 'IN ZONE — Zone mein hai', approaching: 'APPROACHING — Kareeb aa raha hai',
  waitStatus: 'WAIT', activePlan: 'ACTIVE',
  overview: 'Overview', engineControls: 'Engine Controls', signalDetails: 'Signal Details',
  signalHistory: 'Signal History', tfMatrix: 'TF Matrix', trackingLogs: 'Tracking Logs',
  exportCsv: 'Export CSV', aiAgent: 'AI Agent', preferences: 'Preferences',
  copySignal: '📋 Signal Copy Karein', downloadSignal: '⬇️ Picture Download Karein',
  copyDone: 'Signal copy ho gaya', copyDoneBody: 'Signal text copy ho gaya hai — WhatsApp ya Telegram par paste karein.',
  copyFailBody: 'Copy nahi ho saka — text ko haath se select karke copy karein.',
  imgDone: 'Picture download ho gayi', imgDoneBody: 'Signal card picture download ho gayi hai.',
  imgFail: 'Picture download nahi ho saki — dobara try karein.',
  shareDisclaimer: 'Koi signal 100% profitable nahi hota.',
},
en: {
  tagline: 'Live signals for Gold, Bitcoin and Forex',
  setupTitle: 'First-Time Setup',
  setupText: 'Create your own Admin username and password. Never send your password to anyone — only you should know it.',
  setupBtn: 'Create Admin Account',
  loginTitle: 'Login', loginBtn: 'Login',
  finePrint: 'No signal is 100% profitable. Practice on demo first, do not risk real money in a hurry.',
  logout: 'Logout', refresh: 'Refresh', refreshing: 'Refreshing…',
  lastUpdate: 'Last update',
  secAgo: 'sec ago',
  tabTerminal: 'Terminal', tabIndicators: 'Indicators', tabSmc: 'SMC', tabSession: 'Session', tabHistory: 'History', tabAccount: 'Account', tabAdmin: 'Admin',
  howSignalTitle: 'When and How Is a Signal Made?',
  howSignalText1: 'There is no fixed time for a signal. BUY/SELL only forms when 85% or more points are scored across the 6 gates. WAIT means: do not trade now, the conditions are not met.',
  howSignalText2: 'The SMC gate is separate (80%) — see the SMC tab. The Terminal signal does not wait on the SMC gate.',
  tfHint: 'Best timeframe: 1H (with the 4H trend) — signals are most reliable on 1H/4H; 15M is only for entry timing and 5M is too noisy. (30-day 1H backtest: XAUUSD win rate 88.2%, profit factor 5.0 — a past result, not a guarantee.)',
  rareSignals: 'Signals are rare but higher quality — BUY/SELL only shows when the 85% gate passes. More signals does not mean better results.',
  allPairsTitle: 'All Pairs — Live Prices',
  indCenterTitle: 'Indicators Center',
  indCenterText: 'All these numbers are calculated from real Kraken candles — EMA 20/50 shows trend, RSI 14 shows momentum, and ATR 14 shows how much price usually moves.',
  smcTitle: 'SMC (Smart Money Concepts)',
  smcText: 'SMC levels come from real 15M candle swing highs/lows — where big buyers and sellers usually wait. The SMC score is 5 parts × 20 points, gate 80%. Terminal BUY/SELL does not come from this tab; it uses the Terminal’s own 85% conditions.',
  scannerTitle: 'Global Market Scanner (11 pairs, every 45 seconds)',
  sessionTitle: 'Session Engine', backtestTitle: 'Session Backtest Simulator',
  backtestText: 'Run the session rule on real 1H candles.',
  backtestBtn: 'Run Backtest (30 days)',
  historyTitle: 'Signal History',
  historyText: 'Only actually recorded signals are shown — no past history was invented. The result (Win/Loss/Break-Even/In-Flight) is checked against later candles.',
  refinerTitle: 'Strategy Refiner',
  refinerText: 'The cutoff only applies to signals recorded after this build, because older signals did not save a gate score.',
  accountTitle: 'Account', adminTitle: 'Admin Panel — Buyer Accounts',
  adminPlansText: 'Monthly 30 days · Quarterly 90 days · Yearly 365 days · Lifetime (never expires). When a plan ends, the buyer login locks automatically.',
  createBuyerBtn: 'Create Buyer',
  newsTitle: 'Fundamental News',
  newsText: 'Latest forex/market headlines — from the free FXStreet and ForexLive RSS feeds.',
  chartTitle: 'Price Chart — Candles + EMA 20/50/200',
  indStripTitle: 'Live Indicators',
  smcMacroTitle: '15M Macro', smcMicroTitle: '5M Micro', smcFeedTitle: 'SMC Signals Feed', smcBacktestTitle: 'SMC Backtest',
  termBacktestTitle: 'Terminal Backtest (30 days)',
  phSetupUser: 'Admin username (at least 3 characters)', phSetupPass: 'Admin password (at least 6 characters)',
  phLoginUser: 'Username', phLoginPass: 'Password', phBuyerUser: 'Buyer username', phBuyerPass: 'Buyer password',
  phAiQ: 'Ask a question, e.g.: when is a signal made?',
  hello: 'Hello', loading: 'Loading…', noTrade: '(no trade)',
  price: 'Price', confluence: 'Confluence', gate: 'gate',
  buySellPlans: 'BUY and SELL plans — both together',
  signalPlan: 'Signal Plan — one direction, one trade',
  smcChecklist: 'SMC Confluence Checklist — why this signal',
  oppScenario: 'Opposite scenario',
  oppGateNotMet: 'gate not met',
  chkSweep: 'Liquidity Sweep', chkOB: 'Order Block', chkFvg: 'FVG (Fair Value Gap)',
  chkSR: 'Support / Resistance', chkZones: 'Zones (Demand / Supply)',
  chkYes: '✓ Supports', chkNo: '✗ Does not support', chkNa: '– Neutral',
  noSweep: 'No sweep', noObDir: 'No order block in this direction', noFvgDir: 'No FVG in this direction',
  inDemand: 'Price is in the demand zone', inSupply: 'Price is in the supply zone',
  nearDemand: 'Price is near the demand zone', nearSupply: 'Price is near the supply zone',
  noZone: 'Price is in no zone',
  tradeZone: 'Trade Zone', inZone: 'Price is in the zone', nearZone: 'Price is near the zone',
  farZone: 'Price is away from the zone', noZoneDir: 'No zone found for this direction',
  bosUp: 'Structure broke up (BOS) — bullish', bosDown: 'Structure broke down (BOS) — bearish',
  noBreak: 'No structure break — level held',
  extTitle: 'Extended Confluence — from 1H candles',
  extNote: 'All of these are confluence only — they do not change the signal direction or the gates (85%/80%).',
  chkCandle: 'Candlestick Pattern (1H)', chkChoch: 'CHOCH (Change of Character)', chkMss: 'MSS (Market Structure Shift)',
  chkBreaker: 'Breaker / Mitigation Blocks', chkIdm: 'IDM (Inducement)', chkFib: 'Fibonacci Levels',
  chkBb: 'Bollinger Squeeze', chkMacdDiv: 'MACD Divergence', chkMeanRev: 'Mean Reversion',
  chkKillzone: 'Killzone / Session Timing', chkAsian: 'Asian Session Range', chkVwap: 'VWAP Bands (±1σ / ±2σ)', chkVol: 'Volume (1H)',
  patBullEngulf: 'Bullish Engulfing', patBearEngulf: 'Bearish Engulfing', patHammer: 'Hammer / Pin Bar (bullish)',
  patShootingStar: 'Shooting Star (bearish)', patDoji: 'Doji (neutral)', patMorningStar: 'Morning Star (bullish)', patEveningStar: 'Evening Star (bearish)',
  noPattern: 'No clear pattern',
  chochUp: 'CHOCH up — break against the trend', chochDown: 'CHOCH down — break against the trend', noChoch: 'No CHOCH',
  mssUp: 'MSS up — new trend confirmed', mssDown: 'MSS down — new trend confirmed', noMss: 'No MSS',
  breakerLbl: 'Breaker', mitigationLbl: 'Mitigation', noBreaker: 'No breaker/mitigation block',
  idmSsl: 'IDM found — SSL sweep then reclaim (bullish)', idmBsl: 'IDM found — BSL sweep then reclaim (bearish)', noIdm: 'No IDM',
  fibNearest: 'Nearest level', squeezeOn: 'Squeeze — volatility is low, a big move may come', squeezeOff: 'No squeeze',
  meanNear: 'Near the mean', meanExtended: 'Extended from the mean', meanOver: 'Very overextended', aboveMean: 'above the mean', belowMean: 'below the mean',
  macdBullDiv: 'Bullish divergence — price lower, MACD higher', macdBearDiv: 'Bearish divergence — price higher, MACD lower', noMacdDiv: 'No MACD divergence',
  killActive: 'Active killzone', killNext: 'Next killzone', kzAsian: 'Asian', kzLondon: 'London', kzNewYork: 'New York',
  asianIn: 'Price is inside the range', asianAbove: 'Price expanded above the range', asianBelow: 'Price expanded below the range', noAsian: 'No Asian range',
  vwapNearest: 'Nearest band',
  volRising: 'Volume rising', volFalling: 'Volume falling', volNormal: 'Volume normal', volNa: 'No volume available for this pair',
  dxyTitle: 'Dollar Index (DXY)', dxyNa: 'DXY is not available right now — not received from Yahoo',
  corrLabel: 'Correlation (20-period)', corrNeg: 'negative', corrPos: 'positive', corrFlat: 'weak',
  riskTitle: 'Risk Management — guidance (not live trade management)',
  riskRrTarget: 'Target R:R 1:2 — reached at TP3',
  riskTp1: 'At TP1 take 50% profit, then move SL to breakeven (entry).',
  riskSize: 'Position size: risk only 1% of your account per trade.',
  riskDd: 'Drawdown control: never risk more than 1% on one trade — keep losses small.',
  sentiment: '24H Sentiment', demandZone: 'Demand Zone', supplyZone: 'Supply Zone',
  liveComments: 'Live Comments', nextCheck: 'Next check in', nextCheckSuffix: 's (30-second monitoring)',
  signalUpdated: 'Signal updated', buyGates: 'BUY Gates', sellGates: 'SELL Gates',
  entryZone: 'Entry Zone', trigger: 'Trigger',
  scorecard: 'Scorecard', trend: 'Trend', momentum: 'Momentum', volatility: 'Volatility', volume: 'Volume',
  structure: 'Structure', ichimoku: 'Ichimoku', vwapSar: 'VWAP / SAR', tf15d: '15M and Daily',
  smcScore: 'SMC Score', gatePass: 'Gate passed!', gateNotMet: 'Gate not met',
  swingLevels: 'Swing Levels', swingHigh: 'Last Swing High', swingLow: 'Last Swing Low',
  liqSweeps: 'Liquidity Sweeps', orderBlocks: 'Order Blocks', bullOB: 'Bullish OB', bearOB: 'Bearish OB',
  fresh: 'fresh', mitigated: 'mitigated', fvg: 'Fair Value Gaps (FVG)', noFvg: 'No FVG found.',
  microSweeps: '5M Micro SSL sweeps', liqPools: 'Liquidity pools',
  pair: 'Pair', direction: 'Direction', confirmedSignals: 'Confirmed SMC signals',
  cycleEvery: 'Cycle: every', cycleSec: 'seconds',
  sessionActive: 'Active', nowPkt: 'Current PKT time', nextSession: 'Next session', minutes: 'minutes',
  newsBlackout: 'News blackout', notAvailable: 'Not available',
  sessionStats: 'Session stats', total: 'Total',
  sessionHistoryBtn: 'View Session History', noSessionSignals: 'No session signal recorded yet.',
  backtestRunning: 'Backtest running…', trades: 'Trades', wins: 'Wins', losses: 'Losses',
  winRate: 'Win Rate', profitFactor: 'Profit Factor',
  totalExecuted: 'Total Executed', breakEven: 'Break-Even', inFlight: 'In-Flight',
  noClosed: '— (no closed signal yet)', noSignals: 'No signal recorded yet.',
  cutoff: 'Cutoff', qualifying: 'Qualifying setups', simWinRate: 'Simulated Win Rate',
  allOutcomes: 'All outcomes', allEngines: 'All engines', mainTerminal: 'Main Terminal',
  smcEngine: 'SMC Engine', sessionEngine: 'Session Engine', newsIntel: 'News Intelligence',
  username: 'Username', role: 'Role', plan: 'Plan', signals: 'Signals', engines: 'Engines',
  engineOffNote: 'An OFF engine is really turned off — it makes no signals. Test Push is only an in-app test message, not a real push notification.',
  testPushBtn: 'Test Push (in-app test)',
  testPushMsg: 'Test push (in-app): this is only a test, not a real push notification.',
  historyTabText: 'All signals are in the History tab.', openHistory: 'Open History',
  tfLoading: 'Loading TF Matrix…',
  exportText: 'Download signals as CSV.', exportBtn: 'Export CSV',
  aiTitle: 'AI Agent — in-app only.',
  aiText: 'This is not a live AI service, only a helper inside the app.',
  aiAsk: 'Ask', defaultPair: 'Default pair', saved: 'Saved.',
  totalBuyers: 'Total buyers', expired: 'Expired', bandHai: 'Suspended', active: 'Active',
  lifetime: 'Lifetime', expiry: 'Expiry', extend30: '+30 days', suspend: 'Suspend', reopen: 'Reopen',
  changePass: 'Change password', delete: 'Delete', noBuyers: 'No buyers yet.',
  buyerCreated: 'Buyer created', passChanged: 'Password changed.',
  newPassPrompt: 'New password (at least 6 characters):', deleteConfirm: ' — delete this user?',
  serverUnreachable: 'Cannot reach server:', priceLoadFail: 'Prices did not load:',
  signalLoadFail: 'Signal did not load:', indLoadFail: 'Indicators did not load:',
  indNoData: 'No candles available for indicators.', smcLoadFail: 'SMC did not load:',
  smcNoData: 'No SMC data.', scannerFail: 'Scanner did not load:',
  sessionLoadFail: 'Session did not load:',
  newsFail: 'News is not available right now — please try again shortly.',
  newsUpdated: 'Updated', newSignal: 'New Signal!',
  alertsNote: 'Alerts only work while this site is open — not on a closed tab or phone.',
  sound: 'Sound', notifications: 'Notifications',
  status: 'Status', session: 'Session', pktTime: 'PKT Time', quality: 'Quality',
  entry: 'Entry', sl: 'SL', tp1: 'TP1', rsi: 'RSI', adx: 'ADX', signal: 'Signal', macdHist: 'MACD Hist', ema20: 'EMA20',
  noSmcSignals: 'No SMC signal recorded yet.',
  smcBacktestRunning: 'SMC backtest running…', termBacktestRunning: 'Terminal backtest running…',
  termBacktestNote: 'Past 30 days, 1H candles — not a promise of future results. Baseline = Terminal engine (6 gates, 85% gate). The filters did not improve every pair, so no filter was added to the live engine.',
  termBacktestBtn: 'Run Terminal Backtest',
  smcBacktestBtn: 'Run SMC Backtest (30 days)',
  smcBacktestNote: 'SMC rule (score 80%+) on real 15M candles — no invented numbers.',
  filter: 'Filter', baseline: 'Baseline', macdAgree: 'MACD agree', noDeadHours: 'No dead hours',
  chartNoData: 'No candles available for the chart.', allSessions: 'All Sessions (PKT time)',
  bos: 'BOS', mss: 'MSS', macroTitle: 'Market Structure (BOS/MSS)',
  buyNow: '🟢 BUY NOW', sellNow: '🔴 SELL NOW', waitNoTrade: '⏳ WAIT — no trade',
  bannerLine: 'Take this trade now — Entry, SL and TP are given below.',
  inZone: 'IN ZONE', approaching: 'APPROACHING',
  waitStatus: 'WAIT', activePlan: 'ACTIVE',
  overview: 'Overview', engineControls: 'Engine Controls', signalDetails: 'Signal Details',
  signalHistory: 'Signal History', tfMatrix: 'TF Matrix', trackingLogs: 'Tracking Logs',
  exportCsv: 'Export CSV', aiAgent: 'AI Agent', preferences: 'Preferences',
  copySignal: '📋 Copy Signal', downloadSignal: '⬇️ Download Image',
  copyDone: 'Signal copied', copyDoneBody: 'Signal text copied — paste it on WhatsApp or Telegram.',
  copyFailBody: 'Could not copy — please select the text manually.',
  imgDone: 'Image downloaded', imgDoneBody: 'Signal card image downloaded.',
  imgFail: 'Image download failed — please try again.',
  shareDisclaimer: 'No signal is 100% profitable.',
}};
function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.ur[k] || k; }
function setLang(l) { lang = l === 'en' ? 'en' : 'ur'; localStorage.setItem('ftp_lang', lang); applyLang(); }
function toggleLang() { setLang(lang === 'en' ? 'ur' : 'en'); }
function applyLang() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'ur';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  const lb = document.getElementById('langBtn'); if (lb) lb.textContent = lang === 'en' ? 'اردو | EN' : 'EN | اردو';
  const lb2 = document.getElementById('langBtnAuth'); if (lb2) lb2.textContent = lang === 'en' ? 'اردو | EN' : 'EN | اردو';
  updateAlertButtons();
  if (me) showTab(currentTab);
}

// ---------------- Signal alerts (sound + on-screen + browser notification — site khuli ho to) ----------------
let soundOn = localStorage.getItem('ftp_sound') !== 'off';
let notifOn = localStorage.getItem('ftp_notif') !== 'off';
let lastSeenSignalId = localStorage.getItem('ftp_last_sig') || null;
let alertTimer = null;
let audioCtx = null;
function playAlertSound() {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    [0, 0.25].forEach((off, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === 0 ? 880 : 1174;
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.exponentialRampToValueAtTime(0.25, now + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.22);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(now + off); o.stop(now + off + 0.25);
    });
  } catch (e) {}
}
function showToast(title, bodyHtml) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.innerHTML = '<b>' + esc(title) + '</b><br>' + bodyHtml;
  el.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.style.display = 'none'; }, 15000);
}
function notifySignal(sig) {
  const title = t('newSignal') + ' ' + sig.pair + ' ' + sig.direction;
  const body = 'Entry ' + fmt(sig.entry, 2) + ' · SL ' + fmt(sig.sl, 2) + ' · TP1 ' + fmt(sig.tp1, 2) + ' · ' + new Date(sig.createdAt).toLocaleTimeString();
  showToast(title, esc(body));
  playAlertSound();
  if (notifOn && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch (e) {}
  }
}
async function checkNewSignals() {
  if (!me) return;
  try {
    const d = await api('/api/history');
    const latest = d.signals && d.signals[0];
    if (!latest) return;
    if (!lastSeenSignalId) { lastSeenSignalId = latest.id; localStorage.setItem('ftp_last_sig', latest.id); return; }
    if (latest.id !== lastSeenSignalId) {
      lastSeenSignalId = latest.id; localStorage.setItem('ftp_last_sig', latest.id);
      if (latest.direction !== 'WAIT' && Date.now() - latest.createdAt < 10 * 60 * 1000) notifySignal(latest);
    }
  } catch (e) {}
}
function updateAlertButtons() {
  const s = document.getElementById('soundBtn'); if (s) s.textContent = soundOn ? '🔊' : '🔇';
  const n = document.getElementById('notifBtn'); if (n) n.textContent = notifOn ? '🔔' : '🔕';
}
function toggleSound() {
  soundOn = !soundOn; localStorage.setItem('ftp_sound', soundOn ? 'on' : 'off');
  updateAlertButtons(); if (soundOn) playAlertSound();
  if (me && currentTab === 'account') loadAcct();
}
async function toggleNotif() {
  notifOn = !notifOn; localStorage.setItem('ftp_notif', notifOn ? 'on' : 'off');
  if (notifOn && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  updateAlertButtons();
  if (me && currentTab === 'account') loadAcct();
}

// ---------------- Terminal chart (candles + EMA 20/50/200) ----------------
let chartTf = '15m';
let lastSignalAt = 0;
const CHART_TFS = ['1m', '5m', '15m', '30m', '1H', '4H', '1D'];
function buildChartTf() {
  const el = document.getElementById('chartTf'); if (!el) return;
  el.innerHTML = CHART_TFS.map(tf => `<button class="${tf === chartTf ? 'active' : ''}" onclick="chartTf='${tf}';buildChartTf();loadChart();loadIndStrip();">${tf}</button>`).join('');
}
function emaSeries(values, period) {
  const k = 2 / (period + 1); const out = new Array(values.length).fill(null); let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev == null) { let s = 0; for (let j = i - period + 1; j <= i; j++) s += values[j]; prev = s / period; }
    else prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
async function loadChart() {
  const cv = document.getElementById('chartCanvas'); if (!cv) return;
  try {
    const d = await api('/api/candles?pair=' + currentPair + '&tf=' + chartTf);
    drawChart(cv, d.candles || []);
  } catch (e) {
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#8ea0c2'; ctx.font = '14px sans-serif'; ctx.fillText(t('chartNoData'), 10, 24);
  }
}
function drawChart(cv, candles) {
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!candles || candles.length < 5) { ctx.fillStyle = '#8ea0c2'; ctx.font = '14px sans-serif'; ctx.fillText(t('chartNoData'), 10, 24); return; }
  const closes = candles.map(c => c.c);
  const e20 = emaSeries(closes, 20), e50 = emaSeries(closes, 50), e200 = emaSeries(closes, 200);
  const data = candles.slice(-100);
  const e20s = e20.slice(-100), e50s = e50.slice(-100), e200s = e200.slice(-100);
  let hi = -Infinity, lo = Infinity;
  data.forEach(c => { hi = Math.max(hi, c.h); lo = Math.min(lo, c.l); });
  const pad = (hi - lo) * 0.08 || 1; hi += pad; lo -= pad;
  const X = i => 8 + (i / Math.max(data.length - 1, 1)) * (W - 16);
  const Y = v => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
  data.forEach((c, i) => {
    const up = c.c >= c.o;
    ctx.strokeStyle = up ? '#3ddc84' : '#ff6b6b'; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(X(i), Y(c.h)); ctx.lineTo(X(i), Y(c.l)); ctx.stroke();
    const bw = Math.max(2, (W / data.length) * 0.6);
    ctx.fillRect(X(i) - bw / 2, Y(Math.max(c.o, c.c)), bw, Math.max(1, Math.abs(Y(c.o) - Y(c.c))));
  });
  const drawLine = (arr, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    let started = false;
    arr.forEach((v, i) => { if (v == null) return; if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v)); });
    ctx.stroke(); ctx.lineWidth = 1;
  };
  drawLine(e20s, '#f5c542'); drawLine(e50s, '#4da3ff'); drawLine(e200s, '#ff9a9a');
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#f5c542'; ctx.fillText('— EMA 20', 10, 14);
  ctx.fillStyle = '#4da3ff'; ctx.fillText('— EMA 50', 90, 14);
  ctx.fillStyle = '#ff9a9a'; ctx.fillText('— EMA 200', 170, 14);
}

// ---------------- Terminal indicators strip ----------------
async function loadIndStrip() {
  const el = document.getElementById('indStrip'); if (!el) return;
  try {
    const d = await api('/api/indicators?pair=' + currentPair);
    const tfKey = chartTf === '1D' ? '1D' : chartTf === '1H' ? '1H' : '15m';
    const tf = (d.timeframes[tfKey] && !d.timeframes[tfKey].error) ? d.timeframes[tfKey] : d.timeframes['1H'];
    const lbl = document.getElementById('indStripPair'); if (lbl) lbl.textContent = currentPair.replace('USD', '/USD') + ' · ' + tfKey;
    const cell = (k, v) => `<div class="price-cell"><div>${k}</div><b>${v}</b></div>`;
    el.innerHTML =
      cell('RSI 14', fmt(tf.rsi14, 1)) + cell('MACD', fmt(tf.macd, 2)) +
      cell('EMA 20', fmt(tf.ema20, 2)) + cell('EMA 50', fmt(tf.ema50, 2)) +
      cell('EMA 200', fmt(tf.ema200, 2)) + cell('ATR 14', fmt(tf.atr14, 2)) +
      cell('ADX 14', fmt(tf.adx14, 1)) + cell('Stochastic K', fmt(tf.stochK, 1));
  } catch (e) { el.innerHTML = '<p>' + esc(t('indLoadFail')) + '</p>'; }
}

// ---------------- Fundamental News ----------------
async function loadNews() {
  const el = document.getElementById('newsBody'); if (!el) return;
  el.innerHTML = '<p>' + esc(t('loading')) + '</p>';
  try {
    const d = await api('/api/news');
    if (!d.available || !d.news.length) { el.innerHTML = '<p>' + esc(t('newsFail')) + '</p>'; return; }
    el.innerHTML = d.news.map(n => `<div class="gate"><span><a href="${esc(n.link)}" target="_blank" rel="noopener" style="color:#e8ecf5">${esc(n.title)}</a><br><small style="color:#8ea0c2">${esc(n.source)} · ${new Date(n.time).toLocaleString()}</small></span></div>`).join('') +
      `<p class="fine">${esc(t('newsUpdated'))}: ${new Date(d.updatedAt).toLocaleTimeString()} · ${d.sources.map(s => esc(s.name) + ': ' + esc(s.status)).join(' · ')}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(t('newsFail')) + '</p>'; }
}

// ---------------- SMC extras: feed + backtest ----------------
async function loadSmcFeed() {
  const el = document.getElementById('smcFeed'); if (!el) return;
  try {
    const d = await api('/api/history?engine=smc');
    el.innerHTML = d.signals.length ? d.signals.slice(0, 8).map(s => `<p>${esc(s.pair)} <span class="${s.direction === 'BUY' ? 'buy' : 'sell'}">${s.direction}</span> — Entry ${fmt(s.entry, 2)} · Score ${s.score}% · <b>${esc(s.outcome || 'In-Flight')}</b> · ${new Date(s.createdAt).toLocaleString()}</p>`).join('') : '<p>' + esc(t('noSmcSignals')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function runSmcBacktest() {
  const el = document.getElementById('smcBacktestBody'); if (!el) return;
  el.innerHTML = '<p>' + esc(t('smcBacktestRunning')) + '</p>';
  try {
    const d = await api('/api/smc/backtest?pair=' + currentPair + '&days=30');
    el.innerHTML = `<p>${t('trades')}: ${d.trades} · ${t('wins')}: ${d.wins} · ${t('losses')}: ${d.losses} · ${t('winRate')}: ${d.winRate}% · ${t('profitFactor')}: ${d.profitFactor}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function runTerminalBacktest() {
  const el = document.getElementById('termBacktestBody'); if (!el) return;
  el.innerHTML = '<p>' + esc(t('termBacktestRunning')) + '</p>';
  try {
    const d = await api('/api/terminal/backtest?pair=' + currentPair + '&days=30');
    const row = (name, s) => `<tr><td>${esc(name)}</td><td>${s.trades}</td><td>${s.wins}</td><td>${s.losses}</td><td>${s.winRate}%</td><td>${s.profitFactor}</td></tr>`;
    el.innerHTML = `<table><tr><th>${t('filter')}</th><th>${t('trades')}</th><th>${t('wins')}</th><th>${t('losses')}</th><th>${t('winRate')}</th><th>${t('profitFactor')}</th></tr>` +
      row(t('baseline'), d.baseline) + row('ADX ≥ 20', d.filters.adx20) + row('ADX ≥ 25', d.filters.adx25) + row(t('macdAgree'), d.filters.macdAgree) + row(t('noDeadHours'), d.filters.noDeadHours) + `</table><p>${esc(t('termBacktestNote'))}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}

const PAIR_IDS = ['XAUUSD','XAGUSD','BTCUSD','ETHUSD','SOLUSD','BNBUSD','XRPUSD','DOGEUSD','ADAUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF'];
function fmt(n, dec) { return n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || ('HTTP ' + r.status));
  return d;
}
function showMsg(t) { document.getElementById('authMsg').textContent = t || ''; }

async function init() {
  try {
    const st = await api('/api/auth/state');
    if (st.needsSetup) { document.getElementById('setupBox').style.display = 'block'; }
    else if (token) {
      try { me = (await api('/api/auth/me')).user; enterApp(); return; }
      catch (e) { token = null; localStorage.removeItem('ftp_token'); document.getElementById('loginBox').style.display = 'block'; }
    } else document.getElementById('loginBox').style.display = 'block';
  } catch (e) { showMsg(t('serverUnreachable') + ' ' + e.message); }
}
async function doSetup() {
  const username = document.getElementById('setupUser').value.trim();
  const password = document.getElementById('setupPass').value;
  try {
    const d = await api('/api/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = d.token; localStorage.setItem('ftp_token', token); me = d.user; enterApp();
  } catch (e) { showMsg(e.message); }
}
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = d.token; localStorage.setItem('ftp_token', token); me = d.user; enterApp();
  } catch (e) { showMsg(e.message); }
}
async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  token = null; me = null; localStorage.removeItem('ftp_token');
  clearInterval(priceTimer); clearInterval(countdownTimer); clearInterval(alertTimer);
  document.getElementById('mainScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'block';
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('setupBox').style.display = 'none';
}
function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'block';
  document.getElementById('helloUser').textContent = t('hello') + ', ' + me.username;
  document.getElementById('roleBadge').textContent = me.role === 'admin' ? 'ADMIN' : (me.plan || 'BUYER');
  if (me.role === 'admin') document.getElementById('adminTabBtn').style.display = '';
  updateAlertButtons();
  buildPairSelect();
  buildChartTf();
  showTab('terminal');
  refreshPrices(true);
  loadIndStrip();
  priceTimer = setInterval(() => refreshPrices(false), 5000);
  countdownTimer = setInterval(tickLastUpdate, 1000);
  checkNewSignals();
  alertTimer = setInterval(checkNewSignals, 30000);
}
function buildPairSelect() {
  document.getElementById('pairSelect').innerHTML = PAIR_IDS.map(id =>
    `<button class="${id === currentPair ? 'active' : ''}" onclick="selectPair('${id}')">${id.replace('USD', '/USD')}</button>`).join('');
}
function selectPair(id) { currentPair = id; buildPairSelect(); loadTerminal(); loadIndicators(); loadSmc(); loadTfMatrix(); loadChart(); loadIndStrip(); }
function showTab(t) {
  currentTab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.style.display = 'none');
  document.getElementById('tab-' + t).style.display = 'block';
  if (t === 'terminal') { loadTerminal(); loadChart(); loadIndStrip(); }
  if (t === 'indicators') loadIndicators();
  if (t === 'smc') { loadSmc(); loadScanner(); loadSmcFeed(); }
  if (t === 'session') { loadSession(); loadNews(); }
  if (t === 'history') { loadHistory(); loadPerf(); loadRefiner(); }
  if (t === 'account') buildAcctSubtabs();
  if (t === 'admin') loadAdmin();
}
async function refreshPrices(manual) {
  const btn = document.getElementById('refreshBtn');
  if (manual) { btn.disabled = true; btn.textContent = t('refreshing'); }
  try {
    const d = await api('/api/prices');
    lastUpdateAt = Date.now();
    const grid = document.getElementById('priceList');
    grid.innerHTML = d.pairs.map(p => {
      const prev = prevPrices[p.id];
      const arrow = p.price != null && prev != null ? (p.price > prev ? ' <span class="up">▲</span>' : p.price < prev ? ' <span class="down">▼</span>' : '') : '';
      if (p.price != null) prevPrices[p.id] = p.price;
      const chg = p.change24h == null ? '—' : (p.change24h >= 0 ? '+' : '') + p.change24h.toFixed(2) + '%';
      return `<div class="price-cell"><div>${esc(p.label)} <span style="color:#8ea0c2;font-size:11px">${p.live ? 'LIVE' : esc(p.source)}</span></div><b>${fmt(p.price, p.dec)}${arrow}</b><div style="color:${(p.change24h || 0) >= 0 ? '#3ddc84' : '#ff6b6b'}">${chg}</div></div>`;
    }).join('');
    document.getElementById('liveCount').textContent = 'LIVE ' + d.pairs.filter(p => p.live).length + '/' + d.pairs.length;
    document.getElementById('apiHealth').textContent = d.sources.map(s => s.name + ': ' + s.status).join(' · ');
    if (currentTab === 'terminal') loadTerminal(true);
  } catch (e) { document.getElementById('apiHealth').textContent = t('priceLoadFail') + ' ' + e.message; }
  if (manual) { btn.disabled = false; btn.textContent = t('refresh'); loadIndStrip(); }
}
function tickLastUpdate() {
  if (!lastUpdateAt) return;
  const s = Math.floor((Date.now() - lastUpdateAt) / 1000);
  document.getElementById('lastUpdate').textContent = t('lastUpdate') + ' · ' + s + ' ' + t('secAgo');
  const cd = document.getElementById('countdown');
  if (cd && lastSignalAt) {
    const left = 30 - (Math.floor((Date.now() - lastSignalAt) / 1000) % 30);
    cd.textContent = t('nextCheck') + ' ' + left + t('nextCheckSuffix');
  }
}
// ---------------- Big BUY/SELL banner (sirf tab dikhata hai jab gate paar ho — logic nahi badalta) ----------------
function renderSignalBanner(d) {
  const el = document.getElementById('signalBanner');
  if (!el) return;
  if (!d || d.error || d.disabled) { el.innerHTML = ''; return; }
  const pair = currentPair.replace('USD', '/USD');
  if (d.direction === 'BUY') {
    const p = d.buyPlan;
    el.innerHTML = `<div class="signal-banner buy"><div class="sb-title">${esc(t('buyNow'))} — ${esc(pair)}</div>
      <div class="sb-line">${esc(t('bannerLine'))}</div>
      <div class="sb-vals">${t('entryZone')}: <b>${fmt(p.entryZone[0], 2)} – ${fmt(p.entryZone[1], 2)}</b> · ${t('trigger')}: <b>${fmt(p.trigger, 2)}</b><br>
      SL: <b>${fmt(p.sl, 2)}</b> · TP1: <b>${fmt(p.tp1, 2)}</b> · TP2: <b>${fmt(p.tp2, 2)}</b> · TP3: <b>${fmt(p.tp3, 2)}</b><br>
      ${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  } else if (d.direction === 'SELL') {
    const p = d.sellPlan;
    el.innerHTML = `<div class="signal-banner sell"><div class="sb-title">${esc(t('sellNow'))} — ${esc(pair)}</div>
      <div class="sb-line">${esc(t('bannerLine'))}</div>
      <div class="sb-vals">${t('entryZone')}: <b>${fmt(p.entryZone[0], 2)} – ${fmt(p.entryZone[1], 2)}</b> · ${t('trigger')}: <b>${fmt(p.trigger, 2)}</b><br>
      SL: <b>${fmt(p.sl, 2)}</b> · TP1: <b>${fmt(p.tp1, 2)}</b> · TP2: <b>${fmt(p.tp2, 2)}</b> · TP3: <b>${fmt(p.tp3, 2)}</b><br>
      ${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  } else {
    el.innerHTML = `<div class="signal-banner wait"><div class="sb-title">${esc(t('waitNoTrade'))} — ${esc(pair)}</div>
      <div class="sb-line">${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  }
}

// ---------------- SMC confluence checklist (sirf asal SMC data se — koi checkmark banaya nahi jata) ----------------
function smcChecklistHtml(d) {
  const s = d.smc;
  if (!s) return '<p>' + esc(t('smcNoData')) + '</p>';
  const dir = d.direction;
  // Zone-blocked WAIT: checklist ko us direction se check karo jo block hui (warna WAIT par sab '–' dikhega)
  const chkDir = dir !== 'WAIT' ? dir : (d.zoneBlocked && d.blockedDirection ? d.blockedDirection : 'WAIT');
  const mark = (st) => st === true ? `<span class="chk-ok">${esc(t('chkYes'))}</span>` : st === false ? `<span class="chk-no">${esc(t('chkNo'))}</span>` : `<span class="chk-na">${esc(t('chkNa'))}</span>`;
  const row = (label, st, detail) => `<div class="gate"><span>${esc(label)}</span><span>${mark(st)} ${detail}</span></div>`;
  // 1. Liquidity Sweep — BUY ke liye SSL (neeche sweep), SELL ke liye BSL (upar sweep)
  let sweepSt = null;
  if (chkDir === 'BUY') sweepSt = s.sweepCode === 'SSL';
  else if (chkDir === 'SELL') sweepSt = s.sweepCode === 'BSL';
  const sweepDetail = esc(s.sweepFound ? s.sweep : t('noSweep'));
  // 2. Order Block — BUY ke liye bullish OB, SELL ke liye bearish OB; fresh = support, mitigated = kamzor
  const ob = chkDir === 'BUY' ? s.bullOB : chkDir === 'SELL' ? s.bearOB : (s.bullOB || s.bearOB);
  let obSt = null, obDetail;
  if (ob) {
    obSt = chkDir === 'WAIT' ? null : !ob.mitigated;
    obDetail = esc(fmt(ob.low, 2) + ' – ' + fmt(ob.high, 2) + ' (' + t(ob.mitigated ? 'mitigated' : 'fresh') + ')');
  } else obDetail = esc(t('noObDir'));
  // 3. FVG — BUY ke liye bullish gap, SELL ke liye bearish gap
  const fvgs = chkDir === 'BUY' ? (s.fvgs || []).filter(f => f.type === 'Bullish')
    : chkDir === 'SELL' ? (s.fvgs || []).filter(f => f.type === 'Bearish') : (s.fvgs || []);
  let fvgSt = chkDir === 'WAIT' ? null : false, fvgDetail;
  if (fvgs.length) {
    fvgSt = chkDir === 'WAIT' ? null : true;
    fvgDetail = esc(fvgs.length + ' × ' + fvgs[0].type + ' ' + fmt(fvgs[0].low, 2) + ' – ' + fmt(fvgs[0].high, 2));
  } else fvgDetail = esc(t('noFvgDir'));
  // 4. Support / Resistance + structure break (BOS)
  let srSt = null;
  if (chkDir === 'BUY') srSt = s.bosDir === 'up' ? true : s.bosDir === 'down' ? false : null;
  else if (chkDir === 'SELL') srSt = s.bosDir === 'down' ? true : s.bosDir === 'up' ? false : null;
  const srTxt = s.bosDir === 'up' ? t('bosUp') : s.bosDir === 'down' ? t('bosDown') : t('noBreak');
  const srDetail = esc(t('swingLow') + ' ' + fmt(s.swingLow, 2) + ' · ' + t('swingHigh') + ' ' + fmt(s.swingHigh, 2) + ' — ' + srTxt);
  // 5. Zones — trade zone (agar hai) + price us me / ke qareeb hai ya nahi; warna demand/supply zones
  const atr = d.atr14 || 0;
  let zoneSt = null, zoneDetail;
  if (d.tradeZone) {
    const z = d.tradeZone;
    const inZ = d.price >= z.low && d.price <= z.high;
    const nearZ = !inZ && Math.abs(d.price - (chkDir === 'BUY' ? z.high : z.low)) <= atr;
    const zoneTxt = inZ ? t('inZone') : nearZ ? t('nearZone') : t('farZone');
    zoneSt = inZ || nearZ;
    zoneDetail = esc(t('tradeZone') + ': ' + z.type + ' ' + fmt(z.low, 2) + ' – ' + fmt(z.high, 2) + ' — ' + zoneTxt);
  } else {
    const inDz = s.demandZone && d.price >= s.demandZone[0] && d.price <= s.demandZone[1];
    const inSz = s.supplyZone && d.price >= s.supplyZone[0] && d.price <= s.supplyZone[1];
    const nearDz = s.demandZone && !inDz && Math.min(Math.abs(d.price - s.demandZone[0]), Math.abs(d.price - s.demandZone[1])) <= atr;
    const nearSz = s.supplyZone && !inSz && Math.min(Math.abs(d.price - s.supplyZone[0]), Math.abs(d.price - s.supplyZone[1])) <= atr;
    let zoneTxt;
    if (inDz || nearDz) { zoneTxt = t(inDz ? 'inDemand' : 'nearDemand'); zoneSt = chkDir === 'BUY' ? true : chkDir === 'SELL' ? false : null; }
    else if (inSz || nearSz) { zoneTxt = t(inSz ? 'inSupply' : 'nearSupply'); zoneSt = chkDir === 'SELL' ? true : chkDir === 'BUY' ? false : null; }
    else { zoneTxt = chkDir === 'WAIT' ? t('noZone') : t('noZoneDir'); zoneSt = chkDir === 'WAIT' ? null : false; }
    zoneDetail = esc(zoneTxt + ' — ' + t('demandZone') + ' ' + (s.demandZone ? fmt(s.demandZone[0], 2) + ' – ' + fmt(s.demandZone[1], 2) : '—') + ' · ' + t('supplyZone') + ' ' + (s.supplyZone ? fmt(s.supplyZone[0], 2) + ' – ' + fmt(s.supplyZone[1], 2) : '—'));
  }
  return `<h4>${t('smcChecklist')} — ${t('smcScore')}: ${s.score}/100 (${t('gate')} 80%)</h4>` +
    row(t('chkSweep'), sweepSt, sweepDetail) +
    row(t('chkOB'), obSt, obDetail) +
    row(t('chkFvg'), fvgSt, fvgDetail) +
    row(t('chkSR'), srSt, srDetail) +
    row(t('chkZones'), zoneSt, zoneDetail);
}

// ---------------- v4 Extended confluence panel (sirf display — asal 1H candles se, koi value banayi nahi jati) ----------------
function extendedConfluenceHtml(d) {
  const x = d.extended;
  if (!x) return '';
  const dir = d.direction;
  const chkDir = dir !== 'WAIT' ? dir : (d.zoneBlocked && d.blockedDirection ? d.blockedDirection : 'WAIT');
  const mark = (st) => st === true ? `<span class="chk-ok">${esc(t('chkYes'))}</span>` : st === false ? `<span class="chk-no">${esc(t('chkNo'))}</span>` : `<span class="chk-na">${esc(t('chkNa'))}</span>`;
  const row = (label, st, detail) => `<div class="gate"><span>${esc(label)}</span><span>${mark(st)} ${detail}</span></div>`;
  const dirMatch = (sigDir) => (chkDir === 'WAIT' || !sigDir) ? null : sigDir === chkDir;
  const pkt = (h) => String((h + 5) % 24).padStart(2, '0') + ':00';
  let html = `<h4>${t('extTitle')}</h4>`;
  // 1. Candlestick pattern (1H)
  let cSt = null, cDetail = esc(t('noPattern'));
  if (x.candle) {
    const patKey = { bullEngulf: 'patBullEngulf', bearEngulf: 'patBearEngulf', hammer: 'patHammer', shootingStar: 'patShootingStar', doji: 'patDoji', morningStar: 'patMorningStar', eveningStar: 'patEveningStar' }[x.candle.code] || null;
    cDetail = esc(patKey ? t(patKey) : x.candle.code);
    cSt = x.candle.direction === 'NEUTRAL' ? null : dirMatch(x.candle.direction);
  }
  html += row(t('chkCandle'), cSt, cDetail);
  // 2. CHOCH
  let chSt = null, chDetail = esc(t('noChoch'));
  if (x.choch && x.choch.found) {
    chDetail = esc(x.choch.dir === 'up' ? t('chochUp') : t('chochDown'));
    chSt = dirMatch(x.choch.dir === 'up' ? 'BUY' : 'SELL');
  }
  html += row(t('chkChoch'), chSt, chDetail);
  // 3. MSS
  let mSt = null, mDetail = esc(t('noMss'));
  if (x.mss && x.mss.found) {
    mDetail = esc(x.mss.dir === 'up' ? t('mssUp') : t('mssDown'));
    mSt = dirMatch(x.mss.dir === 'up' ? 'BUY' : 'SELL');
  }
  html += row(t('chkMss'), mSt, mDetail);
  // 4. Breaker / mitigation blocks
  let bSt = null, bDetail = esc(t('noBreaker'));
  if (x.breakers && x.breakers.length) {
    const bl = x.breakers[0];
    const blTxt = (bl.type === 'Breaker' ? t('breakerLbl') : t('mitigationLbl')) + ' (' + bl.dir + ') ' + fmt(bl.low, 2) + ' – ' + fmt(bl.high, 2);
    bDetail = esc(blTxt + (x.breakers.length > 1 ? ' · +' + (x.breakers.length - 1) : ''));
    bSt = dirMatch(bl.dir);
  }
  html += row(t('chkBreaker'), bSt, bDetail);
  // 5. IDM
  let iSt = null, iDetail = esc(t('noIdm'));
  if (x.idm && x.idm.found) {
    iDetail = esc(x.idm.side === 'SSL' ? t('idmSsl') : t('idmBsl'));
    iSt = dirMatch(x.idm.side === 'SSL' ? 'BUY' : 'SELL');
  }
  html += row(t('chkIdm'), iSt, iDetail);
  // 6. Fibonacci
  let fDetail = '—';
  if (x.fib && x.fib.nearest) fDetail = esc(t('fibNearest') + ': ' + x.fib.nearest.label + ' @ ' + fmt(x.fib.nearest.price, 2) + ' (High ' + fmt(x.fib.high, 2) + ' / Low ' + fmt(x.fib.low, 2) + ')');
  html += row(t('chkFib'), null, fDetail);
  // 7. Bollinger squeeze
  let bbDetail = '—';
  if (x.bollinger) bbDetail = esc((x.bollinger.squeeze ? t('squeezeOn') : t('squeezeOff')) + ' · Bandwidth ' + x.bollinger.bandwidthPct + '% · %B ' + x.bollinger.percentB);
  html += row(t('chkBb'), null, bbDetail);
  // 8. MACD divergence
  let mdSt = null, mdDetail = esc(t('noMacdDiv'));
  if (x.macdDiv && x.macdDiv.found) {
    mdDetail = esc(x.macdDiv.type === 'bullish' ? t('macdBullDiv') : t('macdBearDiv'));
    mdSt = dirMatch(x.macdDiv.type === 'bullish' ? 'BUY' : 'SELL');
  }
  html += row(t('chkMacdDiv'), mdSt, mdDetail);
  // 9. Mean reversion
  let mrDetail = '—';
  if (x.meanRev) {
    const lbl = x.meanRev.label === 'near' ? t('meanNear') : x.meanRev.label === 'extended' ? t('meanExtended') : t('meanOver');
    mrDetail = esc('EMA20 se ' + Math.abs(x.meanRev.distATR) + ' ATR ' + t(x.meanRev.side === 'above' ? 'aboveMean' : 'belowMean') + ' — ' + lbl + (x.meanRev.percentB != null ? ' · %B ' + x.meanRev.percentB : ''));
  }
  html += row(t('chkMeanRev'), null, mrDetail);
  // 10. Killzone
  let kzDetail = '—';
  if (x.killzone) {
    const kzName = (code) => code === 'asian' ? t('kzAsian') : code === 'london' ? t('kzLondon') : t('kzNewYork');
    if (x.killzone.active) kzDetail = esc(t('killActive') + ': ' + kzName(x.killzone.active) + ' ' + String(x.killzone.activeStart).padStart(2, '0') + ':00–' + String(x.killzone.activeEnd).padStart(2, '0') + ':00 UTC (' + pkt(x.killzone.activeStart) + '–' + pkt(x.killzone.activeEnd) + ' PKT)');
    else kzDetail = esc(t('killNext') + ': ' + kzName(x.killzone.next) + ' ' + String(x.killzone.nextStart).padStart(2, '0') + ':00 UTC (' + pkt(x.killzone.nextStart) + ' PKT) — ' + x.killzone.nextInMin + ' min');
  }
  html += row(t('chkKillzone'), null, kzDetail);
  // 11. Asian range
  let aSt = null, aDetail = esc(t('noAsian'));
  if (x.asian) {
    const exp = x.asian.expanded;
    aDetail = esc(fmt(x.asian.low, 2) + ' – ' + fmt(x.asian.high, 2) + ' — ' + t(exp === 'above' ? 'asianAbove' : exp === 'below' ? 'asianBelow' : 'asianIn'));
    aSt = exp === 'above' ? dirMatch('BUY') : exp === 'below' ? dirMatch('SELL') : null;
  }
  html += row(t('chkAsian'), aSt, aDetail);
  // 12. VWAP bands
  let vDetail = '—';
  if (x.vwapBands && x.vwapBands.nearest) vDetail = esc(t('vwapNearest') + ': ' + x.vwapBands.nearest.label + ' @ ' + fmt(x.vwapBands.nearest.price, 2) + ' · VWAP ' + fmt(x.vwapBands.vwap, 2));
  html += row(t('chkVwap'), null, vDetail);
  // 13. Volume
  let volDetail = esc(t('volNa'));
  if (x.volume && x.volume.available) {
    const vt = x.volume.trend === 'rising' ? t('volRising') : x.volume.trend === 'falling' ? t('volFalling') : t('volNormal');
    volDetail = esc(vt + ' — ' + x.volume.ratio + '× avg (20)');
  }
  html += row(t('chkVol'), null, volDetail);
  // DXY + correlation line
  let dxyLine = `<p><b>${t('dxyTitle')}:</b> `;
  if (x.dxy && x.dxy.available && x.dxy.value != null) {
    dxyLine += fmt(x.dxy.value, 2);
    if (x.dxy.corr20 != null) {
      const cl = x.dxy.corr20 <= -0.3 ? t('corrNeg') : x.dxy.corr20 >= 0.3 ? t('corrPos') : t('corrFlat');
      dxyLine += ' · ' + esc(currentPair + ' vs DXY ' + t('corrLabel') + ': ' + x.dxy.corr20 + ' (' + cl + ')');
    }
  } else dxyLine += esc(t('dxyNa'));
  dxyLine += '</p>';
  html += dxyLine + `<p class="fine">${t('extNote')}</p>`;
  return html;
}

// ---------------- Risk management box (plan card par — guidance, live trade management nahi) ----------------
function riskBoxHtml(plan) {
  const risk = Math.abs(plan.trigger - plan.sl);
  const rr2 = risk ? (Math.abs(plan.tp2 - plan.trigger) / risk).toFixed(2) : '—';
  const rr3 = risk ? (Math.abs(plan.tp3 - plan.trigger) / risk).toFixed(2) : '—';
  return `<div class="risk-box"><b>${esc(t('riskTitle'))}</b><br>
  ${esc(t('riskRrTarget'))} — TP3 1:${rr3} · TP2 1:${rr2}<br>
  ${esc(t('riskTp1'))}<br>${esc(t('riskSize'))}<br>${esc(t('riskDd'))}</div>`;
}

// ---------------- Copy Signal + Download Signal Image (WealthMind-style share) ----------------
// Signal ka ek standard shape: Terminal plan aur History row dono isi me convert hote hain.
// Copy text aur card image hamesha dikhaye gaye asal Entry/SL/TP/score/time se bante hain — koi value banayi nahi jati.
let currentSignal = null; // Terminal ka active signal (sirf jab BUY/SELL plan ho, WAIT par null)
let histSignals = []; // History ke recorded signals (loadHistory se bharta hai)

function fmtPktTime(ms) {
  try { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch (e) { return new Date(ms).toLocaleString(); }
}
function signalToShare(sig) {
  const risk = Math.abs((sig.entry ?? 0) - (sig.sl ?? 0));
  const rr = sig.rr || (risk && sig.tp3 != null ? '1:' + (Math.abs(sig.tp3 - sig.entry) / risk).toFixed(2) : '');
  return {
    pair: sig.pair, direction: sig.direction === 'SELL' ? 'SELL' : 'BUY',
    entry: sig.entry, sl: sig.sl, tp1: sig.tp1, tp2: sig.tp2, tp3: sig.tp3,
    score: sig.score, rr: rr, time: sig.time || sig.createdAt || Date.now(),
  };
}
function buildSignalText(sig) {
  const s = signalToShare(sig);
  const emoji = s.direction === 'BUY' ? '🟢' : '🔴';
  const lines = [
    emoji + ' ' + s.pair + ' ' + s.direction,
    'Entry: ' + fmt(s.entry, 2),
    'SL: ' + fmt(s.sl, 2),
    'TP1: ' + fmt(s.tp1, 2) + ' | TP2: ' + fmt(s.tp2, 2) + ' | TP3: ' + fmt(s.tp3, 2),
  ];
  if (s.score != null) lines.push('Score: ' + s.score + '%' + (s.rr ? ' · R:R ' + s.rr : ''));
  lines.push('Forex Trading Pro · ' + fmtPktTime(s.time) + ' PKT');
  return lines.join('\n');
}
async function copySignal(sig) {
  if (!sig) return;
  const text = buildSignalText(sig);
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
  } catch (e) { ok = false; }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      ok = !!document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e2) { ok = false; }
  }
  showToast(t('copyDone'), esc(ok ? t('copyDoneBody') : t('copyFailBody')));
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawSignalCard(sig) {
  const s = signalToShare(sig);
  const W = 1080, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const isBuy = s.direction === 'BUY';
  const accent = isBuy ? '#3ddc84' : '#ff6b6b';
  ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, W, H);
  roundRectPath(ctx, 40, 40, W - 80, H - 80, 36);
  ctx.fillStyle = '#111a30'; ctx.fill();
  ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#f5c542'; ctx.fillRect(40, 40, W - 80, 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c542'; ctx.font = '800 44px Arial, sans-serif';
  ctx.fillText('FOREX TRADING PRO', W / 2, 140);
  ctx.fillStyle = '#e8ecf5'; ctx.font = '800 118px Arial, sans-serif';
  ctx.fillText(s.pair, W / 2, 288);
  ctx.font = '800 72px Arial, sans-serif';
  const bw = ctx.measureText(s.direction).width + 100;
  roundRectPath(ctx, (W - bw) / 2, 330, bw, 104, 52);
  ctx.fillStyle = accent; ctx.fill();
  ctx.fillStyle = isBuy ? '#0a0f1e' : '#ffffff';
  ctx.fillText(s.direction, W / 2, 406);
  const rows = [
    ['Entry', fmt(s.entry, 2), '#e8ecf5'],
    ['SL', fmt(s.sl, 2), '#ff6b6b'],
    ['TP1', fmt(s.tp1, 2), '#3ddc84'],
    ['TP2', fmt(s.tp2, 2), '#3ddc84'],
    ['TP3', fmt(s.tp3, 2), '#3ddc84'],
  ];
  let y = 528;
  rows.forEach((row, i) => {
    ctx.textAlign = 'left';
    ctx.font = '700 44px Arial, sans-serif'; ctx.fillStyle = '#8ea0c2';
    ctx.fillText(row[0], 110, y);
    ctx.textAlign = 'right';
    ctx.font = '800 52px Arial, sans-serif'; ctx.fillStyle = row[2];
    ctx.fillText(row[1], W - 110, y);
    y += 86;
    if (i < rows.length - 1) { ctx.fillStyle = '#22304d'; ctx.fillRect(110, y - 30, W - 220, 2); }
  });
  ctx.textAlign = 'center';
  ctx.font = '700 44px Arial, sans-serif'; ctx.fillStyle = '#f5c542';
  ctx.fillText('Score: ' + (s.score != null ? s.score + '%' : '—') + (s.rr ? '   ·   R:R ' + s.rr : ''), W / 2, y + 8);
  ctx.font = '400 34px Arial, sans-serif'; ctx.fillStyle = '#8ea0c2';
  ctx.fillText(fmtPktTime(s.time) + ' PKT', W / 2, H - 150);
  ctx.font = '400 30px Arial, sans-serif';
  ctx.fillText(t('shareDisclaimer'), W / 2, H - 100);
  return cv;
}
function downloadSignalImage(sig) {
  if (!sig) return;
  const s = signalToShare(sig);
  const name = s.pair + '-' + s.direction + '-signal.png';
  const done = () => showToast(t('imgDone'), esc(t('imgDoneBody')));
  const fail = () => showToast(t('imgDone'), esc(t('imgFail')));
  try {
    const cv = drawSignalCard(sig);
    if (cv.toBlob) {
      cv.toBlob((blob) => {
        if (!blob) { fail(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
        done();
      }, 'image/png');
    } else {
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png'); a.download = name; a.click();
      done();
    }
  } catch (e) { fail(); }
}
function copyCurrentSignal() { if (currentSignal) copySignal(currentSignal); }
function downloadCurrentSignal() { if (currentSignal) downloadSignalImage(currentSignal); }
function copyHistorySignal(i) { const s = histSignals[i]; if (s) copySignal(s); }
function downloadHistorySignal(i) { const s = histSignals[i]; if (s) downloadSignalImage(s); }

async function loadTerminal(fromPrice) {
  const el = document.getElementById('terminalCard');
  try {
    const d = await api('/api/signal?pair=' + currentPair + '&lang=' + lang);
    if (d.disabled) { currentSignal = null; el.innerHTML = '<p>' + esc(d.message) + '</p>'; renderSignalBanner(null); return; }
    if (d.error) { currentSignal = null; el.innerHTML = '<p>' + esc(d.message) + '</p>'; renderSignalBanner(null); return; }
    lastSignalAt = Date.now();
    renderSignalBanner(d);
    const dirCls = d.direction === 'BUY' ? 'buy' : d.direction === 'SELL' ? 'sell' : 'wait';
    const planHtml = (plan, label) => {
      // R:R asal numbers se: risk = |trigger - SL|, reward = |TP - trigger|
      const risk = Math.abs(plan.trigger - plan.sl);
      const rrOf = (tp) => risk ? '1:' + (Math.abs(tp - plan.trigger) / risk).toFixed(2) : '—';
      const statusKey = plan.status === 'IN_ZONE' ? 'inZone' : plan.status === 'APPROACHING' ? 'approaching' : 'waitStatus';
      const statusCls = plan.status === 'IN_ZONE' ? 'st-in' : plan.status === 'APPROACHING' ? 'st-near' : 'st-wait';
      const isActive = d.direction === plan.direction;
      return `<div class="plan-card ${isActive ? (plan.direction === 'BUY' ? 'active-buy' : 'active-sell') : ''}">
      <div class="plan-head"><b>${label} ${plan.direction}</b> <span class="status-badge ${statusCls}">${esc(t(statusKey))}</span>${isActive ? ' <span class="status-badge st-active">' + esc(t('activePlan')) + '</span>' : ''}</div>
      ${t('entryZone')}: <b>${fmt(plan.entryZone[0], 2)} – ${fmt(plan.entryZone[1], 2)}</b> · ${t('trigger')}: <b>${fmt(plan.trigger, 2)}</b><br>
      SL: <span class="sell"><b>${fmt(plan.sl, 2)}</b></span> · R:R ${esc(plan.rr || '')}<br>
      TP1: <span class="buy"><b>${fmt(plan.tp1, 2)}</b></span> (${rrOf(plan.tp1)}) · TP2: <b>${fmt(plan.tp2, 2)}</b> (${rrOf(plan.tp2)}) · TP3: <b>${fmt(plan.tp3, 2)}</b> (${rrOf(plan.tp3)})<br>
      ${d.tradeZone ? `${t('tradeZone')}: <b>${esc(d.tradeZone.type)} ${fmt(d.tradeZone.low, 2)} – ${fmt(d.tradeZone.high, 2)}</b>` : ''}
      ${riskBoxHtml(plan)}
      <div class="sig-actions"><button class="btn-sig" onclick="copyCurrentSignal()">${esc(t('copySignal'))}</button> <button class="btn-sig" onclick="downloadCurrentSignal()">${esc(t('downloadSignal'))}</button></div></div>`;
    };
    const gatesHtml = (gates, title) => `<h4>${title}</h4>` + gates.map(g =>
      `<div class="gate"><span>${esc(g.name)}</span><span>${g.points}/${g.max}</span></div>`).join('');
    // Ek direction, ek trade: sirf wo direction dikhao jo gate paar kare.
    // WAIT me dono gates dikhao taake pata chale kyun koi gate paar nahi hua.
    const gatesSection = d.direction === 'BUY' ? gatesHtml(d.buyGates, t('buyGates'))
      : d.direction === 'SELL' ? gatesHtml(d.sellGates, t('sellGates'))
      : gatesHtml(d.buyGates, t('buyGates')) + ' ' + gatesHtml(d.sellGates, t('sellGates'));
    const activePlan = d.direction === 'BUY' ? d.buyPlan : d.direction === 'SELL' ? d.sellPlan : null;
    // Terminal ka active signal — sirf jab BUY/SELL plan ho (WAIT par null, to Copy/Download buttons nahi bante)
    currentSignal = activePlan ? { pair: currentPair, direction: d.direction, entry: activePlan.trigger, sl: activePlan.sl, tp1: activePlan.tp1, tp2: activePlan.tp2, tp3: activePlan.tp3, score: d.confluence, rr: activePlan.rr || '', time: d.updatedAt } : null;
    const oppDir = d.direction === 'BUY' ? 'SELL' : d.direction === 'SELL' ? 'BUY' : null;
    const oppScore = d.direction === 'BUY' ? d.sellScore : d.direction === 'SELL' ? d.buyScore : null;
    el.innerHTML = `
      <h3>${esc(currentPair.replace('USD', '/USD'))} — <span class="${dirCls}">${d.direction}</span> ${d.direction === 'WAIT' ? t('noTrade') : ''}</h3>
      <p>${t('price')}: <b>${fmt(d.price, 2)}</b> · Bid ${fmt(d.bid, 2)} · Ask ${fmt(d.ask, 2)} · Spread ${fmt(d.spread, 2)} · ${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</p>
      <p>PDH ${fmt(d.range.pdh, 2)} · PDL ${fmt(d.range.pdl, 2)} · Range ${fmt(d.range.pdl, 2)} – ${fmt(d.range.pdh, 2)}</p>
      ${gatesSection}
      <h4>${t('signalPlan')} — ${d.direction}</h4>
      ${activePlan ? planHtml(activePlan, d.direction) : '<p>' + esc(t('waitNoTrade')) + (d.zoneBlocked && d.zoneNote ? '<br>' + esc(d.zoneNote) : '') + '</p>'}
      ${oppDir ? `<p class="fine">${t('oppScenario')}: ${oppDir} ${oppScore}% — ${t('oppGateNotMet')} (${t('gate')} 85%)</p>` : ''}
      ${smcChecklistHtml(d)}
      ${extendedConfluenceHtml(d)}
      <h4>${t('sentiment')} — ${esc(d.sentiment.label)}</h4>
      <p>Bullish ${d.sentiment.bullishPct}% · Bearish ${d.sentiment.bearishPct}%</p>
      <p>${t('demandZone')}: ${d.sentiment.demandZone ? fmt(d.sentiment.demandZone[0], 2) + ' – ' + fmt(d.sentiment.demandZone[1], 2) : '—'} · ${t('supplyZone')}: ${d.sentiment.supplyZone ? fmt(d.sentiment.supplyZone[0], 2) + ' – ' + fmt(d.sentiment.supplyZone[1], 2) : '—'}</p>
      <h4>${t('liveComments')}</h4>
      <ul>${d.comments.map(c => '<li>' + esc(c) + '</li>').join('')}</ul>
      <p>${t('nextCheck')} ${d.nextCheckInSec}${t('nextCheckSuffix')} · ${t('signalUpdated')}: ${new Date(d.updatedAt).toLocaleTimeString()}</p>`;
  } catch (e) { if (!fromPrice) el.innerHTML = '<p>' + t('signalLoadFail') + ' ' + esc(e.message) + '</p>'; }
}

async function loadIndicators() {
  const body = document.getElementById('indBody');
  try {
    const d = await api('/api/indicators?pair=' + currentPair);
    document.getElementById('indScore').textContent = t('scorecard') + ': ' + d.scorecard.score + ' / 100';
    const tf = d.timeframes['1H'];
    if (!tf || tf.error) { body.innerHTML = '<p>' + esc(t('indNoData')) + '</p>'; return; }
    const row = (k, v) => `<div class="gate"><span>${k}</span><span>${v}</span></div>`;
    body.innerHTML = `
      <h4>${t('trend')}</h4>${row('EMA 20', fmt(tf.ema20, 2))}${row('EMA 50', fmt(tf.ema50, 2))}${row('EMA 200', fmt(tf.ema200, 2))}${row('MACD', fmt(tf.macd, 2) + ' / Signal ' + fmt(tf.macdSignal, 2) + ' / Hist ' + fmt(tf.macdHist, 2))}${row('ADX 14', fmt(tf.adx14, 1))}
      <h4>${t('momentum')}</h4>${row('RSI 14', fmt(tf.rsi14, 1))}${row('Stochastic K/D', fmt(tf.stochK, 1) + ' / ' + fmt(tf.stochD, 1))}${row('CCI 20', fmt(tf.cci, 1))}${row('Williams %R', fmt(tf.williamsR, 1))}
      <h4>${t('volatility')}</h4>${row('ATR 14', fmt(tf.atr14, 2))}${row('Bollinger Upper', fmt(tf.bbUpper, 2))}${row('Bollinger Middle', fmt(tf.bbMiddle, 2))}${row('Bollinger Lower', fmt(tf.bbLower, 2))}
      <h4>${t('volume')}</h4>${row('OBV', fmt(tf.obv, 0))}${row('CMF', fmt(tf.cmf, 2))}${row('MFI 14', fmt(tf.mfi, 1))}
      <h4>${t('structure')}</h4>${row('Support', fmt(tf.support, 2))}${row('Resistance', fmt(tf.resistance, 2))}${row('Fibonacci 38.2%', fmt(tf.fib['38.2'], 2))}${row('Fibonacci 61.8%', fmt(tf.fib['61.8'], 2))}
      <h4>${t('ichimoku')}</h4>${row('Tenkan', fmt(tf.tenkan, 2))}${row('Kijun', fmt(tf.kijun, 2))}${row('Span A', fmt(tf.spanA, 2))}${row('Span B', fmt(tf.spanB, 2))}${row('Chikou', fmt(tf.chikou, 2))}
      <h4>${t('vwapSar')}</h4>${row('VWAP', fmt(tf.vwap, 2))}${row('Parabolic SAR', fmt(tf.sar, 2))}
      <h4>${t('tf15d')}</h4>
      <p>15M — RSI ${fmt(d.timeframes['15m'].rsi14, 1)} · EMA20 ${fmt(d.timeframes['15m'].ema20, 2)} · ATR ${fmt(d.timeframes['15m'].atr14, 2)}</p>
      <p>Daily — RSI ${fmt(d.timeframes['1D'].rsi14, 1)} · EMA20 ${fmt(d.timeframes['1D'].ema20, 2)} · ATR ${fmt(d.timeframes['1D'].atr14, 2)}</p>`;
  } catch (e) { body.innerHTML = '<p>' + t('indLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadSmc() {
  const el = document.getElementById('smcBody');
  try {
    const d = await api('/api/smc?pair=' + currentPair);
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    if (d.error) { el.innerHTML = '<p>' + esc(t('smcNoData')) + '</p>'; return; }
    el.innerHTML = `
      <p class="score">${t('smcScore')}: ${d.score} / 100 (${t('gate')} 80%) — ${d.score >= 80 ? '<span class="buy">' + esc(t('gatePass')) + '</span>' : '<span class="wait">' + esc(t('gateNotMet')) + '</span>'}</p>
      ${d.parts.map(p => `<div class="gate"><span>${esc(p.name)}</span><span>${p.score}/${p.max}</span></div>`).join('')}
      <h4>${t('swingLevels')}</h4><p>${t('swingHigh')}: ${fmt(d.swingHigh, 2)} · ${t('swingLow')}: ${fmt(d.swingLow, 2)}</p>
      <h4>${t('liqSweeps')}</h4><p>${esc(d.sweep)}</p>
      <h4>${t('orderBlocks')}</h4>
      <p>${t('bullOB')}: ${d.bullOB ? fmt(d.bullOB.low, 2) + ' – ' + fmt(d.bullOB.high, 2) + (d.bullOB.mitigated ? ' (' + t('mitigated') + ')' : ' (' + t('fresh') + ')') : '—'}</p>
      <p>${t('bearOB')}: ${d.bearOB ? fmt(d.bearOB.low, 2) + ' – ' + fmt(d.bearOB.high, 2) + (d.bearOB.mitigated ? ' (' + t('mitigated') + ')' : ' (' + t('fresh') + ')') : '—'}</p>
      <h4>${t('fvg')}</h4>
      ${d.fvgs.length ? d.fvgs.map(f => `<p>${f.type}: ${fmt(f.low, 2)} – ${fmt(f.high, 2)}</p>`).join('') : '<p>' + esc(t('noFvg')) + '</p>'}
      <p>${t('microSweeps')}: ${d.sslSweeps} · ${t('liqPools')}: ${d.pools}</p>`;
    const macro = document.getElementById('smcMacro');
    if (macro) macro.innerHTML = `<p><b>${t('macroTitle')}</b> — ${t('bos')}: ${d.bos ? '✓' : '—'} · ${t('mss')}: ${d.mss ? '✓' : '—'} · ${t('swingHigh')}: ${fmt(d.swingHigh, 2)} · ${t('swingLow')}: ${fmt(d.swingLow, 2)} · ${t('liqPools')}: ${d.pools}</p>`;
    const micro = document.getElementById('smcMicro');
    if (micro) micro.innerHTML = `<p>${t('microSweeps')}: <b>${d.sslSweeps}</b> · FVG: ${d.fvgs.length} · ${t('bullOB')}: ${d.bullOB ? (d.bullOB.mitigated ? t('mitigated') : t('fresh')) : '—'} · ${t('bearOB')}: ${d.bearOB ? (d.bearOB.mitigated ? t('mitigated') : t('fresh')) : '—'}</p>`;
  } catch (e) { el.innerHTML = '<p>' + t('smcLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadScanner() {
  const el = document.getElementById('scannerBody');
  try {
    const d = await api('/api/scanner');
    el.innerHTML = `<table><tr><th>${t('pair')}</th><th>${t('price')}</th><th>${t('smcScore')}</th><th>${t('direction')}</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.pair)}</td><td>${fmt(r.price, 2)}</td><td>${r.smcScore == null ? '—' : r.smcScore + '/100'}</td><td>${esc(r.direction)}</td></tr>`).join('') + `</table>
      <p>${t('confirmedSignals')}: ${d.confirmedSignals} · ${t('cycleEvery')} ${d.cycleSec} ${t('cycleSec')}</p>`;
  } catch (e) { el.innerHTML = '<p>' + t('scannerFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadSession() {
  const el = document.getElementById('sessionBody');
  el.innerHTML = '<p>' + esc(t('loading')) + '</p>';
  try {
    const d = await api('/api/sessions');
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    el.innerHTML = `
      <p><b>${esc(d.active.name)}</b> ${t('sessionActive')} — ${d.active.startPKT} – ${d.active.endPKT} PKT · ${t('nowPkt')}: ${d.nowPKT}</p>
      <p>${t('nextSession')}: ${esc(d.next.name)} — ${d.next.inMin} ${t('minutes')}</p>
      <p>${t('newsBlackout')}: <b>${t('notAvailable')}</b> — ${esc(d.newsBlackout.note)}</p>
      <h4>${t('allSessions')}</h4>
      <table><tr><th>${t('session')}</th><th>${t('pktTime')}</th><th>${t('status')}</th></tr>
      ${d.all.map(s => `<tr><td>${esc(s.name)}</td><td>${s.startPKT} – ${s.endPKT}</td><td>${s.isActive ? '<span class="buy">' + esc(t('sessionActive')) + '</span>' : '—'}</td></tr>`).join('')}</table>
      <table><tr><th>${t('pair')}</th><th>${t('price')}</th><th>${t('quality')}</th><th>${t('direction')}</th><th>${t('entry')}</th><th>SL</th><th>TP1</th></tr>
      ${d.pairs.map(p => `<tr><td>${esc(p.pair)}</td><td>${fmt(p.price, 2)}</td><td>${p.quality}/100</td><td>${esc(p.direction)}</td><td>${fmt(p.entry, 2)}</td><td>${fmt(p.sl, 2)}</td><td>${fmt(p.tp1, 2)}</td></tr>`).join('')}</table>
      <p>${t('sessionStats')} — ${t('total')}: ${d.stats.total} · BUY: ${d.stats.buy} · SELL: ${d.stats.sell} · WAIT: ${d.stats.wait}</p>
      <p>${esc(d.stats.note)}</p>
      <button class="btn small" onclick="loadSessionHistory()">${t('sessionHistoryBtn')}</button>
      <div id="sessionHistory"></div>`;
  } catch (e) { el.innerHTML = '<p>' + t('sessionLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadSessionHistory() {
  const el = document.getElementById('sessionHistory');
  try {
    const d = await api('/api/history?engine=session');
    el.innerHTML = d.signals.length ? d.signals.map(s => `<p>${esc(s.pair)} ${s.direction} — ${t('entry')} ${fmt(s.entry, 2)} · ${esc(s.outcome || 'In-Flight')} · ${new Date(s.createdAt).toLocaleString()}</p>`).join('') : '<p>' + esc(t('noSessionSignals')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function runBacktest() {
  const el = document.getElementById('backtestBody');
  el.innerHTML = '<p>' + esc(t('backtestRunning')) + '</p>';
  try {
    const d = await api('/api/session/backtest?days=30');
    el.innerHTML = `<p>${t('trades')}: ${d.trades} · ${t('wins')}: ${d.wins} · ${t('losses')}: ${d.losses} · ${t('winRate')}: ${d.winRate}% · ${t('profitFactor')}: ${d.profitFactor}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadPerf() {
  try {
    const d = await api('/api/performance');
    document.getElementById('perfBody').innerHTML = `<p>${t('totalExecuted')}: ${d.total} · ${t('wins')}: ${d.wins} · ${t('losses')}: ${d.losses} · ${t('breakEven')}: ${d.breakEven} · ${t('inFlight')}: ${d.inFlight} · ${t('winRate')}: ${d.winRate == null ? t('noClosed') : d.winRate + '%'}</p><p>${esc(d.note)}</p>`;
  } catch (e) {}
}
async function loadHistory() {
  const el = document.getElementById('historyBody');
  const o = document.getElementById('fOutcome').value, en = document.getElementById('fEngine').value;
  try {
    const d = await api('/api/history?outcome=' + o + '&engine=' + en);
    histSignals = d.signals || [];
    el.innerHTML = d.signals.length ? d.signals.map((s, i) => `<div class="price-cell" style="margin:6px 0"><b>${esc(s.pair)}</b> <span class="${s.direction === 'BUY' ? 'buy' : 'sell'}">${s.direction}</span> · ${new Date(s.createdAt).toLocaleString()}<br>${t('entry')} ${fmt(s.entry, 2)} · SL ${fmt(s.sl, 2)} · TP1 ${fmt(s.tp1, 2)} · TP2 ${fmt(s.tp2, 2)} · TP3 ${fmt(s.tp3, 2)} · Score ${s.score}% · ${esc(s.engine)} · <b>${esc(s.outcome || 'In-Flight')}</b><br><button class="btn-sig-sm" onclick="copyHistorySignal(${i})">${esc(t('copySignal'))}</button> <button class="btn-sig-sm" onclick="downloadHistorySignal(${i})">${esc(t('downloadSignal'))}</button></div>`).join('') : '<p>' + esc(t('noSignals')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadRefiner() {
  const el = document.getElementById('refinerBody');
  const c = document.getElementById('refCutoff').value;
  try {
    const d = await api('/api/refiner?cutoff=' + c);
    el.innerHTML = `<p>${t('cutoff')} ${d.cutoff}% — ${t('qualifying')}: ${d.qualifying} · ${t('simWinRate')}: ${d.winRate == null ? '—' : d.winRate + '%'}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
function exportCsv() { window.open('/api/export.csv', '_blank'); }

// ---- Account: 9 sub-tabs ----
const ACCT_TAB_KEYS = ['overview', 'engineControls', 'signalDetails', 'signalHistory', 'tfMatrix', 'trackingLogs', 'exportCsv', 'aiAgent', 'preferences'];
let acctTab = 'overview';
function buildAcctSubtabs() {
  document.getElementById('acctSubtabs').innerHTML = ACCT_TAB_KEYS.map(k => `<button class="${k === acctTab ? 'active' : ''}" onclick="acctTab='${k}';buildAcctSubtabs();loadAcct()">${t(k)}</button>`).join('');
  loadAcct();
}
async function loadAcct() {
  const el = document.getElementById('acctBody');
  try {
    if (acctTab === 'overview') {
      const s = await api('/api/settings');
      const p = await api('/api/performance');
      el.innerHTML = `<p>${t('username')}: <b>${esc(me.username)}</b> · ${t('role')}: ${esc(me.role)} · ${t('plan')}: ${esc(me.plan || '—')}</p>
      <p>${t('engines')}: Terminal ${s.settings.engines.terminal ? 'ON' : 'OFF'} · SMC ${s.settings.engines.smc ? 'ON' : 'OFF'} · Session ${s.settings.engines.session ? 'ON' : 'OFF'}</p>
      <p>${t('signals')}: ${t('total')} ${p.total} · ${t('wins')} ${p.wins} · ${t('losses')} ${p.losses} · ${t('inFlight')} ${p.inFlight}</p>`;
    } else if (acctTab === 'engineControls') {
      const s = await api('/api/settings');
      el.innerHTML = ['terminal', 'smc', 'session', 'news'].map(k => `<div class="gate"><span>${k === 'terminal' ? t('mainTerminal') : k === 'smc' ? t('smcEngine') : k === 'session' ? t('sessionEngine') : t('newsIntel')}</span><button class="btn small ${s.settings.engines[k] ? 'gold' : ''}" onclick="toggleEngine('${k}', ${!s.settings.engines[k]})">${s.settings.engines[k] ? 'ON' : 'OFF'}</button></div>`).join('') +
      `<p>${esc(t('engineOffNote'))}</p>
      <button class="btn small" onclick="testPush()">${t('testPushBtn')}</button> <span id="pushMsg"></span>`;
    } else if (acctTab === 'signalDetails') {
      const d = await api('/api/signal?pair=' + currentPair + '&lang=' + lang);
      // Ek direction, ek trade — sirf wo plan dikhao jo gate paar kare (Terminal jaisa)
      const p = d.direction === 'BUY' ? d.buyPlan : d.direction === 'SELL' ? d.sellPlan : null;
      el.innerHTML = d.error ? '<p>' + esc(d.message) + '</p>' : p
        ? `<p><b>${d.direction}</b> — ${t('entryZone')} ${fmt(p.entryZone[0], 2)} – ${fmt(p.entryZone[1], 2)} · ${t('trigger')} ${fmt(p.trigger, 2)} · SL ${fmt(p.sl, 2)} · TP ${fmt(p.tp1, 2)} / ${fmt(p.tp2, 2)} / ${fmt(p.tp3, 2)} · ${t('confluence')} ${d.confluence}%</p>`
        : '<p>' + esc(t('waitNoTrade')) + ' — ' + t('confluence') + ' ' + d.confluence + '%</p>';
    } else if (acctTab === 'signalHistory') {
      el.innerHTML = `<p>${esc(t('historyTabText'))}</p><button class="btn small gold" onclick="showTab('history')">${t('openHistory')}</button>`;
    } else if (acctTab === 'tfMatrix') {
      await loadTfMatrix();
    } else if (acctTab === 'trackingLogs') {
      const d = await api('/api/logs');
      el.innerHTML = d.logs.length ? d.logs.map(l => `<p>${new Date(l.at).toLocaleTimeString()} — ${esc(l.text)}</p>`).join('') : '<p>' + esc(t('noSignals')) + '</p>';
    } else if (acctTab === 'exportCsv') {
      el.innerHTML = `<p>${esc(t('exportText'))}</p><button class="btn small gold" onclick="exportCsv()">${t('exportBtn')}</button>`;
    } else if (acctTab === 'aiAgent') {
      el.innerHTML = `<p><b>${esc(t('aiTitle'))}</b> ${esc(t('aiText'))}</p>
      <input id="aiQ" data-i18n-ph="phAiQ" placeholder="${esc(t('phAiQ'))}"><button class="btn gold" onclick="askAi()">${t('aiAsk')}</button><p id="aiA"></p>`;
    } else if (acctTab === 'preferences') {
      el.innerHTML = `<p>${t('defaultPair')}: <select id="prefPair" onchange="savePref()">${PAIR_IDS.map(p => `<option ${p === currentPair ? 'selected' : ''}>${p}</option>`).join('')}</select></p><p id="prefMsg"></p>
      <p>${t('sound')}: <button class="btn small ${soundOn ? 'gold' : ''}" onclick="toggleSound()">${soundOn ? 'ON' : 'OFF'}</button> · ${t('notifications')}: <button class="btn small ${notifOn ? 'gold' : ''}" onclick="toggleNotif()">${notifOn ? 'ON' : 'OFF'}</button></p>
      <p class="fine">${esc(t('alertsNote'))}</p>`;
    }
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadTfMatrix() {
  const el = document.getElementById('acctBody');
  el.innerHTML = '<p>' + esc(t('tfLoading')) + '</p>';
  try {
    const d = await api('/api/tfmatrix?pair=' + currentPair);
    el.innerHTML = `<table><tr><th>TF</th><th>${t('rsi')}</th><th>${t('ema20')}</th><th>${t('macdHist')}</th><th>${t('adx')}</th><th>${t('signal')}</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.tf)}</td><td>${r.rsi ?? '—'}</td><td>${fmt(r.ema20, 2)}</td><td>${fmt(r.macdHist, 2)}</td><td>${r.adx ?? '—'}</td><td>${esc(r.signal)}</td></tr>`).join('') + `</table><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function toggleEngine(k, val) {
  try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ engines: { [k]: val } }) }); loadAcct(); }
  catch (e) { alert(e.message); }
}
function testPush() { document.getElementById('pushMsg').textContent = t('testPushMsg'); }
async function askAi() {
  const q = document.getElementById('aiQ').value;
  try { const d = await api('/api/ai', { method: 'POST', body: JSON.stringify({ question: q }) }); document.getElementById('aiA').textContent = d.answer + ' (' + d.note + ')'; }
  catch (e) { document.getElementById('aiA').textContent = e.message; }
}
async function savePref() {
  try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ defaultPair: document.getElementById('prefPair').value }) }); document.getElementById('prefMsg').textContent = t('saved'); }
  catch (e) { document.getElementById('prefMsg').textContent = e.message; }
}

// ---- Admin ----
async function loadAdmin() {
  const el = document.getElementById('adminUsers');
  try {
    const d = await api('/api/admin/users');
    document.getElementById('adminCounts').innerHTML = `<p>${t('totalBuyers')}: ${d.total} · ${t('active')}: ${d.active} · ${t('expired')}: ${d.expired}</p>`;
    el.innerHTML = d.users.length ? d.users.map(u => `<div class="price-cell" style="margin:6px 0">
      <b>${esc(u.username)}</b> (${esc(u.role)}) · ${t('plan')}: ${esc(u.plan)} · ${u.expiresAt ? t('expiry') + ': ' + new Date(u.expiresAt).toLocaleDateString() : t('lifetime')} · ${u.suspended ? '<span class="sell">' + esc(t('bandHai')) + '</span>' : '<span class="buy">' + esc(t('active')) + '</span>'}
      ${u.role === 'buyer' ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn small" onclick="adminAction('${esc(u.username)}','extend')">${t('extend30')}</button>
      <button class="btn small" onclick="adminAction('${esc(u.username)}','${u.suspended ? 'reopen' : 'suspend'}')">${u.suspended ? t('reopen') : t('suspend')}</button>
      <button class="btn small" onclick="adminPass('${esc(u.username)}')">${t('changePass')}</button>
      <button class="btn small" onclick="adminDelete('${esc(u.username)}')">${t('delete')}</button></div>` : ''}</div>`).join('') : '<p>' + esc(t('noBuyers')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function createBuyer() {
  const username = document.getElementById('newBuyerUser').value.trim();
  const password = document.getElementById('newBuyerPass').value;
  const plan = document.getElementById('newBuyerPlan').value;
  try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, plan }) }); alert(t('buyerCreated') + ': ' + username + ' (' + plan + ')'); loadAdmin(); }
  catch (e) { alert(e.message); }
}
async function adminAction(username, action) {
  try { await api('/api/admin/users/' + encodeURIComponent(username) + '/' + action, { method: 'POST' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}
async function adminPass(username) {
  const p = prompt(t('newPassPrompt'));
  if (!p) return;
  try { await api('/api/admin/users/' + encodeURIComponent(username) + '/password', { method: 'POST', body: JSON.stringify({ password: p }) }); alert(t('passChanged')); }
  catch (e) { alert(e.message); }
}
async function adminDelete(username) {
  if (!confirm(username + ' ' + t('deleteConfirm'))) return;
  try { await api('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}

applyLang();
init();

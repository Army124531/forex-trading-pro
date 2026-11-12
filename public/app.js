// Forex Trading Pro — frontend (single page app)
let token = localStorage.getItem('ftp_token') || null;
let me = null;
let currentPair = localStorage.getItem('ftp_pref_pair') || 'XAUUSD';
let currentTab = 'terminal';
let prevPrices = {};
let lastUpdateAt = 0;
let priceTimer = null;
let countdownTimer = null;

// ---------------- v7: monitoring / perf / share state ----------------
let monitorInterval = [5, 10, 15, 30].includes(parseInt(localStorage.getItem('ftp_monitor_interval') || '5', 10)) ? parseInt(localStorage.getItem('ftp_monitor_interval') || '5', 10) : 5;
let monitoringOn = localStorage.getItem('ftp_monitoring') !== 'off';
let lastTerminalSig = null, lastBannerSig = null, lastSignalData = null;
let priceCells = {}; // pairId -> {price, chg, live} element refs (in-place update ke liye)
let popupSignal = null, shareSignal = null;
let histOpenDetails = {};
let riskProfile = localStorage.getItem('ftp_risk_profile') || 'moderate';
let theme = localStorage.getItem('ftp_theme') || 'dark';
function applyTheme() { try { document.body.classList.toggle('light', theme === 'light'); } catch (e) {} }
applyTheme();
function riskProfileText() {
  return riskProfile === 'conservative' ? t('riskConsText') : riskProfile === 'aggressive' ? t('riskAggText') : t('riskModText');
}
function fmtPktTimeShort(ms) {
  try { return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch (e) { return new Date(ms).toLocaleTimeString(); }
}
// 12-hour clock everywhere (user asked: "2:00" style, not "14:00") — AM/PM so
// morning/night are never confused. Dates stay as they are (DD/MM/YYYY).
function fmtPktTime12(ms) {
  try { return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }); }
  catch (e) { return new Date(ms).toLocaleTimeString(); }
}
function fmtPktDateTime(ms) {
  try { return new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' }) + ', ' + fmtPktTimeShort(ms); }
  catch (e) { return new Date(ms).toLocaleString(); }
}
// "HH:MM" (24h, e.g. server session times) -> "2:00 PM"
function fmtHm12(str) {
  if (!str || typeof str !== 'string') return str || '—';
  const m = str.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return str;
  return fmtHour12(parseInt(m[1], 10), parseInt(m[2], 10));
}
function fmtHour12(h, min) {
  const hh = ((h % 24) + 24) % 24, mm = min == null ? 0 : min;
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return h12 + ':' + String(mm).padStart(2, '0') + ' ' + ap;
}
// Clipboard helper (Copy Signal / WAIT / Share text sab isi se — ek hi code, fallback ke saath)
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = !!document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e2) { return false; }
}

// ---------------- Language (Roman Urdu default, English option) ----------------
const LANGS = [['ur','اردو'],['en','English'],['ar','العربية'],['hi','हिन्दी'],['bn','বাংলা'],['es','Español'],['fr','Français'],['de','Deutsch'],['tr','Türkçe'],['pt','Português'],['ru','Русский'],['zh','中文'],['id','Bahasa Indonesia'],['fa','فارسی']];
const RTL_LANGS = ['ar','fa','ur'];
let lang = localStorage.getItem('ftp_lang') || 'ur';
if (!LANGS.some(([c]) => c === lang)) lang = 'ur';
const I18N = {
  ur: {
    tagline: "Gold, Bitcoin aur Forex ke live signals",
    setupTitle: "Pehli Dafa Setup",
    setupText: "Apna Admin username aur password khud banayein. Password kahin likh kar mat bhejein — sirf aapko pata hona chahiye.",
    setupBtn: "Admin Account Banayein",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "Koi signal 100% profitable nahi hota. Pehle demo par practice karein, asal paisa jaldi mat lagayein.",
    logout: "Logout",
    refresh: "Refresh",
    refreshing: "Refresh ho raha hai…",
    lastUpdate: "Last update",
    secAgo: "sec pehle",
    tabTerminal: "Terminal",
    tabIndicators: "Indicators",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "History",
    tabAccount: "Account",
    tabAdmin: "Admin",
    howSignalTitle: "Signal Kab Aur Kaise Banta Hai?",
    howSignalText1: "Signal ka koi fixed time nahi hai. BUY/SELL tabhi banta hai jab 6 gates me se 85% ya zyada points mil jayein. WAIT ka matlab hai: abhi trade mat karein, shartein poori nahi hain.",
    howSignalText2: "SMC ka gate alag hai (80%) — SMC tab me dekhein. Terminal ka signal SMC gate par nahi rukta.",
    tfHint: "Best timeframe: 1H (4H trend ke saath) — 1H/4H par signals sab se reliable hote hain, 15M sirf entry timing ke liye hai, 5M par zyada noise hota hai. (90-din backtest, 4 pairs: win rate ~60%, profit factor ~1.00 — breakeven, pichla result hai, guarantee nahi.)",
    rareSignals: "Signal kam aate hain, lekin behtar hote hain — BUY/SELL sirf tabhi dikhta hai jab 85% gate poora ho. Zyada signals ka matlab behtar result nahi hota.",
    allPairsTitle: "Tamam Pairs — Live Prices",
    indCenterTitle: "Indicators Center",
    indCenterText: "Ye tamam numbers asal Kraken candles se hisaab karke nikale gaye hain — EMA 20/50 trend batata hai, RSI 14 momentum, aur ATR 14 ye batata hai ke price aam tor par kitna hilta hai.",
    indTfNote: "Neeche ki values 1H timeframe ki hain — 15M aur Daily alag se neeche likhe hain",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC ke levels asal 15M candles ke swing high/low se nikale jate hain — jahan bade kharidar/bechne wale aam tor par rukte hain. SMC score 5 hisse x 20 points se banta hai, gate 80% hai. Terminal ka BUY/SELL is tab se nahi banta; wo Terminal ki apni 85% wali sharton se banta hai.",
    scannerTitle: "Global Market Scanner (11 pairs, har 45 second)",
    smcPairCardsTitle: "SMC Tasdeeq — Har Pair",
    sessionTitle: "Session Engine",
    backtestTitle: "Session Backtest Simulator",
    backtestText: "Asal 1H candles par session rule chala kar dekhein.",
    backtestBtn: "Backtest Chalayein (30 din)",
    historyTitle: "Signal History",
    historyText: "Sirf asal record kiye gaye signals dikhaye jate hain — koi purani history banayi nahi gayi. Nateeja (Win/Loss/Break-Even/In-Flight) baad ki candles se check karke dikhaya jata hai.",
    refinerTitle: "Strategy Refiner",
    refinerText: "Cutoff sirf is build ke baad record hone wale signals par lagta hai, kyunke purane signals me gate score save nahi hua.",
    marketClosedTitle: "Market Band Hai",
    marketClosedText: "Forex aur Gold ki market Hafta aur Ittwaar ko band rehti hai — is pair par koi naya signal nahi banega. Yahan dikhai gayi price aakhri available hai, live nahi.",
    marketClosedShort: "Market band hai — price aakhri available hai",
    accountTitle: "Account",
    adminTitle: "Admin Panel — Buyer Accounts",
    adminPlansText: "Monthly 30 din · Quarterly 90 din · Yearly 365 din · Lifetime (kabhi khatam nahi). Plan khatam hone par buyer login khud band ho jata hai.",
    createBuyerBtn: "Buyer Banayein",
    newsTitle: "Fundamental News",
    newsText: "Taza forex/market headlines — FXStreet aur ForexLive ke free RSS feeds se.",
    chartTitle: "Price Chart — Candles + EMA 20/50/200",
    indStripTitle: "Live Indicators",
    smcMacroTitle: "15M Macro",
    smcMicroTitle: "5M Micro",
    smcFeedTitle: "SMC Confirmation Feed — tasdeeq, signal nahi",
    smcBacktestTitle: "SMC Backtest",
    termBacktestTitle: "Terminal Backtest (30 din)",
    phSetupUser: "Admin username (kam se kam 3 harf)",
    phSetupPass: "Admin password (kam se kam 6 harf)",
    phLoginUser: "Username",
    phLoginPass: "Password",
    phBuyerUser: "Buyer username",
    phBuyerPass: "Buyer password",
    phAiQ: "Sawal likhein, jaise: signal kab banta hai?",
    hello: "Salam",
    loading: "Load ho raha hai…",
    noTrade: "(koi trade nahi)",
    price: "Price",
    confluence: "Confluence",
    gate: "gate",
    buySellPlans: "BUY aur SELL plans — dono ek saath",
    signalPlan: "Signal Plan — ek direction, ek trade",
    smcChecklist: "SMC Confluence Checklist — is signal ki asal wajah",
    oppScenario: "Doosri taraf ka scenario",
    oppGateNotMet: "gate poora nahi hua",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zones (Demand / Supply)",
    chkYes: "✓ Support karta hai",
    chkNo: "✗ Support nahi karta",
    chkNa: "– Neutral",
    noSweep: "Koi sweep nahi hua",
    noObDir: "Is taraf ka order block nahi mila",
    noFvgDir: "Is taraf ka FVG nahi mila",
    inDemand: "Price demand zone me hai",
    inSupply: "Price supply zone me hai",
    nearDemand: "Price demand zone ke qareeb hai",
    nearSupply: "Price supply zone ke qareeb hai",
    noZone: "Price kisi zone me nahi hai",
    tradeZone: "Trade Zone",
    inZone: "IN ZONE — Zone mein hai",
    nearZone: "Price zone ke qareeb hai",
    farZone: "Price zone se door hai",
    noZoneDir: "Is direction ke liye koi zone nahi mila",
    bosUp: "Structure upar toota (BOS) — bullish",
    bosDown: "Structure neeche toota (BOS) — bearish",
    noBreak: "Koi structure break nahi — level held hai",
    extTitle: "Extended Confluence — 1H candles se",
    extNote: "Ye tamam cheezein sirf confluence ke liye hain — signal ki direction aur gates (85%/80%) in se nahi badalte.",
    chkCandle: "Candlestick Pattern (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Breaker / Mitigation Blocks",
    chkIdm: "IDM (Inducement)",
    chkFib: "Fibonacci Levels",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "MACD Divergence",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Session Timing",
    chkAsian: "Asian Session Range",
    chkVwap: "VWAP Bands (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullish)",
    patShootingStar: "Shooting Star (bearish)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Morning Star (bullish)",
    patEveningStar: "Evening Star (bearish)",
    noPattern: "Koi clear pattern nahi",
    chochUp: "CHOCH upar — trend ke khilaf break",
    chochDown: "CHOCH neeche — trend ke khilaf break",
    noChoch: "Koi CHOCH nahi",
    mssUp: "MSS upar — naya trend confirm",
    mssDown: "MSS neeche — naya trend confirm",
    noMss: "Koi MSS nahi",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Koi breaker/mitigation block nahi",
    idmSsl: "IDM mila — SSL sweep phir reclaim (bullish)",
    idmBsl: "IDM mila — BSL sweep phir reclaim (bearish)",
    noIdm: "Koi IDM nahi",
    fibNearest: "Nearest level",
    squeezeOn: "Squeeze hai — volatility kam, bara move aa sakta hai",
    squeezeOff: "Koi squeeze nahi",
    meanNear: "Mean ke qareeb",
    meanExtended: "Mean se door",
    meanOver: "Bohat overextended",
    aboveMean: "mean se upar",
    belowMean: "mean se neeche",
    macdBullDiv: "Bullish divergence — price neeche, MACD upar",
    macdBearDiv: "Bearish divergence — price upar, MACD neeche",
    noMacdDiv: "Koi MACD divergence nahi",
    killActive: "Active killzone",
    killNext: "Agla killzone",
    kzAsian: "Asian",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Price range ke andar hai",
    asianAbove: "Price range se upar nikal gaya (expansion)",
    asianBelow: "Price range se neeche nikal gaya (expansion)",
    noAsian: "Asian range nahi mili",
    vwapNearest: "Nearest band",
    volRising: "Volume badh raha hai",
    volFalling: "Volume kam ho raha hai",
    volNormal: "Volume normal hai",
    volNa: "Is pair par volume nahi milta",
    dxyTitle: "Dollar Index (DXY)",
    dxyNa: "DXY abhi available nahi hai — Yahoo se nahi mila",
    corrLabel: "Correlation (20-period)",
    corrNeg: "negative",
    corrPos: "positive",
    corrFlat: "kamzor",
    riskTitle: "Risk Management — guidance (live trade management nahi)",
    riskRrTarget: "R:R 1:2 ka target — TP3 par poora hota hai",
    riskTp1: "TP1 par 50% profit lo, phir SL ko breakeven (entry) par le jao.",
    riskSize: "Position size: har trade par account ka sirf 1% risk karein.",
    riskDd: "Drawdown control: aik trade me 1% se zyada risk nahi — loss chhota rakhein.",
    sentiment: "24H Sentiment",
    demandZone: "Demand Zone",
    supplyZone: "Supply Zone",
    liveComments: "Live Comments",
    nextCheck: "Next check in",
    nextCheckSuffix: "s (30 second monitoring)",
    signalUpdated: "Signal updated",
    buyGates: "BUY Gates",
    sellGates: "SELL Gates",
    entryZone: "Entry Zone",
    trigger: "Trigger",
    scorecard: "Scorecard",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatility",
    volume: "Volume",
    structure: "Structure",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M aur Daily",
    smcScore: "SMC Score",
    gatePass: "Gate paar!",
    gateNotMet: "gate poora nahi hua",
    swingLevels: "Swing Levels",
    swingHigh: "Aakhri Swing High",
    swingLow: "Aakhri Swing Low",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "Bullish OB",
    bearOB: "Bearish OB",
    fresh: "fresh",
    mitigated: "mitigated",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "Koi FVG nahi mila.",
    microSweeps: "5M Micro SSL sweeps",
    liqPools: "Liquidity pools",
    pair: "Pair",
    direction: "Direction",
    confirmedSignals: "SMC confirmations (tasdeeq)",
    cycleEvery: "Cycle: har",
    cycleSec: "second",
    sessionActive: "Active",
    nowPkt: "Abhi PKT time",
    nextSession: "Agla session",
    minutes: "minute me",
    newsBlackout: "News blackout",
    notAvailable: "Available nahi hai",
    sessionStats: "Session stats",
    total: "Total",
    sessionHistoryBtn: "Session History Dekhein",
    noSessionSignals: "Abhi tak koi session signal record nahi hua.",
    backtestRunning: "Backtest chal raha hai…",
    trades: "Trades",
    wins: "Wins",
    losses: "Losses",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalExecuted: "Total Executed",
    breakEven: "Break-Even",
    inFlight: "In-Flight",
    noClosed: "— (abhi koi closed signal nahi)",
    noSignals: "Abhi tak koi signal record nahi hua.",
    cutoff: "Cutoff",
    qualifying: "Qualifying setups",
    simWinRate: "Simulated Win Rate",
    allOutcomes: "Sab outcomes",
    allEngines: "Sab engines",
    mainTerminal: "Main Terminal",
    smcEngine: "SMC Engine",
    sessionEngine: "Session Engine",
    newsIntel: "News Intelligence",
    username: "Username",
    role: "Role",
    plan: "Plan",
    planExpiry: "Plan ki expiry",
    daysLeft: "din baqi hain",
    lifetimeNever: "Lifetime — kabhi khatam nahi hota",
    managePlan: "Plan badalna ho to admin se rabta karein",
    signals: "Signals",
    engines: "Engines",
    engineOffNote: "OFF wala engine asal me band ho jata hai — uske signals nahi bante. Test Push sirf app ke andar test message hai, asal push notification nahi.",
    testPushBtn: "Test Push (in-app test)",
    testPushMsg: "Test push (in-app): ye sirf test hai, asal push notification nahi.",
    historyTabText: "History tab me tamam signals hain.",
    openHistory: "History Kholein",
    tfLoading: "TF Matrix load ho raha hai…",
    exportText: "Signals CSV me download karein.",
    exportBtn: "Export CSV",
    backupBtn: "⬇️ Backup Download Karein",
    backupWorking: "Backup tayyar ho raha hai…",
    backupDone: "Backup download ho gaya.",
    aiTitle: "AI Agent — in-app only.",
    aiText: "Ye koi live AI service nahi hai, sirf app ke andar ka helper hai.",
    aiAsk: "Poochein",
    defaultPair: "Default pair",
    saved: "Save ho gaya.",
    totalBuyers: "Total buyers",
    expired: "Expired",
    bandHai: "Band hai",
    active: "Active",
    lifetime: "Lifetime",
    expiry: "Expiry",
    extend30: "+30 din",
    suspend: "Band karna",
    reopen: "Kholna",
    changePass: "Password badlein",
    delete: "Delete",
    noBuyers: "Abhi koi buyer nahi hai.",
    buyerCreated: "Buyer ban gaya",
    passChanged: "Password badal gaya.",
    ownPassTitle: "Apna password badlein",
    phNewPass: "Naya password (kam se kam 6 harf)",
    phConfirmPass: "Password dobara likhein",
    passTooShort: "Password kam se kam 6 harf ka ho",
    passMismatch: "Dono password aik jaise nahi hain",
    saveBtn: "Save karein",
    cancelBtn: "Cancel karein",
    newPassPrompt: "Naya password (kam se kam 6 harf):",
    deleteConfirm: "ko delete karein?",
    serverUnreachable: "Server se rabta nahi ho raha:",
    priceLoadFail: "Price load nahi hui:",
    signalLoadFail: "Signal load nahi hua:",
    indLoadFail: "Indicators load nahi hue:",
    indNoData: "Indicators ke liye candles nahi milin.",
    smcLoadFail: "SMC load nahi hua:",
    smcNoData: "SMC data nahi mila.",
    scannerFail: "Scanner load nahi hua:",
    sessionLoadFail: "Session load nahi hua:",
    newsFail: "News abhi nahi mil rahi — thodi der baad dobara koshish karein.",
    newsFallbackNote: "Ek feed band hai — jo headlines dikh rahi hain wo chalti hui feed se hain",
    newsUpdated: "Updated",
    newSignal: "Naya Signal!",
    alertsNote: "Alerts sirf tab kaam karte hain jab site khuli ho — band tab ya band phone par nahi.",
    sound: "Sound",
    notifications: "Notifications",
    status: "Status",
    session: "Session",
    pktTime: "PKT Time",
    quality: "Quality",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Abhi tak koi SMC tasdeeq record nahi hui.",
    smcBacktestRunning: "SMC backtest chal raha hai…",
    termBacktestRunning: "Terminal backtest chal raha hai…",
    termBacktestNote: "Pichle 30 din, 1H candles — mustaqbil ki guarantee nahi. Baseline = Terminal engine (6 gates, 85% gate). Filters ne har pair par behtari nahi dikhai, is liye live engine me koi filter nahi lagaya gaya.",
    termBacktestBtn: "Terminal Backtest Chalayein",
    smcBacktestBtn: "SMC Backtest Chalayein (30 din)",
    smcBacktestNote: "Asal 15M candles par SMC rule (score 80%+) — koi banaya hua number nahi.",
    filter: "Filter",
    baseline: "Baseline",
    macdAgree: "MACD agree",
    noDeadHours: "No dead hours",
    chartNoData: "Chart ke liye candles nahi milin.",
    allSessions: "Tamam Sessions (PKT time)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Market Structure (BOS/MSS)",
    buyNow: "🟢 BUY KARO",
    sellNow: "🔴 SELL KARO",
    waitNoTrade: "⏳ WAIT — koi trade nahi",
    bannerLine: "Abhi ye trade karein — Entry, SL aur TP neeche diye gaye hain.",
    approaching: "APPROACHING — Kareeb aa raha hai",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Overview",
    engineControls: "Engine Controls",
    signalDetails: "Signal Details",
    signalHistory: "Signal History",
    tfMatrix: "TF Matrix",
    trackingLogs: "Tracking Logs",
    exportCsv: "Export CSV",
    aiAgent: "AI Agent",
    preferences: "Preferences",
    copySignal: "📋 Signal Copy Karein",
    downloadSignal: "⬇️ Picture Download Karein",
    copyDone: "Signal copy ho gaya",
    copyDoneBody: "Signal text copy ho gaya hai — WhatsApp ya Telegram par paste karein.",
    copyFailBody: "Copy nahi ho saka — text ko haath se select karke copy karein.",
    imgDone: "Picture download ho gayi",
    imgDoneBody: "Signal card picture download ho gayi hai.",
    imgFail: "Picture download nahi ho saki — dobara try karein.",
    shareDisclaimer: "Koi signal 100% profitable nahi hota.",
    close: "Band karein",
    scanNow: "🔍 Scan Now",
    scanning: "Scanning…",
    monitorEvery: "Har",
    stopMonitoring: "⏸ Stop",
    startMonitoring: "▶ Start",
    monitoringOff: "Monitoring band hai — Start dabayein",
    scanDone: "Scan ho gaya",
    scanDoneBody: "Saare pairs dobara scan ho gaye.",
    scanFailBody: "Scan nahi ho saka — dobara try karein.",
    bestTimeframe: "Best timeframe: 1H (4H bhi theek hai) — 15M sirf entry timing ke liye",
    signalCode: "Signal Code",
    validUntil: "Valid until",
    newSignalPopup: "Signal Aa Gaya Hai!",
    whyWait: "Why Wait? — WAIT kyun hai?",
    copyWaitAnalysis: "📋 WAIT Analysis Copy Karein",
    waitCopyDone: "WAIT analysis copy ho gaya",
    waitCopyDoneBody: "WAIT analysis copy ho gaya hai — WhatsApp ya Telegram par paste karein.",
    smcBelowGate: "SMC gate se kam hai",
    zoneBlockedReason: "Direction ke peeche koi proper zone nahi",
    shareCard: "📤 Share Card",
    downloadHighRes: "⬇️ Download High-Res PNG",
    copyImage: "🖼️ Copy Image",
    copyFormattedText: "📋 Copy Formatted Text",
    formattedPreview: "Formatted Text Preview (Telegram / WhatsApp)",
    imgCopyDone: "Picture copy ho gayi",
    imgCopyDoneBody: "Signal card picture clipboard par copy ho gayi hai.",
    imgCopyFail: "Picture copy nahi ho saki",
    imgCopyFailBody: "Is browser me picture copy supported nahi — Download use karein.",
    dcaNote: "DCA: TP1 par 50% profit lo, baaki ko TP2/TP3 tak chalne do.",
    breakevenNote: "Breakeven: TP1 ke baad SL ko entry par le jao.",
    stepSignal: "Signal mila",
    stepEntry: "Entry zone",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade band",
    progression: "Progression",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    tpStatusLbl: "TP Status",
    beLbl: "Break-Even",
    beActive: "Active",
    beNotYet: "Abhi nahi",
    dcaLbl: "DCA Entry",
    dcaNotActive: "Not Activated",
    monLbl: "Monitoring",
    sentimentWave: "Sentiment Wave — computed (prediction nahi)",
    sentimentWaveNote: "Ye sentiment asal RSI, trend aur zones se hisaab hota hai — ye koi prediction nahi hai.",
    demandIndex: "Demand Index",
    supplyIndex: "Supply Index",
    zoneCorridor: "Zone Corridor",
    histDetails: "Signal Details (recorded)",
    gatesNotSaved: "Gate details is signal ke liye save nahi hui.",
    detailsBtn: "Details",
    pivotTitle: "Pivot Points (pichla din)",
    zonesTitle: "Gold Buy/Sell Zones",
    zonesBanner: "YE SIGNAL NAHI HAI — sirf zones dikhata hai",
    zonesText: "Ye zones asal 1H candles se bante hain — pivot + impulse (1.0 x ATR) wale rules, wahi jo TradingView zones indicator mein hain. Sirf Gold (XAUUSD) ke liye. Trade sirf Terminal signal par lein.",
    zonesBuy: "BUY Zone",
    zonesSell: "SELL Zone",
    zonesFresh: "Fresh",
    zonesTested: "Tested",
    zonesNearestBuy: "Qareebi BUY Zone",
    zonesNearestSell: "Qareebi SELL Zone",
    zonesStatus: "Status",
    zonesPrice: "Price (1H close)",
    zonesNone: "Abhi koi zone nahi bana.",
    zonesInBuy: "Price BUY zone ke andar hai",
    zonesInSell: "Price SELL zone ke andar hai",
    zonesNearBuy: "Price BUY zone ke qareeb hai",
    zonesNearSell: "Price SELL zone ke qareeb hai",
    zonesBetween: "Price zones ke beech mein hai",
    panelTitle: "Trend Panel",
    panelBanner: "YE SIGNAL NAHI HAI — sirf trend dikhata hai",
    panelText: "Ye panel asal candles se 15m/30m/1H/4H/D ka EMA 20/50 trend dikhata hai — wahi hisaab jo TradingView wale Trend Panel mein hai. Trade sirf Terminal signal par lein.",
    panelBullish: "Bullish",
    panelBearish: "Bearish",
    panelMixed: "Mixed",
    panelOverall: "Overall",
    panelBuy: "BUY",
    panelSell: "SELL",
    panelWait: "WAIT",
    tvTitle: "TradingView Chart",
    tvNote: "Ye TradingView ka live chart hai — aap ke Pine wale zones/strategy is chart ke andar nahi dikhte. Wo website ke apne Zones + Trend Panel mein dikhte hain (upar).",
    tvOpenBtn: "TradingView par apna chart kholein",
    tvLoadFail: "TradingView chart load nahi hua — neeche wale button se apna chart kholein.",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed abhi nahi mil saka.",
    riskProfile: "Risk Profile",
    riskConservative: "Conservative",
    riskModerate: "Moderate",
    riskAggressive: "Aggressive",
    riskConsText: "Sirf high-confluence signals — har trade par 1% risk",
    riskModText: "Standard — har trade par 1% risk",
    riskAggText: "Zyada risk — har trade par 2% tak, drawdown zyada ho sakta hai",
    riskProfileLine: "Aapka risk profile",
    timezone: "Timezone",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    language: "Language",
    prefPair: "Preferred Pair",
    engineStatus: "Engine Status",
    prefSaved: "Preferences save ho gayin.",
    guideTitle: "Trade Kaise Lein? — 4 Asan Steps",
    guideStep1: "Sirf BUY ya SELL signal par trade lein — WAIT par koi trade nahi.",
    guideStep2: "Entry, SL aur TP card par likhe hain — SL se zyada risk nahi lena.",
    guideStep3: "Confirmation card par hi hai: score gate se upar hai, aur neeche \"Ye trade kyun?\" wali wajah likhi hai.",
    guideStep4: "Best timeframe 1H hai (4H bhi theek hai) — 15M sirf entry timing ke liye hai.",
    whyTradeTitle: "Ye trade kyun? — Confirmation",
    whyTrend: "Trend is taraf hai",
    whyZone: "Price trade zone me hai",
    whyZoneNear: "Price trade zone ke qareeb hai",
    whySmcHigh: "SMC score 80+ hai — smart money bhi is taraf hai",
    whyTopGate: "Sab se mazboot check",
    oneTradeLabel: "Aik waqt par sirf aik trade",
    oneTradeNote: "Aik waqt par sirf aik trade — dosri direction ka setup nahi dikhaya jata.",
    gatesExplain: "6 checks, 100 number — signal sirf 85+ par banta hai (jaise exam mein pass marks).",
    smcExplain: "5 hisse, 100 number — 80+ par theek hai (mazboot tasdeeq).",
    gateLblTrendUp: "Trend upar hai (EMA)",
    gateLblTrendDown: "Trend neeche hai (EMA)",
    gateLblStructure: "Structure mazboot hai",
    gateLblRsi: "RSI theek range me hai",
    gateLblRr: "Reward risk se zyada hai",
    gateLblEma200: "Bara trend (EMA200) saath hai",
    gateLblFresh: "Data taaza hai",
    smcLblSweep: "Liquidity sweep hua",
    smcLblStructure: "Market structure badla",
    smcLblOb: "Order block mila",
    smcLblFvg: "FVG gap mila",
    smcLblRr: "Risk/reward theek hai",
    chkLblSweep: "Bade players ne liquidity li",
    chkLblOb: "Bade players ka zone",
    chkLblFvg: "Price me khaali jagah (gap)",
    chkLblSr: "Mazboot support/resistance level",
    chkLblZones: "Khareedne/bechne ka area",
    extLblCandle: "Candle se trend ka ishara",
    extLblChoch: "Trend badalne ka ishara",
    extLblMss: "Naya trend confirm hua",
    extLblBreaker: "Pehle ka level ab support/resistance",
    extLblIdm: "Jhooti move ke baad wapas",
    extLblFib: "Fibonacci level (hisaab se)",
    extLblBb: "Volatility squeeze",
    extLblMacdDiv: "MACD aur price me farq",
    extLblMeanRev: "Price mean se kitna door hai",
    extLblKillzone: "Session ka active time",
    extLblAsian: "Asian session ki range",
    extLblVwap: "VWAP bands (average price)",
    extLblVol: "Volume — kitna trade hua",
    smcNoSignalBanner: "SMC signal NAHI deta — ye Terminal signal ki tasdeeq (confirmation) hai.",
    smcConfirmStrong: "Mazboot tasdeeq ✓",
    smcConfirmWeak: "Tasdeeq kamzor hai — 80+ par mazboot hoti hai",
    notASignalNote: "Ye signal nahi hai — trade sirf Terminal signal par lein.",
    confirmationLbl: "Tasdeeq",
    smcEngineHeader: "SMC ENGINE • ACTIVE",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · 15M Macro & 5M Entry",
    smcSetupQuality: "Setup Quality",
    smcGradeStrong: "A · Strong — Mazboot",
    smcGradeModerate: "B · Moderate — Darmiyani",
    smcGradeDeveloping: "C · Developing — Ban raha hai",
    smcGradeWeak: "D · Weak — Kamzor",
    smcWaiting80: "80% confirmation ka intezar hai",
    smcConfirmed80: "80% confirmation mil gaya — Terminal signal ki tasdeeq mazboot hai",
    smcBias: "SMC Bias (15M)",
    smcBiasBullish: "Bullish",
    smcBiasBearish: "Bearish",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Live move (entry se)",
    smcGenerated: "Generated",
    smcBeTip: "Break Even tip: +100 pips profit ke baad SL ko Entry par le jayein — sirf mashwara hai, auto nahi hota.",
    smcFeedNote: "Ye sirf tasdeeq hai — is par trade na lein, Terminal signal ka intezar karein.",
    perfNoteTerminal: "Win rate sirf Terminal signals se banta hai — SMC/Session is me nahi gin-te.",
    smcTpNote: "TP2/TP3: sirf TP1/SL ka nateeja record hota hai.",
    smcInspectChart: "Inspect Chart",
    tgTitle: "Telegram Alerts — Signal Phone Par",
    tgText: "BUY/SELL signal aate hi aap ke phone par Telegram message aa jaye ga — website band ho tab bhi. Neeche wala link kholein aur bot par Start dabayein.",
    tgButton: "📲 Telegram par Alerts Lein",
    tgPersonalTitle: "Aap ka Personal Telegram Link",
    tgPersonalText: "Ye link sirf aap ka hai — is se alerts aap ke account se jurte hain. Link kholein, bot par Start dabayein, bas! Plan khatam ya band hone par alerts ruk jayein ge.",
    tgLinked: "✅ Telegram alerts ON hain — signal aate hi message mile ga.",
    tgNotLinked: "Abhi Telegram alerts ON nahi hain — link khol kar Start dabayein.",
    tgCopyLink: "Link Copy Karein",
    tgLinkCopied: "Aap ka personal Telegram link copy ho gaya — bot par Start dabayein.",
    pushTitle: "Browser Notifications — Site Band Ho Tab Bhi",
    pushText: "Signal aate hi aap ke browser me notification aa jaye ga — website khuli ho ya band. iPhone par site ko Home Screen par add karna hoga. Notification ki awaz phone ki default sound hoti hai.",
    pushOn: "✅ Browser notifications ON hain — signal aate hi notification mile ga.",
    pushOff: "Browser notifications abhi ON nahi hain.",
    pushEnableBtn: "🔔 Browser Notifications ON Karein",
    pushDisableBtn: "Notifications Band Karein",
    pushDenied: "Browser ne permission nahi di — browser ki site settings se Allow karein.",
    pushUnsupported: "Aap ka browser Web Push support nahi karta.",
    pushEnabledMsg: "Browser notifications ON ho gayi hain.",
    pushDisabledMsg: "Browser notifications band kar di gayi hain.",
    pushPairsTitle: "Kaun Se Pairs Ki Notifications?",
    pushPairsText: "Ye pasand Telegram aur Browser dono notifications par lagti hai — band pair ka signal aaye to koi notification nahi aaye gi.",
    pushPairsSaved: "Pairs ki pasand save ho gayi.",
    marketCards: "Live Market",
    pcMarketPrice: "Market Price (Last)",
    pcChange24h: "Daily / 24H Change",
    pcSpread: "Spread",
    pcKeyLevels: "Historical Key Levels",
    pcSources: "Sources",
    liveMarketPrice: "LIVE MARKET PRICE",
    awaitingConf: "AWAITING CONFLUENCE",
    scanningMarket: "Market scan ho raha hai — 85% confluence ka intezar",
    confirmedTitle: "CONFIRMED INDICATORS",
    passedLbl: "PASSED",
    awaitingTitle: "AWAITING CONFIRMATION",
    pendingLbl: "PENDING",
    needsGate: "NEEDS 85%",
    requiredTitle: "REQUIRED BEFORE BUY OR SELL",
    requiredBuy: "FOR BUY CONFIRMATION",
    requiredSell: "FOR SELL CONFIRMATION",
    reqBuyTpl: "Bullish bounce off {a} — price reclaiming {b}",
    reqSellTpl: "Bearish rejection off {a} — price losing {b}",
    analyzeNow: "ANALYZE MARKET NOW",
    inspectInd: "INSPECT INDICATORS",
    downloadCard: "DOWNLOAD CARD",
    liveTick: "Real-time Tick Synced",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIDENCE",
    htfLbl: "Higher Timeframe Alignment",
    adxRanging: "20 se kam — trend nahi (ranging)",
    adxTrend: "20 ya zyada — trend mazboot hai",
    smcConfirmLbl: "SMC Confirmation",
    rsiNeedBuy: "BUY ko 50–70 chahiye",
    rsiNeedSell: "SELL ko 30–50 chahiye",
    rrNeed: "R:R 1.5 chahiye",
    bannerTerminal: "SIGNAL SIRF YAHAN SE — BUY/SELL card par trade lein",
    bannerSmc: "YE SIGNAL NAHI HAI — sirf tasdeeq (confirmation) hai",
    bannerSession: "YE SIRF WAQT BATATA HAI — signal nahi deta",
    bannerHistory: "YE PURANE SIGNALS HAIN — in par trade na lein, sirf nateeje dekhein",
    bannerScanner: "YE SIRF DHOONDTA HAI — signal Terminal mein banta hai"
  },
  en: {
    tagline: "Live signals for Gold, Bitcoin and Forex",
    setupTitle: "First-Time Setup",
    setupText: "Create your own Admin username and password. Never send your password to anyone — only you should know it.",
    setupBtn: "Create Admin Account",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "No signal is 100% profitable. Practice on demo first, do not risk real money in a hurry.",
    logout: "Logout",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    lastUpdate: "Last update",
    secAgo: "sec ago",
    tabTerminal: "Terminal",
    tabIndicators: "Indicators",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "History",
    tabAccount: "Account",
    tabAdmin: "Admin",
    howSignalTitle: "When and How Is a Signal Made?",
    howSignalText1: "There is no fixed time for a signal. BUY/SELL only forms when 85% or more points are scored across the 6 gates. WAIT means: do not trade now, the conditions are not met.",
    howSignalText2: "The SMC gate is separate (80%) — see the SMC tab. The Terminal signal does not wait on the SMC gate.",
    tfHint: "Best timeframe: 1H (with the 4H trend) — signals are most reliable on 1H/4H; 15M is only for entry timing and 5M is too noisy. (90-day backtest, 4 pairs: win rate ~60%, profit factor ~1.00 — breakeven, a past result, not a guarantee.)",
    rareSignals: "Signals are rare but higher quality — BUY/SELL only shows when the 85% gate passes. More signals does not mean better results.",
    allPairsTitle: "All Pairs — Live Prices",
    indCenterTitle: "Indicators Center",
    indCenterText: "All these numbers are calculated from real Kraken candles — EMA 20/50 shows trend, RSI 14 shows momentum, and ATR 14 shows how much price usually moves.",
    indTfNote: "Values below are 1H timeframe — 15M and Daily are listed separately below",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC levels come from real 15M candle swing highs/lows — where big buyers and sellers usually wait. The SMC score is 5 parts × 20 points, gate 80%. Terminal BUY/SELL does not come from this tab; it uses the Terminal’s own 85% conditions.",
    scannerTitle: "Global Market Scanner (11 pairs, every 45 seconds)",
    smcPairCardsTitle: "SMC Confirmation — Every Pair",
    sessionTitle: "Session Engine",
    backtestTitle: "Session Backtest Simulator",
    backtestText: "Run the session rule on real 1H candles.",
    backtestBtn: "Run Backtest (30 days)",
    historyTitle: "Signal History",
    historyText: "Only actually recorded signals are shown — no past history was invented. The result (Win/Loss/Break-Even/In-Flight) is checked against later candles.",
    refinerTitle: "Strategy Refiner",
    refinerText: "The cutoff only applies to signals recorded after this build, because older signals did not save a gate score.",
    marketClosedTitle: "Market Closed",
    marketClosedText: "The forex and gold market is closed on Saturday and Sunday — no new signal will form for this pair. The price shown here is the last available, not live.",
    marketClosedShort: "Market closed — last available price",
    accountTitle: "Account",
    adminTitle: "Admin Panel — Buyer Accounts",
    adminPlansText: "Monthly 30 days · Quarterly 90 days · Yearly 365 days · Lifetime (never expires). When a plan ends, the buyer login locks automatically.",
    createBuyerBtn: "Create Buyer",
    newsTitle: "Fundamental News",
    newsText: "Latest forex/market headlines — from the free FXStreet and ForexLive RSS feeds.",
    chartTitle: "Price Chart — Candles + EMA 20/50/200",
    indStripTitle: "Live Indicators",
    smcMacroTitle: "15M Macro",
    smcMicroTitle: "5M Micro",
    smcFeedTitle: "SMC Confirmation Feed — confirmation, not a signal",
    smcBacktestTitle: "SMC Backtest",
    termBacktestTitle: "Terminal Backtest (30 days)",
    phSetupUser: "Admin username (at least 3 characters)",
    phSetupPass: "Admin password (at least 6 characters)",
    phLoginUser: "Username",
    phLoginPass: "Password",
    phBuyerUser: "Buyer username",
    phBuyerPass: "Buyer password",
    phAiQ: "Ask a question, e.g.: when is a signal made?",
    hello: "Hello",
    loading: "Loading…",
    noTrade: "(no trade)",
    price: "Price",
    confluence: "Confluence",
    gate: "gate",
    buySellPlans: "BUY and SELL plans — both together",
    signalPlan: "Signal Plan — one direction, one trade",
    smcChecklist: "SMC Confluence Checklist — why this signal",
    oppScenario: "Opposite scenario",
    oppGateNotMet: "gate not met",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zones (Demand / Supply)",
    chkYes: "✓ Supports",
    chkNo: "✗ Does not support",
    chkNa: "– Neutral",
    noSweep: "No sweep",
    noObDir: "No order block in this direction",
    noFvgDir: "No FVG in this direction",
    inDemand: "Price is in the demand zone",
    inSupply: "Price is in the supply zone",
    nearDemand: "Price is near the demand zone",
    nearSupply: "Price is near the supply zone",
    noZone: "Price is in no zone",
    tradeZone: "Trade Zone",
    inZone: "IN ZONE",
    nearZone: "Price is near the zone",
    farZone: "Price is away from the zone",
    noZoneDir: "No zone found for this direction",
    bosUp: "Structure broke up (BOS) — bullish",
    bosDown: "Structure broke down (BOS) — bearish",
    noBreak: "No structure break — level held",
    extTitle: "Extended Confluence — from 1H candles",
    extNote: "All of these are confluence only — they do not change the signal direction or the gates (85%/80%).",
    chkCandle: "Candlestick Pattern (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Breaker / Mitigation Blocks",
    chkIdm: "IDM (Inducement)",
    chkFib: "Fibonacci Levels",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "MACD Divergence",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Session Timing",
    chkAsian: "Asian Session Range",
    chkVwap: "VWAP Bands (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullish)",
    patShootingStar: "Shooting Star (bearish)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Morning Star (bullish)",
    patEveningStar: "Evening Star (bearish)",
    noPattern: "No clear pattern",
    chochUp: "CHOCH up — break against the trend",
    chochDown: "CHOCH down — break against the trend",
    noChoch: "No CHOCH",
    mssUp: "MSS up — new trend confirmed",
    mssDown: "MSS down — new trend confirmed",
    noMss: "No MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "No breaker/mitigation block",
    idmSsl: "IDM found — SSL sweep then reclaim (bullish)",
    idmBsl: "IDM found — BSL sweep then reclaim (bearish)",
    noIdm: "No IDM",
    fibNearest: "Nearest level",
    squeezeOn: "Squeeze — volatility is low, a big move may come",
    squeezeOff: "No squeeze",
    meanNear: "Near the mean",
    meanExtended: "Extended from the mean",
    meanOver: "Very overextended",
    aboveMean: "above the mean",
    belowMean: "below the mean",
    macdBullDiv: "Bullish divergence — price lower, MACD higher",
    macdBearDiv: "Bearish divergence — price higher, MACD lower",
    noMacdDiv: "No MACD divergence",
    killActive: "Active killzone",
    killNext: "Next killzone",
    kzAsian: "Asian",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Price is inside the range",
    asianAbove: "Price expanded above the range",
    asianBelow: "Price expanded below the range",
    noAsian: "No Asian range",
    vwapNearest: "Nearest band",
    volRising: "Volume rising",
    volFalling: "Volume falling",
    volNormal: "Volume normal",
    volNa: "No volume available for this pair",
    dxyTitle: "Dollar Index (DXY)",
    dxyNa: "DXY is not available right now — not received from Yahoo",
    corrLabel: "Correlation (20-period)",
    corrNeg: "negative",
    corrPos: "positive",
    corrFlat: "weak",
    riskTitle: "Risk Management — guidance (not live trade management)",
    riskRrTarget: "Target R:R 1:2 — reached at TP3",
    riskTp1: "At TP1 take 50% profit, then move SL to breakeven (entry).",
    riskSize: "Position size: risk only 1% of your account per trade.",
    riskDd: "Drawdown control: never risk more than 1% on one trade — keep losses small.",
    sentiment: "24H Sentiment",
    demandZone: "Demand Zone",
    supplyZone: "Supply Zone",
    liveComments: "Live Comments",
    nextCheck: "Next check in",
    nextCheckSuffix: "s (30-second monitoring)",
    signalUpdated: "Signal updated",
    buyGates: "BUY Gates",
    sellGates: "SELL Gates",
    entryZone: "Entry Zone",
    trigger: "Trigger",
    scorecard: "Scorecard",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatility",
    volume: "Volume",
    structure: "Structure",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M and Daily",
    smcScore: "SMC Score",
    gatePass: "Gate passed!",
    gateNotMet: "gate not met",
    swingLevels: "Swing Levels",
    swingHigh: "Last Swing High",
    swingLow: "Last Swing Low",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "Bullish OB",
    bearOB: "Bearish OB",
    fresh: "fresh",
    mitigated: "mitigated",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "No FVG found.",
    microSweeps: "5M Micro SSL sweeps",
    liqPools: "Liquidity pools",
    pair: "Pair",
    direction: "Direction",
    confirmedSignals: "SMC confirmations",
    cycleEvery: "Cycle: every",
    cycleSec: "seconds",
    sessionActive: "Active",
    nowPkt: "Current PKT time",
    nextSession: "Next session",
    minutes: "minutes",
    newsBlackout: "News blackout",
    notAvailable: "Not available",
    sessionStats: "Session stats",
    total: "Total",
    sessionHistoryBtn: "View Session History",
    noSessionSignals: "No session signal recorded yet.",
    backtestRunning: "Backtest running…",
    trades: "Trades",
    wins: "Wins",
    losses: "Losses",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalExecuted: "Total Executed",
    breakEven: "Break-Even",
    inFlight: "In-Flight",
    noClosed: "— (no closed signal yet)",
    noSignals: "No signal recorded yet.",
    cutoff: "Cutoff",
    qualifying: "Qualifying setups",
    simWinRate: "Simulated Win Rate",
    allOutcomes: "All outcomes",
    allEngines: "All engines",
    mainTerminal: "Main Terminal",
    smcEngine: "SMC Engine",
    sessionEngine: "Session Engine",
    newsIntel: "News Intelligence",
    username: "Username",
    role: "Role",
    plan: "Plan",
    planExpiry: "Plan expiry",
    daysLeft: "days left",
    lifetimeNever: "Lifetime — never expires",
    managePlan: "To change your plan, contact the admin",
    signals: "Signals",
    engines: "Engines",
    engineOffNote: "An OFF engine is really turned off — it makes no signals. Test Push is only an in-app test message, not a real push notification.",
    testPushBtn: "Test Push (in-app test)",
    testPushMsg: "Test push (in-app): this is only a test, not a real push notification.",
    historyTabText: "All signals are in the History tab.",
    openHistory: "Open History",
    tfLoading: "Loading TF Matrix…",
    exportText: "Download signals as CSV.",
    exportBtn: "Export CSV",
    backupBtn: "⬇️ Download Backup",
    backupWorking: "Preparing backup…",
    backupDone: "Backup downloaded.",
    aiTitle: "AI Agent — in-app only.",
    aiText: "This is not a live AI service, only a helper inside the app.",
    aiAsk: "Ask",
    defaultPair: "Default pair",
    saved: "Saved.",
    totalBuyers: "Total buyers",
    expired: "Expired",
    bandHai: "Suspended",
    active: "Active",
    lifetime: "Lifetime",
    expiry: "Expiry",
    extend30: "+30 days",
    suspend: "Suspend",
    reopen: "Reopen",
    changePass: "Change password",
    delete: "Delete",
    noBuyers: "No buyers yet.",
    buyerCreated: "Buyer created",
    passChanged: "Password changed.",
    ownPassTitle: "Change your password",
    phNewPass: "New password (at least 6 characters)",
    phConfirmPass: "Type the password again",
    passTooShort: "Password must be at least 6 characters",
    passMismatch: "The two passwords do not match",
    saveBtn: "Save",
    cancelBtn: "Cancel",
    newPassPrompt: "New password (at least 6 characters):",
    deleteConfirm: " — delete this user?",
    serverUnreachable: "Cannot reach server:",
    priceLoadFail: "Prices did not load:",
    signalLoadFail: "Signal did not load:",
    indLoadFail: "Indicators did not load:",
    indNoData: "No candles available for indicators.",
    smcLoadFail: "SMC did not load:",
    smcNoData: "No SMC data.",
    scannerFail: "Scanner did not load:",
    sessionLoadFail: "Session did not load:",
    newsFail: "News is not available right now — please try again shortly.",
    newsFallbackNote: "One feed is down — headlines shown are from the working feed",
    newsUpdated: "Updated",
    newSignal: "New Signal!",
    alertsNote: "Alerts only work while this site is open — not on a closed tab or phone.",
    sound: "Sound",
    notifications: "Notifications",
    status: "Status",
    session: "Session",
    pktTime: "PKT Time",
    quality: "Quality",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "No SMC confirmation recorded yet.",
    smcBacktestRunning: "SMC backtest running…",
    termBacktestRunning: "Terminal backtest running…",
    termBacktestNote: "Past 30 days, 1H candles — not a promise of future results. Baseline = Terminal engine (6 gates, 85% gate). The filters did not improve every pair, so no filter was added to the live engine.",
    termBacktestBtn: "Run Terminal Backtest",
    smcBacktestBtn: "Run SMC Backtest (30 days)",
    smcBacktestNote: "SMC rule (score 80%+) on real 15M candles — no invented numbers.",
    filter: "Filter",
    baseline: "Baseline",
    macdAgree: "MACD agree",
    noDeadHours: "No dead hours",
    chartNoData: "No candles available for the chart.",
    allSessions: "All Sessions (PKT time)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Market Structure (BOS/MSS)",
    buyNow: "🟢 BUY NOW",
    sellNow: "🔴 SELL NOW",
    waitNoTrade: "⏳ WAIT — no trade",
    bannerLine: "Take this trade now — Entry, SL and TP are given below.",
    approaching: "APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Overview",
    engineControls: "Engine Controls",
    signalDetails: "Signal Details",
    signalHistory: "Signal History",
    tfMatrix: "TF Matrix",
    trackingLogs: "Tracking Logs",
    exportCsv: "Export CSV",
    aiAgent: "AI Agent",
    preferences: "Preferences",
    copySignal: "📋 Copy Signal",
    downloadSignal: "⬇️ Download Image",
    copyDone: "Signal copied",
    copyDoneBody: "Signal text copied — paste it on WhatsApp or Telegram.",
    copyFailBody: "Could not copy — please select the text manually.",
    imgDone: "Image downloaded",
    imgDoneBody: "Signal card image downloaded.",
    imgFail: "Image download failed — please try again.",
    shareDisclaimer: "No signal is 100% profitable.",
    close: "Close",
    scanNow: "🔍 Scan Now",
    scanning: "Scanning…",
    monitorEvery: "Every",
    stopMonitoring: "⏸ Stop",
    startMonitoring: "▶ Start",
    monitoringOff: "Monitoring is off — press Start",
    scanDone: "Scan complete",
    scanDoneBody: "All pairs were rescanned.",
    scanFailBody: "Scan failed — please try again.",
    bestTimeframe: "Best timeframe: 1H (4H also works) — 15M is only for entry timing",
    signalCode: "Signal Code",
    validUntil: "Valid until",
    newSignalPopup: "New Signal!",
    whyWait: "Why Wait?",
    copyWaitAnalysis: "📋 Copy WAIT Analysis",
    waitCopyDone: "WAIT analysis copied",
    waitCopyDoneBody: "WAIT analysis copied — paste it on WhatsApp or Telegram.",
    smcBelowGate: "SMC is below its gate",
    zoneBlockedReason: "No proper zone behind this direction",
    shareCard: "📤 Share Card",
    downloadHighRes: "⬇️ Download High-Res PNG",
    copyImage: "🖼️ Copy Image",
    copyFormattedText: "📋 Copy Formatted Text",
    formattedPreview: "Formatted Text Preview (Telegram / WhatsApp)",
    imgCopyDone: "Image copied",
    imgCopyDoneBody: "Signal card image copied to the clipboard.",
    imgCopyFail: "Could not copy image",
    imgCopyFailBody: "Image copy is not supported in this browser — use Download.",
    dcaNote: "DCA: take 50% profit at TP1, let the rest run to TP2/TP3.",
    breakevenNote: "Breakeven: after TP1, move SL to entry.",
    stepSignal: "Signal",
    stepEntry: "Entry zone",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade closed",
    progression: "Progression",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    tpStatusLbl: "TP Status",
    beLbl: "Break-Even",
    beActive: "Active",
    beNotYet: "Not yet",
    dcaLbl: "DCA Entry",
    dcaNotActive: "Not Activated",
    monLbl: "Monitoring",
    sentimentWave: "Sentiment Wave — computed (not a prediction)",
    sentimentWaveNote: "This sentiment is calculated from real RSI, trend and zones — it is not a prediction.",
    demandIndex: "Demand Index",
    supplyIndex: "Supply Index",
    zoneCorridor: "Zone Corridor",
    histDetails: "Signal Details (recorded)",
    gatesNotSaved: "Gate details were not saved for this signal.",
    detailsBtn: "Details",
    pivotTitle: "Pivot Points (previous day)",
    zonesTitle: "Gold Buy/Sell Zones",
    zonesBanner: "NOT A SIGNAL — zones display only",
    zonesText: "These zones are built from real 1H candles — pivot + impulse (1.0 x ATR) rules, the same as the TradingView zones indicator. Gold (XAUUSD) only. Take trades only on Terminal signals.",
    zonesBuy: "BUY Zone",
    zonesSell: "SELL Zone",
    zonesFresh: "Fresh",
    zonesTested: "Tested",
    zonesNearestBuy: "Nearest BUY Zone",
    zonesNearestSell: "Nearest SELL Zone",
    zonesStatus: "Status",
    zonesPrice: "Price (1H close)",
    zonesNone: "No zone formed yet.",
    zonesInBuy: "Price is inside a BUY zone",
    zonesInSell: "Price is inside a SELL zone",
    zonesNearBuy: "Price is near a BUY zone",
    zonesNearSell: "Price is near a SELL zone",
    zonesBetween: "Price is between zones",
    panelTitle: "Trend Panel",
    panelBanner: "NOT A SIGNAL — trend display only",
    panelText: "This panel shows the EMA 20/50 trend on 15m/30m/1H/4H/D from real candles — the same logic as the TradingView Trend Panel. Take trades only on Terminal signals.",
    panelBullish: "Bullish",
    panelBearish: "Bearish",
    panelMixed: "Mixed",
    panelOverall: "Overall",
    panelBuy: "BUY",
    panelSell: "SELL",
    panelWait: "WAIT",
    tvTitle: "TradingView Chart",
    tvNote: "This is TradingView's live chart — your Pine zones/strategy do not appear inside it. They appear in the website's own Zones + Trend Panel above.",
    tvOpenBtn: "Open my chart on TradingView",
    tvLoadFail: "TradingView chart did not load — open your chart with the button below.",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed is not available right now.",
    riskProfile: "Risk Profile",
    riskConservative: "Conservative",
    riskModerate: "Moderate",
    riskAggressive: "Aggressive",
    riskConsText: "Only high-confluence signals — risk 1% per trade",
    riskModText: "Standard — risk 1% per trade",
    riskAggText: "Higher risk — up to 2% per trade, drawdown can be bigger",
    riskProfileLine: "Your risk profile",
    timezone: "Timezone",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    language: "Language",
    prefPair: "Preferred Pair",
    engineStatus: "Engine Status",
    prefSaved: "Preferences saved.",
    guideTitle: "How to Take a Trade? — 4 Easy Steps",
    guideStep1: "Only trade on a BUY or SELL signal — never trade on WAIT.",
    guideStep2: "Entry, SL and TP are written on the card — never risk more than the SL.",
    guideStep3: "The confirmation is on the card itself: the score is above the gate, and the reasons are listed under \"Why this trade?\" below.",
    guideStep4: "The best timeframe is 1H (4H also works) — 15M is only for entry timing.",
    whyTradeTitle: "Why this trade? — Confirmation",
    whyTrend: "Trend is on this side",
    whyZone: "Price is in the trade zone",
    whyZoneNear: "Price is near the trade zone",
    whySmcHigh: "SMC score is 80+ — smart money agrees",
    whyTopGate: "Strongest check",
    oneTradeLabel: "Only one trade at a time",
    oneTradeNote: "Only one trade at a time — the other direction’s setup is not shown.",
    gatesExplain: "6 checks, 100 points — a signal only forms at 85+ (like pass marks in an exam).",
    smcExplain: "5 parts, 100 points — 80+ is good (strong confirmation).",
    gateLblTrendUp: "Trend is up (EMA)",
    gateLblTrendDown: "Trend is down (EMA)",
    gateLblStructure: "Structure is strong",
    gateLblRsi: "RSI is in a healthy range",
    gateLblRr: "Reward is bigger than risk",
    gateLblEma200: "Big trend (EMA200) agrees",
    gateLblFresh: "Data is fresh",
    smcLblSweep: "Liquidity was swept",
    smcLblStructure: "Market structure shifted",
    smcLblOb: "Order block found",
    smcLblFvg: "FVG gap found",
    smcLblRr: "Risk/reward is fine",
    chkLblSweep: "Big players took liquidity",
    chkLblOb: "Big players’ zone",
    chkLblFvg: "Empty gap in price",
    chkLblSr: "Strong support/resistance level",
    chkLblZones: "Buy/sell area",
    extLblCandle: "Candle hints at the trend",
    extLblChoch: "Sign the trend may be changing",
    extLblMss: "New trend confirmed",
    extLblBreaker: "Old level is now support/resistance",
    extLblIdm: "Back after a false move",
    extLblFib: "Fibonacci level (calculated)",
    extLblBb: "Volatility squeeze",
    extLblMacdDiv: "MACD and price disagree",
    extLblMeanRev: "How far price is from the mean",
    extLblKillzone: "Active session time",
    extLblAsian: "Asian session range",
    extLblVwap: "VWAP bands (average price)",
    extLblVol: "Volume — how much was traded",
    smcNoSignalBanner: "SMC does NOT give signals — it is only confirmation for the Terminal signal.",
    smcConfirmStrong: "Strong confirmation ✓",
    smcConfirmWeak: "Confirmation is weak — strong at 80+",
    notASignalNote: "This is not a signal — trade only on the Terminal signal.",
    confirmationLbl: "Confirmation",
    smcEngineHeader: "SMC ENGINE • ACTIVE",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · 15M Macro & 5M Entry",
    smcSetupQuality: "Setup Quality",
    smcGradeStrong: "A · Strong",
    smcGradeModerate: "B · Moderate",
    smcGradeDeveloping: "C · Developing",
    smcGradeWeak: "D · Weak",
    smcWaiting80: "Waiting for 80% confirmation",
    smcConfirmed80: "80% confirmation reached — strong confirmation for the Terminal signal",
    smcBias: "SMC Bias (15M)",
    smcBiasBullish: "Bullish",
    smcBiasBearish: "Bearish",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Live move (from entry)",
    smcGenerated: "Generated",
    smcBeTip: "Break-even tip: after +100 pips profit, move SL to Entry — guidance only, not automatic.",
    smcFeedNote: "This is only confirmation — do not trade on it, wait for the Terminal signal.",
    perfNoteTerminal: "Win rate is computed from Terminal signals only — SMC/Session are not counted here.",
    smcTpNote: "TP2/TP3: only the TP1/SL outcome is recorded.",
    smcInspectChart: "Inspect Chart",
    tgTitle: "Telegram Alerts — Signals on Your Phone",
    tgText: "When a BUY/SELL signal appears, you get a Telegram message on your phone — even when the website is closed. Open the link below and press Start on the bot.",
    tgButton: "📲 Get Alerts on Telegram",
    tgPersonalTitle: "Your Personal Telegram Link",
    tgPersonalText: "This link is only yours — it links alerts to your account. Open the link, press Start on the bot, done! Alerts stop if your plan expires or is suspended.",
    tgLinked: "✅ Telegram alerts are ON — you will get a message when a signal appears.",
    tgNotLinked: "Telegram alerts are not ON yet — open the link and press Start.",
    tgCopyLink: "Copy Link",
    tgLinkCopied: "Your personal Telegram link is copied — press Start on the bot.",
    pushTitle: "Browser Notifications — Even When the Site Is Closed",
    pushText: "When a signal appears, you get a browser notification — whether the website is open or closed. On iPhone, add the site to your Home Screen first. The notification sound is your phone's default sound.",
    pushOn: "✅ Browser notifications are ON — you will get a notification when a signal appears.",
    pushOff: "Browser notifications are not ON yet.",
    pushEnableBtn: "🔔 Turn On Browser Notifications",
    pushDisableBtn: "Turn Off Notifications",
    pushDenied: "The browser did not give permission — Allow it from the browser's site settings.",
    pushUnsupported: "Your browser does not support Web Push.",
    pushEnabledMsg: "Browser notifications are ON.",
    pushDisabledMsg: "Browser notifications are off.",
    pushPairsTitle: "Which Pairs' Notifications?",
    pushPairsText: "This choice applies to both Telegram and Browser notifications — if a switched-off pair gives a signal, no notification will come.",
    pushPairsSaved: "Pair preference saved.",
    marketCards: "Live Market",
    pcMarketPrice: "Market Price (Last)",
    pcChange24h: "Daily / 24H Change",
    pcSpread: "Spread",
    pcKeyLevels: "Historical Key Levels",
    pcSources: "Sources",
    liveMarketPrice: "LIVE MARKET PRICE",
    awaitingConf: "AWAITING CONFLUENCE",
    scanningMarket: "Scanning market — awaiting 85% confluence",
    confirmedTitle: "CONFIRMED INDICATORS",
    passedLbl: "PASSED",
    awaitingTitle: "AWAITING CONFIRMATION",
    pendingLbl: "PENDING",
    needsGate: "NEEDS 85%",
    requiredTitle: "REQUIRED BEFORE BUY OR SELL",
    requiredBuy: "FOR BUY CONFIRMATION",
    requiredSell: "FOR SELL CONFIRMATION",
    reqBuyTpl: "Bullish bounce off {a} — price reclaiming {b}",
    reqSellTpl: "Bearish rejection off {a} — price losing {b}",
    analyzeNow: "ANALYZE MARKET NOW",
    inspectInd: "INSPECT INDICATORS",
    downloadCard: "DOWNLOAD CARD",
    liveTick: "Real-time Tick Synced",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIDENCE",
    htfLbl: "Higher Timeframe Alignment",
    adxRanging: "below 20 — no trend (ranging)",
    adxTrend: "20 or above — trend is strong",
    smcConfirmLbl: "SMC Confirmation",
    rsiNeedBuy: "BUY needs 50–70",
    rsiNeedSell: "SELL needs 30–50",
    rrNeed: "R:R 1.5 needed",
    bannerTerminal: "SIGNALS COME ONLY FROM HERE — trade on the BUY/SELL card",
    bannerSmc: "THIS IS NOT A SIGNAL — it is only confirmation",
    bannerSession: "THIS ONLY TELLS THE TIME — it gives no signal",
    bannerHistory: "THESE ARE OLD SIGNALS — do not trade on them, only check the results",
    bannerScanner: "THIS ONLY SEARCHES — the signal is made in the Terminal"
  },
  ar: {
    tagline: "إشارات مباشرة للذهب والبيتكوين والفوركس",
    setupTitle: "الإعداد لأول مرة",
    setupText: "أنشئ اسم مستخدم وكلمة مرور المسؤول بنفسك. لا ترسل كلمة المرور لأي شخص — يجب أن تعرفها أنت فقط.",
    setupBtn: "إنشاء حساب المسؤول",
    loginTitle: "تسجيل الدخول",
    loginBtn: "تسجيل الدخول",
    finePrint: "لا توجد إشارة مربحة بنسبة 100%. تدرّب على الحساب التجريبي أولاً، ولا تخاطر بأموال حقيقية على عجل.",
    logout: "تسجيل الخروج",
    refresh: "تحديث",
    refreshing: "جارٍ التحديث…",
    lastUpdate: "آخر تحديث",
    secAgo: "ثانية مضت",
    tabTerminal: "الطرفية",
    tabIndicators: "المؤشرات",
    tabSmc: "SMC",
    tabSession: "الجلسة",
    tabHistory: "السجل",
    tabAccount: "الحساب",
    tabAdmin: "المسؤول",
    howSignalTitle: "متى وكيف تتكوّن الإشارة؟",
    howSignalText1: "لا يوجد وقت ثابت للإشارة. تتكوّن BUY/SELL فقط عندما يتم تحقيق 85% أو أكثر من النقاط عبر البوابات الست. WAIT تعني: لا تتداول الآن، الشروط غير مستوفاة.",
    howSignalText2: "بوابة SMC منفصلة (80%) — انظر إلى تبويب SMC. إشارة الطرفية لا تنتظر بوابة SMC.",
    tfHint: "أفضل إطار زمني: 1H (مع اتجاه 4H) — الإشارات أكثر موثوقية على 1H/4H؛ 15M لتوقيت الدخول فقط و5M فيه ضجيج كثير. (اختبار رجعي 90 يوماً، 4 أزواج: نسبة الفوز ~60%، عامل الربح ~1.00 — تعادل، نتيجة سابقة وليست ضماناً.)",
    rareSignals: "الإشارات قليلة لكنها أفضل جودة — BUY/SELL تظهر فقط عند اجتياز بوابة 85%. المزيد من الإشارات لا يعني نتائج أفضل.",
    allPairsTitle: "كل الأزواج — الأسعار المباشرة",
    indCenterTitle: "مركز المؤشرات",
    indCenterText: "كل هذه الأرقام محسوبة من شموع Kraken الحقيقية — EMA 20/50 يوضح الاتجاه، وRSI 14 يوضح الزخم، وATR 14 يوضح مقدار تحرك السعر عادةً.",
    indTfNote: "القيم أدناه بإطار الساعة الواحدة — وإطارا 15 دقيقة واليومي مذكوران أدناه بشكل منفصل",
    smcTitle: "SMC (مفاهيم المال الذكي)",
    smcText: "مستويات SMC مأخوذة من قمم وقيعان شموع 15M الحقيقية — حيث ينتظر عادةً كبار المشترين والبائعين. تتكون نتيجة SMC من 5 أجزاء × 20 نقطة، والبوابة 80%. BUY/SELL في الطرفية لا تأتي من هذا التبويب؛ بل من شروط الطرفية الخاصة بنسبة 85%.",
    scannerTitle: "ماسح السوق العالمي (11 زوجاً، كل 45 ثانية)",
    smcPairCardsTitle: "تأكيد SMC — كل زوج",
    sessionTitle: "محرك الجلسات",
    backtestTitle: "محاكي الاختبار الرجعي للجلسة",
    backtestText: "شغّل قاعدة الجلسة على شموع 1H الحقيقية.",
    backtestBtn: "تشغيل الاختبار الرجعي (30 يوماً)",
    historyTitle: "سجل الإشارات",
    historyText: "تُعرض فقط الإشارات المسجلة فعلاً — لم يتم اختراع أي سجل سابق. تُفحص النتيجة (فوز/خسارة/تعادل/جارية) مقابل الشموع اللاحقة.",
    refinerTitle: "مُحسّن الاستراتيجية",
    refinerText: "ينطبق الحد فقط على الإشارات المسجلة بعد هذا الإصدار، لأن الإشارات القديمة لم تحفظ نتيجة البوابة.",
    marketClosedTitle: "السوق مغلق",
    marketClosedText: "سوق الفوركس والذهب مغلق يومي السبت والأحد — لن يتشكل أي إشارة جديدة لهذا الزوج. السعر المعروض هو آخر سعر متاح، وليس سعرًا مباشرًا.",
    marketClosedShort: "السوق مغلق — آخر سعر متاح",
    accountTitle: "الحساب",
    adminTitle: "لوحة المسؤول — حسابات المشترين",
    adminPlansText: "شهري 30 يوماً · ربع سنوي 90 يوماً · سنوي 365 يوماً · مدى الحياة (لا ينتهي أبداً). عند انتهاء الخطة، يُقفل دخول المشتري تلقائياً.",
    createBuyerBtn: "إنشاء مشترٍ",
    newsTitle: "الأخبار الأساسية",
    newsText: "أحدث عناوين الفوركس/السوق — من خلاصات RSS المجانية لـ FXStreet وForexLive.",
    chartTitle: "مخطط الأسعار — الشموع + EMA 20/50/200",
    indStripTitle: "المؤشرات المباشرة",
    smcMacroTitle: "15M ماكرو",
    smcMicroTitle: "5M مايكرو",
    smcFeedTitle: "تغذية تأكيد SMC — تأكيد وليست إشارة",
    smcBacktestTitle: "اختبار SMC الرجعي",
    termBacktestTitle: "اختبار الطرفية الرجعي (30 يوماً)",
    phSetupUser: "اسم مستخدم المسؤول (3 أحرف على الأقل)",
    phSetupPass: "كلمة مرور المسؤول (6 أحرف على الأقل)",
    phLoginUser: "اسم المستخدم",
    phLoginPass: "كلمة المرور",
    phBuyerUser: "اسم مستخدم المشتري",
    phBuyerPass: "كلمة مرور المشتري",
    phAiQ: "اكتب سؤالاً، مثل: متى تتكون الإشارة؟",
    hello: "مرحباً",
    loading: "جارٍ التحميل…",
    noTrade: "(لا توجد صفقة)",
    price: "السعر",
    confluence: "التوافق",
    gate: "البوابة",
    buySellPlans: "خطط BUY وSELL — معاً",
    signalPlan: "خطة الإشارة — اتجاه واحد، صفقة واحدة",
    smcChecklist: "قائمة تحقق توافق SMC — سبب هذه الإشارة",
    oppScenario: "السيناريو المعاكس",
    oppGateNotMet: "البوابة غير مستوفاة",
    chkSweep: "كنس السيولة",
    chkOB: "كتلة الأوامر",
    chkFvg: "FVG (فجوة القيمة العادلة)",
    chkSR: "الدعم / المقاومة",
    chkZones: "المناطق (الطلب / العرض)",
    chkYes: "✓ يدعم",
    chkNo: "✗ لا يدعم",
    chkNa: "– محايد",
    noSweep: "لم يحدث كنس",
    noObDir: "لم يتم العثور على كتلة أوامر في هذا الاتجاه",
    noFvgDir: "لم يتم العثور على FVG في هذا الاتجاه",
    inDemand: "السعر في منطقة الطلب",
    inSupply: "السعر في منطقة العرض",
    nearDemand: "السعر قريب من منطقة الطلب",
    nearSupply: "السعر قريب من منطقة العرض",
    noZone: "السعر ليس في أي منطقة",
    tradeZone: "منطقة التداول",
    inZone: "داخل المنطقة — IN ZONE",
    nearZone: "السعر قريب من المنطقة",
    farZone: "السعر بعيد عن المنطقة",
    noZoneDir: "لم يتم العثور على منطقة لهذا الاتجاه",
    bosUp: "كسر البنية للأعلى (BOS) — صاعد",
    bosDown: "كسر البنية للأسفل (BOS) — هابط",
    noBreak: "لا يوجد كسر للبنية — المستوى صامد",
    extTitle: "التوافق الموسّع — من شموع 1H",
    extNote: "كل هذه توافق فقط — لا تغيّر اتجاه الإشارة أو البوابات (85%/80%).",
    chkCandle: "نمط الشموع (1H)",
    chkChoch: "CHOCH (تغيّر الطابع)",
    chkMss: "MSS (تحوّل بنية السوق)",
    chkBreaker: "كتل الكاسر / التخفيف",
    chkIdm: "IDM (الإغراء)",
    chkFib: "مستويات فيبوناتشي",
    chkBb: "ضغط بولينجر",
    chkMacdDiv: "تباعد MACD",
    chkMeanRev: "العودة إلى المتوسط",
    chkKillzone: "منطقة القتل / توقيت الجلسة",
    chkAsian: "نطاق الجلسة الآسيوية",
    chkVwap: "نطاقات VWAP (±1σ / ±2σ)",
    chkVol: "الحجم (1H)",
    patBullEngulf: "ابتلاع صاعد",
    patBearEngulf: "ابتلاع هابط",
    patHammer: "مطرقة / شريط الدبوس (صاعد)",
    patShootingStar: "شهاب (هابط)",
    patDoji: "دوجي (محايد)",
    patMorningStar: "نجمة الصباح (صاعدة)",
    patEveningStar: "نجمة المساء (هابطة)",
    noPattern: "لا يوجد نمط واضح",
    chochUp: "CHOCH للأعلى — كسر ضد الاتجاه",
    chochDown: "CHOCH للأسفل — كسر ضد الاتجاه",
    noChoch: "لا يوجد CHOCH",
    mssUp: "MSS للأعلى — اتجاه جديد مؤكد",
    mssDown: "MSS للأسفل — اتجاه جديد مؤكد",
    noMss: "لا يوجد MSS",
    breakerLbl: "الكاسر",
    mitigationLbl: "التخفيف",
    noBreaker: "لا توجد كتلة كاسر/تخفيف",
    idmSsl: "تم العثور على IDM — كنس SSL ثم استعادة (صاعد)",
    idmBsl: "تم العثور على IDM — كنس BSL ثم استعادة (هابط)",
    noIdm: "لا يوجد IDM",
    fibNearest: "أقرب مستوى",
    squeezeOn: "يوجد ضغط — التقلب منخفض، وقد تأتي حركة كبيرة",
    squeezeOff: "لا يوجد ضغط",
    meanNear: "قريب من المتوسط",
    meanExtended: "بعيد عن المتوسط",
    meanOver: "ممتد جداً",
    aboveMean: "فوق المتوسط",
    belowMean: "تحت المتوسط",
    macdBullDiv: "تباعد صاعد — السعر أدنى، وMACD أعلى",
    macdBearDiv: "تباعد هابط — السعر أعلى، وMACD أدنى",
    noMacdDiv: "لا يوجد تباعد MACD",
    killActive: "منطقة قتل نشطة",
    killNext: "منطقة القتل التالية",
    kzAsian: "آسيوية",
    kzLondon: "لندن",
    kzNewYork: "نيويورك",
    asianIn: "السعر داخل النطاق",
    asianAbove: "السعر توسّع فوق النطاق",
    asianBelow: "السعر توسّع تحت النطاق",
    noAsian: "لم يتم العثور على نطاق آسيوي",
    vwapNearest: "أقرب نطاق",
    volRising: "الحجم يرتفع",
    volFalling: "الحجم ينخفض",
    volNormal: "الحجم طبيعي",
    volNa: "لا يوجد حجم متاح لهذا الزوج",
    dxyTitle: "مؤشر الدولار (DXY)",
    dxyNa: "DXY غير متاح الآن — لم يصل من Yahoo",
    corrLabel: "الارتباط (20 فترة)",
    corrNeg: "سلبي",
    corrPos: "إيجابي",
    corrFlat: "ضعيف",
    riskTitle: "إدارة المخاطر — إرشادات (ليست إدارة صفقات مباشرة)",
    riskRrTarget: "هدف R:R 1:2 — يتحقق عند TP3",
    riskTp1: "عند TP1 خذ 50% من الربح، ثم انقل SL إلى نقطة التعادل (الدخول).",
    riskSize: "حجم الصفقة: خاطر بـ 1% فقط من حسابك في كل صفقة.",
    riskDd: "ضبط التراجع: لا تخاطر أبداً بأكثر من 1% في صفقة واحدة — أبقِ الخسائر صغيرة.",
    sentiment: "معنويات 24 ساعة",
    demandZone: "منطقة الطلب",
    supplyZone: "منطقة العرض",
    liveComments: "تعليقات مباشرة",
    nextCheck: "التحقق التالي خلال",
    nextCheckSuffix: "ث (مراقبة كل 30 ثانية)",
    signalUpdated: "تم تحديث الإشارة",
    buyGates: "بوابات BUY",
    sellGates: "بوابات SELL",
    entryZone: "منطقة الدخول",
    trigger: "المحفّز",
    scorecard: "بطاقة النقاط",
    trend: "الاتجاه",
    momentum: "الزخم",
    volatility: "التقلب",
    volume: "الحجم",
    structure: "البنية",
    ichimoku: "إيشيموكو",
    vwapSar: "VWAP / SAR",
    tf15d: "15M واليومي",
    smcScore: "نتيجة SMC",
    gatePass: "تم اجتياز البوابة!",
    gateNotMet: "البوابة غير مستوفاة",
    swingLevels: "مستويات التأرجح",
    swingHigh: "آخر قمة تأرجح",
    swingLow: "آخر قاع تأرجح",
    liqSweeps: "كنس السيولة",
    orderBlocks: "كتل الأوامر",
    bullOB: "كتلة أوامر صاعدة",
    bearOB: "كتلة أوامر هابطة",
    fresh: "جديدة",
    mitigated: "مُخفَّفة",
    fvg: "فجوات القيمة العادلة (FVG)",
    noFvg: "لم يتم العثور على FVG.",
    microSweeps: "كنس SSL على 5M مايكرو",
    liqPools: "تجمعات السيولة",
    pair: "الزوج",
    direction: "الاتجاه",
    confirmedSignals: "تأكيدات SMC",
    cycleEvery: "الدورة: كل",
    cycleSec: "ثانية",
    sessionActive: "نشطة",
    nowPkt: "وقت PKT الحالي",
    nextSession: "الجلسة التالية",
    minutes: "دقيقة",
    newsBlackout: "تعتيم الأخبار",
    notAvailable: "غير متاح",
    sessionStats: "إحصاءات الجلسة",
    total: "المجموع",
    sessionHistoryBtn: "عرض سجل الجلسة",
    noSessionSignals: "لم يتم تسجيل أي إشارة جلسة بعد.",
    backtestRunning: "جارٍ تشغيل الاختبار الرجعي…",
    trades: "الصفقات",
    wins: "الفوز",
    losses: "الخسارة",
    winRate: "نسبة الفوز",
    profitFactor: "عامل الربح",
    totalExecuted: "إجمالي المنفذ",
    breakEven: "تعادل",
    inFlight: "جارية",
    noClosed: "— (لا توجد إشارة مغلقة بعد)",
    noSignals: "لم يتم تسجيل أي إشارة بعد.",
    cutoff: "الحد",
    qualifying: "الإعدادات المؤهلة",
    simWinRate: "نسبة الفوز المحاكاة",
    allOutcomes: "كل النتائج",
    allEngines: "كل المحركات",
    mainTerminal: "الطرفية الرئيسية",
    smcEngine: "محرك SMC",
    sessionEngine: "محرك الجلسة",
    newsIntel: "استخبارات الأخبار",
    username: "اسم المستخدم",
    role: "الدور",
    plan: "الخطة",
    planExpiry: "انتهاء الخطة",
    daysLeft: "أيام متبقية",
    lifetimeNever: "مدى الحياة — لا ينتهي أبداً",
    managePlan: "لتغيير خطتك، تواصل مع المسؤول",
    signals: "الإشارات",
    engines: "المحركات",
    engineOffNote: "المحرك المطفأ متوقف فعلاً — لا يصنع إشارات. اختبار الدفع هو رسالة اختبار داخل التطبيق فقط، وليس إشعار دفع حقيقياً.",
    testPushBtn: "اختبار الدفع (اختبار داخل التطبيق)",
    testPushMsg: "اختبار دفع (داخل التطبيق): هذا اختبار فقط، وليس إشعار دفع حقيقياً.",
    historyTabText: "كل الإشارات في تبويب السجل.",
    openHistory: "فتح السجل",
    tfLoading: "جارٍ تحميل مصفوفة الأطر الزمنية…",
    exportText: "نزّل الإشارات كملف CSV.",
    exportBtn: "تصدير CSV",
    aiTitle: "وكيل الذكاء الاصطناعي — داخل التطبيق فقط.",
    aiText: "هذه ليست خدمة ذكاء اصطناعي مباشرة، بل مساعد داخل التطبيق فقط.",
    aiAsk: "اسأل",
    defaultPair: "الزوج الافتراضي",
    saved: "تم الحفظ.",
    totalBuyers: "إجمالي المشترين",
    expired: "منتهية",
    bandHai: "موقوف",
    active: "نشط",
    lifetime: "مدى الحياة",
    expiry: "الانتهاء",
    extend30: "+30 يوماً",
    suspend: "إيقاف",
    reopen: "إعادة فتح",
    changePass: "تغيير كلمة المرور",
    delete: "حذف",
    noBuyers: "لا يوجد مشترون بعد.",
    buyerCreated: "تم إنشاء المشتري",
    passChanged: "تم تغيير كلمة المرور.",
    ownPassTitle: "تغيير كلمة المرور الخاصة بك",
    phNewPass: "كلمة مرور جديدة (6 أحرف على الأقل)",
    phConfirmPass: "أعد كتابة كلمة المرور",
    passTooShort: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل",
    passMismatch: "كلمتا المرور غير متطابقتين",
    saveBtn: "حفظ",
    cancelBtn: "إلغاء",
    newPassPrompt: "كلمة المرور الجديدة (6 أحرف على الأقل):",
    deleteConfirm: " — حذف هذا المستخدم؟",
    serverUnreachable: "تعذّر الوصول إلى الخادم:",
    priceLoadFail: "لم يتم تحميل الأسعار:",
    signalLoadFail: "لم يتم تحميل الإشارة:",
    indLoadFail: "لم يتم تحميل المؤشرات:",
    indNoData: "لا توجد شموع متاحة للمؤشرات.",
    smcLoadFail: "لم يتم تحميل SMC:",
    smcNoData: "لا توجد بيانات SMC.",
    scannerFail: "لم يتم تحميل الماسح:",
    sessionLoadFail: "لم يتم تحميل الجلسة:",
    newsFail: "الأخبار غير متاحة الآن — حاول مرة أخرى قريباً.",
    newsFallbackNote: "أحد المصدرين متوقف — العناوين المعروضة من المصدر العامل",
    newsUpdated: "تم التحديث",
    newSignal: "إشارة جديدة!",
    alertsNote: "التنبيهات تعمل فقط أثناء فتح الموقع — وليس على تبويب مغلق أو هاتف مغلق.",
    sound: "الصوت",
    notifications: "الإشعارات",
    status: "الحالة",
    session: "الجلسة",
    pktTime: "وقت PKT",
    quality: "الجودة",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "الإشارة",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "لم يتم تسجيل أي تأكيد SMC بعد.",
    smcBacktestRunning: "جارٍ تشغيل اختبار SMC الرجعي…",
    termBacktestRunning: "جارٍ تشغيل اختبار الطرفية الرجعي…",
    termBacktestNote: "آخر 30 يوماً، شموع 1H — ليست وعداً بنتائج مستقبلية. الأساس = محرك الطرفية (6 بوابات، بوابة 85%). لم تُحسّن المرشحات كل زوج، لذلك لم تتم إضافة أي مرشح إلى المحرك المباشر.",
    termBacktestBtn: "تشغيل اختبار الطرفية الرجعي",
    smcBacktestBtn: "تشغيل اختبار SMC الرجعي (30 يوماً)",
    smcBacktestNote: "قاعدة SMC (نتيجة 80%+) على شموع 15M الحقيقية — لا أرقام مخترعة.",
    filter: "مرشح",
    baseline: "الأساس",
    macdAgree: "MACD يوافق",
    noDeadHours: "لا ساعات ميتة",
    chartNoData: "لا توجد شموع متاحة للمخطط.",
    allSessions: "كل الجلسات (وقت PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "بنية السوق (BOS/MSS)",
    buyNow: "🟢 BUY الآن",
    sellNow: "🔴 SELL الآن",
    waitNoTrade: "⏳ WAIT — لا توجد صفقة",
    bannerLine: "نفّذ هذه الصفقة الآن — Entry وSL وTP موضحة أدناه.",
    approaching: "يقترب — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "نظرة عامة",
    engineControls: "ضوابط المحرك",
    signalDetails: "تفاصيل الإشارة",
    signalHistory: "سجل الإشارات",
    tfMatrix: "مصفوفة الأطر الزمنية",
    trackingLogs: "سجلات التتبع",
    exportCsv: "تصدير CSV",
    aiAgent: "وكيل الذكاء الاصطناعي",
    preferences: "التفضيلات",
    copySignal: "📋 نسخ الإشارة",
    downloadSignal: "⬇️ تنزيل الصورة",
    copyDone: "تم نسخ الإشارة",
    copyDoneBody: "تم نسخ نص الإشارة — الصقه على WhatsApp أو Telegram.",
    copyFailBody: "تعذّر النسخ — حدّد النص يدوياً وانسخه.",
    imgDone: "تم تنزيل الصورة",
    imgDoneBody: "تم تنزيل صورة بطاقة الإشارة.",
    imgFail: "تعذّر تنزيل الصورة — حاول مرة أخرى.",
    shareDisclaimer: "لا توجد إشارة مربحة بنسبة 100%.",
    close: "إغلاق",
    scanNow: "🔍 مسح الآن",
    scanning: "جارٍ المسح…",
    monitorEvery: "كل",
    stopMonitoring: "⏸ إيقاف",
    startMonitoring: "▶ بدء",
    monitoringOff: "المراقبة متوقفة — اضغط بدء",
    scanDone: "اكتمل المسح",
    scanDoneBody: "تمت إعادة مسح كل الأزواج.",
    scanFailBody: "تعذّر المسح — حاول مرة أخرى.",
    bestTimeframe: "أفضل إطار زمني: 1H (4H يعمل أيضاً) — 15M لتوقيت الدخول فقط",
    signalCode: "رمز الإشارة",
    validUntil: "صالحة حتى",
    newSignalPopup: "وصلت إشارة جديدة!",
    whyWait: "لماذا الانتظار؟ — Why Wait?",
    copyWaitAnalysis: "📋 نسخ تحليل WAIT",
    waitCopyDone: "تم نسخ تحليل WAIT",
    waitCopyDoneBody: "تم نسخ تحليل WAIT — الصقه على WhatsApp أو Telegram.",
    smcBelowGate: "SMC أقل من بوابتها",
    zoneBlockedReason: "لا توجد منطقة مناسبة خلف هذا الاتجاه",
    shareCard: "📤 بطاقة المشاركة",
    downloadHighRes: "⬇️ تنزيل PNG عالي الدقة",
    copyImage: "🖼️ نسخ الصورة",
    copyFormattedText: "📋 نسخ النص المنسق",
    formattedPreview: "معاينة النص المنسق (Telegram / WhatsApp)",
    imgCopyDone: "تم نسخ الصورة",
    imgCopyDoneBody: "تم نسخ صورة بطاقة الإشارة إلى الحافظة.",
    imgCopyFail: "تعذّر نسخ الصورة",
    imgCopyFailBody: "نسخ الصور غير مدعوم في هذا المتصفح — استخدم التنزيل.",
    dcaNote: "DCA: خذ 50% من الربح عند TP1، ودع الباقي يعمل حتى TP2/TP3.",
    breakevenNote: "التعادل: بعد TP1، انقل SL إلى الدخول.",
    stepSignal: "الإشارة",
    stepEntry: "منطقة الدخول",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "أُغلقت الصفقة",
    progression: "التقدم",
    confluenceLbl: "التوافق",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "موجة المعنويات — محسوبة (ليست توقعاً)",
    sentimentWaveNote: "تُحسب هذه المعنويات من RSI والاتجاه والمناطق الحقيقية — إنها ليست توقعاً.",
    demandIndex: "مؤشر الطلب",
    supplyIndex: "مؤشر العرض",
    zoneCorridor: "ممر المناطق",
    histDetails: "تفاصيل الإشارة (المسجلة)",
    gatesNotSaved: "لم تُحفظ تفاصيل البوابة لهذه الإشارة.",
    detailsBtn: "التفاصيل",
    pivotTitle: "النقاط المحورية (اليوم السابق)",
    fearGreedTitle: "خوف وطمع البيتكوين (alternative.me)",
    fearGreedNa: "الخوف والطمع غير متاحين الآن.",
    riskProfile: "ملف المخاطر",
    riskConservative: "محافظ",
    riskModerate: "معتدل",
    riskAggressive: "عدواني",
    riskConsText: "إشارات التوافق العالي فقط — خاطر بـ 1% في كل صفقة",
    riskModText: "قياسي — خاطر بـ 1% في كل صفقة",
    riskAggText: "مخاطر أعلى — حتى 2% في كل صفقة، وقد يكون التراجع أكبر",
    riskProfileLine: "ملف المخاطر الخاص بك",
    timezone: "المنطقة الزمنية",
    theme: "السمة",
    themeDark: "داكن",
    themeLight: "فاتح",
    language: "اللغة",
    prefPair: "الزوج المفضل",
    engineStatus: "حالة المحرك",
    prefSaved: "تم حفظ التفضيلات.",
    guideTitle: "كيف تأخذ صفقة؟ — 4 خطوات سهلة",
    guideStep1: "تداول فقط على إشارة BUY أو SELL — لا تتداول أبداً على WAIT.",
    guideStep2: "Entry وSL وTP مكتوبة على البطاقة — لا تخاطر أبداً بأكثر من SL.",
    guideStep3: "التأكيد موجود على البطاقة نفسها: النتيجة فوق البوابة، والأسباب مذكورة تحت \"لماذا هذه الصفقة؟\" أدناه.",
    guideStep4: "أفضل إطار زمني هو 1H (4H يعمل أيضاً) — 15M لتوقيت الدخول فقط.",
    whyTradeTitle: "لماذا هذه الصفقة؟ — التأكيد",
    whyTrend: "الاتجاه في هذا الجانب",
    whyZone: "السعر في منطقة التداول",
    whyZoneNear: "السعر قريب من منطقة التداول",
    whySmcHigh: "نتيجة SMC 80+ — المال الذكي يوافق أيضاً",
    whyTopGate: "أقوى تحقق",
    oneTradeLabel: "صفقة واحدة في كل مرة",
    oneTradeNote: "صفقة واحدة في كل مرة — لا يُعرض إعداد الاتجاه الآخر.",
    gatesExplain: "6 تحققات، 100 نقطة — تتكون الإشارة فقط عند 85+ (مثل علامات النجاح في الامتحان).",
    smcExplain: "5 أجزاء، 100 نقطة — 80+ جيد (تأكيد قوي).",
    gateLblTrendUp: "الاتجاه صاعد (EMA)",
    gateLblTrendDown: "الاتجاه هابط (EMA)",
    gateLblStructure: "البنية قوية",
    gateLblRsi: "RSI في نطاق صحي",
    gateLblRr: "المكافأة أكبر من المخاطرة",
    gateLblEma200: "الاتجاه الكبير (EMA200) يوافق",
    gateLblFresh: "البيانات حديثة",
    smcLblSweep: "تم كنس السيولة",
    smcLblStructure: "تغيّرت بنية السوق",
    smcLblOb: "تم العثور على كتلة أوامر",
    smcLblFvg: "تم العثور على فجوة FVG",
    smcLblRr: "المخاطرة/المكافأة جيدة",
    chkLblSweep: "كبار اللاعبين أخذوا السيولة",
    chkLblOb: "منطقة كبار اللاعبين",
    chkLblFvg: "فجوة فارغة في السعر",
    chkLblSr: "مستوى دعم/مقاومة قوي",
    chkLblZones: "منطقة شراء/بيع",
    extLblCandle: "الشمعة تلمّح إلى الاتجاه",
    extLblChoch: "إشارة إلى أن الاتجاه قد يتغير",
    extLblMss: "تم تأكيد اتجاه جديد",
    extLblBreaker: "المستوى القديم أصبح دعماً/مقاومة",
    extLblIdm: "عودة بعد حركة كاذبة",
    extLblFib: "مستوى فيبوناتشي (محسوب)",
    extLblBb: "ضغط التقلب",
    extLblMacdDiv: "MACD والسعر يختلفان",
    extLblMeanRev: "مدى بعد السعر عن المتوسط",
    extLblKillzone: "وقت الجلسة النشط",
    extLblAsian: "نطاق الجلسة الآسيوية",
    extLblVwap: "نطاقات VWAP (متوسط السعر)",
    extLblVol: "الحجم — مقدار ما تم تداوله",
    smcNoSignalBanner: "SMC لا يعطي إشارات — إنه فقط تأكيد لإشارة الطرفية.",
    smcConfirmStrong: "تأكيد قوي ✓",
    smcConfirmWeak: "التأكيد ضعيف — يصبح قوياً عند 80+",
    notASignalNote: "هذه ليست إشارة — تداول فقط على إشارة الطرفية.",
    confirmationLbl: "تأكيد",
    smcEngineHeader: "محرك SMC • نشط",
    smcEngineSub: "كنس السيولة · كتل الأوامر · FVGs · ماكرو 15M ودخول 5M",
    smcSetupQuality: "جودة الإعداد",
    smcGradeStrong: "A · قوي",
    smcGradeModerate: "B · معتدل",
    smcGradeDeveloping: "C · قيد التطوير",
    smcGradeWeak: "D · ضعيف",
    smcWaiting80: "في انتظار تأكيد 80%",
    smcConfirmed80: "تم الوصول إلى تأكيد 80% — تأكيد قوي لإشارة الطرفية",
    smcBias: "انحياز SMC (15M)",
    smcBiasBullish: "صاعد",
    smcBiasBearish: "هابط",
    smcBiasNeutral: "محايد",
    smcLiveMove: "الحركة المباشرة (من الدخول)",
    smcGenerated: "تم الإنشاء",
    smcBeTip: "نصيحة التعادل: بعد ربح +100 نقطة، انقل SL إلى الدخول — إرشاد فقط، وليس تلقائياً.",
    smcFeedNote: "هذا تأكيد فقط — لا تتداول عليه، انتظر إشارة الطرفية.",
    perfNoteTerminal: "تُحسب نسبة الفوز من إشارات الطرفية فقط — لا تُحتسب SMC/الجلسة هنا.",
    smcTpNote: "TP2/TP3: تُسجَّل فقط نتيجة TP1/SL.",
    smcInspectChart: "فحص المخطط",
    tgTitle: "تنبيهات Telegram — الإشارات على هاتفك",
    tgText: "عند ظهور إشارة BUY/SELL، تصلك رسالة Telegram على هاتفك — حتى عند إغلاق الموقع. افتح الرابط أدناه واضغط Start على البوت.",
    tgButton: "📲 احصل على التنبيهات على Telegram",
    tgPersonalTitle: "رابط Telegram الشخصي الخاص بك",
    tgPersonalText: "هذا الرابط خاص بك فقط — يربط التنبيهات بحسابك. افتح الرابط، واضغط Start على البوت، وتم! تتوقف التنبيهات إذا انتهت خطتك أو تم إيقافها.",
    tgLinked: "✅ تنبيهات Telegram مفعّلة — ستصلك رسالة عند ظهور إشارة.",
    tgNotLinked: "تنبيهات Telegram غير مفعّلة بعد — افتح الرابط واضغط Start.",
    tgCopyLink: "نسخ الرابط",
    tgLinkCopied: "تم نسخ رابط Telegram الشخصي — اضغط Start على البوت.",
    marketCards: "السوق المباشر",
    pcMarketPrice: "سعر السوق (الأخير)",
    pcChange24h: "تغيّر 24 ساعة / اليومي",
    pcSpread: "السبريد",
    pcKeyLevels: "المستويات الرئيسية التاريخية",
    pcSources: "المصادر",
    liveMarketPrice: "سعر السوق المباشر",
    awaitingConf: "في انتظار التوافق",
    scanningMarket: "جارٍ مسح السوق — في انتظار توافق 85%",
    confirmedTitle: "المؤشرات المؤكدة",
    passedLbl: "ناجح",
    awaitingTitle: "في انتظار التأكيد",
    pendingLbl: "قيد الانتظار",
    needsGate: "يحتاج 85%",
    requiredTitle: "المطلوب قبل BUY أو SELL",
    requiredBuy: "لتأكيد BUY",
    requiredSell: "لتأكيد SELL",
    reqBuyTpl: "ارتداد صاعد من {a} — السعر يستعيد {b}",
    reqSellTpl: "رفض هابط من {a} — السعر يفقد {b}",
    analyzeNow: "حلّل السوق الآن",
    inspectInd: "فحص المؤشرات",
    downloadCard: "تنزيل البطاقة",
    liveTick: "تزامن لحظي مباشر",
    timeframeLbl: "الإطار الزمني",
    confidenceLbl: "الثقة",
    htfLbl: "مواءمة الإطار الزمني الأعلى",
    adxRanging: "أقل من 20 — لا يوجد اتجاه (تذبذب)",
    adxTrend: "20 أو أكثر — الاتجاه قوي",
    smcConfirmLbl: "تأكيد SMC",
    rsiNeedBuy: "BUY يحتاج 50–70",
    rsiNeedSell: "SELL يحتاج 30–50",
    rrNeed: "يلزم R:R 1.5",
    bannerTerminal: "الإشارات تأتي من هنا فقط — تداول على بطاقة BUY/SELL",
    bannerSmc: "هذه ليست إشارة — إنها تأكيد فقط",
    bannerSession: "هذا يخبر بالوقت فقط — لا يعطي إشارة",
    bannerHistory: "هذه إشارات قديمة — لا تتداول عليها، تحقق من النتائج فقط",
    bannerScanner: "هذا يبحث فقط — الإشارة تُصنع في الطرفية"
  },
  hi: {
    tagline: "सोने, बिटकॉइन और फ़ॉरेक्स के लाइव सिग्नल",
    setupTitle: "पहली बार सेटअप",
    setupText: "अपना Admin username और password खुद बनाएँ। Password किसी को न भेजें — सिर्फ आपको पता होना चाहिए।",
    setupBtn: "Admin Account बनाएँ",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "कोई सिग्नल 100% profitable नहीं होता। पहले demo पर practice करें, असली पैसा जल्दी मत लगाएँ।",
    logout: "Logout",
    refresh: "Refresh",
    refreshing: "Refresh हो रहा है…",
    lastUpdate: "आख़िरी अपडेट",
    secAgo: "सेकंड पहले",
    tabTerminal: "Terminal",
    tabIndicators: "Indicators",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "History",
    tabAccount: "Account",
    tabAdmin: "Admin",
    howSignalTitle: "सिग्नल कब और कैसे बनता है?",
    howSignalText1: "सिग्नल का कोई fixed time नहीं है। BUY/SELL तभी बनता है जब 6 gates में 85% या ज़्यादा points मिल जाएँ। WAIT का मतलब है: अभी trade मत करें, शर्तें पूरी नहीं हैं।",
    howSignalText2: "SMC का gate अलग है (80%) — SMC tab में देखें। Terminal का signal SMC gate पर नहीं रुकता।",
    tfHint: "Best timeframe: 1H (4H trend के साथ) — 1H/4H पर signals सबसे reliable होते हैं, 15M सिर्फ entry timing के लिए है, 5M पर ज़्यादा noise होता है। (90-दिन backtest, 4 pairs: win rate ~60%, profit factor ~1.00 — breakeven, पिछला result है, guarantee नहीं।)",
    rareSignals: "सिग्नल कम आते हैं, लेकिन बेहतर होते हैं — BUY/SELL सिर्फ तभी दिखता है जब 85% gate पूरा हो। ज़्यादा signals का मतलब बेहतर result नहीं होता।",
    allPairsTitle: "सभी Pairs — Live Prices",
    indCenterTitle: "Indicators Center",
    indCenterText: "ये सभी numbers असली Kraken candles से हिसाब करके निकाले गए हैं — EMA 20/50 trend बताता है, RSI 14 momentum, और ATR 14 ये बताता है कि price आम तौर पर कितना हिलता है।",
    indTfNote: "नीचे की values 1H timeframe की हैं — 15M और Daily अलग से नीचे लिखे हैं",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC के levels असली 15M candles के swing high/low से निकाले जाते हैं — जहाँ बड़े खरीदार/बेचने वाले आम तौर पर रुकते हैं। SMC score 5 हिस्से × 20 points से बनता है, gate 80% है। Terminal का BUY/SELL इस tab से नहीं बनता; वो Terminal की अपनी 85% वाली शर्तों से बनता है।",
    scannerTitle: "Global Market Scanner (11 pairs, हर 45 सेकंड)",
    smcPairCardsTitle: "SMC Tasdeeq — Har Pair",
    sessionTitle: "Session Engine",
    backtestTitle: "Session Backtest Simulator",
    backtestText: "असली 1H candles पर session rule चला कर देखें।",
    backtestBtn: "Backtest चलाएँ (30 दिन)",
    historyTitle: "Signal History",
    historyText: "सिर्फ असली record किए गए signals दिखाए जाते हैं — कोई पुरानी history बनाई नहीं गई। नतीजा (Win/Loss/Break-Even/In-Flight) बाद की candles से check करके दिखाया जाता है।",
    refinerTitle: "Strategy Refiner",
    refinerText: "Cutoff सिर्फ इस build के बाद record होने वाले signals पर लगता है, क्योंकि पुराने signals में gate score save नहीं हुआ।",
    marketClosedTitle: "बाज़ार बंद है",
    marketClosedText: "फॉरेक्स और सोने का बाज़ार शनिवार और रविवार को बंद रहता है — इस पेयर के लिए कोई नया सिग्नल नहीं बनेगा। यहाँ दिखाई गई कीमत आखिरी उपलब्ध कीमत है, लाइव नहीं।",
    marketClosedShort: "बाज़ार बंद है — आखिरी उपलब्ध कीमत",
    accountTitle: "Account",
    adminTitle: "Admin Panel — Buyer Accounts",
    adminPlansText: "Monthly 30 दिन · Quarterly 90 दिन · Yearly 365 दिन · Lifetime (कभी खत्म नहीं)। Plan खत्म होने पर buyer login खुद बंद हो जाता है।",
    createBuyerBtn: "Buyer बनाएँ",
    newsTitle: "Fundamental News",
    newsText: "ताज़ा forex/market headlines — FXStreet और ForexLive के free RSS feeds से।",
    chartTitle: "Price Chart — Candles + EMA 20/50/200",
    indStripTitle: "Live Indicators",
    smcMacroTitle: "15M Macro",
    smcMicroTitle: "5M Micro",
    smcFeedTitle: "SMC Confirmation Feed — तस्दीक, signal नहीं",
    smcBacktestTitle: "SMC Backtest",
    termBacktestTitle: "Terminal Backtest (30 दिन)",
    phSetupUser: "Admin username (कम से कम 3 अक्षर)",
    phSetupPass: "Admin password (कम से कम 6 अक्षर)",
    phLoginUser: "Username",
    phLoginPass: "Password",
    phBuyerUser: "Buyer username",
    phBuyerPass: "Buyer password",
    phAiQ: "सवाल लिखें, जैसे: signal कब बनता है?",
    hello: "नमस्ते",
    loading: "Load हो रहा है…",
    noTrade: "(कोई trade नहीं)",
    price: "Price",
    confluence: "Confluence",
    gate: "gate",
    buySellPlans: "BUY और SELL plans — दोनों एक साथ",
    signalPlan: "Signal Plan — एक direction, एक trade",
    smcChecklist: "SMC Confluence Checklist — इस signal की असली वजह",
    oppScenario: "दूसरी तरफ का scenario",
    oppGateNotMet: "gate पूरा नहीं हुआ",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zones (Demand / Supply)",
    chkYes: "✓ Support करता है",
    chkNo: "✗ Support नहीं करता",
    chkNa: "– Neutral",
    noSweep: "कोई sweep नहीं हुआ",
    noObDir: "इस तरफ का order block नहीं मिला",
    noFvgDir: "इस तरफ का FVG नहीं मिला",
    inDemand: "Price demand zone में है",
    inSupply: "Price supply zone में है",
    nearDemand: "Price demand zone के क़रीब है",
    nearSupply: "Price supply zone के क़रीब है",
    noZone: "Price किसी zone में नहीं है",
    tradeZone: "Trade Zone",
    inZone: "IN ZONE — Zone में है",
    nearZone: "Price zone के क़रीब है",
    farZone: "Price zone से दूर है",
    noZoneDir: "इस direction के लिए कोई zone नहीं मिला",
    bosUp: "Structure ऊपर टूटा (BOS) — bullish",
    bosDown: "Structure नीचे टूटा (BOS) — bearish",
    noBreak: "कोई structure break नहीं — level held है",
    extTitle: "Extended Confluence — 1H candles से",
    extNote: "ये सभी चीज़ें सिर्फ confluence के लिए हैं — signal की direction और gates (85%/80%) इनसे नहीं बदलते।",
    chkCandle: "Candlestick Pattern (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Breaker / Mitigation Blocks",
    chkIdm: "IDM (Inducement)",
    chkFib: "Fibonacci Levels",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "MACD Divergence",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Session Timing",
    chkAsian: "Asian Session Range",
    chkVwap: "VWAP Bands (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullish)",
    patShootingStar: "Shooting Star (bearish)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Morning Star (bullish)",
    patEveningStar: "Evening Star (bearish)",
    noPattern: "कोई clear pattern नहीं",
    chochUp: "CHOCH ऊपर — trend के ख़िलाफ़ break",
    chochDown: "CHOCH नीचे — trend के ख़िलाफ़ break",
    noChoch: "कोई CHOCH नहीं",
    mssUp: "MSS ऊपर — नया trend confirm",
    mssDown: "MSS नीचे — नया trend confirm",
    noMss: "कोई MSS नहीं",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "कोई breaker/mitigation block नहीं",
    idmSsl: "IDM मिला — SSL sweep फिर reclaim (bullish)",
    idmBsl: "IDM मिला — BSL sweep फिर reclaim (bearish)",
    noIdm: "कोई IDM नहीं",
    fibNearest: "Nearest level",
    squeezeOn: "Squeeze है — volatility कम, बड़ा move आ सकता है",
    squeezeOff: "कोई squeeze नहीं",
    meanNear: "Mean के क़रीब",
    meanExtended: "Mean से दूर",
    meanOver: "बहुत overextended",
    aboveMean: "mean से ऊपर",
    belowMean: "mean से नीचे",
    macdBullDiv: "Bullish divergence — price नीचे, MACD ऊपर",
    macdBearDiv: "Bearish divergence — price ऊपर, MACD नीचे",
    noMacdDiv: "कोई MACD divergence नहीं",
    killActive: "Active killzone",
    killNext: "अगला killzone",
    kzAsian: "Asian",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Price range के अंदर है",
    asianAbove: "Price range से ऊपर निकल गया (expansion)",
    asianBelow: "Price range से नीचे निकल गया (expansion)",
    noAsian: "Asian range नहीं मिली",
    vwapNearest: "Nearest band",
    volRising: "Volume बढ़ रहा है",
    volFalling: "Volume कम हो रहा है",
    volNormal: "Volume normal है",
    volNa: "इस pair पर volume नहीं मिलता",
    dxyTitle: "Dollar Index (DXY)",
    dxyNa: "DXY अभी available नहीं है — Yahoo से नहीं मिला",
    corrLabel: "Correlation (20-period)",
    corrNeg: "negative",
    corrPos: "positive",
    corrFlat: "कमज़ोर",
    riskTitle: "Risk Management — guidance (live trade management नहीं)",
    riskRrTarget: "R:R 1:2 का target — TP3 पर पूरा होता है",
    riskTp1: "TP1 पर 50% profit लो, फिर SL को breakeven (entry) पर ले जाओ।",
    riskSize: "Position size: हर trade पर account का सिर्फ 1% risk करें।",
    riskDd: "Drawdown control: एक trade में 1% से ज़्यादा risk नहीं — loss छोटा रखें।",
    sentiment: "24H Sentiment",
    demandZone: "Demand Zone",
    supplyZone: "Supply Zone",
    liveComments: "Live Comments",
    nextCheck: "Next check in",
    nextCheckSuffix: "s (30 second monitoring)",
    signalUpdated: "Signal updated",
    buyGates: "BUY Gates",
    sellGates: "SELL Gates",
    entryZone: "Entry Zone",
    trigger: "Trigger",
    scorecard: "Scorecard",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatility",
    volume: "Volume",
    structure: "Structure",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M और Daily",
    smcScore: "SMC Score",
    gatePass: "Gate पार!",
    gateNotMet: "gate पूरा नहीं हुआ",
    swingLevels: "Swing Levels",
    swingHigh: "आख़िरी Swing High",
    swingLow: "आख़िरी Swing Low",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "Bullish OB",
    bearOB: "Bearish OB",
    fresh: "fresh",
    mitigated: "mitigated",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "कोई FVG नहीं मिला।",
    microSweeps: "5M Micro SSL sweeps",
    liqPools: "Liquidity pools",
    pair: "Pair",
    direction: "Direction",
    confirmedSignals: "SMC confirmations (तस्दीक)",
    cycleEvery: "Cycle: हर",
    cycleSec: "second",
    sessionActive: "Active",
    nowPkt: "अभी PKT time",
    nextSession: "अगला session",
    minutes: "minute में",
    newsBlackout: "News blackout",
    notAvailable: "Available नहीं है",
    sessionStats: "Session stats",
    total: "Total",
    sessionHistoryBtn: "Session History देखें",
    noSessionSignals: "अभी तक कोई session signal record नहीं हुआ।",
    backtestRunning: "Backtest चल रहा है…",
    trades: "Trades",
    wins: "Wins",
    losses: "Losses",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalExecuted: "Total Executed",
    breakEven: "Break-Even",
    inFlight: "In-Flight",
    noClosed: "— (अभी कोई closed signal नहीं)",
    noSignals: "अभी तक कोई signal record नहीं हुआ।",
    cutoff: "Cutoff",
    qualifying: "Qualifying setups",
    simWinRate: "Simulated Win Rate",
    allOutcomes: "सब outcomes",
    allEngines: "सब engines",
    mainTerminal: "Main Terminal",
    smcEngine: "SMC Engine",
    sessionEngine: "Session Engine",
    newsIntel: "News Intelligence",
    username: "Username",
    role: "Role",
    plan: "Plan",
    planExpiry: "प्लान की समाप्ति",
    daysLeft: "दिन बाकी हैं",
    lifetimeNever: "Lifetime — कभी खत्म नहीं होता",
    managePlan: "प्लान बदलना हो तो admin से संपर्क करें",
    signals: "Signals",
    engines: "Engines",
    engineOffNote: "OFF वाला engine असल में बंद हो जाता है — उसके signals नहीं बनते। Test Push सिर्फ app के अंदर test message है, असली push notification नहीं।",
    testPushBtn: "Test Push (in-app test)",
    testPushMsg: "Test push (in-app): ये सिर्फ test है, असली push notification नहीं।",
    historyTabText: "History tab में तमाम signals हैं।",
    openHistory: "History खोलें",
    tfLoading: "TF Matrix load हो रहा है…",
    exportText: "Signals CSV में download करें।",
    exportBtn: "Export CSV",
    aiTitle: "AI Agent — in-app only.",
    aiText: "ये कोई live AI service नहीं है, सिर्फ app के अंदर का helper है।",
    aiAsk: "पूछें",
    defaultPair: "Default pair",
    saved: "Save हो गया।",
    totalBuyers: "Total buyers",
    expired: "Expired",
    bandHai: "Band है",
    active: "Active",
    lifetime: "Lifetime",
    expiry: "Expiry",
    extend30: "+30 दिन",
    suspend: "Band करना",
    reopen: "खोलना",
    changePass: "Password बदलें",
    delete: "Delete",
    noBuyers: "अभी कोई buyer नहीं है।",
    buyerCreated: "Buyer बन गया",
    passChanged: "Password बदल गया।",
    ownPassTitle: "अपना password बदलें",
    phNewPass: "Naya password (कम से कम 6 अक्षर)",
    phConfirmPass: "Password dobara likhein",
    passTooShort: "Password कम से कम 6 अक्षर का हो",
    passMismatch: "Dono password aik jaise nahi hain",
    saveBtn: "Save karein",
    cancelBtn: "Cancel karein",
    newPassPrompt: "नया password (कम से कम 6 अक्षर):",
    deleteConfirm: "को delete करें?",
    serverUnreachable: "Server से राब्ता नहीं हो रहा:",
    priceLoadFail: "Price load नहीं हुई:",
    signalLoadFail: "Signal load नहीं हुआ:",
    indLoadFail: "Indicators load नहीं हुए:",
    indNoData: "Indicators के लिए candles नहीं मिलीं।",
    smcLoadFail: "SMC load नहीं हुआ:",
    smcNoData: "SMC data नहीं मिला।",
    scannerFail: "Scanner load नहीं हुआ:",
    sessionLoadFail: "Session load नहीं हुआ:",
    newsFail: "News अभी नहीं मिल रही — थोड़ी देर बाद दोबारा कोशिश करें।",
    newsFallbackNote: "Ek feed band hai — jo headlines dikh rahi hain wo chalti hui feed se hain",
    newsUpdated: "Updated",
    newSignal: "नया Signal!",
    alertsNote: "Alerts सिर्फ तब काम करते हैं जब site खुली हो — बंद tab या बंद phone पर नहीं।",
    sound: "Sound",
    notifications: "Notifications",
    status: "Status",
    session: "Session",
    pktTime: "PKT Time",
    quality: "Quality",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "अभी तक कोई SMC तस्दीक record नहीं हुई।",
    smcBacktestRunning: "SMC backtest चल रहा है…",
    termBacktestRunning: "Terminal backtest चल रहा है…",
    termBacktestNote: "पिछले 30 दिन, 1H candles — भविष्य की guarantee नहीं। Baseline = Terminal engine (6 gates, 85% gate)। Filters ने हर pair पर बेहतरी नहीं दिखाई, इस लिए live engine में कोई filter नहीं लगाया गया।",
    termBacktestBtn: "Terminal Backtest चलाएँ",
    smcBacktestBtn: "SMC Backtest चलाएँ (30 दिन)",
    smcBacktestNote: "असली 15M candles पर SMC rule (score 80%+) — कोई बनाया हुआ number नहीं।",
    filter: "Filter",
    baseline: "Baseline",
    macdAgree: "MACD agree",
    noDeadHours: "No dead hours",
    chartNoData: "Chart के लिए candles नहीं मिलीं।",
    allSessions: "तमाम Sessions (PKT time)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Market Structure (BOS/MSS)",
    buyNow: "🟢 BUY करो",
    sellNow: "🔴 SELL करो",
    waitNoTrade: "⏳ WAIT — कोई trade नहीं",
    bannerLine: "अभी ये trade करें — Entry, SL और TP नीचे दिए गए हैं।",
    approaching: "APPROACHING — क़रीब आ रहा है",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Overview",
    engineControls: "Engine Controls",
    signalDetails: "Signal Details",
    signalHistory: "Signal History",
    tfMatrix: "TF Matrix",
    trackingLogs: "Tracking Logs",
    exportCsv: "Export CSV",
    aiAgent: "AI Agent",
    preferences: "Preferences",
    copySignal: "📋 Signal Copy करें",
    downloadSignal: "⬇️ Picture Download करें",
    copyDone: "Signal copy हो गया",
    copyDoneBody: "Signal text copy हो गया है — WhatsApp या Telegram पर paste करें।",
    copyFailBody: "Copy नहीं हो सका — text को हाथ से select करके copy करें।",
    imgDone: "Picture download हो गई",
    imgDoneBody: "Signal card picture download हो गई है।",
    imgFail: "Picture download नहीं हो सकी — दोबारा try करें।",
    shareDisclaimer: "कोई signal 100% profitable नहीं होता।",
    close: "बंद करें",
    scanNow: "🔍 Scan Now",
    scanning: "Scanning…",
    monitorEvery: "हर",
    stopMonitoring: "⏸ Stop",
    startMonitoring: "▶ Start",
    monitoringOff: "Monitoring बंद है — Start दबाएँ",
    scanDone: "Scan हो गया",
    scanDoneBody: "सारे pairs दोबारा scan हो गए।",
    scanFailBody: "Scan नहीं हो सका — दोबारा try करें।",
    bestTimeframe: "Best timeframe: 1H (4H भी ठीक है) — 15M सिर्फ entry timing के लिए",
    signalCode: "Signal Code",
    validUntil: "Valid until",
    newSignalPopup: "Signal आ गया है!",
    whyWait: "Why Wait? — WAIT क्यों है?",
    copyWaitAnalysis: "📋 WAIT Analysis Copy करें",
    waitCopyDone: "WAIT analysis copy हो गया",
    waitCopyDoneBody: "WAIT analysis copy हो गया है — WhatsApp या Telegram पर paste करें।",
    smcBelowGate: "SMC gate से कम है",
    zoneBlockedReason: "Direction के पीछे कोई proper zone नहीं",
    shareCard: "📤 Share Card",
    downloadHighRes: "⬇️ Download High-Res PNG",
    copyImage: "🖼️ Copy Image",
    copyFormattedText: "📋 Copy Formatted Text",
    formattedPreview: "Formatted Text Preview (Telegram / WhatsApp)",
    imgCopyDone: "Picture copy हो गई",
    imgCopyDoneBody: "Signal card picture clipboard पर copy हो गई है।",
    imgCopyFail: "Picture copy नहीं हो सकी",
    imgCopyFailBody: "इस browser में picture copy supported नहीं — Download use करें।",
    dcaNote: "DCA: TP1 पर 50% profit लो, बाक़ी को TP2/TP3 तक चलने दो।",
    breakevenNote: "Breakeven: TP1 के बाद SL को entry पर ले जाओ।",
    stepSignal: "Signal मिला",
    stepEntry: "Entry zone",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade बंद",
    progression: "Progression",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Sentiment Wave — computed (prediction नहीं)",
    sentimentWaveNote: "ये sentiment असली RSI, trend और zones से हिसाब होता है — ये कोई prediction नहीं है।",
    demandIndex: "Demand Index",
    supplyIndex: "Supply Index",
    zoneCorridor: "Zone Corridor",
    histDetails: "Signal Details (recorded)",
    gatesNotSaved: "Gate details इस signal के लिए save नहीं हुई।",
    detailsBtn: "Details",
    pivotTitle: "Pivot Points (पिछला दिन)",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed अभी नहीं मिल सका।",
    riskProfile: "Risk Profile",
    riskConservative: "Conservative",
    riskModerate: "Moderate",
    riskAggressive: "Aggressive",
    riskConsText: "सिर्फ high-confluence signals — हर trade पर 1% risk",
    riskModText: "Standard — हर trade पर 1% risk",
    riskAggText: "ज़्यादा risk — हर trade पर 2% तक, drawdown ज़्यादा हो सकता है",
    riskProfileLine: "आपका risk profile",
    timezone: "Timezone",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    language: "Language",
    prefPair: "Preferred Pair",
    engineStatus: "Engine Status",
    prefSaved: "Preferences save हो गईं।",
    guideTitle: "Trade कैसे लें? — 4 आसान Steps",
    guideStep1: "सिर्फ BUY या SELL signal पर trade लें — WAIT पर कोई trade नहीं।",
    guideStep2: "Entry, SL और TP card पर लिखे हैं — SL से ज़्यादा risk नहीं लेना।",
    guideStep3: "Confirmation card पर ही है: score gate से ऊपर है, और नीचे \"Ye trade kyun?\" वाली वजह लिखी है।",
    guideStep4: "Best timeframe 1H है (4H भी ठीक है) — 15M सिर्फ entry timing के लिए है।",
    whyTradeTitle: "Ye trade kyun? — Confirmation",
    whyTrend: "Trend इस तरफ है",
    whyZone: "Price trade zone में है",
    whyZoneNear: "Price trade zone के क़रीब है",
    whySmcHigh: "SMC score 80+ है — smart money भी इस तरफ है",
    whyTopGate: "सबसे मज़बूत check",
    oneTradeLabel: "एक वक़्त पर सिर्फ एक trade",
    oneTradeNote: "एक वक़्त पर सिर्फ एक trade — दूसरी direction का setup नहीं दिखाया जाता।",
    gatesExplain: "6 checks, 100 number — signal सिर्फ 85+ पर बनता है (जैसे exam में pass marks)।",
    smcExplain: "5 हिस्से, 100 number — 80+ पर ठीक है (मज़बूत तस्दीक)।",
    gateLblTrendUp: "Trend ऊपर है (EMA)",
    gateLblTrendDown: "Trend नीचे है (EMA)",
    gateLblStructure: "Structure मज़बूत है",
    gateLblRsi: "RSI ठीक range में है",
    gateLblRr: "Reward risk से ज़्यादा है",
    gateLblEma200: "बड़ा trend (EMA200) साथ है",
    gateLblFresh: "Data ताज़ा है",
    smcLblSweep: "Liquidity sweep हुआ",
    smcLblStructure: "Market structure बदला",
    smcLblOb: "Order block मिला",
    smcLblFvg: "FVG gap मिला",
    smcLblRr: "Risk/reward ठीक है",
    chkLblSweep: "बड़े players ने liquidity ली",
    chkLblOb: "बड़े players का zone",
    chkLblFvg: "Price में ख़ाली जगह (gap)",
    chkLblSr: "मज़बूत support/resistance level",
    chkLblZones: "ख़रीदने/बेचने का area",
    extLblCandle: "Candle से trend का इशारा",
    extLblChoch: "Trend बदलने का इशारा",
    extLblMss: "नया trend confirm हुआ",
    extLblBreaker: "पहले का level अब support/resistance",
    extLblIdm: "झूठी move के बाद वापस",
    extLblFib: "Fibonacci level (हिसाब से)",
    extLblBb: "Volatility squeeze",
    extLblMacdDiv: "MACD और price में फ़र्क़",
    extLblMeanRev: "Price mean से कितना दूर है",
    extLblKillzone: "Session का active time",
    extLblAsian: "Asian session की range",
    extLblVwap: "VWAP bands (average price)",
    extLblVol: "Volume — कितना trade हुआ",
    smcNoSignalBanner: "SMC signal नहीं देता — ये Terminal signal की तस्दीक (confirmation) है।",
    smcConfirmStrong: "मज़बूत तस्दीक ✓",
    smcConfirmWeak: "तस्दीक कमज़ोर है — 80+ पर मज़बूत होती है",
    notASignalNote: "ये signal नहीं है — trade सिर्फ Terminal signal पर लें।",
    confirmationLbl: "तस्दीक",
    smcEngineHeader: "SMC ENGINE • ACTIVE",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · 15M Macro & 5M Entry",
    smcSetupQuality: "Setup Quality",
    smcGradeStrong: "A · Strong — मज़बूत",
    smcGradeModerate: "B · Moderate — दरमियानी",
    smcGradeDeveloping: "C · Developing — बन रहा है",
    smcGradeWeak: "D · Weak — कमज़ोर",
    smcWaiting80: "80% confirmation का इंतज़ार है",
    smcConfirmed80: "80% confirmation मिल गया — Terminal signal की तस्दीक मज़बूत है",
    smcBias: "SMC Bias (15M)",
    smcBiasBullish: "Bullish",
    smcBiasBearish: "Bearish",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Live move (entry से)",
    smcGenerated: "Generated",
    smcBeTip: "Break Even tip: +100 pips profit के बाद SL को Entry पर ले जाएँ — सिर्फ मशवरा है, auto नहीं होता।",
    smcFeedNote: "ये सिर्फ तस्दीक है — इस पर trade न लें, Terminal signal का इंतज़ार करें।",
    perfNoteTerminal: "Win rate सिर्फ Terminal signals से बनता है — SMC/Session इसमें नहीं गिने जाते।",
    smcTpNote: "TP2/TP3: सिर्फ TP1/SL का नतीजा record होता है।",
    smcInspectChart: "Inspect Chart",
    tgTitle: "Telegram Alerts — Signal Phone Par",
    tgText: "BUY/SELL signal आते ही आपके phone पर Telegram message आ जाएगा — website बंद हो तब भी। नीचे वाला link खोलें और bot पर Start दबाएँ।",
    tgButton: "📲 Telegram पर Alerts लें",
    tgPersonalTitle: "आपका Personal Telegram Link",
    tgPersonalText: "ये link सिर्फ आपका है — इससे alerts आपके account से जुड़ते हैं। Link खोलें, bot पर Start दबाएँ, बस! Plan खत्म या बंद होने पर alerts रुक जाएँगे।",
    tgLinked: "✅ Telegram alerts ON हैं — signal आते ही message मिलेगा।",
    tgNotLinked: "अभी Telegram alerts ON नहीं हैं — link खोल कर Start दबाएँ।",
    tgCopyLink: "Link Copy करें",
    tgLinkCopied: "आपका personal Telegram link copy हो गया — bot पर Start दबाएँ।",
    marketCards: "Live Market",
    pcMarketPrice: "Market Price (Last)",
    pcChange24h: "Daily / 24H Change",
    pcSpread: "Spread",
    pcKeyLevels: "Historical Key Levels",
    pcSources: "Sources",
    liveMarketPrice: "LIVE MARKET PRICE",
    awaitingConf: "AWAITING CONFLUENCE",
    scanningMarket: "Market scan हो रहा है — 85% confluence का इंतज़ार",
    confirmedTitle: "CONFIRMED INDICATORS",
    passedLbl: "PASSED",
    awaitingTitle: "AWAITING CONFIRMATION",
    pendingLbl: "PENDING",
    needsGate: "NEEDS 85%",
    requiredTitle: "REQUIRED BEFORE BUY OR SELL",
    requiredBuy: "FOR BUY CONFIRMATION",
    requiredSell: "FOR SELL CONFIRMATION",
    reqBuyTpl: "Bullish bounce off {a} — price reclaiming {b}",
    reqSellTpl: "Bearish rejection off {a} — price losing {b}",
    analyzeNow: "ANALYZE MARKET NOW",
    inspectInd: "INSPECT INDICATORS",
    downloadCard: "DOWNLOAD CARD",
    liveTick: "Real-time Tick Synced",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIDENCE",
    htfLbl: "Higher Timeframe Alignment",
    adxRanging: "20 से कम — trend नहीं (ranging)",
    adxTrend: "20 या ज़्यादा — trend मज़बूत है",
    smcConfirmLbl: "SMC Confirmation",
    rsiNeedBuy: "BUY को 50–70 चाहिए",
    rsiNeedSell: "SELL को 30–50 चाहिए",
    rrNeed: "R:R 1.5 चाहिए",
    bannerTerminal: "SIGNAL सिर्फ़ यहाँ से — BUY/SELL card पर trade लें",
    bannerSmc: "ये SIGNAL नहीं है — सिर्फ तस्दीक (confirmation) है",
    bannerSession: "ये सिर्फ वक़्त बताता है — signal नहीं देता",
    bannerHistory: "ये पुराने SIGNALS हैं — इन पर trade न लें, सिर्फ नतीजे देखें",
    bannerScanner: "ये सिर्फ ढूँढता है — signal Terminal में बनता है"
  },
  bn: {
    tagline: "সোনা, বিটকয়েন ও ফরেক্সের লাইভ সিগন্যাল",
    setupTitle: "প্রথমবার সেটআপ",
    setupText: "নিজের Admin username ও password নিজে তৈরি করুন। Password কাউকে পাঠাবেন না — শুধু আপনারই জানা উচিত।",
    setupBtn: "Admin Account তৈরি করুন",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "কোনো সিগন্যাল 100% লাভজনক নয়। প্রথমে demo-তে practice করুন, আসল টাকা তাড়াহুড়ো করে লাগাবেন না।",
    logout: "Logout",
    refresh: "Refresh",
    refreshing: "Refresh হচ্ছে…",
    lastUpdate: "শেষ আপডেট",
    secAgo: "সেকেন্ড আগে",
    tabTerminal: "Terminal",
    tabIndicators: "Indicators",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "History",
    tabAccount: "Account",
    tabAdmin: "Admin",
    howSignalTitle: "সিগন্যাল কখন ও কীভাবে তৈরি হয়?",
    howSignalText1: "সিগন্যালের কোনো নির্দিষ্ট সময় নেই। BUY/SELL তখনই তৈরি হয় যখন ৬টি gate-এ ৮৫% বা তার বেশি পয়েন্ট পাওয়া যায়। WAIT মানে: এখন trade করবেন না, শর্ত পূরণ হয়নি।",
    howSignalText2: "SMC-র gate আলাদা (৮০%) — SMC tab-এ দেখুন। Terminal-এর signal SMC gate-এর জন্য অপেক্ষা করে না।",
    tfHint: "সেরা timeframe: 1H (4H trend-এর সাথে) — 1H/4H-এ signals সবচেয়ে নির্ভরযোগ্য, 15M শুধু entry timing-এর জন্য, 5M-এ অনেক noise থাকে। (৯০ দিনের backtest, ৪ pairs: win rate ~60%, profit factor ~1.00 — breakeven, অতীতের ফলাফল, গ্যারান্টি নয়।)",
    rareSignals: "সিগন্যাল কম আসে, কিন্তু ভালো হয় — BUY/SELL শুধু তখনই দেখায় যখন ৮৫% gate পূরণ হয়। বেশি সিগন্যাল মানে ভালো ফলাফল নয়।",
    allPairsTitle: "সব Pairs — Live Prices",
    indCenterTitle: "Indicators Center",
    indCenterText: "এই সব সংখ্যা আসল Kraken candle থেকে হিসাব করে বের করা হয়েছে — EMA 20/50 trend দেখায়, RSI 14 momentum, আর ATR 14 দেখায় price সাধারণত কতটা নড়ে।",
    indTfNote: "নিচের মানগুলো 1H টাইমফ্রেমের — 15M ও Daily আলাদাভাবে নিচে দেওয়া আছে",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC-র level আসল 15M candle-এর swing high/low থেকে নেওয়া হয় — যেখানে বড় ক্রেতা/বিক্রেতারা সাধারণত অপেক্ষা করে। SMC score ৫ অংশ × ২০ পয়েন্টে তৈরি, gate ৮০%। Terminal-এর BUY/SELL এই tab থেকে তৈরি হয় না; এটা Terminal-এর নিজের ৮৫% শর্ত থেকে তৈরি হয়।",
    scannerTitle: "Global Market Scanner (১১ pairs, প্রতি ৪৫ সেকেন্ড)",
    smcPairCardsTitle: "SMC নিশ্চিতকরণ — প্রতিটি Pair",
    sessionTitle: "Session Engine",
    backtestTitle: "Session Backtest Simulator",
    backtestText: "আসল 1H candle-এ session rule চালিয়ে দেখুন।",
    backtestBtn: "Backtest চালান (৩০ দিন)",
    historyTitle: "Signal History",
    historyText: "শুধু আসলে record করা signals দেখানো হয় — কোনো পুরনো history বানানো হয়নি। ফলাফল (Win/Loss/Break-Even/In-Flight) পরের candle দিয়ে যাচাই করে দেখানো হয়।",
    refinerTitle: "Strategy Refiner",
    refinerText: "Cutoff শুধু এই build-এর পর record হওয়া signals-এ প্রযোজ্য, কারণ পুরনো signals-এ gate score save হয়নি।",
    marketClosedTitle: "বাজার বন্ধ",
    marketClosedText: "ফরেক্স ও সোনার বাজার শনি ও রবিবার বন্ধ থাকে — এই পেয়ারের জন্য কোনো নতুন সিগন্যাল তৈরি হবে না। এখানে দেখানো দাম সর্বশেষ উপলব্ধ দাম, লাইভ নয়।",
    marketClosedShort: "বাজার বন্ধ — সর্বশেষ উপলব্ধ দাম",
    accountTitle: "Account",
    adminTitle: "Admin Panel — Buyer Accounts",
    adminPlansText: "Monthly ৩০ দিন · Quarterly ৯০ দিন · Yearly ৩৬৫ দিন · Lifetime (কখনো শেষ হয় না)। Plan শেষ হলে buyer login নিজে থেকে বন্ধ হয়ে যায়।",
    createBuyerBtn: "Buyer তৈরি করুন",
    newsTitle: "Fundamental News",
    newsText: "সর্বশেষ forex/market headlines — FXStreet ও ForexLive-এর free RSS feed থেকে।",
    chartTitle: "Price Chart — Candles + EMA 20/50/200",
    indStripTitle: "Live Indicators",
    smcMacroTitle: "15M Macro",
    smcMicroTitle: "5M Micro",
    smcFeedTitle: "SMC Confirmation Feed — নিশ্চিতকরণ, signal নয়",
    smcBacktestTitle: "SMC Backtest",
    termBacktestTitle: "Terminal Backtest (৩০ দিন)",
    phSetupUser: "Admin username (কমপক্ষে ৩ অক্ষর)",
    phSetupPass: "Admin password (কমপক্ষে ৬ অক্ষর)",
    phLoginUser: "Username",
    phLoginPass: "Password",
    phBuyerUser: "Buyer username",
    phBuyerPass: "Buyer password",
    phAiQ: "প্রশ্ন লিখুন, যেমন: signal কখন তৈরি হয়?",
    hello: "আসসালামু আলাইকুম",
    loading: "Load হচ্ছে…",
    noTrade: "(কোনো trade নেই)",
    price: "Price",
    confluence: "Confluence",
    gate: "gate",
    buySellPlans: "BUY ও SELL plans — দুটো একসাথে",
    signalPlan: "Signal Plan — এক direction, এক trade",
    smcChecklist: "SMC Confluence Checklist — এই signal-এর আসল কারণ",
    oppScenario: "উল্টো দিকের scenario",
    oppGateNotMet: "gate পূরণ হয়নি",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zones (Demand / Supply)",
    chkYes: "✓ Support করে",
    chkNo: "✗ Support করে না",
    chkNa: "– Neutral",
    noSweep: "কোনো sweep হয়নি",
    noObDir: "এই দিকে order block পাওয়া যায়নি",
    noFvgDir: "এই দিকে FVG পাওয়া যায়নি",
    inDemand: "Price demand zone-এ আছে",
    inSupply: "Price supply zone-এ আছে",
    nearDemand: "Price demand zone-এর কাছে আছে",
    nearSupply: "Price supply zone-এর কাছে আছে",
    noZone: "Price কোনো zone-এ নেই",
    tradeZone: "Trade Zone",
    inZone: "IN ZONE — Zone-এ আছে",
    nearZone: "Price zone-এর কাছে আছে",
    farZone: "Price zone থেকে দূরে আছে",
    noZoneDir: "এই direction-এর জন্য কোনো zone পাওয়া যায়নি",
    bosUp: "Structure উপরে ভেঙেছে (BOS) — bullish",
    bosDown: "Structure নিচে ভেঙেছে (BOS) — bearish",
    noBreak: "কোনো structure break নেই — level ধরে আছে",
    extTitle: "Extended Confluence — 1H candle থেকে",
    extNote: "এই সব শুধু confluence-এর জন্য — signal-এর direction ও gates (85%/80%) এগুলো দিয়ে বদলায় না।",
    chkCandle: "Candlestick Pattern (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Breaker / Mitigation Blocks",
    chkIdm: "IDM (Inducement)",
    chkFib: "Fibonacci Levels",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "MACD Divergence",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Session Timing",
    chkAsian: "Asian Session Range",
    chkVwap: "VWAP Bands (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullish)",
    patShootingStar: "Shooting Star (bearish)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Morning Star (bullish)",
    patEveningStar: "Evening Star (bearish)",
    noPattern: "কোনো স্পষ্ট pattern নেই",
    chochUp: "CHOCH উপরে — trend-এর বিরুদ্ধে break",
    chochDown: "CHOCH নিচে — trend-এর বিরুদ্ধে break",
    noChoch: "কোনো CHOCH নেই",
    mssUp: "MSS উপরে — নতুন trend confirm",
    mssDown: "MSS নিচে — নতুন trend confirm",
    noMss: "কোনো MSS নেই",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "কোনো breaker/mitigation block নেই",
    idmSsl: "IDM পাওয়া গেছে — SSL sweep তারপর reclaim (bullish)",
    idmBsl: "IDM পাওয়া গেছে — BSL sweep তারপর reclaim (bearish)",
    noIdm: "কোনো IDM নেই",
    fibNearest: "Nearest level",
    squeezeOn: "Squeeze আছে — volatility কম, বড় move আসতে পারে",
    squeezeOff: "কোনো squeeze নেই",
    meanNear: "Mean-এর কাছে",
    meanExtended: "Mean থেকে দূরে",
    meanOver: "অনেক overextended",
    aboveMean: "mean-এর উপরে",
    belowMean: "mean-এর নিচে",
    macdBullDiv: "Bullish divergence — price নিচে, MACD উপরে",
    macdBearDiv: "Bearish divergence — price উপরে, MACD নিচে",
    noMacdDiv: "কোনো MACD divergence নেই",
    killActive: "Active killzone",
    killNext: "পরের killzone",
    kzAsian: "Asian",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Price range-এর ভিতরে আছে",
    asianAbove: "Price range-এর উপরে বেরিয়ে গেছে (expansion)",
    asianBelow: "Price range-এর নিচে বেরিয়ে গেছে (expansion)",
    noAsian: "Asian range পাওয়া যায়নি",
    vwapNearest: "Nearest band",
    volRising: "Volume বাড়ছে",
    volFalling: "Volume কমছে",
    volNormal: "Volume normal",
    volNa: "এই pair-এ volume পাওয়া যায় না",
    dxyTitle: "Dollar Index (DXY)",
    dxyNa: "DXY এখন available নয় — Yahoo থেকে পাওয়া যায়নি",
    corrLabel: "Correlation (20-period)",
    corrNeg: "negative",
    corrPos: "positive",
    corrFlat: "দুর্বল",
    riskTitle: "Risk Management — নির্দেশনা (live trade management নয়)",
    riskRrTarget: "R:R 1:2-র target — TP3-তে পূরণ হয়",
    riskTp1: "TP1-তে 50% profit নিন, তারপর SL breakeven (entry)-তে নিয়ে যান।",
    riskSize: "Position size: প্রতি trade-এ account-এর মাত্র 1% risk করুন।",
    riskDd: "Drawdown control: এক trade-এ 1%-এর বেশি risk নয় — loss ছোট রাখুন।",
    sentiment: "24H Sentiment",
    demandZone: "Demand Zone",
    supplyZone: "Supply Zone",
    liveComments: "Live Comments",
    nextCheck: "Next check in",
    nextCheckSuffix: "s (৩০ সেকেন্ড monitoring)",
    signalUpdated: "Signal updated",
    buyGates: "BUY Gates",
    sellGates: "SELL Gates",
    entryZone: "Entry Zone",
    trigger: "Trigger",
    scorecard: "Scorecard",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatility",
    volume: "Volume",
    structure: "Structure",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M ও Daily",
    smcScore: "SMC Score",
    gatePass: "Gate পেরিয়েছে!",
    gateNotMet: "gate পূরণ হয়নি",
    swingLevels: "Swing Levels",
    swingHigh: "শেষ Swing High",
    swingLow: "শেষ Swing Low",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "Bullish OB",
    bearOB: "Bearish OB",
    fresh: "fresh",
    mitigated: "mitigated",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "কোনো FVG পাওয়া যায়নি।",
    microSweeps: "5M Micro SSL sweeps",
    liqPools: "Liquidity pools",
    pair: "Pair",
    direction: "Direction",
    confirmedSignals: "SMC confirmations (নিশ্চিতকরণ)",
    cycleEvery: "Cycle: প্রতি",
    cycleSec: "second",
    sessionActive: "Active",
    nowPkt: "এখন PKT time",
    nextSession: "পরের session",
    minutes: "minute-এ",
    newsBlackout: "News blackout",
    notAvailable: "Available নয়",
    sessionStats: "Session stats",
    total: "Total",
    sessionHistoryBtn: "Session History দেখুন",
    noSessionSignals: "এখনো কোনো session signal record হয়নি।",
    backtestRunning: "Backtest চলছে…",
    trades: "Trades",
    wins: "Wins",
    losses: "Losses",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalExecuted: "Total Executed",
    breakEven: "Break-Even",
    inFlight: "In-Flight",
    noClosed: "— (এখনো কোনো closed signal নেই)",
    noSignals: "এখনো কোনো signal record হয়নি।",
    cutoff: "Cutoff",
    qualifying: "Qualifying setups",
    simWinRate: "Simulated Win Rate",
    allOutcomes: "সব outcomes",
    allEngines: "সব engines",
    mainTerminal: "Main Terminal",
    smcEngine: "SMC Engine",
    sessionEngine: "Session Engine",
    newsIntel: "News Intelligence",
    username: "Username",
    role: "Role",
    plan: "Plan",
    planExpiry: "প্ল্যানের মেয়াদ",
    daysLeft: "দিন বাকি আছে",
    lifetimeNever: "Lifetime — কখনও শেষ হয় না",
    managePlan: "প্ল্যান বদলাতে চাইলে admin-এর সঙ্গে যোগাযোগ করুন",
    signals: "Signals",
    engines: "Engines",
    engineOffNote: "OFF engine আসলে বন্ধ হয়ে যায় — তার signals তৈরি হয় না। Test Push শুধু app-এর ভিতরে test message, আসল push notification নয়।",
    testPushBtn: "Test Push (in-app test)",
    testPushMsg: "Test push (in-app): এটা শুধু test, আসল push notification নয়।",
    historyTabText: "History tab-এ সব signals আছে।",
    openHistory: "History খুলুন",
    tfLoading: "TF Matrix load হচ্ছে…",
    exportText: "Signals CSV-তে download করুন।",
    exportBtn: "Export CSV",
    aiTitle: "AI Agent — in-app only.",
    aiText: "এটা কোনো live AI service নয়, শুধু app-এর ভিতরের helper।",
    aiAsk: "জিজ্ঞাসা করুন",
    defaultPair: "Default pair",
    saved: "Save হয়েছে।",
    totalBuyers: "Total buyers",
    expired: "Expired",
    bandHai: "বন্ধ আছে",
    active: "Active",
    lifetime: "Lifetime",
    expiry: "Expiry",
    extend30: "+৩০ দিন",
    suspend: "বন্ধ করা",
    reopen: "খোলা",
    changePass: "Password বদলান",
    delete: "Delete",
    noBuyers: "এখনো কোনো buyer নেই।",
    buyerCreated: "Buyer তৈরি হয়েছে",
    passChanged: "Password বদলে গেছে।",
    ownPassTitle: "নিজের password বদলান",
    phNewPass: "নতুন password (কমপক্ষে ৬ অক্ষর)",
    phConfirmPass: "Password আবার লিখুন",
    passTooShort: "Password কমপক্ষে ৬ অক্ষরের হতে হবে",
    passMismatch: "দুটো password এক নয়",
    saveBtn: "Save করুন",
    cancelBtn: "Cancel করুন",
    newPassPrompt: "নতুন password (কমপক্ষে ৬ অক্ষর):",
    deleteConfirm: "কে delete করবেন?",
    serverUnreachable: "Server-এর সাথে যোগাযোগ হচ্ছে না:",
    priceLoadFail: "Price load হয়নি:",
    signalLoadFail: "Signal load হয়নি:",
    indLoadFail: "Indicators load হয়নি:",
    indNoData: "Indicators-এর জন্য candle পাওয়া যায়নি।",
    smcLoadFail: "SMC load হয়নি:",
    smcNoData: "SMC data পাওয়া যায়নি।",
    scannerFail: "Scanner load হয়নি:",
    sessionLoadFail: "Session load হয়নি:",
    newsFail: "News এখন পাওয়া যাচ্ছে না — একটু পরে আবার চেষ্টা করুন।",
    newsFallbackNote: "একটি ফিড বন্ধ — দেখানো শিরোনামগুলো চালু ফিড থেকে",
    newsUpdated: "Updated",
    newSignal: "নতুন Signal!",
    alertsNote: "Alerts শুধু তখনই কাজ করে যখন site খোলা থাকে — বন্ধ tab বা বন্ধ phone-এ নয়।",
    sound: "Sound",
    notifications: "Notifications",
    status: "Status",
    session: "Session",
    pktTime: "PKT Time",
    quality: "Quality",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "এখনো কোনো SMC নিশ্চিতকরণ record হয়নি।",
    smcBacktestRunning: "SMC backtest চলছে…",
    termBacktestRunning: "Terminal backtest চলছে…",
    termBacktestNote: "গত ৩০ দিন, 1H candle — ভবিষ্যতের গ্যারান্টি নয়। Baseline = Terminal engine (৬ gates, ৮৫% gate)। Filters সব pair-এ উন্নতি দেখায়নি, তাই live engine-এ কোনো filter লাগানো হয়নি।",
    termBacktestBtn: "Terminal Backtest চালান",
    smcBacktestBtn: "SMC Backtest চালান (৩০ দিন)",
    smcBacktestNote: "আসল 15M candle-এ SMC rule (score ৮০%+) — কোনো বানানো সংখ্যা নয়।",
    filter: "Filter",
    baseline: "Baseline",
    macdAgree: "MACD agree",
    noDeadHours: "No dead hours",
    chartNoData: "Chart-এর জন্য candle পাওয়া যায়নি।",
    allSessions: "সব Sessions (PKT time)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Market Structure (BOS/MSS)",
    buyNow: "🟢 BUY করুন",
    sellNow: "🔴 SELL করুন",
    waitNoTrade: "⏳ WAIT — কোনো trade নেই",
    bannerLine: "এখনই এই trade করুন — Entry, SL ও TP নিচে দেওয়া আছে।",
    approaching: "APPROACHING — কাছে আসছে",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Overview",
    engineControls: "Engine Controls",
    signalDetails: "Signal Details",
    signalHistory: "Signal History",
    tfMatrix: "TF Matrix",
    trackingLogs: "Tracking Logs",
    exportCsv: "Export CSV",
    aiAgent: "AI Agent",
    preferences: "Preferences",
    copySignal: "📋 Signal Copy করুন",
    downloadSignal: "⬇️ Picture Download করুন",
    copyDone: "Signal copy হয়েছে",
    copyDoneBody: "Signal text copy হয়েছে — WhatsApp বা Telegram-এ paste করুন।",
    copyFailBody: "Copy করা যায়নি — text হাতে select করে copy করুন।",
    imgDone: "Picture download হয়েছে",
    imgDoneBody: "Signal card picture download হয়েছে।",
    imgFail: "Picture download হয়নি — আবার চেষ্টা করুন।",
    shareDisclaimer: "কোনো signal 100% লাভজনক নয়।",
    close: "বন্ধ করুন",
    scanNow: "🔍 Scan Now",
    scanning: "Scanning…",
    monitorEvery: "প্রতি",
    stopMonitoring: "⏸ Stop",
    startMonitoring: "▶ Start",
    monitoringOff: "Monitoring বন্ধ আছে — Start চাপুন",
    scanDone: "Scan হয়েছে",
    scanDoneBody: "সব pairs আবার scan হয়েছে।",
    scanFailBody: "Scan হয়নি — আবার চেষ্টা করুন।",
    bestTimeframe: "সেরা timeframe: 1H (4H-ও চলে) — 15M শুধু entry timing-এর জন্য",
    signalCode: "Signal Code",
    validUntil: "Valid until",
    newSignalPopup: "Signal এসে গেছে!",
    whyWait: "Why Wait? — WAIT কেন?",
    copyWaitAnalysis: "📋 WAIT Analysis Copy করুন",
    waitCopyDone: "WAIT analysis copy হয়েছে",
    waitCopyDoneBody: "WAIT analysis copy হয়েছে — WhatsApp বা Telegram-এ paste করুন।",
    smcBelowGate: "SMC gate-এর নিচে আছে",
    zoneBlockedReason: "Direction-এর পেছনে কোনো proper zone নেই",
    shareCard: "📤 Share Card",
    downloadHighRes: "⬇️ Download High-Res PNG",
    copyImage: "🖼️ Copy Image",
    copyFormattedText: "📋 Copy Formatted Text",
    formattedPreview: "Formatted Text Preview (Telegram / WhatsApp)",
    imgCopyDone: "Picture copy হয়েছে",
    imgCopyDoneBody: "Signal card picture clipboard-এ copy হয়েছে।",
    imgCopyFail: "Picture copy হয়নি",
    imgCopyFailBody: "এই browser-এ picture copy supported নয় — Download ব্যবহার করুন।",
    dcaNote: "DCA: TP1-তে 50% profit নিন, বাকিটা TP2/TP3 পর্যন্ত চলতে দিন।",
    breakevenNote: "Breakeven: TP1-এর পর SL entry-তে নিয়ে যান।",
    stepSignal: "Signal পাওয়া গেছে",
    stepEntry: "Entry zone",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade বন্ধ",
    progression: "Progression",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Sentiment Wave — হিসাব করা (prediction নয়)",
    sentimentWaveNote: "এই sentiment আসল RSI, trend ও zone থেকে হিসাব করা হয় — এটা কোনো prediction নয়।",
    demandIndex: "Demand Index",
    supplyIndex: "Supply Index",
    zoneCorridor: "Zone Corridor",
    histDetails: "Signal Details (recorded)",
    gatesNotSaved: "এই signal-এর জন্য gate details save হয়নি।",
    detailsBtn: "Details",
    pivotTitle: "Pivot Points (গত দিন)",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed এখন পাওয়া যায়নি।",
    riskProfile: "Risk Profile",
    riskConservative: "Conservative",
    riskModerate: "Moderate",
    riskAggressive: "Aggressive",
    riskConsText: "শুধু high-confluence signals — প্রতি trade-এ 1% risk",
    riskModText: "Standard — প্রতি trade-এ 1% risk",
    riskAggText: "বেশি risk — প্রতি trade-এ 2% পর্যন্ত, drawdown বেশি হতে পারে",
    riskProfileLine: "আপনার risk profile",
    timezone: "Timezone",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    language: "Language",
    prefPair: "Preferred Pair",
    engineStatus: "Engine Status",
    prefSaved: "Preferences save হয়েছে।",
    guideTitle: "Trade কীভাবে নেবেন? — ৪ সহজ ধাপ",
    guideStep1: "শুধু BUY বা SELL signal-এ trade নিন — WAIT-এ কোনো trade নয়।",
    guideStep2: "Entry, SL ও TP card-এ লেখা আছে — SL-এর বেশি risk নেবেন না।",
    guideStep3: "Confirmation card-এই আছে: score gate-এর উপরে, আর নিচে \"Ye trade kyun?\" কারণ লেখা আছে।",
    guideStep4: "সেরা timeframe 1H (4H-ও চলে) — 15M শুধু entry timing-এর জন্য।",
    whyTradeTitle: "এই trade কেন? — Confirmation",
    whyTrend: "Trend এই দিকে আছে",
    whyZone: "Price trade zone-এ আছে",
    whyZoneNear: "Price trade zone-এর কাছে আছে",
    whySmcHigh: "SMC score 80+ — smart money-ও এই দিকে আছে",
    whyTopGate: "সবচেয়ে শক্তিশালী check",
    oneTradeLabel: "এক সময়ে শুধু এক trade",
    oneTradeNote: "এক সময়ে শুধু এক trade — অন্য direction-এর setup দেখানো হয় না।",
    gatesExplain: "৬ checks, ১০০ নম্বর — signal শুধু ৮৫+-এ তৈরি হয় (পরীক্ষায় pass marks-এর মতো)।",
    smcExplain: "৫ অংশ, ১০০ নম্বর — ৮০+ ভালো (শক্তিশালী নিশ্চিতকরণ)।",
    gateLblTrendUp: "Trend উপরে আছে (EMA)",
    gateLblTrendDown: "Trend নিচে আছে (EMA)",
    gateLblStructure: "Structure শক্তিশালী",
    gateLblRsi: "RSI ভালো range-এ আছে",
    gateLblRr: "Reward risk-এর চেয়ে বেশি",
    gateLblEma200: "বড় trend (EMA200) সাথে আছে",
    gateLblFresh: "Data তাজা",
    smcLblSweep: "Liquidity sweep হয়েছে",
    smcLblStructure: "Market structure বদলেছে",
    smcLblOb: "Order block পাওয়া গেছে",
    smcLblFvg: "FVG gap পাওয়া গেছে",
    smcLblRr: "Risk/reward ঠিক আছে",
    chkLblSweep: "বড় players liquidity নিয়েছে",
    chkLblOb: "বড় players-এর zone",
    chkLblFvg: "Price-এ খালি জায়গা (gap)",
    chkLblSr: "শক্তিশালী support/resistance level",
    chkLblZones: "কেনা/বেচার এলাকা",
    extLblCandle: "Candle থেকে trend-এর ইঙ্গিত",
    extLblChoch: "Trend বদলের ইঙ্গিত",
    extLblMss: "নতুন trend confirm হয়েছে",
    extLblBreaker: "আগের level এখন support/resistance",
    extLblIdm: "ভুয়া move-এর পর ফিরে আসা",
    extLblFib: "Fibonacci level (হিসাব থেকে)",
    extLblBb: "Volatility squeeze",
    extLblMacdDiv: "MACD ও price-এ পার্থক্য",
    extLblMeanRev: "Price mean থেকে কত দূরে",
    extLblKillzone: "Session-এর active time",
    extLblAsian: "Asian session-এর range",
    extLblVwap: "VWAP bands (average price)",
    extLblVol: "Volume — কত trade হয়েছে",
    smcNoSignalBanner: "SMC signal দেয় না — এটা Terminal signal-এর নিশ্চিতকরণ (confirmation)।",
    smcConfirmStrong: "শক্তিশালী নিশ্চিতকরণ ✓",
    smcConfirmWeak: "নিশ্চিতকরণ দুর্বল — ৮০+-এ শক্তিশালী হয়",
    notASignalNote: "এটা signal নয় — শুধু Terminal signal-এ trade নিন।",
    confirmationLbl: "নিশ্চিতকরণ",
    smcEngineHeader: "SMC ENGINE • ACTIVE",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · 15M Macro & 5M Entry",
    smcSetupQuality: "Setup Quality",
    smcGradeStrong: "A · Strong — শক্তিশালী",
    smcGradeModerate: "B · Moderate — মাঝারি",
    smcGradeDeveloping: "C · Developing — তৈরি হচ্ছে",
    smcGradeWeak: "D · Weak — দুর্বল",
    smcWaiting80: "৮০% confirmation-এর অপেক্ষায়",
    smcConfirmed80: "৮০% confirmation পাওয়া গেছে — Terminal signal-এর নিশ্চিতকরণ শক্তিশালী",
    smcBias: "SMC Bias (15M)",
    smcBiasBullish: "Bullish",
    smcBiasBearish: "Bearish",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Live move (entry থেকে)",
    smcGenerated: "Generated",
    smcBeTip: "Break Even tip: +100 pips profit-এর পর SL Entry-তে নিয়ে যান — শুধু পরামর্শ, auto নয়।",
    smcFeedNote: "এটা শুধু নিশ্চিতকরণ — এতে trade নেবেন না, Terminal signal-এর অপেক্ষা করুন।",
    perfNoteTerminal: "Win rate শুধু Terminal signals থেকে তৈরি হয় — SMC/Session এতে গোনা হয় না।",
    smcTpNote: "TP2/TP3: শুধু TP1/SL-এর ফলাফল record হয়।",
    smcInspectChart: "Inspect Chart",
    tgTitle: "Telegram Alerts — Signal Phone-এ",
    tgText: "BUY/SELL signal আসতেই আপনার phone-এ Telegram message চলে আসবে — website বন্ধ থাকলেও। নিচের link খুলুন আর bot-এ Start চাপুন।",
    tgButton: "📲 Telegram-এ Alerts নিন",
    tgPersonalTitle: "আপনার Personal Telegram Link",
    tgPersonalText: "এই link শুধু আপনার — এতে alerts আপনার account-এর সাথে যুক্ত হয়। Link খুলুন, bot-এ Start চাপুন, ব্যস! Plan শেষ বা বন্ধ হলে alerts থেমে যাবে।",
    tgLinked: "✅ Telegram alerts ON আছে — signal আসতেই message পাবেন।",
    tgNotLinked: "Telegram alerts এখনো ON নয় — link খুলে Start চাপুন।",
    tgCopyLink: "Link Copy করুন",
    tgLinkCopied: "আপনার personal Telegram link copy হয়েছে — bot-এ Start চাপুন।",
    marketCards: "Live Market",
    pcMarketPrice: "Market Price (Last)",
    pcChange24h: "Daily / 24H Change",
    pcSpread: "Spread",
    pcKeyLevels: "Historical Key Levels",
    pcSources: "Sources",
    liveMarketPrice: "LIVE MARKET PRICE",
    awaitingConf: "AWAITING CONFLUENCE",
    scanningMarket: "Market scan হচ্ছে — ৮৫% confluence-এর অপেক্ষা",
    confirmedTitle: "CONFIRMED INDICATORS",
    passedLbl: "PASSED",
    awaitingTitle: "AWAITING CONFIRMATION",
    pendingLbl: "PENDING",
    needsGate: "NEEDS 85%",
    requiredTitle: "REQUIRED BEFORE BUY OR SELL",
    requiredBuy: "FOR BUY CONFIRMATION",
    requiredSell: "FOR SELL CONFIRMATION",
    reqBuyTpl: "Bullish bounce off {a} — price reclaiming {b}",
    reqSellTpl: "Bearish rejection off {a} — price losing {b}",
    analyzeNow: "ANALYZE MARKET NOW",
    inspectInd: "INSPECT INDICATORS",
    downloadCard: "DOWNLOAD CARD",
    liveTick: "Real-time Tick Synced",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIDENCE",
    htfLbl: "Higher Timeframe Alignment",
    adxRanging: "২০-এর কম — trend নেই (ranging)",
    adxTrend: "২০ বা বেশি — trend শক্তিশালী",
    smcConfirmLbl: "SMC Confirmation",
    rsiNeedBuy: "BUY-এর ৫০–৭০ দরকার",
    rsiNeedSell: "SELL-এর ৩০–৫০ দরকার",
    rrNeed: "R:R 1.5 দরকার",
    bannerTerminal: "SIGNAL শুধু এখান থেকে — BUY/SELL card-এ trade নিন",
    bannerSmc: "এটা SIGNAL নয় — শুধু নিশ্চিতকরণ (confirmation)",
    bannerSession: "এটা শুধু সময় বলে — signal দেয় না",
    bannerHistory: "এগুলো পুরনো SIGNALS — এতে trade নেবেন না, শুধু ফলাফল দেখুন",
    bannerScanner: "এটা শুধু খোঁজে — signal Terminal-এ তৈরি হয়"
  },
  es: {
    tagline: "Señales en vivo de oro, Bitcoin y Forex",
    setupTitle: "Configuración inicial",
    setupText: "Crea tu propio nombre de usuario y contraseña de Admin. Nunca envíes tu contraseña a nadie — solo tú debes conocerla.",
    setupBtn: "Crear cuenta de Admin",
    loginTitle: "Iniciar sesión",
    loginBtn: "Iniciar sesión",
    finePrint: "Ninguna señal es 100% rentable. Practica primero en demo, no arriesgues dinero real con prisa.",
    logout: "Cerrar sesión",
    refresh: "Actualizar",
    refreshing: "Actualizando…",
    lastUpdate: "Última actualización",
    secAgo: "seg. atrás",
    tabTerminal: "Terminal",
    tabIndicators: "Indicadores",
    tabSmc: "SMC",
    tabSession: "Sesión",
    tabHistory: "Historial",
    tabAccount: "Cuenta",
    tabAdmin: "Admin",
    howSignalTitle: "¿Cuándo y cómo se forma una señal?",
    howSignalText1: "No hay un horario fijo para una señal. BUY/SELL solo se forma cuando se obtienen 85% o más de los puntos en las 6 puertas. WAIT significa: no operes ahora, las condiciones no se cumplen.",
    howSignalText2: "La puerta de SMC es independiente (80%) — mira la pestaña SMC. La señal de la Terminal no espera a la puerta de SMC.",
    tfHint: "Mejor marco temporal: 1H (con la tendencia de 4H) — las señales son más fiables en 1H/4H; 15M es solo para el momento de entrada y 5M tiene demasiado ruido. (Backtest de 90 días, 4 pares: tasa de aciertos ~60%, factor de beneficio ~1.00 — punto de equilibrio, un resultado pasado, no una garantía.)",
    rareSignals: "Las señales son pocas pero de mejor calidad — BUY/SELL solo aparece cuando se supera la puerta del 85%. Más señales no significa mejores resultados.",
    allPairsTitle: "Todos los pares — Precios en vivo",
    indCenterTitle: "Centro de indicadores",
    indCenterText: "Todos estos números se calculan a partir de velas reales de Kraken — EMA 20/50 muestra la tendencia, RSI 14 el impulso, y ATR 14 cuánto suele moverse el precio.",
    indTfNote: "Los valores siguientes son de 1H — 15M y Diario están aparte abajo",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "Los niveles de SMC provienen de los máximos y mínimos reales de las velas de 15M — donde suelen esperar los grandes compradores y vendedores. La puntuación de SMC se compone de 5 partes × 20 puntos, puerta 80%. El BUY/SELL de la Terminal no proviene de esta pestaña; usa las propias condiciones del 85% de la Terminal.",
    scannerTitle: "Escáner global de mercado (11 pares, cada 45 segundos)",
    smcPairCardsTitle: "Confirmación SMC — Cada par",
    sessionTitle: "Motor de sesiones",
    backtestTitle: "Simulador de backtest de sesión",
    backtestText: "Ejecuta la regla de sesión en velas reales de 1H.",
    backtestBtn: "Ejecutar backtest (30 días)",
    historyTitle: "Historial de señales",
    historyText: "Solo se muestran las señales realmente registradas — no se inventó ningún historial pasado. El resultado (Win/Loss/Break-Even/In-Flight) se comprueba con las velas posteriores.",
    refinerTitle: "Refinador de estrategia",
    refinerText: "El límite solo se aplica a las señales registradas después de esta versión, porque las señales antiguas no guardaron la puntuación de puerta.",
    marketClosedTitle: "Mercado cerrado",
    marketClosedText: "El mercado de forex y oro está cerrado el sábado y el domingo: no se formará ninguna señal nueva para este par. El precio mostrado es el último disponible, no en vivo.",
    marketClosedShort: "Mercado cerrado — último precio disponible",
    accountTitle: "Cuenta",
    adminTitle: "Panel de Admin — Cuentas de compradores",
    adminPlansText: "Mensual 30 días · Trimestral 90 días · Anual 365 días · De por vida (nunca caduca). Cuando termina el plan, el acceso del comprador se bloquea automáticamente.",
    createBuyerBtn: "Crear comprador",
    newsTitle: "Noticias fundamentales",
    newsText: "Últimos titulares de forex/mercado — de los feeds RSS gratuitos de FXStreet y ForexLive.",
    chartTitle: "Gráfico de precios — Velas + EMA 20/50/200",
    indStripTitle: "Indicadores en vivo",
    smcMacroTitle: "Macro 15M",
    smcMicroTitle: "Micro 5M",
    smcFeedTitle: "Feed de confirmación SMC — confirmación, no señal",
    smcBacktestTitle: "Backtest de SMC",
    termBacktestTitle: "Backtest de Terminal (30 días)",
    phSetupUser: "Nombre de usuario de Admin (mín. 3 caracteres)",
    phSetupPass: "Contraseña de Admin (mín. 6 caracteres)",
    phLoginUser: "Nombre de usuario",
    phLoginPass: "Contraseña",
    phBuyerUser: "Nombre de usuario del comprador",
    phBuyerPass: "Contraseña del comprador",
    phAiQ: "Escribe una pregunta, p. ej.: ¿cuándo se forma una señal?",
    hello: "Hola",
    loading: "Cargando…",
    noTrade: "(sin operación)",
    price: "Precio",
    confluence: "Confluencia",
    gate: "puerta",
    buySellPlans: "Planes de BUY y SELL — ambos juntos",
    signalPlan: "Plan de señal — una dirección, una operación",
    smcChecklist: "Lista de confluencia SMC — el motivo real de esta señal",
    oppScenario: "Escenario opuesto",
    oppGateNotMet: "puerta no superada",
    chkSweep: "Barrido de liquidez",
    chkOB: "Bloque de órdenes",
    chkFvg: "FVG (Brecha de valor justo)",
    chkSR: "Soporte / Resistencia",
    chkZones: "Zonas (Demanda / Oferta)",
    chkYes: "✓ Apoya",
    chkNo: "✗ No apoya",
    chkNa: "– Neutral",
    noSweep: "No hubo barrido",
    noObDir: "No se encontró bloque de órdenes en esta dirección",
    noFvgDir: "No se encontró FVG en esta dirección",
    inDemand: "El precio está en la zona de demanda",
    inSupply: "El precio está en la zona de oferta",
    nearDemand: "El precio está cerca de la zona de demanda",
    nearSupply: "El precio está cerca de la zona de oferta",
    noZone: "El precio no está en ninguna zona",
    tradeZone: "Zona de operación",
    inZone: "EN ZONA — IN ZONE",
    nearZone: "El precio está cerca de la zona",
    farZone: "El precio está lejos de la zona",
    noZoneDir: "No se encontró zona para esta dirección",
    bosUp: "La estructura se rompió al alza (BOS) — alcista",
    bosDown: "La estructura se rompió a la baja (BOS) — bajista",
    noBreak: "Sin ruptura de estructura — el nivel se mantuvo",
    extTitle: "Confluencia ampliada — de velas de 1H",
    extNote: "Todo esto es solo confluencia — no cambia la dirección de la señal ni las puertas (85%/80%).",
    chkCandle: "Patrón de velas (1H)",
    chkChoch: "CHOCH (Cambio de carácter)",
    chkMss: "MSS (Cambio de estructura de mercado)",
    chkBreaker: "Bloques breaker / mitigación",
    chkIdm: "IDM (Inducción)",
    chkFib: "Niveles de Fibonacci",
    chkBb: "Compresión de Bollinger",
    chkMacdDiv: "Divergencia MACD",
    chkMeanRev: "Reversión a la media",
    chkKillzone: "Killzone / Horario de sesión",
    chkAsian: "Rango de la sesión asiática",
    chkVwap: "Bandas VWAP (±1σ / ±2σ)",
    chkVol: "Volumen (1H)",
    patBullEngulf: "Envolvente alcista",
    patBearEngulf: "Envolvente bajista",
    patHammer: "Martillo / Pin Bar (alcista)",
    patShootingStar: "Estrella fugaz (bajista)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Estrella de la mañana (alcista)",
    patEveningStar: "Estrella de la tarde (bajista)",
    noPattern: "Sin patrón claro",
    chochUp: "CHOCH al alza — ruptura contra la tendencia",
    chochDown: "CHOCH a la baja — ruptura contra la tendencia",
    noChoch: "Sin CHOCH",
    mssUp: "MSS al alza — nueva tendencia confirmada",
    mssDown: "MSS a la baja — nueva tendencia confirmada",
    noMss: "Sin MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigación",
    noBreaker: "Sin bloque breaker/mitigación",
    idmSsl: "IDM encontrado — barrido SSL y luego recuperación (alcista)",
    idmBsl: "IDM encontrado — barrido BSL y luego recuperación (bajista)",
    noIdm: "Sin IDM",
    fibNearest: "Nivel más cercano",
    squeezeOn: "Hay compresión — volatilidad baja, puede venir un gran movimiento",
    squeezeOff: "Sin compresión",
    meanNear: "Cerca de la media",
    meanExtended: "Lejos de la media",
    meanOver: "Muy sobre-extendido",
    aboveMean: "por encima de la media",
    belowMean: "por debajo de la media",
    macdBullDiv: "Divergencia alcista — precio más bajo, MACD más alto",
    macdBearDiv: "Divergencia bajista — precio más alto, MACD más bajo",
    noMacdDiv: "Sin divergencia MACD",
    killActive: "Killzone activa",
    killNext: "Siguiente killzone",
    kzAsian: "Asiática",
    kzLondon: "Londres",
    kzNewYork: "Nueva York",
    asianIn: "El precio está dentro del rango",
    asianAbove: "El precio se expandió por encima del rango",
    asianBelow: "El precio se expandió por debajo del rango",
    noAsian: "No se encontró rango asiático",
    vwapNearest: "Banda más cercana",
    volRising: "El volumen está subiendo",
    volFalling: "El volumen está bajando",
    volNormal: "Volumen normal",
    volNa: "No hay volumen disponible para este par",
    dxyTitle: "Índice del dólar (DXY)",
    dxyNa: "DXY no está disponible ahora — no llegó de Yahoo",
    corrLabel: "Correlación (20 periodos)",
    corrNeg: "negativa",
    corrPos: "positiva",
    corrFlat: "débil",
    riskTitle: "Gestión de riesgo — orientación (no gestión de operaciones en vivo)",
    riskRrTarget: "Objetivo R:R 1:2 — se alcanza en TP3",
    riskTp1: "En TP1 toma el 50% del beneficio, luego mueve el SL a punto de equilibrio (entrada).",
    riskSize: "Tamaño de posición: arriesga solo el 1% de tu cuenta por operación.",
    riskDd: "Control de drawdown: nunca arriesgues más del 1% en una operación — mantén las pérdidas pequeñas.",
    sentiment: "Sentimiento 24H",
    demandZone: "Zona de demanda",
    supplyZone: "Zona de oferta",
    liveComments: "Comentarios en vivo",
    nextCheck: "Próxima comprobación en",
    nextCheckSuffix: "s (monitoreo de 30 segundos)",
    signalUpdated: "Señal actualizada",
    buyGates: "Puertas de BUY",
    sellGates: "Puertas de SELL",
    entryZone: "Zona de entrada",
    trigger: "Disparador",
    scorecard: "Tarjeta de puntuación",
    trend: "Tendencia",
    momentum: "Impulso",
    volatility: "Volatilidad",
    volume: "Volumen",
    structure: "Estructura",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M y Diario",
    smcScore: "Puntuación SMC",
    gatePass: "¡Puerta superada!",
    gateNotMet: "puerta no superada",
    swingLevels: "Niveles de swing",
    swingHigh: "Último swing alto",
    swingLow: "Último swing bajo",
    liqSweeps: "Barridos de liquidez",
    orderBlocks: "Bloques de órdenes",
    bullOB: "OB alcista",
    bearOB: "OB bajista",
    fresh: "fresco",
    mitigated: "mitigado",
    fvg: "Brechas de valor justo (FVG)",
    noFvg: "No se encontró FVG.",
    microSweeps: "Barridos SSL micro de 5M",
    liqPools: "Reservas de liquidez",
    pair: "Par",
    direction: "Dirección",
    confirmedSignals: "Confirmaciones SMC",
    cycleEvery: "Ciclo: cada",
    cycleSec: "segundos",
    sessionActive: "Activa",
    nowPkt: "Hora PKT actual",
    nextSession: "Siguiente sesión",
    minutes: "minutos",
    newsBlackout: "Apagón de noticias",
    notAvailable: "No disponible",
    sessionStats: "Estadísticas de sesión",
    total: "Total",
    sessionHistoryBtn: "Ver historial de sesión",
    noSessionSignals: "Aún no se ha registrado ninguna señal de sesión.",
    backtestRunning: "Ejecutando backtest…",
    trades: "Operaciones",
    wins: "Ganadas",
    losses: "Perdidas",
    winRate: "Tasa de aciertos",
    profitFactor: "Factor de beneficio",
    totalExecuted: "Total ejecutadas",
    breakEven: "Punto de equilibrio",
    inFlight: "En curso",
    noClosed: "— (aún no hay señal cerrada)",
    noSignals: "Aún no se ha registrado ninguna señal.",
    cutoff: "Límite",
    qualifying: "Configuraciones que califican",
    simWinRate: "Tasa de aciertos simulada",
    allOutcomes: "Todos los resultados",
    allEngines: "Todos los motores",
    mainTerminal: "Terminal principal",
    smcEngine: "Motor SMC",
    sessionEngine: "Motor de sesión",
    newsIntel: "Inteligencia de noticias",
    username: "Nombre de usuario",
    role: "Rol",
    plan: "Plan",
    planExpiry: "Vencimiento del plan",
    daysLeft: "días restantes",
    lifetimeNever: "De por vida — nunca caduca",
    managePlan: "Para cambiar de plan, contacta con el administrador",
    signals: "Señales",
    engines: "Motores",
    engineOffNote: "Un motor en OFF está realmente apagado — no genera señales. El Test Push es solo un mensaje de prueba dentro de la app, no una notificación push real.",
    testPushBtn: "Test Push (prueba en app)",
    testPushMsg: "Test push (en app): esto es solo una prueba, no una notificación push real.",
    historyTabText: "Todas las señales están en la pestaña Historial.",
    openHistory: "Abrir historial",
    tfLoading: "Cargando matriz TF…",
    exportText: "Descarga las señales en CSV.",
    exportBtn: "Exportar CSV",
    aiTitle: "Agente IA — solo en la app.",
    aiText: "Esto no es un servicio de IA en vivo, solo un ayudante dentro de la app.",
    aiAsk: "Preguntar",
    defaultPair: "Par predeterminado",
    saved: "Guardado.",
    totalBuyers: "Total de compradores",
    expired: "Caducado",
    bandHai: "Suspendido",
    active: "Activo",
    lifetime: "De por vida",
    expiry: "Caducidad",
    extend30: "+30 días",
    suspend: "Suspender",
    reopen: "Reabrir",
    changePass: "Cambiar contraseña",
    delete: "Eliminar",
    noBuyers: "Aún no hay compradores.",
    buyerCreated: "Comprador creado",
    passChanged: "Contraseña cambiada.",
    ownPassTitle: "Cambiar tu contraseña",
    phNewPass: "Nueva contraseña (mínimo 6 caracteres)",
    phConfirmPass: "Repite la contraseña",
    passTooShort: "La contraseña debe tener al menos 6 caracteres",
    passMismatch: "Las dos contraseñas no coinciden",
    saveBtn: "Guardar",
    cancelBtn: "Cancelar",
    newPassPrompt: "Nueva contraseña (mín. 6 caracteres):",
    deleteConfirm: " — ¿eliminar este usuario?",
    serverUnreachable: "No se puede contactar al servidor:",
    priceLoadFail: "No se cargaron los precios:",
    signalLoadFail: "No se cargó la señal:",
    indLoadFail: "No se cargaron los indicadores:",
    indNoData: "No hay velas disponibles para los indicadores.",
    smcLoadFail: "No se cargó SMC:",
    smcNoData: "Sin datos de SMC.",
    scannerFail: "No se cargó el escáner:",
    sessionLoadFail: "No se cargó la sesión:",
    newsFail: "Las noticias no están disponibles ahora — inténtalo de nuevo en breve.",
    newsFallbackNote: "Una fuente no funciona — los titulares mostrados son de la fuente activa",
    newsUpdated: "Actualizado",
    newSignal: "¡Nueva señal!",
    alertsNote: "Las alertas solo funcionan mientras el sitio está abierto — no con una pestaña cerrada ni con el teléfono apagado.",
    sound: "Sonido",
    notifications: "Notificaciones",
    status: "Estado",
    session: "Sesión",
    pktTime: "Hora PKT",
    quality: "Calidad",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Señal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Aún no se ha registrado ninguna confirmación SMC.",
    smcBacktestRunning: "Ejecutando backtest de SMC…",
    termBacktestRunning: "Ejecutando backtest de Terminal…",
    termBacktestNote: "Últimos 30 días, velas de 1H — no es una promesa de resultados futuros. Base = motor de Terminal (6 puertas, puerta 85%). Los filtros no mejoraron todos los pares, así que no se añadió ningún filtro al motor en vivo.",
    termBacktestBtn: "Ejecutar backtest de Terminal",
    smcBacktestBtn: "Ejecutar backtest de SMC (30 días)",
    smcBacktestNote: "Regla SMC (puntuación 80%+) en velas reales de 15M — sin números inventados.",
    filter: "Filtro",
    baseline: "Base",
    macdAgree: "MACD de acuerdo",
    noDeadHours: "Sin horas muertas",
    chartNoData: "No hay velas disponibles para el gráfico.",
    allSessions: "Todas las sesiones (hora PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Estructura de mercado (BOS/MSS)",
    buyNow: "🟢 COMPRAR AHORA",
    sellNow: "🔴 VENDER AHORA",
    waitNoTrade: "⏳ WAIT — sin operación",
    bannerLine: "Toma esta operación ahora — Entry, SL y TP están abajo.",
    approaching: "ACERCÁNDOSE — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Resumen",
    engineControls: "Controles del motor",
    signalDetails: "Detalles de la señal",
    signalHistory: "Historial de señales",
    tfMatrix: "Matriz TF",
    trackingLogs: "Registros de seguimiento",
    exportCsv: "Exportar CSV",
    aiAgent: "Agente IA",
    preferences: "Preferencias",
    copySignal: "📋 Copiar señal",
    downloadSignal: "⬇️ Descargar imagen",
    copyDone: "Señal copiada",
    copyDoneBody: "Texto de la señal copiado — pégalo en WhatsApp o Telegram.",
    copyFailBody: "No se pudo copiar — selecciona el texto manualmente.",
    imgDone: "Imagen descargada",
    imgDoneBody: "Imagen de la tarjeta de señal descargada.",
    imgFail: "No se pudo descargar la imagen — inténtalo de nuevo.",
    shareDisclaimer: "Ninguna señal es 100% rentable.",
    close: "Cerrar",
    scanNow: "🔍 Escanear ahora",
    scanning: "Escaneando…",
    monitorEvery: "Cada",
    stopMonitoring: "⏸ Detener",
    startMonitoring: "▶ Iniciar",
    monitoringOff: "El monitoreo está apagado — pulsa Iniciar",
    scanDone: "Escaneo completo",
    scanDoneBody: "Todos los pares fueron reescaneados.",
    scanFailBody: "No se pudo escanear — inténtalo de nuevo.",
    bestTimeframe: "Mejor marco temporal: 1H (4H también sirve) — 15M es solo para el momento de entrada",
    signalCode: "Código de señal",
    validUntil: "Válida hasta",
    newSignalPopup: "¡Llegó una señal!",
    whyWait: "¿Por qué esperar? — Why Wait?",
    copyWaitAnalysis: "📋 Copiar análisis WAIT",
    waitCopyDone: "Análisis WAIT copiado",
    waitCopyDoneBody: "Análisis WAIT copiado — pégalo en WhatsApp o Telegram.",
    smcBelowGate: "SMC está por debajo de su puerta",
    zoneBlockedReason: "No hay zona adecuada detrás de esta dirección",
    shareCard: "📤 Tarjeta para compartir",
    downloadHighRes: "⬇️ Descargar PNG en alta resolución",
    copyImage: "🖼️ Copiar imagen",
    copyFormattedText: "📋 Copiar texto formateado",
    formattedPreview: "Vista previa del texto formateado (Telegram / WhatsApp)",
    imgCopyDone: "Imagen copiada",
    imgCopyDoneBody: "Imagen de la tarjeta de señal copiada al portapapeles.",
    imgCopyFail: "No se pudo copiar la imagen",
    imgCopyFailBody: "La copia de imágenes no es compatible con este navegador — usa Descargar.",
    dcaNote: "DCA: toma el 50% del beneficio en TP1, deja correr el resto hasta TP2/TP3.",
    breakevenNote: "Punto de equilibrio: después de TP1, mueve el SL a la entrada.",
    stepSignal: "Señal",
    stepEntry: "Zona de entrada",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Operación cerrada",
    progression: "Progresión",
    confluenceLbl: "Confluencia",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Onda de sentimiento — calculada (no es una predicción)",
    sentimentWaveNote: "Este sentimiento se calcula a partir del RSI, la tendencia y las zonas reales — no es una predicción.",
    demandIndex: "Índice de demanda",
    supplyIndex: "Índice de oferta",
    zoneCorridor: "Corredor de zonas",
    histDetails: "Detalles de la señal (registrada)",
    gatesNotSaved: "No se guardaron los detalles de puerta para esta señal.",
    detailsBtn: "Detalles",
    pivotTitle: "Puntos pivote (día anterior)",
    fearGreedTitle: "Miedo y codicia de Bitcoin (alternative.me)",
    fearGreedNa: "El miedo y la codicia no están disponibles ahora.",
    riskProfile: "Perfil de riesgo",
    riskConservative: "Conservador",
    riskModerate: "Moderado",
    riskAggressive: "Agresivo",
    riskConsText: "Solo señales de alta confluencia — arriesga 1% por operación",
    riskModText: "Estándar — arriesga 1% por operación",
    riskAggText: "Más riesgo — hasta 2% por operación, el drawdown puede ser mayor",
    riskProfileLine: "Tu perfil de riesgo",
    timezone: "Zona horaria",
    theme: "Tema",
    themeDark: "Oscuro",
    themeLight: "Claro",
    language: "Idioma",
    prefPair: "Par preferido",
    engineStatus: "Estado del motor",
    prefSaved: "Preferencias guardadas.",
    guideTitle: "¿Cómo tomar una operación? — 4 pasos fáciles",
    guideStep1: "Opera solo con una señal de BUY o SELL — nunca operes con WAIT.",
    guideStep2: "Entry, SL y TP están escritos en la tarjeta — nunca arriesgues más que el SL.",
    guideStep3: "La confirmación está en la propia tarjeta: la puntuación está por encima de la puerta, y las razones están bajo \"¿Por qué esta operación?\" abajo.",
    guideStep4: "El mejor marco temporal es 1H (4H también sirve) — 15M es solo para el momento de entrada.",
    whyTradeTitle: "¿Por qué esta operación? — Confirmación",
    whyTrend: "La tendencia está de este lado",
    whyZone: "El precio está en la zona de operación",
    whyZoneNear: "El precio está cerca de la zona de operación",
    whySmcHigh: "La puntuación SMC es 80+ — el dinero inteligente también está de este lado",
    whyTopGate: "La comprobación más fuerte",
    oneTradeLabel: "Solo una operación a la vez",
    oneTradeNote: "Solo una operación a la vez — no se muestra la configuración de la otra dirección.",
    gatesExplain: "6 comprobaciones, 100 puntos — una señal solo se forma con 85+ (como la nota de aprobado en un examen).",
    smcExplain: "5 partes, 100 puntos — 80+ es bueno (confirmación fuerte).",
    gateLblTrendUp: "La tendencia está al alza (EMA)",
    gateLblTrendDown: "La tendencia está a la baja (EMA)",
    gateLblStructure: "La estructura es fuerte",
    gateLblRsi: "El RSI está en un rango saludable",
    gateLblRr: "La recompensa es mayor que el riesgo",
    gateLblEma200: "La gran tendencia (EMA200) está de acuerdo",
    gateLblFresh: "Los datos están frescos",
    smcLblSweep: "Se barrió la liquidez",
    smcLblStructure: "La estructura de mercado cambió",
    smcLblOb: "Bloque de órdenes encontrado",
    smcLblFvg: "Brecha FVG encontrada",
    smcLblRr: "Riesgo/recompensa está bien",
    chkLblSweep: "Los grandes jugadores tomaron la liquidez",
    chkLblOb: "Zona de los grandes jugadores",
    chkLblFvg: "Hueco vacío en el precio",
    chkLblSr: "Nivel fuerte de soporte/resistencia",
    chkLblZones: "Zona de compra/venta",
    extLblCandle: "La vela insinúa la tendencia",
    extLblChoch: "Señal de que la tendencia puede cambiar",
    extLblMss: "Nueva tendencia confirmada",
    extLblBreaker: "El nivel antiguo ahora es soporte/resistencia",
    extLblIdm: "Vuelta tras un movimiento falso",
    extLblFib: "Nivel de Fibonacci (calculado)",
    extLblBb: "Compresión de volatilidad",
    extLblMacdDiv: "MACD y precio no están de acuerdo",
    extLblMeanRev: "Qué tan lejos está el precio de la media",
    extLblKillzone: "Horario activo de la sesión",
    extLblAsian: "Rango de la sesión asiática",
    extLblVwap: "Bandas VWAP (precio promedio)",
    extLblVol: "Volumen — cuánto se operó",
    smcNoSignalBanner: "SMC NO da señales — es solo confirmación para la señal de la Terminal.",
    smcConfirmStrong: "Confirmación fuerte ✓",
    smcConfirmWeak: "La confirmación es débil — fuerte a partir de 80+",
    notASignalNote: "Esto no es una señal — opera solo con la señal de la Terminal.",
    confirmationLbl: "Confirmación",
    smcEngineHeader: "MOTOR SMC • ACTIVO",
    smcEngineSub: "Barridos de liquidez · Bloques de órdenes · FVGs · Macro 15M y entrada 5M",
    smcSetupQuality: "Calidad de la configuración",
    smcGradeStrong: "A · Fuerte",
    smcGradeModerate: "B · Moderada",
    smcGradeDeveloping: "C · En desarrollo",
    smcGradeWeak: "D · Débil",
    smcWaiting80: "Esperando confirmación del 80%",
    smcConfirmed80: "Confirmación del 80% alcanzada — confirmación fuerte para la señal de la Terminal",
    smcBias: "Sesgo SMC (15M)",
    smcBiasBullish: "Alcista",
    smcBiasBearish: "Bajista",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Movimiento en vivo (desde la entrada)",
    smcGenerated: "Generada",
    smcBeTip: "Consejo de equilibrio: después de +100 pips de beneficio, mueve el SL a la entrada — solo orientación, no es automático.",
    smcFeedNote: "Esto es solo confirmación — no operes con esto, espera la señal de la Terminal.",
    perfNoteTerminal: "La tasa de aciertos se calcula solo con señales de la Terminal — SMC/Sesión no se cuentan aquí.",
    smcTpNote: "TP2/TP3: solo se registra el resultado de TP1/SL.",
    smcInspectChart: "Inspeccionar gráfico",
    tgTitle: "Alertas de Telegram — Señales en tu teléfono",
    tgText: "Cuando aparece una señal de BUY/SELL, recibes un mensaje de Telegram en tu teléfono — incluso con el sitio cerrado. Abre el enlace de abajo y pulsa Start en el bot.",
    tgButton: "📲 Recibir alertas en Telegram",
    tgPersonalTitle: "Tu enlace personal de Telegram",
    tgPersonalText: "Este enlace es solo tuyo — vincula las alertas a tu cuenta. Abre el enlace, pulsa Start en el bot, ¡listo! Las alertas se detienen si tu plan caduca o se suspende.",
    tgLinked: "✅ Las alertas de Telegram están ACTIVADAS — recibirás un mensaje cuando aparezca una señal.",
    tgNotLinked: "Las alertas de Telegram aún NO están activadas — abre el enlace y pulsa Start.",
    tgCopyLink: "Copiar enlace",
    tgLinkCopied: "Tu enlace personal de Telegram está copiado — pulsa Start en el bot.",
    marketCards: "Mercado en vivo",
    pcMarketPrice: "Precio de mercado (último)",
    pcChange24h: "Cambio diario / 24H",
    pcSpread: "Spread",
    pcKeyLevels: "Niveles clave históricos",
    pcSources: "Fuentes",
    liveMarketPrice: "PRECIO DE MERCADO EN VIVO",
    awaitingConf: "ESPERANDO CONFLUENCIA",
    scanningMarket: "Escaneando el mercado — esperando confluencia del 85%",
    confirmedTitle: "INDICADORES CONFIRMADOS",
    passedLbl: "SUPERADO",
    awaitingTitle: "ESPERANDO CONFIRMACIÓN",
    pendingLbl: "PENDIENTE",
    needsGate: "NECESITA 85%",
    requiredTitle: "REQUERIDO ANTES DE BUY O SELL",
    requiredBuy: "PARA CONFIRMACIÓN DE BUY",
    requiredSell: "PARA CONFIRMACIÓN DE SELL",
    reqBuyTpl: "Rebote alcista desde {a} — el precio recupera {b}",
    reqSellTpl: "Rechazo bajista desde {a} — el precio pierde {b}",
    analyzeNow: "ANALIZAR EL MERCADO AHORA",
    inspectInd: "INSPECCIONAR INDICADORES",
    downloadCard: "DESCARGAR TARJETA",
    liveTick: "Tick en tiempo real sincronizado",
    timeframeLbl: "MARCO TEMPORAL",
    confidenceLbl: "CONFIANZA",
    htfLbl: "Alineación de marco temporal superior",
    adxRanging: "menos de 20 — sin tendencia (rango)",
    adxTrend: "20 o más — la tendencia es fuerte",
    smcConfirmLbl: "Confirmación SMC",
    rsiNeedBuy: "BUY necesita 50–70",
    rsiNeedSell: "SELL necesita 30–50",
    rrNeed: "Se necesita R:R 1.5",
    bannerTerminal: "LAS SEÑALES VIENEN SOLO DE AQUÍ — opera en la tarjeta de BUY/SELL",
    bannerSmc: "ESTO NO ES UNA SEÑAL — es solo confirmación",
    bannerSession: "ESTO SOLO DICE LA HORA — no da señales",
    bannerHistory: "ESTAS SON SEÑALES ANTIGUAS — no operes con ellas, solo revisa los resultados",
    bannerScanner: "ESTO SOLO BUSCA — la señal se crea en la Terminal"
  },
  fr: {
    tagline: "Signaux en direct pour l'or, le Bitcoin et le Forex",
    setupTitle: "Configuration initiale",
    setupText: "Créez vous-même votre nom d'utilisateur et votre mot de passe Admin. N'envoyez jamais votre mot de passe à qui que ce soit — vous seul devez le connaître.",
    setupBtn: "Créer le compte Admin",
    loginTitle: "Connexion",
    loginBtn: "Connexion",
    finePrint: "Aucun signal n'est rentable à 100 %. Entraînez-vous d'abord en démo, ne risquez pas d'argent réel à la hâte.",
    logout: "Déconnexion",
    refresh: "Actualiser",
    refreshing: "Actualisation en cours…",
    lastUpdate: "Dernière mise à jour",
    secAgo: "s ago",
    tabTerminal: "Terminal",
    tabIndicators: "Indicateurs",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "Historique",
    tabAccount: "Compte",
    tabAdmin: "Admin",
    howSignalTitle: "Quand et comment un signal se forme-t-il ?",
    howSignalText1: "Il n'y a pas d'heure fixe pour un signal. BUY/SELL ne se forme que lorsque 85 % ou plus des points sont obtenus sur les 6 portes. WAIT signifie : ne tradez pas maintenant, les conditions ne sont pas remplies.",
    howSignalText2: "La porte SMC est distincte (80 %) — voir l'onglet SMC. Le signal du Terminal n'attend pas la porte SMC.",
    tfHint: "Meilleur timeframe : 1H (avec la tendance 4H) — les signaux sont les plus fiables en 1H/4H ; 15M sert uniquement au timing d'entrée et 5M est trop bruyant. (Backtest de 90 jours, 4 paires : taux de réussite ~60 %, facteur de profit ~1,00 — équilibre, un résultat passé, pas une garantie.)",
    rareSignals: "Les signaux sont rares mais de meilleure qualité — BUY/SELL n'apparaît que lorsque la porte de 85 % est franchie. Plus de signaux ne veut pas dire de meilleurs résultats.",
    allPairsTitle: "Toutes les paires — Prix en direct",
    indCenterTitle: "Centre des indicateurs",
    indCenterText: "Tous ces chiffres sont calculés à partir de vraies bougies Kraken — EMA 20/50 montre la tendance, RSI 14 le momentum, et ATR 14 de combien le prix bouge habituellement.",
    indTfNote: "Les valeurs ci-dessous sont en 1H — 15M et Journalier sont listés séparément ci-dessous",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "Les niveaux SMC proviennent des plus hauts et plus bas réels des bougies 15M — là où les gros acheteurs et vendeurs attendent habituellement. Le score SMC est composé de 5 parties × 20 points, porte 80 %. Le BUY/SELL du Terminal ne vient pas de cet onglet ; il utilise les propres conditions à 85 % du Terminal.",
    scannerTitle: "Scanner de marché mondial (11 paires, toutes les 45 secondes)",
    smcPairCardsTitle: "Confirmation SMC — Chaque paire",
    sessionTitle: "Moteur de sessions",
    backtestTitle: "Simulateur de backtest de session",
    backtestText: "Lancez la règle de session sur de vraies bougies 1H.",
    backtestBtn: "Lancer le backtest (30 jours)",
    historyTitle: "Historique des signaux",
    historyText: "Seuls les signaux réellement enregistrés sont affichés — aucun historique passé n'a été inventé. Le résultat (Win/Loss/Break-Even/In-Flight) est vérifié par rapport aux bougies suivantes.",
    refinerTitle: "Affinage de stratégie",
    refinerText: "Le seuil ne s'applique qu'aux signaux enregistrés après cette version, car les anciens signaux n'ont pas sauvegardé le score de porte.",
    marketClosedTitle: "Marché fermé",
    marketClosedText: "Le marché du forex et de l'or est fermé le samedi et le dimanche — aucun nouveau signal ne se formera pour cette paire. Le prix affiché est le dernier disponible, pas un prix en direct.",
    marketClosedShort: "Marché fermé — dernier prix disponible",
    accountTitle: "Compte",
    adminTitle: "Panneau Admin — Comptes acheteurs",
    adminPlansText: "Mensuel 30 jours · Trimestriel 90 jours · Annuel 365 jours · À vie (n'expire jamais). À la fin du plan, la connexion de l'acheteur se verrouille automatiquement.",
    createBuyerBtn: "Créer un acheteur",
    newsTitle: "Actualités fondamentales",
    newsText: "Derniers titres forex/marché — des flux RSS gratuits de FXStreet et ForexLive.",
    chartTitle: "Graphique des prix — Bougies + EMA 20/50/200",
    indStripTitle: "Indicateurs en direct",
    smcMacroTitle: "Macro 15M",
    smcMicroTitle: "Micro 5M",
    smcFeedTitle: "Flux de confirmation SMC — confirmation, pas un signal",
    smcBacktestTitle: "Backtest SMC",
    termBacktestTitle: "Backtest du Terminal (30 jours)",
    phSetupUser: "Nom d'utilisateur Admin (3 caractères min.)",
    phSetupPass: "Mot de passe Admin (6 caractères min.)",
    phLoginUser: "Nom d'utilisateur",
    phLoginPass: "Mot de passe",
    phBuyerUser: "Nom d'utilisateur de l'acheteur",
    phBuyerPass: "Mot de passe de l'acheteur",
    phAiQ: "Posez une question, p. ex. : quand un signal se forme-t-il ?",
    hello: "Bonjour",
    loading: "Chargement…",
    noTrade: "(aucun trade)",
    price: "Prix",
    confluence: "Confluence",
    gate: "porte",
    buySellPlans: "Plans BUY et SELL — les deux ensemble",
    signalPlan: "Plan de signal — une direction, un trade",
    smcChecklist: "Checklist de confluence SMC — la vraie raison de ce signal",
    oppScenario: "Scénario opposé",
    oppGateNotMet: "porte non franchie",
    chkSweep: "Balayage de liquidité",
    chkOB: "Bloc d'ordres",
    chkFvg: "FVG (Écart de juste valeur)",
    chkSR: "Support / Résistance",
    chkZones: "Zones (Demande / Offre)",
    chkYes: "✓ Soutient",
    chkNo: "✗ Ne soutient pas",
    chkNa: "– Neutre",
    noSweep: "Aucun balayage",
    noObDir: "Aucun bloc d'ordres trouvé dans cette direction",
    noFvgDir: "Aucun FVG trouvé dans cette direction",
    inDemand: "Le prix est dans la zone de demande",
    inSupply: "Le prix est dans la zone d'offre",
    nearDemand: "Le prix est proche de la zone de demande",
    nearSupply: "Le prix est proche de la zone d'offre",
    noZone: "Le prix n'est dans aucune zone",
    tradeZone: "Zone de trade",
    inZone: "EN ZONE — IN ZONE",
    nearZone: "Le prix est proche de la zone",
    farZone: "Le prix est loin de la zone",
    noZoneDir: "Aucune zone trouvée pour cette direction",
    bosUp: "Structure cassée vers le haut (BOS) — haussier",
    bosDown: "Structure cassée vers le bas (BOS) — baissier",
    noBreak: "Aucune cassure de structure — le niveau a tenu",
    extTitle: "Confluence étendue — à partir des bougies 1H",
    extNote: "Tout cela n'est que de la confluence — cela ne change ni la direction du signal ni les portes (85 %/80 %).",
    chkCandle: "Figure en chandeliers (1H)",
    chkChoch: "CHOCH (Changement de caractère)",
    chkMss: "MSS (Changement de structure de marché)",
    chkBreaker: "Blocs breaker / mitigation",
    chkIdm: "IDM (Inducement)",
    chkFib: "Niveaux de Fibonacci",
    chkBb: "Compression de Bollinger",
    chkMacdDiv: "Divergence MACD",
    chkMeanRev: "Retour à la moyenne",
    chkKillzone: "Killzone / Horaire de session",
    chkAsian: "Range de la session asiatique",
    chkVwap: "Bandes VWAP (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Avalement haussier",
    patBearEngulf: "Avalement baissier",
    patHammer: "Marteau / Pin Bar (haussier)",
    patShootingStar: "Étoile filante (baissier)",
    patDoji: "Doji (neutre)",
    patMorningStar: "Étoile du matin (haussier)",
    patEveningStar: "Étoile du soir (baissier)",
    noPattern: "Aucune figure claire",
    chochUp: "CHOCH vers le haut — cassure contre la tendance",
    chochDown: "CHOCH vers le bas — cassure contre la tendance",
    noChoch: "Aucun CHOCH",
    mssUp: "MSS vers le haut — nouvelle tendance confirmée",
    mssDown: "MSS vers le bas — nouvelle tendance confirmée",
    noMss: "Aucun MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Aucun bloc breaker/mitigation",
    idmSsl: "IDM trouvé — balayage SSL puis reprise (haussier)",
    idmBsl: "IDM trouvé — balayage BSL puis reprise (baissier)",
    noIdm: "Aucun IDM",
    fibNearest: "Niveau le plus proche",
    squeezeOn: "Compression en cours — volatilité faible, un grand mouvement peut venir",
    squeezeOff: "Aucune compression",
    meanNear: "Près de la moyenne",
    meanExtended: "Loin de la moyenne",
    meanOver: "Très sur-étendu",
    aboveMean: "au-dessus de la moyenne",
    belowMean: "en dessous de la moyenne",
    macdBullDiv: "Divergence haussière — prix plus bas, MACD plus haut",
    macdBearDiv: "Divergence baissière — prix plus haut, MACD plus bas",
    noMacdDiv: "Aucune divergence MACD",
    killActive: "Killzone active",
    killNext: "Prochaine killzone",
    kzAsian: "Asiatique",
    kzLondon: "Londres",
    kzNewYork: "New York",
    asianIn: "Le prix est dans le range",
    asianAbove: "Le prix s'est étendu au-dessus du range",
    asianBelow: "Le prix s'est étendu en dessous du range",
    noAsian: "Aucun range asiatique trouvé",
    vwapNearest: "Bande la plus proche",
    volRising: "Le volume augmente",
    volFalling: "Le volume baisse",
    volNormal: "Volume normal",
    volNa: "Aucun volume disponible pour cette paire",
    dxyTitle: "Indice du dollar (DXY)",
    dxyNa: "DXY non disponible pour le moment — non reçu de Yahoo",
    corrLabel: "Corrélation (20 périodes)",
    corrNeg: "négative",
    corrPos: "positive",
    corrFlat: "faible",
    riskTitle: "Gestion du risque — conseils (pas de gestion de trade en direct)",
    riskRrTarget: "Objectif R:R 1:2 — atteint à TP3",
    riskTp1: "À TP1, prenez 50 % du profit, puis déplacez le SL au point mort (entrée).",
    riskSize: "Taille de position : ne risquez que 1 % de votre compte par trade.",
    riskDd: "Contrôle du drawdown : ne risquez jamais plus de 1 % sur un trade — gardez les pertes petites.",
    sentiment: "Sentiment 24H",
    demandZone: "Zone de demande",
    supplyZone: "Zone d'offre",
    liveComments: "Commentaires en direct",
    nextCheck: "Prochain contrôle dans",
    nextCheckSuffix: "s (surveillance de 30 secondes)",
    signalUpdated: "Signal mis à jour",
    buyGates: "Portes BUY",
    sellGates: "Portes SELL",
    entryZone: "Zone d'entrée",
    trigger: "Déclencheur",
    scorecard: "Carte de score",
    trend: "Tendance",
    momentum: "Momentum",
    volatility: "Volatilité",
    volume: "Volume",
    structure: "Structure",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M et journalier",
    smcScore: "Score SMC",
    gatePass: "Porte franchie !",
    gateNotMet: "porte non franchie",
    swingLevels: "Niveaux de swing",
    swingHigh: "Dernier swing haut",
    swingLow: "Dernier swing bas",
    liqSweeps: "Balayages de liquidité",
    orderBlocks: "Blocs d'ordres",
    bullOB: "OB haussier",
    bearOB: "OB baissier",
    fresh: "frais",
    mitigated: "atténué",
    fvg: "Écarts de juste valeur (FVG)",
    noFvg: "Aucun FVG trouvé.",
    microSweeps: "Balayages SSL micro 5M",
    liqPools: "Réserves de liquidité",
    pair: "Paire",
    direction: "Direction",
    confirmedSignals: "Confirmations SMC",
    cycleEvery: "Cycle : toutes les",
    cycleSec: "secondes",
    sessionActive: "Active",
    nowPkt: "Heure PKT actuelle",
    nextSession: "Prochaine session",
    minutes: "minutes",
    newsBlackout: "Blackout des actualités",
    notAvailable: "Non disponible",
    sessionStats: "Statistiques de session",
    total: "Total",
    sessionHistoryBtn: "Voir l'historique de session",
    noSessionSignals: "Aucun signal de session enregistré pour le moment.",
    backtestRunning: "Backtest en cours…",
    trades: "Trades",
    wins: "Gagnés",
    losses: "Perdus",
    winRate: "Taux de réussite",
    profitFactor: "Facteur de profit",
    totalExecuted: "Total exécuté",
    breakEven: "Point mort",
    inFlight: "En cours",
    noClosed: "— (aucun signal fermé pour le moment)",
    noSignals: "Aucun signal enregistré pour le moment.",
    cutoff: "Seuil",
    qualifying: "Setups qualifiés",
    simWinRate: "Taux de réussite simulé",
    allOutcomes: "Tous les résultats",
    allEngines: "Tous les moteurs",
    mainTerminal: "Terminal principal",
    smcEngine: "Moteur SMC",
    sessionEngine: "Moteur de session",
    newsIntel: "Intelligence des actualités",
    username: "Nom d'utilisateur",
    role: "Rôle",
    plan: "Plan",
    planExpiry: "Expiration du plan",
    daysLeft: "jours restants",
    lifetimeNever: "À vie — n'expire jamais",
    managePlan: "Pour changer de forfait, contactez l'administrateur",
    signals: "Signaux",
    engines: "Moteurs",
    engineOffNote: "Un moteur OFF est vraiment éteint — il ne crée aucun signal. Le Test Push est seulement un message de test dans l'app, pas une vraie notification push.",
    testPushBtn: "Test Push (test dans l'app)",
    testPushMsg: "Test push (dans l'app) : ce n'est qu'un test, pas une vraie notification push.",
    historyTabText: "Tous les signaux sont dans l'onglet Historique.",
    openHistory: "Ouvrir l'historique",
    tfLoading: "Chargement de la matrice TF…",
    exportText: "Téléchargez les signaux en CSV.",
    exportBtn: "Exporter CSV",
    aiTitle: "Agent IA — dans l'app uniquement.",
    aiText: "Ce n'est pas un service IA en direct, seulement un assistant dans l'app.",
    aiAsk: "Demander",
    defaultPair: "Paire par défaut",
    saved: "Enregistré.",
    totalBuyers: "Total des acheteurs",
    expired: "Expiré",
    bandHai: "Suspendu",
    active: "Actif",
    lifetime: "À vie",
    expiry: "Expiration",
    extend30: "+30 jours",
    suspend: "Suspendre",
    reopen: "Rouvrir",
    changePass: "Changer le mot de passe",
    delete: "Supprimer",
    noBuyers: "Aucun acheteur pour le moment.",
    buyerCreated: "Acheteur créé",
    passChanged: "Mot de passe modifié.",
    ownPassTitle: "Changer votre mot de passe",
    phNewPass: "Nouveau mot de passe (6 caractères minimum)",
    phConfirmPass: "Retapez le mot de passe",
    passTooShort: "Le mot de passe doit contenir au moins 6 caractères",
    passMismatch: "Les deux mots de passe ne correspondent pas",
    saveBtn: "Enregistrer",
    cancelBtn: "Annuler",
    newPassPrompt: "Nouveau mot de passe (6 caractères min.) :",
    deleteConfirm: " — supprimer cet utilisateur ?",
    serverUnreachable: "Impossible de joindre le serveur :",
    priceLoadFail: "Les prix ne se sont pas chargés :",
    signalLoadFail: "Le signal ne s'est pas chargé :",
    indLoadFail: "Les indicateurs ne se sont pas chargés :",
    indNoData: "Aucune bougie disponible pour les indicateurs.",
    smcLoadFail: "SMC ne s'est pas chargé :",
    smcNoData: "Aucune donnée SMC.",
    scannerFail: "Le scanner ne s'est pas chargé :",
    sessionLoadFail: "La session ne s'est pas chargée :",
    newsFail: "Actualités indisponibles pour le moment — réessayez bientôt.",
    newsFallbackNote: "Un flux est en panne — les titres affichés proviennent du flux actif",
    newsUpdated: "Mis à jour",
    newSignal: "Nouveau signal !",
    alertsNote: "Les alertes ne fonctionnent que lorsque le site est ouvert — pas sur un onglet fermé ni un téléphone éteint.",
    sound: "Son",
    notifications: "Notifications",
    status: "Statut",
    session: "Session",
    pktTime: "Heure PKT",
    quality: "Qualité",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Aucune confirmation SMC enregistrée pour le moment.",
    smcBacktestRunning: "Backtest SMC en cours…",
    termBacktestRunning: "Backtest du Terminal en cours…",
    termBacktestNote: "30 derniers jours, bougies 1H — pas une promesse de résultats futurs. Base = moteur du Terminal (6 portes, porte 85 %). Les filtres n'ont pas amélioré toutes les paires, donc aucun filtre n'a été ajouté au moteur en direct.",
    termBacktestBtn: "Lancer le backtest du Terminal",
    smcBacktestBtn: "Lancer le backtest SMC (30 jours)",
    smcBacktestNote: "Règle SMC (score 80 %+) sur de vraies bougies 15M — aucun chiffre inventé.",
    filter: "Filtre",
    baseline: "Base",
    macdAgree: "MACD d'accord",
    noDeadHours: "Pas d'heures mortes",
    chartNoData: "Aucune bougie disponible pour le graphique.",
    allSessions: "Toutes les sessions (heure PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Structure de marché (BOS/MSS)",
    buyNow: "🟢 ACHETER MAINTENANT",
    sellNow: "🔴 VENDRE MAINTENANT",
    waitNoTrade: "⏳ WAIT — aucun trade",
    bannerLine: "Prenez ce trade maintenant — Entry, SL et TP sont indiqués ci-dessous.",
    approaching: "EN APPROCHE — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Aperçu",
    engineControls: "Contrôles du moteur",
    signalDetails: "Détails du signal",
    signalHistory: "Historique des signaux",
    tfMatrix: "Matrice TF",
    trackingLogs: "Journaux de suivi",
    exportCsv: "Exporter CSV",
    aiAgent: "Agent IA",
    preferences: "Préférences",
    copySignal: "📋 Copier le signal",
    downloadSignal: "⬇️ Télécharger l'image",
    copyDone: "Signal copié",
    copyDoneBody: "Texte du signal copié — collez-le sur WhatsApp ou Telegram.",
    copyFailBody: "Copie impossible — sélectionnez le texte manuellement.",
    imgDone: "Image téléchargée",
    imgDoneBody: "Image de la carte de signal téléchargée.",
    imgFail: "Échec du téléchargement de l'image — réessayez.",
    shareDisclaimer: "Aucun signal n'est rentable à 100 %.",
    close: "Fermer",
    scanNow: "🔍 Scanner maintenant",
    scanning: "Scan en cours…",
    monitorEvery: "Toutes les",
    stopMonitoring: "⏸ Arrêter",
    startMonitoring: "▶ Démarrer",
    monitoringOff: "La surveillance est arrêtée — appuyez sur Démarrer",
    scanDone: "Scan terminé",
    scanDoneBody: "Toutes les paires ont été rescannées.",
    scanFailBody: "Échec du scan — réessayez.",
    bestTimeframe: "Meilleur timeframe : 1H (4H fonctionne aussi) — 15M sert uniquement au timing d'entrée",
    signalCode: "Code du signal",
    validUntil: "Valable jusqu'à",
    newSignalPopup: "Un signal est arrivé !",
    whyWait: "Pourquoi attendre ? — Why Wait?",
    copyWaitAnalysis: "📋 Copier l'analyse WAIT",
    waitCopyDone: "Analyse WAIT copiée",
    waitCopyDoneBody: "Analyse WAIT copiée — collez-la sur WhatsApp ou Telegram.",
    smcBelowGate: "SMC est sous sa porte",
    zoneBlockedReason: "Aucune zone adéquate derrière cette direction",
    shareCard: "📤 Carte de partage",
    downloadHighRes: "⬇️ Télécharger le PNG haute résolution",
    copyImage: "🖼️ Copier l'image",
    copyFormattedText: "📋 Copier le texte formaté",
    formattedPreview: "Aperçu du texte formaté (Telegram / WhatsApp)",
    imgCopyDone: "Image copiée",
    imgCopyDoneBody: "Image de la carte de signal copiée dans le presse-papiers.",
    imgCopyFail: "Impossible de copier l'image",
    imgCopyFailBody: "La copie d'image n'est pas prise en charge dans ce navigateur — utilisez Télécharger.",
    dcaNote: "DCA : prenez 50 % du profit à TP1, laissez le reste courir jusqu'à TP2/TP3.",
    breakevenNote: "Point mort : après TP1, déplacez le SL à l'entrée.",
    stepSignal: "Signal",
    stepEntry: "Zone d'entrée",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade fermé",
    progression: "Progression",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Vague de sentiment — calculée (pas une prédiction)",
    sentimentWaveNote: "Ce sentiment est calculé à partir du RSI, de la tendance et des zones réels — ce n'est pas une prédiction.",
    demandIndex: "Indice de demande",
    supplyIndex: "Indice d'offre",
    zoneCorridor: "Corridor de zones",
    histDetails: "Détails du signal (enregistré)",
    gatesNotSaved: "Les détails de porte n'ont pas été sauvegardés pour ce signal.",
    detailsBtn: "Détails",
    pivotTitle: "Points pivots (jour précédent)",
    fearGreedTitle: "Peur et cupidité du Bitcoin (alternative.me)",
    fearGreedNa: "La peur et la cupidité ne sont pas disponibles pour le moment.",
    riskProfile: "Profil de risque",
    riskConservative: "Prudent",
    riskModerate: "Modéré",
    riskAggressive: "Agressif",
    riskConsText: "Signaux à forte confluence uniquement — risquez 1 % par trade",
    riskModText: "Standard — risquez 1 % par trade",
    riskAggText: "Risque plus élevé — jusqu'à 2 % par trade, le drawdown peut être plus grand",
    riskProfileLine: "Votre profil de risque",
    timezone: "Fuseau horaire",
    theme: "Thème",
    themeDark: "Sombre",
    themeLight: "Clair",
    language: "Langue",
    prefPair: "Paire préférée",
    engineStatus: "État du moteur",
    prefSaved: "Préférences enregistrées.",
    guideTitle: "Comment prendre un trade ? — 4 étapes faciles",
    guideStep1: "Ne tradez que sur un signal BUY ou SELL — jamais sur WAIT.",
    guideStep2: "Entry, SL et TP sont écrits sur la carte — ne risquez jamais plus que le SL.",
    guideStep3: "La confirmation est sur la carte elle-même : le score est au-dessus de la porte, et les raisons sont listées sous « Pourquoi ce trade ? » ci-dessous.",
    guideStep4: "Le meilleur timeframe est 1H (4H fonctionne aussi) — 15M sert uniquement au timing d'entrée.",
    whyTradeTitle: "Pourquoi ce trade ? — Confirmation",
    whyTrend: "La tendance est de ce côté",
    whyZone: "Le prix est dans la zone de trade",
    whyZoneNear: "Le prix est proche de la zone de trade",
    whySmcHigh: "Le score SMC est de 80+ — le smart money est aussi de ce côté",
    whyTopGate: "La vérification la plus forte",
    oneTradeLabel: "Un seul trade à la fois",
    oneTradeNote: "Un seul trade à la fois — le setup de l'autre direction n'est pas affiché.",
    gatesExplain: "6 vérifications, 100 points — un signal ne se forme qu'à 85+ (comme la note de passage à un examen).",
    smcExplain: "5 parties, 100 points — 80+ est bon (confirmation forte).",
    gateLblTrendUp: "La tendance est haussière (EMA)",
    gateLblTrendDown: "La tendance est baissière (EMA)",
    gateLblStructure: "La structure est forte",
    gateLblRsi: "Le RSI est dans une zone saine",
    gateLblRr: "La récompense est plus grande que le risque",
    gateLblEma200: "La grande tendance (EMA200) est d'accord",
    gateLblFresh: "Les données sont fraîches",
    smcLblSweep: "La liquidité a été balayée",
    smcLblStructure: "La structure de marché a changé",
    smcLblOb: "Bloc d'ordres trouvé",
    smcLblFvg: "Écart FVG trouvé",
    smcLblRr: "Risque/récompense correct",
    chkLblSweep: "Les gros acteurs ont pris la liquidité",
    chkLblOb: "Zone des gros acteurs",
    chkLblFvg: "Écart vide dans le prix",
    chkLblSr: "Niveau de support/résistance fort",
    chkLblZones: "Zone d'achat/vente",
    extLblCandle: "La bougie indique la tendance",
    extLblChoch: "Signe que la tendance peut changer",
    extLblMss: "Nouvelle tendance confirmée",
    extLblBreaker: "L'ancien niveau est maintenant support/résistance",
    extLblIdm: "Retour après un faux mouvement",
    extLblFib: "Niveau de Fibonacci (calculé)",
    extLblBb: "Compression de volatilité",
    extLblMacdDiv: "MACD et prix ne sont pas d'accord",
    extLblMeanRev: "À quelle distance le prix est de la moyenne",
    extLblKillzone: "Heure active de la session",
    extLblAsian: "Range de la session asiatique",
    extLblVwap: "Bandes VWAP (prix moyen)",
    extLblVol: "Volume — combien a été tradé",
    smcNoSignalBanner: "SMC ne donne PAS de signaux — c'est seulement une confirmation pour le signal du Terminal.",
    smcConfirmStrong: "Confirmation forte ✓",
    smcConfirmWeak: "La confirmation est faible — forte à partir de 80+",
    notASignalNote: "Ce n'est pas un signal — tradez uniquement sur le signal du Terminal.",
    confirmationLbl: "Confirmation",
    smcEngineHeader: "MOTEUR SMC • ACTIF",
    smcEngineSub: "Balayages de liquidité · Blocs d'ordres · FVGs · Macro 15M et entrée 5M",
    smcSetupQuality: "Qualité du setup",
    smcGradeStrong: "A · Fort",
    smcGradeModerate: "B · Modéré",
    smcGradeDeveloping: "C · En développement",
    smcGradeWeak: "D · Faible",
    smcWaiting80: "En attente d'une confirmation à 80 %",
    smcConfirmed80: "Confirmation à 80 % atteinte — confirmation forte pour le signal du Terminal",
    smcBias: "Biais SMC (15M)",
    smcBiasBullish: "Haussier",
    smcBiasBearish: "Baissier",
    smcBiasNeutral: "Neutre",
    smcLiveMove: "Mouvement en direct (depuis l'entrée)",
    smcGenerated: "Généré",
    smcBeTip: "Conseil de point mort : après +100 pips de profit, déplacez le SL à l'entrée — conseil uniquement, pas automatique.",
    smcFeedNote: "Ceci n'est qu'une confirmation — ne tradez pas dessus, attendez le signal du Terminal.",
    perfNoteTerminal: "Le taux de réussite est calculé uniquement à partir des signaux du Terminal — SMC/Session ne sont pas comptés ici.",
    smcTpNote: "TP2/TP3 : seul le résultat TP1/SL est enregistré.",
    smcInspectChart: "Inspecter le graphique",
    tgTitle: "Alertes Telegram — Signaux sur votre téléphone",
    tgText: "Quand un signal BUY/SELL apparaît, vous recevez un message Telegram sur votre téléphone — même lorsque le site est fermé. Ouvrez le lien ci-dessous et appuyez sur Start sur le bot.",
    tgButton: "📲 Recevoir les alertes sur Telegram",
    tgPersonalTitle: "Votre lien Telegram personnel",
    tgPersonalText: "Ce lien est uniquement le vôtre — il relie les alertes à votre compte. Ouvrez le lien, appuyez sur Start sur le bot, c'est tout ! Les alertes s'arrêtent si votre plan expire ou est suspendu.",
    tgLinked: "✅ Les alertes Telegram sont ACTIVÉES — vous recevrez un message quand un signal apparaît.",
    tgNotLinked: "Les alertes Telegram ne sont pas encore activées — ouvrez le lien et appuyez sur Start.",
    tgCopyLink: "Copier le lien",
    tgLinkCopied: "Votre lien Telegram personnel est copié — appuyez sur Start sur le bot.",
    marketCards: "Marché en direct",
    pcMarketPrice: "Prix du marché (dernier)",
    pcChange24h: "Variation 24H / journalière",
    pcSpread: "Spread",
    pcKeyLevels: "Niveaux clés historiques",
    pcSources: "Sources",
    liveMarketPrice: "PRIX DU MARCHÉ EN DIRECT",
    awaitingConf: "EN ATTENTE DE CONFLUENCE",
    scanningMarket: "Scan du marché en cours — en attente d'une confluence de 85 %",
    confirmedTitle: "INDICATEURS CONFIRMÉS",
    passedLbl: "RÉUSSI",
    awaitingTitle: "EN ATTENTE DE CONFIRMATION",
    pendingLbl: "EN ATTENTE",
    needsGate: "NÉCESSITE 85 %",
    requiredTitle: "REQUIS AVANT BUY OU SELL",
    requiredBuy: "POUR LA CONFIRMATION BUY",
    requiredSell: "POUR LA CONFIRMATION SELL",
    reqBuyTpl: "Rebond haussier depuis {a} — le prix reprend {b}",
    reqSellTpl: "Rejet baissier depuis {a} — le prix perd {b}",
    analyzeNow: "ANALYSER LE MARCHÉ MAINTENANT",
    inspectInd: "INSPECTER LES INDICATEURS",
    downloadCard: "TÉLÉCHARGER LA CARTE",
    liveTick: "Tick en temps réel synchronisé",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIANCE",
    htfLbl: "Alignement du timeframe supérieur",
    adxRanging: "moins de 20 — pas de tendance (range)",
    adxTrend: "20 ou plus — la tendance est forte",
    smcConfirmLbl: "Confirmation SMC",
    rsiNeedBuy: "BUY a besoin de 50–70",
    rsiNeedSell: "SELL a besoin de 30–50",
    rrNeed: "R:R 1.5 nécessaire",
    bannerTerminal: "LES SIGNAUX VIENNENT UNIQUEMENT D'ICI — tradez sur la carte BUY/SELL",
    bannerSmc: "CECI N'EST PAS UN SIGNAL — c'est seulement une confirmation",
    bannerSession: "CECI INDIQUE SEULEMENT L'HEURE — ne donne aucun signal",
    bannerHistory: "CE SONT D'ANCIENS SIGNAUX — ne tradez pas dessus, vérifiez seulement les résultats",
    bannerScanner: "CECI CHERCHE SEULEMENT — le signal est créé dans le Terminal"
  },
  de: {
    tagline: "Live-Signale für Gold, Bitcoin und Forex",
    setupTitle: "Ersteinrichtung",
    setupText: "Erstelle deinen eigenen Admin-Benutzernamen und dein Passwort. Schicke dein Passwort niemals an jemanden — nur du solltest es kennen.",
    setupBtn: "Admin-Konto erstellen",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "Kein Signal ist 100 % profitabel. Übe zuerst auf dem Demo-Konto, riskiere kein echtes Geld in Eile.",
    logout: "Logout",
    refresh: "Aktualisieren",
    refreshing: "Wird aktualisiert…",
    lastUpdate: "Letztes Update",
    secAgo: "Sek. her",
    tabTerminal: "Terminal",
    tabIndicators: "Indikatoren",
    tabSmc: "SMC",
    tabSession: "Session",
    tabHistory: "Verlauf",
    tabAccount: "Konto",
    tabAdmin: "Admin",
    howSignalTitle: "Wann und wie entsteht ein Signal?",
    howSignalText1: "Es gibt keine feste Zeit für ein Signal. BUY/SELL entsteht nur, wenn 85 % oder mehr der Punkte über die 6 Gates erreicht werden. WAIT bedeutet: trade jetzt nicht, die Bedingungen sind nicht erfüllt.",
    howSignalText2: "Das SMC-Gate ist separat (80 %) — siehe SMC-Tab. Das Terminal-Signal wartet nicht auf das SMC-Gate.",
    tfHint: "Bester Zeitrahmen: 1H (mit dem 4H-Trend) — Signale sind auf 1H/4H am zuverlässigsten; 15M nur für das Entry-Timing und 5M ist zu verrauscht. (90-Tage-Backtest, 4 Paare: Gewinnrate ~60 %, Profitfaktor ~1,00 — Break-even, ein vergangenes Ergebnis, keine Garantie.)",
    rareSignals: "Signale sind selten, aber hochwertiger — BUY/SELL erscheint nur, wenn das 85 %-Gate erreicht wird. Mehr Signale bedeuten keine besseren Ergebnisse.",
    allPairsTitle: "Alle Paare — Live-Preise",
    indCenterTitle: "Indikatoren-Center",
    indCenterText: "Alle diese Zahlen werden aus echten Kraken-Kerzen berechnet — EMA 20/50 zeigt den Trend, RSI 14 das Momentum, und ATR 14, wie stark sich der Preis normalerweise bewegt.",
    indTfNote: "Die Werte unten sind 1H — 15M und Tageswerte stehen separat darunter",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC-Level stammen aus echten 15M-Kerzen-Swing-Hochs/Tiefs — wo große Käufer und Verkäufer normalerweise warten. Der SMC-Score besteht aus 5 Teilen × 20 Punkten, Gate 80 %. Terminal-BUY/SELL kommt nicht aus diesem Tab; es nutzt die eigenen 85 %-Bedingungen des Terminals.",
    scannerTitle: "Globaler Markt-Scanner (11 Paare, alle 45 Sekunden)",
    smcPairCardsTitle: "SMC-Bestätigung — Jedes Paar",
    sessionTitle: "Session-Engine",
    backtestTitle: "Session-Backtest-Simulator",
    backtestText: "Führe die Session-Regel auf echten 1H-Kerzen aus.",
    backtestBtn: "Backtest starten (30 Tage)",
    historyTitle: "Signal-Verlauf",
    historyText: "Es werden nur tatsächlich aufgezeichnete Signale gezeigt — kein vergangener Verlauf wurde erfunden. Das Ergebnis (Win/Loss/Break-Even/In-Flight) wird anhand späterer Kerzen geprüft.",
    refinerTitle: "Strategie-Verfeinerung",
    refinerText: "Der Cutoff gilt nur für Signale, die nach diesem Build aufgezeichnet wurden, da ältere Signale keinen Gate-Score gespeichert haben.",
    marketClosedTitle: "Markt geschlossen",
    marketClosedText: "Der Forex- und Goldmarkt ist samstags und sonntags geschlossen — für dieses Paar wird kein neues Signal gebildet. Der angezeigte Preis ist der letzte verfügbare, kein Live-Preis.",
    marketClosedShort: "Markt geschlossen — letzter verfügbarer Preis",
    accountTitle: "Konto",
    adminTitle: "Admin-Panel — Käuferkonten",
    adminPlansText: "Monatlich 30 Tage · Vierteljährlich 90 Tage · Jährlich 365 Tage · Lebenslang (läuft nie ab). Wenn ein Plan endet, wird der Käufer-Login automatisch gesperrt.",
    createBuyerBtn: "Käufer erstellen",
    newsTitle: "Fundamental-News",
    newsText: "Neueste Forex-/Markt-Schlagzeilen — aus den kostenlosen FXStreet- und ForexLive-RSS-Feeds.",
    chartTitle: "Preis-Chart — Kerzen + EMA 20/50/200",
    indStripTitle: "Live-Indikatoren",
    smcMacroTitle: "15M Makro",
    smcMicroTitle: "5M Mikro",
    smcFeedTitle: "SMC-Bestätigungs-Feed — Bestätigung, kein Signal",
    smcBacktestTitle: "SMC-Backtest",
    termBacktestTitle: "Terminal-Backtest (30 Tage)",
    phSetupUser: "Admin-Benutzername (mind. 3 Zeichen)",
    phSetupPass: "Admin-Passwort (mind. 6 Zeichen)",
    phLoginUser: "Benutzername",
    phLoginPass: "Passwort",
    phBuyerUser: "Käufer-Benutzername",
    phBuyerPass: "Käufer-Passwort",
    phAiQ: "Stelle eine Frage, z. B.: Wann entsteht ein Signal?",
    hello: "Hallo",
    loading: "Lädt…",
    noTrade: "(kein Trade)",
    price: "Preis",
    confluence: "Konfluenz",
    gate: "Gate",
    buySellPlans: "BUY- und SELL-Pläne — beide zusammen",
    signalPlan: "Signal-Plan — eine Richtung, ein Trade",
    smcChecklist: "SMC-Konfluenz-Checkliste — der wahre Grund für dieses Signal",
    oppScenario: "Gegenteiliges Szenario",
    oppGateNotMet: "Gate nicht erreicht",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zonen (Demand / Supply)",
    chkYes: "✓ Unterstützt",
    chkNo: "✗ Unterstützt nicht",
    chkNa: "– Neutral",
    noSweep: "Kein Sweep",
    noObDir: "Kein Order Block in dieser Richtung gefunden",
    noFvgDir: "Kein FVG in dieser Richtung gefunden",
    inDemand: "Preis ist in der Demand-Zone",
    inSupply: "Preis ist in der Supply-Zone",
    nearDemand: "Preis ist nahe der Demand-Zone",
    nearSupply: "Preis ist nahe der Supply-Zone",
    noZone: "Preis ist in keiner Zone",
    tradeZone: "Trade-Zone",
    inZone: "IN DER ZONE — IN ZONE",
    nearZone: "Preis ist nahe der Zone",
    farZone: "Preis ist weit von der Zone entfernt",
    noZoneDir: "Keine Zone für diese Richtung gefunden",
    bosUp: "Struktur nach oben gebrochen (BOS) — bullisch",
    bosDown: "Struktur nach unten gebrochen (BOS) — bärisch",
    noBreak: "Kein Strukturbruch — Level hat gehalten",
    extTitle: "Erweiterte Konfluenz — aus 1H-Kerzen",
    extNote: "All das ist nur Konfluenz — es ändert weder die Signalrichtung noch die Gates (85 %/80 %).",
    chkCandle: "Kerzenmuster (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Breaker-/Mitigation-Blöcke",
    chkIdm: "IDM (Inducement)",
    chkFib: "Fibonacci-Level",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "MACD-Divergenz",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Session-Zeit",
    chkAsian: "Asiatische Session-Range",
    chkVwap: "VWAP-Bänder (±1σ / ±2σ)",
    chkVol: "Volumen (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullisch)",
    patShootingStar: "Shooting Star (bärisch)",
    patDoji: "Doji (neutral)",
    patMorningStar: "Morning Star (bullisch)",
    patEveningStar: "Evening Star (bärisch)",
    noPattern: "Kein klares Muster",
    chochUp: "CHOCH nach oben — Bruch gegen den Trend",
    chochDown: "CHOCH nach unten — Bruch gegen den Trend",
    noChoch: "Kein CHOCH",
    mssUp: "MSS nach oben — neuer Trend bestätigt",
    mssDown: "MSS nach unten — neuer Trend bestätigt",
    noMss: "Kein MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Kein Breaker-/Mitigation-Block",
    idmSsl: "IDM gefunden — SSL-Sweep, dann Reclaim (bullisch)",
    idmBsl: "IDM gefunden — BSL-Sweep, dann Reclaim (bärisch)",
    noIdm: "Kein IDM",
    fibNearest: "Nächstes Level",
    squeezeOn: "Squeeze aktiv — Volatilität niedrig, eine große Bewegung kann kommen",
    squeezeOff: "Kein Squeeze",
    meanNear: "Nahe am Mittelwert",
    meanExtended: "Weit vom Mittelwert entfernt",
    meanOver: "Stark überdehnt",
    aboveMean: "über dem Mittelwert",
    belowMean: "unter dem Mittelwert",
    macdBullDiv: "Bullische Divergenz — Preis tiefer, MACD höher",
    macdBearDiv: "Bärische Divergenz — Preis höher, MACD tiefer",
    noMacdDiv: "Keine MACD-Divergenz",
    killActive: "Aktive Killzone",
    killNext: "Nächste Killzone",
    kzAsian: "Asiatisch",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Preis ist innerhalb der Range",
    asianAbove: "Preis ist über die Range ausgebrochen (Expansion)",
    asianBelow: "Preis ist unter die Range ausgebrochen (Expansion)",
    noAsian: "Keine asiatische Range gefunden",
    vwapNearest: "Nächstes Band",
    volRising: "Volumen steigt",
    volFalling: "Volumen fällt",
    volNormal: "Volumen normal",
    volNa: "Kein Volumen für dieses Paar verfügbar",
    dxyTitle: "Dollar-Index (DXY)",
    dxyNa: "DXY ist gerade nicht verfügbar — nicht von Yahoo erhalten",
    corrLabel: "Korrelation (20 Perioden)",
    corrNeg: "negativ",
    corrPos: "positiv",
    corrFlat: "schwach",
    riskTitle: "Risikomanagement — Anleitung (kein Live-Trade-Management)",
    riskRrTarget: "R:R-Ziel 1:2 — bei TP3 erreicht",
    riskTp1: "Nimm bei TP1 50 % Gewinn mit, dann bewege den SL auf Break-even (Entry).",
    riskSize: "Positionsgröße: riskiere nur 1 % deines Kontos pro Trade.",
    riskDd: "Drawdown-Kontrolle: riskiere nie mehr als 1 % in einem Trade — halte Verluste klein.",
    sentiment: "24H-Stimmung",
    demandZone: "Demand-Zone",
    supplyZone: "Supply-Zone",
    liveComments: "Live-Kommentare",
    nextCheck: "Nächster Check in",
    nextCheckSuffix: "s (30-Sekunden-Überwachung)",
    signalUpdated: "Signal aktualisiert",
    buyGates: "BUY-Gates",
    sellGates: "SELL-Gates",
    entryZone: "Entry-Zone",
    trigger: "Trigger",
    scorecard: "Scorecard",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatilität",
    volume: "Volumen",
    structure: "Struktur",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M und Daily",
    smcScore: "SMC-Score",
    gatePass: "Gate bestanden!",
    gateNotMet: "Gate nicht erreicht",
    swingLevels: "Swing-Level",
    swingHigh: "Letztes Swing-Hoch",
    swingLow: "Letztes Swing-Tief",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "Bullish OB",
    bearOB: "Bearish OB",
    fresh: "frisch",
    mitigated: "mitigiert",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "Kein FVG gefunden.",
    microSweeps: "5M-Micro-SSL-Sweeps",
    liqPools: "Liquiditäts-Pools",
    pair: "Paar",
    direction: "Richtung",
    confirmedSignals: "SMC-Bestätigungen",
    cycleEvery: "Zyklus: alle",
    cycleSec: "Sekunden",
    sessionActive: "Aktiv",
    nowPkt: "Aktuelle PKT-Zeit",
    nextSession: "Nächste Session",
    minutes: "Minuten",
    newsBlackout: "News-Blackout",
    notAvailable: "Nicht verfügbar",
    sessionStats: "Session-Statistiken",
    total: "Gesamt",
    sessionHistoryBtn: "Session-Verlauf ansehen",
    noSessionSignals: "Noch kein Session-Signal aufgezeichnet.",
    backtestRunning: "Backtest läuft…",
    trades: "Trades",
    wins: "Gewinne",
    losses: "Verluste",
    winRate: "Gewinnrate",
    profitFactor: "Profitfaktor",
    totalExecuted: "Gesamt ausgeführt",
    breakEven: "Break-even",
    inFlight: "Laufend",
    noClosed: "— (noch kein geschlossenes Signal)",
    noSignals: "Noch kein Signal aufgezeichnet.",
    cutoff: "Cutoff",
    qualifying: "Qualifizierte Setups",
    simWinRate: "Simulierte Gewinnrate",
    allOutcomes: "Alle Ergebnisse",
    allEngines: "Alle Engines",
    mainTerminal: "Haupt-Terminal",
    smcEngine: "SMC-Engine",
    sessionEngine: "Session-Engine",
    newsIntel: "News-Intelligenz",
    username: "Benutzername",
    role: "Rolle",
    plan: "Plan",
    planExpiry: "Ablauf des Plans",
    daysLeft: "Tage übrig",
    lifetimeNever: "Lebenslang — läuft nie ab",
    managePlan: "Um den Plan zu ändern, wenden Sie sich an den Admin",
    signals: "Signale",
    engines: "Engines",
    engineOffNote: "Eine OFF-Engine ist wirklich ausgeschaltet — sie erzeugt keine Signale. Test Push ist nur eine In-App-Testnachricht, keine echte Push-Benachrichtigung.",
    testPushBtn: "Test Push (In-App-Test)",
    testPushMsg: "Test-Push (in der App): Das ist nur ein Test, keine echte Push-Benachrichtigung.",
    historyTabText: "Alle Signale sind im Verlauf-Tab.",
    openHistory: "Verlauf öffnen",
    tfLoading: "TF-Matrix wird geladen…",
    exportText: "Signale als CSV herunterladen.",
    exportBtn: "CSV exportieren",
    aiTitle: "KI-Agent — nur in der App.",
    aiText: "Das ist kein Live-KI-Service, nur ein Helfer in der App.",
    aiAsk: "Fragen",
    defaultPair: "Standard-Paar",
    saved: "Gespeichert.",
    totalBuyers: "Käufer gesamt",
    expired: "Abgelaufen",
    bandHai: "Gesperrt",
    active: "Aktiv",
    lifetime: "Lebenslang",
    expiry: "Ablauf",
    extend30: "+30 Tage",
    suspend: "Sperren",
    reopen: "Wieder öffnen",
    changePass: "Passwort ändern",
    delete: "Löschen",
    noBuyers: "Noch keine Käufer.",
    buyerCreated: "Käufer erstellt",
    passChanged: "Passwort geändert.",
    ownPassTitle: "Eigenes Passwort ändern",
    phNewPass: "Neues Passwort (mindestens 6 Zeichen)",
    phConfirmPass: "Passwort erneut eingeben",
    passTooShort: "Das Passwort muss mindestens 6 Zeichen haben",
    passMismatch: "Die beiden Passwörter stimmen nicht überein",
    saveBtn: "Speichern",
    cancelBtn: "Abbrechen",
    newPassPrompt: "Neues Passwort (mind. 6 Zeichen):",
    deleteConfirm: " — diesen Benutzer löschen?",
    serverUnreachable: "Server nicht erreichbar:",
    priceLoadFail: "Preise konnten nicht geladen werden:",
    signalLoadFail: "Signal konnte nicht geladen werden:",
    indLoadFail: "Indikatoren konnten nicht geladen werden:",
    indNoData: "Keine Kerzen für Indikatoren verfügbar.",
    smcLoadFail: "SMC konnte nicht geladen werden:",
    smcNoData: "Keine SMC-Daten.",
    scannerFail: "Scanner konnte nicht geladen werden:",
    sessionLoadFail: "Session konnte nicht geladen werden:",
    newsFail: "News sind gerade nicht verfügbar — bitte bald erneut versuchen.",
    newsFallbackNote: "Ein Feed ist ausgefallen — die angezeigten Schlagzeilen stammen aus dem funktionierenden Feed",
    newsUpdated: "Aktualisiert",
    newSignal: "Neues Signal!",
    alertsNote: "Alerts funktionieren nur, solange die Seite offen ist — nicht bei geschlossenem Tab oder Telefon.",
    sound: "Ton",
    notifications: "Benachrichtigungen",
    status: "Status",
    session: "Session",
    pktTime: "PKT-Zeit",
    quality: "Qualität",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Signal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Noch keine SMC-Bestätigung aufgezeichnet.",
    smcBacktestRunning: "SMC-Backtest läuft…",
    termBacktestRunning: "Terminal-Backtest läuft…",
    termBacktestNote: "Letzte 30 Tage, 1H-Kerzen — kein Versprechen für zukünftige Ergebnisse. Basis = Terminal-Engine (6 Gates, 85 %-Gate). Die Filter haben nicht jedes Paar verbessert, daher wurde kein Filter in die Live-Engine eingebaut.",
    termBacktestBtn: "Terminal-Backtest starten",
    smcBacktestBtn: "SMC-Backtest starten (30 Tage)",
    smcBacktestNote: "SMC-Regel (Score 80 %+) auf echten 15M-Kerzen — keine erfundenen Zahlen.",
    filter: "Filter",
    baseline: "Basis",
    macdAgree: "MACD stimmt zu",
    noDeadHours: "Keine toten Stunden",
    chartNoData: "Keine Kerzen für den Chart verfügbar.",
    allSessions: "Alle Sessions (PKT-Zeit)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Marktstruktur (BOS/MSS)",
    buyNow: "🟢 JETZT KAUFEN",
    sellNow: "🔴 JETZT VERKAUFEN",
    waitNoTrade: "⏳ WAIT — kein Trade",
    bannerLine: "Nimm diesen Trade jetzt — Entry, SL und TP stehen unten.",
    approaching: "NÄHERT SICH — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Überblick",
    engineControls: "Engine-Steuerung",
    signalDetails: "Signal-Details",
    signalHistory: "Signal-Verlauf",
    tfMatrix: "TF-Matrix",
    trackingLogs: "Tracking-Logs",
    exportCsv: "CSV exportieren",
    aiAgent: "KI-Agent",
    preferences: "Einstellungen",
    copySignal: "📋 Signal kopieren",
    downloadSignal: "⬇️ Bild herunterladen",
    copyDone: "Signal kopiert",
    copyDoneBody: "Signal-Text kopiert — auf WhatsApp oder Telegram einfügen.",
    copyFailBody: "Kopieren fehlgeschlagen — Text bitte manuell markieren und kopieren.",
    imgDone: "Bild heruntergeladen",
    imgDoneBody: "Signal-Kartenbild heruntergeladen.",
    imgFail: "Bild-Download fehlgeschlagen — bitte erneut versuchen.",
    shareDisclaimer: "Kein Signal ist 100 % profitabel.",
    close: "Schließen",
    scanNow: "🔍 Jetzt scannen",
    scanning: "Scannt…",
    monitorEvery: "Alle",
    stopMonitoring: "⏸ Stopp",
    startMonitoring: "▶ Start",
    monitoringOff: "Überwachung ist aus — Start drücken",
    scanDone: "Scan abgeschlossen",
    scanDoneBody: "Alle Paare wurden erneut gescannt.",
    scanFailBody: "Scan fehlgeschlagen — bitte erneut versuchen.",
    bestTimeframe: "Bester Zeitrahmen: 1H (4H geht auch) — 15M nur für das Entry-Timing",
    signalCode: "Signal-Code",
    validUntil: "Gültig bis",
    newSignalPopup: "Ein Signal ist da!",
    whyWait: "Warum warten? — Why Wait?",
    copyWaitAnalysis: "📋 WAIT-Analyse kopieren",
    waitCopyDone: "WAIT-Analyse kopiert",
    waitCopyDoneBody: "WAIT-Analyse kopiert — auf WhatsApp oder Telegram einfügen.",
    smcBelowGate: "SMC ist unter seinem Gate",
    zoneBlockedReason: "Keine passende Zone hinter dieser Richtung",
    shareCard: "📤 Share-Karte",
    downloadHighRes: "⬇️ High-Res-PNG herunterladen",
    copyImage: "🖼️ Bild kopieren",
    copyFormattedText: "📋 Formatierten Text kopieren",
    formattedPreview: "Vorschau des formatierten Texts (Telegram / WhatsApp)",
    imgCopyDone: "Bild kopiert",
    imgCopyDoneBody: "Signal-Kartenbild in die Zwischenablage kopiert.",
    imgCopyFail: "Bild konnte nicht kopiert werden",
    imgCopyFailBody: "Bildkopie wird in diesem Browser nicht unterstützt — Download verwenden.",
    dcaNote: "DCA: Nimm bei TP1 50 % Gewinn mit, lass den Rest bis TP2/TP3 laufen.",
    breakevenNote: "Break-even: Nach TP1 den SL auf Entry bewegen.",
    stepSignal: "Signal",
    stepEntry: "Entry-Zone",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade geschlossen",
    progression: "Fortschritt",
    confluenceLbl: "Konfluenz",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Stimmungswelle — berechnet (keine Vorhersage)",
    sentimentWaveNote: "Diese Stimmung wird aus echtem RSI, Trend und Zonen berechnet — es ist keine Vorhersage.",
    demandIndex: "Demand-Index",
    supplyIndex: "Supply-Index",
    zoneCorridor: "Zonen-Korridor",
    histDetails: "Signal-Details (aufgezeichnet)",
    gatesNotSaved: "Gate-Details wurden für dieses Signal nicht gespeichert.",
    detailsBtn: "Details",
    pivotTitle: "Pivot-Punkte (Vortag)",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed ist gerade nicht verfügbar.",
    riskProfile: "Risikoprofil",
    riskConservative: "Konservativ",
    riskModerate: "Moderat",
    riskAggressive: "Aggressiv",
    riskConsText: "Nur High-Konfluenz-Signale — 1 % Risiko pro Trade",
    riskModText: "Standard — 1 % Risiko pro Trade",
    riskAggText: "Höheres Risiko — bis zu 2 % pro Trade, Drawdown kann größer sein",
    riskProfileLine: "Dein Risikoprofil",
    timezone: "Zeitzone",
    theme: "Design",
    themeDark: "Dunkel",
    themeLight: "Hell",
    language: "Sprache",
    prefPair: "Bevorzugtes Paar",
    engineStatus: "Engine-Status",
    prefSaved: "Einstellungen gespeichert.",
    guideTitle: "Wie nimmt man einen Trade? — 4 einfache Schritte",
    guideStep1: "Trade nur bei einem BUY- oder SELL-Signal — niemals bei WAIT.",
    guideStep2: "Entry, SL und TP stehen auf der Karte — riskiere nie mehr als den SL.",
    guideStep3: "Die Bestätigung steht auf der Karte selbst: Der Score liegt über dem Gate, und die Gründe stehen unten unter „Warum dieser Trade?”.",
    guideStep4: "Bester Zeitrahmen ist 1H (4H geht auch) — 15M nur für das Entry-Timing.",
    whyTradeTitle: "Warum dieser Trade? — Bestätigung",
    whyTrend: "Der Trend ist auf dieser Seite",
    whyZone: "Preis ist in der Trade-Zone",
    whyZoneNear: "Preis ist nahe der Trade-Zone",
    whySmcHigh: "SMC-Score ist 80+ — Smart Money ist auch auf dieser Seite",
    whyTopGate: "Stärkster Check",
    oneTradeLabel: "Nur ein Trade zur Zeit",
    oneTradeNote: "Nur ein Trade zur Zeit — das Setup der anderen Richtung wird nicht gezeigt.",
    gatesExplain: "6 Checks, 100 Punkte — ein Signal entsteht nur bei 85+ (wie die Bestehensgrenze in einer Prüfung).",
    smcExplain: "5 Teile, 100 Punkte — 80+ ist gut (starke Bestätigung).",
    gateLblTrendUp: "Trend ist aufwärts (EMA)",
    gateLblTrendDown: "Trend ist abwärts (EMA)",
    gateLblStructure: "Struktur ist stark",
    gateLblRsi: "RSI ist in einem gesunden Bereich",
    gateLblRr: "Reward ist größer als Risiko",
    gateLblEma200: "Großer Trend (EMA200) stimmt zu",
    gateLblFresh: "Daten sind frisch",
    smcLblSweep: "Liquidität wurde gesweept",
    smcLblStructure: "Marktstruktur hat sich geändert",
    smcLblOb: "Order Block gefunden",
    smcLblFvg: "FVG-Gap gefunden",
    smcLblRr: "Risk/Reward ist in Ordnung",
    chkLblSweep: "Große Spieler haben Liquidität genommen",
    chkLblOb: "Zone der großen Spieler",
    chkLblFvg: "Leere Lücke im Preis",
    chkLblSr: "Starkes Support-/Resistance-Level",
    chkLblZones: "Kauf-/Verkaufsbereich",
    extLblCandle: "Kerze deutet den Trend an",
    extLblChoch: "Zeichen, dass der Trend sich ändern könnte",
    extLblMss: "Neuer Trend bestätigt",
    extLblBreaker: "Altes Level ist jetzt Support/Resistance",
    extLblIdm: "Zurück nach einer falschen Bewegung",
    extLblFib: "Fibonacci-Level (berechnet)",
    extLblBb: "Volatilitäts-Squeeze",
    extLblMacdDiv: "MACD und Preis sind sich uneinig",
    extLblMeanRev: "Wie weit der Preis vom Mittelwert entfernt ist",
    extLblKillzone: "Aktive Session-Zeit",
    extLblAsian: "Asiatische Session-Range",
    extLblVwap: "VWAP-Bänder (Durchschnittspreis)",
    extLblVol: "Volumen — wie viel gehandelt wurde",
    smcNoSignalBanner: "SMC gibt KEINE Signale — es ist nur eine Bestätigung für das Terminal-Signal.",
    smcConfirmStrong: "Starke Bestätigung ✓",
    smcConfirmWeak: "Bestätigung ist schwach — stark ab 80+",
    notASignalNote: "Das ist kein Signal — trade nur auf das Terminal-Signal.",
    confirmationLbl: "Bestätigung",
    smcEngineHeader: "SMC-ENGINE • AKTIV",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · 15M Makro & 5M Entry",
    smcSetupQuality: "Setup-Qualität",
    smcGradeStrong: "A · Stark",
    smcGradeModerate: "B · Moderat",
    smcGradeDeveloping: "C · Entwickelt sich",
    smcGradeWeak: "D · Schwach",
    smcWaiting80: "Wartet auf 80 %-Bestätigung",
    smcConfirmed80: "80 %-Bestätigung erreicht — starke Bestätigung für das Terminal-Signal",
    smcBias: "SMC-Bias (15M)",
    smcBiasBullish: "Bullisch",
    smcBiasBearish: "Bärisch",
    smcBiasNeutral: "Neutral",
    smcLiveMove: "Live-Bewegung (ab Entry)",
    smcGenerated: "Erstellt",
    smcBeTip: "Break-even-Tipp: Nach +100 Pips Gewinn den SL auf Entry bewegen — nur ein Hinweis, nicht automatisch.",
    smcFeedNote: "Das ist nur eine Bestätigung — trade nicht darauf, warte auf das Terminal-Signal.",
    perfNoteTerminal: "Die Gewinnrate wird nur aus Terminal-Signalen berechnet — SMC/Session werden hier nicht gezählt.",
    smcTpNote: "TP2/TP3: Nur das TP1/SL-Ergebnis wird aufgezeichnet.",
    smcInspectChart: "Chart prüfen",
    tgTitle: "Telegram-Alerts — Signale auf deinem Handy",
    tgText: "Wenn ein BUY/SELL-Signal erscheint, bekommst du eine Telegram-Nachricht auf dein Handy — auch wenn die Website geschlossen ist. Öffne den Link unten und drücke Start beim Bot.",
    tgButton: "📲 Alerts auf Telegram erhalten",
    tgPersonalTitle: "Dein persönlicher Telegram-Link",
    tgPersonalText: "Dieser Link gehört nur dir — er verknüpft die Alerts mit deinem Konto. Öffne den Link, drücke Start beim Bot, fertig! Alerts stoppen, wenn dein Plan abläuft oder gesperrt wird.",
    tgLinked: "✅ Telegram-Alerts sind AN — du bekommst eine Nachricht, wenn ein Signal erscheint.",
    tgNotLinked: "Telegram-Alerts sind noch nicht AN — öffne den Link und drücke Start.",
    tgCopyLink: "Link kopieren",
    tgLinkCopied: "Dein persönlicher Telegram-Link ist kopiert — drücke Start beim Bot.",
    marketCards: "Live-Markt",
    pcMarketPrice: "Marktpreis (letzter)",
    pcChange24h: "Tages-/24H-Änderung",
    pcSpread: "Spread",
    pcKeyLevels: "Historische Schlüssellevel",
    pcSources: "Quellen",
    liveMarketPrice: "LIVE-MARKTPREIS",
    awaitingConf: "WARTET AUF KONFLUENZ",
    scanningMarket: "Markt wird gescannt — wartet auf 85 % Konfluenz",
    confirmedTitle: "BESTÄTIGTE INDIKATOREN",
    passedLbl: "BESTANDEN",
    awaitingTitle: "WARTET AUF BESTÄTIGUNG",
    pendingLbl: "AUSSTEHEND",
    needsGate: "BRAUCHT 85 %",
    requiredTitle: "ERFORDERLICH VOR BUY ODER SELL",
    requiredBuy: "FÜR BUY-BESTÄTIGUNG",
    requiredSell: "FÜR SELL-BESTÄTIGUNG",
    reqBuyTpl: "Bullischer Bounce von {a} — Preis erobert {b} zurück",
    reqSellTpl: "Bärische Ablehnung von {a} — Preis verliert {b}",
    analyzeNow: "MARKT JETZT ANALYSIEREN",
    inspectInd: "INDIKATOREN PRÜFEN",
    downloadCard: "KARTE HERUNTERLADEN",
    liveTick: "Echtzeit-Tick synchronisiert",
    timeframeLbl: "ZEITRAHMEN",
    confidenceLbl: "VERTRAUEN",
    htfLbl: "Ausrichtung des höheren Zeitrahmens",
    adxRanging: "unter 20 — kein Trend (Ranging)",
    adxTrend: "20 oder mehr — Trend ist stark",
    smcConfirmLbl: "SMC-Bestätigung",
    rsiNeedBuy: "BUY braucht 50–70",
    rsiNeedSell: "SELL braucht 30–50",
    rrNeed: "R:R 1,5 erforderlich",
    bannerTerminal: "SIGNALE KOMMEN NUR VON HIER — trade auf der BUY/SELL-Karte",
    bannerSmc: "DAS IST KEIN SIGNAL — es ist nur eine Bestätigung",
    bannerSession: "DAS ZEIGT NUR DIE ZEIT — es gibt kein Signal",
    bannerHistory: "DAS SIND ALTE SIGNALE — trade nicht darauf, prüfe nur die Ergebnisse",
    bannerScanner: "DAS SUCHT NUR — das Signal entsteht im Terminal"
  },
  tr: {
    tagline: "Altın, Bitcoin ve Forex için canlı sinyaller",
    setupTitle: "İlk Kurulum",
    setupText: "Kendi Admin kullanıcı adını ve şifreni kendin oluştur. Şifreni kimseye gönderme — sadece sen bilmelisin.",
    setupBtn: "Admin Hesabı Oluştur",
    loginTitle: "Giriş",
    loginBtn: "Giriş",
    finePrint: "Hiçbir sinyal %100 kârlı değildir. Önce demoda pratik yap, gerçek parayı aceleyle riske atma.",
    logout: "Çıkış",
    refresh: "Yenile",
    refreshing: "Yenileniyor…",
    lastUpdate: "Son güncelleme",
    secAgo: "sn önce",
    tabTerminal: "Terminal",
    tabIndicators: "Göstergeler",
    tabSmc: "SMC",
    tabSession: "Seans",
    tabHistory: "Geçmiş",
    tabAccount: "Hesap",
    tabAdmin: "Admin",
    howSignalTitle: "Sinyal Ne Zaman ve Nasıl Oluşur?",
    howSignalText1: "Sinyalin sabit bir saati yoktur. BUY/SELL yalnızca 6 kapıdan %85 veya daha fazla puan alındığında oluşur. WAIT şu anlama gelir: şimdi işlem yapma, koşullar sağlanmadı.",
    howSignalText2: "SMC kapısı ayrıdır (%80) — SMC sekmesine bak. Terminal sinyali SMC kapısını beklemez.",
    tfHint: "En iyi zaman dilimi: 1H (4H trendiyle) — sinyaller 1H/4H'te en güvenilirdir; 15M yalnızca giriş zamanlaması içindir ve 5M çok gürültülüdür. (90 günlük backtest, 4 parite: kazanma oranı ~%60, kâr faktörü ~1,00 — başabaş, geçmiş bir sonuçtur, garanti değildir.)",
    rareSignals: "Sinyaller az ama daha kalitelidir — BUY/SELL yalnızca %85 kapısı geçildiğinde görünür. Daha fazla sinyal daha iyi sonuç demek değildir.",
    allPairsTitle: "Tüm Pariteler — Canlı Fiyatlar",
    indCenterTitle: "Gösterge Merkezi",
    indCenterText: "Bu sayıların tamamı gerçek Kraken mumlarından hesaplanır — EMA 20/50 trendi, RSI 14 momentumu ve ATR 14 fiyatın genellikle ne kadar hareket ettiğini gösterir.",
    indTfNote: "Aşağıdaki değerler 1H zaman dilimindedir — 15M ve Günlük ayrıca aşağıda listelenmiştir",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "SMC seviyeleri gerçek 15M mumlarının swing high/low değerlerinden alınır — büyük alıcıların/satıcıların genellikle beklediği yerlerdir. SMC skoru 5 bölüm × 20 puandan oluşur, kapı %80'dir. Terminal BUY/SELL bu sekmeden gelmez; Terminal'in kendi %85 koşullarını kullanır.",
    scannerTitle: "Küresel Piyasa Tarayıcı (11 parite, her 45 saniyede)",
    smcPairCardsTitle: "SMC Onayı — Her Parite",
    sessionTitle: "Seans Motoru",
    backtestTitle: "Seans Backtest Simülatörü",
    backtestText: "Seans kuralını gerçek 1H mumlarında çalıştırın.",
    backtestBtn: "Backtest Çalıştır (30 gün)",
    historyTitle: "Sinyal Geçmişi",
    historyText: "Yalnızca gerçekten kaydedilen sinyaller gösterilir — geçmişte uydurulmuş bir kayıt yoktur. Sonuç (Win/Loss/Break-Even/In-Flight) sonraki mumlarla kontrol edilerek gösterilir.",
    refinerTitle: "Strateji İyileştirici",
    refinerText: "Eşik yalnızca bu sürümden sonra kaydedilen sinyallere uygulanır, çünkü eski sinyallerde kapı skoru kaydedilmedi.",
    marketClosedTitle: "Piyasa Kapalı",
    marketClosedText: "Forex ve altın piyasası Cumartesi ve Pazar günleri kapalıdır — bu parite için yeni bir sinyal oluşmayacak. Burada gösterilen fiyat son mevcut fiyattır, canlı değildir.",
    marketClosedShort: "Piyasa kapalı — son mevcut fiyat",
    accountTitle: "Hesap",
    adminTitle: "Admin Paneli — Alıcı Hesapları",
    adminPlansText: "Aylık 30 gün · Üç Aylık 90 gün · Yıllık 365 gün · Ömür Boyu (asla bitmez). Plan bitince alıcı girişi otomatik olarak kilitlenir.",
    createBuyerBtn: "Alıcı Oluştur",
    newsTitle: "Temel Haberler",
    newsText: "En son forex/piyasa manşetleri — FXStreet ve ForexLive'ın ücretsiz RSS akışlarından.",
    chartTitle: "Fiyat Grafiği — Mumlar + EMA 20/50/200",
    indStripTitle: "Canlı Göstergeler",
    smcMacroTitle: "15M Makro",
    smcMicroTitle: "5M Mikro",
    smcFeedTitle: "SMC Onay Akışı — onay, sinyal değil",
    smcBacktestTitle: "SMC Backtest",
    termBacktestTitle: "Terminal Backtest (30 gün)",
    phSetupUser: "Admin kullanıcı adı (en az 3 karakter)",
    phSetupPass: "Admin şifresi (en az 6 karakter)",
    phLoginUser: "Kullanıcı adı",
    phLoginPass: "Şifre",
    phBuyerUser: "Alıcı kullanıcı adı",
    phBuyerPass: "Alıcı şifresi",
    phAiQ: "Soru yazın, örn.: sinyal ne zaman oluşur?",
    hello: "Merhaba",
    loading: "Yükleniyor…",
    noTrade: "(işlem yok)",
    price: "Fiyat",
    confluence: "Uyum",
    gate: "kapı",
    buySellPlans: "BUY ve SELL planları — ikisi birlikte",
    signalPlan: "Sinyal Planı — bir yön, bir işlem",
    smcChecklist: "SMC Uyum Listesi — bu sinyalin gerçek nedeni",
    oppScenario: "Karşı senaryo",
    oppGateNotMet: "kapı geçilmedi",
    chkSweep: "Likidite Süpürme",
    chkOB: "Order Block",
    chkFvg: "FVG (Adil Değer Boşluğu)",
    chkSR: "Destek / Direnç",
    chkZones: "Bölgeler (Talep / Arz)",
    chkYes: "✓ Destekliyor",
    chkNo: "✗ Desteklemiyor",
    chkNa: "– Nötr",
    noSweep: "Süpürme olmadı",
    noObDir: "Bu yönde order block bulunamadı",
    noFvgDir: "Bu yönde FVG bulunamadı",
    inDemand: "Fiyat talep bölgesinde",
    inSupply: "Fiyat arz bölgesinde",
    nearDemand: "Fiyat talep bölgesine yakın",
    nearSupply: "Fiyat arz bölgesine yakın",
    noZone: "Fiyat hiçbir bölgede değil",
    tradeZone: "İşlem Bölgesi",
    inZone: "BÖLGEDE — IN ZONE",
    nearZone: "Fiyat bölgeye yakın",
    farZone: "Fiyat bölgeden uzak",
    noZoneDir: "Bu yön için bölge bulunamadı",
    bosUp: "Yapı yukarı kırıldı (BOS) — yükseliş",
    bosDown: "Yapı aşağı kırıldı (BOS) — düşüş",
    noBreak: "Yapı kırılması yok — seviye tuttu",
    extTitle: "Genişletilmiş Uyum — 1H mumlarından",
    extNote: "Bunların hepsi yalnızca uyum içindir — sinyal yönünü veya kapıları (%85/%80) değiştirmez.",
    chkCandle: "Mum Formasyonu (1H)",
    chkChoch: "CHOCH (Karakter Değişimi)",
    chkMss: "MSS (Piyasa Yapısı Değişimi)",
    chkBreaker: "Breaker / Mitigation Blokları",
    chkIdm: "IDM (Tuzak)",
    chkFib: "Fibonacci Seviyeleri",
    chkBb: "Bollinger Sıkışması",
    chkMacdDiv: "MACD Uyumsuzluğu",
    chkMeanRev: "Ortalamaya Dönüş",
    chkKillzone: "Killzone / Seans Zamanlaması",
    chkAsian: "Asya Seansı Aralığı",
    chkVwap: "VWAP Bantları (±1σ / ±2σ)",
    chkVol: "Hacim (1H)",
    patBullEngulf: "Yükseliş Yutan Formasyon",
    patBearEngulf: "Düşüş Yutan Formasyon",
    patHammer: "Çekiç / Pin Bar (yükseliş)",
    patShootingStar: "Kayan Yıldız (düşüş)",
    patDoji: "Doji (nötr)",
    patMorningStar: "Sabah Yıldızı (yükseliş)",
    patEveningStar: "Akşam Yıldızı (düşüş)",
    noPattern: "Net bir formasyon yok",
    chochUp: "CHOCH yukarı — trende karşı kırılma",
    chochDown: "CHOCH aşağı — trende karşı kırılma",
    noChoch: "CHOCH yok",
    mssUp: "MSS yukarı — yeni trend onaylandı",
    mssDown: "MSS aşağı — yeni trend onaylandı",
    noMss: "MSS yok",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Breaker/mitigation bloğu yok",
    idmSsl: "IDM bulundu — SSL süpürme sonra geri alma (yükseliş)",
    idmBsl: "IDM bulundu — BSL süpürme sonra geri alma (düşüş)",
    noIdm: "IDM yok",
    fibNearest: "En yakın seviye",
    squeezeOn: "Sıkışma var — volatilite düşük, büyük hareket gelebilir",
    squeezeOff: "Sıkışma yok",
    meanNear: "Ortalamaya yakın",
    meanExtended: "Ortalamadan uzak",
    meanOver: "Çok aşırı uzamış",
    aboveMean: "ortalamanın üstünde",
    belowMean: "ortalamanın altında",
    macdBullDiv: "Yükseliş uyumsuzluğu — fiyat düşük, MACD yüksek",
    macdBearDiv: "Düşüş uyumsuzluğu — fiyat yüksek, MACD düşük",
    noMacdDiv: "MACD uyumsuzluğu yok",
    killActive: "Aktif killzone",
    killNext: "Sonraki killzone",
    kzAsian: "Asya",
    kzLondon: "Londra",
    kzNewYork: "New York",
    asianIn: "Fiyat aralık içinde",
    asianAbove: "Fiyat aralığın üstüne çıktı (genişleme)",
    asianBelow: "Fiyat aralığın altına çıktı (genişleme)",
    noAsian: "Asya aralığı bulunamadı",
    vwapNearest: "En yakın bant",
    volRising: "Hacim artıyor",
    volFalling: "Hacim düşüyor",
    volNormal: "Hacim normal",
    volNa: "Bu parite için hacim yok",
    dxyTitle: "Dolar Endeksi (DXY)",
    dxyNa: "DXY şu anda mevcut değil — Yahoo'dan alınamadı",
    corrLabel: "Korelasyon (20 periyot)",
    corrNeg: "negatif",
    corrPos: "pozitif",
    corrFlat: "zayıf",
    riskTitle: "Risk Yönetimi — rehber (canlı işlem yönetimi değil)",
    riskRrTarget: "R:R 1:2 hedefi — TP3'te tamamlanır",
    riskTp1: "TP1'de %50 kâr al, sonra SL'yi başabaş (giriş) noktasına taşı.",
    riskSize: "Pozisyon büyüklüğü: her işlemde hesabının yalnızca %1'ini riske at.",
    riskDd: "Drawdown kontrolü: tek işlemde asla %1'den fazla risk alma — kayıpları küçük tut.",
    sentiment: "24S Duygu",
    demandZone: "Talep Bölgesi",
    supplyZone: "Arz Bölgesi",
    liveComments: "Canlı Yorumlar",
    nextCheck: "Sonraki kontrol:",
    nextCheckSuffix: "sn (30 saniyelik izleme)",
    signalUpdated: "Sinyal güncellendi",
    buyGates: "BUY Kapıları",
    sellGates: "SELL Kapıları",
    entryZone: "Giriş Bölgesi",
    trigger: "Tetikleyici",
    scorecard: "Puan Kartı",
    trend: "Trend",
    momentum: "Momentum",
    volatility: "Volatilite",
    volume: "Hacim",
    structure: "Yapı",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M ve Günlük",
    smcScore: "SMC Skoru",
    gatePass: "Kapı geçildi!",
    gateNotMet: "kapı geçilmedi",
    swingLevels: "Swing Seviyeleri",
    swingHigh: "Son Swing High",
    swingLow: "Son Swing Low",
    liqSweeps: "Likidite Süpürmeleri",
    orderBlocks: "Order Block'lar",
    bullOB: "Yükseliş OB",
    bearOB: "Düşüş OB",
    fresh: "taze",
    mitigated: "hafifletilmiş",
    fvg: "Adil Değer Boşlukları (FVG)",
    noFvg: "FVG bulunamadı.",
    microSweeps: "5M Mikro SSL süpürmeleri",
    liqPools: "Likidite havuzları",
    pair: "Parite",
    direction: "Yön",
    confirmedSignals: "SMC onayları",
    cycleEvery: "Döngü: her",
    cycleSec: "saniye",
    sessionActive: "Aktif",
    nowPkt: "Şu anki PKT saati",
    nextSession: "Sonraki seans",
    minutes: "dakika",
    newsBlackout: "Haber karartması",
    notAvailable: "Mevcut değil",
    sessionStats: "Seans istatistikleri",
    total: "Toplam",
    sessionHistoryBtn: "Seans Geçmişini Gör",
    noSessionSignals: "Henüz seans sinyali kaydedilmedi.",
    backtestRunning: "Backtest çalışıyor…",
    trades: "İşlemler",
    wins: "Kazançlar",
    losses: "Kayıplar",
    winRate: "Kazanma Oranı",
    profitFactor: "Kâr Faktörü",
    totalExecuted: "Toplam Gerçekleşen",
    breakEven: "Başabaş",
    inFlight: "Devam Ediyor",
    noClosed: "— (henüz kapanmış sinyal yok)",
    noSignals: "Henüz sinyal kaydedilmedi.",
    cutoff: "Eşik",
    qualifying: "Uygun kurulumlar",
    simWinRate: "Simüle Kazanma Oranı",
    allOutcomes: "Tüm sonuçlar",
    allEngines: "Tüm motorlar",
    mainTerminal: "Ana Terminal",
    smcEngine: "SMC Motoru",
    sessionEngine: "Seans Motoru",
    newsIntel: "Haber İstihbaratı",
    username: "Kullanıcı adı",
    role: "Rol",
    plan: "Plan",
    planExpiry: "Plan bitiş tarihi",
    daysLeft: "gün kaldı",
    lifetimeNever: "Ömür boyu — asla bitmez",
    managePlan: "Planı değiştirmek için yöneticiyle iletişime geçin",
    signals: "Sinyaller",
    engines: "Motorlar",
    engineOffNote: "KAPALI motor gerçekten kapalıdır — sinyal üretmez. Test Push yalnızca uygulama içi test mesajıdır, gerçek push bildirimi değildir.",
    testPushBtn: "Test Push (uygulama içi test)",
    testPushMsg: "Test push (uygulama içi): bu yalnızca bir testtir, gerçek push bildirimi değildir.",
    historyTabText: "Tüm sinyaller Geçmiş sekmesinde.",
    openHistory: "Geçmişi Aç",
    tfLoading: "TF Matrisi yükleniyor…",
    exportText: "Sinyalleri CSV olarak indirin.",
    exportBtn: "CSV Dışa Aktar",
    aiTitle: "AI Ajanı — yalnızca uygulama içi.",
    aiText: "Bu canlı bir AI hizmeti değil, yalnızca uygulama içi bir yardımcıdır.",
    aiAsk: "Sor",
    defaultPair: "Varsayılan parite",
    saved: "Kaydedildi.",
    totalBuyers: "Toplam alıcı",
    expired: "Süresi doldu",
    bandHai: "Askıya alındı",
    active: "Aktif",
    lifetime: "Ömür Boyu",
    expiry: "Bitiş",
    extend30: "+30 gün",
    suspend: "Askıya al",
    reopen: "Yeniden aç",
    changePass: "Şifre değiştir",
    delete: "Sil",
    noBuyers: "Henüz alıcı yok.",
    buyerCreated: "Alıcı oluşturuldu",
    passChanged: "Şifre değiştirildi.",
    ownPassTitle: "Kendi şifreni değiştir",
    phNewPass: "Yeni şifre (en az 6 karakter)",
    phConfirmPass: "Şifreyi tekrar yazın",
    passTooShort: "Şifre en az 6 karakter olmalı",
    passMismatch: "İki şifre eşleşmiyor",
    saveBtn: "Kaydet",
    cancelBtn: "İptal",
    newPassPrompt: "Yeni şifre (en az 6 karakter):",
    deleteConfirm: " — bu kullanıcıyı silmek istiyor musunuz?",
    serverUnreachable: "Sunucuya ulaşılamıyor:",
    priceLoadFail: "Fiyatlar yüklenemedi:",
    signalLoadFail: "Sinyal yüklenemedi:",
    indLoadFail: "Göstergeler yüklenemedi:",
    indNoData: "Göstergeler için mum bulunamadı.",
    smcLoadFail: "SMC yüklenemedi:",
    smcNoData: "SMC verisi yok.",
    scannerFail: "Tarayıcı yüklenemedi:",
    sessionLoadFail: "Seans yüklenemedi:",
    newsFail: "Haberler şu anda mevcut değil — birazdan tekrar deneyin.",
    newsFallbackNote: "Bir akış kapalı — gösterilen başlıklar çalışan akıştandır",
    newsUpdated: "Güncellendi",
    newSignal: "Yeni Sinyal!",
    alertsNote: "Uyarılar yalnızca site açıkken çalışır — kapalı sekmede veya kapalı telefonda çalışmaz.",
    sound: "Ses",
    notifications: "Bildirimler",
    status: "Durum",
    session: "Seans",
    pktTime: "PKT Saati",
    quality: "Kalite",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Sinyal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Henüz SMC onayı kaydedilmedi.",
    smcBacktestRunning: "SMC backtest çalışıyor…",
    termBacktestRunning: "Terminal backtest çalışıyor…",
    termBacktestNote: "Son 30 gün, 1H mumları — gelecek için garanti değil. Temel = Terminal motoru (6 kapı, %85 kapı). Filtreler her paritede iyileşme göstermedi, bu yüzden canlı motora filtre eklenmedi.",
    termBacktestBtn: "Terminal Backtest Çalıştır",
    smcBacktestBtn: "SMC Backtest Çalıştır (30 gün)",
    smcBacktestNote: "Gerçek 15M mumlarında SMC kuralı (skor %80+) — uydurma sayı yok.",
    filter: "Filtre",
    baseline: "Temel",
    macdAgree: "MACD uyumlu",
    noDeadHours: "Ölü saat yok",
    chartNoData: "Grafik için mum bulunamadı.",
    allSessions: "Tüm Seanslar (PKT saati)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Piyasa Yapısı (BOS/MSS)",
    buyNow: "🟢 ŞİMDİ AL",
    sellNow: "🔴 ŞİMDİ SAT",
    waitNoTrade: "⏳ WAIT — işlem yok",
    bannerLine: "Bu işlemi şimdi alın — Entry, SL ve TP aşağıda verildi.",
    approaching: "YAKLAŞIYOR — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Genel Bakış",
    engineControls: "Motor Kontrolleri",
    signalDetails: "Sinyal Detayları",
    signalHistory: "Sinyal Geçmişi",
    tfMatrix: "TF Matrisi",
    trackingLogs: "Takip Kayıtları",
    exportCsv: "CSV Dışa Aktar",
    aiAgent: "AI Ajanı",
    preferences: "Tercihler",
    copySignal: "📋 Sinyali Kopyala",
    downloadSignal: "⬇️ Resmi İndir",
    copyDone: "Sinyal kopyalandı",
    copyDoneBody: "Sinyal metni kopyalandı — WhatsApp veya Telegram'a yapıştırın.",
    copyFailBody: "Kopyalanamadı — metni elle seçip kopyalayın.",
    imgDone: "Resim indirildi",
    imgDoneBody: "Sinyal kartı resmi indirildi.",
    imgFail: "Resim indirilemedi — tekrar deneyin.",
    shareDisclaimer: "Hiçbir sinyal %100 kârlı değildir.",
    close: "Kapat",
    scanNow: "🔍 Şimdi Tara",
    scanning: "Taranıyor…",
    monitorEvery: "Her",
    stopMonitoring: "⏸ Durdur",
    startMonitoring: "▶ Başlat",
    monitoringOff: "İzleme kapalı — Başlat'a basın",
    scanDone: "Tarama tamamlandı",
    scanDoneBody: "Tüm pariteler yeniden tarandı.",
    scanFailBody: "Tarama başarısız — tekrar deneyin.",
    bestTimeframe: "En iyi zaman dilimi: 1H (4H de olur) — 15M yalnızca giriş zamanlaması için",
    signalCode: "Sinyal Kodu",
    validUntil: "Geçerlilik:",
    newSignalPopup: "Sinyal Geldi!",
    whyWait: "Neden Bekliyoruz? — Why Wait?",
    copyWaitAnalysis: "📋 WAIT Analizini Kopyala",
    waitCopyDone: "WAIT analizi kopyalandı",
    waitCopyDoneBody: "WAIT analizi kopyalandı — WhatsApp veya Telegram'a yapıştırın.",
    smcBelowGate: "SMC kapısının altında",
    zoneBlockedReason: "Bu yönün arkasında uygun bölge yok",
    shareCard: "📤 Paylaşım Kartı",
    downloadHighRes: "⬇️ Yüksek Çözünürlüklü PNG İndir",
    copyImage: "🖼️ Resmi Kopyala",
    copyFormattedText: "📋 Biçimli Metni Kopyala",
    formattedPreview: "Biçimli Metin Önizlemesi (Telegram / WhatsApp)",
    imgCopyDone: "Resim kopyalandı",
    imgCopyDoneBody: "Sinyal kartı resmi panoya kopyalandı.",
    imgCopyFail: "Resim kopyalanamadı",
    imgCopyFailBody: "Bu tarayıcıda resim kopyalama desteklenmiyor — İndir'i kullanın.",
    dcaNote: "DCA: TP1'de %50 kâr al, kalanını TP2/TP3'e kadar bırak.",
    breakevenNote: "Başabaş: TP1'den sonra SL'yi girişe taşı.",
    stepSignal: "Sinyal",
    stepEntry: "Giriş bölgesi",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "İşlem kapandı",
    progression: "İlerleme",
    confluenceLbl: "Uyum",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Duygu Dalgası — hesaplanmış (tahmin değil)",
    sentimentWaveNote: "Bu duygu gerçek RSI, trend ve bölgelerden hesaplanır — bir tahmin değildir.",
    demandIndex: "Talep Endeksi",
    supplyIndex: "Arz Endeksi",
    zoneCorridor: "Bölge Koridoru",
    histDetails: "Sinyal Detayları (kayıtlı)",
    gatesNotSaved: "Bu sinyal için kapı detayları kaydedilmedi.",
    detailsBtn: "Detaylar",
    pivotTitle: "Pivot Noktaları (önceki gün)",
    fearGreedTitle: "Bitcoin Korku ve Açgözlülük (alternative.me)",
    fearGreedNa: "Korku ve Açgözlülük şu anda alınamadı.",
    riskProfile: "Risk Profili",
    riskConservative: "Muhafazakâr",
    riskModerate: "Orta",
    riskAggressive: "Agresif",
    riskConsText: "Yalnızca yüksek uyumlu sinyaller — işlem başına %1 risk",
    riskModText: "Standart — işlem başına %1 risk",
    riskAggText: "Daha yüksek risk — işlem başına %2'ye kadar, drawdown daha büyük olabilir",
    riskProfileLine: "Risk profiliniz",
    timezone: "Saat Dilimi",
    theme: "Tema",
    themeDark: "Koyu",
    themeLight: "Açık",
    language: "Dil",
    prefPair: "Tercih Edilen Parite",
    engineStatus: "Motor Durumu",
    prefSaved: "Tercihler kaydedildi.",
    guideTitle: "İşlem Nasıl Alınır? — 4 Kolay Adım",
    guideStep1: "Yalnızca BUY veya SELL sinyalinde işlem alın — WAIT'te asla işlem yapmayın.",
    guideStep2: "Entry, SL ve TP kartta yazılıdır — SL'den fazla risk almayın.",
    guideStep3: "Onay kartın üzerindedir: skor kapının üstündedir ve nedenler aşağıda \"Neden bu işlem?\" altında listelenmiştir.",
    guideStep4: "En iyi zaman dilimi 1H'tir (4H de olur) — 15M yalnızca giriş zamanlaması içindir.",
    whyTradeTitle: "Neden bu işlem? — Onay",
    whyTrend: "Trend bu tarafta",
    whyZone: "Fiyat işlem bölgesinde",
    whyZoneNear: "Fiyat işlem bölgesine yakın",
    whySmcHigh: "SMC skoru 80+ — akıllı para da bu tarafta",
    whyTopGate: "En güçlü kontrol",
    oneTradeLabel: "Aynı anda yalnızca bir işlem",
    oneTradeNote: "Aynı anda yalnızca bir işlem — diğer yönün kurulumu gösterilmez.",
    gatesExplain: "6 kontrol, 100 puan — sinyal yalnızca 85+ ile oluşur (sınavdaki geçme notu gibi).",
    smcExplain: "5 bölüm, 100 puan — 80+ iyidir (güçlü onay).",
    gateLblTrendUp: "Trend yukarı (EMA)",
    gateLblTrendDown: "Trend aşağı (EMA)",
    gateLblStructure: "Yapı güçlü",
    gateLblRsi: "RSI sağlıklı aralıkta",
    gateLblRr: "Ödül riskten büyük",
    gateLblEma200: "Büyük trend (EMA200) uyumlu",
    gateLblFresh: "Veri taze",
    smcLblSweep: "Likidite süpürüldü",
    smcLblStructure: "Piyasa yapısı değişti",
    smcLblOb: "Order block bulundu",
    smcLblFvg: "FVG boşluğu bulundu",
    smcLblRr: "Risk/ödül iyi",
    chkLblSweep: "Büyük oyuncular likidite aldı",
    chkLblOb: "Büyük oyuncuların bölgesi",
    chkLblFvg: "Fiyatta boşluk",
    chkLblSr: "Güçlü destek/direnç seviyesi",
    chkLblZones: "Alım/satım bölgesi",
    extLblCandle: "Mum trendi işaret ediyor",
    extLblChoch: "Trendin değişebileceğine dair işaret",
    extLblMss: "Yeni trend onaylandı",
    extLblBreaker: "Eski seviye artık destek/direnç",
    extLblIdm: "Sahte hareketten sonra geri dönüş",
    extLblFib: "Fibonacci seviyesi (hesaplanmış)",
    extLblBb: "Volatilite sıkışması",
    extLblMacdDiv: "MACD ve fiyat anlaşmazlık içinde",
    extLblMeanRev: "Fiyat ortalamadan ne kadar uzakta",
    extLblKillzone: "Aktif seans saati",
    extLblAsian: "Asya seansı aralığı",
    extLblVwap: "VWAP bantları (ortalama fiyat)",
    extLblVol: "Hacim — ne kadar işlem yapıldı",
    smcNoSignalBanner: "SMC sinyal VERMEZ — yalnızca Terminal sinyali için onaydır.",
    smcConfirmStrong: "Güçlü onay ✓",
    smcConfirmWeak: "Onay zayıf — 80+ ile güçlü olur",
    notASignalNote: "Bu bir sinyal değildir — yalnızca Terminal sinyalinde işlem yapın.",
    confirmationLbl: "Onay",
    smcEngineHeader: "SMC MOTORU • AKTİF",
    smcEngineSub: "Likidite Süpürmeleri · Order Block'lar · FVG'ler · 15M Makro ve 5M Giriş",
    smcSetupQuality: "Kurulum Kalitesi",
    smcGradeStrong: "A · Güçlü",
    smcGradeModerate: "B · Orta",
    smcGradeDeveloping: "C · Gelişiyor",
    smcGradeWeak: "D · Zayıf",
    smcWaiting80: "%80 onay bekleniyor",
    smcConfirmed80: "%80 onay alındı — Terminal sinyali için güçlü onay",
    smcBias: "SMC Eğilimi (15M)",
    smcBiasBullish: "Yükseliş",
    smcBiasBearish: "Düşüş",
    smcBiasNeutral: "Nötr",
    smcLiveMove: "Canlı hareket (girişten)",
    smcGenerated: "Oluşturuldu",
    smcBeTip: "Başabaş ipucu: +100 pip kârdan sonra SL'yi Giriş'e taşıyın — yalnızca öneridir, otomatik değildir.",
    smcFeedNote: "Bu yalnızca onaydır — bununla işlem yapmayın, Terminal sinyalini bekleyin.",
    perfNoteTerminal: "Kazanma oranı yalnızca Terminal sinyallerinden hesaplanır — SMC/Seans burada sayılmaz.",
    smcTpNote: "TP2/TP3: yalnızca TP1/SL sonucu kaydedilir.",
    smcInspectChart: "Grafiği İncele",
    tgTitle: "Telegram Uyarıları — Sinyaller Telefonunuzda",
    tgText: "BUY/SELL sinyali geldiğinde telefonunuza Telegram mesajı gelir — site kapalıyken bile. Aşağıdaki bağlantıyı açın ve botta Start'a basın.",
    tgButton: "📲 Telegram'da Uyarıları Al",
    tgPersonalTitle: "Kişisel Telegram Bağlantınız",
    tgPersonalText: "Bu bağlantı yalnızca sizindir — uyarıları hesabınıza bağlar. Bağlantıyı açın, botta Start'a basın, bu kadar! Planınız biterse veya askıya alınırsa uyarılar durur.",
    tgLinked: "✅ Telegram uyarıları AÇIK — sinyal geldiğinde mesaj alırsınız.",
    tgNotLinked: "Telegram uyarıları henüz AÇIK değil — bağlantıyı açıp Start'a basın.",
    tgCopyLink: "Bağlantıyı Kopyala",
    tgLinkCopied: "Kişisel Telegram bağlantınız kopyalandı — botta Start'a basın.",
    marketCards: "Canlı Piyasa",
    pcMarketPrice: "Piyasa Fiyatı (Son)",
    pcChange24h: "Günlük / 24S Değişim",
    pcSpread: "Spread",
    pcKeyLevels: "Tarihsel Önemli Seviyeler",
    pcSources: "Kaynaklar",
    liveMarketPrice: "CANLI PİYASA FİYATI",
    awaitingConf: "UYUM BEKLENİYOR",
    scanningMarket: "Piyasa taranıyor — %85 uyum bekleniyor",
    confirmedTitle: "ONAYLANAN GÖSTERGELER",
    passedLbl: "GEÇTİ",
    awaitingTitle: "ONAY BEKLENİYOR",
    pendingLbl: "BEKLİYOR",
    needsGate: "%85 GEREKİYOR",
    requiredTitle: "BUY VEYA SELL ÖNCESİ GEREKENLER",
    requiredBuy: "BUY ONAYI İÇİN",
    requiredSell: "SELL ONAYI İÇİN",
    reqBuyTpl: "{a} seviyesinden yükseliş sıçraması — fiyat {b} seviyesini geri alıyor",
    reqSellTpl: "{a} seviyesinden düşüş reddi — fiyat {b} seviyesini kaybediyor",
    analyzeNow: "PİYASAYI ŞİMDİ ANALİZ ET",
    inspectInd: "GÖSTERGELERİ İNCELE",
    downloadCard: "KARTI İNDİR",
    liveTick: "Gerçek Zamanlı Tick Senkronize",
    timeframeLbl: "ZAMAN DİLİMİ",
    confidenceLbl: "GÜVEN",
    htfLbl: "Üst Zaman Dilimi Uyumu",
    adxRanging: "20'nin altında — trend yok (yatay)",
    adxTrend: "20 veya üstü — trend güçlü",
    smcConfirmLbl: "SMC Onayı",
    rsiNeedBuy: "BUY için 50–70 gerekli",
    rsiNeedSell: "SELL için 30–50 gerekli",
    rrNeed: "R:R 1.5 gerekli",
    bannerTerminal: "SİNYALLER YALNIZCA BURADAN GELİR — BUY/SELL kartında işlem yapın",
    bannerSmc: "BU BİR SİNYAL DEĞİLDİR — yalnızca onaydır",
    bannerSession: "BU YALNIZCA SAATİ SÖYLER — sinyal vermez",
    bannerHistory: "BUNLAR ESKİ SİNYALLERDİR — bunlarla işlem yapmayın, yalnızca sonuçları kontrol edin",
    bannerScanner: "BU YALNIZCA ARAR — sinyal Terminal'de oluşur"
  },
  pt: {
    tagline: "Sinais ao vivo de ouro, Bitcoin e Forex",
    setupTitle: "Configuração inicial",
    setupText: "Crie seu próprio nome de usuário e senha de Admin. Nunca envie sua senha a ninguém — só você deve conhecê-la.",
    setupBtn: "Criar conta de Admin",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "Nenhum sinal é 100% lucrativo. Pratique primeiro na demo, não arrisque dinheiro real com pressa.",
    logout: "Sair",
    refresh: "Atualizar",
    refreshing: "Atualizando…",
    lastUpdate: "Última atualização",
    secAgo: "s atrás",
    tabTerminal: "Terminal",
    tabIndicators: "Indicadores",
    tabSmc: "SMC",
    tabSession: "Sessão",
    tabHistory: "Histórico",
    tabAccount: "Conta",
    tabAdmin: "Admin",
    howSignalTitle: "Quando e como um sinal é formado?",
    howSignalText1: "Não há horário fixo para um sinal. BUY/SELL só se forma quando 85% ou mais dos pontos são obtidos nas 6 portas. WAIT significa: não opere agora, as condições não foram atendidas.",
    howSignalText2: "A porta do SMC é separada (80%) — veja a aba SMC. O sinal do Terminal não espera pela porta do SMC.",
    tfHint: "Melhor timeframe: 1H (com a tendência de 4H) — os sinais são mais confiáveis em 1H/4H; 15M é só para o timing de entrada e 5M tem muito ruído. (Backtest de 90 dias, 4 pares: taxa de acerto ~60%, fator de lucro ~1,00 — equilíbrio, um resultado passado, não uma garantia.)",
    rareSignals: "Os sinais são poucos, mas de melhor qualidade — BUY/SELL só aparece quando a porta de 85% é superada. Mais sinais não significam melhores resultados.",
    allPairsTitle: "Todos os pares — Preços ao vivo",
    indCenterTitle: "Centro de indicadores",
    indCenterText: "Todos esses números são calculados a partir de velas reais da Kraken — EMA 20/50 mostra a tendência, RSI 14 o momentum, e ATR 14 o quanto o preço geralmente se move.",
    indTfNote: "Os valores abaixo são de 1H — 15M e Diário estão listados separadamente abaixo",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "Os níveis de SMC vêm dos máximos e mínimos reais das velas de 15M — onde os grandes compradores e vendedores costumam esperar. A pontuação SMC é composta por 5 partes × 20 pontos, porta 80%. O BUY/SELL do Terminal não vem desta aba; usa as próprias condições de 85% do Terminal.",
    scannerTitle: "Scanner global de mercado (11 pares, a cada 45 segundos)",
    smcPairCardsTitle: "Confirmação SMC — Cada par",
    sessionTitle: "Motor de sessões",
    backtestTitle: "Simulador de backtest de sessão",
    backtestText: "Execute a regra de sessão em velas reais de 1H.",
    backtestBtn: "Executar backtest (30 dias)",
    historyTitle: "Histórico de sinais",
    historyText: "Somente sinais realmente registrados são exibidos — nenhum histórico passado foi inventado. O resultado (Win/Loss/Break-Even/In-Flight) é verificado com as velas posteriores.",
    refinerTitle: "Refinador de estratégia",
    refinerText: "O limite só se aplica aos sinais registrados após esta versão, porque os sinais antigos não salvaram a pontuação da porta.",
    marketClosedTitle: "Mercado fechado",
    marketClosedText: "O mercado de forex e ouro está fechado no sábado e no domingo — nenhum novo sinal será formado para este par. O preço mostrado é o último disponível, não ao vivo.",
    marketClosedShort: "Mercado fechado — último preço disponível",
    accountTitle: "Conta",
    adminTitle: "Painel Admin — Contas de compradores",
    adminPlansText: "Mensal 30 dias · Trimestral 90 dias · Anual 365 dias · Vitalício (nunca expira). Quando o plano termina, o login do comprador é bloqueado automaticamente.",
    createBuyerBtn: "Criar comprador",
    newsTitle: "Notícias fundamentais",
    newsText: "Últimas manchetes de forex/mercado — dos feeds RSS gratuitos da FXStreet e ForexLive.",
    chartTitle: "Gráfico de preços — Velas + EMA 20/50/200",
    indStripTitle: "Indicadores ao vivo",
    smcMacroTitle: "Macro 15M",
    smcMicroTitle: "Micro 5M",
    smcFeedTitle: "Feed de confirmação SMC — confirmação, não sinal",
    smcBacktestTitle: "Backtest SMC",
    termBacktestTitle: "Backtest do Terminal (30 dias)",
    phSetupUser: "Nome de usuário Admin (mín. 3 caracteres)",
    phSetupPass: "Senha Admin (mín. 6 caracteres)",
    phLoginUser: "Nome de usuário",
    phLoginPass: "Senha",
    phBuyerUser: "Nome de usuário do comprador",
    phBuyerPass: "Senha do comprador",
    phAiQ: "Escreva uma pergunta, ex.: quando um sinal é formado?",
    hello: "Olá",
    loading: "Carregando…",
    noTrade: "(sem operação)",
    price: "Preço",
    confluence: "Confluência",
    gate: "porta",
    buySellPlans: "Planos de BUY e SELL — os dois juntos",
    signalPlan: "Plano de sinal — uma direção, uma operação",
    smcChecklist: "Lista de confluência SMC — o motivo real deste sinal",
    oppScenario: "Cenário oposto",
    oppGateNotMet: "porta não superada",
    chkSweep: "Varredura de liquidez",
    chkOB: "Bloco de ordens",
    chkFvg: "FVG (Gap de valor justo)",
    chkSR: "Suporte / Resistência",
    chkZones: "Zonas (Demanda / Oferta)",
    chkYes: "✓ Apoia",
    chkNo: "✗ Não apoia",
    chkNa: "– Neutro",
    noSweep: "Nenhuma varredura",
    noObDir: "Nenhum bloco de ordens encontrado nesta direção",
    noFvgDir: "Nenhum FVG encontrado nesta direção",
    inDemand: "O preço está na zona de demanda",
    inSupply: "O preço está na zona de oferta",
    nearDemand: "O preço está perto da zona de demanda",
    nearSupply: "O preço está perto da zona de oferta",
    noZone: "O preço não está em nenhuma zona",
    tradeZone: "Zona de operação",
    inZone: "NA ZONA — IN ZONE",
    nearZone: "O preço está perto da zona",
    farZone: "O preço está longe da zona",
    noZoneDir: "Nenhuma zona encontrada para esta direção",
    bosUp: "Estrutura rompida para cima (BOS) — alta",
    bosDown: "Estrutura rompida para baixo (BOS) — baixa",
    noBreak: "Sem rompimento de estrutura — o nível se manteve",
    extTitle: "Confluência estendida — de velas de 1H",
    extNote: "Tudo isso é apenas confluência — não muda a direção do sinal nem as portas (85%/80%).",
    chkCandle: "Padrão de velas (1H)",
    chkChoch: "CHOCH (Mudança de caráter)",
    chkMss: "MSS (Mudança de estrutura de mercado)",
    chkBreaker: "Blocos breaker / mitigação",
    chkIdm: "IDM (Indução)",
    chkFib: "Níveis de Fibonacci",
    chkBb: "Compressão de Bollinger",
    chkMacdDiv: "Divergência MACD",
    chkMeanRev: "Reversão à média",
    chkKillzone: "Killzone / Horário de sessão",
    chkAsian: "Intervalo da sessão asiática",
    chkVwap: "Bandas VWAP (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Engolfo de alta",
    patBearEngulf: "Engolfo de baixa",
    patHammer: "Martelo / Pin Bar (alta)",
    patShootingStar: "Estrela cadente (baixa)",
    patDoji: "Doji (neutro)",
    patMorningStar: "Estrela da manhã (alta)",
    patEveningStar: "Estrela da tarde (baixa)",
    noPattern: "Sem padrão claro",
    chochUp: "CHOCH para cima — rompimento contra a tendência",
    chochDown: "CHOCH para baixo — rompimento contra a tendência",
    noChoch: "Sem CHOCH",
    mssUp: "MSS para cima — nova tendência confirmada",
    mssDown: "MSS para baixo — nova tendência confirmada",
    noMss: "Sem MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigação",
    noBreaker: "Sem bloco breaker/mitigação",
    idmSsl: "IDM encontrado — varredura SSL e depois recuperação (alta)",
    idmBsl: "IDM encontrado — varredura BSL e depois recuperação (baixa)",
    noIdm: "Sem IDM",
    fibNearest: "Nível mais próximo",
    squeezeOn: "Há compressão — volatilidade baixa, um grande movimento pode vir",
    squeezeOff: "Sem compressão",
    meanNear: "Perto da média",
    meanExtended: "Longe da média",
    meanOver: "Muito sobre-estendido",
    aboveMean: "acima da média",
    belowMean: "abaixo da média",
    macdBullDiv: "Divergência de alta — preço mais baixo, MACD mais alto",
    macdBearDiv: "Divergência de baixa — preço mais alto, MACD mais baixo",
    noMacdDiv: "Sem divergência MACD",
    killActive: "Killzone ativa",
    killNext: "Próxima killzone",
    kzAsian: "Asiática",
    kzLondon: "Londres",
    kzNewYork: "Nova York",
    asianIn: "O preço está dentro do intervalo",
    asianAbove: "O preço se expandiu acima do intervalo",
    asianBelow: "O preço se expandiu abaixo do intervalo",
    noAsian: "Nenhum intervalo asiático encontrado",
    vwapNearest: "Banda mais próxima",
    volRising: "O volume está subindo",
    volFalling: "O volume está caindo",
    volNormal: "Volume normal",
    volNa: "Sem volume disponível para este par",
    dxyTitle: "Índice do dólar (DXY)",
    dxyNa: "DXY não está disponível agora — não recebido do Yahoo",
    corrLabel: "Correlação (20 períodos)",
    corrNeg: "negativa",
    corrPos: "positiva",
    corrFlat: "fraca",
    riskTitle: "Gestão de risco — orientação (não gestão de operações ao vivo)",
    riskRrTarget: "Meta R:R 1:2 — alcançada em TP3",
    riskTp1: "Em TP1, realize 50% do lucro, depois mova o SL para o ponto de equilíbrio (entrada).",
    riskSize: "Tamanho da posição: arrisque apenas 1% da sua conta por operação.",
    riskDd: "Controle de drawdown: nunca arrisque mais de 1% em uma operação — mantenha as perdas pequenas.",
    sentiment: "Sentimento 24H",
    demandZone: "Zona de demanda",
    supplyZone: "Zona de oferta",
    liveComments: "Comentários ao vivo",
    nextCheck: "Próxima verificação em",
    nextCheckSuffix: "s (monitoramento de 30 segundos)",
    signalUpdated: "Sinal atualizado",
    buyGates: "Portas de BUY",
    sellGates: "Portas de SELL",
    entryZone: "Zona de entrada",
    trigger: "Gatilho",
    scorecard: "Cartão de pontuação",
    trend: "Tendência",
    momentum: "Momentum",
    volatility: "Volatilidade",
    volume: "Volume",
    structure: "Estrutura",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M e Diário",
    smcScore: "Pontuação SMC",
    gatePass: "Porta superada!",
    gateNotMet: "porta não superada",
    swingLevels: "Níveis de swing",
    swingHigh: "Último swing alto",
    swingLow: "Último swing baixo",
    liqSweeps: "Varreduras de liquidez",
    orderBlocks: "Blocos de ordens",
    bullOB: "OB de alta",
    bearOB: "OB de baixa",
    fresh: "fresco",
    mitigated: "mitigado",
    fvg: "Gaps de valor justo (FVG)",
    noFvg: "Nenhum FVG encontrado.",
    microSweeps: "Varreduras SSL micro de 5M",
    liqPools: "Reservas de liquidez",
    pair: "Par",
    direction: "Direção",
    confirmedSignals: "Confirmações SMC",
    cycleEvery: "Ciclo: a cada",
    cycleSec: "segundos",
    sessionActive: "Ativa",
    nowPkt: "Hora PKT atual",
    nextSession: "Próxima sessão",
    minutes: "minutos",
    newsBlackout: "Apagão de notícias",
    notAvailable: "Não disponível",
    sessionStats: "Estatísticas de sessão",
    total: "Total",
    sessionHistoryBtn: "Ver histórico de sessão",
    noSessionSignals: "Nenhum sinal de sessão registrado ainda.",
    backtestRunning: "Executando backtest…",
    trades: "Operações",
    wins: "Ganhas",
    losses: "Perdidas",
    winRate: "Taxa de acerto",
    profitFactor: "Fator de lucro",
    totalExecuted: "Total executado",
    breakEven: "Ponto de equilíbrio",
    inFlight: "Em andamento",
    noClosed: "— (ainda nenhum sinal fechado)",
    noSignals: "Nenhum sinal registrado ainda.",
    cutoff: "Limite",
    qualifying: "Setups qualificados",
    simWinRate: "Taxa de acerto simulada",
    allOutcomes: "Todos os resultados",
    allEngines: "Todos os motores",
    mainTerminal: "Terminal principal",
    smcEngine: "Motor SMC",
    sessionEngine: "Motor de sessão",
    newsIntel: "Inteligência de notícias",
    username: "Nome de usuário",
    role: "Função",
    plan: "Plano",
    planExpiry: "Validade do plano",
    daysLeft: "dias restantes",
    lifetimeNever: "Vitalício — nunca expira",
    managePlan: "Para mudar de plano, fale com o administrador",
    signals: "Sinais",
    engines: "Motores",
    engineOffNote: "Um motor OFF está realmente desligado — não gera sinais. O Test Push é apenas uma mensagem de teste dentro do app, não uma notificação push real.",
    testPushBtn: "Test Push (teste no app)",
    testPushMsg: "Test push (no app): isto é apenas um teste, não uma notificação push real.",
    historyTabText: "Todos os sinais estão na aba Histórico.",
    openHistory: "Abrir histórico",
    tfLoading: "Carregando matriz TF…",
    exportText: "Baixe os sinais em CSV.",
    exportBtn: "Exportar CSV",
    aiTitle: "Agente IA — só no app.",
    aiText: "Isto não é um serviço de IA ao vivo, apenas um ajudante dentro do app.",
    aiAsk: "Perguntar",
    defaultPair: "Par padrão",
    saved: "Salvo.",
    totalBuyers: "Total de compradores",
    expired: "Expirado",
    bandHai: "Suspenso",
    active: "Ativo",
    lifetime: "Vitalício",
    expiry: "Expiração",
    extend30: "+30 dias",
    suspend: "Suspender",
    reopen: "Reabrir",
    changePass: "Alterar senha",
    delete: "Excluir",
    noBuyers: "Ainda não há compradores.",
    buyerCreated: "Comprador criado",
    passChanged: "Senha alterada.",
    ownPassTitle: "Alterar sua senha",
    phNewPass: "Nova senha (mínimo 6 caracteres)",
    phConfirmPass: "Digite a senha novamente",
    passTooShort: "A senha deve ter pelo menos 6 caracteres",
    passMismatch: "As duas senhas não coincidem",
    saveBtn: "Salvar",
    cancelBtn: "Cancelar",
    newPassPrompt: "Nova senha (mín. 6 caracteres):",
    deleteConfirm: " — excluir este usuário?",
    serverUnreachable: "Não foi possível alcançar o servidor:",
    priceLoadFail: "Os preços não foram carregados:",
    signalLoadFail: "O sinal não foi carregado:",
    indLoadFail: "Os indicadores não foram carregados:",
    indNoData: "Sem velas disponíveis para os indicadores.",
    smcLoadFail: "SMC não foi carregado:",
    smcNoData: "Sem dados SMC.",
    scannerFail: "O scanner não foi carregado:",
    sessionLoadFail: "A sessão não foi carregada:",
    newsFail: "As notícias não estão disponíveis agora — tente novamente em breve.",
    newsFallbackNote: "Um feed está fora do ar — as manchetes exibidas são do feed ativo",
    newsUpdated: "Atualizado",
    newSignal: "Novo sinal!",
    alertsNote: "Os alertas só funcionam enquanto o site está aberto — não com uma aba fechada ou telefone desligado.",
    sound: "Som",
    notifications: "Notificações",
    status: "Status",
    session: "Sessão",
    pktTime: "Hora PKT",
    quality: "Qualidade",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Sinal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Nenhuma confirmação SMC registrada ainda.",
    smcBacktestRunning: "Executando backtest SMC…",
    termBacktestRunning: "Executando backtest do Terminal…",
    termBacktestNote: "Últimos 30 dias, velas de 1H — não é uma promessa de resultados futuros. Base = motor do Terminal (6 portas, porta 85%). Os filtros não melhoraram todos os pares, então nenhum filtro foi adicionado ao motor ao vivo.",
    termBacktestBtn: "Executar backtest do Terminal",
    smcBacktestBtn: "Executar backtest SMC (30 dias)",
    smcBacktestNote: "Regra SMC (pontuação 80%+) em velas reais de 15M — sem números inventados.",
    filter: "Filtro",
    baseline: "Base",
    macdAgree: "MACD concorda",
    noDeadHours: "Sem horas mortas",
    chartNoData: "Sem velas disponíveis para o gráfico.",
    allSessions: "Todas as sessões (hora PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Estrutura de mercado (BOS/MSS)",
    buyNow: "🟢 COMPRAR AGORA",
    sellNow: "🔴 VENDER AGORA",
    waitNoTrade: "⏳ WAIT — sem operação",
    bannerLine: "Faça esta operação agora — Entry, SL e TP estão abaixo.",
    approaching: "APROXIMANDO-SE — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Visão geral",
    engineControls: "Controles do motor",
    signalDetails: "Detalhes do sinal",
    signalHistory: "Histórico de sinais",
    tfMatrix: "Matriz TF",
    trackingLogs: "Registros de rastreamento",
    exportCsv: "Exportar CSV",
    aiAgent: "Agente IA",
    preferences: "Preferências",
    copySignal: "📋 Copiar sinal",
    downloadSignal: "⬇️ Baixar imagem",
    copyDone: "Sinal copiado",
    copyDoneBody: "Texto do sinal copiado — cole no WhatsApp ou Telegram.",
    copyFailBody: "Não foi possível copiar — selecione o texto manualmente.",
    imgDone: "Imagem baixada",
    imgDoneBody: "Imagem do cartão de sinal baixada.",
    imgFail: "Falha ao baixar a imagem — tente novamente.",
    shareDisclaimer: "Nenhum sinal é 100% lucrativo.",
    close: "Fechar",
    scanNow: "🔍 Escanear agora",
    scanning: "Escaneando…",
    monitorEvery: "Cada",
    stopMonitoring: "⏸ Parar",
    startMonitoring: "▶ Iniciar",
    monitoringOff: "O monitoramento está desligado — pressione Iniciar",
    scanDone: "Scan concluído",
    scanDoneBody: "Todos os pares foram reescaneados.",
    scanFailBody: "Falha no scan — tente novamente.",
    bestTimeframe: "Melhor timeframe: 1H (4H também funciona) — 15M é só para o timing de entrada",
    signalCode: "Código do sinal",
    validUntil: "Válido até",
    newSignalPopup: "Chegou um sinal!",
    whyWait: "Por que esperar? — Why Wait?",
    copyWaitAnalysis: "📋 Copiar análise WAIT",
    waitCopyDone: "Análise WAIT copiada",
    waitCopyDoneBody: "Análise WAIT copiada — cole no WhatsApp ou Telegram.",
    smcBelowGate: "SMC está abaixo da sua porta",
    zoneBlockedReason: "Sem zona adequada atrás desta direção",
    shareCard: "📤 Cartão para compartilhar",
    downloadHighRes: "⬇️ Baixar PNG em alta resolução",
    copyImage: "🖼️ Copiar imagem",
    copyFormattedText: "📋 Copiar texto formatado",
    formattedPreview: "Prévia do texto formatado (Telegram / WhatsApp)",
    imgCopyDone: "Imagem copiada",
    imgCopyDoneBody: "Imagem do cartão de sinal copiada para a área de transferência.",
    imgCopyFail: "Não foi possível copiar a imagem",
    imgCopyFailBody: "A cópia de imagem não é suportada neste navegador — use Baixar.",
    dcaNote: "DCA: realize 50% do lucro em TP1, deixe o resto correr até TP2/TP3.",
    breakevenNote: "Ponto de equilíbrio: após TP1, mova o SL para a entrada.",
    stepSignal: "Sinal",
    stepEntry: "Zona de entrada",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Operação fechada",
    progression: "Progressão",
    confluenceLbl: "Confluência",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Onda de sentimento — calculada (não é uma previsão)",
    sentimentWaveNote: "Este sentimento é calculado a partir do RSI, da tendência e das zonas reais — não é uma previsão.",
    demandIndex: "Índice de demanda",
    supplyIndex: "Índice de oferta",
    zoneCorridor: "Corredor de zonas",
    histDetails: "Detalhes do sinal (registrado)",
    gatesNotSaved: "Os detalhes da porta não foram salvos para este sinal.",
    detailsBtn: "Detalhes",
    pivotTitle: "Pontos pivô (dia anterior)",
    fearGreedTitle: "Medo e ganância do Bitcoin (alternative.me)",
    fearGreedNa: "Medo e ganância não estão disponíveis agora.",
    riskProfile: "Perfil de risco",
    riskConservative: "Conservador",
    riskModerate: "Moderado",
    riskAggressive: "Agressivo",
    riskConsText: "Somente sinais de alta confluência — arrisque 1% por operação",
    riskModText: "Padrão — arrisque 1% por operação",
    riskAggText: "Mais risco — até 2% por operação, o drawdown pode ser maior",
    riskProfileLine: "Seu perfil de risco",
    timezone: "Fuso horário",
    theme: "Tema",
    themeDark: "Escuro",
    themeLight: "Claro",
    language: "Idioma",
    prefPair: "Par preferido",
    engineStatus: "Status do motor",
    prefSaved: "Preferências salvas.",
    guideTitle: "Como fazer uma operação? — 4 passos fáceis",
    guideStep1: "Opere apenas com um sinal de BUY ou SELL — nunca opere com WAIT.",
    guideStep2: "Entry, SL e TP estão escritos no cartão — nunca arrisque mais do que o SL.",
    guideStep3: "A confirmação está no próprio cartão: a pontuação está acima da porta, e os motivos estão listados em \"Por que esta operação?\" abaixo.",
    guideStep4: "O melhor timeframe é 1H (4H também funciona) — 15M é só para o timing de entrada.",
    whyTradeTitle: "Por que esta operação? — Confirmação",
    whyTrend: "A tendência está deste lado",
    whyZone: "O preço está na zona de operação",
    whyZoneNear: "O preço está perto da zona de operação",
    whySmcHigh: "A pontuação SMC é 80+ — o smart money também está deste lado",
    whyTopGate: "A verificação mais forte",
    oneTradeLabel: "Apenas uma operação por vez",
    oneTradeNote: "Apenas uma operação por vez — o setup da outra direção não é exibido.",
    gatesExplain: "6 verificações, 100 pontos — um sinal só se forma com 85+ (como a nota de aprovação em uma prova).",
    smcExplain: "5 partes, 100 pontos — 80+ é bom (confirmação forte).",
    gateLblTrendUp: "A tendência está em alta (EMA)",
    gateLblTrendDown: "A tendência está em baixa (EMA)",
    gateLblStructure: "A estrutura é forte",
    gateLblRsi: "O RSI está em um intervalo saudável",
    gateLblRr: "A recompensa é maior que o risco",
    gateLblEma200: "A grande tendência (EMA200) concorda",
    gateLblFresh: "Os dados estão atualizados",
    smcLblSweep: "A liquidez foi varrida",
    smcLblStructure: "A estrutura de mercado mudou",
    smcLblOb: "Bloco de ordens encontrado",
    smcLblFvg: "Gap FVG encontrado",
    smcLblRr: "Risco/recompensa está bom",
    chkLblSweep: "Os grandes players pegaram a liquidez",
    chkLblOb: "Zona dos grandes players",
    chkLblFvg: "Espaço vazio no preço",
    chkLblSr: "Nível forte de suporte/resistência",
    chkLblZones: "Zona de compra/venda",
    extLblCandle: "A vela sugere a tendência",
    extLblChoch: "Sinal de que a tendência pode mudar",
    extLblMss: "Nova tendência confirmada",
    extLblBreaker: "O nível antigo agora é suporte/resistência",
    extLblIdm: "Volta após um movimento falso",
    extLblFib: "Nível de Fibonacci (calculado)",
    extLblBb: "Compressão de volatilidade",
    extLblMacdDiv: "MACD e preço discordam",
    extLblMeanRev: "Quão longe o preço está da média",
    extLblKillzone: "Horário ativo da sessão",
    extLblAsian: "Intervalo da sessão asiática",
    extLblVwap: "Bandas VWAP (preço médio)",
    extLblVol: "Volume — quanto foi operado",
    smcNoSignalBanner: "SMC NÃO dá sinais — é apenas confirmação para o sinal do Terminal.",
    smcConfirmStrong: "Confirmação forte ✓",
    smcConfirmWeak: "A confirmação é fraca — forte a partir de 80+",
    notASignalNote: "Isto não é um sinal — opere apenas com o sinal do Terminal.",
    confirmationLbl: "Confirmação",
    smcEngineHeader: "MOTOR SMC • ATIVO",
    smcEngineSub: "Varreduras de liquidez · Blocos de ordens · FVGs · Macro 15M e entrada 5M",
    smcSetupQuality: "Qualidade do setup",
    smcGradeStrong: "A · Forte",
    smcGradeModerate: "B · Moderado",
    smcGradeDeveloping: "C · Em desenvolvimento",
    smcGradeWeak: "D · Fraco",
    smcWaiting80: "Aguardando confirmação de 80%",
    smcConfirmed80: "Confirmação de 80% alcançada — confirmação forte para o sinal do Terminal",
    smcBias: "Viés SMC (15M)",
    smcBiasBullish: "Alta",
    smcBiasBearish: "Baixa",
    smcBiasNeutral: "Neutro",
    smcLiveMove: "Movimento ao vivo (desde a entrada)",
    smcGenerated: "Gerado",
    smcBeTip: "Dica de equilíbrio: após +100 pips de lucro, mova o SL para a entrada — apenas orientação, não automático.",
    smcFeedNote: "Isto é apenas confirmação — não opere com isto, espere o sinal do Terminal.",
    perfNoteTerminal: "A taxa de acerto é calculada apenas com sinais do Terminal — SMC/Sessão não são contados aqui.",
    smcTpNote: "TP2/TP3: apenas o resultado de TP1/SL é registrado.",
    smcInspectChart: "Inspecionar gráfico",
    tgTitle: "Alertas do Telegram — Sinais no seu telefone",
    tgText: "Quando um sinal de BUY/SELL aparece, você recebe uma mensagem do Telegram no seu telefone — mesmo com o site fechado. Abra o link abaixo e pressione Start no bot.",
    tgButton: "📲 Receber alertas no Telegram",
    tgPersonalTitle: "Seu link pessoal do Telegram",
    tgPersonalText: "Este link é só seu — vincula os alertas à sua conta. Abra o link, pressione Start no bot, pronto! Os alertas param se o seu plano expirar ou for suspenso.",
    tgLinked: "✅ Os alertas do Telegram estão ATIVADOS — você receberá uma mensagem quando um sinal aparecer.",
    tgNotLinked: "Os alertas do Telegram ainda NÃO estão ativados — abra o link e pressione Start.",
    tgCopyLink: "Copiar link",
    tgLinkCopied: "Seu link pessoal do Telegram foi copiado — pressione Start no bot.",
    marketCards: "Mercado ao vivo",
    pcMarketPrice: "Preço de mercado (último)",
    pcChange24h: "Variação diária / 24H",
    pcSpread: "Spread",
    pcKeyLevels: "Níveis-chave históricos",
    pcSources: "Fontes",
    liveMarketPrice: "PREÇO DE MERCADO AO VIVO",
    awaitingConf: "AGUARDANDO CONFLUÊNCIA",
    scanningMarket: "Escaneando o mercado — aguardando confluência de 85%",
    confirmedTitle: "INDICADORES CONFIRMADOS",
    passedLbl: "APROVADO",
    awaitingTitle: "AGUARDANDO CONFIRMAÇÃO",
    pendingLbl: "PENDENTE",
    needsGate: "PRECISA DE 85%",
    requiredTitle: "NECESSÁRIO ANTES DE BUY OU SELL",
    requiredBuy: "PARA CONFIRMAÇÃO DE BUY",
    requiredSell: "PARA CONFIRMAÇÃO DE SELL",
    reqBuyTpl: "Rebote de alta a partir de {a} — o preço recupera {b}",
    reqSellTpl: "Rejeição de baixa a partir de {a} — o preço perde {b}",
    analyzeNow: "ANALISAR O MERCADO AGORA",
    inspectInd: "INSPECIONAR INDICADORES",
    downloadCard: "BAIXAR CARTÃO",
    liveTick: "Tick em tempo real sincronizado",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "CONFIANÇA",
    htfLbl: "Alinhamento de timeframe superior",
    adxRanging: "abaixo de 20 — sem tendência (lateral)",
    adxTrend: "20 ou mais — a tendência é forte",
    smcConfirmLbl: "Confirmação SMC",
    rsiNeedBuy: "BUY precisa de 50–70",
    rsiNeedSell: "SELL precisa de 30–50",
    rrNeed: "R:R 1.5 necessário",
    bannerTerminal: "OS SINAIS VÊM SOMENTE DAQUI — opere no cartão de BUY/SELL",
    bannerSmc: "ISTO NÃO É UM SINAL — é apenas confirmação",
    bannerSession: "ISTO SÓ DIZ A HORA — não dá sinal",
    bannerHistory: "ESTES SÃO SINAIS ANTIGOS — não opere com eles, apenas veja os resultados",
    bannerScanner: "ISTO SÓ PROCURA — o sinal é criado no Terminal"
  },
  ru: {
    tagline: "Живые сигналы по золоту, биткоину и Forex",
    setupTitle: "Первая настройка",
    setupText: "Создайте свои имя пользователя и пароль администратора. Никогда никому не отправляйте пароль — его должны знать только вы.",
    setupBtn: "Создать учётную запись админа",
    loginTitle: "Вход",
    loginBtn: "Войти",
    finePrint: "Ни один сигнал не приносит прибыль на 100%. Сначала практикуйтесь на демо, не рискуйте реальными деньгами в спешке.",
    logout: "Выйти",
    refresh: "Обновить",
    refreshing: "Обновление…",
    lastUpdate: "Последнее обновление",
    secAgo: "с назад",
    tabTerminal: "Терминал",
    tabIndicators: "Индикаторы",
    tabSmc: "SMC",
    tabSession: "Сессия",
    tabHistory: "История",
    tabAccount: "Аккаунт",
    tabAdmin: "Админ",
    howSignalTitle: "Когда и как формируется сигнал?",
    howSignalText1: "У сигнала нет фиксированного времени. BUY/SELL формируется только при наборе 85% и более баллов по 6 гейтам. WAIT означает: не торгуйте сейчас, условия не выполнены.",
    howSignalText2: "Гейт SMC отдельный (80%) — смотрите вкладку SMC. Сигнал терминала не ждёт гейт SMC.",
    tfHint: "Лучший таймфрейм: 1H (с трендом 4H) — сигналы наиболее надёжны на 1H/4H; 15M только для времени входа, а 5M слишком шумный. (90-дневный бэктест, 4 пары: винрейт ~60%, профит-фактор ~1,00 — безубыточность, прошлый результат, не гарантия.)",
    rareSignals: "Сигналов мало, но они качественнее — BUY/SELL появляется только при прохождении гейта 85%. Больше сигналов — не значит лучше результаты.",
    allPairsTitle: "Все пары — живые цены",
    indCenterTitle: "Центр индикаторов",
    indCenterText: "Все эти числа рассчитаны по реальным свечам Kraken — EMA 20/50 показывает тренд, RSI 14 — импульс, а ATR 14 — насколько обычно движется цена.",
    indTfNote: "Значения ниже — таймфрейм 1H; 15M и дневные указаны отдельно ниже",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "Уровни SMC берутся из реальных максимумов/минимумов свингов на свечах 15M — там, где обычно ждут крупные покупатели и продавцы. Оценка SMC состоит из 5 частей × 20 баллов, гейт 80%. BUY/SELL терминала не берётся из этой вкладки; он использует собственные условия терминала на 85%.",
    scannerTitle: "Глобальный сканер рынка (11 пар, каждые 45 секунд)",
    smcPairCardsTitle: "Подтверждение SMC — каждая пара",
    sessionTitle: "Движок сессий",
    backtestTitle: "Симулятор бэктеста сессии",
    backtestText: "Запустите правило сессии на реальных свечах 1H.",
    backtestBtn: "Запустить бэктест (30 дней)",
    historyTitle: "История сигналов",
    historyText: "Показаны только реально записанные сигналы — прошлая история не выдумана. Результат (Win/Loss/Break-Even/In-Flight) проверяется по последующим свечам.",
    refinerTitle: "Уточнение стратегии",
    refinerText: "Порог применяется только к сигналам, записанным после этой версии, поскольку старые сигналы не сохранили оценку гейта.",
    marketClosedTitle: "Рынок закрыт",
    marketClosedText: "Рынок форекс и золота закрыт в субботу и воскресенье — для этой пары новый сигнал не сформируется. Показанная цена — последняя доступная, не в реальном времени.",
    marketClosedShort: "Рынок закрыт — последняя доступная цена",
    accountTitle: "Аккаунт",
    adminTitle: "Панель админа — аккаунты покупателей",
    adminPlansText: "Месячный 30 дней · Квартальный 90 дней · Годовой 365 дней · Пожизненный (никогда не истекает). Когда план заканчивается, вход покупателя блокируется автоматически.",
    createBuyerBtn: "Создать покупателя",
    newsTitle: "Фундаментальные новости",
    newsText: "Свежие заголовки forex/рынка — из бесплатных RSS-лент FXStreet и ForexLive.",
    chartTitle: "График цены — свечи + EMA 20/50/200",
    indStripTitle: "Живые индикаторы",
    smcMacroTitle: "15M макро",
    smcMicroTitle: "5M микро",
    smcFeedTitle: "Лента подтверждений SMC — подтверждение, а не сигнал",
    smcBacktestTitle: "Бэктест SMC",
    termBacktestTitle: "Бэктест терминала (30 дней)",
    phSetupUser: "Имя администратора (мин. 3 символа)",
    phSetupPass: "Пароль администратора (мин. 6 символов)",
    phLoginUser: "Имя пользователя",
    phLoginPass: "Пароль",
    phBuyerUser: "Имя покупателя",
    phBuyerPass: "Пароль покупателя",
    phAiQ: "Задайте вопрос, например: когда формируется сигнал?",
    hello: "Здравствуйте",
    loading: "Загрузка…",
    noTrade: "(нет сделки)",
    price: "Цена",
    confluence: "Конфлюэнс",
    gate: "гейт",
    buySellPlans: "Планы BUY и SELL — оба вместе",
    signalPlan: "План сигнала — одно направление, одна сделка",
    smcChecklist: "Чек-лист конфлюэнса SMC — настоящая причина этого сигнала",
    oppScenario: "Противоположный сценарий",
    oppGateNotMet: "гейт не пройден",
    chkSweep: "Снятие ликвидности",
    chkOB: "Ордер-блок",
    chkFvg: "FVG (гэп справедливой цены)",
    chkSR: "Поддержка / Сопротивление",
    chkZones: "Зоны (спрос / предложение)",
    chkYes: "✓ Подтверждает",
    chkNo: "✗ Не подтверждает",
    chkNa: "– Нейтрально",
    noSweep: "Снятия не было",
    noObDir: "Ордер-блок в этом направлении не найден",
    noFvgDir: "FVG в этом направлении не найден",
    inDemand: "Цена в зоне спроса",
    inSupply: "Цена в зоне предложения",
    nearDemand: "Цена рядом с зоной спроса",
    nearSupply: "Цена рядом с зоной предложения",
    noZone: "Цена ни в одной зоне",
    tradeZone: "Торговая зона",
    inZone: "В ЗОНЕ — IN ZONE",
    nearZone: "Цена рядом с зоной",
    farZone: "Цена далеко от зоны",
    noZoneDir: "Зона для этого направления не найдена",
    bosUp: "Структура пробита вверх (BOS) — бычий",
    bosDown: "Структура пробита вниз (BOS) — медвежий",
    noBreak: "Пробоя структуры нет — уровень устоял",
    extTitle: "Расширенный конфлюэнс — по свечам 1H",
    extNote: "Всё это только конфлюэнс — он не меняет направление сигнала и гейты (85%/80%).",
    chkCandle: "Свечной паттерн (1H)",
    chkChoch: "CHOCH (смена характера)",
    chkMss: "MSS (сдвиг структуры рынка)",
    chkBreaker: "Блоки breaker / mitigation",
    chkIdm: "IDM (индуцирование)",
    chkFib: "Уровни Фибоначчи",
    chkBb: "Сжатие Боллинджера",
    chkMacdDiv: "Дивергенция MACD",
    chkMeanRev: "Возврат к среднему",
    chkKillzone: "Килл-зона / время сессии",
    chkAsian: "Диапазон азиатской сессии",
    chkVwap: "Полосы VWAP (±1σ / ±2σ)",
    chkVol: "Объём (1H)",
    patBullEngulf: "Бычье поглощение",
    patBearEngulf: "Медвежье поглощение",
    patHammer: "Молот / Пин-бар (бычий)",
    patShootingStar: "Падающая звезда (медвежий)",
    patDoji: "Доджи (нейтральный)",
    patMorningStar: "Утренняя звезда (бычий)",
    patEveningStar: "Вечерняя звезда (медвежий)",
    noPattern: "Нет чёткого паттерна",
    chochUp: "CHOCH вверх — пробой против тренда",
    chochDown: "CHOCH вниз — пробой против тренда",
    noChoch: "Нет CHOCH",
    mssUp: "MSS вверх — новый тренд подтверждён",
    mssDown: "MSS вниз — новый тренд подтверждён",
    noMss: "Нет MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Нет блока breaker/mitigation",
    idmSsl: "Найден IDM — снятие SSL, затем возврат (бычий)",
    idmBsl: "Найден IDM — снятие BSL, затем возврат (медвежий)",
    noIdm: "Нет IDM",
    fibNearest: "Ближайший уровень",
    squeezeOn: "Есть сжатие — волатильность низкая, может прийти большое движение",
    squeezeOff: "Нет сжатия",
    meanNear: "Рядом со средним",
    meanExtended: "Далеко от среднего",
    meanOver: "Сильно перерастянуто",
    aboveMean: "выше среднего",
    belowMean: "ниже среднего",
    macdBullDiv: "Бычья дивергенция — цена ниже, MACD выше",
    macdBearDiv: "Медвежья дивергенция — цена выше, MACD ниже",
    noMacdDiv: "Нет дивергенции MACD",
    killActive: "Активная килл-зона",
    killNext: "Следующая килл-зона",
    kzAsian: "Азиатская",
    kzLondon: "Лондон",
    kzNewYork: "Нью-Йорк",
    asianIn: "Цена внутри диапазона",
    asianAbove: "Цена расширилась выше диапазона",
    asianBelow: "Цена расширилась ниже диапазона",
    noAsian: "Азиатский диапазон не найден",
    vwapNearest: "Ближайшая полоса",
    volRising: "Объём растёт",
    volFalling: "Объём падает",
    volNormal: "Объём нормальный",
    volNa: "Для этой пары объём недоступен",
    dxyTitle: "Индекс доллара (DXY)",
    dxyNa: "DXY сейчас недоступен — не получен от Yahoo",
    corrLabel: "Корреляция (20 периодов)",
    corrNeg: "отрицательная",
    corrPos: "положительная",
    corrFlat: "слабая",
    riskTitle: "Управление риском — рекомендации (не управление сделками в реальном времени)",
    riskRrTarget: "Цель R:R 1:2 — достигается на TP3",
    riskTp1: "На TP1 заберите 50% прибыли, затем перенесите SL в безубыток (вход).",
    riskSize: "Размер позиции: рискуйте только 1% счёта в одной сделке.",
    riskDd: "Контроль просадки: никогда не рискуйте более 1% в одной сделке — держите убытки маленькими.",
    sentiment: "Настроения 24ч",
    demandZone: "Зона спроса",
    supplyZone: "Зона предложения",
    liveComments: "Живые комментарии",
    nextCheck: "Следующая проверка через",
    nextCheckSuffix: "с (мониторинг каждые 30 секунд)",
    signalUpdated: "Сигнал обновлён",
    buyGates: "Гейты BUY",
    sellGates: "Гейты SELL",
    entryZone: "Зона входа",
    trigger: "Триггер",
    scorecard: "Карта очков",
    trend: "Тренд",
    momentum: "Импульс",
    volatility: "Волатильность",
    volume: "Объём",
    structure: "Структура",
    ichimoku: "Ишимоку",
    vwapSar: "VWAP / SAR",
    tf15d: "15M и дневной",
    smcScore: "Оценка SMC",
    gatePass: "Гейт пройден!",
    gateNotMet: "гейт не пройден",
    swingLevels: "Уровни свинга",
    swingHigh: "Последний свинг-максимум",
    swingLow: "Последний свинг-минимум",
    liqSweeps: "Снятия ликвидности",
    orderBlocks: "Ордер-блоки",
    bullOB: "Бычий OB",
    bearOB: "Медвежий OB",
    fresh: "свежий",
    mitigated: "смягчённый",
    fvg: "Гэпы справедливой цены (FVG)",
    noFvg: "FVG не найден.",
    microSweeps: "Микро-снятия SSL на 5M",
    liqPools: "Пулы ликвидности",
    pair: "Пара",
    direction: "Направление",
    confirmedSignals: "Подтверждения SMC",
    cycleEvery: "Цикл: каждые",
    cycleSec: "секунд",
    sessionActive: "Активна",
    nowPkt: "Текущее время PKT",
    nextSession: "Следующая сессия",
    minutes: "минут",
    newsBlackout: "Блэкаут новостей",
    notAvailable: "Недоступно",
    sessionStats: "Статистика сессии",
    total: "Всего",
    sessionHistoryBtn: "Посмотреть историю сессии",
    noSessionSignals: "Сигналов сессии пока не записано.",
    backtestRunning: "Бэктест выполняется…",
    trades: "Сделки",
    wins: "Победы",
    losses: "Поражения",
    winRate: "Винрейт",
    profitFactor: "Профит-фактор",
    totalExecuted: "Всего исполнено",
    breakEven: "Безубыток",
    inFlight: "В работе",
    noClosed: "— (закрытых сигналов пока нет)",
    noSignals: "Сигналов пока не записано.",
    cutoff: "Порог",
    qualifying: "Подходящие сетапы",
    simWinRate: "Симулированный винрейт",
    allOutcomes: "Все исходы",
    allEngines: "Все движки",
    mainTerminal: "Главный терминал",
    smcEngine: "Движок SMC",
    sessionEngine: "Движок сессий",
    newsIntel: "Новостная аналитика",
    username: "Имя пользователя",
    role: "Роль",
    plan: "План",
    planExpiry: "Срок действия плана",
    daysLeft: "дней осталось",
    lifetimeNever: "Пожизненный — никогда не истекает",
    managePlan: "Чтобы сменить план, свяжитесь с администратором",
    signals: "Сигналы",
    engines: "Движки",
    engineOffNote: "Выключенный движок действительно выключен — он не создаёт сигналов. Test Push — это только тестовое сообщение в приложении, а не настоящее push-уведомление.",
    testPushBtn: "Test Push (тест в приложении)",
    testPushMsg: "Test push (в приложении): это только тест, а не настоящее push-уведомление.",
    historyTabText: "Все сигналы — во вкладке История.",
    openHistory: "Открыть историю",
    tfLoading: "Загрузка TF-матрицы…",
    exportText: "Скачайте сигналы в CSV.",
    exportBtn: "Экспорт CSV",
    aiTitle: "ИИ-агент — только в приложении.",
    aiText: "Это не живой ИИ-сервис, а только помощник внутри приложения.",
    aiAsk: "Спросить",
    defaultPair: "Пара по умолчанию",
    saved: "Сохранено.",
    totalBuyers: "Всего покупателей",
    expired: "Истёк",
    bandHai: "Заблокирован",
    active: "Активен",
    lifetime: "Пожизненный",
    expiry: "Истечение",
    extend30: "+30 дней",
    suspend: "Заблокировать",
    reopen: "Разблокировать",
    changePass: "Сменить пароль",
    delete: "Удалить",
    noBuyers: "Покупателей пока нет.",
    buyerCreated: "Покупатель создан",
    passChanged: "Пароль изменён.",
    ownPassTitle: "Сменить свой пароль",
    phNewPass: "Новый пароль (минимум 6 символов)",
    phConfirmPass: "Введите пароль ещё раз",
    passTooShort: "Пароль должен быть не менее 6 символов",
    passMismatch: "Пароли не совпадают",
    saveBtn: "Сохранить",
    cancelBtn: "Отмена",
    newPassPrompt: "Новый пароль (мин. 6 символов):",
    deleteConfirm: " — удалить этого пользователя?",
    serverUnreachable: "Нет связи с сервером:",
    priceLoadFail: "Цены не загрузились:",
    signalLoadFail: "Сигнал не загрузился:",
    indLoadFail: "Индикаторы не загрузились:",
    indNoData: "Нет свечей для индикаторов.",
    smcLoadFail: "SMC не загрузился:",
    smcNoData: "Нет данных SMC.",
    scannerFail: "Сканер не загрузился:",
    sessionLoadFail: "Сессия не загрузилась:",
    newsFail: "Новости сейчас недоступны — попробуйте позже.",
    newsFallbackNote: "Один источник недоступен — показаны заголовки из работающего источника",
    newsUpdated: "Обновлено",
    newSignal: "Новый сигнал!",
    alertsNote: "Оповещения работают, только пока сайт открыт — не при закрытой вкладке или выключенном телефоне.",
    sound: "Звук",
    notifications: "Уведомления",
    status: "Статус",
    session: "Сессия",
    pktTime: "Время PKT",
    quality: "Качество",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Сигнал",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Подтверждений SMC пока не записано.",
    smcBacktestRunning: "Бэктест SMC выполняется…",
    termBacktestRunning: "Бэктест терминала выполняется…",
    termBacktestNote: "Последние 30 дней, свечи 1H — не обещание будущих результатов. База = движок терминала (6 гейтов, гейт 85%). Фильтры улучшили не все пары, поэтому в живой движок фильтры не добавлялись.",
    termBacktestBtn: "Запустить бэктест терминала",
    smcBacktestBtn: "Запустить бэктест SMC (30 дней)",
    smcBacktestNote: "Правило SMC (оценка 80%+) на реальных свечах 15M — без выдуманных чисел.",
    filter: "Фильтр",
    baseline: "База",
    macdAgree: "MACD согласен",
    noDeadHours: "Нет мёртвых часов",
    chartNoData: "Нет свечей для графика.",
    allSessions: "Все сессии (время PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Структура рынка (BOS/MSS)",
    buyNow: "🟢 КУПИТЬ СЕЙЧАС",
    sellNow: "🔴 ПРОДАТЬ СЕЙЧАС",
    waitNoTrade: "⏳ WAIT — нет сделки",
    bannerLine: "Берите эту сделку сейчас — Entry, SL и TP указаны ниже.",
    approaching: "ПРИБЛИЖАЕТСЯ — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Обзор",
    engineControls: "Управление движком",
    signalDetails: "Детали сигнала",
    signalHistory: "История сигналов",
    tfMatrix: "TF-матрица",
    trackingLogs: "Журналы отслеживания",
    exportCsv: "Экспорт CSV",
    aiAgent: "ИИ-агент",
    preferences: "Настройки",
    copySignal: "📋 Копировать сигнал",
    downloadSignal: "⬇️ Скачать изображение",
    copyDone: "Сигнал скопирован",
    copyDoneBody: "Текст сигнала скопирован — вставьте в WhatsApp или Telegram.",
    copyFailBody: "Не удалось скопировать — выделите текст вручную.",
    imgDone: "Изображение скачано",
    imgDoneBody: "Изображение карты сигнала скачано.",
    imgFail: "Не удалось скачать изображение — попробуйте снова.",
    shareDisclaimer: "Ни один сигнал не приносит прибыль на 100%.",
    close: "Закрыть",
    scanNow: "🔍 Сканировать сейчас",
    scanning: "Сканирование…",
    monitorEvery: "Каждые",
    stopMonitoring: "⏸ Стоп",
    startMonitoring: "▶ Старт",
    monitoringOff: "Мониторинг выключен — нажмите Старт",
    scanDone: "Сканирование завершено",
    scanDoneBody: "Все пары пересканированы.",
    scanFailBody: "Сканирование не удалось — попробуйте снова.",
    bestTimeframe: "Лучший таймфрейм: 1H (4H тоже подходит) — 15M только для времени входа",
    signalCode: "Код сигнала",
    validUntil: "Действителен до",
    newSignalPopup: "Пришёл сигнал!",
    whyWait: "Почему ждать? — Why Wait?",
    copyWaitAnalysis: "📋 Копировать анализ WAIT",
    waitCopyDone: "Анализ WAIT скопирован",
    waitCopyDoneBody: "Анализ WAIT скопирован — вставьте в WhatsApp или Telegram.",
    smcBelowGate: "SMC ниже своего гейта",
    zoneBlockedReason: "Нет подходящей зоны за этим направлением",
    shareCard: "📤 Карта для шаринга",
    downloadHighRes: "⬇️ Скачать PNG в высоком разрешении",
    copyImage: "🖼️ Копировать изображение",
    copyFormattedText: "📋 Копировать форматированный текст",
    formattedPreview: "Предпросмотр форматированного текста (Telegram / WhatsApp)",
    imgCopyDone: "Изображение скопировано",
    imgCopyDoneBody: "Изображение карты сигнала скопировано в буфер обмена.",
    imgCopyFail: "Не удалось скопировать изображение",
    imgCopyFailBody: "Копирование изображений не поддерживается в этом браузере — используйте Скачать.",
    dcaNote: "DCA: на TP1 заберите 50% прибыли, остальное держите до TP2/TP3.",
    breakevenNote: "Безубыток: после TP1 перенесите SL на вход.",
    stepSignal: "Сигнал",
    stepEntry: "Зона входа",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Сделка закрыта",
    progression: "Прогресс",
    confluenceLbl: "Конфлюэнс",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Волна настроений — вычислено (не прогноз)",
    sentimentWaveNote: "Это настроение вычисляется по реальным RSI, тренду и зонам — это не прогноз.",
    demandIndex: "Индекс спроса",
    supplyIndex: "Индекс предложения",
    zoneCorridor: "Коридор зон",
    histDetails: "Детали сигнала (записанные)",
    gatesNotSaved: "Детали гейта для этого сигнала не сохранены.",
    detailsBtn: "Детали",
    pivotTitle: "Пивот-уровни (прошлый день)",
    fearGreedTitle: "Страх и жадность биткоина (alternative.me)",
    fearGreedNa: "Страх и жадность сейчас недоступны.",
    riskProfile: "Риск-профиль",
    riskConservative: "Консервативный",
    riskModerate: "Умеренный",
    riskAggressive: "Агрессивный",
    riskConsText: "Только сигналы с высоким конфлюэнсом — риск 1% на сделку",
    riskModText: "Стандарт — риск 1% на сделку",
    riskAggText: "Больше риска — до 2% на сделку, просадка может быть больше",
    riskProfileLine: "Ваш риск-профиль",
    timezone: "Часовой пояс",
    theme: "Тема",
    themeDark: "Тёмная",
    themeLight: "Светлая",
    language: "Язык",
    prefPair: "Предпочитаемая пара",
    engineStatus: "Статус движка",
    prefSaved: "Настройки сохранены.",
    guideTitle: "Как брать сделку? — 4 простых шага",
    guideStep1: "Торгуйте только по сигналу BUY или SELL — никогда по WAIT.",
    guideStep2: "Entry, SL и TP написаны на карте — никогда не рискуйте больше, чем SL.",
    guideStep3: "Подтверждение — на самой карте: оценка выше гейта, а причины перечислены ниже под «Почему эта сделка?».",
    guideStep4: "Лучший таймфрейм — 1H (4H тоже подходит) — 15M только для времени входа.",
    whyTradeTitle: "Почему эта сделка? — Подтверждение",
    whyTrend: "Тренд на этой стороне",
    whyZone: "Цена в торговой зоне",
    whyZoneNear: "Цена рядом с торговой зоной",
    whySmcHigh: "Оценка SMC 80+ — умные деньги тоже на этой стороне",
    whyTopGate: "Самая сильная проверка",
    oneTradeLabel: "Только одна сделка за раз",
    oneTradeNote: "Только одна сделка за раз — сетап другого направления не показывается.",
    gatesExplain: "6 проверок, 100 баллов — сигнал формируется только при 85+ (как проходной балл на экзамене).",
    smcExplain: "5 частей, 100 баллов — 80+ это хорошо (сильное подтверждение).",
    gateLblTrendUp: "Тренд вверх (EMA)",
    gateLblTrendDown: "Тренд вниз (EMA)",
    gateLblStructure: "Структура сильная",
    gateLblRsi: "RSI в здоровом диапазоне",
    gateLblRr: "Награда больше риска",
    gateLblEma200: "Большой тренд (EMA200) согласен",
    gateLblFresh: "Данные свежие",
    smcLblSweep: "Ликвидность снята",
    smcLblStructure: "Структура рынка изменилась",
    smcLblOb: "Ордер-блок найден",
    smcLblFvg: "Гэп FVG найден",
    smcLblRr: "Риск/награда в норме",
    chkLblSweep: "Крупные игроки забрали ликвидность",
    chkLblOb: "Зона крупных игроков",
    chkLblFvg: "Пустой гэп в цене",
    chkLblSr: "Сильный уровень поддержки/сопротивления",
    chkLblZones: "Зона покупки/продажи",
    extLblCandle: "Свеча намекает на тренд",
    extLblChoch: "Признак, что тренд может измениться",
    extLblMss: "Новый тренд подтверждён",
    extLblBreaker: "Старый уровень теперь поддержка/сопротивление",
    extLblIdm: "Возврат после ложного движения",
    extLblFib: "Уровень Фибоначчи (рассчитан)",
    extLblBb: "Сжатие волатильности",
    extLblMacdDiv: "MACD и цена расходятся",
    extLblMeanRev: "Как далеко цена от среднего",
    extLblKillzone: "Активное время сессии",
    extLblAsian: "Диапазон азиатской сессии",
    extLblVwap: "Полосы VWAP (средняя цена)",
    extLblVol: "Объём — сколько наторговано",
    smcNoSignalBanner: "SMC НЕ даёт сигналов — это только подтверждение для сигнала терминала.",
    smcConfirmStrong: "Сильное подтверждение ✓",
    smcConfirmWeak: "Подтверждение слабое — сильное при 80+",
    notASignalNote: "Это не сигнал — торгуйте только по сигналу терминала.",
    confirmationLbl: "Подтверждение",
    smcEngineHeader: "ДВИЖОК SMC • АКТИВЕН",
    smcEngineSub: "Снятия ликвидности · Ордер-блоки · FVG · Макро 15M и вход 5M",
    smcSetupQuality: "Качество сетапа",
    smcGradeStrong: "A · Сильный",
    smcGradeModerate: "B · Умеренный",
    smcGradeDeveloping: "C · Развивается",
    smcGradeWeak: "D · Слабый",
    smcWaiting80: "Ожидание подтверждения 80%",
    smcConfirmed80: "Подтверждение 80% достигнуто — сильное подтверждение для сигнала терминала",
    smcBias: "Смещение SMC (15M)",
    smcBiasBullish: "Бычий",
    smcBiasBearish: "Медвежий",
    smcBiasNeutral: "Нейтральный",
    smcLiveMove: "Живое движение (от входа)",
    smcGenerated: "Создано",
    smcBeTip: "Совет по безубытку: после прибыли +100 пипсов перенесите SL на вход — только совет, не автоматически.",
    smcFeedNote: "Это только подтверждение — не торгуйте по нему, ждите сигнал терминала.",
    perfNoteTerminal: "Винрейт считается только по сигналам терминала — SMC/сессия здесь не учитываются.",
    smcTpNote: "TP2/TP3: записывается только исход TP1/SL.",
    smcInspectChart: "Посмотреть график",
    tgTitle: "Оповещения Telegram — сигналы на вашем телефоне",
    tgText: "Когда появляется сигнал BUY/SELL, вы получаете сообщение Telegram на телефон — даже когда сайт закрыт. Откройте ссылку ниже и нажмите Start у бота.",
    tgButton: "📲 Получать оповещения в Telegram",
    tgPersonalTitle: "Ваша личная ссылка Telegram",
    tgPersonalText: "Эта ссылка только ваша — она связывает оповещения с вашим аккаунтом. Откройте ссылку, нажмите Start у бота — готово! Оповещения прекратятся, если план истечёт или будет заблокирован.",
    tgLinked: "✅ Оповещения Telegram ВКЛЮЧЕНЫ — вы получите сообщение, когда появится сигнал.",
    tgNotLinked: "Оповещения Telegram ещё НЕ включены — откройте ссылку и нажмите Start.",
    tgCopyLink: "Копировать ссылку",
    tgLinkCopied: "Ваша личная ссылка Telegram скопирована — нажмите Start у бота.",
    marketCards: "Живой рынок",
    pcMarketPrice: "Рыночная цена (последняя)",
    pcChange24h: "Изменение за день / 24ч",
    pcSpread: "Спред",
    pcKeyLevels: "Исторические ключевые уровни",
    pcSources: "Источники",
    liveMarketPrice: "ЖИВАЯ РЫНОЧНАЯ ЦЕНА",
    awaitingConf: "ОЖИДАНИЕ КОНФЛЮЭНСА",
    scanningMarket: "Сканирование рынка — ожидание конфлюэнса 85%",
    confirmedTitle: "ПОДТВЕРЖДЁННЫЕ ИНДИКАТОРЫ",
    passedLbl: "ПРОЙДЕНО",
    awaitingTitle: "ОЖИДАНИЕ ПОДТВЕРЖДЕНИЯ",
    pendingLbl: "В ОЖИДАНИИ",
    needsGate: "НУЖНО 85%",
    requiredTitle: "ТРЕБУЕТСЯ ПЕРЕД BUY ИЛИ SELL",
    requiredBuy: "ДЛЯ ПОДТВЕРЖДЕНИЯ BUY",
    requiredSell: "ДЛЯ ПОДТВЕРЖДЕНИЯ SELL",
    reqBuyTpl: "Бычий отскок от {a} — цена возвращает {b}",
    reqSellTpl: "Медвежий отбой от {a} — цена теряет {b}",
    analyzeNow: "АНАЛИЗИРОВАТЬ РЫНОК СЕЙЧАС",
    inspectInd: "ПРОВЕРИТЬ ИНДИКАТОРЫ",
    downloadCard: "СКАЧАТЬ КАРТУ",
    liveTick: "Тик в реальном времени синхронизирован",
    timeframeLbl: "ТАЙМФРЕЙМ",
    confidenceLbl: "УВЕРЕННОСТЬ",
    htfLbl: "Согласование старшего таймфрейма",
    adxRanging: "ниже 20 — нет тренда (флэт)",
    adxTrend: "20 и выше — тренд сильный",
    smcConfirmLbl: "Подтверждение SMC",
    rsiNeedBuy: "Для BUY нужно 50–70",
    rsiNeedSell: "Для SELL нужно 30–50",
    rrNeed: "Нужен R:R 1.5",
    bannerTerminal: "СИГНАЛЫ ТОЛЬКО ОТСЮДА — торгуйте по карте BUY/SELL",
    bannerSmc: "ЭТО НЕ СИГНАЛ — это только подтверждение",
    bannerSession: "ЭТО ТОЛЬКО ПОКАЗЫВАЕТ ВРЕМЯ — сигналов не даёт",
    bannerHistory: "ЭТО СТАРЫЕ СИГНАЛЫ — не торгуйте по ним, только смотрите результаты",
    bannerScanner: "ЭТО ТОЛЬКО ИЩЕТ — сигнал создаётся в терминале"
  },
  zh: {
    tagline: "黄金、比特币和外汇实时信号",
    setupTitle: "首次设置",
    setupText: "请自行创建管理员用户名和密码。请勿将密码发送给任何人——只有您自己应该知道。",
    setupBtn: "创建管理员账户",
    loginTitle: "登录",
    loginBtn: "登录",
    finePrint: "没有任何信号是100%盈利的。请先在模拟账户上练习，不要急于投入真金白银。",
    logout: "退出登录",
    refresh: "刷新",
    refreshing: "正在刷新…",
    lastUpdate: "上次更新",
    secAgo: "秒前",
    tabTerminal: "终端",
    tabIndicators: "指标",
    tabSmc: "SMC",
    tabSession: "时段",
    tabHistory: "历史",
    tabAccount: "账户",
    tabAdmin: "管理员",
    howSignalTitle: "信号何时以及如何形成？",
    howSignalText1: "信号没有固定时间。只有当6个关口累计得分达到85%或以上时，才会形成BUY/SELL。WAIT表示：现在不要交易，条件尚未满足。",
    howSignalText2: "SMC关口是独立的（80%）——请查看SMC标签页。终端信号不会等待SMC关口。",
    tfHint: "最佳时间周期：1H（配合4H趋势）——信号在1H/4H上最可靠；15M仅用于入场时机，5M噪音太多。（90天回测，4个品种：胜率约60%，盈亏比约1.00——盈亏平衡，是过去的结果，不是保证。）",
    rareSignals: "信号较少但质量更高——只有通过85%关口时才会显示BUY/SELL。信号更多并不意味着结果更好。",
    allPairsTitle: "全部品种——实时价格",
    indCenterTitle: "指标中心",
    indCenterText: "所有这些数值均由真实的Kraken K线计算得出——EMA 20/50显示趋势，RSI 14显示动量，ATR 14显示价格通常波动多少。",
    indTfNote: "以下数值为1小时周期 — 15分钟和日线在下方单独列出",
    smcTitle: "SMC（聪明钱概念）",
    smcText: "SMC水平来自真实15M K线的摆动高点/低点——大买家和大卖家通常等待的地方。SMC评分由5部分×20分组成，关口为80%。终端的BUY/SELL不来自此标签页；它使用终端自身的85%条件。",
    scannerTitle: "全球市场扫描器（11个品种，每45秒）",
    smcPairCardsTitle: "SMC确认 — 每个品种",
    sessionTitle: "时段引擎",
    backtestTitle: "时段回测模拟器",
    backtestText: "在真实1H K线上运行此时段规则。",
    backtestBtn: "运行回测（30天）",
    historyTitle: "信号历史",
    historyText: "仅显示实际记录的信号——没有编造过往历史。结果（Win/Loss/Break-Even/In-Flight）根据后续K线核对显示。",
    refinerTitle: "策略优化器",
    refinerText: "阈值仅适用于此版本之后记录的信号，因为旧信号没有保存关口评分。",
    marketClosedTitle: "市场休市",
    marketClosedText: "外汇和黄金市场在周六和周日休市——该货币对不会形成新信号。此处显示的价格为最后可用价格，并非实时价格。",
    marketClosedShort: "市场休市——最后可用价格",
    accountTitle: "账户",
    adminTitle: "管理员面板——买家账户",
    adminPlansText: "月度30天 · 季度90天 · 年度365天 · 终身（永不过期）。套餐到期后，买家登录会自动锁定。",
    createBuyerBtn: "创建买家",
    newsTitle: "基本面新闻",
    newsText: "最新外汇/市场头条——来自FXStreet和ForexLive的免费RSS源。",
    chartTitle: "价格图表——K线 + EMA 20/50/200",
    indStripTitle: "实时指标",
    smcMacroTitle: "15M宏观",
    smcMicroTitle: "5M微观",
    smcFeedTitle: "SMC确认推送——确认，不是信号",
    smcBacktestTitle: "SMC回测",
    termBacktestTitle: "终端回测（30天）",
    phSetupUser: "管理员用户名（至少3个字符）",
    phSetupPass: "管理员密码（至少6个字符）",
    phLoginUser: "用户名",
    phLoginPass: "密码",
    phBuyerUser: "买家用户名",
    phBuyerPass: "买家密码",
    phAiQ: "输入问题，例如：信号何时形成？",
    hello: "你好",
    loading: "加载中…",
    noTrade: "（无交易）",
    price: "价格",
    confluence: "汇合",
    gate: "关口",
    buySellPlans: "BUY和SELL计划——两者一起",
    signalPlan: "信号计划——一个方向，一笔交易",
    smcChecklist: "SMC汇合清单——此信号的真正原因",
    oppScenario: "相反情景",
    oppGateNotMet: "关口未通过",
    chkSweep: "流动性扫荡",
    chkOB: "订单块",
    chkFvg: "FVG（公允价值缺口）",
    chkSR: "支撑 / 阻力",
    chkZones: "区域（需求 / 供给）",
    chkYes: "✓ 支持",
    chkNo: "✗ 不支持",
    chkNa: "– 中性",
    noSweep: "没有扫荡",
    noObDir: "该方向未找到订单块",
    noFvgDir: "该方向未找到FVG",
    inDemand: "价格处于需求区",
    inSupply: "价格处于供给区",
    nearDemand: "价格接近需求区",
    nearSupply: "价格接近供给区",
    noZone: "价格不在任何区域",
    tradeZone: "交易区",
    inZone: "在区域内 — IN ZONE",
    nearZone: "价格接近区域",
    farZone: "价格远离区域",
    noZoneDir: "该方向未找到区域",
    bosUp: "结构向上突破（BOS）——看涨",
    bosDown: "结构向下突破（BOS）——看跌",
    noBreak: "无结构突破——水平位守住了",
    extTitle: "扩展汇合——来自1H K线",
    extNote: "这些都只是汇合——不会改变信号方向或关口（85%/80%）。",
    chkCandle: "K线形态（1H）",
    chkChoch: "CHOCH（特征转变）",
    chkMss: "MSS（市场结构转变）",
    chkBreaker: "Breaker / 缓解块",
    chkIdm: "IDM（诱多/诱空）",
    chkFib: "斐波那契水平",
    chkBb: "布林带挤压",
    chkMacdDiv: "MACD背离",
    chkMeanRev: "均值回归",
    chkKillzone: "Killzone / 时段时间",
    chkAsian: "亚洲时段区间",
    chkVwap: "VWAP带（±1σ / ±2σ）",
    chkVol: "成交量（1H）",
    patBullEngulf: "看涨吞没",
    patBearEngulf: "看跌吞没",
    patHammer: "锤子线 / 针形线（看涨）",
    patShootingStar: "流星线（看跌）",
    patDoji: "十字星（中性）",
    patMorningStar: "启明星（看涨）",
    patEveningStar: "黄昏星（看跌）",
    noPattern: "无清晰形态",
    chochUp: "CHOCH向上——逆趋势突破",
    chochDown: "CHOCH向下——逆趋势突破",
    noChoch: "无CHOCH",
    mssUp: "MSS向上——新趋势确认",
    mssDown: "MSS向下——新趋势确认",
    noMss: "无MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "缓解",
    noBreaker: "无Breaker/缓解块",
    idmSsl: "发现IDM——SSL扫荡后收回（看涨）",
    idmBsl: "发现IDM——BSL扫荡后收回（看跌）",
    noIdm: "无IDM",
    fibNearest: "最近水平",
    squeezeOn: "存在挤压——波动率低，可能出现大行情",
    squeezeOff: "无挤压",
    meanNear: "接近均值",
    meanExtended: "远离均值",
    meanOver: "过度偏离",
    aboveMean: "均值之上",
    belowMean: "均值之下",
    macdBullDiv: "看涨背离——价格更低，MACD更高",
    macdBearDiv: "看跌背离——价格更高，MACD更低",
    noMacdDiv: "无MACD背离",
    killActive: "活跃Killzone",
    killNext: "下一个Killzone",
    kzAsian: "亚洲",
    kzLondon: "伦敦",
    kzNewYork: "纽约",
    asianIn: "价格在区间内",
    asianAbove: "价格向上突破区间（扩张）",
    asianBelow: "价格向下突破区间（扩张）",
    noAsian: "未找到亚洲区间",
    vwapNearest: "最近的带",
    volRising: "成交量上升",
    volFalling: "成交量下降",
    volNormal: "成交量正常",
    volNa: "该品种无成交量数据",
    dxyTitle: "美元指数（DXY）",
    dxyNa: "DXY目前不可用——未从Yahoo获取",
    corrLabel: "相关性（20周期）",
    corrNeg: "负",
    corrPos: "正",
    corrFlat: "弱",
    riskTitle: "风险管理——指导（非实时交易管理）",
    riskRrTarget: "R:R 1:2目标——在TP3达成",
    riskTp1: "在TP1止盈50%，然后将SL移至盈亏平衡点（入场价）。",
    riskSize: "仓位大小：每笔交易仅冒账户1%的风险。",
    riskDd: "回撤控制：单笔交易风险绝不超过1%——保持亏损小。",
    sentiment: "24小时情绪",
    demandZone: "需求区",
    supplyZone: "供给区",
    liveComments: "实时评论",
    nextCheck: "下次检查：",
    nextCheckSuffix: "秒（30秒监控）",
    signalUpdated: "信号已更新",
    buyGates: "BUY关口",
    sellGates: "SELL关口",
    entryZone: "入场区",
    trigger: "触发器",
    scorecard: "评分卡",
    trend: "趋势",
    momentum: "动量",
    volatility: "波动率",
    volume: "成交量",
    structure: "结构",
    ichimoku: "一目均衡表",
    vwapSar: "VWAP / SAR",
    tf15d: "15M和日线",
    smcScore: "SMC评分",
    gatePass: "通过关口！",
    gateNotMet: "关口未通过",
    swingLevels: "摆动水平",
    swingHigh: "最近摆动高点",
    swingLow: "最近摆动低点",
    liqSweeps: "流动性扫荡",
    orderBlocks: "订单块",
    bullOB: "看涨OB",
    bearOB: "看跌OB",
    fresh: "新鲜",
    mitigated: "已缓解",
    fvg: "公允价值缺口（FVG）",
    noFvg: "未找到FVG。",
    microSweeps: "5M微观SSL扫荡",
    liqPools: "流动性池",
    pair: "品种",
    direction: "方向",
    confirmedSignals: "SMC确认",
    cycleEvery: "周期：每",
    cycleSec: "秒",
    sessionActive: "活跃",
    nowPkt: "当前PKT时间",
    nextSession: "下一时段",
    minutes: "分钟",
    newsBlackout: "新闻静默期",
    notAvailable: "不可用",
    sessionStats: "时段统计",
    total: "总计",
    sessionHistoryBtn: "查看时段历史",
    noSessionSignals: "尚未记录时段信号。",
    backtestRunning: "回测运行中…",
    trades: "交易",
    wins: "盈利",
    losses: "亏损",
    winRate: "胜率",
    profitFactor: "盈亏比",
    totalExecuted: "已执行总数",
    breakEven: "盈亏平衡",
    inFlight: "进行中",
    noClosed: "—（尚无已平仓信号）",
    noSignals: "尚未记录信号。",
    cutoff: "阈值",
    qualifying: "合格设置",
    simWinRate: "模拟胜率",
    allOutcomes: "全部结果",
    allEngines: "全部引擎",
    mainTerminal: "主终端",
    smcEngine: "SMC引擎",
    sessionEngine: "时段引擎",
    newsIntel: "新闻情报",
    username: "用户名",
    role: "角色",
    plan: "套餐",
    planExpiry: "套餐到期",
    daysLeft: "天剩余",
    lifetimeNever: "终身 — 永不过期",
    managePlan: "如需更改套餐，请联系管理员",
    signals: "信号",
    engines: "引擎",
    engineOffNote: "关闭的引擎确实已关闭——不会产生信号。Test Push仅是应用内测试消息，不是真正的推送通知。",
    testPushBtn: "Test Push（应用内测试）",
    testPushMsg: "Test push（应用内）：这只是测试，不是真正的推送通知。",
    historyTabText: "所有信号都在历史标签页中。",
    openHistory: "打开历史",
    tfLoading: "正在加载TF矩阵…",
    exportText: "将信号下载为CSV。",
    exportBtn: "导出CSV",
    aiTitle: "AI助手——仅应用内。",
    aiText: "这不是实时AI服务，只是应用内的助手。",
    aiAsk: "提问",
    defaultPair: "默认品种",
    saved: "已保存。",
    totalBuyers: "买家总数",
    expired: "已过期",
    bandHai: "已暂停",
    active: "活跃",
    lifetime: "终身",
    expiry: "到期",
    extend30: "+30天",
    suspend: "暂停",
    reopen: "重新开通",
    changePass: "修改密码",
    delete: "删除",
    noBuyers: "暂无买家。",
    buyerCreated: "买家已创建",
    passChanged: "密码已更改。",
    ownPassTitle: "更改您的密码",
    phNewPass: "新密码（至少6个字符）",
    phConfirmPass: "再次输入密码",
    passTooShort: "密码至少需要6个字符",
    passMismatch: "两次输入的密码不一致",
    saveBtn: "保存",
    cancelBtn: "取消",
    newPassPrompt: "新密码（至少6个字符）：",
    deleteConfirm: " — 删除此用户？",
    serverUnreachable: "无法连接服务器：",
    priceLoadFail: "价格加载失败：",
    signalLoadFail: "信号加载失败：",
    indLoadFail: "指标加载失败：",
    indNoData: "没有可用于指标的K线。",
    smcLoadFail: "SMC加载失败：",
    smcNoData: "无SMC数据。",
    scannerFail: "扫描器加载失败：",
    sessionLoadFail: "时段加载失败：",
    newsFail: "新闻暂时不可用——请稍后再试。",
    newsFallbackNote: "一个信息源不可用 — 显示的标题来自正常的信息源",
    newsUpdated: "已更新",
    newSignal: "新信号！",
    alertsNote: "提醒仅在网站打开时有效——关闭的标签页或关机的手机上无效。",
    sound: "声音",
    notifications: "通知",
    status: "状态",
    session: "时段",
    pktTime: "PKT时间",
    quality: "质量",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "信号",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "尚未记录SMC确认。",
    smcBacktestRunning: "SMC回测运行中…",
    termBacktestRunning: "终端回测运行中…",
    termBacktestNote: "过去30天，1H K线——不承诺未来结果。基准=终端引擎（6个关口，85%关口）。过滤器并未改善所有品种，因此实时引擎未添加任何过滤器。",
    termBacktestBtn: "运行终端回测",
    smcBacktestBtn: "运行SMC回测（30天）",
    smcBacktestNote: "真实15M K线上的SMC规则（评分80%+）——没有编造的数字。",
    filter: "过滤器",
    baseline: "基准",
    macdAgree: "MACD一致",
    noDeadHours: "无空闲时段",
    chartNoData: "没有可用于图表的K线。",
    allSessions: "全部时段（PKT时间）",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "市场结构（BOS/MSS）",
    buyNow: "🟢 立即买入",
    sellNow: "🔴 立即卖出",
    waitNoTrade: "⏳ WAIT——无交易",
    bannerLine: "现在就执行这笔交易——Entry、SL和TP如下所示。",
    approaching: "接近中 — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "概览",
    engineControls: "引擎控制",
    signalDetails: "信号详情",
    signalHistory: "信号历史",
    tfMatrix: "TF矩阵",
    trackingLogs: "跟踪日志",
    exportCsv: "导出CSV",
    aiAgent: "AI助手",
    preferences: "偏好设置",
    copySignal: "📋 复制信号",
    downloadSignal: "⬇️ 下载图片",
    copyDone: "信号已复制",
    copyDoneBody: "信号文本已复制——粘贴到WhatsApp或Telegram。",
    copyFailBody: "复制失败——请手动选择文本复制。",
    imgDone: "图片已下载",
    imgDoneBody: "信号卡图片已下载。",
    imgFail: "图片下载失败——请重试。",
    shareDisclaimer: "没有任何信号是100%盈利的。",
    close: "关闭",
    scanNow: "🔍 立即扫描",
    scanning: "扫描中…",
    monitorEvery: "每",
    stopMonitoring: "⏸ 停止",
    startMonitoring: "▶ 开始",
    monitoringOff: "监控已关闭——请按开始",
    scanDone: "扫描完成",
    scanDoneBody: "所有品种已重新扫描。",
    scanFailBody: "扫描失败——请重试。",
    bestTimeframe: "最佳时间周期：1H（4H也可以）——15M仅用于入场时机",
    signalCode: "信号代码",
    validUntil: "有效期至",
    newSignalPopup: "新信号来了！",
    whyWait: "为什么等待？— Why Wait?",
    copyWaitAnalysis: "📋 复制WAIT分析",
    waitCopyDone: "WAIT分析已复制",
    waitCopyDoneBody: "WAIT分析已复制——粘贴到WhatsApp或Telegram。",
    smcBelowGate: "SMC低于其关口",
    zoneBlockedReason: "该方向后方没有合适的区域",
    shareCard: "📤 分享卡",
    downloadHighRes: "⬇️ 下载高清PNG",
    copyImage: "🖼️ 复制图片",
    copyFormattedText: "📋 复制格式化文本",
    formattedPreview: "格式化文本预览（Telegram / WhatsApp）",
    imgCopyDone: "图片已复制",
    imgCopyDoneBody: "信号卡图片已复制到剪贴板。",
    imgCopyFail: "图片复制失败",
    imgCopyFailBody: "此浏览器不支持图片复制——请使用下载。",
    dcaNote: "DCA：在TP1止盈50%，其余仓位持有至TP2/TP3。",
    breakevenNote: "盈亏平衡：TP1之后，将SL移至入场价。",
    stepSignal: "信号",
    stepEntry: "入场区",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "交易已关闭",
    progression: "进展",
    confluenceLbl: "汇合",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "情绪波——计算得出（非预测）",
    sentimentWaveNote: "此情绪由真实RSI、趋势和区域计算得出——不是预测。",
    demandIndex: "需求指数",
    supplyIndex: "供给指数",
    zoneCorridor: "区域通道",
    histDetails: "信号详情（已记录）",
    gatesNotSaved: "该信号未保存关口详情。",
    detailsBtn: "详情",
    pivotTitle: "枢轴点（前一日）",
    fearGreedTitle: "比特币恐惧与贪婪（alternative.me）",
    fearGreedNa: "恐惧与贪婪目前不可用。",
    riskProfile: "风险偏好",
    riskConservative: "保守",
    riskModerate: "稳健",
    riskAggressive: "激进",
    riskConsText: "仅高汇合信号——每笔交易风险1%",
    riskModText: "标准——每笔交易风险1%",
    riskAggText: "更高风险——每笔交易最高2%，回撤可能更大",
    riskProfileLine: "您的风险偏好",
    timezone: "时区",
    theme: "主题",
    themeDark: "深色",
    themeLight: "浅色",
    language: "语言",
    prefPair: "首选品种",
    engineStatus: "引擎状态",
    prefSaved: "偏好设置已保存。",
    guideTitle: "如何交易？——4个简单步骤",
    guideStep1: "仅在BUY或SELL信号时交易——WAIT时绝不交易。",
    guideStep2: "Entry、SL和TP都写在卡片上——风险绝不超过SL。",
    guideStep3: "确认信息就在卡片上：评分高于关口，原因列在下方“为什么是这笔交易？”中。",
    guideStep4: "最佳时间周期是1H（4H也可以）——15M仅用于入场时机。",
    whyTradeTitle: "为什么是这笔交易？——确认",
    whyTrend: "趋势在这一边",
    whyZone: "价格处于交易区",
    whyZoneNear: "价格接近交易区",
    whySmcHigh: "SMC评分80+——聪明钱也在这一边",
    whyTopGate: "最强检查项",
    oneTradeLabel: "一次只做一笔交易",
    oneTradeNote: "一次只做一笔交易——不显示另一方向的设置。",
    gatesExplain: "6项检查，100分——信号仅在85+时形成（像考试及格线）。",
    smcExplain: "5部分，100分——80+为良好（强确认）。",
    gateLblTrendUp: "趋势向上（EMA）",
    gateLblTrendDown: "趋势向下（EMA）",
    gateLblStructure: "结构强劲",
    gateLblRsi: "RSI处于健康区间",
    gateLblRr: "回报大于风险",
    gateLblEma200: "大趋势（EMA200）一致",
    gateLblFresh: "数据新鲜",
    smcLblSweep: "流动性已被扫荡",
    smcLblStructure: "市场结构已转变",
    smcLblOb: "已找到订单块",
    smcLblFvg: "已找到FVG缺口",
    smcLblRr: "风险/回报良好",
    chkLblSweep: "大玩家已拿走流动性",
    chkLblOb: "大玩家的区域",
    chkLblFvg: "价格中的空白缺口",
    chkLblSr: "强支撑/阻力位",
    chkLblZones: "买卖区域",
    extLblCandle: "K线暗示趋势",
    extLblChoch: "趋势可能转变的信号",
    extLblMss: "新趋势已确认",
    extLblBreaker: "旧水平现为支撑/阻力",
    extLblIdm: "假动作后回落",
    extLblFib: "斐波那契水平（已计算）",
    extLblBb: "波动率挤压",
    extLblMacdDiv: "MACD与价格不一致",
    extLblMeanRev: "价格偏离均值多远",
    extLblKillzone: "活跃时段时间",
    extLblAsian: "亚洲时段区间",
    extLblVwap: "VWAP带（平均价格）",
    extLblVol: "成交量——交易了多少",
    smcNoSignalBanner: "SMC不提供信号——它只是终端信号的确认。",
    smcConfirmStrong: "强确认 ✓",
    smcConfirmWeak: "确认较弱——80+时为强确认",
    notASignalNote: "这不是信号——仅在终端信号时交易。",
    confirmationLbl: "确认",
    smcEngineHeader: "SMC引擎 • 运行中",
    smcEngineSub: "流动性扫荡 · 订单块 · FVG · 15M宏观与5M入场",
    smcSetupQuality: "设置质量",
    smcGradeStrong: "A · 强",
    smcGradeModerate: "B · 中等",
    smcGradeDeveloping: "C · 发展中",
    smcGradeWeak: "D · 弱",
    smcWaiting80: "等待80%确认",
    smcConfirmed80: "已达到80%确认——终端信号的强确认",
    smcBias: "SMC偏向（15M）",
    smcBiasBullish: "看涨",
    smcBiasBearish: "看跌",
    smcBiasNeutral: "中性",
    smcLiveMove: "实时波动（自入场）",
    smcGenerated: "已生成",
    smcBeTip: "盈亏平衡提示：盈利+100点后，将SL移至入场价——仅供参考，非自动执行。",
    smcFeedNote: "这只是确认——不要据此交易，请等待终端信号。",
    perfNoteTerminal: "胜率仅根据终端信号计算——SMC/时段不计入。",
    smcTpNote: "TP2/TP3：仅记录TP1/SL结果。",
    smcInspectChart: "查看图表",
    tgTitle: "Telegram提醒——信号发送到您的手机",
    tgText: "出现BUY/SELL信号时，即使网站已关闭，您也会在手机上收到Telegram消息。打开下方链接并在机器人上按Start。",
    tgButton: "📲 在Telegram上获取提醒",
    tgPersonalTitle: "您的个人Telegram链接",
    tgPersonalText: "此链接仅属于您——它将提醒与您的账户绑定。打开链接，在机器人上按Start即可！套餐到期或被暂停后，提醒将停止。",
    tgLinked: "✅ Telegram提醒已开启——出现信号时您将收到消息。",
    tgNotLinked: "Telegram提醒尚未开启——请打开链接并按Start。",
    tgCopyLink: "复制链接",
    tgLinkCopied: "您的个人Telegram链接已复制——请在机器人上按Start。",
    marketCards: "实时市场",
    pcMarketPrice: "市场价格（最新）",
    pcChange24h: "当日 / 24小时涨跌",
    pcSpread: "点差",
    pcKeyLevels: "历史关键水平",
    pcSources: "来源",
    liveMarketPrice: "实时市场价格",
    awaitingConf: "等待汇合",
    scanningMarket: "正在扫描市场——等待85%汇合",
    confirmedTitle: "已确认指标",
    passedLbl: "通过",
    awaitingTitle: "等待确认",
    pendingLbl: "待定",
    needsGate: "需要85%",
    requiredTitle: "BUY或SELL之前的要求",
    requiredBuy: "BUY确认所需",
    requiredSell: "SELL确认所需",
    reqBuyTpl: "从{a}看涨反弹——价格收复{b}",
    reqSellTpl: "从{a}看跌拒绝——价格跌破{b}",
    analyzeNow: "立即分析市场",
    inspectInd: "查看指标",
    downloadCard: "下载卡片",
    liveTick: "实时Tick已同步",
    timeframeLbl: "时间周期",
    confidenceLbl: "信心",
    htfLbl: "高时间周期一致性",
    adxRanging: "低于20——无趋势（震荡）",
    adxTrend: "20或以上——趋势强劲",
    smcConfirmLbl: "SMC确认",
    rsiNeedBuy: "BUY需要50–70",
    rsiNeedSell: "SELL需要30–50",
    rrNeed: "需要R:R 1.5",
    bannerTerminal: "信号仅来自这里——在BUY/SELL卡上交易",
    bannerSmc: "这不是信号——只是确认",
    bannerSession: "这只显示时间——不提供信号",
    bannerHistory: "这些是旧信号——不要据此交易，仅查看结果",
    bannerScanner: "这只是搜索——信号在终端中形成"
  },
  id: {
    tagline: "Sinyal live untuk Emas, Bitcoin, dan Forex",
    setupTitle: "Pengaturan Pertama Kali",
    setupText: "Buat sendiri username dan password Admin Anda. Jangan pernah mengirim password Anda kepada siapa pun — hanya Anda yang boleh mengetahuinya.",
    setupBtn: "Buat Akun Admin",
    loginTitle: "Login",
    loginBtn: "Login",
    finePrint: "Tidak ada sinyal yang 100% menguntungkan. Berlatihlah dulu di demo, jangan buru-buru mempertaruhkan uang sungguhan.",
    logout: "Logout",
    refresh: "Refresh",
    refreshing: "Merefresh…",
    lastUpdate: "Update terakhir",
    secAgo: "detik lalu",
    tabTerminal: "Terminal",
    tabIndicators: "Indikator",
    tabSmc: "SMC",
    tabSession: "Sesi",
    tabHistory: "Riwayat",
    tabAccount: "Akun",
    tabAdmin: "Admin",
    howSignalTitle: "Kapan dan Bagaimana Sinyal Terbentuk?",
    howSignalText1: "Tidak ada waktu tetap untuk sinyal. BUY/SELL hanya terbentuk ketika 85% atau lebih poin diperoleh dari 6 gate. WAIT artinya: jangan trading sekarang, syarat belum terpenuhi.",
    howSignalText2: "Gate SMC terpisah (80%) — lihat tab SMC. Sinyal Terminal tidak menunggu gate SMC.",
    tfHint: "Timeframe terbaik: 1H (dengan tren 4H) — sinyal paling dapat diandalkan di 1H/4H; 15M hanya untuk timing masuk dan 5M terlalu berisik. (Backtest 90 hari, 4 pair: win rate ~60%, profit factor ~1,00 — impas, hasil masa lalu, bukan jaminan.)",
    rareSignals: "Sinyal jarang tapi lebih berkualitas — BUY/SELL hanya muncul saat gate 85% terpenuhi. Lebih banyak sinyal bukan berarti hasil lebih baik.",
    allPairsTitle: "Semua Pair — Harga Live",
    indCenterTitle: "Pusat Indikator",
    indCenterText: "Semua angka ini dihitung dari candle Kraken asli — EMA 20/50 menunjukkan tren, RSI 14 menunjukkan momentum, dan ATR 14 menunjukkan seberapa jauh harga biasanya bergerak.",
    indTfNote: "Nilai di bawah ini timeframe 1H — 15M dan Harian tercantum terpisah di bawah",
    smcTitle: "SMC (Smart Money Concepts)",
    smcText: "Level SMC berasal dari swing high/low candle 15M asli — tempat pembeli/penjual besar biasanya menunggu. Skor SMC terdiri dari 5 bagian × 20 poin, gate 80%. BUY/SELL Terminal tidak berasal dari tab ini; ia menggunakan syarat 85% Terminal sendiri.",
    scannerTitle: "Pemindai Pasar Global (11 pair, setiap 45 detik)",
    smcPairCardsTitle: "Konfirmasi SMC — Setiap Pair",
    sessionTitle: "Mesin Sesi",
    backtestTitle: "Simulator Backtest Sesi",
    backtestText: "Jalankan aturan sesi pada candle 1H asli.",
    backtestBtn: "Jalankan Backtest (30 hari)",
    historyTitle: "Riwayat Sinyal",
    historyText: "Hanya sinyal yang benar-benar tercatat yang ditampilkan — tidak ada riwayat lama yang dibuat-buat. Hasil (Win/Loss/Break-Even/In-Flight) diperiksa terhadap candle berikutnya.",
    refinerTitle: "Penyempurna Strategi",
    refinerText: "Cutoff hanya berlaku untuk sinyal yang tercatat setelah build ini, karena sinyal lama tidak menyimpan skor gate.",
    marketClosedTitle: "Pasar Tutup",
    marketClosedText: "Pasar forex dan emas tutup pada hari Sabtu dan Minggu — tidak ada sinyal baru yang akan terbentuk untuk pasangan ini. Harga yang ditampilkan adalah harga terakhir yang tersedia, bukan harga live.",
    marketClosedShort: "Pasar tutup — harga terakhir yang tersedia",
    accountTitle: "Akun",
    adminTitle: "Panel Admin — Akun Pembeli",
    adminPlansText: "Bulanan 30 hari · Triwulan 90 hari · Tahunan 365 hari · Seumur hidup (tidak pernah berakhir). Saat paket berakhir, login pembeli terkunci otomatis.",
    createBuyerBtn: "Buat Pembeli",
    newsTitle: "Berita Fundamental",
    newsText: "Headline forex/pasar terbaru — dari feed RSS gratis FXStreet dan ForexLive.",
    chartTitle: "Grafik Harga — Candle + EMA 20/50/200",
    indStripTitle: "Indikator Live",
    smcMacroTitle: "Makro 15M",
    smcMicroTitle: "Mikro 5M",
    smcFeedTitle: "Feed Konfirmasi SMC — konfirmasi, bukan sinyal",
    smcBacktestTitle: "Backtest SMC",
    termBacktestTitle: "Backtest Terminal (30 hari)",
    phSetupUser: "Username Admin (min. 3 karakter)",
    phSetupPass: "Password Admin (min. 6 karakter)",
    phLoginUser: "Username",
    phLoginPass: "Password",
    phBuyerUser: "Username pembeli",
    phBuyerPass: "Password pembeli",
    phAiQ: "Tulis pertanyaan, misal: kapan sinyal terbentuk?",
    hello: "Halo",
    loading: "Memuat…",
    noTrade: "(tidak ada trade)",
    price: "Harga",
    confluence: "Confluence",
    gate: "gate",
    buySellPlans: "Rencana BUY dan SELL — keduanya bersama",
    signalPlan: "Rencana Sinyal — satu arah, satu trade",
    smcChecklist: "Checklist Confluence SMC — alasan sebenarnya sinyal ini",
    oppScenario: "Skenario berlawanan",
    oppGateNotMet: "gate tidak terpenuhi",
    chkSweep: "Liquidity Sweep",
    chkOB: "Order Block",
    chkFvg: "FVG (Fair Value Gap)",
    chkSR: "Support / Resistance",
    chkZones: "Zona (Demand / Supply)",
    chkYes: "✓ Mendukung",
    chkNo: "✗ Tidak mendukung",
    chkNa: "– Netral",
    noSweep: "Tidak ada sweep",
    noObDir: "Tidak ditemukan order block ke arah ini",
    noFvgDir: "Tidak ditemukan FVG ke arah ini",
    inDemand: "Harga berada di zona demand",
    inSupply: "Harga berada di zona supply",
    nearDemand: "Harga dekat zona demand",
    nearSupply: "Harga dekat zona supply",
    noZone: "Harga tidak berada di zona mana pun",
    tradeZone: "Zona Trade",
    inZone: "DALAM ZONA — IN ZONE",
    nearZone: "Harga dekat zona",
    farZone: "Harga jauh dari zona",
    noZoneDir: "Tidak ditemukan zona untuk arah ini",
    bosUp: "Struktur tembus ke atas (BOS) — bullish",
    bosDown: "Struktur tembus ke bawah (BOS) — bearish",
    noBreak: "Tidak ada break struktur — level bertahan",
    extTitle: "Confluence Lanjutan — dari candle 1H",
    extNote: "Semua ini hanya confluence — tidak mengubah arah sinyal atau gate (85%/80%).",
    chkCandle: "Pola Candlestick (1H)",
    chkChoch: "CHOCH (Change of Character)",
    chkMss: "MSS (Market Structure Shift)",
    chkBreaker: "Blok Breaker / Mitigation",
    chkIdm: "IDM (Inducement)",
    chkFib: "Level Fibonacci",
    chkBb: "Bollinger Squeeze",
    chkMacdDiv: "Divergensi MACD",
    chkMeanRev: "Mean Reversion",
    chkKillzone: "Killzone / Waktu Sesi",
    chkAsian: "Range Sesi Asia",
    chkVwap: "Pita VWAP (±1σ / ±2σ)",
    chkVol: "Volume (1H)",
    patBullEngulf: "Bullish Engulfing",
    patBearEngulf: "Bearish Engulfing",
    patHammer: "Hammer / Pin Bar (bullish)",
    patShootingStar: "Shooting Star (bearish)",
    patDoji: "Doji (netral)",
    patMorningStar: "Morning Star (bullish)",
    patEveningStar: "Evening Star (bearish)",
    noPattern: "Tidak ada pola jelas",
    chochUp: "CHOCH ke atas — break melawan tren",
    chochDown: "CHOCH ke bawah — break melawan tren",
    noChoch: "Tidak ada CHOCH",
    mssUp: "MSS ke atas — tren baru terkonfirmasi",
    mssDown: "MSS ke bawah — tren baru terkonfirmasi",
    noMss: "Tidak ada MSS",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "Tidak ada blok breaker/mitigation",
    idmSsl: "IDM ditemukan — sweep SSL lalu reclaim (bullish)",
    idmBsl: "IDM ditemukan — sweep BSL lalu reclaim (bearish)",
    noIdm: "Tidak ada IDM",
    fibNearest: "Level terdekat",
    squeezeOn: "Ada squeeze — volatilitas rendah, pergerakan besar bisa datang",
    squeezeOff: "Tidak ada squeeze",
    meanNear: "Dekat mean",
    meanExtended: "Jauh dari mean",
    meanOver: "Sangat overextended",
    aboveMean: "di atas mean",
    belowMean: "di bawah mean",
    macdBullDiv: "Divergensi bullish — harga lebih rendah, MACD lebih tinggi",
    macdBearDiv: "Divergensi bearish — harga lebih tinggi, MACD lebih rendah",
    noMacdDiv: "Tidak ada divergensi MACD",
    killActive: "Killzone aktif",
    killNext: "Killzone berikutnya",
    kzAsian: "Asia",
    kzLondon: "London",
    kzNewYork: "New York",
    asianIn: "Harga berada di dalam range",
    asianAbove: "Harga berekspansi di atas range",
    asianBelow: "Harga berekspansi di bawah range",
    noAsian: "Tidak ditemukan range Asia",
    vwapNearest: "Pita terdekat",
    volRising: "Volume naik",
    volFalling: "Volume turun",
    volNormal: "Volume normal",
    volNa: "Tidak ada volume untuk pair ini",
    dxyTitle: "Indeks Dolar (DXY)",
    dxyNa: "DXY tidak tersedia saat ini — tidak diterima dari Yahoo",
    corrLabel: "Korelasi (20 periode)",
    corrNeg: "negatif",
    corrPos: "positif",
    corrFlat: "lemah",
    riskTitle: "Manajemen Risiko — panduan (bukan manajemen trade live)",
    riskRrTarget: "Target R:R 1:2 — tercapai di TP3",
    riskTp1: "Di TP1 ambil 50% profit, lalu pindahkan SL ke breakeven (entry).",
    riskSize: "Ukuran posisi: risikokan hanya 1% akun Anda per trade.",
    riskDd: "Kontrol drawdown: jangan pernah merisikokan lebih dari 1% dalam satu trade — jaga kerugian tetap kecil.",
    sentiment: "Sentimen 24J",
    demandZone: "Zona Demand",
    supplyZone: "Zona Supply",
    liveComments: "Komentar Live",
    nextCheck: "Pemeriksaan berikutnya dalam",
    nextCheckSuffix: "d (monitoring 30 detik)",
    signalUpdated: "Sinyal diperbarui",
    buyGates: "Gate BUY",
    sellGates: "Gate SELL",
    entryZone: "Zona Entry",
    trigger: "Pemicu",
    scorecard: "Kartu Skor",
    trend: "Tren",
    momentum: "Momentum",
    volatility: "Volatilitas",
    volume: "Volume",
    structure: "Struktur",
    ichimoku: "Ichimoku",
    vwapSar: "VWAP / SAR",
    tf15d: "15M dan Harian",
    smcScore: "Skor SMC",
    gatePass: "Gate lolos!",
    gateNotMet: "gate tidak terpenuhi",
    swingLevels: "Level Swing",
    swingHigh: "Swing High terakhir",
    swingLow: "Swing Low terakhir",
    liqSweeps: "Liquidity Sweeps",
    orderBlocks: "Order Blocks",
    bullOB: "OB Bullish",
    bearOB: "OB Bearish",
    fresh: "fresh",
    mitigated: "mitigated",
    fvg: "Fair Value Gaps (FVG)",
    noFvg: "Tidak ditemukan FVG.",
    microSweeps: "Sweep SSL Mikro 5M",
    liqPools: "Kolam likuiditas",
    pair: "Pair",
    direction: "Arah",
    confirmedSignals: "Konfirmasi SMC",
    cycleEvery: "Siklus: setiap",
    cycleSec: "detik",
    sessionActive: "Aktif",
    nowPkt: "Waktu PKT saat ini",
    nextSession: "Sesi berikutnya",
    minutes: "menit",
    newsBlackout: "Blackout berita",
    notAvailable: "Tidak tersedia",
    sessionStats: "Statistik sesi",
    total: "Total",
    sessionHistoryBtn: "Lihat Riwayat Sesi",
    noSessionSignals: "Belum ada sinyal sesi yang tercatat.",
    backtestRunning: "Backtest berjalan…",
    trades: "Trade",
    wins: "Menang",
    losses: "Kalah",
    winRate: "Win Rate",
    profitFactor: "Profit Factor",
    totalExecuted: "Total Dieksekusi",
    breakEven: "Break-Even",
    inFlight: "Berjalan",
    noClosed: "— (belum ada sinyal tertutup)",
    noSignals: "Belum ada sinyal yang tercatat.",
    cutoff: "Cutoff",
    qualifying: "Setup yang memenuhi syarat",
    simWinRate: "Win Rate Simulasi",
    allOutcomes: "Semua hasil",
    allEngines: "Semua engine",
    mainTerminal: "Terminal Utama",
    smcEngine: "Engine SMC",
    sessionEngine: "Engine Sesi",
    newsIntel: "Intelijen Berita",
    username: "Username",
    role: "Peran",
    plan: "Paket",
    planExpiry: "Masa berlaku paket",
    daysLeft: "hari tersisa",
    lifetimeNever: "Seumur hidup — tidak pernah kedaluwarsa",
    managePlan: "Untuk mengubah paket, hubungi admin",
    signals: "Sinyal",
    engines: "Engine",
    engineOffNote: "Engine yang OFF benar-benar mati — tidak membuat sinyal. Test Push hanya pesan tes di dalam app, bukan notifikasi push sungguhan.",
    testPushBtn: "Test Push (tes di app)",
    testPushMsg: "Test push (di app): ini hanya tes, bukan notifikasi push sungguhan.",
    historyTabText: "Semua sinyal ada di tab Riwayat.",
    openHistory: "Buka Riwayat",
    tfLoading: "Memuat TF Matrix…",
    exportText: "Unduh sinyal sebagai CSV.",
    exportBtn: "Export CSV",
    aiTitle: "AI Agent — hanya di app.",
    aiText: "Ini bukan layanan AI live, hanya helper di dalam app.",
    aiAsk: "Tanya",
    defaultPair: "Pair default",
    saved: "Tersimpan.",
    totalBuyers: "Total pembeli",
    expired: "Kedaluarsa",
    bandHai: "Ditangguhkan",
    active: "Aktif",
    lifetime: "Seumur Hidup",
    expiry: "Kedaluarsa",
    extend30: "+30 hari",
    suspend: "Tangguhkan",
    reopen: "Buka kembali",
    changePass: "Ubah password",
    delete: "Hapus",
    noBuyers: "Belum ada pembeli.",
    buyerCreated: "Pembeli dibuat",
    passChanged: "Password diubah.",
    ownPassTitle: "Ubah kata sandi Anda",
    phNewPass: "Kata sandi baru (minimal 6 karakter)",
    phConfirmPass: "Ketik ulang kata sandi",
    passTooShort: "Kata sandi minimal 6 karakter",
    passMismatch: "Kedua kata sandi tidak sama",
    saveBtn: "Simpan",
    cancelBtn: "Batal",
    newPassPrompt: "Password baru (min. 6 karakter):",
    deleteConfirm: " — hapus pengguna ini?",
    serverUnreachable: "Tidak dapat terhubung ke server:",
    priceLoadFail: "Harga gagal dimuat:",
    signalLoadFail: "Sinyal gagal dimuat:",
    indLoadFail: "Indikator gagal dimuat:",
    indNoData: "Tidak ada candle untuk indikator.",
    smcLoadFail: "SMC gagal dimuat:",
    smcNoData: "Tidak ada data SMC.",
    scannerFail: "Scanner gagal dimuat:",
    sessionLoadFail: "Sesi gagal dimuat:",
    newsFail: "Berita tidak tersedia saat ini — coba lagi sebentar lagi.",
    newsFallbackNote: "Satu feed tidak aktif — headline yang ditampilkan berasal dari feed yang berjalan",
    newsUpdated: "Diperbarui",
    newSignal: "Sinyal Baru!",
    alertsNote: "Alert hanya bekerja saat situs terbuka — tidak pada tab tertutup atau ponsel mati.",
    sound: "Suara",
    notifications: "Notifikasi",
    status: "Status",
    session: "Sesi",
    pktTime: "Waktu PKT",
    quality: "Kualitas",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "Sinyal",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "Belum ada konfirmasi SMC yang tercatat.",
    smcBacktestRunning: "Backtest SMC berjalan…",
    termBacktestRunning: "Backtest Terminal berjalan…",
    termBacktestNote: "30 hari terakhir, candle 1H — bukan janji hasil di masa depan. Baseline = engine Terminal (6 gate, gate 85%). Filter tidak memperbaiki semua pair, jadi tidak ada filter yang ditambahkan ke engine live.",
    termBacktestBtn: "Jalankan Backtest Terminal",
    smcBacktestBtn: "Jalankan Backtest SMC (30 hari)",
    smcBacktestNote: "Aturan SMC (skor 80%+) pada candle 15M asli — tanpa angka yang dibuat-buat.",
    filter: "Filter",
    baseline: "Baseline",
    macdAgree: "MACD setuju",
    noDeadHours: "Tidak ada jam mati",
    chartNoData: "Tidak ada candle untuk grafik.",
    allSessions: "Semua Sesi (waktu PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "Struktur Pasar (BOS/MSS)",
    buyNow: "🟢 BELI SEKARANG",
    sellNow: "🔴 JUAL SEKARANG",
    waitNoTrade: "⏳ WAIT — tidak ada trade",
    bannerLine: "Ambil trade ini sekarang — Entry, SL dan TP ada di bawah.",
    approaching: "MENDEKATI — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "Ringkasan",
    engineControls: "Kontrol Engine",
    signalDetails: "Detail Sinyal",
    signalHistory: "Riwayat Sinyal",
    tfMatrix: "Matriks TF",
    trackingLogs: "Log Pelacakan",
    exportCsv: "Export CSV",
    aiAgent: "AI Agent",
    preferences: "Preferensi",
    copySignal: "📋 Salin Sinyal",
    downloadSignal: "⬇️ Unduh Gambar",
    copyDone: "Sinyal disalin",
    copyDoneBody: "Teks sinyal disalin — tempel di WhatsApp atau Telegram.",
    copyFailBody: "Tidak dapat menyalin — pilih teks secara manual.",
    imgDone: "Gambar diunduh",
    imgDoneBody: "Gambar kartu sinyal diunduh.",
    imgFail: "Gambar gagal diunduh — coba lagi.",
    shareDisclaimer: "Tidak ada sinyal yang 100% menguntungkan.",
    close: "Tutup",
    scanNow: "🔍 Scan Sekarang",
    scanning: "Memindai…",
    monitorEvery: "Setiap",
    stopMonitoring: "⏸ Berhenti",
    startMonitoring: "▶ Mulai",
    monitoringOff: "Monitoring mati — tekan Mulai",
    scanDone: "Scan selesai",
    scanDoneBody: "Semua pair dipindai ulang.",
    scanFailBody: "Scan gagal — coba lagi.",
    bestTimeframe: "Timeframe terbaik: 1H (4H juga bagus) — 15M hanya untuk timing masuk",
    signalCode: "Kode Sinyal",
    validUntil: "Berlaku hingga",
    newSignalPopup: "Sinyal Sudah Datang!",
    whyWait: "Kenapa Menunggu? — Why Wait?",
    copyWaitAnalysis: "📋 Salin Analisis WAIT",
    waitCopyDone: "Analisis WAIT disalin",
    waitCopyDoneBody: "Analisis WAIT disalin — tempel di WhatsApp atau Telegram.",
    smcBelowGate: "SMC di bawah gatenya",
    zoneBlockedReason: "Tidak ada zona yang tepat di balik arah ini",
    shareCard: "📤 Kartu Bagikan",
    downloadHighRes: "⬇️ Unduh PNG Resolusi Tinggi",
    copyImage: "🖼️ Salin Gambar",
    copyFormattedText: "📋 Salin Teks Terformat",
    formattedPreview: "Pratinjau Teks Terformat (Telegram / WhatsApp)",
    imgCopyDone: "Gambar disalin",
    imgCopyDoneBody: "Gambar kartu sinyal disalin ke clipboard.",
    imgCopyFail: "Gambar tidak dapat disalin",
    imgCopyFailBody: "Salin gambar tidak didukung di browser ini — gunakan Unduh.",
    dcaNote: "DCA: ambil 50% profit di TP1, biarkan sisanya berjalan ke TP2/TP3.",
    breakevenNote: "Breakeven: setelah TP1, pindahkan SL ke entry.",
    stepSignal: "Sinyal",
    stepEntry: "Zona entry",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "Trade ditutup",
    progression: "Progres",
    confluenceLbl: "Confluence",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "Gelombang Sentimen — dihitung (bukan prediksi)",
    sentimentWaveNote: "Sentimen ini dihitung dari RSI, tren, dan zona asli — ini bukan prediksi.",
    demandIndex: "Indeks Demand",
    supplyIndex: "Indeks Supply",
    zoneCorridor: "Koridor Zona",
    histDetails: "Detail Sinyal (tercatat)",
    gatesNotSaved: "Detail gate tidak disimpan untuk sinyal ini.",
    detailsBtn: "Detail",
    pivotTitle: "Pivot Points (hari sebelumnya)",
    fearGreedTitle: "Bitcoin Fear & Greed (alternative.me)",
    fearGreedNa: "Fear & Greed tidak tersedia saat ini.",
    riskProfile: "Profil Risiko",
    riskConservative: "Konservatif",
    riskModerate: "Moderat",
    riskAggressive: "Agresif",
    riskConsText: "Hanya sinyal confluence tinggi — risiko 1% per trade",
    riskModText: "Standar — risiko 1% per trade",
    riskAggText: "Risiko lebih tinggi — hingga 2% per trade, drawdown bisa lebih besar",
    riskProfileLine: "Profil risiko Anda",
    timezone: "Zona Waktu",
    theme: "Tema",
    themeDark: "Gelap",
    themeLight: "Terang",
    language: "Bahasa",
    prefPair: "Pair Pilihan",
    engineStatus: "Status Engine",
    prefSaved: "Preferensi tersimpan.",
    guideTitle: "Bagaimana Mengambil Trade? — 4 Langkah Mudah",
    guideStep1: "Hanya trading pada sinyal BUY atau SELL — jangan pernah trading pada WAIT.",
    guideStep2: "Entry, SL dan TP tertulis di kartu — jangan pernah merisikokan lebih dari SL.",
    guideStep3: "Konfirmasi ada di kartu itu sendiri: skor di atas gate, dan alasannya tercantum di bawah \"Kenapa trade ini?\" di bawah.",
    guideStep4: "Timeframe terbaik adalah 1H (4H juga bagus) — 15M hanya untuk timing masuk.",
    whyTradeTitle: "Kenapa trade ini? — Konfirmasi",
    whyTrend: "Tren ada di sisi ini",
    whyZone: "Harga berada di zona trade",
    whyZoneNear: "Harga dekat zona trade",
    whySmcHigh: "Skor SMC 80+ — smart money juga di sisi ini",
    whyTopGate: "Pemeriksaan terkuat",
    oneTradeLabel: "Hanya satu trade dalam satu waktu",
    oneTradeNote: "Hanya satu trade dalam satu waktu — setup arah lain tidak ditampilkan.",
    gatesExplain: "6 pemeriksaan, 100 poin — sinyal hanya terbentuk pada 85+ (seperti nilai lulus ujian).",
    smcExplain: "5 bagian, 100 poin — 80+ sudah bagus (konfirmasi kuat).",
    gateLblTrendUp: "Tren naik (EMA)",
    gateLblTrendDown: "Tren turun (EMA)",
    gateLblStructure: "Struktur kuat",
    gateLblRsi: "RSI berada di rentang sehat",
    gateLblRr: "Reward lebih besar dari risiko",
    gateLblEma200: "Tren besar (EMA200) setuju",
    gateLblFresh: "Data segar",
    smcLblSweep: "Likuiditas tersapu",
    smcLblStructure: "Struktur pasar berubah",
    smcLblOb: "Order block ditemukan",
    smcLblFvg: "Gap FVG ditemukan",
    smcLblRr: "Risk/reward baik",
    chkLblSweep: "Pemain besar mengambil likuiditas",
    chkLblOb: "Zona pemain besar",
    chkLblFvg: "Celah kosong di harga",
    chkLblSr: "Level support/resistance kuat",
    chkLblZones: "Area beli/jual",
    extLblCandle: "Candle memberi isyarat tren",
    extLblChoch: "Tanda tren mungkin berubah",
    extLblMss: "Tren baru terkonfirmasi",
    extLblBreaker: "Level lama kini menjadi support/resistance",
    extLblIdm: "Kembali setelah pergerakan palsu",
    extLblFib: "Level Fibonacci (dihitung)",
    extLblBb: "Volatilitas squeeze",
    extLblMacdDiv: "MACD dan harga tidak setuju",
    extLblMeanRev: "Seberapa jauh harga dari mean",
    extLblKillzone: "Waktu sesi aktif",
    extLblAsian: "Range sesi Asia",
    extLblVwap: "Pita VWAP (harga rata-rata)",
    extLblVol: "Volume — berapa banyak yang ditradingkan",
    smcNoSignalBanner: "SMC TIDAK memberikan sinyal — ini hanya konfirmasi untuk sinyal Terminal.",
    smcConfirmStrong: "Konfirmasi kuat ✓",
    smcConfirmWeak: "Konfirmasi lemah — kuat pada 80+",
    notASignalNote: "Ini bukan sinyal — trading hanya pada sinyal Terminal.",
    confirmationLbl: "Konfirmasi",
    smcEngineHeader: "ENGINE SMC • AKTIF",
    smcEngineSub: "Liquidity Sweeps · Order Blocks · FVGs · Makro 15M & Entry 5M",
    smcSetupQuality: "Kualitas Setup",
    smcGradeStrong: "A · Kuat",
    smcGradeModerate: "B · Sedang",
    smcGradeDeveloping: "C · Berkembang",
    smcGradeWeak: "D · Lemah",
    smcWaiting80: "Menunggu konfirmasi 80%",
    smcConfirmed80: "Konfirmasi 80% tercapai — konfirmasi kuat untuk sinyal Terminal",
    smcBias: "Bias SMC (15M)",
    smcBiasBullish: "Bullish",
    smcBiasBearish: "Bearish",
    smcBiasNeutral: "Netral",
    smcLiveMove: "Pergerakan live (dari entry)",
    smcGenerated: "Dibuat",
    smcBeTip: "Tips breakeven: setelah profit +100 pips, pindahkan SL ke Entry — hanya saran, bukan otomatis.",
    smcFeedNote: "Ini hanya konfirmasi — jangan trading dengan ini, tunggu sinyal Terminal.",
    perfNoteTerminal: "Win rate dihitung hanya dari sinyal Terminal — SMC/Sesi tidak dihitung di sini.",
    smcTpNote: "TP2/TP3: hanya hasil TP1/SL yang tercatat.",
    smcInspectChart: "Periksa Grafik",
    tgTitle: "Alert Telegram — Sinyal di Ponsel Anda",
    tgText: "Saat sinyal BUY/SELL muncul, Anda mendapat pesan Telegram di ponsel Anda — bahkan saat situs ditutup. Buka tautan di bawah dan tekan Start pada bot.",
    tgButton: "📲 Dapatkan Alert di Telegram",
    tgPersonalTitle: "Tautan Telegram Pribadi Anda",
    tgPersonalText: "Tautan ini hanya milik Anda — menghubungkan alert ke akun Anda. Buka tautan, tekan Start pada bot, selesai! Alert berhenti jika paket Anda berakhir atau ditangguhkan.",
    tgLinked: "✅ Alert Telegram AKTIF — Anda akan mendapat pesan saat sinyal muncul.",
    tgNotLinked: "Alert Telegram belum AKTIF — buka tautan dan tekan Start.",
    tgCopyLink: "Salin Tautan",
    tgLinkCopied: "Tautan Telegram pribadi Anda disalin — tekan Start pada bot.",
    marketCards: "Pasar Live",
    pcMarketPrice: "Harga Pasar (Terakhir)",
    pcChange24h: "Perubahan Harian / 24J",
    pcSpread: "Spread",
    pcKeyLevels: "Level Kunci Historis",
    pcSources: "Sumber",
    liveMarketPrice: "HARGA PASAR LIVE",
    awaitingConf: "MENUNGGU CONFLUENCE",
    scanningMarket: "Memindai pasar — menunggu confluence 85%",
    confirmedTitle: "INDIKATOR TERKONFIRMASI",
    passedLbl: "LOLOS",
    awaitingTitle: "MENUNGGU KONFIRMASI",
    pendingLbl: "TERTUNDA",
    needsGate: "BUTUH 85%",
    requiredTitle: "DIPERLUKAN SEBELUM BUY ATAU SELL",
    requiredBuy: "UNTUK KONFIRMASI BUY",
    requiredSell: "UNTUK KONFIRMASI SELL",
    reqBuyTpl: "Pantulan bullish dari {a} — harga merebut kembali {b}",
    reqSellTpl: "Penolakan bearish dari {a} — harga kehilangan {b}",
    analyzeNow: "ANALISIS PASAR SEKARANG",
    inspectInd: "PERIKSA INDIKATOR",
    downloadCard: "UNDUH KARTU",
    liveTick: "Tick Real-time Tersinkron",
    timeframeLbl: "TIMEFRAME",
    confidenceLbl: "KEYAKINAN",
    htfLbl: "Keselarasan Timeframe Lebih Tinggi",
    adxRanging: "di bawah 20 — tidak ada tren (ranging)",
    adxTrend: "20 atau lebih — tren kuat",
    smcConfirmLbl: "Konfirmasi SMC",
    rsiNeedBuy: "BUY butuh 50–70",
    rsiNeedSell: "SELL butuh 30–50",
    rrNeed: "Butuh R:R 1.5",
    bannerTerminal: "SINYAL HANYA DARI SINI — trading pada kartu BUY/SELL",
    bannerSmc: "INI BUKAN SINYAL — hanya konfirmasi",
    bannerSession: "INI HANYA MEMBERI TAHU WAKTU — tidak memberi sinyal",
    bannerHistory: "INI SINYAL LAMA — jangan trading dengan ini, hanya lihat hasilnya",
    bannerScanner: "INI HANYA MENCARI — sinyal dibuat di Terminal"
  },
  fa: {
    tagline: "سیگنال‌های زنده طلا، بیت‌کوین و فارکس",
    setupTitle: "راه‌اندازی اولیه",
    setupText: "نام کاربری و رمز عبور ادمین خود را بسازید. رمز عبور خود را هرگز برای کسی نفرستید — فقط شما باید آن را بدانید.",
    setupBtn: "ساخت حساب ادمین",
    loginTitle: "ورود",
    loginBtn: "ورود",
    finePrint: "هیچ سیگنالی ۱۰۰٪ سودده نیست. ابتدا در دمو تمرین کنید، پول واقعی را با عجله به خطر نیندازید.",
    logout: "خروج",
    refresh: "تازه‌سازی",
    refreshing: "در حال تازه‌سازی…",
    lastUpdate: "آخرین به‌روزرسانی",
    secAgo: "ثانیه پیش",
    tabTerminal: "ترمینال",
    tabIndicators: "اندیکاتورها",
    tabSmc: "SMC",
    tabSession: "سشن",
    tabHistory: "تاریخچه",
    tabAccount: "حساب",
    tabAdmin: "ادمین",
    howSignalTitle: "سیگنال چه زمانی و چگونه ساخته می‌شود؟",
    howSignalText1: "سیگنال زمان ثابتی ندارد. BUY/SELL فقط زمانی ساخته می‌شود که ۸۵٪ یا بیشتر امتیاز در ۶ گیت به دست آید. WAIT یعنی: الان معامله نکنید، شرایط کامل نیست.",
    howSignalText2: "گیت SMC جداست (۸۰٪) — تب SMC را ببینید. سیگنال ترمینال منتظر گیت SMC نمی‌ماند.",
    tfHint: "بهترین تایم‌فریم: 1H (با روند 4H) — سیگنال‌ها در 1H/4H قابل‌اعتمادترین هستند؛ 15M فقط برای زمان ورود است و 5M نویز زیادی دارد. (بک‌تست ۹۰ روزه، ۴ جفت: نرخ برد ~۶۰٪، فاکتور سود ~۱٫۰۰ — سر به سر، نتیجه گذشته است، تضمین نیست.)",
    rareSignals: "سیگنال‌ها کم اما باکیفیت‌تر هستند — BUY/SELL فقط زمانی نشان داده می‌شود که گیت ۸۵٪ رد شود. سیگنال بیشتر به معنای نتیجه بهتر نیست.",
    allPairsTitle: "همه جفت‌ها — قیمت‌های زنده",
    indCenterTitle: "مرکز اندیکاتورها",
    indCenterText: "همه این اعداد از کندل‌های واقعی Kraken محاسبه می‌شوند — EMA 20/50 روند را نشان می‌دهد، RSI 14 مومنتوم را، و ATR 14 نشان می‌دهد قیمت معمولاً چقدر حرکت می‌کند.",
    indTfNote: "مقادیر زیر در تایم‌فریم ۱ ساعته هستند — ۱۵ دقیقه و روزانه جداگانه در زیر آمده‌اند",
    smcTitle: "SMC (مفاهیم پول هوشمند)",
    smcText: "سطوح SMC از سقف/کف‌های واقعی کندل‌های 15M گرفته می‌شوند — جایی که خریداران/فروشندگان بزرگ معمولاً منتظر می‌مانند. امتیاز SMC از ۵ بخش × ۲۰ امتیاز ساخته می‌شود، گیت ۸۰٪ است. BUY/SELL ترمینال از این تب نمی‌آید؛ از شرایط ۸۵٪ خود ترمینال استفاده می‌کند.",
    scannerTitle: "اسکنر جهانی بازار (۱۱ جفت، هر ۴۵ ثانیه)",
    smcPairCardsTitle: "تأیید SMC — هر جفت",
    sessionTitle: "موتور سشن",
    backtestTitle: "شبیه‌ساز بک‌تست سشن",
    backtestText: "قانون سشن را روی کندل‌های واقعی 1H اجرا کنید.",
    backtestBtn: "اجرای بک‌تست (۳۰ روز)",
    historyTitle: "تاریخچه سیگنال‌ها",
    historyText: "فقط سیگنال‌های واقعاً ثبت‌شده نشان داده می‌شوند — هیچ تاریخچه گذشته‌ای ساخته نشده است. نتیجه (Win/Loss/Break-Even/In-Flight) با کندل‌های بعدی بررسی و نشان داده می‌شود.",
    refinerTitle: "بهینه‌ساز استراتژی",
    refinerText: "حد فقط روی سیگنال‌های ثبت‌شده پس از این نسخه اعمال می‌شود، چون سیگنال‌های قدیمی امتیاز گیت را ذخیره نکرده‌اند.",
    marketClosedTitle: "بازار بسته است",
    marketClosedText: "بازار فارکس و طلا در روزهای شنبه و یکشنبه بسته است — برای این جفت هیچ سیگنال جدیدی شکل نمی‌گیرد. قیمت نمایش داده شده آخرین قیمت موجود است، نه قیمت زنده.",
    marketClosedShort: "بازار بسته است — آخرین قیمت موجود",
    accountTitle: "حساب",
    adminTitle: "پنل ادمین — حساب‌های خریداران",
    adminPlansText: "ماهانه ۳۰ روز · سه‌ماهه ۹۰ روز · سالانه ۳۶۵ روز · مادام‌العمر (هرگز تمام نمی‌شود). با پایان طرح، ورود خریدار خودکار قفل می‌شود.",
    createBuyerBtn: "ساخت خریدار",
    newsTitle: "اخبار فاندامنتال",
    newsText: "آخرین تیترهای فارکس/بازار — از فیدهای RSS رایگان FXStreet و ForexLive.",
    chartTitle: "نمودار قیمت — کندل‌ها + EMA 20/50/200",
    indStripTitle: "اندیکاتورهای زنده",
    smcMacroTitle: "ماکرو 15M",
    smcMicroTitle: "میکرو 5M",
    smcFeedTitle: "فید تایید SMC — تایید، نه سیگنال",
    smcBacktestTitle: "بک‌تست SMC",
    termBacktestTitle: "بک‌تست ترمینال (۳۰ روز)",
    phSetupUser: "نام کاربری ادمین (حداقل ۳ حرف)",
    phSetupPass: "رمز عبور ادمین (حداقل ۶ حرف)",
    phLoginUser: "نام کاربری",
    phLoginPass: "رمز عبور",
    phBuyerUser: "نام کاربری خریدار",
    phBuyerPass: "رمز عبور خریدار",
    phAiQ: "سوال بنویسید، مثلاً: سیگنال چه زمانی ساخته می‌شود؟",
    hello: "سلام",
    loading: "در حال بارگذاری…",
    noTrade: "(بدون معامله)",
    price: "قیمت",
    confluence: "تلاقی",
    gate: "گیت",
    buySellPlans: "طرح‌های BUY و SELL — هر دو با هم",
    signalPlan: "طرح سیگنال — یک جهت، یک معامله",
    smcChecklist: "چک‌لیست تلاقی SMC — دلیل واقعی این سیگنال",
    oppScenario: "سناریوی مخالف",
    oppGateNotMet: "گیت رد نشد",
    chkSweep: "جاروی نقدینگی",
    chkOB: "بلوک سفارش",
    chkFvg: "FVG (شکاف ارزش منصفانه)",
    chkSR: "حمایت / مقاومت",
    chkZones: "مناطق (تقاضا / عرضه)",
    chkYes: "✓ تایید می‌کند",
    chkNo: "✗ تایید نمی‌کند",
    chkNa: "– خنثی",
    noSweep: "جارویی رخ نداد",
    noObDir: "بلوک سفارشی در این جهت پیدا نشد",
    noFvgDir: "FVG در این جهت پیدا نشد",
    inDemand: "قیمت در منطقه تقاضاست",
    inSupply: "قیمت در منطقه عرضه است",
    nearDemand: "قیمت نزدیک منطقه تقاضاست",
    nearSupply: "قیمت نزدیک منطقه عرضه است",
    noZone: "قیمت در هیچ منطقه‌ای نیست",
    tradeZone: "منطقه معامله",
    inZone: "در منطقه — IN ZONE",
    nearZone: "قیمت نزدیک منطقه است",
    farZone: "قیمت از منطقه دور است",
    noZoneDir: "منطقه‌ای برای این جهت پیدا نشد",
    bosUp: "ساختار به بالا شکسته شد (BOS) — صعودی",
    bosDown: "ساختار به پایین شکسته شد (BOS) — نزولی",
    noBreak: "شکست ساختار نیست — سطح حفظ شد",
    extTitle: "تلاقی گسترده — از کندل‌های 1H",
    extNote: "همه این‌ها فقط تلاقی هستند — جهت سیگنال یا گیت‌ها (۸۵٪/۸۰٪) را تغییر نمی‌دهند.",
    chkCandle: "الگوی کندل (1H)",
    chkChoch: "CHOCH (تغییر شخصیت)",
    chkMss: "MSS (تغییر ساختار بازار)",
    chkBreaker: "بلوک‌های Breaker / Mitigation",
    chkIdm: "IDM (القایی)",
    chkFib: "سطوح فیبوناچی",
    chkBb: "فشردگی بولینگر",
    chkMacdDiv: "واگرایی MACD",
    chkMeanRev: "بازگشت به میانگین",
    chkKillzone: "کیل‌زون / زمان سشن",
    chkAsian: "محدوده سشن آسیایی",
    chkVwap: "باندهای VWAP (±1σ / ±2σ)",
    chkVol: "حجم (1H)",
    patBullEngulf: "پوشای صعودی",
    patBearEngulf: "پوشای نزولی",
    patHammer: "چکش / پین‌بار (صعودی)",
    patShootingStar: "ستاره دنباله‌دار (نزولی)",
    patDoji: "دوجی (خنثی)",
    patMorningStar: "ستاره صبحگاهی (صعودی)",
    patEveningStar: "ستاره شامگاهی (نزولی)",
    noPattern: "الگوی مشخصی نیست",
    chochUp: "CHOCH به بالا — شکست خلاف روند",
    chochDown: "CHOCH به پایین — شکست خلاف روند",
    noChoch: "CHOCH نیست",
    mssUp: "MSS به بالا — روند جدید تایید شد",
    mssDown: "MSS به پایین — روند جدید تایید شد",
    noMss: "MSS نیست",
    breakerLbl: "Breaker",
    mitigationLbl: "Mitigation",
    noBreaker: "بلوک Breaker/Mitigation نیست",
    idmSsl: "IDM پیدا شد — جاروی SSL و سپس بازگشت (صعودی)",
    idmBsl: "IDM پیدا شد — جاروی BSL و سپس بازگشت (نزولی)",
    noIdm: "IDM نیست",
    fibNearest: "نزدیک‌ترین سطح",
    squeezeOn: "فشردگی هست — نوسان کم است، حرکت بزرگی ممکن است بیاید",
    squeezeOff: "فشردگی نیست",
    meanNear: "نزدیک میانگین",
    meanExtended: "دور از میانگین",
    meanOver: "خیلی بیش‌ازحد کشیده",
    aboveMean: "بالای میانگین",
    belowMean: "زیر میانگین",
    macdBullDiv: "واگرایی صعودی — قیمت پایین‌تر، MACD بالاتر",
    macdBearDiv: "واگرایی نزولی — قیمت بالاتر، MACD پایین‌تر",
    noMacdDiv: "واگرایی MACD نیست",
    killActive: "کیل‌زون فعال",
    killNext: "کیل‌زون بعدی",
    kzAsian: "آسیایی",
    kzLondon: "لندن",
    kzNewYork: "نیویورک",
    asianIn: "قیمت داخل محدوده است",
    asianAbove: "قیمت بالای محدوده گسترش یافت",
    asianBelow: "قیمت زیر محدوده گسترش یافت",
    noAsian: "محدوده آسیایی پیدا نشد",
    vwapNearest: "نزدیک‌ترین باند",
    volRising: "حجم در حال افزایش است",
    volFalling: "حجم در حال کاهش است",
    volNormal: "حجم عادی است",
    volNa: "برای این جفت حجمی موجود نیست",
    dxyTitle: "شاخص دلار (DXY)",
    dxyNa: "DXY در حال حاضر در دسترس نیست — از Yahoo دریافت نشد",
    corrLabel: "همبستگی (۲۰ دوره)",
    corrNeg: "منفی",
    corrPos: "مثبت",
    corrFlat: "ضعیف",
    riskTitle: "مدیریت ریسک — راهنما (مدیریت معامله زنده نیست)",
    riskRrTarget: "هدف R:R 1:2 — در TP3 محقق می‌شود",
    riskTp1: "در TP1، ۵۰٪ سود بگیرید، سپس SL را به سر به سر (ورود) منتقل کنید.",
    riskSize: "اندازه پوزیشن: در هر معامله فقط ۱٪ حساب خود را ریسک کنید.",
    riskDd: "کنترل افت سرمایه: هرگز در یک معامله بیش از ۱٪ ریسک نکنید — زیان‌ها را کوچک نگه دارید.",
    sentiment: "احساسات ۲۴ ساعته",
    demandZone: "منطقه تقاضا",
    supplyZone: "منطقه عرضه",
    liveComments: "نظرات زنده",
    nextCheck: "بررسی بعدی تا",
    nextCheckSuffix: "ثانیه (پایش ۳۰ ثانیه‌ای)",
    signalUpdated: "سیگنال به‌روز شد",
    buyGates: "گیت‌های BUY",
    sellGates: "گیت‌های SELL",
    entryZone: "منطقه ورود",
    trigger: "ماشه",
    scorecard: "کارت امتیاز",
    trend: "روند",
    momentum: "مومنتوم",
    volatility: "نوسان",
    volume: "حجم",
    structure: "ساختار",
    ichimoku: "ایچیموکو",
    vwapSar: "VWAP / SAR",
    tf15d: "15M و روزانه",
    smcScore: "امتیاز SMC",
    gatePass: "گیت رد شد!",
    gateNotMet: "گیت رد نشد",
    swingLevels: "سطوح سوینگ",
    swingHigh: "آخرین سقف سوینگ",
    swingLow: "آخرین کف سوینگ",
    liqSweeps: "جاروهای نقدینگی",
    orderBlocks: "بلوک‌های سفارش",
    bullOB: "OB صعودی",
    bearOB: "OB نزولی",
    fresh: "تازه",
    mitigated: "کاهش‌یافته",
    fvg: "شکاف‌های ارزش منصفانه (FVG)",
    noFvg: "FVG پیدا نشد.",
    microSweeps: "جاروهای میکرو SSL در 5M",
    liqPools: "استخرهای نقدینگی",
    pair: "جفت",
    direction: "جهت",
    confirmedSignals: "تاییدهای SMC",
    cycleEvery: "چرخه: هر",
    cycleSec: "ثانیه",
    sessionActive: "فعال",
    nowPkt: "زمان فعلی PKT",
    nextSession: "سشن بعدی",
    minutes: "دقیقه",
    newsBlackout: "خاموشی اخبار",
    notAvailable: "در دسترس نیست",
    sessionStats: "آمار سشن",
    total: "مجموع",
    sessionHistoryBtn: "مشاهده تاریخچه سشن",
    noSessionSignals: "هنوز سیگنال سشنی ثبت نشده است.",
    backtestRunning: "بک‌تست در حال اجراست…",
    trades: "معاملات",
    wins: "بردها",
    losses: "باخت‌ها",
    winRate: "نرخ برد",
    profitFactor: "فاکتور سود",
    totalExecuted: "مجموع اجرا شده",
    breakEven: "سر به سر",
    inFlight: "در جریان",
    noClosed: "— (هنوز سیگنال بسته‌ای نیست)",
    noSignals: "هنوز سیگنالی ثبت نشده است.",
    cutoff: "حد",
    qualifying: "ستاپ‌های واجد شرایط",
    simWinRate: "نرخ برد شبیه‌سازی شده",
    allOutcomes: "همه نتایج",
    allEngines: "همه موتورها",
    mainTerminal: "ترمینال اصلی",
    smcEngine: "موتور SMC",
    sessionEngine: "موتور سشن",
    newsIntel: "اطلاعات خبری",
    username: "نام کاربری",
    role: "نقش",
    plan: "طرح",
    planExpiry: "انقضای طرح",
    daysLeft: "روز باقی مانده",
    lifetimeNever: "مادام‌العمر — هرگز منقضی نمی‌شود",
    managePlan: "برای تغییر طرح با مدیر تماس بگیرید",
    signals: "سیگنال‌ها",
    engines: "موتورها",
    engineOffNote: "موتور خاموش واقعاً خاموش است — سیگنالی نمی‌سازد. Test Push فقط یک پیام آزمایشی داخل برنامه است، نه اعلان پوش واقعی.",
    testPushBtn: "Test Push (تست داخل برنامه)",
    testPushMsg: "Test push (داخل برنامه): این فقط یک تست است، نه اعلان پوش واقعی.",
    historyTabText: "همه سیگنال‌ها در تب تاریخچه هستند.",
    openHistory: "باز کردن تاریخچه",
    tfLoading: "در حال بارگذاری ماتریس TF…",
    exportText: "سیگنال‌ها را به‌صورت CSV دانلود کنید.",
    exportBtn: "خروجی CSV",
    aiTitle: "عامل هوش مصنوعی — فقط داخل برنامه.",
    aiText: "این یک سرویس هوش مصنوعی زنده نیست، فقط یک دستیار داخل برنامه است.",
    aiAsk: "بپرسید",
    defaultPair: "جفت پیش‌فرض",
    saved: "ذخیره شد.",
    totalBuyers: "مجموع خریداران",
    expired: "منقضی شده",
    bandHai: "معلق شده",
    active: "فعال",
    lifetime: "مادام‌العمر",
    expiry: "انقضا",
    extend30: "+۳۰ روز",
    suspend: "معلق کردن",
    reopen: "باز کردن دوباره",
    changePass: "تغییر رمز عبور",
    delete: "حذف",
    noBuyers: "هنوز خریداری نیست.",
    buyerCreated: "خریدار ساخته شد",
    passChanged: "رمز عبور تغییر کرد.",
    ownPassTitle: "گذرواژه خود را تغییر دهید",
    phNewPass: "گذرواژه جدید (حداقل ۶ حرف)",
    phConfirmPass: "گذرواژه را دوباره بنویسید",
    passTooShort: "گذرواژه باید حداقل ۶ حرف باشد",
    passMismatch: "دو گذرواژه یکسان نیستند",
    saveBtn: "ذخیره",
    cancelBtn: "لغو",
    newPassPrompt: "رمز عبور جدید (حداقل ۶ حرف):",
    deleteConfirm: " — این کاربر حذف شود؟",
    serverUnreachable: "ارتباط با سرور برقرار نمی‌شود:",
    priceLoadFail: "قیمت‌ها بارگذاری نشدند:",
    signalLoadFail: "سیگنال بارگذاری نشد:",
    indLoadFail: "اندیکاتورها بارگذاری نشدند:",
    indNoData: "کندلی برای اندیکاتورها موجود نیست.",
    smcLoadFail: "SMC بارگذاری نشد:",
    smcNoData: "داده SMC نیست.",
    scannerFail: "اسکنر بارگذاری نشد:",
    sessionLoadFail: "سشن بارگذاری نشد:",
    newsFail: "اخبار در حال حاضر در دسترس نیست — به‌زودی دوباره تلاش کنید.",
    newsFallbackNote: "یک فید قطع است — تیترهای نمایش داده شده از فید فعال هستند",
    newsUpdated: "به‌روز شد",
    newSignal: "سیگنال جدید!",
    alertsNote: "هشدارها فقط وقتی سایت باز است کار می‌کنند — نه در تب بسته یا گوشی خاموش.",
    sound: "صدا",
    notifications: "اعلان‌ها",
    status: "وضعیت",
    session: "سشن",
    pktTime: "زمان PKT",
    quality: "کیفیت",
    entry: "Entry",
    sl: "SL",
    tp1: "TP1",
    rsi: "RSI",
    adx: "ADX",
    signal: "سیگنال",
    macdHist: "MACD Hist",
    ema20: "EMA20",
    noSmcSignals: "هنوز تایید SMC ثبت نشده است.",
    smcBacktestRunning: "بک‌تست SMC در حال اجراست…",
    termBacktestRunning: "بک‌تست ترمینال در حال اجراست…",
    termBacktestNote: "۳۰ روز گذشته، کندل‌های 1H — وعده نتایج آینده نیست. مبنا = موتور ترمینال (۶ گیت، گیت ۸۵٪). فیلترها همه جفت‌ها را بهبود ندادند، پس هیچ فیلتری به موتور زنده اضافه نشد.",
    termBacktestBtn: "اجرای بک‌تست ترمینال",
    smcBacktestBtn: "اجرای بک‌تست SMC (۳۰ روز)",
    smcBacktestNote: "قوانین SMC (امتیاز ۸۰٪+) روی کندل‌های واقعی 15M — بدون عدد ساخته‌شده.",
    filter: "فیلتر",
    baseline: "مبنا",
    macdAgree: "MACD موافق",
    noDeadHours: "بدون ساعت مرده",
    chartNoData: "کندلی برای نمودار موجود نیست.",
    allSessions: "همه سشن‌ها (زمان PKT)",
    bos: "BOS",
    mss: "MSS",
    macroTitle: "ساختار بازار (BOS/MSS)",
    buyNow: "🟢 همین حالا BUY",
    sellNow: "🔴 همین حالا SELL",
    waitNoTrade: "⏳ WAIT — بدون معامله",
    bannerLine: "همین حالا این معامله را بگیرید — Entry، SL و TP در زیر است.",
    approaching: "در حال نزدیک شدن — APPROACHING",
    waitStatus: "WAIT",
    activePlan: "ACTIVE",
    overview: "نمای کلی",
    engineControls: "کنترل‌های موتور",
    signalDetails: "جزئیات سیگنال",
    signalHistory: "تاریخچه سیگنال‌ها",
    tfMatrix: "ماتریس TF",
    trackingLogs: "گزارش‌های ردیابی",
    exportCsv: "خروجی CSV",
    aiAgent: "عامل هوش مصنوعی",
    preferences: "ترجیحات",
    copySignal: "📋 کپی سیگنال",
    downloadSignal: "⬇️ دانلود تصویر",
    copyDone: "سیگنال کپی شد",
    copyDoneBody: "متن سیگنال کپی شد — در WhatsApp یا Telegram بچسبانید.",
    copyFailBody: "کپی نشد — متن را به‌صورت دستی انتخاب کنید.",
    imgDone: "تصویر دانلود شد",
    imgDoneBody: "تصویر کارت سیگنال دانلود شد.",
    imgFail: "دانلود تصویر ناموفق بود — دوباره تلاش کنید.",
    shareDisclaimer: "هیچ سیگنالی ۱۰۰٪ سودده نیست.",
    close: "بستن",
    scanNow: "🔍 اسکن کن",
    scanning: "در حال اسکن…",
    monitorEvery: "هر",
    stopMonitoring: "⏸ توقف",
    startMonitoring: "▶ شروع",
    monitoringOff: "پایش خاموش است — شروع را بزنید",
    scanDone: "اسکن تمام شد",
    scanDoneBody: "همه جفت‌ها دوباره اسکن شدند.",
    scanFailBody: "اسکن ناموفق بود — دوباره تلاش کنید.",
    bestTimeframe: "بهترین تایم‌فریم: 1H (4H هم خوب است) — 15M فقط برای زمان ورود",
    signalCode: "کد سیگنال",
    validUntil: "معتبر تا",
    newSignalPopup: "سیگنال رسید!",
    whyWait: "چرا صبر کنیم؟ — Why Wait?",
    copyWaitAnalysis: "📋 کپی تحلیل WAIT",
    waitCopyDone: "تحلیل WAIT کپی شد",
    waitCopyDoneBody: "تحلیل WAIT کپی شد — در WhatsApp یا Telegram بچسبانید.",
    smcBelowGate: "SMC زیر گیت خودش است",
    zoneBlockedReason: "منطقه مناسبی پشت این جهت نیست",
    shareCard: "📤 کارت اشتراک",
    downloadHighRes: "⬇️ دانلود PNG با کیفیت بالا",
    copyImage: "🖼️ کپی تصویر",
    copyFormattedText: "📋 کپی متن فرمت‌شده",
    formattedPreview: "پیش‌نمایش متن فرمت‌شده (Telegram / WhatsApp)",
    imgCopyDone: "تصویر کپی شد",
    imgCopyDoneBody: "تصویر کارت سیگنال در کلیپ‌بورد کپی شد.",
    imgCopyFail: "تصویر کپی نشد",
    imgCopyFailBody: "کپی تصویر در این مرورگر پشتیبانی نمی‌شود — از دانلود استفاده کنید.",
    dcaNote: "DCA: در TP1، ۵۰٪ سود بگیرید و بقیه را تا TP2/TP3 نگه دارید.",
    breakevenNote: "سر به سر: پس از TP1، SL را به ورود منتقل کنید.",
    stepSignal: "سیگنال",
    stepEntry: "منطقه ورود",
    stepTp1: "TP1",
    stepTp2: "TP2",
    stepTp3: "TP3",
    stepDone: "معامله بسته شد",
    progression: "پیشرفت",
    confluenceLbl: "تلاقی",
    pending: "PENDING",
    hit: "HIT",
    sentimentWave: "موج احساسات — محاسبه‌شده (پیش‌بینی نیست)",
    sentimentWaveNote: "این احساسات از RSI، روند و مناطق واقعی محاسبه می‌شود — پیش‌بینی نیست.",
    demandIndex: "شاخص تقاضا",
    supplyIndex: "شاخص عرضه",
    zoneCorridor: "راهروی مناطق",
    histDetails: "جزئیات سیگنال (ثبت‌شده)",
    gatesNotSaved: "جزئیات گیت برای این سیگنال ذخیره نشد.",
    detailsBtn: "جزئیات",
    pivotTitle: "نقاط پیوت (روز قبل)",
    fearGreedTitle: "ترس و طمع بیت‌کوین (alternative.me)",
    fearGreedNa: "ترس و طمع در حال حاضر در دسترس نیست.",
    riskProfile: "پروفایل ریسک",
    riskConservative: "محافظه‌کار",
    riskModerate: "متوسط",
    riskAggressive: "تهاجمی",
    riskConsText: "فقط سیگنال‌های تلاقی بالا — ۱٪ ریسک در هر معامله",
    riskModText: "استاندارد — ۱٪ ریسک در هر معامله",
    riskAggText: "ریسک بالاتر — تا ۲٪ در هر معامله، افت سرمایه ممکن است بزرگ‌تر باشد",
    riskProfileLine: "پروفایل ریسک شما",
    timezone: "منطقه زمانی",
    theme: "تم",
    themeDark: "تیره",
    themeLight: "روشن",
    language: "زبان",
    prefPair: "جفت ترجیحی",
    engineStatus: "وضعیت موتور",
    prefSaved: "ترجیحات ذخیره شد.",
    guideTitle: "چگونه معامله بگیرید؟ — ۴ مرحله ساده",
    guideStep1: "فقط روی سیگنال BUY یا SELL معامله کنید — هرگز روی WAIT معامله نکنید.",
    guideStep2: "Entry، SL و TP روی کارت نوشته شده است — هرگز بیش از SL ریسک نکنید.",
    guideStep3: "تایید روی خود کارت است: امتیاز بالای گیت است و دلیل آن در زیر «چرا این معامله؟» نوشته شده است.",
    guideStep4: "بهترین تایم‌فریم 1H است (4H هم خوب است) — 15M فقط برای زمان ورود.",
    whyTradeTitle: "چرا این معامله؟ — تایید",
    whyTrend: "روند در این سمت است",
    whyZone: "قیمت در منطقه معامله است",
    whyZoneNear: "قیمت نزدیک منطقه معامله است",
    whySmcHigh: "امتیاز SMC 80+ — پول هوشمند هم در این سمت است",
    whyTopGate: "قوی‌ترین بررسی",
    oneTradeLabel: "فقط یک معامله در هر زمان",
    oneTradeNote: "فقط یک معامله در هر زمان — ستاپ جهت دیگر نشان داده نمی‌شود.",
    gatesExplain: "۶ بررسی، ۱۰۰ امتیاز — سیگنال فقط در ۸۵+ ساخته می‌شود (مثل نمره قبولی امتحان).",
    smcExplain: "۵ بخش، ۱۰۰ امتیاز — ۸۰+ خوب است (تایید قوی).",
    gateLblTrendUp: "روند صعودی (EMA)",
    gateLblTrendDown: "روند نزولی (EMA)",
    gateLblStructure: "ساختار قوی",
    gateLblRsi: "RSI در محدوده سالم است",
    gateLblRr: "سود بزرگ‌تر از ریسک است",
    gateLblEma200: "روند بزرگ (EMA200) موافق است",
    gateLblFresh: "داده تازه است",
    smcLblSweep: "نقدینگی جارو شد",
    smcLblStructure: "ساختار بازار تغییر کرد",
    smcLblOb: "بلوک سفارش پیدا شد",
    smcLblFvg: "شکاف FVG پیدا شد",
    smcLblRr: "ریسک/سود خوب است",
    chkLblSweep: "بازیگران بزرگ نقدینگی گرفتند",
    chkLblOb: "منطقه بازیگران بزرگ",
    chkLblFvg: "شکاف خالی در قیمت",
    chkLblSr: "سطح حمایت/مقاومت قوی",
    chkLblZones: "مناطق خرید/فروش",
    extLblCandle: "کندل روند را نشان می‌دهد",
    extLblChoch: "نشانه‌ای که روند ممکن است تغییر کند",
    extLblMss: "روند جدید تایید شد",
    extLblBreaker: "سطح قدیمی حالا حمایت/مقاومت است",
    extLblIdm: "بازگشت پس از حرکت جعلی",
    extLblFib: "سطوح فیبوناچی (محاسبه‌شده)",
    extLblBb: "فشردگی نوسان",
    extLblMacdDiv: "MACD و قیمت موافق نیستند",
    extLblMeanRev: "قیمت چقدر از میانگین دور است",
    extLblKillzone: "زمان سشن فعال",
    extLblAsian: "محدوده سشن آسیایی",
    extLblVwap: "باندهای VWAP (قیمت میانگین)",
    extLblVol: "حجم — چقدر معامله شد",
    smcNoSignalBanner: "SMC سیگنالی نمی‌دهد — فقط تایید برای سیگنال ترمینال است.",
    smcConfirmStrong: "تایید قوی ✓",
    smcConfirmWeak: "تایید ضعیف — در ۸۰+ قوی است",
    notASignalNote: "این سیگنال نیست — فقط روی سیگنال ترمینال معامله کنید.",
    confirmationLbl: "تایید",
    smcEngineHeader: "موتور SMC • فعال",
    smcEngineSub: "جاروهای نقدینگی · بلوک‌های سفارش · FVGها · ماکرو 15M و ورود 5M",
    smcSetupQuality: "کیفیت ستاپ",
    smcGradeStrong: "A · قوی",
    smcGradeModerate: "B · متوسط",
    smcGradeDeveloping: "C · در حال توسعه",
    smcGradeWeak: "D · ضعیف",
    smcWaiting80: "در انتظار تایید ۸۰٪",
    smcConfirmed80: "تایید ۸۰٪ رسید — تایید قوی برای سیگنال ترمینال",
    smcBias: "گرایش SMC (15M)",
    smcBiasBullish: "صعودی",
    smcBiasBearish: "نزولی",
    smcBiasNeutral: "خنثی",
    smcLiveMove: "حرکت زنده (از ورود)",
    smcGenerated: "ساخته شد",
    smcBeTip: "نکته سر به سر: پس از سود +۱۰۰ پیپ، SL را به Entry منتقل کنید — فقط راهنماست، خودکار نیست.",
    smcFeedNote: "این فقط تایید است — با آن معامله نکنید، منتظر سیگنال ترمینال بمانید.",
    perfNoteTerminal: "نرخ برد فقط از سیگنال‌های ترمینال محاسبه می‌شود — SMC/سشن در اینجا شمرده نمی‌شوند.",
    smcTpNote: "TP2/TP3: فقط نتیجه TP1/SL ثبت می‌شود.",
    smcInspectChart: "بررسی نمودار",
    tgTitle: "هشدارهای تلگرام — سیگنال‌ها روی گوشی شما",
    tgText: "وقتی سیگنال BUY/SELL می‌رسد، پیام تلگرام را روی گوشی خود می‌گیرید — حتی وقتی سایت بسته است. لینک زیر را باز کنید و در ربات Start را بزنید.",
    tgButton: "📲 دریافت هشدارها در تلگرام",
    tgPersonalTitle: "لینک تلگرام شخصی شما",
    tgPersonalText: "این لینک فقط مال شماست — هشدارها را به حساب شما وصل می‌کند. لینک را باز کنید، در ربات Start را بزنید، تمام شد! با پایان طرح یا معلق شدن، هشدارها متوقف می‌شوند.",
    tgLinked: "✅ هشدارهای تلگرام فعال است — وقتی سیگنالی بیاید پیام می‌گیرید.",
    tgNotLinked: "هشدارهای تلگرام هنوز فعال نیست — لینک را باز کنید و Start را بزنید.",
    tgCopyLink: "کپی لینک",
    tgLinkCopied: "لینک تلگرام شخصی شما کپی شد — در ربات Start را بزنید.",
    marketCards: "بازارهای زنده",
    pcMarketPrice: "قیمت بازار (آخرین)",
    pcChange24h: "تغییر روزانه / ۲۴ ساعته",
    pcSpread: "اسپرد",
    pcKeyLevels: "سطوح کلیدی گذشته",
    pcSources: "منابع",
    liveMarketPrice: "قیمت زنده بازار",
    awaitingConf: "در انتظار تلاقی",
    scanningMarket: "در حال اسکن بازار — منتظر تلاقی ۸۵٪",
    confirmedTitle: "اندیکاتورهای تاییدشده",
    passedLbl: "رد شد",
    awaitingTitle: "در انتظار تایید",
    pendingLbl: "در انتظار",
    needsGate: "به ۸۵٪ نیاز است",
    requiredTitle: "قبل از BUY یا SELL چه چیزی لازم است",
    requiredBuy: "برای تایید BUY",
    requiredSell: "برای تایید SELL",
    reqBuyTpl: "بازگشت صعودی از {a} — قیمت {b} را پس گرفت",
    reqSellTpl: "رد نزولی از {a} — قیمت {b} را از دست داد",
    analyzeNow: "تحلیل بازار همین حالا",
    inspectInd: "بررسی اندیکاتورها",
    downloadCard: "دانلود کارت",
    liveTick: "تیک زنده همگام شد",
    timeframeLbl: "تایم‌فریم",
    confidenceLbl: "اطمینان",
    htfLbl: "هماهنگی تایم‌فریم بالاتر",
    adxRanging: "زیر ۲۰ — روندی نیست (رنج)",
    adxTrend: "۲۰ یا بیشتر — روند قوی",
    smcConfirmLbl: "تایید SMC",
    rsiNeedBuy: "BUY به ۵۰–۷۰ نیاز دارد",
    rsiNeedSell: "SELL به ۳۰–۵۰ نیاز دارد",
    rrNeed: "به R:R 1.5 نیاز است",
    bannerTerminal: "سیگنال فقط از اینجاست — روی کارت BUY/SELL معامله کنید",
    bannerSmc: "این سیگنال نیست — فقط تایید است",
    bannerSession: "این فقط زمان را می‌گوید — سیگنال نمی‌دهد",
    bannerHistory: "این‌ها سیگنال‌های قدیمی هستند — با آن‌ها معامله نکنید، فقط نتیجه را ببینید",
    bannerScanner: "این فقط جستجو می‌کند — سیگنال در ترمینال ساخته می‌شود"
  }
};;
function t(k) { return (I18N[lang] && I18N[lang][k]) || I18N.ur[k] || k; }
function langOptionsHtml() { return LANGS.map(([c, n]) => `<option value="${c}" ${c === lang ? 'selected' : ''}>${n}</option>`).join(''); }
function setLang(l) { lang = LANGS.some(([c]) => c === l) ? l : 'ur'; localStorage.setItem('ftp_lang', lang); applyLang(); }
function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  const lb = document.getElementById('langSelect'); if (lb) lb.value = lang;
  const lb2 = document.getElementById('langSelectAuth'); if (lb2) lb2.value = lang;
  const lb3 = document.getElementById('prefLang'); if (lb3) lb3.value = lang;
  updateAlertButtons();
  updateMonitorUI();
  if (me) showTab(currentTab);
  updateTgCard();
}

// ---------------- Telegram alerts card (v9) ----------------
// Terminal card ka button user ke personal deep link par jata hai (Account tab wala hi link).
// Personal code buyer aur admin dono ka hota hai — link me ?start=<code> hota hai.
function tgPersonalLink() { return me && me.tgCode ? 'https://t.me/tradingforexprobot?start=' + me.tgCode : 'https://t.me/tradingforexprobot'; }
function updateTgCard() {
  const btn = document.getElementById('tgLinkBtn');
  const st = document.getElementById('tgLinkStatus');
  if (!btn) return;
  if (me && me.tgCode) {
    btn.href = tgPersonalLink();
    if (st) st.textContent = me.tgLinked ? t('tgLinked') : t('tgNotLinked');
  } else {
    btn.href = 'https://t.me/tradingforexprobot';
    if (st) st.textContent = '';
  }
}
function copyTgLink() {
  copyTextToClipboard(tgPersonalLink()).then(() => showToast(t('tgCopyLink'), esc(t('tgLinkCopied'))));
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
  // v9.2: pop-up/toast/sound/browser notification SIRF Terminal signal par — SMC/Session ki tasdeeq par nahi.
  // History record me engine hota hai ('terminal' / 'smc' / 'session'); engine na ho to Terminal hi mana jata hai.
  if (sig.engine && sig.engine !== 'terminal') return;
  const title = t('newSignal') + ' ' + sig.pair + ' ' + sig.direction;
  const body = 'Entry ' + fmtPx(sig.pair, sig.entry) + ' · SL ' + fmtPx(sig.pair, sig.sl) + ' · TP1 ' + fmtPx(sig.pair, sig.tp1) + ' · ' + fmtPktTimeShort(sig.createdAt);
  showToast(title, esc(body));
  playAlertSound();
  showSignalPopup(sig); // v7: bara pop-up (toast ke saath)
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

// ---------------- v7: Live monitoring — interval choice + Stop/Start + Scan Now ----------------
// Ek hi priceTimer hota hai — interval badalne par purana clear karke naya banta hai (duplicate timer nahi).
function restartPriceTimer() {
  if (priceTimer) { clearInterval(priceTimer); priceTimer = null; }
  if (monitoringOn && me) priceTimer = setInterval(() => refreshPrices(false), monitorInterval * 1000);
}
function setMonitorInterval(v) {
  const n = parseInt(v, 10);
  if (![5, 10, 15, 30].includes(n)) return;
  monitorInterval = n; localStorage.setItem('ftp_monitor_interval', String(n));
  restartPriceTimer(); updateMonitorUI();
}
function toggleMonitoring() {
  monitoringOn = !monitoringOn; localStorage.setItem('ftp_monitoring', monitoringOn ? 'on' : 'off');
  restartPriceTimer(); updateMonitorUI();
}
function updateMonitorUI() {
  const sel = document.getElementById('monitorIntervalSel'); if (sel) sel.value = String(monitorInterval);
  const btn = document.getElementById('monitorToggleBtn'); if (btn) btn.textContent = monitoringOn ? t('stopMonitoring') : t('startMonitoring');
}
let scanning = false;
async function scanNow() {
  if (scanning || !me) return;
  scanning = true;
  const btn = document.getElementById('scanBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('scanning'); }
  try {
    await refreshPrices(true, true); // fresh prices + fresh signal (server cache bypass)
    if (currentTab === 'smc') { loadSmc(); loadScanner(); loadSmcFeed(); }
    if (currentTab === 'session') loadSession();
    showToast(t('scanDone'), esc(t('scanDoneBody')));
  } catch (e) { showToast(t('scanDone'), esc(t('scanFailBody'))); }
  if (btn) { btn.disabled = false; btn.textContent = t('scanNow'); }
  scanning = false;
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
// v6: chart canvas ki backing store ko dikhai dene wali chaudai ke hisaab se fit karo.
// Warna 900px wala canvas phone par ~328px me sikud jata hai aur EMA legend (11px) parhna namumkin ho jata hai.
// Desktop par clientWidth 900 se zyada ho to 900 par cap rehta hai — desktop jaisa tha waisa hi rehta hai.
function fitChartCanvas(cv) {
  const w = Math.min(cv.clientWidth || 900, 900);
  if (w > 0 && cv.width !== w) { cv.width = w; cv.height = Math.round(w * 320 / 900); }
}
async function loadChart() {
  const cv = document.getElementById('chartCanvas'); if (!cv) return;
  try {
    const d = await api('/api/candles?pair=' + currentPair + '&tf=' + chartTf);
    lastChartCandles = d.candles || [];
    drawChart(cv, lastChartCandles);
  } catch (e) {
    fitChartCanvas(cv);
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#8ea0c2'; ctx.font = '14px sans-serif'; ctx.fillText(t('chartNoData'), 10, 24);
  }
}
function drawChart(cv, candles) {
  fitChartCanvas(cv);
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!candles || candles.length < 5) { ctx.fillStyle = '#8ea0c2'; ctx.font = '14px sans-serif'; ctx.fillText(t('chartNoData'), 10, 24); return; }
  const closes = candles.map(c => c.c);
  const e20 = emaSeries(closes, 20), e50 = emaSeries(closes, 50), e200 = emaSeries(closes, 200);
  const data = candles.slice(-100);
  const e20s = e20.slice(-100), e50s = e50.slice(-100), e200s = e200.slice(-100);
  let hi = -Infinity, lo = Infinity;
  data.forEach(c => { hi = Math.max(hi, c.h); lo = Math.min(lo, c.l); });
  // v9.6: signal band hamesha nazar aaye — live signal ke Entry/SL/TP1 ko range me shamil karein
  if (currentSignal && currentSignal.pair === currentPair && (currentSignal.direction === 'BUY' || currentSignal.direction === 'SELL')) {
    [currentSignal.entry, currentSignal.sl, currentSignal.tp1].forEach(v => { if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); } });
  }
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
  // v9.1: PDH/PDL horizontal lines (sirf jab range usi pair ki ho aur chart ke andar ho)
  if (lastRange && lastRange.pair === currentPair) {
    ctx.font = '11px sans-serif';
    [['PDH', lastRange.pdh, '#f5c542'], ['PDL', lastRange.pdl, '#ff6b6b']].forEach(([lbl, v, col]) => {
      if (v == null || v < lo || v > hi) return;
      ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.beginPath();
      ctx.moveTo(8, Y(v)); ctx.lineTo(W - 8, Y(v)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.fillText(lbl + ' ' + fmtPx(currentPair, v), 10, Y(v) - 4);
    });
  }
  // v9.6: Terminal signal band — SIRF display (signal card ke Entry/SL/TP1 numbers, koi naya level nahi).
  // BUY = hara, SELL = laal, WAIT (currentSignal null) = koi band nahi. Signal badle to loadTerminal chart dobara draw karta hai.
  if (currentSignal && currentSignal.pair === currentPair && (currentSignal.direction === 'BUY' || currentSignal.direction === 'SELL')) {
    const sig = currentSignal;
    const bTop = Math.max(sig.sl, sig.tp1), bBot = Math.min(sig.sl, sig.tp1);
    const rgb = sig.direction === 'BUY' ? '61,220,132' : '255,107,107';
    ctx.fillStyle = 'rgba(' + rgb + ',0.13)';
    ctx.fillRect(8, Y(bTop), W - 16, Y(bBot) - Y(bTop));
    ctx.strokeStyle = 'rgba(' + rgb + ',0.85)'; ctx.setLineDash([6, 4]); ctx.beginPath();
    ctx.moveTo(8, Y(sig.tp1)); ctx.lineTo(W - 8, Y(sig.tp1));
    ctx.moveTo(8, Y(sig.sl)); ctx.lineTo(W - 8, Y(sig.sl)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(232,236,245,0.9)'; ctx.beginPath();
    ctx.moveTo(8, Y(sig.entry)); ctx.lineTo(W - 8, Y(sig.entry)); ctx.stroke();
    ctx.font = '11px sans-serif';
    const bandLabels = [
      { txt: 'TP1 ' + fmtPx(sig.pair, sig.tp1), y: Y(sig.tp1) - 4, col: 'rgb(' + rgb + ')' },
      { txt: t('entry') + ' ' + fmtPx(sig.pair, sig.entry), y: Y(sig.entry) - 4, col: '#e8ecf5' },
      { txt: 'SL ' + fmtPx(sig.pair, sig.sl), y: Y(sig.sl) - 4, col: 'rgb(' + rgb + ')' }
    ].sort((a, b) => a.y - b.y);
    let prevY = 12;
    bandLabels.forEach(l => {
      const y = Math.max(prevY, Math.min(H - 4, l.y));
      ctx.fillStyle = l.col; ctx.fillText(l.txt, W - 8 - ctx.measureText(l.txt).width, y);
      prevY = y + 12;
    });
  }
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
      cell('RSI 14', fmt(tf.rsi14, 1)) + cell('MACD', fmtPx(currentPair, tf.macd)) +
      cell('EMA 20', fmtPx(currentPair, tf.ema20)) + cell('EMA 50', fmtPx(currentPair, tf.ema50)) +
      cell('EMA 200', fmtPx(currentPair, tf.ema200)) + cell('ATR 14', fmtPx(currentPair, tf.atr14)) +
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
    el.innerHTML = d.news.map(n => `<div class="gate"><span><a href="${esc(n.link)}" target="_blank" rel="noopener" style="color:#e8ecf5">${esc(n.title)}</a><br><small style="color:#8ea0c2">${esc(n.source)} · ${fmtPktTime(n.time)}</small></span></div>`).join('') +
      // v9.5: ek feed band ho to sirf "RETRY" na dikhayein — saaf bataein ke headlines chalti hui feed se hain.
      (d.sources && d.sources.some(s => s.status === 'RETRY') ? `<p class="fine">${esc(t('newsFallbackNote'))}</p>` : '') +
      `<p class="fine">${esc(t('newsUpdated'))}: ${fmtPktTimeShort(d.updatedAt)} · ${d.sources.map(s => esc(s.name) + ': ' + esc(s.status)).join(' · ')}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(t('newsFail')) + '</p>'; }
}

// ---------------- SMC extras: feed + backtest ----------------
// v9.2: SMC feed card — SIRF tasdeeq (score/ring, bias, live price, nateeja, signal code).
// Koi trade plan nahi (Entry/SL/TP), koi signal Copy/Share/Download button nahi — signal sirf Terminal par.
function smcFeedCardHtml(s, i) {
  const live = (lastPriceMap[s.pair] && lastPriceMap[s.pair].price) || null;
  const bias = s.direction === 'BUY' ? t('smcBiasBullish') : t('smcBiasBearish');
  return `<div class="sig-card smc-feed-card">
    <div class="sig-head">
      <div><span class="sig-pair">${esc(s.pair.replace('USD', '/USD'))}</span> <span class="pair-badge">${esc(t('confirmationLbl'))}</span>
      <div class="sig-dir wait">${esc(t('smcBias'))}: ${esc(bias)}</div></div>
      ${confRingHtml(s.score, 80)}
    </div>
    <div class="sig-meta">
      <div><span class="pc-label">${t('signalCode')}</span><br><b>${esc(s.id || '—')}</b></div>
      <div><span class="pc-label">${t('timeframeLbl')}</span><br><b>15m / 1H</b></div>
      <div><span class="pc-label">${t('liveMarketPrice')}</span><br><b>${live == null ? '—' : fmtPx(s.pair, live)}</b></div>
      <div><span class="pc-label">${t('smcGenerated')}</span><br><b>${fmtPktTime(s.createdAt)}</b><br><span class="fine">${esc(s.outcome || 'In-Flight')}</span></div>
    </div>
    <p class="fine">${esc(t('smcFeedNote'))}</p>
    <div class="sig-actions">
      <button class="btn-sig-sm" onclick="inspectSmcChart(${i})">${esc(t('smcInspectChart'))}</button>
    </div>
  </div>`;
}
// Inspect Chart: us pair ka Terminal chart kholein (maujooda selectPair + showTab reuse).
function inspectSmcChart(i) { const s = smcFeedSignals[i]; if (!s) return; selectPair(s.pair); showTab('terminal'); }
async function loadSmcFeed() {
  const el = document.getElementById('smcFeed'); if (!el) return;
  try {
    const d = await api('/api/history?engine=smc');
    smcFeedSignals = (d.signals || []).slice(0, 8);
    el.innerHTML = smcFeedSignals.length ? smcFeedSignals.map((s, i) => smcFeedCardHtml(s, i)).join('') : '<p>' + esc(t('noSmcSignals')) + '</p>';
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
    el.innerHTML = `<div class="table-wrap"><table><tr><th>${t('filter')}</th><th>${t('trades')}</th><th>${t('wins')}</th><th>${t('losses')}</th><th>${t('winRate')}</th><th>${t('profitFactor')}</th></tr>` +
      row(t('baseline'), d.baseline) + row('ADX ≥ 20', d.filters.adx20) + row('ADX ≥ 25', d.filters.adx25) + row(t('macdAgree'), d.filters.macdAgree) + row(t('noDeadHours'), d.filters.noDeadHours) + `</table></div><p>${esc(t('termBacktestNote'))}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}

const PAIR_IDS = ['XAUUSD','XAGUSD','BTCUSD','ETHUSD','SOLUSD','BNBUSD','XRPUSD','DOGEUSD','ADAUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF'];
function fmt(n, dec) { return n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }); }
// v9.6.1: pair ke asal decimals (server ke PAIRS dec jaisi) — fmt(x, 2) har pair ko
// 2 decimal dikhata tha, is liye EURUSD/GBPUSD/USDCAD "1.33" nazar aate the.
const PAIR_DEC = { XAUUSD: 2, XAGUSD: 2, BTCUSD: 2, ETHUSD: 2, SOLUSD: 2, BNBUSD: 2, XRPUSD: 4, DOGEUSD: 4, ADAUSD: 4, EURUSD: 5, GBPUSD: 5, USDJPY: 3, AUDUSD: 5, USDCAD: 5, USDCHF: 5 };
function fmtPx(pair, n) { return fmt(n, PAIR_DEC[(pair || '').toUpperCase()] ?? 2); }
// v9.6.1: "Market band hai" sirf tab jab market ASAL me band ho.
// Server ka marketClosed flag purane (weekend ke) response se Tuesday ko bhi true
// reh sakta hai (tab khula rehna + fetch fail/early-return) — is liye wording ka
// faisla yahan live clock + feed freshness se hota hai, flag se nahi.
// Band: PKT Hafta 00:00 – Ittwaar 23:59 (crypto 24/7, kabhi band nahi);
// ya price feed asal me stale ho (aakhri kamyab price refresh 3 minute se purana).
const CRYPTO_PAIRS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD'];
function isMarketClosedNow(pairId) {
  if (CRYPTO_PAIRS.includes((pairId || '').toUpperCase())) return false;
  const pktDay = new Date(Date.now() + 5 * 3600 * 1000).getUTCDay(); // 0 = Ittwaar, 6 = Hafta
  return pktDay === 0 || pktDay === 6;
}
function priceFeedStale() { return !!lastUpdateAt && (Date.now() - lastUpdateAt) > 180 * 1000; }
function marketClosedNow(pairId) { return isMarketClosedNow(pairId) || priceFeedStale(); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || ('HTTP ' + r.status));
  return d;
}
function showMsg(t) { document.getElementById('authMsg').textContent = t || ''; }

// v7: Login screen par live market cards (public endpoint — login ki zaroorat nahi)
async function loadPublicPrices() {
  const el = document.getElementById('publicPrices'); if (!el) return;
  try {
    const r = await fetch('/api/public-prices');
    const d = await r.json();
    if (!d.pairs || !d.pairs.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<p class="fine" style="grid-column:1/-1;margin:0">' + esc(t('marketCards')) + '</p>' + d.pairs.map(p => `<div class="price-cell"><div>${esc(p.label)} <span style="color:#8ea0c2;font-size:11px">${p.live ? 'LIVE' : ''}</span></div><b>${fmt(p.price, p.dec)}</b><div style="color:${(p.change24h || 0) >= 0 ? '#3ddc84' : '#ff6b6b'}">${p.change24h == null ? '—' : (p.change24h >= 0 ? '+' : '') + p.change24h.toFixed(2) + '%'}</div></div>`).join('');
  } catch (e) { el.innerHTML = ''; }
}

// v9.1: branded splash screen — once per browser session, overlay only.
// It never blocks init(): the login/setup screen loads underneath while the
// splash shows, and hiding it only removes the overlay (display:none).
const SPLASH_LINES = ['Analyzing Market...', 'Scanning Liquidity & Order Blocks...', 'Checking Gold & Forex...', 'Loading Live Prices...'];
let splashTimers = [];
function splashSeen() { try { return sessionStorage.getItem('ftp_splash_seen') === '1'; } catch (e) { return false; } }
function splashMarkSeen() { try { sessionStorage.setItem('ftp_splash_seen', '1'); } catch (e) {} }
function showSplash() {
  const el = document.getElementById('splash');
  if (!el || splashSeen()) { if (el) el.style.display = 'none'; return; }
  const fill = document.getElementById('splashFill');
  const status = document.getElementById('splashStatus');
  const started = Date.now();
  const DUR = 2500;
  if (status) status.textContent = SPLASH_LINES[0];
  splashTimers.push(setInterval(() => {
    const p = Math.min(100, (Date.now() - started) / DUR * 100);
    if (fill) fill.style.width = p + '%';
    if (p >= 100) hideSplash(false);
  }, 50));
  let i = 0;
  splashTimers.push(setInterval(() => {
    i = (i + 1) % SPLASH_LINES.length;
    if (status) status.textContent = SPLASH_LINES[i];
  }, 650));
}
function hideSplash(now) {
  splashTimers.forEach(clearInterval); splashTimers = [];
  const el = document.getElementById('splash');
  if (!el) return;
  splashMarkSeen();
  if (now) { el.style.display = 'none'; return; }
  el.classList.add('hide');
  setTimeout(() => { el.style.display = 'none'; }, 420);
}

async function init() {
  loadPublicPrices();
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
  priceTimer = null; countdownTimer = null; alertTimer = null;
  lastTerminalSig = null; lastBannerSig = null; lastSignalData = null; priceCells = {};
  document.getElementById('mainScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'block';
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('setupBox').style.display = 'none';
  // v9.3-sec: logout par admin button chhupayein aur purana admin data saaf karein —
  // warna agla login (buyer) purani admin screen dekh sakta hai.
  document.getElementById('adminTabBtn').style.display = 'none';
  document.getElementById('adminCounts').innerHTML = '';
  document.getElementById('adminUsers').innerHTML = '';
  loadPublicPrices();
}
function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'block';
  document.getElementById('helloUser').textContent = t('hello') + ', ' + me.username;
  document.getElementById('roleBadge').textContent = me.role === 'admin' ? 'ADMIN' : (me.plan || 'BUYER');
  // v9.3-sec: Admin button sirf admin ko dikhe — buyer ke liye hamesha chhupayein
  // (pehle sirf admin par show hota tha, buyer par kabhi hide nahi hota tha — admin se
  // logout karke buyer login par button dikhta rehta tha).
  document.getElementById('adminTabBtn').style.display = me.role === 'admin' ? '' : 'none';
  updateAlertButtons();
  updateTgCard();
  updateMonitorUI();
  applyDefaultPair(); // server ka defaultPair (agar local preferred pair nahi hai)
  buildPairSelect();
  buildChartTf();
  showTab('terminal');
  refreshPrices(true);
  loadIndStrip();
  restartPriceTimer();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tickLastUpdate, 1000);
  checkNewSignals();
  if (alertTimer) clearInterval(alertTimer);
  alertTimer = setInterval(checkNewSignals, 30000);
}
// Server ka defaultPair load karein (sirf tab jab user ne apna preferred pair save nahi kiya)
async function applyDefaultPair() {
  if (localStorage.getItem('ftp_pref_pair')) return;
  try {
    const s = await api('/api/settings');
    if (s.settings && s.settings.defaultPair && s.settings.defaultPair !== currentPair) {
      currentPair = s.settings.defaultPair; buildPairSelect();
    }
  } catch (e) {}
}
function buildPairSelect() {
  document.getElementById('pairSelect').innerHTML = PAIR_IDS.map(id =>
    `<button class="${id === currentPair ? 'active' : ''}" onclick="selectPair('${id}')">${id.replace('USD', '/USD')}</button>`).join('');
}
function selectPair(id) { currentPair = id; buildPairSelect(); loadTerminal(); loadIndicators(); loadSmc(); loadTfMatrix(); loadChart(); loadIndStrip(); if (currentTab === 'indicators') initTvChart(); }
function showTab(t) {
  // v9.3-sec: Admin tab sirf admin khol sakta hai — buyer yahan aaye to Terminal par
  // wapas bhej dein aur koi purana admin data bhi na dikhe.
  if (t === 'admin' && (!me || me.role !== 'admin')) {
    document.getElementById('adminCounts').innerHTML = '';
    document.getElementById('adminUsers').innerHTML = '';
    t = 'terminal';
  }
  currentTab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.style.display = 'none');
  document.getElementById('tab-' + t).style.display = 'block';
  if (t === 'terminal') { loadTerminal(); loadChart(); loadIndStrip(); }
  if (t === 'indicators') { loadIndicators(); initTvChart(); }
  if (t === 'smc') { loadSmc(); loadScanner(); loadSmcFeed(); }
  if (t === 'session') { loadSession(); loadNews(); }
  if (t === 'history') { loadHistory(); loadPerf(); loadRefiner(); }
  if (t === 'account') buildAcctSubtabs();
  if (t === 'admin') loadAdmin();
}
let lastPriceMap = {}; // pairId -> {change24h, source, live, type, label} (price card ke liye)
let lastSourcesText = ''; // "Kraken: CONNECTED · Yahoo Finance: RETRY ..." (price card sync line)
let lastKrakenAgeSec = null; // freshness detail ke liye
let lastTfRows = null, lastTfAt = 0, lastTfPair = ''; // /api/tfmatrix cache (HTF + ADX, 60s)
let lastRange = null; // {pdh, pdl} — chart par PDH/PDL lines ke liye
async function refreshPrices(manual, force) {
  const btn = document.getElementById('refreshBtn');
  if (manual) { btn.disabled = true; btn.textContent = t('refreshing'); }
  try {
    const d = await api('/api/prices' + (force ? '?fresh=1' : ''));
    lastUpdateAt = Date.now();
    (d.pairs || []).forEach(p => { lastPriceMap[p.id] = { change24h: p.change24h, source: p.source, live: p.live, type: p.type, label: p.label, price: p.price }; });
    const kr = (d.sources || []).find(s => s.name === 'Kraken');
    lastKrakenAgeSec = kr && kr.ageSec != null ? kr.ageSec : null;
    updatePriceGrid(d.pairs); // v7 perf: cells sirf ek dafa bante hain, phir sirf values update hoti hain
    const lc = document.getElementById('liveCount');
    const lcTxt = 'LIVE ' + d.pairs.filter(p => p.live).length + '/' + d.pairs.length;
    if (lc && lc.textContent !== lcTxt) lc.textContent = lcTxt;
    const ah = document.getElementById('apiHealth');
    const ahTxt = d.sources.map(s => s.name + ': ' + s.status + (s.ageSec != null ? ' (' + s.ageSec + 's)' : '')).join(' · ');
    lastSourcesText = ahTxt;
    if (ah && ah.textContent !== ahTxt) ah.textContent = ahTxt;
    if (currentTab === 'terminal') loadTerminal(true, force);
  } catch (e) { const ah = document.getElementById('apiHealth'); if (ah) ah.textContent = t('priceLoadFail') + ' ' + e.message; }
  if (manual) { btn.disabled = false; btn.textContent = t('refresh'); loadIndStrip(); }
}
// v7 perf: price grid ke cells ek dafa bante hain; har tick par sirf badli hui values likhi jati hain
// (poora grid dobara banana = layout thrash, phone par lag).
function updatePriceGrid(pairs) {
  const grid = document.getElementById('priceList');
  const sig = pairs.map(p => p.id).join(',');
  if (!grid || grid.dataset.built !== sig) {
    if (!grid) return;
    grid.dataset.built = sig;
    grid.innerHTML = pairs.map(p => `<div class="price-cell"><div>${esc(p.label)} <span id="pcl-${p.id}" style="color:#8ea0c2;font-size:11px"></span></div><b id="pcp-${p.id}">—</b><div id="pcc-${p.id}"></div></div>`).join('');
    priceCells = {};
    pairs.forEach(p => { priceCells[p.id] = { price: document.getElementById('pcp-' + p.id), chg: document.getElementById('pcc-' + p.id), live: document.getElementById('pcl-' + p.id) }; });
  }
  pairs.forEach(p => {
    const c = priceCells[p.id]; if (!c || !c.price) return;
    const prev = prevPrices[p.id];
    const arrow = p.price != null && prev != null ? (p.price > prev ? ' ▲' : p.price < prev ? ' ▼' : '') : '';
    const priceTxt = fmt(p.price, p.dec) + arrow;
    if (c.price.textContent !== priceTxt) c.price.textContent = priceTxt;
    if (p.price != null) prevPrices[p.id] = p.price;
    const chg = p.change24h == null ? '—' : (p.change24h >= 0 ? '+' : '') + p.change24h.toFixed(2) + '%';
    if (c.chg && c.chg.textContent !== chg) {
      c.chg.textContent = chg;
      c.chg.style.color = (p.change24h || 0) >= 0 ? '#3ddc84' : '#ff6b6b';
    }
    const liveTxt = p.live ? 'LIVE' : p.source;
    if (c.live && c.live.textContent !== liveTxt) c.live.textContent = liveTxt;
  });
}
function tickLastUpdate() {
  if (!lastUpdateAt) return;
  const s = Math.floor((Date.now() - lastUpdateAt) / 1000);
  const lu = document.getElementById('lastUpdate');
  const luTxt = t('lastUpdate') + ' · ' + s + ' ' + t('secAgo');
  if (lu && lu.textContent !== luTxt) lu.textContent = luTxt;
  // v9.1: price card ki sync line bhi har second taaza rakhein (age + sources)
  // v9.3: band market par sync line ko haath na lagayein — wahan
  // "Market band hai — price aakhri available hai" likha rehta hai (live jaisa na dikhe).
  const pc = document.getElementById('pcSync');
  if (pc && !marketClosedNow(currentPair)) {
    const pcTxt = t('lastUpdate') + ' · ' + s + ' ' + t('secAgo') + (lastSourcesText ? ' · ' + t('pcSources') + ': ' + lastSourcesText : '');
    if (pc.textContent !== pcTxt) pc.textContent = pcTxt;
  }
  // Countdown: monitoring interval ke hisaab se (5/10/15/30s) — sirf tab jab text badle
  let cdTxt = '';
  if (!monitoringOn) cdTxt = t('monitoringOff');
  else if (lastSignalAt) {
    const left = monitorInterval - (Math.floor((Date.now() - lastSignalAt) / 1000) % monitorInterval);
    cdTxt = t('nextCheck') + ' ' + left + 's';
  }
  const cd = document.getElementById('countdown');
  if (cd && cd.textContent !== cdTxt) cd.textContent = cdTxt;
  const mc = document.getElementById('monCountdown');
  if (mc && mc.textContent !== cdTxt) mc.textContent = cdTxt;
  // v9.1 SMC: countdown SMC tab par bhi dikhayein (wahi monitoring countdown)
  const sc = document.getElementById('smcCountdown');
  if (sc && sc.textContent !== cdTxt) sc.textContent = cdTxt;
}
// ---------------- Big BUY/SELL banner (sirf tab dikhata hai jab gate paar ho — logic nahi badalta) ----------------
// v7 perf: banner bhi sirf tab dobara banta hai jab direction/levels badlein.
function renderSignalBanner(d) {
  const el = document.getElementById('signalBanner');
  if (!el) return;
  const bsig = !d || d.error || d.disabled ? 'empty' : [d.direction, d.confluence, d.direction === 'BUY' ? d.buyPlan.trigger : d.direction === 'SELL' ? d.sellPlan.trigger : '', d.direction === 'BUY' ? d.buyPlan.sl : d.direction === 'SELL' ? d.sellPlan.sl : ''].join('|');
  if (lastBannerSig === bsig) return;
  lastBannerSig = bsig;
  if (!d || d.error || d.disabled) { el.innerHTML = ''; return; }
  const pair = currentPair.replace('USD', '/USD');
  if (d.direction === 'BUY') {
    const p = d.buyPlan;
    el.innerHTML = `<div class="signal-banner buy"><div class="sb-title">${esc(t('buyNow'))} — ${esc(pair)}</div>
      <div class="sb-line">${esc(t('bannerLine'))}</div>
      <div class="sb-line">⏱ ${esc(t('bestTimeframe'))}</div>
      <div class="sb-vals">${t('entryZone')}: <b>${fmtPx(currentPair, p.entryZone[0])} – ${fmtPx(currentPair, p.entryZone[1])}</b> · ${t('trigger')}: <b>${fmtPx(currentPair, p.trigger)}</b><br>
      SL: <b>${fmtPx(currentPair, p.sl)}</b> · TP1: <b>${fmtPx(currentPair, p.tp1)}</b> · TP2: <b>${fmtPx(currentPair, p.tp2)}</b> · TP3: <b>${fmtPx(currentPair, p.tp3)}</b><br>
      ${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  } else if (d.direction === 'SELL') {
    const p = d.sellPlan;
    el.innerHTML = `<div class="signal-banner sell"><div class="sb-title">${esc(t('sellNow'))} — ${esc(pair)}</div>
      <div class="sb-line">${esc(t('bannerLine'))}</div>
      <div class="sb-line">⏱ ${esc(t('bestTimeframe'))}</div>
      <div class="sb-vals">${t('entryZone')}: <b>${fmtPx(currentPair, p.entryZone[0])} – ${fmtPx(currentPair, p.entryZone[1])}</b> · ${t('trigger')}: <b>${fmtPx(currentPair, p.trigger)}</b><br>
      SL: <b>${fmtPx(currentPair, p.sl)}</b> · TP1: <b>${fmtPx(currentPair, p.tp1)}</b> · TP2: <b>${fmtPx(currentPair, p.tp2)}</b> · TP3: <b>${fmtPx(currentPair, p.tp3)}</b><br>
      ${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  } else {
    el.innerHTML = `<div class="signal-banner wait"><div class="sb-title">${esc(t('waitNoTrade'))} — ${esc(pair)}</div>
      <div class="sb-line">${t('confluence')}: <b>${d.confluence}%</b> (${t('gate')} 85%)</div></div>`;
  }
}

// ---------------- v8: Plain-language gate labels + marks (display only — numbers/logic nahi badalte) ----------------
// Server ke technical gate/part naam -> saaf Roman Urdu matlab. ✓ = poore points, ◐ = aadhe, ✗ = zero.
const GATE_PLAIN = {
  'Indicator Trend (BUY)': 'gateLblTrendUp',
  'Indicator Trend (SELL)': 'gateLblTrendDown',
  'Structure Swing': 'gateLblStructure',
  'RSI Recovery': 'gateLblRsi',
  'R/R Geometry': 'gateLblRr',
  'Macro EMA200': 'gateLblEma200',
  'Data Freshness': 'gateLblFresh',
  'Liquidity Sweep': 'smcLblSweep',
  'Market Structure': 'smcLblStructure',
  'Order Block': 'smcLblOb',
  'FVG': 'smcLblFvg',
  'Risk & Reward': 'smcLblRr',
};
function gateMark(points, max) {
  if (points >= max) return '<span class="chk-ok">✓</span>';
  if (points > 0) return '<span class="chk-na">◐</span>';
  return '<span class="chk-no">✗</span>';
}
function gateRowHtml(name, points, max) {
  const pk = GATE_PLAIN[name];
  const lbl = pk ? esc(name) + ' — ' + esc(t(pk)) : esc(name);
  return `<div class="gate"><span>${lbl}</span><span>${gateMark(points, max)} ${points}/${max}</span></div>`;
}
// "Ye trade kyun?" — BUY/SELL signal ki 3-4 asal wajah (sirf is signal ke real data se)
function whyTradeHtml(d) {
  const dir = d.direction;
  if (dir === 'WAIT') return '';
  const gates = dir === 'BUY' ? (d.buyGates || []) : (d.sellGates || []);
  const reasons = [];
  const trend = gates.find(g => g.name.indexOf('Indicator Trend') === 0);
  if (trend && trend.points >= 8) reasons.push(esc(t('whyTrend')) + ' — ' + esc(t(dir === 'BUY' ? 'gateLblTrendUp' : 'gateLblTrendDown')) + ' ✓ (' + trend.points + '/' + trend.max + ')');
  if (d.tradeZone) {
    const z = d.tradeZone;
    const inZ = d.price >= z.low && d.price <= z.high;
    reasons.push(esc(inZ ? t('whyZone') : t('whyZoneNear')) + ' — ' + esc(z.type + ' ' + fmtPx(currentPair, z.low) + ' – ' + fmtPx(currentPair, z.high)));
  } else if (d.smc) {
    const s = d.smc;
    const inDz = s.demandZone && d.price >= s.demandZone[0] && d.price <= s.demandZone[1];
    const inSz = s.supplyZone && d.price >= s.supplyZone[0] && d.price <= s.supplyZone[1];
    if (dir === 'BUY' && inDz) reasons.push(esc(t('whyZone')) + ' — ' + esc(t('demandZone') + ' ' + fmtPx(currentPair, s.demandZone[0]) + ' – ' + fmtPx(currentPair, s.demandZone[1])));
    else if (dir === 'SELL' && inSz) reasons.push(esc(t('whyZone')) + ' — ' + esc(t('supplyZone') + ' ' + fmtPx(currentPair, s.supplyZone[0]) + ' – ' + fmtPx(currentPair, s.supplyZone[1])));
  }
  if (d.smc && d.smc.score >= 80) reasons.push(esc(t('whySmcHigh')) + ' (' + d.smc.score + '/100)');
  if (d.smc && d.smc.bosDir) {
    if (dir === 'BUY' && d.smc.bosDir === 'up') reasons.push(esc(t('bosUp')));
    else if (dir === 'SELL' && d.smc.bosDir === 'down') reasons.push(esc(t('bosDown')));
  }
  const others = gates.filter(g => g !== trend && g.points > 0).sort((a, b) => (b.points / b.max) - (a.points / a.max));
  if (others.length && reasons.length < 4) {
    const g = others[0];
    const pk = GATE_PLAIN[g.name];
    reasons.push(esc(t('whyTopGate')) + ': ' + esc(pk ? t(pk) : g.name) + ' ' + g.points + '/' + g.max);
  }
  const list = reasons.slice(0, 4);
  if (!list.length) return '';
  return `<div class="why-box"><h4>✅ ${t('whyTradeTitle')}</h4><ul>${list.map(r => '<li>' + r + '</li>').join('')}</ul></div>`;
}

// ---------------- SMC confluence checklist (sirf asal SMC data se — koi checkmark banaya nahi jata) ----------------
function smcChecklistHtml(d) {
  const s = d.smc;
  if (!s) return '<p>' + esc(t('smcNoData')) + '</p>';
  const dir = d.direction;
  // Zone-blocked WAIT: checklist ko us direction se check karo jo block hui (warna WAIT par sab '–' dikhega)
  const chkDir = dir !== 'WAIT' ? dir : (d.zoneBlocked && d.blockedDirection ? d.blockedDirection : 'WAIT');
  const mark = (st) => st === true ? `<span class="chk-ok">${esc(t('chkYes'))}</span>` : st === false ? `<span class="chk-no">${esc(t('chkNo'))}</span>` : `<span class="chk-na">${esc(t('chkNa'))}</span>`;
  const row = (label, plainKey, st, detail) => `<div class="gate"><span>${esc(label)}${plainKey ? ' — ' + esc(t(plainKey)) : ''}</span><span>${mark(st)} ${detail}</span></div>`;
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
    obDetail = esc(fmtPx(currentPair, ob.low) + ' – ' + fmtPx(currentPair, ob.high) + ' (' + t(ob.mitigated ? 'mitigated' : 'fresh') + ')');
  } else obDetail = esc(t('noObDir'));
  // 3. FVG — BUY ke liye bullish gap, SELL ke liye bearish gap
  const fvgs = chkDir === 'BUY' ? (s.fvgs || []).filter(f => f.type === 'Bullish')
    : chkDir === 'SELL' ? (s.fvgs || []).filter(f => f.type === 'Bearish') : (s.fvgs || []);
  let fvgSt = chkDir === 'WAIT' ? null : false, fvgDetail;
  if (fvgs.length) {
    fvgSt = chkDir === 'WAIT' ? null : true;
    fvgDetail = esc(fvgs.length + ' × ' + fvgs[0].type + ' ' + fmtPx(currentPair, fvgs[0].low) + ' – ' + fmtPx(currentPair, fvgs[0].high));
  } else fvgDetail = esc(t('noFvgDir'));
  // 4. Support / Resistance + structure break (BOS)
  let srSt = null;
  if (chkDir === 'BUY') srSt = s.bosDir === 'up' ? true : s.bosDir === 'down' ? false : null;
  else if (chkDir === 'SELL') srSt = s.bosDir === 'down' ? true : s.bosDir === 'up' ? false : null;
  const srTxt = s.bosDir === 'up' ? t('bosUp') : s.bosDir === 'down' ? t('bosDown') : t('noBreak');
  const srDetail = esc(t('swingLow') + ' ' + fmtPx(currentPair, s.swingLow) + ' · ' + t('swingHigh') + ' ' + fmtPx(currentPair, s.swingHigh) + ' — ' + srTxt);
  // 5. Zones — trade zone (agar hai) + price us me / ke qareeb hai ya nahi; warna demand/supply zones
  const atr = d.atr14 || 0;
  let zoneSt = null, zoneDetail;
  if (d.tradeZone) {
    const z = d.tradeZone;
    const inZ = d.price >= z.low && d.price <= z.high;
    const nearZ = !inZ && Math.abs(d.price - (chkDir === 'BUY' ? z.high : z.low)) <= atr;
    const zoneTxt = inZ ? t('inZone') : nearZ ? t('nearZone') : t('farZone');
    zoneSt = inZ || nearZ;
    zoneDetail = esc(t('tradeZone') + ': ' + z.type + ' ' + fmtPx(currentPair, z.low) + ' – ' + fmtPx(currentPair, z.high) + ' — ' + zoneTxt);
  } else {
    const inDz = s.demandZone && d.price >= s.demandZone[0] && d.price <= s.demandZone[1];
    const inSz = s.supplyZone && d.price >= s.supplyZone[0] && d.price <= s.supplyZone[1];
    const nearDz = s.demandZone && !inDz && Math.min(Math.abs(d.price - s.demandZone[0]), Math.abs(d.price - s.demandZone[1])) <= atr;
    const nearSz = s.supplyZone && !inSz && Math.min(Math.abs(d.price - s.supplyZone[0]), Math.abs(d.price - s.supplyZone[1])) <= atr;
    let zoneTxt;
    if (inDz || nearDz) { zoneTxt = t(inDz ? 'inDemand' : 'nearDemand'); zoneSt = chkDir === 'BUY' ? true : chkDir === 'SELL' ? false : null; }
    else if (inSz || nearSz) { zoneTxt = t(inSz ? 'inSupply' : 'nearSupply'); zoneSt = chkDir === 'SELL' ? true : chkDir === 'BUY' ? false : null; }
    else { zoneTxt = chkDir === 'WAIT' ? t('noZone') : t('noZoneDir'); zoneSt = chkDir === 'WAIT' ? null : false; }
    zoneDetail = esc(zoneTxt + ' — ' + t('demandZone') + ' ' + (s.demandZone ? fmtPx(currentPair, s.demandZone[0]) + ' – ' + fmtPx(currentPair, s.demandZone[1]) : '—') + ' · ' + t('supplyZone') + ' ' + (s.supplyZone ? fmtPx(currentPair, s.supplyZone[0]) + ' – ' + fmtPx(currentPair, s.supplyZone[1]) : '—'));
  }
  return `<h4>${t('smcChecklist')} — ${t('smcScore')}: ${s.score}/100 (${t('gate')} 80%)</h4>` +
    row(t('chkSweep'), 'chkLblSweep', sweepSt, sweepDetail) +
    row(t('chkOB'), 'chkLblOb', obSt, obDetail) +
    row(t('chkFvg'), 'chkLblFvg', fvgSt, fvgDetail) +
    row(t('chkSR'), 'chkLblSr', srSt, srDetail) +
    row(t('chkZones'), 'chkLblZones', zoneSt, zoneDetail);
}

// ---------------- v4 Extended confluence panel (sirf display — asal 1H candles se, koi value banayi nahi jati) ----------------
function extendedConfluenceHtml(d) {
  const x = d.extended;
  if (!x) return '';
  const dir = d.direction;
  const chkDir = dir !== 'WAIT' ? dir : (d.zoneBlocked && d.blockedDirection ? d.blockedDirection : 'WAIT');
  const mark = (st) => st === true ? `<span class="chk-ok">${esc(t('chkYes'))}</span>` : st === false ? `<span class="chk-no">${esc(t('chkNo'))}</span>` : `<span class="chk-na">${esc(t('chkNa'))}</span>`;
  const row = (label, plainKey, st, detail) => `<div class="gate"><span>${esc(label)}${plainKey ? ' — ' + esc(t(plainKey)) : ''}</span><span>${mark(st)} ${detail}</span></div>`;
  const dirMatch = (sigDir) => (chkDir === 'WAIT' || !sigDir) ? null : sigDir === chkDir;
  let html = `<h4>${t('extTitle')}</h4>`;
  // 1. Candlestick pattern (1H)
  let cSt = null, cDetail = esc(t('noPattern'));
  if (x.candle) {
    const patKey = { bullEngulf: 'patBullEngulf', bearEngulf: 'patBearEngulf', hammer: 'patHammer', shootingStar: 'patShootingStar', doji: 'patDoji', morningStar: 'patMorningStar', eveningStar: 'patEveningStar' }[x.candle.code] || null;
    cDetail = esc(patKey ? t(patKey) : x.candle.code);
    cSt = x.candle.direction === 'NEUTRAL' ? null : dirMatch(x.candle.direction);
  }
  html += row(t('chkCandle'), 'extLblCandle', cSt, cDetail);
  // 2. CHOCH
  let chSt = null, chDetail = esc(t('noChoch'));
  if (x.choch && x.choch.found) {
    chDetail = esc(x.choch.dir === 'up' ? t('chochUp') : t('chochDown'));
    chSt = dirMatch(x.choch.dir === 'up' ? 'BUY' : 'SELL');
  }
  html += row(t('chkChoch'), 'extLblChoch', chSt, chDetail);
  // 3. MSS
  let mSt = null, mDetail = esc(t('noMss'));
  if (x.mss && x.mss.found) {
    mDetail = esc(x.mss.dir === 'up' ? t('mssUp') : t('mssDown'));
    mSt = dirMatch(x.mss.dir === 'up' ? 'BUY' : 'SELL');
  }
  html += row(t('chkMss'), 'extLblMss', mSt, mDetail);
  // 4. Breaker / mitigation blocks
  let bSt = null, bDetail = esc(t('noBreaker'));
  if (x.breakers && x.breakers.length) {
    const bl = x.breakers[0];
    const blTxt = (bl.type === 'Breaker' ? t('breakerLbl') : t('mitigationLbl')) + ' (' + bl.dir + ') ' + fmtPx(currentPair, bl.low) + ' – ' + fmtPx(currentPair, bl.high);
    bDetail = esc(blTxt + (x.breakers.length > 1 ? ' · +' + (x.breakers.length - 1) : ''));
    bSt = dirMatch(bl.dir);
  }
  html += row(t('chkBreaker'), 'extLblBreaker', bSt, bDetail);
  // 5. IDM
  let iSt = null, iDetail = esc(t('noIdm'));
  if (x.idm && x.idm.found) {
    iDetail = esc(x.idm.side === 'SSL' ? t('idmSsl') : t('idmBsl'));
    iSt = dirMatch(x.idm.side === 'SSL' ? 'BUY' : 'SELL');
  }
  html += row(t('chkIdm'), 'extLblIdm', iSt, iDetail);
  // 6. Fibonacci
  let fDetail = '—';
  if (x.fib && x.fib.nearest) fDetail = esc(t('fibNearest') + ': ' + x.fib.nearest.label + ' @ ' + fmtPx(currentPair, x.fib.nearest.price) + ' (High ' + fmtPx(currentPair, x.fib.high) + ' / Low ' + fmtPx(currentPair, x.fib.low) + ')');
  html += row(t('chkFib'), 'extLblFib', null, fDetail);
  // 7. Bollinger squeeze
  let bbDetail = '—';
  if (x.bollinger) bbDetail = esc((x.bollinger.squeeze ? t('squeezeOn') : t('squeezeOff')) + ' · Bandwidth ' + x.bollinger.bandwidthPct + '% · %B ' + x.bollinger.percentB);
  html += row(t('chkBb'), 'extLblBb', null, bbDetail);
  // 8. MACD divergence
  let mdSt = null, mdDetail = esc(t('noMacdDiv'));
  if (x.macdDiv && x.macdDiv.found) {
    mdDetail = esc(x.macdDiv.type === 'bullish' ? t('macdBullDiv') : t('macdBearDiv'));
    mdSt = dirMatch(x.macdDiv.type === 'bullish' ? 'BUY' : 'SELL');
  }
  html += row(t('chkMacdDiv'), 'extLblMacdDiv', mdSt, mdDetail);
  // 9. Mean reversion
  let mrDetail = '—';
  if (x.meanRev) {
    const lbl = x.meanRev.label === 'near' ? t('meanNear') : x.meanRev.label === 'extended' ? t('meanExtended') : t('meanOver');
    mrDetail = esc('EMA20 se ' + Math.abs(x.meanRev.distATR) + ' ATR ' + t(x.meanRev.side === 'above' ? 'aboveMean' : 'belowMean') + ' — ' + lbl + (x.meanRev.percentB != null ? ' · %B ' + x.meanRev.percentB : ''));
  }
  html += row(t('chkMeanRev'), 'extLblMeanRev', null, mrDetail);
  // 10. Killzone
  let kzDetail = '—';
  if (x.killzone) {
    const kzName = (code) => code === 'asian' ? t('kzAsian') : code === 'london' ? t('kzLondon') : t('kzNewYork');
    if (x.killzone.active) kzDetail = esc(t('killActive') + ': ' + kzName(x.killzone.active) + ' ' + fmtHour12(x.killzone.activeStart) + '–' + fmtHour12(x.killzone.activeEnd) + ' UTC (' + fmtHour12((x.killzone.activeStart + 5) % 24) + '–' + fmtHour12((x.killzone.activeEnd + 5) % 24) + ' PKT)');
    else kzDetail = esc(t('killNext') + ': ' + kzName(x.killzone.next) + ' ' + fmtHour12(x.killzone.nextStart) + ' UTC (' + fmtHour12((x.killzone.nextStart + 5) % 24) + ' PKT) — ' + x.killzone.nextInMin + ' min');
  }
  html += row(t('chkKillzone'), 'extLblKillzone', null, kzDetail);
  // 11. Asian range
  let aSt = null, aDetail = esc(t('noAsian'));
  if (x.asian) {
    const exp = x.asian.expanded;
    aDetail = esc(fmtPx(currentPair, x.asian.low) + ' – ' + fmtPx(currentPair, x.asian.high) + ' — ' + t(exp === 'above' ? 'asianAbove' : exp === 'below' ? 'asianBelow' : 'asianIn'));
    aSt = exp === 'above' ? dirMatch('BUY') : exp === 'below' ? dirMatch('SELL') : null;
  }
  html += row(t('chkAsian'), 'extLblAsian', aSt, aDetail);
  // 12. VWAP bands
  let vDetail = '—';
  if (x.vwapBands && x.vwapBands.nearest) vDetail = esc(t('vwapNearest') + ': ' + x.vwapBands.nearest.label + ' @ ' + fmtPx(currentPair, x.vwapBands.nearest.price) + ' · VWAP ' + fmtPx(currentPair, x.vwapBands.vwap));
  html += row(t('chkVwap'), 'extLblVwap', null, vDetail);
  // 13. Volume
  let volDetail = esc(t('volNa'));
  if (x.volume && x.volume.available) {
    const vt = x.volume.trend === 'rising' ? t('volRising') : x.volume.trend === 'falling' ? t('volFalling') : t('volNormal');
    volDetail = esc(vt + ' — ' + x.volume.ratio + '× avg (20)');
  }
  html += row(t('chkVol'), 'extLblVol', null, volDetail);
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
  ${esc(t('riskTp1'))}<br>${esc(t('riskSize'))}<br>${esc(t('riskDd'))}<br>${esc(t('riskProfileLine'))}: ${esc(riskProfileText())}</div>`;
}

// ---------------- Copy Signal + Download Signal Image (branded share) ----------------
// Signal ka ek standard shape: Terminal plan aur History row dono isi me convert hote hain.
// Copy text aur card image hamesha dikhaye gaye asal Entry/SL/TP/score/time se bante hain — koi value banayi nahi jati.
let currentSignal = null; // Terminal ka active signal (sirf jab BUY/SELL plan ho, WAIT par null)
let histSignals = []; // History ke recorded signals (loadHistory se bharta hai)
let smcFeedSignals = []; // SMC feed ke recorded confirmations (loadSmcFeed se bharta hai)

function fmtPktTime(ms) {
  try { return new Date(ms).toLocaleString('en-US', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
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
// v9.6.2: Live TP / Break-Even / DCA / Monitoring rows — sirf live price se (koi value banayi nahi jati).
// BUY: price >= TP → HIT; SELL: price <= TP → HIT. Break-Even Active sirf jab TP1 HIT ho (+1R) —
// tab buyer SL ko entry par le ja sakta hai. DCA engine me nahi hai, is liye hamesha "Not Activated".
// Monitoring: pair ki live price + aakhri price update se guzre seconds.
function tpHitNow(direction, price, tp) {
  if (price == null || tp == null || isNaN(price) || isNaN(tp)) return false;
  return direction === 'BUY' ? price >= tp : price <= tp;
}
function tpStatusText(direction, price, tp) {
  return tpHitNow(direction, price, tp) ? '✓ ' + t('hit') : t('pending');
}
function beStatusText(direction, price, tp1) {
  return tpHitNow(direction, price, tp1) ? t('beActive') : t('beNotYet');
}
// Live price ek signal ke pair ke liye: price feed se (lastPriceMap), warna last signal data se.
function livePriceFor(pair) {
  const info = lastPriceMap[pair];
  if (info && info.price != null) return info.price;
  if (lastSignalData && lastSignalData.price != null && pair === currentPair) return lastSignalData.price;
  return null;
}
function priceAgeSec() {
  return lastUpdateAt ? Math.floor((Date.now() - lastUpdateAt) / 1000) : null;
}
function statusSpanHtml(id, hit) {
  return '<span id="' + id + '" class="' + (hit ? 'buy' : 'fine') + '">' + (hit ? '<b>✓ ' + esc(t('hit')) + '</b>' : esc(t('pending'))) + '</span>';
}
// Terminal plan card ki live status rows (BUY/SELL plan par hi banti hain — WAIT par plan nahi hota).
function liveStatusRowsHtml(d, plan) {
  const dir = d.direction;
  const price = d.price;
  const tp1Hit = tpHitNow(dir, price, plan.tp1);
  const tp2Hit = tpHitNow(dir, price, plan.tp2);
  const tp3Hit = tpHitNow(dir, price, plan.tp3);
  const age = priceAgeSec();
  const be = tp1Hit
    ? '<span id="beSt" class="buy"><b>' + esc(t('beActive')) + '</b></span>'
    : '<span id="beSt" class="fine">' + esc(t('beNotYet')) + '</span>';
  return t('tpStatusLbl') + ': TP1 ' + statusSpanHtml('tpSt1', tp1Hit) + ' · TP2 ' + statusSpanHtml('tpSt2', tp2Hit) + ' · TP3 ' + statusSpanHtml('tpSt3', tp3Hit) + '<br>'
    + t('beLbl') + ': ' + be + '<br>'
    + t('dcaLbl') + ': <span class="fine">' + esc(t('dcaNotActive')) + '</span><br>'
    + t('monLbl') + ': <b id="monPrice">' + (price == null ? '—' : fmtPx(currentPair, price)) + '</b> · <span id="monAge" class="fine">' + (age == null ? '—' : age + ' ' + esc(t('secAgo'))) + '</span><br>';
}
function buildSignalText(sig) {
  const s = signalToShare(sig);
  const emoji = s.direction === 'BUY' ? '🟢' : '🔴';
  const lines = [
    emoji + ' ' + s.pair + ' ' + s.direction,
    'Entry: ' + fmtPx(s.pair, s.entry),
    'SL: ' + fmtPx(s.pair, s.sl),
    'TP1: ' + fmtPx(s.pair, s.tp1) + ' | TP2: ' + fmtPx(s.pair, s.tp2) + ' | TP3: ' + fmtPx(s.pair, s.tp3),
  ];
  if (s.score != null) lines.push('Score: ' + s.score + '%' + (s.rr ? ' · R:R ' + s.rr : ''));
  // v9.6.2: card wali chaar rows — wahi values, live price se (price na mile to Pending/Not yet — HIT kabhi claim nahi hota).
  const livePrice = livePriceFor(s.pair);
  const age = priceAgeSec();
  lines.push(t('tpStatusLbl') + ': TP1 ' + tpStatusText(s.direction, livePrice, s.tp1) + ' · TP2 ' + tpStatusText(s.direction, livePrice, s.tp2) + ' · TP3 ' + tpStatusText(s.direction, livePrice, s.tp3));
  lines.push(t('beLbl') + ': ' + beStatusText(s.direction, livePrice, s.tp1));
  lines.push(t('dcaLbl') + ': ' + t('dcaNotActive'));
  lines.push(t('monLbl') + ': ' + (livePrice == null ? '—' : fmtPx(s.pair, livePrice) + ' · ' + (age == null ? '—' : age + ' ' + t('secAgo'))));
  lines.push('Forex Trading Pro · ' + fmtPktTime(s.time) + ' PKT');
  return lines.join('\n');
}
async function copySignal(sig) {
  if (!sig) return;
  const ok = await copyTextToClipboard(buildSignalText(sig));
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
    ['Entry', fmtPx(s.pair, s.entry), '#e8ecf5'],
    ['SL', fmtPx(s.pair, s.sl), '#ff6b6b'],
    ['TP1', fmtPx(s.pair, s.tp1), '#3ddc84'],
    ['TP2', fmtPx(s.pair, s.tp2), '#3ddc84'],
    ['TP3', fmtPx(s.pair, s.tp3), '#3ddc84'],
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

// ---------------- v7: Big signal-arrival pop-up (toast se bara, sound ke saath) ----------------
// Modal pehle se HTML me hai (display:none) — sirf khulta/band hota hai, har dafa DOM nahi banta.
function showSignalPopup(sig) {
  const s = signalToShare(sig);
  popupSignal = s;
  const el = document.getElementById('signalPopupBody');
  if (!el) return;
  const dirCls = s.direction === 'BUY' ? 'buy' : 'sell';
  el.innerHTML = `<div class="signal-banner ${dirCls}" style="margin:0 0 10px"><div class="sb-title">${esc(t('newSignalPopup'))}</div>
    <div class="sb-line">${esc(s.pair)} — <b>${s.direction}</b></div>
    <div class="sb-line">⏱ ${esc(t('bestTimeframe'))}</div>
    <div class="sb-vals">Entry: <b>${fmtPx(s.pair, s.entry)}</b><br>SL: <b>${fmtPx(s.pair, s.sl)}</b> · TP1: <b>${fmtPx(s.pair, s.tp1)}</b> · TP2: <b>${fmtPx(s.pair, s.tp2)}</b> · TP3: <b>${fmtPx(s.pair, s.tp3)}</b><br>${s.score != null ? t('confluence') + ': <b>' + s.score + '%</b>' : ''}${s.rr ? ' · R:R ' + esc(s.rr) : ''}</div></div>
    <p class="fine">${esc(t('shareDisclaimer'))}</p>`;
  const m = document.getElementById('signalPopup');
  if (m) m.style.display = 'flex';
}
function closeSignalPopup() { const m = document.getElementById('signalPopup'); if (m) m.style.display = 'none'; }
function copyPopupSignal() { if (popupSignal) copySignal(popupSignal); }
function downloadPopupSignal() { if (popupSignal) downloadSignalImage(popupSignal); }

// ---------------- v7: Branded Share Card modal ----------------
// Portrait card (HTML preview + 1080x1350 canvas PNG). Status sirf recorded outcome se:
// Win -> TP1 HIT, Loss -> SL HIT, Break-Even -> TP1 HIT + trade band, baaki sab PENDING.
function shareStatusOf(level, s) {
  if (s.outcome === 'Win') return level === 'tp1' ? t('hit') : t('pending');
  if (s.outcome === 'Loss') return level === 'sl' ? t('hit') : t('pending');
  if (s.outcome === 'Break-Even') return level === 'tp1' ? t('hit') : t('pending');
  return t('pending');
}
function timelineDone(s) {
  const done = [true, true, false, false, false, false];
  if (s.outcome === 'Win' || s.outcome === 'Break-Even') done[2] = true;
  if (s.outcome === 'Loss' || s.outcome === 'Break-Even') done[5] = true;
  return done;
}
function buildFormattedShareText(s) {
  const emoji = s.direction === 'BUY' ? '🟢' : '🔴';
  return [
    '*' + s.pair + ' ' + s.direction + '* ' + emoji,
    'Signal: ' + (s.code || s.id || ''),
    'Entry: ' + fmtPx(s.pair, s.entry),
    'SL: ' + fmtPx(s.pair, s.sl),
    'TP1: ' + fmtPx(s.pair, s.tp1) + ' | TP2: ' + fmtPx(s.pair, s.tp2) + ' | TP3: ' + fmtPx(s.pair, s.tp3),
    'Score: ' + (s.score != null ? s.score + '%' : '—') + (s.rr ? ' | R:R ' + s.rr : ''),
    'DCA: TP1 par 50% profit lo.',
    'Breakeven: TP1 ke baad SL entry par.',
    'Forex Trading Pro · ' + fmtPktTime(s.time) + ' PKT',
    'Koi signal 100% profitable nahi hota.',
  ].join('\n');
}
function openShareCard(sig) {
  if (!sig) return;
  const s = signalToShare(sig);
  shareSignal = { ...s, id: sig.id || '', code: sig.signalCode || sig.code || sig.id || '', outcome: sig.outcome || 'In-Flight', engine: sig.engine || 'terminal', smcScore: sig.smcScore != null ? sig.smcScore : null };
  renderSharePreview();
  const m = document.getElementById('shareModal');
  if (m) m.style.display = 'flex';
}
function openShareCardTerminal() { if (currentSignal) openShareCard(currentSignal); }
function closeShareModal() { const m = document.getElementById('shareModal'); if (m) m.style.display = 'none'; }
function renderSharePreview() {
  const s = shareSignal; if (!s) return;
  const isBuy = s.direction === 'BUY';
  const box = (label, val, cls, level) => `<div class="share-box"><div class="share-box-label">${esc(label)}</div><div class="share-box-val ${cls}">${fmtPx(s.pair, val)}</div><div class="share-box-status">${esc(shareStatusOf(level, s))}</div></div>`;
  const done = timelineDone(s);
  const steps = [t('stepSignal'), t('stepEntry'), t('stepTp1'), t('stepTp2'), t('stepTp3'), t('stepDone')];
  const pv = document.getElementById('shareCardPreview');
  if (pv) pv.innerHTML =
    `<div class="share-card">
      <div class="share-card-brand">FOREX TRADING PRO</div>
      <div class="share-card-pair">${esc(s.pair)}</div>
      <div class="share-card-dir ${isBuy ? 'buy' : 'sell'}">${s.direction}</div>
      <div class="share-card-code">${esc(s.code || s.id || '')}</div>
      <div class="share-boxes">
        ${box(t('entry'), s.entry, '', 'entry')}
        ${box('SL', s.sl, 'sell', 'sl')}
        ${box('TP1', s.tp1, 'buy', 'tp1')}
        ${box('TP2', s.tp2, 'buy', 'tp2')}
        ${box('TP3', s.tp3, 'buy', 'tp3')}
      </div>
      <p>${t('confluenceLbl')}: <b>${s.score != null ? s.score + '%' : '—'}</b>${s.rr ? ' · R:R ' + esc(s.rr) : ''}${s.smcScore != null ? ' · SMC ' + s.smcScore + '/100' : ''}</p>
      <p class="fine">${esc(t('dcaNote'))}<br>${esc(t('breakevenNote'))}</p>
      <h4>${t('progression')}</h4>
      <div class="share-timeline">${steps.map((st, i) => `<span class="${done[i] ? 'tl-done' : 'tl-pend'}">${done[i] ? '✓' : '○'} ${esc(st)}</span>`).join('')}</div>
      <p class="fine">${fmtPktTime(s.time)} PKT · ${esc(t('shareDisclaimer'))}</p>
    </div>`;
  const tp = document.getElementById('shareTextPreview');
  if (tp) tp.textContent = buildFormattedShareText(s);
}
// Portrait share card 1080x1350 (v5 ke square card se lamba — asal data se)
function drawShareCardPng(s) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const isBuy = s.direction === 'BUY';
  const accent = isBuy ? '#3ddc84' : '#ff6b6b';
  ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, W, H);
  roundRectPath(ctx, 36, 36, W - 72, H - 72, 32);
  ctx.fillStyle = '#111a30'; ctx.fill();
  ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#f5c542'; ctx.fillRect(36, 36, W - 72, 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c542'; ctx.font = '800 40px Arial, sans-serif';
  ctx.fillText('FOREX TRADING PRO', W / 2, 128);
  ctx.fillStyle = '#e8ecf5'; ctx.font = '800 96px Arial, sans-serif';
  ctx.fillText(s.pair, W / 2, 252);
  ctx.font = '800 64px Arial, sans-serif';
  const bw = ctx.measureText(s.direction).width + 90;
  roundRectPath(ctx, (W - bw) / 2, 288, bw, 92, 46);
  ctx.fillStyle = accent; ctx.fill();
  ctx.fillStyle = isBuy ? '#0a0f1e' : '#ffffff';
  ctx.fillText(s.direction, W / 2, 352);
  ctx.fillStyle = '#8ea0c2'; ctx.font = '400 30px Arial, sans-serif';
  ctx.fillText(s.code || s.id || '', W / 2, 428);
  const rows = [
    ['Entry', fmtPx(s.pair, s.entry), '#e8ecf5', 'entry'],
    ['SL', fmtPx(s.pair, s.sl), '#ff6b6b', 'sl'],
    ['TP1', fmtPx(s.pair, s.tp1), '#3ddc84', 'tp1'],
    ['TP2', fmtPx(s.pair, s.tp2), '#3ddc84', 'tp2'],
    ['TP3', fmtPx(s.pair, s.tp3), '#3ddc84', 'tp3'],
  ];
  let y = 500;
  rows.forEach((row, i) => {
    ctx.textAlign = 'left'; ctx.font = '700 40px Arial, sans-serif'; ctx.fillStyle = '#8ea0c2';
    ctx.fillText(row[0], 100, y);
    ctx.textAlign = 'right'; ctx.font = '800 44px Arial, sans-serif'; ctx.fillStyle = row[2];
    ctx.fillText(row[1] + '  ·  ' + shareStatusOf(row[3], s), W - 100, y);
    y += 74;
    if (i < rows.length - 1) { ctx.fillStyle = '#22304d'; ctx.fillRect(100, y - 26, W - 200, 2); }
  });
  ctx.textAlign = 'center';
  ctx.font = '700 38px Arial, sans-serif'; ctx.fillStyle = '#f5c542';
  ctx.fillText('Score: ' + (s.score != null ? s.score + '%' : '—') + (s.rr ? '   ·   R:R ' + s.rr : ''), W / 2, y + 10);
  y += 70;
  ctx.font = '400 30px Arial, sans-serif'; ctx.fillStyle = '#8ea0c2';
  ctx.fillText('DCA: TP1 par 50% lo, baaki TP2/TP3 tak.', W / 2, y);
  y += 44;
  ctx.fillText('Breakeven: TP1 ke baad SL entry par.', W / 2, y);
  y += 64;
  ctx.font = '700 32px Arial, sans-serif'; ctx.fillStyle = '#f5c542';
  ctx.fillText(t('progression'), W / 2, y);
  y += 48;
  const steps = [t('stepSignal'), t('stepEntry'), t('stepTp1'), t('stepTp2'), t('stepTp3'), t('stepDone')];
  const done = timelineDone(s);
  ctx.font = '400 30px Arial, sans-serif';
  steps.forEach((st, i) => {
    const col = i % 3, rowi = Math.floor(i / 3);
    const cx = 150 + col * 330, cy = y + rowi * 52;
    ctx.textAlign = 'left';
    ctx.fillStyle = done[i] ? '#3ddc84' : '#8ea0c2';
    ctx.fillText((done[i] ? '✓ ' : '○ ') + st, cx, cy);
  });
  y += 130;
  ctx.textAlign = 'center';
  ctx.font = '400 30px Arial, sans-serif'; ctx.fillStyle = '#8ea0c2';
  ctx.fillText(fmtPktTime(s.time) + ' PKT', W / 2, y);
  ctx.font = '400 28px Arial, sans-serif';
  ctx.fillText(t('shareDisclaimer'), W / 2, y + 44);
  return cv;
}
function downloadShareCardPng() {
  if (!shareSignal) return;
  const s = shareSignal;
  const name = s.pair + '-' + s.direction + '-share-card.png';
  const done = () => showToast(t('imgDone'), esc(t('imgDoneBody')));
  const fail = () => showToast(t('imgDone'), esc(t('imgFail')));
  try {
    const cv = drawShareCardPng(s);
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
async function copyShareCardImage() {
  if (!shareSignal) return;
  try {
    const cv = drawShareCardPng(shareSignal);
    const blob = await new Promise((res, rej) => {
      if (cv.toBlob) cv.toBlob(b => b ? res(b) : rej(new Error('no blob')), 'image/png');
      else rej(new Error('no toBlob'));
    });
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast(t('imgCopyDone'), esc(t('imgCopyDoneBody')));
    } else { showToast(t('imgCopyFail'), esc(t('imgCopyFailBody'))); }
  } catch (e) { showToast(t('imgCopyFail'), esc(t('imgCopyFailBody'))); }
}
async function copyShareCardText() {
  if (!shareSignal) return;
  const ok = await copyTextToClipboard(buildFormattedShareText(shareSignal));
  showToast(t('copyDone'), esc(ok ? t('copyDoneBody') : t('copyFailBody')));
}

// ---------------- v7: Terminal helpers (price line / Why Wait / Sentiment Wave / Copy WAIT) ----------------
// "Why Wait?" — asal gate breakdown se top failing gates (koi wajah banayi nahi jati)
// WHY WAIT? — adhoore gates ki asal wajah (asal numbers ke saath), zyada se zyada 3 + SMC + zone + HTF/ADX.
function whyWaitHtml(d) {
  const lead = leadGates(d);
  const failing = (lead.gates || []).filter(g => g.points < g.max).sort((a, b) => (b.max - b.points) - (a.max - a.points)).slice(0, 3);
  let rows = failing.map(g => { const pk = GATE_PLAIN[g.name]; return `<div class="gate"><span>${esc(g.name)}${pk ? ' — ' + esc(t(pk)) : ''}</span><span>${gateMark(g.points, g.max)} ${g.points}/${g.max} — ${esc(t('gateNotMet'))}<br><small>${esc(gateDetail(g.name, d, lead.dir, false))}</small></span></div>`; }).join('');
  if (d.smc && d.smc.score < 80) rows += `<div class="gate"><span>SMC Score</span><span>${d.smc.score}/100 — ${esc(t('smcBelowGate'))} (80%)</span></div>`;
  if (d.zoneBlocked) rows += `<div class="gate"><span>${esc(t('tradeZone'))}</span><span>${esc(t('zoneBlockedReason'))}</span></div>`;
  rows += htfAdxRows().rows;
  if (!rows) return '';
  return `<h4>${t('whyWait')}</h4>${rows}`;
}
async function copyWaitAnalysis() {
  const d = lastSignalData; if (!d) return;
  const lead = d.buyScore >= d.sellScore ? { dir: 'BUY', gates: d.buyGates || [], score: d.buyScore } : { dir: 'SELL', gates: d.sellGates || [], score: d.sellScore };
  const failing = (lead.gates || []).filter(g => g.points < g.max).sort((a, b) => (b.max - b.points) - (a.max - a.points)).slice(0, 3);
  const lines = [
    d.pair + ' — WAIT (koi trade nahi)',
    'Confluence: ' + d.confluence + '% (gate 85%)',
    'BUY: ' + d.buyScore + '% · SELL: ' + d.sellScore + '%',
    'Leading: ' + lead.dir + ' ' + lead.score + '%',
  ];
  failing.forEach(g => lines.push('• ' + g.name + ': ' + g.points + '/' + g.max));
  if (d.smc) lines.push('SMC: ' + d.smc.score + '/100 (gate 80%)');
  if (d.zoneBlocked) lines.push('• ' + t('zoneBlockedReason'));
  lines.push('Best timeframe: 1H (4H bhi theek hai) — 15M sirf entry timing.');
  lines.push('Forex Trading Pro · ' + fmtPktTime(Date.now()) + ' PKT');
  const ok = await copyTextToClipboard(lines.join('\n'));
  showToast(t('waitCopyDone'), esc(ok ? t('waitCopyDoneBody') : t('copyFailBody')));
}
// Sentiment Wave: bull/bear bars + Demand/Supply Index + zone corridor — sab asal data se.
// Demand Index = price demand zone ke kitna qareeb hai (0–100); Supply Index us ka ulta.
function sentimentWaveHtml(d) {
  const s = d.sentiment; if (!s) return '';
  const bull = s.bullishPct, bear = s.bearishPct;
  let dIdx = null, sIdx = null;
  if (s.demandZone && s.supplyZone) {
    const lo = s.demandZone[0], hi = s.supplyZone[1];
    if (hi > lo) {
      const pos = Math.max(0, Math.min(1, (d.price - lo) / (hi - lo)));
      dIdx = Math.round((1 - pos) * 100); sIdx = Math.round(pos * 100);
    }
  }
  let corridor = '';
  if (d.range && d.range.pdh > d.range.pdl) {
    const pct = (v) => Math.max(0, Math.min(100, (v - d.range.pdl) / (d.range.pdh - d.range.pdl) * 100));
    const dz = s.demandZone ? `<div class="corr-zone demand" style="left:${pct(s.demandZone[0])}%;width:${Math.max(1, pct(s.demandZone[1]) - pct(s.demandZone[0]))}%"></div>` : '';
    const sz = s.supplyZone ? `<div class="corr-zone supply" style="left:${pct(s.supplyZone[0])}%;width:${Math.max(1, pct(s.supplyZone[1]) - pct(s.supplyZone[0]))}%"></div>` : '';
    corridor = `<div class="corr-track">${dz}${sz}<div class="corr-price" style="left:${pct(d.price)}%"></div></div><p class="fine">PDL ${fmtPx(currentPair, d.range.pdl)} — PDH ${fmtPx(currentPair, d.range.pdh)} · <span style="color:#f5c542">▮</span> = price</p>`;
  }
  return `<h4>${t('sentimentWave')}</h4>
  <div class="sent-bar"><div class="sent-bull" style="width:${bull}%"></div><div class="sent-bear" style="width:${bear}%"></div></div>
  <p>Bullish ${bull}% · Bearish ${bear}% — ${esc(s.label)}</p>
  <p>${t('demandIndex')}: ${dIdx == null ? '—' : dIdx + '/100'} · ${t('supplyIndex')}: ${sIdx == null ? '—' : sIdx + '/100'}</p>
  <p>${t('demandZone')}: ${s.demandZone ? fmtPx(currentPair, s.demandZone[0]) + ' – ' + fmtPx(currentPair, s.demandZone[1]) : '—'} · ${t('supplyZone')}: ${s.supplyZone ? fmtPx(currentPair, s.supplyZone[0]) + ' – ' + fmtPx(currentPair, s.supplyZone[1]) : '—'}</p>
  <h4>${t('zoneCorridor')}</h4>${corridor}
  <p class="fine">${t('sentimentWaveNote')}</p>`;
}

// ---------------- v9.1: new terminal layout — apne asal data ke saath ----------------
// TF Matrix cache (HTF state + ADX) — sirf terminal render par, zyada se zyada 60s me ek dafa.
function tfRow(tf) { return (lastTfRows || []).find(r => r.tf === tf) || null; }
async function ensureTfData() {
  const now = Date.now();
  if (lastTfRows && lastTfPair === currentPair && now - lastTfAt < 60000) return;
  try {
    const d = await api('/api/tfmatrix?pair=' + currentPair);
    lastTfRows = d.rows || []; lastTfAt = now; lastTfPair = currentPair;
    // HTF/ADX aa gaya — terminal dobara render karein (termSig me tfSig hai, is liye sirf tabhi dobara banta hai jab output badle)
    if (currentTab === 'terminal') loadTerminal();
  } catch (e) { /* TF data na mile to awaiting list uske baghair dikhti hai */ }
}
function tfSig() {
  if (!lastTfRows || lastTfPair !== currentPair) return 'notf';
  return lastTfRows.map(r => r.tf + ':' + (r.signal || '') + ':' + (r.adx == null ? '' : r.adx)).join(',');
}
// Pair type badge (GOLD/CRYPTO/FOREX) — /api/prices ke type se, warna pair se andaza.
function pairBadge() {
  const tp = (lastPriceMap[currentPair] && lastPriceMap[currentPair].type) || '';
  if (tp === 'gold') return 'GOLD';
  if (tp === 'crypto') return 'CRYPTO';
  if (tp === 'forex') return 'FOREX';
  if (/^XA/.test(currentPair)) return 'GOLD';
  if (/^(BTC|ETH|SOL|BNB|XRP|DOGE|ADA)/.test(currentPair)) return 'CRYPTO';
  return 'FOREX';
}
// Har gate ke peeche asal number (koi wajah banayi nahi jati) — confirmed/awaiting + Why Wait dono isi se bante hain.
function gateDetail(gName, d, dir, passed) {
  const s = d.smc || {};
  if (gName.indexOf('Indicator Trend') === 0) {
    return 'EMA20 ' + fmtPx(currentPair, d.ema20) + ' · EMA50 ' + fmtPx(currentPair, d.ema50) + ' · ' + t('price') + ' ' + fmtPx(currentPair, d.price) + ' (1H)';
  }
  if (gName === 'Structure Swing') {
    return t('swingHigh') + ' ' + fmtPx(currentPair, s.swingHigh) + ' · ' + t('swingLow') + ' ' + fmtPx(currentPair, s.swingLow) + ' (15M)';
  }
  if (gName === 'RSI Recovery') {
    if (passed) return 'RSI 14: ' + fmt(d.rsi14, 1) + ' (' + (dir === 'BUY' ? '50–70' : '30–50') + ') (1H)';
    return 'RSI 14: ' + fmt(d.rsi14, 1) + ' — ' + t(dir === 'BUY' ? 'rsiNeedBuy' : 'rsiNeedSell') + ' (1H)';
  }
  if (gName === 'R/R Geometry') {
    let rr = null;
    if (s.swingHigh != null && s.swingLow != null) {
      rr = dir === 'BUY' ? (s.swingHigh - d.price) / Math.max(d.price - s.swingLow, 1e-9) : (d.price - s.swingLow) / Math.max(s.swingHigh - d.price, 1e-9);
    }
    if (rr == null || !isFinite(rr)) return 'R:R —';
    return passed ? 'R:R ' + rr.toFixed(2) + ' (1.5+) (15M)' : 'R:R ' + rr.toFixed(2) + ' — ' + t('rrNeed') + ' (15M)';
  }
  if (gName === 'Macro EMA200') {
    return 'EMA200 ' + fmtPx(currentPair, d.ema200) + ' · ' + t('price') + ' ' + fmtPx(currentPair, d.price) + ' (1H)';
  }
  if (gName === 'Data Freshness') {
    return lastKrakenAgeSec != null ? 'Kraken: ' + lastKrakenAgeSec + 's' : t('gateLblFresh');
  }
  return '';
}
function leadGates(d) {
  if (d.direction === 'BUY') return { dir: 'BUY', gates: d.buyGates || [] };
  if (d.direction === 'SELL') return { dir: 'SELL', gates: d.sellGates || [] };
  return d.buyScore >= d.sellScore ? { dir: 'BUY', gates: d.buyGates || [] } : { dir: 'SELL', gates: d.sellGates || [] };
}
// CONFIRMED INDICATORS — poore points wale gates (+pts) + SMC 80+ ho to uski tasdeeq.
function confirmedHtml(d) {
  const lead = leadGates(d);
  const passed = (lead.gates || []).filter(g => g.points >= g.max);
  let rows = passed.map(g => {
    const pk = GATE_PLAIN[g.name];
    const lbl = pk ? t(pk) : g.name;
    return `<div class="gate"><span>✓ ${esc(lbl)} — <b>+${g.points} pts</b></span><span>${esc(gateDetail(g.name, d, lead.dir, true))}</span></div>`;
  }).join('');
  let count = passed.length;
  if (d.smc && d.smc.score >= 80) {
    rows += `<div class="gate"><span>✓ ${esc(t('smcConfirmLbl'))} — <b>${d.smc.score}/100</b></span><span>SMC ${d.smc.score}/100 (${t('gate')} 80%)</span></div>`;
    count += 1;
  }
  if (!rows) return '';
  return `<h4>${t('confirmedTitle')} <span class="badge-conf">${count} ${t('passedLbl')}</span></h4>${rows}`;
}
// HTF + ADX ki rows (tfmatrix se) — awaiting list aur Why Wait dono me istemal hoti hain.
function htfAdxRows() {
  let rows = '', count = 0;
  const r4 = tfRow('4H'), r1 = tfRow('1D');
  const conflict = (r4 && r4.signal === 'WAIT') || (r1 && r1.signal === 'WAIT');
  if ((r4 || r1) && conflict) {
    rows += `<div class="gate"><span>◐ ${esc(t('htfLbl'))} — <b>${t('needsGate')}</b></span><span>4H: ${r4 ? esc(r4.signal) : '—'} · 1D: ${r1 ? esc(r1.signal) : '—'}</span></div>`;
    count += 1;
  }
  const r1h = tfRow('1H');
  if (r1h && r1h.adx != null && r1h.adx < 20) {
    rows += `<div class="gate"><span>◐ ADX 14</span><span>ADX 14: ${r1h.adx} — ${esc(t('adxRanging'))}</span></div>`;
    count += 1;
  }
  return { rows, count };
}
// AWAITING CONFIRMATION — adhoore gates (NEEDS 85%) + SMC 80 se kam + HTF/ADX.
function awaitingHtml(d) {
  const lead = leadGates(d);
  const failing = (lead.gates || []).filter(g => g.points < g.max).sort((a, b) => (b.max - b.points) - (a.max - a.points));
  let rows = failing.map(g => {
    const pk = GATE_PLAIN[g.name];
    const lbl = pk ? t(pk) : g.name;
    return `<div class="gate"><span>${gateMark(g.points, g.max)} ${esc(lbl)} — <b>${t('needsGate')}</b></span><span>${g.points}/${g.max} · ${esc(gateDetail(g.name, d, lead.dir, false))}</span></div>`;
  }).join('');
  let count = failing.length;
  if (d.smc && d.smc.score < 80) {
    rows += `<div class="gate"><span>✗ SMC Score — <b>${t('needsGate')}</b></span><span>${d.smc.score}/100 (${t('gate')} 80%)</span></div>`;
    count += 1;
  }
  const extra = htfAdxRows();
  rows += extra.rows; count += extra.count;
  if (!rows) return '';
  return `<h4>${t('awaitingTitle')} <span class="badge-pend">${count} ${t('pendingLbl')}</span></h4>${rows}`;
}
// REQUIRED BEFORE BUY OR SELL — demand/supply zone se (koi level banaya nahi jata).
function requiredBoxHtml(d) {
  const s = d.smc || {};
  const dz = s.demandZone || (d.sentiment && d.sentiment.demandZone);
  const sz = s.supplyZone || (d.sentiment && d.sentiment.supplyZone);
  const buyTxt = dz ? t('reqBuyTpl').replace('{a}', fmtPx(currentPair, dz[0])).replace('{b}', fmtPx(currentPair, dz[1])) : '—';
  const sellTxt = sz ? t('reqSellTpl').replace('{a}', fmtPx(currentPair, sz[1])).replace('{b}', fmtPx(currentPair, sz[0])) : '—';
  return `<h4>${t('requiredTitle')}</h4><div class="req-box">
    <div class="req-buy"><b>▲ ${t('requiredBuy')}</b><br>${esc(buyTxt)}</div>
    <div class="req-sell"><b>▼ ${t('requiredSell')}</b><br>${esc(sellTxt)}</div>
  </div>`;
}
// PRICE CARD — MARKET PRICE (LAST) + Bid/Ask · 24H CHANGE · Spread · PDH/PDL/Range · sync line.
function priceCardHtml(d) {
  const info = lastPriceMap[currentPair] || {};
  const chg = info.change24h;
  const chgHtml = chg == null ? '—' : '<span class="' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>';
  const age = lastUpdateAt ? Math.floor((Date.now() - lastUpdateAt) / 1000) : null;
  const syncTxt = marketClosedNow(currentPair) ? t('marketClosedShort') : t('lastUpdate') + ' · ' + (age == null ? '—' : age + ' ' + t('secAgo')) + (lastSourcesText ? ' · ' + t('pcSources') + ': ' + lastSourcesText : '');
  return `<div class="price-card">
    <div class="pc-col"><div class="pc-label">${t('pcMarketPrice')}</div><div class="pc-big" id="pcPrice">${fmtPx(currentPair, d.price)}</div><div class="pc-sub">Bid <b id="pcBid">${fmtPx(currentPair, d.bid)}</b> · Ask <b id="pcAsk">${fmtPx(currentPair, d.ask)}</b></div></div>
    <div class="pc-col"><div class="pc-label">${t('pcChange24h')}</div><div class="pc-big" id="pcChg">${chgHtml}</div><div class="pc-sub">${esc(currentPair.replace('USD', '/USD'))}</div></div>
    <div class="pc-col"><div class="pc-label">${t('pcSpread')}</div><div class="pc-big" id="pcSpread">${fmtPx(currentPair, d.spread)}</div><div class="pc-sub">Ask − Bid</div></div>
    <div class="pc-col"><div class="pc-label">${t('pcKeyLevels')}</div><div class="pc-sub">PDH <b>${fmtPx(currentPair, d.range.pdh)}</b> · PDL <b>${fmtPx(currentPair, d.range.pdl)}</b></div><div class="pc-sub">Range ${fmtPx(currentPair, d.range.pdl)} – ${fmtPx(currentPair, d.range.pdh)}</div></div>
    <div class="pc-sync" id="pcSync">${esc(syncTxt)}</div>
  </div>`;
}
// Confidence ring (SVG) — confluence % (wahi number jo pehle se dikhta hai).
// greenAt: jis score par ring hari ho (Terminal 85, SMC 80 — apna gate).
function confRingHtml(pct, greenAt) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const ga = greenAt || 85;
  const C = 2 * Math.PI * 52;
  const off = C * (1 - p / 100);
  return `<div class="conf-ring"><svg viewBox="0 0 120 120" width="110" height="110" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#22304d" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="${p >= ga ? '#3ddc84' : '#f5c542'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="ring-num">${p}%</div></div>`;
}
// SIGNAL CARD header — pair + badge, direction, confidence ring, code/timeframe/live price.
function signalCardHeadHtml(d) {
  const dirCls = d.direction === 'BUY' ? 'buy' : d.direction === 'SELL' ? 'sell' : 'wait';
  const ageSec = d.updatedAt ? Math.floor((Date.now() - d.updatedAt) / 1000) : null;
  const liveLine = marketClosedNow(currentPair)
    ? esc(t('marketClosedShort'))
    : ageSec != null && ageSec <= 60
      ? '<span class="up">● ' + esc(t('liveTick')) + '</span>'
      : esc(t('lastUpdate')) + ' · ' + (ageSec == null ? '—' : ageSec + ' ' + t('secAgo'));
  return `<div class="sig-card">
    <div class="sig-head">
      <div><span class="sig-pair">${esc(currentPair.replace('USD', '/USD'))}</span> <span class="pair-badge">${esc(pairBadge())}</span>
      <div class="sig-dir ${dirCls}">${d.direction}${d.direction === 'WAIT' ? ' (' + esc(t('awaitingConf')) + ')' : ''}</div></div>
      ${confRingHtml(d.confluence)}
    </div>
    <div class="sig-meta">
      <div><span class="pc-label">${t('confidenceLbl')}</span><br><b>${d.confluence}%</b> (${t('gate')} 85%)</div>
      <div><span class="pc-label">${t('signalCode')}</span><br><b>${d.signalCode ? esc(d.signalCode) : '—'}</b>${d.signalCode ? '<br><span class="fine">' + t('validUntil') + ': ' + fmtPktTimeShort(d.validUntil) + '</span>' : ''}</div>
      <div><span class="pc-label">${t('timeframeLbl')}</span><br><b>1H</b><br><span class="fine">15M entry</span></div>
      <div><span class="pc-label">${t('liveMarketPrice')}</span><br><b id="sigLivePrice">${fmtPx(currentPair, d.price)}</b><br><span class="fine" id="sigLiveSync">${liveLine}</span></div>
    </div>
    ${d.direction === 'WAIT' ? `<p class="scan-line">● ${esc(t('scanningMarket'))}</p>` : ''}
  </div>`;
}
// ACTION BUTTONS ROW — maujooda handlers reuse hote hain (koi feature duplicate nahi).
function actionRowHtml(d) {
  const copyBtn = d.direction === 'WAIT'
    ? `<button class="btn-sig" onclick="copyWaitAnalysis()">${esc(t('copyWaitAnalysis'))}</button>`
    : `<button class="btn-sig" onclick="copyCurrentSignal()">${esc(t('copySignal'))}</button>`;
  return `<div class="action-row">
    <button class="btn-sig btn-analyze" onclick="scanNow()">⟳ ${esc(t('analyzeNow'))}</button>
    <button class="btn-sig" onclick="showTab('indicators')">${esc(t('inspectInd'))}</button>
    ${copyBtn}
    <button class="btn-sig" onclick="downloadCardAction()">⬇ ${esc(t('downloadCard'))}</button>
  </div>`;
}
function downloadCardAction() {
  if (currentSignal) { downloadCurrentSignal(); return; }
  showToast(t('downloadCard'), esc(t('waitNoTrade')));
}
// Price tick par price card + signal card ki live values update karein (poora card dobara nahi banta).
function updateTickValues(d) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el && el.textContent !== txt) el.textContent = txt; };
  set('pcPrice', fmtPx(currentPair, d.price));
  set('pcBid', fmtPx(currentPair, d.bid));
  set('pcAsk', fmtPx(currentPair, d.ask));
  set('pcSpread', fmtPx(currentPair, d.spread));
  const info = lastPriceMap[currentPair] || {};
  if (info.change24h != null) {
    const chgEl = document.getElementById('pcChg');
    if (chgEl) {
      const chgTxt = (info.change24h >= 0 ? '+' : '') + info.change24h.toFixed(2) + '%';
      if (chgEl.textContent !== chgTxt) { chgEl.textContent = chgTxt; chgEl.className = info.change24h >= 0 ? 'up' : 'down'; }
    }
  }
  set('sigLivePrice', fmtPx(currentPair, d.price));
  // v9.6.2: live status rows — har tick par taaza (poora card dobara nahi banta).
  const setStatus = (id, hit) => { const el = document.getElementById(id); if (!el) return; el.className = hit ? 'buy' : 'fine'; el.innerHTML = hit ? '<b>✓ ' + esc(t('hit')) + '</b>' : esc(t('pending')); };
  const ap = d.direction === 'BUY' ? d.buyPlan : d.direction === 'SELL' ? d.sellPlan : null;
  if (ap) {
    setStatus('tpSt1', tpHitNow(d.direction, d.price, ap.tp1));
    setStatus('tpSt2', tpHitNow(d.direction, d.price, ap.tp2));
    setStatus('tpSt3', tpHitNow(d.direction, d.price, ap.tp3));
    const beEl = document.getElementById('beSt');
    if (beEl) { const beHit = tpHitNow(d.direction, d.price, ap.tp1); beEl.className = beHit ? 'buy' : 'fine'; beEl.innerHTML = beHit ? '<b>' + esc(t('beActive')) + '</b>' : esc(t('beNotYet')); }
  }
  set('monPrice', d.price == null ? '—' : fmtPx(currentPair, d.price));
  const monAge = priceAgeSec();
  set('monAge', monAge == null ? '—' : monAge + ' ' + t('secAgo'));
  const cba = document.getElementById('chartBidAsk');
  if (cba) {
    const cbaTxt = 'Bid ' + fmtPx(currentPair, d.bid) + ' · Ask ' + fmtPx(currentPair, d.ask) + ' · ' + t('pcSpread') + ' ' + fmtPx(currentPair, d.spread);
    if (cba.textContent !== cbaTxt) cba.textContent = cbaTxt;
  }
}

async function loadTerminal(fromPrice, force) {
  const el = document.getElementById('terminalCard');
  try {
    const d = await api('/api/signal?pair=' + currentPair + '&lang=' + lang + (force ? '&fresh=1' : ''));
    if (d.disabled) { currentSignal = null; lastSignalData = null; el.innerHTML = '<p>' + esc(d.message) + '</p>'; renderSignalBanner(null); return; }
    if (d.error) { currentSignal = null; lastSignalData = null; el.innerHTML = '<p>' + esc(d.message) + '</p>'; renderSignalBanner(null); return; }
    lastSignalAt = Date.now();
    lastSignalData = d;
    renderSignalBanner(d);
    const planHtml = (plan, label) => {
      // R:R asal numbers se: risk = |trigger - SL|, reward = |TP - trigger|
      const risk = Math.abs(plan.trigger - plan.sl);
      const rrOf = (tp) => risk ? '1:' + (Math.abs(tp - plan.trigger) / risk).toFixed(2) : '—';
      const statusKey = plan.status === 'IN_ZONE' ? 'inZone' : plan.status === 'APPROACHING' ? 'approaching' : 'waitStatus';
      const statusCls = plan.status === 'IN_ZONE' ? 'st-in' : plan.status === 'APPROACHING' ? 'st-near' : 'st-wait';
      const isActive = d.direction === plan.direction;
      return `<div class="plan-card ${isActive ? (plan.direction === 'BUY' ? 'active-buy' : 'active-sell') : ''}">
      <div class="plan-head"><b>${label} ${plan.direction}</b> <span class="status-badge ${statusCls}">${esc(t(statusKey))}</span>${isActive ? ' <span class="status-badge st-active">' + esc(t('activePlan')) + '</span>' : ''}</div>
      ${t('entryZone')}: <b>${fmtPx(currentPair, plan.entryZone[0])} – ${fmtPx(currentPair, plan.entryZone[1])}</b> · ${t('trigger')}: <b>${fmtPx(currentPair, plan.trigger)}</b><br>
      SL: <span class="sell"><b>${fmtPx(currentPair, plan.sl)}</b></span> · R:R ${esc(plan.rr || '')}<br>
      TP1: <span class="buy"><b>${fmtPx(currentPair, plan.tp1)}</b></span> (${rrOf(plan.tp1)}) · TP2: <b>${fmtPx(currentPair, plan.tp2)}</b> (${rrOf(plan.tp2)}) · TP3: <b>${fmtPx(currentPair, plan.tp3)}</b> (${rrOf(plan.tp3)})<br>
      ${liveStatusRowsHtml(d, plan)}
      ${d.tradeZone ? `${t('tradeZone')}: <b>${esc(d.tradeZone.type)} ${fmtPx(currentPair, d.tradeZone.low)} – ${fmtPx(currentPair, d.tradeZone.high)}</b>` : ''}
      ${riskBoxHtml(plan)}
      <p class="fine">⏱ ${esc(t('bestTimeframe'))}</p>
      ${d.signalCode ? `<p class="fine">${t('signalCode')}: <b>${esc(d.signalCode)}</b> · ${t('validUntil')}: ${fmtPktTimeShort(d.validUntil)}</p>` : ''}
      <div class="sig-actions"><button class="btn-sig" onclick="copyCurrentSignal()">${esc(t('copySignal'))}</button> <button class="btn-sig" onclick="downloadCurrentSignal()">${esc(t('downloadSignal'))}</button> <button class="btn-sig" onclick="openShareCardTerminal()">${esc(t('shareCard'))}</button></div></div>`;
    };
    const activePlan = d.direction === 'BUY' ? d.buyPlan : d.direction === 'SELL' ? d.sellPlan : null;
    // Terminal ka active signal — sirf jab BUY/SELL plan ho (WAIT par null, to Copy/Download buttons nahi bante)
    currentSignal = activePlan ? { pair: currentPair, direction: d.direction, entry: activePlan.trigger, sl: activePlan.sl, tp1: activePlan.tp1, tp2: activePlan.tp2, tp3: activePlan.tp3, score: d.confluence, rr: activePlan.rr || '', time: d.updatedAt, signalCode: d.signalCode || null, smcScore: d.smc ? d.smc.score : null } : null;
    const oppDir = d.direction === 'BUY' ? 'SELL' : d.direction === 'SELL' ? 'BUY' : null;
    const oppScore = d.direction === 'BUY' ? d.sellScore : d.direction === 'SELL' ? d.buyScore : null;
    // v7 perf: price tick par poora card dobara na banayein — sirf tab jab signal ki asal values badlein.
    // Badli hui price sirf price card + signal card ki live values me update hoti hai (ids se), baaki card waisa ka waisa rehta hai.
    // termSig me bid/ask/spread/price nahi — wo har tick badalte hain, inhe tick update se handle karte hain.
    const termSig = [d.direction, d.confluence, d.buyScore, d.sellScore, activePlan ? activePlan.trigger : '', activePlan ? activePlan.sl : '', activePlan ? activePlan.tp1 : '', activePlan ? activePlan.tp2 : '', activePlan ? activePlan.tp3 : '', d.smc ? d.smc.score : '', d.zoneBlocked, d.signalCode || '', d.smc && d.smc.demandZone ? d.smc.demandZone.join(',') : '', d.smc && d.smc.supplyZone ? d.smc.supplyZone.join(',') : '', lastPriceMap[currentPair] ? lastPriceMap[currentPair].change24h : '', tfSig(), marketClosedNow(currentPair) ? 'closed' : 'open'].join('|');
    if (fromPrice && lastTerminalSig === termSig) {
      updateTickValues(d);
      renderSignalBanner(d);
      return;
    }
    lastTerminalSig = termSig;
    el.innerHTML = `
      <p class="fine">📌 ${esc(t('oneTradeLabel'))}</p>
      ${marketClosedNow(currentPair) ? `<div class="market-closed-banner">⛔ <b>${esc(t('marketClosedTitle'))}</b><br>${esc(t('marketClosedText'))}</div>` : ''}
      ${priceCardHtml(d)}
      ${signalCardHeadHtml(d)}
      ${confirmedHtml(d)}
      ${awaitingHtml(d)}
      <p class="fine">${esc(t('gatesExplain'))}</p>
      <h4>${t('signalPlan')} — ${d.direction}</h4>
      ${activePlan ? planHtml(activePlan, d.direction) : '<p>' + esc(t('waitNoTrade')) + (d.zoneBlocked && d.zoneNote ? '<br>' + esc(d.zoneNote) : '') + '</p>'}
      ${activePlan ? whyTradeHtml(d) : ''}
      ${d.direction === 'WAIT' ? whyWaitHtml(d) : ''}
      ${d.direction === 'WAIT' ? requiredBoxHtml(d) : ''}
      ${actionRowHtml(d)}
      ${oppDir ? `<p class="fine">${t('oppScenario')}: ${oppDir} ${oppScore}% — ${t('oppGateNotMet')} (${t('gate')} 85%)</p>` : ''}
      ${smcChecklistHtml(d)}
      ${extendedConfluenceHtml(d)}
      ${sentimentWaveHtml(d)}
      <h4>${t('liveComments')}</h4>
      <ul>${d.comments.map(c => '<li>' + esc(c) + '</li>').join('')}</ul>
      <p>${t('nextCheck')} ${d.nextCheckInSec}${t('nextCheckSuffix')} · ${t('signalUpdated')}: ${fmtPktTimeShort(d.updatedAt)}</p>`;
    // v9.1: PDH/PDL range — chart par lines (agar chart pehle se load hai to dobara draw karein)
    lastRange = { pdh: d.range.pdh, pdl: d.range.pdl, pair: currentPair };
    const cv = document.getElementById('chartCanvas');
    if (cv && lastChartCandles.length) drawChart(cv, lastChartCandles);
    updateTickValues(d);
    ensureTfData(); // HTF/ADX (60s cache) — aa jaye to awaiting list taaza ho jati hai
  } catch (e) { if (!fromPrice) el.innerHTML = '<p>' + t('signalLoadFail') + ' ' + esc(e.message) + '</p>'; }
}

// v9.6.3: Gold Buy/Sell Zones — asal 1H candles se (server computeZones). Sirf display, sirf XAUUSD.
// Koi Entry/SL/TP, koi signal, koi trade advice nahi.
function zonesCardHtml(d) {
  if (!d.zones) return '';
  const z = d.zones;
  const statusKey = { in_buy: 'zonesInBuy', in_sell: 'zonesInSell', near_buy: 'zonesNearBuy', near_sell: 'zonesNearSell', between: 'zonesBetween', none: 'zonesNone' }[z.status] || 'zonesBetween';
  const freshLbl = (zn) => zn.tests > 0 ? esc(t('zonesTested')) + ' (' + zn.tests + ')' : esc(t('zonesFresh'));
  const zoneRow = (zn, label) => `<div class="gate"><span>${label} · ${freshLbl(zn)} · ${fmtPktTimeShort(zn.formedAt)}</span><span>${fmtPx(currentPair, zn.bottom)} – ${fmtPx(currentPair, zn.top)}</span></div>`;
  const nearRow = (zn, label) => `<div class="gate"><span>${label}</span><span>${zn ? fmtPx(currentPair, zn.bottom) + ' – ' + fmtPx(currentPair, zn.top) + ' · ' + freshLbl(zn) : '—'}</span></div>`;
  let html = `<p class="notice-banner">${esc(t('zonesBanner'))}</p>
      <h4>${esc(t('zonesTitle'))}</h4>
      <p class="fine">${esc(t('zonesText'))}</p>
      <div class="gate"><span>${esc(t('zonesPrice'))}</span><span>${fmtPx(currentPair, z.price)}</span></div>
      <div class="gate"><span>${esc(t('zonesStatus'))}</span><span>${esc(t(statusKey))}</span></div>
      ${nearRow(z.nearestBuy, esc(t('zonesNearestBuy')))}
      ${nearRow(z.nearestSell, esc(t('zonesNearestSell')))}`;
  if (!z.supply.length && !z.demand.length) {
    html += `<p>${esc(t('zonesNone'))}</p>`;
  } else {
    if (z.demand.length) html += `<h4>${esc(t('zonesBuy'))}</h4>` + z.demand.map(zn => zoneRow(zn, esc(t('zonesBuy')))).join('');
    if (z.supply.length) html += `<h4>${esc(t('zonesSell'))}</h4>` + z.supply.map(zn => zoneRow(zn, esc(t('zonesSell')))).join('');
  }
  return html;
}
// Trend Panel (v9.6.4) — TradingView Trend Panel ka wahi hisaab, server ke panel data se.
// Display only: koi Entry/SL/TP nahi, koi signal nahi.
function trendPanelHtml(d) {
  const p = d.panel; if (!p) return '';
  const stateLbl = (s) => s === 'bullish' ? esc(t('panelBullish')) : s === 'bearish' ? esc(t('panelBearish')) : s === 'mixed' ? esc(t('panelMixed')) : '—';
  const overallLbl = p.overall === 'BUY' ? esc(t('panelBuy')) : p.overall === 'SELL' ? esc(t('panelSell')) : esc(t('panelWait'));
  const row = (r) => `<div class="gate"><span>${esc(r.tf)} · ${stateLbl(r.state)}</span><span>EMA20 ${fmtPx(currentPair, r.ema20)} · EMA50 ${fmtPx(currentPair, r.ema50)} · ${fmtPx(currentPair, r.price)}</span></div>`;
  return `<p class="notice-banner">${esc(t('panelBanner'))}</p>
      <h4>${esc(t('panelTitle'))}</h4>
      <p class="fine">${esc(t('panelText'))}</p>
      ${p.rows.map(row).join('')}
      <div class="gate"><span>${esc(t('panelOverall'))}</span><span><b>${overallLbl}</b></span></div>`;
}
// TradingView chart widget (v9.6.4) — official free tv.js embed. Pine code is chart ke
// andar kabhi inject nahi hota; zones/strategy website ke apne Zones + Trend Panel mein hain.
const TV_SYMBOLS = { XAUUSD: 'OANDA:XAUUSD', XAGUSD: 'OANDA:XAGUSD', BTCUSD: 'BITSTAMP:BTCUSD', ETHUSD: 'BITSTAMP:ETHUSD', SOLUSD: 'BINANCE:SOLUSDT', BNBUSD: 'BINANCE:BNBUSDT', XRPUSD: 'BITSTAMP:XRPUSD', DOGEUSD: 'BITSTAMP:DOGEUSD', ADAUSD: 'BITSTAMP:ADAUSD', EURUSD: 'FX:EURUSD', GBPUSD: 'FX:GBPUSD', USDJPY: 'FX:USDJPY', AUDUSD: 'FX:AUDUSD', USDCAD: 'FX:USDCAD', USDCHF: 'FX:USDCHF' };
let tvWidgetPair = null, tvLoadStarted = false, tvLoadFailed = false;
function tvShowFail() { const el = document.getElementById('tvFail'); if (el) el.style.display = 'block'; }
function createTvWidget() {
  const box = document.getElementById('tvChart'); if (!box || !window.TradingView) return;
  box.innerHTML = '';
  try {
    new window.TradingView.widget({ container_id: 'tvChart', width: '100%', height: 480, symbol: TV_SYMBOLS[currentPair] || 'OANDA:XAUUSD', interval: '60', timezone: 'Asia/Karachi', theme: 'dark', style: '1', locale: 'en', toolbar_bg: '#0a0f1e', enable_publishing: false, allow_symbol_change: false, studies: [] });
    tvWidgetPair = currentPair;
  } catch (e) { tvShowFail(); }
}
function initTvChart() {
  const box = document.getElementById('tvChart'); if (!box) return;
  if (tvLoadFailed) { tvShowFail(); return; }
  if (tvWidgetPair === currentPair) return;
  if (window.TradingView) { createTvWidget(); return; }
  if (tvLoadStarted) return; // script load ho raha hai — ready hone par onload widget banayega
  tvLoadStarted = true;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.async = true;
  s.onload = () => createTvWidget();
  s.onerror = () => { tvLoadFailed = true; tvShowFail(); };
  document.head.appendChild(s);
  // Agar script load ho kar bhi widget na bane (CDN block), 12s baad fail note dikhayein.
  setTimeout(() => { if (!tvWidgetPair && !tvLoadFailed) { const b = document.getElementById('tvChart'); if (b && !b.querySelector('iframe')) { tvLoadFailed = true; tvShowFail(); } } }, 12000);
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
      <p class="fine">${esc(t('indTfNote'))}</p>
      <h4>${t('trend')}</h4>${row('EMA 20 (1H)', fmtPx(currentPair, tf.ema20))}${row('EMA 50 (1H)', fmtPx(currentPair, tf.ema50))}${row('EMA 200 (1H)', fmtPx(currentPair, tf.ema200))}${row('MACD (1H)', fmtPx(currentPair, tf.macd) + ' / Signal ' + fmtPx(currentPair, tf.macdSignal) + ' / Hist ' + fmtPx(currentPair, tf.macdHist))}${row('ADX 14 (1H)', fmt(tf.adx14, 1))}
      <h4>${t('momentum')}</h4>${row('RSI 14 (1H)', fmt(tf.rsi14, 1))}${row('Stochastic K/D (1H)', fmt(tf.stochK, 1) + ' / ' + fmt(tf.stochD, 1))}${row('CCI 20 (1H)', fmt(tf.cci, 1))}${row('Williams %R (1H)', fmt(tf.williamsR, 1))}
      <h4>${t('volatility')}</h4>${row('ATR 14 (1H)', fmtPx(currentPair, tf.atr14))}${row('Bollinger Upper (1H)', fmtPx(currentPair, tf.bbUpper))}${row('Bollinger Middle (1H)', fmtPx(currentPair, tf.bbMiddle))}${row('Bollinger Lower (1H)', fmtPx(currentPair, tf.bbLower))}
      <h4>${t('volume')}</h4>${row('OBV (1H)', fmt(tf.obv, 0))}${row('CMF (1H)', fmt(tf.cmf, 2))}${row('MFI 14 (1H)', fmt(tf.mfi, 1))}
      <h4>${t('structure')}</h4>${row('Support (1H)', fmtPx(currentPair, tf.support))}${row('Resistance (1H)', fmtPx(currentPair, tf.resistance))}${row('Fibonacci 38.2% (1H)', fmtPx(currentPair, tf.fib['38.2']))}${row('Fibonacci 61.8% (1H)', fmtPx(currentPair, tf.fib['61.8']))}
      <h4>${t('ichimoku')}</h4>${row('Tenkan (1H)', fmtPx(currentPair, tf.tenkan))}${row('Kijun (1H)', fmtPx(currentPair, tf.kijun))}${row('Span A (1H)', fmtPx(currentPair, tf.spanA))}${row('Span B (1H)', fmtPx(currentPair, tf.spanB))}${row('Chikou (1H)', fmtPx(currentPair, tf.chikou))}
      <h4>${t('vwapSar')}</h4>${row('VWAP (1H)', fmtPx(currentPair, tf.vwap))}${row('Parabolic SAR (1H)', fmtPx(currentPair, tf.sar))}
      <h4>${t('tf15d')}</h4>
      <p>15M — RSI ${fmt(d.timeframes['15m'].rsi14, 1)} · EMA20 ${fmtPx(currentPair, d.timeframes['15m'].ema20)} · ATR ${fmtPx(currentPair, d.timeframes['15m'].atr14)}</p>
      <p>Daily — RSI ${fmt(d.timeframes['1D'].rsi14, 1)} · EMA20 ${fmtPx(currentPair, d.timeframes['1D'].ema20)} · ATR ${fmtPx(currentPair, d.timeframes['1D'].atr14)}</p>
      ${d.pivots ? `<h4>${t('pivotTitle')}</h4>${row('P', fmtPx(currentPair, d.pivots.P))}${row('R1', fmtPx(currentPair, d.pivots.R1))}${row('R2', fmtPx(currentPair, d.pivots.R2))}${row('S1', fmtPx(currentPair, d.pivots.S1))}${row('S2', fmtPx(currentPair, d.pivots.S2))}` : ''}
      ${trendPanelHtml(d)}
      ${zonesCardHtml(d)}
      <h4>${t('fearGreedTitle')}</h4><div id="fngBody"><p>${esc(t('loading'))}</p></div>`;
    loadFearGreed();
  } catch (e) { body.innerHTML = '<p>' + t('indLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadFearGreed() {
  const el = document.getElementById('fngBody'); if (!el) return;
  try {
    const d = await api('/api/feargreed');
    if (!d.available || d.value == null) { el.innerHTML = '<p>' + esc(t('fearGreedNa')) + '</p>'; return; }
    el.innerHTML = `<p><b>${d.value}/100</b> — ${esc(d.classification || '')} · ${fmtPktTimeShort(d.updatedAt)}</p><div class="sent-bar"><div class="sent-bull" style="width:${d.value}%"></div></div>`;
  } catch (e) { el.innerHTML = '<p>' + esc(t('fearGreedNa')) + '</p>'; }
}
// SMC tab ka pair select — Terminal wale selectPair se jura hai (ek hi currentPair).
function buildSmcPairSelect() {
  const sel = document.getElementById('smcPairSel'); if (!sel) return;
  if (!sel.options.length) sel.innerHTML = PAIR_IDS.map(p => `<option value="${p}">${p.replace('USD', '/USD')}</option>`).join('');
  sel.value = currentPair;
}
// Setup Quality — sirf apne SMC score se (90+ Strong, 80+ Moderate, 60+ Developing, warna Weak).
function smcGradeOf(score) {
  if (score >= 90) return t('smcGradeStrong');
  if (score >= 80) return t('smcGradeModerate');
  if (score >= 60) return t('smcGradeDeveloping');
  return t('smcGradeWeak');
}
// SMC Bias (15M structure se): BOS direction, phir sweep side, phir fresh order block.
function smcBiasOf(d) {
  if (d.bosDir === 'up') return t('smcBiasBullish');
  if (d.bosDir === 'down') return t('smcBiasBearish');
  if (d.sweepCode === 'SSL') return t('smcBiasBullish');
  if (d.sweepCode === 'BSL') return t('smcBiasBearish');
  const bullFresh = d.bullOB && !d.bullOB.mitigated, bearFresh = d.bearOB && !d.bearOB.mitigated;
  if (bullFresh && !bearFresh) return t('smcBiasBullish');
  if (bearFresh && !bullFresh) return t('smcBiasBearish');
  return t('smcBiasNeutral');
}
// WAIT / setup card — score, quality, live price, spread, bias (sab asal values).
function smcSetupCardHtml(d, sig) {
  const info = lastPriceMap[currentPair] || {};
  const price = sig && sig.price != null ? sig.price : info.price;
  const spread = sig && sig.spread != null ? sig.spread : null;
  const ok = d.score >= 80;
  return `<div class="sig-card">
    <div class="sig-head">
      <div><span class="sig-pair">${esc(currentPair.replace('USD', '/USD'))}</span> <span class="pair-badge">SMC</span>
      <div class="sig-dir ${ok ? 'buy' : 'wait'}">${ok ? esc(t('smcConfirmStrong')) : 'WAIT (' + esc(t('awaitingConf')) + ')'}</div></div>
      ${confRingHtml(d.score, 80)}
    </div>
    <div class="sig-meta">
      <div><span class="pc-label">${t('smcSetupQuality')}</span><br><b>${esc(smcGradeOf(d.score))}</b></div>
      <div><span class="pc-label">${t('liveMarketPrice')}</span><br><b>${price == null ? '—' : fmtPx(currentPair, price)}</b></div>
      <div><span class="pc-label">${t('pcSpread')}</span><br><b>${spread == null ? '—' : fmtPx(currentPair, spread)}</b></div>
      <div><span class="pc-label">${t('smcBias')}</span><br><b>${esc(smcBiasOf(d))}</b></div>
    </div>
    ${ok ? `<p class="scan-line" style="color:#3ddc84">✓ ${esc(t('smcConfirmed80'))}</p>` : `<p class="scan-line">● ${esc(t('smcWaiting80'))} — ${d.score}% / 80%</p>`}
  </div>`;
}
async function loadSmc() {
  const el = document.getElementById('smcBody');
  buildSmcPairSelect();
  const setupEl = document.getElementById('smcSetupCard');
  try {
    const d = await api('/api/smc?pair=' + currentPair);
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; if (setupEl) setupEl.innerHTML = ''; return; }
    if (d.error) { el.innerHTML = '<p>' + esc(t('smcNoData')) + '</p>'; if (setupEl) setupEl.innerHTML = ''; return; }
    // Live price/spread setup card ke liye (best-effort — na mile to lastPriceMap se price, spread '—')
    let sig = null;
    try { sig = await api('/api/signal?pair=' + currentPair + '&lang=' + lang); } catch (e) { sig = null; }
    if (setupEl) setupEl.innerHTML = smcSetupCardHtml(d, sig);
    el.innerHTML = `
      <p class="score">${t('smcScore')}: ${d.score} / 100 (${t('gate')} 80%) — ${d.score >= 80 ? '<span class="buy">' + esc(t('smcConfirmStrong')) + '</span>' : '<span class="wait">' + esc(t('smcConfirmWeak')) + '</span>'}</p>
      <p class="fine">${esc(t('smcExplain'))}</p>
      ${d.parts.map(p => gateRowHtml(p.name, p.score, p.max)).join('')}
      <h4>${t('swingLevels')}</h4><p>${t('swingHigh')}: ${fmtPx(currentPair, d.swingHigh)} · ${t('swingLow')}: ${fmtPx(currentPair, d.swingLow)}</p>
      <h4>${t('liqSweeps')}</h4><p>${esc(d.sweep)}</p>
      <h4>${t('orderBlocks')}</h4>
      <p>${t('bullOB')}: ${d.bullOB ? fmtPx(currentPair, d.bullOB.low) + ' – ' + fmtPx(currentPair, d.bullOB.high) + (d.bullOB.mitigated ? ' (' + t('mitigated') + ')' : ' (' + t('fresh') + ')') : '—'}</p>
      <p>${t('bearOB')}: ${d.bearOB ? fmtPx(currentPair, d.bearOB.low) + ' – ' + fmtPx(currentPair, d.bearOB.high) + (d.bearOB.mitigated ? ' (' + t('mitigated') + ')' : ' (' + t('fresh') + ')') : '—'}</p>
      <h4>${t('fvg')}</h4>
      ${d.fvgs.length ? d.fvgs.map(f => `<p>${f.type}: ${fmtPx(currentPair, f.low)} – ${fmtPx(currentPair, f.high)}</p>`).join('') : '<p>' + esc(t('noFvg')) + '</p>'}
      <p>${t('microSweeps')}: ${d.sslSweeps} · ${t('liqPools')}: ${d.pools}</p>`;
    const macro = document.getElementById('smcMacro');
    if (macro) macro.innerHTML = `<p><b>${t('macroTitle')}</b> — ${t('bos')}: ${d.bos ? '✓' : '—'} · ${t('mss')}: ${d.mss ? '✓' : '—'} · ${t('swingHigh')}: ${fmtPx(currentPair, d.swingHigh)} · ${t('swingLow')}: ${fmtPx(currentPair, d.swingLow)} · ${t('liqPools')}: ${d.pools}</p>`;
    const micro = document.getElementById('smcMicro');
    if (micro) micro.innerHTML = `<p>${t('microSweeps')}: <b>${d.sslSweeps}</b> · FVG: ${d.fvgs.length} · ${t('bullOB')}: ${d.bullOB ? (d.bullOB.mitigated ? t('mitigated') : t('fresh')) : '—'} · ${t('bearOB')}: ${d.bearOB ? (d.bearOB.mitigated ? t('mitigated') : t('fresh')) : '—'}</p>`;
  } catch (e) { el.innerHTML = '<p>' + t('smcLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
async function loadScanner() {
  const el = document.getElementById('scannerBody');
  try {
    const d = await api('/api/scanner');
    el.innerHTML = `<div class="table-wrap"><table><tr><th>${t('pair')}</th><th>${t('price')}</th><th>${t('smcScore')}</th><th>${t('direction')}</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.pair)}</td><td>${fmtPx(r.pair, r.price)}</td><td>${r.smcScore == null ? '—' : r.smcScore + '/100'}</td><td>${esc(r.direction)}</td></tr>`).join('') + `</table></div>
      <p>${t('confirmedSignals')}: ${d.confirmedSignals} · ${t('cycleEvery')} ${d.cycleSec} ${t('cycleSec')}</p>` +
      smcPairCardsHtml(d.rows);
  } catch (e) { el.innerHTML = '<p>' + t('scannerFail') + ' ' + esc(e.message) + '</p>'; }
}
// v9.5: SMC per-pair tasdeeq cards — scanner ke rows se (koi naya engine nahi, koi signal nahi).
// Sirf score ring, bias, OB/FVG zones. Koi Entry/SL/TP, koi trade button, koi Copy/Share nahi.
function smcPairCardHtml(r) {
  const obLine = (ob) => ob ? fmtPx(r.pair, ob.low) + ' – ' + fmtPx(r.pair, ob.high) + ' (' + (ob.mitigated ? t('mitigated') : t('fresh')) + ')' : '—';
  const fvgLine = r.fvgs && r.fvgs.length
    ? r.fvgs.slice(0, 2).map(f => esc(f.type) + ': ' + fmtPx(r.pair, f.low) + ' – ' + fmtPx(r.pair, f.high)).join('<br>')
    : esc(t('noFvg'));
  return `<div class="sig-card smc-pair-card">
    <div class="sig-head">
      <div><span class="sig-pair">${esc(r.pair.replace('USD', '/USD'))}</span> <span class="pair-badge">SMC</span>
      <div class="sig-dir wait">${esc(t('smcBias'))}: ${esc(smcBiasOf(r))}</div></div>
      ${r.smcScore == null ? '' : confRingHtml(r.smcScore, 80)}
    </div>
    <div class="sig-meta">
      <div><span class="pc-label">${t('liveMarketPrice')}</span><br><b>${r.price == null ? '—' : fmtPx(r.pair, r.price)}</b></div>
      <div><span class="pc-label">${t('bullOB')}</span><br><b>${obLine(r.bullOB)}</b></div>
      <div><span class="pc-label">${t('bearOB')}</span><br><b>${obLine(r.bearOB)}</b></div>
      <div><span class="pc-label">${t('fvg')}</span><br><b>${fvgLine}</b></div>
    </div>
    <p class="fine">${esc(t('bannerSmc'))}</p>
  </div>`;
}
function smcPairCardsHtml(rows) {
  if (!rows || !rows.length) return '';
  return `<h4>${esc(t('smcPairCardsTitle'))}</h4><div class="smc-pair-cards">` + rows.map(smcPairCardHtml).join('') + `</div>`;
}
async function loadSession() {
  const el = document.getElementById('sessionBody');
  el.innerHTML = '<p>' + esc(t('loading')) + '</p>';
  try {
    const d = await api('/api/sessions');
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    el.innerHTML = `
      <p><b>${esc(d.active.name)}</b> ${t('sessionActive')} — ${fmtHm12(d.active.startPKT)} – ${fmtHm12(d.active.endPKT)} PKT · ${t('nowPkt')}: ${fmtHm12(d.nowPKT)}</p>
      <p>${t('nextSession')}: ${esc(d.next.name)} — ${d.next.inMin} ${t('minutes')}</p>
      <p>${t('newsBlackout')}: <b>${t('notAvailable')}</b> — ${esc(d.newsBlackout.note)}</p>
      <h4>${t('allSessions')}</h4>
      <div class="table-wrap"><table><tr><th>${t('session')}</th><th>${t('pktTime')}</th><th>${t('status')}</th></tr>
      ${d.all.map(s => `<tr><td>${esc(s.name)}</td><td>${fmtHm12(s.startPKT)} – ${fmtHm12(s.endPKT)}</td><td>${s.isActive ? '<span class="buy">' + esc(t('sessionActive')) + '</span>' : '—'}</td></tr>`).join('')}</table></div>`;
  } catch (e) { el.innerHTML = '<p>' + t('sessionLoadFail') + ' ' + esc(e.message) + '</p>'; }
}
// v9.2: Terminal-only counts — /api/performance sab engines gin-ta hai (server.js), is liye
// Terminal history (/api/history?engine=terminal, max 100 — History display ki bhi yahi had hai) se khud gin lein.
async function loadTerminalPerf() {
  try {
    const d = await api('/api/history?engine=terminal');
    const list = d.signals || [];
    const wins = list.filter(s => s.outcome === 'Win').length;
    const losses = list.filter(s => s.outcome === 'Loss').length;
    const be = list.filter(s => s.outcome === 'Break-Even').length;
    const inflight = list.filter(s => !s.outcome).length;
    const closed = wins + losses + be;
    return { total: list.length, wins, losses, breakEven: be, inFlight: inflight, winRate: closed ? +(wins / closed * 100).toFixed(1) : null };
  } catch (e) { return null; }
}
async function loadPerf() {
  const el = document.getElementById('perfBody'); if (!el) return;
  const p = await loadTerminalPerf();
  if (!p) { el.innerHTML = ''; return; }
  el.innerHTML = `<p>${t('totalExecuted')}: ${p.total} · ${t('wins')}: ${p.wins} · ${t('losses')}: ${p.losses} · ${t('breakEven')}: ${p.breakEven} · ${t('inFlight')}: ${p.inFlight} · ${t('winRate')}: ${p.winRate == null ? t('noClosed') : p.winRate + '%'}</p><p>${esc(t('perfNoteTerminal'))}</p>`;
}
async function loadHistory() {
  const el = document.getElementById('historyBody');
  // v9.2: History me SIRF Terminal signals — SMC/Session records yahan nahi dikhte.
  const o = document.getElementById('fOutcome').value, en = 'terminal';
  try {
    const d = await api('/api/history?outcome=' + o + '&engine=' + en);
    histSignals = d.signals || [];
    el.innerHTML = d.signals.length ? d.signals.map((s, i) => `<div class="price-cell hist-row" style="margin:6px 0" onclick="toggleHistDetails(${i})"><b>${esc(s.pair)}</b> <span class="${s.direction === 'BUY' ? 'buy' : 'sell'}">${s.direction}</span> · ${fmtPktTime(s.createdAt)}<br>${t('entry')} ${fmtPx(s.pair, s.entry)} · SL ${fmtPx(s.pair, s.sl)} · TP1 ${fmtPx(s.pair, s.tp1)} · TP2 ${fmtPx(s.pair, s.tp2)} · TP3 ${fmtPx(s.pair, s.tp3)} · Score ${s.score}% · ${esc(s.engine)} · <b>${esc(s.outcome || 'In-Flight')}</b><br><button class="btn-sig-sm" onclick="event.stopPropagation();copyHistorySignal(${i})">${esc(t('copySignal'))}</button> <button class="btn-sig-sm" onclick="event.stopPropagation();downloadHistorySignal(${i})">${esc(t('downloadSignal'))}</button> <button class="btn-sig-sm" onclick="event.stopPropagation();openShareCard(histSignals[${i}])">${esc(t('shareCard'))}</button> <button class="btn-sig-sm" onclick="event.stopPropagation();toggleHistDetails(${i})">${esc(t('detailsBtn'))}</button><div id="hist-det-${i}" style="display:${histOpenDetails[i] ? 'block' : 'none'}">${histDetailsHtml(s)}</div></div>`).join('') : '<p>' + esc(t('noSignals')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
// History per-row details — RECORDED gate breakdown (audit). Purane signals me gates save nahi hue.
function histDetailsHtml(s) {
  let h = `<h4>${t('histDetails')}</h4><p>${t('signal')}: ${esc(s.id || '—')} · ${esc(s.engine)} · ${t('gate')} ${s.gate || '—'}% · Score ${s.score}%</p>`;
  if (s.gates && s.gates.length) h += s.gates.map(g => gateRowHtml(g.name, g.points, g.max)).join('');
  else h += '<p>' + esc(t('gatesNotSaved')) + '</p>';
  if (s.smcScore != null) h += `<p>SMC Score: ${s.smcScore}/100</p>`;
  return h;
}
function toggleHistDetails(i) {
  histOpenDetails[i] = !histOpenDetails[i];
  const el = document.getElementById('hist-det-' + i);
  if (el) el.style.display = histOpenDetails[i] ? 'block' : 'none';
}
async function loadRefiner() {
  const el = document.getElementById('refinerBody');
  const c = document.getElementById('refCutoff').value;
  try {
    const d = await api('/api/refiner?cutoff=' + c + '&engine=terminal');
    el.innerHTML = `<p>${t('cutoff')} ${d.cutoff}% — ${t('qualifying')}: ${d.qualifying} · ${t('simWinRate')}: ${d.winRate == null ? '—' : d.winRate + '%'}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
// v9.6.1: Bearer token ke baghair plain navigation /api/export.csv par
// not_logged_in deta hai (server sirf Authorization header padhta hai,
// koi session cookie nahi) — is liye token ke saath fetch karke Blob download karte hain.
async function exportCsv() {
  try {
    const r = await fetch('/api/export.csv?engine=terminal', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'forex-trading-pro-signals.csv'; a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
  } catch (e) { alert(e.message); }
}

// ---- Account: 9 sub-tabs ----
const ACCT_TAB_KEYS = ['overview', 'engineControls', 'signalDetails', 'signalHistory', 'tfMatrix', 'trackingLogs', 'exportCsv', 'aiAgent', 'preferences'];
let acctTab = 'overview';
function buildAcctSubtabs() {
  // v9.3-sec: Tracking Logs me admin activity + buyer usernames hote hain — buyer ko ye sub-tab dikhe hi nahi.
  const isAdmin = me && me.role === 'admin';
  const keys = ACCT_TAB_KEYS.filter(k => isAdmin || k !== 'trackingLogs');
  if (!keys.includes(acctTab)) acctTab = 'overview';
  document.getElementById('acctSubtabs').innerHTML = keys.map(k => `<button class="${k === acctTab ? 'active' : ''}" onclick="acctTab='${k}';buildAcctSubtabs();loadAcct()">${t(k)}</button>`).join('');
  loadAcct();
}
// v9.5: Plan expiry — asal /api/auth/me se (plan + expiresAt). Lifetime ka koi expiry nahi.
// Plan badalna admin-side hai — buyer ko sirf bataya jata hai ke admin se rabta karein.
function planExpiryHtml() {
  if (!me) return '';
  if (!me.plan || me.plan === 'Lifetime' || !me.expiresAt) return `<p>${t('planExpiry')}: <b>Lifetime</b> — ${esc(t('lifetimeNever'))}</p>`;
  const days = Math.max(0, Math.ceil((me.expiresAt - Date.now()) / 86400000));
  return `<p>${t('planExpiry')}: ${fmtPktDateTime(me.expiresAt)} · <b>${days} ${esc(t('daysLeft'))}</b></p>` +
    (me.role === 'buyer' ? `<p class="fine">${esc(t('managePlan'))}</p>` : '');
}
// v9.5: Admin apna password khud badle — Account → Overview (sirf admin).
// Endpoint wahi hai jo buyer password ke liye hai (POST /api/admin/users/:username/password,
// requireAdmin — logged-in admin ki token session use hoti hai). Session token-based hai,
// password badalne se logout nahi hota.
async function changeOwnPass() {
  const p = (document.getElementById('selfPassNew') || {}).value || '';
  const c = (document.getElementById('selfPassConf') || {}).value || '';
  const msg = document.getElementById('selfPassMsg');
  if (p.length < 6) { if (msg) msg.textContent = t('passTooShort'); return; }
  if (p !== c) { if (msg) msg.textContent = t('passMismatch'); return; }
  try {
    await api('/api/admin/users/' + encodeURIComponent(me.username) + '/password', { method: 'POST', body: JSON.stringify({ password: p }) });
    if (msg) msg.textContent = t('passChanged');
    const a = document.getElementById('selfPassNew'); if (a) a.value = '';
    const b = document.getElementById('selfPassConf'); if (b) b.value = '';
  } catch (e) { if (msg) msg.textContent = e.message; }
}
async function loadAcct() {
  const el = document.getElementById('acctBody');
  // v9.3-sec: purani admin session se acctTab 'trackingLogs' reh gaya ho to buyer ko wapas overview par bhej dein.
  if (acctTab === 'trackingLogs' && (!me || me.role !== 'admin')) { acctTab = 'overview'; buildAcctSubtabs(); return; }
  try {
    if (acctTab === 'overview') {
      const s = await api('/api/settings');
      // v9.2: Overview counts bhi sirf Terminal signals se (loadTerminalPerf — /api/performance sab engines gin-ta hai).
      const p = await loadTerminalPerf() || { total: 0, wins: 0, losses: 0, inFlight: 0 };
      el.innerHTML = `<p>${t('username')}: <b>${esc(me.username)}</b> · ${t('role')}: ${esc(me.role)} · ${t('plan')}: ${esc(me.plan || '—')}</p>
      <p>${t('engines')}: Terminal ${s.settings.engines.terminal ? 'ON' : 'OFF'} · SMC ${s.settings.engines.smc ? 'ON' : 'OFF'} · Session ${s.settings.engines.session ? 'ON' : 'OFF'}</p>
      <p>${t('signals')}: ${t('total')} ${p.total} · ${t('wins')} ${p.wins} · ${t('losses')} ${p.losses} · ${t('inFlight')} ${p.inFlight}</p>` + planExpiryHtml() +
      (me.tgCode ? `<p><b>${esc(t('tgPersonalTitle'))}</b><br><a class="btn gold" href="https://t.me/tradingforexprobot?start=${esc(me.tgCode || '')}" target="_blank" rel="noopener">${esc(t('tgButton'))}</a> <button class="btn small" onclick="copyTgLink()">${esc(t('tgCopyLink'))}</button><br><span class="fine">${esc(t('tgPersonalText'))}</span><br><span class="fine">${esc(me.tgLinked ? t('tgLinked') : t('tgNotLinked'))}</span></p>` : '') +
      // v9.7: Browser notifications + per-pair pasand (Telegram + Push dono par lagti hai).
      `<h4>${esc(t('pushTitle'))}</h4><div id="pushCard"><p>${esc(t('loading'))}</p></div>
      <h4>${esc(t('pushPairsTitle'))}</h4><p class="fine">${esc(t('pushPairsText'))}</p><div id="pairsCard"><p>${esc(t('loading'))}</p></div><p id="pairsMsg" class="fine"></p>` +
      // v9.5: Admin apna password khud badle — sirf admin ko dikhta hai (buyer ko nahi).
      (me.role === 'admin' ? `<h4>${esc(t('ownPassTitle'))}</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input type="password" id="selfPassNew" data-i18n-ph="phNewPass" placeholder="${esc(t('phNewPass'))}" autocomplete="new-password" style="width:170px">
      <input type="password" id="selfPassConf" data-i18n-ph="phConfirmPass" placeholder="${esc(t('phConfirmPass'))}" autocomplete="new-password" style="width:170px">
      <button class="btn small gold" onclick="changeOwnPass()">${esc(t('saveBtn'))}</button>
      <span id="selfPassMsg" class="fine"></span></div>` : '');
      refreshPushCard(); refreshPairsCard();
    } else if (acctTab === 'engineControls') {
      const s = await api('/api/settings');
      const engLabel = (k) => k === 'terminal' ? t('mainTerminal') : k === 'smc' ? t('smcEngine') : k === 'session' ? t('sessionEngine') : t('newsIntel');
      // Toggles sirf admin ke liye — buyer ko 403 alert dikhana bekar hai; buyer ko sirf status dikhta hai.
      if (me.role === 'admin') {
        el.innerHTML = ['terminal', 'smc', 'session', 'news'].map(k => `<div class="gate"><span>${engLabel(k)}</span><button class="btn small ${s.settings.engines[k] ? 'gold' : ''}" onclick="toggleEngine('${k}', ${!s.settings.engines[k]})">${s.settings.engines[k] ? 'ON' : 'OFF'}</button></div>`).join('') +
        `<p>${esc(t('engineOffNote'))}</p>
        <button class="btn small" onclick="testPush()">${t('testPushBtn')}</button> <span id="pushMsg"></span>`;
      } else {
        el.innerHTML = ['terminal', 'smc', 'session', 'news'].map(k => `<div class="gate"><span>${engLabel(k)}</span><span>${s.settings.engines[k] ? 'ON' : 'OFF'}</span></div>`).join('') +
        `<p class="fine">${esc(t('engineStatus'))} — ${esc(t('engineOffNote'))}</p>
        <button class="btn small" onclick="testPush()">${t('testPushBtn')}</button> <span id="pushMsg"></span>`;
      }
    } else if (acctTab === 'signalDetails') {
      const d = await api('/api/signal?pair=' + currentPair + '&lang=' + lang);
      // Ek direction, ek trade — sirf wo plan dikhao jo gate paar kare (Terminal jaisa)
      const p = d.direction === 'BUY' ? d.buyPlan : d.direction === 'SELL' ? d.sellPlan : null;
      el.innerHTML = d.error ? '<p>' + esc(d.message) + '</p>' : p
        ? `<p><b>${d.direction}</b> — ${t('entryZone')} ${fmtPx(currentPair, p.entryZone[0])} – ${fmtPx(currentPair, p.entryZone[1])} · ${t('trigger')} ${fmtPx(currentPair, p.trigger)} · SL ${fmtPx(currentPair, p.sl)} · TP ${fmtPx(currentPair, p.tp1)} / ${fmtPx(currentPair, p.tp2)} / ${fmtPx(currentPair, p.tp3)} · ${t('confluence')} ${d.confluence}%</p><p class="fine">📌 ${esc(t('oneTradeNote'))}</p>${whyTradeHtml(d)}`
        : '<p>' + esc(t('waitNoTrade')) + ' — ' + t('confluence') + ' ' + d.confluence + '%</p><p class="fine">📌 ' + esc(t('oneTradeNote')) + '</p>';
    } else if (acctTab === 'signalHistory') {
      el.innerHTML = `<p>${esc(t('historyTabText'))}</p><button class="btn small gold" onclick="showTab('history')">${t('openHistory')}</button>`;
    } else if (acctTab === 'tfMatrix') {
      await loadTfMatrix();
    } else if (acctTab === 'trackingLogs') {
      const d = await api('/api/logs');
      el.innerHTML = d.logs.length ? d.logs.map(l => `<p>${fmtPktTimeShort(l.at)} — ${esc(l.text)}</p>`).join('') : '<p>' + esc(t('noSignals')) + '</p>';
    } else if (acctTab === 'exportCsv') {
      el.innerHTML = `<p>${esc(t('exportText'))}</p><button class="btn small gold" onclick="exportCsv()">${t('exportBtn')}</button>`;
    } else if (acctTab === 'aiAgent') {
      el.innerHTML = `<p><b>${esc(t('aiTitle'))}</b> ${esc(t('aiText'))}</p>
      <input id="aiQ" data-i18n-ph="phAiQ" placeholder="${esc(t('phAiQ'))}"><button class="btn gold" onclick="askAi()">${t('aiAsk')}</button><p id="aiA"></p>`;
    } else if (acctTab === 'preferences') {
      el.innerHTML = `
      <p>${t('prefPair')}: <select id="prefPair" onchange="savePrefPair(this.value)">${PAIR_IDS.map(p => `<option ${p === currentPair ? 'selected' : ''}>${p}</option>`).join('')}</select></p>
      <p>${t('riskProfile')}: <select id="prefRisk" onchange="savePrefRisk(this.value)">
        <option value="conservative" ${riskProfile === 'conservative' ? 'selected' : ''}>${t('riskConservative')}</option>
        <option value="moderate" ${riskProfile === 'moderate' ? 'selected' : ''}>${t('riskModerate')}</option>
        <option value="aggressive" ${riskProfile === 'aggressive' ? 'selected' : ''}>${t('riskAggressive')}</option></select>
        <span class="fine"> — ${esc(riskProfileText())}</span></p>
      <p>${t('timezone')}: <b>PKT (UTC+5)</b></p>
      <p>${t('language')}: <select id="prefLang" class="lang-select" onchange="setLang(this.value)">${langOptionsHtml()}</select></p>
      <p>${t('theme')}: <select id="prefTheme" onchange="setTheme(this.value)">
        <option value="dark" ${theme === 'dark' ? 'selected' : ''}>${t('themeDark')}</option>
        <option value="light" ${theme === 'light' ? 'selected' : ''}>${t('themeLight')}</option></select></p>
      <p>${t('sound')}: <button class="btn small ${soundOn ? 'gold' : ''}" onclick="toggleSound()">${soundOn ? 'ON' : 'OFF'}</button> · ${t('notifications')}: <button class="btn small ${notifOn ? 'gold' : ''}" onclick="toggleNotif()">${notifOn ? 'ON' : 'OFF'}</button></p>
      <p id="prefMsg"></p>
      <p class="fine">${esc(t('alertsNote'))}</p>`;
    }
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadTfMatrix() {
  const el = document.getElementById('acctBody');
  el.innerHTML = '<p>' + esc(t('tfLoading')) + '</p>';
  try {
    const d = await api('/api/tfmatrix?pair=' + currentPair);
    el.innerHTML = `<div class="table-wrap"><table><tr><th>TF</th><th>${t('rsi')}</th><th>${t('ema20')}</th><th>${t('macdHist')}</th><th>${t('adx')}</th><th>${t('signal')}</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.tf)}</td><td>${r.rsi ?? '—'}</td><td>${fmtPx(currentPair, r.ema20)}</td><td>${fmtPx(currentPair, r.macdHist)}</td><td>${r.adx ?? '—'}</td><td>${esc(r.signal)}</td></tr>`).join('') + `</table></div><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function toggleEngine(k, val) {
  try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ engines: { [k]: val } }) }); loadAcct(); }
  catch (e) { alert(e.message); }
}
function testPush() { document.getElementById('pushMsg').textContent = t('testPushMsg'); }
// ---- v9.7: Web Push (browser notifications, site band ho tab bhi) + per-pair pasand ----
// Permission sirf button dabane par mangi jati hai (browser page load par prompt nahi dikhata).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
function pushSupported() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
async function refreshPushCard() {
  const el = document.getElementById('pushCard'); if (!el) return;
  if (!pushSupported()) { el.innerHTML = '<p>' + esc(t('pushUnsupported')) + '</p>'; return; }
  let sub = null;
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) sub = await reg.pushManager.getSubscription(); } catch (e) {}
  const on = !!sub;
  el.innerHTML = `<p>${esc(t('pushText'))}</p><p>${esc(on ? t('pushOn') : t('pushOff'))}</p>
    <button class="btn small ${on ? '' : 'gold'}" onclick="${on ? 'disablePush()' : 'enablePush()'}">${esc(on ? t('pushDisableBtn') : t('pushEnableBtn'))}</button> <span id="pushMsg" class="fine"></span>`;
}
async function enablePush() {
  const msg = (s) => { const m = document.getElementById('pushMsg'); if (m) m.textContent = s; };
  try {
    if (!pushSupported()) { msg(t('pushUnsupported')); return; }
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { msg(t('pushDenied')); return; }
    const k = await api('/api/push/vapid-public-key');
    if (!k.available || !k.publicKey) { msg(t('pushUnsupported')); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(k.publicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    await refreshPushCard(); msg(t('pushEnabledMsg'));
  } catch (e) { msg(e.message); }
}
async function disablePush() {
  const msg = (s) => { const m = document.getElementById('pushMsg'); if (m) m.textContent = s; };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { try { await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch (e) {} await sub.unsubscribe(); }
    }
    await refreshPushCard(); msg(t('pushDisabledMsg'));
  } catch (e) { msg(e.message); }
}
async function refreshPairsCard() {
  const el = document.getElementById('pairsCard'); if (!el) return;
  try {
    const d = await api('/api/notify-pairs');
    const on = new Set(d.pairs || []);
    el.innerHTML = PAIR_IDS.map(p => `<div class="gate"><span>${esc(p.replace('USD', '/USD'))}</span><button class="btn small ${on.has(p) ? 'gold' : ''}" onclick="toggleNotifyPair('${p}')">${on.has(p) ? 'ON' : 'OFF'}</button></div>`).join('');
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function toggleNotifyPair(pair) {
  const msg = (s) => { const m = document.getElementById('pairsMsg'); if (m) m.textContent = s; };
  try {
    const d = await api('/api/notify-pairs');
    const set = new Set(d.pairs || []);
    if (set.has(pair)) set.delete(pair); else set.add(pair);
    await api('/api/notify-pairs', { method: 'POST', body: JSON.stringify({ pairs: [...set] }) });
    msg(t('pushPairsSaved'));
    refreshPairsCard();
  } catch (e) { msg(e.message); }
}
async function askAi() {
  const q = document.getElementById('aiQ').value;
  try { const d = await api('/api/ai', { method: 'POST', body: JSON.stringify({ question: q }) }); document.getElementById('aiA').textContent = d.answer + ' (' + d.note + ')'; }
  catch (e) { document.getElementById('aiA').textContent = e.message; }
}
async function savePrefPair(v) {
  currentPair = v;
  localStorage.setItem('ftp_pref_pair', v);
  buildPairSelect(); loadTerminal(); loadIndicators(); loadSmc(); loadChart(); loadIndStrip();
  // Admin ho to server ka defaultPair bhi update karein (buyer ke liye 403 — chup chap ignore)
  if (me && me.role === 'admin') { try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ defaultPair: v }) }); } catch (e) {} }
  const m = document.getElementById('prefMsg'); if (m) m.textContent = t('prefSaved');
}
function savePrefRisk(v) {
  riskProfile = ['conservative', 'moderate', 'aggressive'].includes(v) ? v : 'moderate';
  localStorage.setItem('ftp_risk_profile', riskProfile);
  loadAcct(); // risk wali line dobara dikhaye
  const m = document.getElementById('prefMsg'); if (m) m.textContent = t('prefSaved');
}
function setTheme(v) {
  theme = v === 'light' ? 'light' : 'dark';
  localStorage.setItem('ftp_theme', theme);
  applyTheme();
  const m = document.getElementById('prefMsg'); if (m) m.textContent = t('prefSaved');
}

// ---- Admin ----
async function loadAdmin() {
  // v9.3-sec: defense-in-depth — admin na ho to kuch render na karein, na fetch karein.
  if (!me || me.role !== 'admin') {
    document.getElementById('adminCounts').innerHTML = '';
    document.getElementById('adminUsers').innerHTML = '';
    return;
  }
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
      <button class="btn small" onclick="adminDelete('${esc(u.username)}')">${t('delete')}</button></div>
      <div id="passForm-${esc(u.username)}"></div>` : ''}</div>`).join('') : '<p>' + esc(t('noBuyers')) + '</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function createBuyer() {
  const username = document.getElementById('newBuyerUser').value.trim();
  const password = document.getElementById('newBuyerPass').value;
  const plan = document.getElementById('newBuyerPlan').value;
  try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, plan }) }); alert(t('buyerCreated') + ': ' + username + ' (' + plan + ')'); loadAdmin(); }
  catch (e) { alert(e.message); }
}
// v9.6.1: Admin backup — users/settings/logs/signals ek JSON file me.
// Server ke /api/admin/users me pehle se password hash/salt/Telegram code nahi aate,
// aur /api/settings, /api/logs, /api/history me bhi koi password ya Telegram link/token
// nahi hota — backup me sirf wahi jo API deti hai (raw db.json kabhi download nahi hota).
async function downloadBackup() {
  if (!me || me.role !== 'admin') return;
  const msg = document.getElementById('backupMsg');
  const setMsg = (s) => { if (msg) msg.textContent = s; };
  try {
    setMsg(t('backupWorking'));
    const [u, s, l, h] = await Promise.all([api('/api/admin/users'), api('/api/settings'), api('/api/logs'), api('/api/history')]);
    const backup = { app: 'Forex Trading Pro', exportedAt: new Date().toISOString(), exportedBy: me.username, counts: { total: u.total, active: u.active, expired: u.expired }, users: u.users || [], settings: s.settings || {}, logs: l.logs || [], signals: h.signals || [] };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'forex-trading-pro-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 2000);
    setMsg(t('backupDone'));
  } catch (e) { setMsg(e.message); }
}
async function adminAction(username, action) {
  try { await api('/api/admin/users/' + encodeURIComponent(username) + '/' + action, { method: 'POST' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}
// v9.5: window.prompt headless/mobile browser me block ho jata hai — button dabane par
// kuch nahi khulta tha (yehi bug tha). Ab button dabate hi isi row me inline form khulta hai.
function adminPass(username) {
  const box = document.getElementById('passForm-' + username);
  if (!box) return;
  box.innerHTML = `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    <input type="password" id="passNew-${esc(username)}" data-i18n-ph="phNewPass" placeholder="${esc(t('phNewPass'))}" autocomplete="new-password" style="width:170px">
    <input type="password" id="passConf-${esc(username)}" data-i18n-ph="phConfirmPass" placeholder="${esc(t('phConfirmPass'))}" autocomplete="new-password" style="width:170px">
    <button class="btn small gold" onclick="adminPassSave('${esc(username)}')">${esc(t('saveBtn'))}</button>
    <button class="btn small" onclick="adminPassCancel('${esc(username)}')">${esc(t('cancelBtn'))}</button>
    <span id="passMsg-${esc(username)}" class="fine"></span></div>`;
  const inp = document.getElementById('passNew-' + username);
  if (inp) inp.focus();
}
async function adminPassSave(username) {
  const p = (document.getElementById('passNew-' + username) || {}).value || '';
  const c = (document.getElementById('passConf-' + username) || {}).value || '';
  const msg = document.getElementById('passMsg-' + username);
  if (p.length < 6) { if (msg) msg.textContent = t('passTooShort'); return; }
  if (p !== c) { if (msg) msg.textContent = t('passMismatch'); return; }
  try {
    await api('/api/admin/users/' + encodeURIComponent(username) + '/password', { method: 'POST', body: JSON.stringify({ password: p }) });
    if (msg) msg.textContent = t('passChanged');
    setTimeout(() => { const b = document.getElementById('passForm-' + username); if (b) b.innerHTML = ''; }, 1500);
  } catch (e) { if (msg) msg.textContent = e.message; }
}
function adminPassCancel(username) {
  const box = document.getElementById('passForm-' + username);
  if (box) box.innerHTML = '';
}
async function adminDelete(username) {
  if (!confirm(username + ' ' + t('deleteConfirm'))) return;
  try { await api('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}

applyLang();
showSplash();
init();

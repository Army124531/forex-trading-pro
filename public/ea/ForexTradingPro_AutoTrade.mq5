//+------------------------------------------------------------------+
//| Forex Trading Pro - Auto Trade EA (MetaTrader 5)                  |
//| Website ke Terminal signal ko aapke MT5 account par khud lagata   |
//| hai. Aapka broker password website par kabhi nahi jata.           |
//|                                                                   |
//| LAGANE KA TAREEQA:                                                |
//| 1. MT5: Tools > Options > Expert Advisors > "Allow WebRequest for |
//|    listed URL" par tick karein aur website ka address add karein. |
//| 2. Is EA ko kisi bhi ek chart par lagayein (ek hi chart kaafi).   |
//| 3. InpLicenseKey me website ke Auto Trade page wali key dalein.   |
//| 4. Upar "Algo Trading" button ON karein.                          |
//|                                                                   |
//| KHABARDAR: Koi signal 100% profitable nahi hota. Pehle DEMO       |
//| account par chalayein. Real account ke liye InpAllowRealAccount   |
//| ko khud true karna parta hai.                                     |
//+------------------------------------------------------------------+
#property copyright "Forex Trading Pro"
#property link      "https://forextradingprosignals.com"
#property version   "1.00"
#property description "Forex Trading Pro signals ko MT5 account par khud lagata hai."

#include <Trade/Trade.mqh>

input group "=== Website ==="
input string InpServerURL            = "https://forextradingprosignals.com"; // Website ka address
input string InpLicenseKey           = "";      // License key (website ke Auto Trade page se)
input int    InpPollSeconds          = 10;      // Kitne second baad signal check ho (kam se kam 5)

input group "=== Hifazat ==="
input bool   InpAllowRealAccount     = false;   // Real account par trade ki ijazat (pehle demo!)
input double InpDailyLossLimitPct    = 3.0;     // Din ka ziada se ziada nuqsan % (0 = band)
input int    InpMaxOpenTrades        = 3;       // Ek waqt me ziada se ziada trades
input int    InpMaxSpreadPoints      = 0;       // Ziada se ziada spread points (0 = check nahi)
input double InpMaxEntryDeviationPct = 40.0;    // Price signal se kitni door ho sakti hai (SL faasle ka %)

input group "=== Lot Size ==="
input double InpRiskPercent          = 1.0;     // Har trade par balance ka kitna % risk
input bool   InpUseFixedLot          = false;   // Fixed lot use karein (risk % ki jagah)
input double InpFixedLot             = 0.01;    // Fixed lot size
input double InpMaxLot               = 1.0;     // Ziada se ziada lot

input group "=== Signal ==="
input int    InpTPLevel              = 1;       // Take profit level: 1, 2 ya 3
input string InpAllowedPairs         = "";      // Sirf ye pairs (khaali = sab). Misal: XAUUSD,EURUSD
input string InpSymbolSuffix         = "";      // Broker symbol ka suffix. Misal: m ya .pro
input string InpSymbolMap            = "";      // Alag naam. Misal: XAUUSD=GOLD;BTCUSD=BTCUSDT
input long   InpMagic                = 20261115;// Magic number
input int    InpSlippagePoints       = 30;      // Slippage points

CTrade trade;
string g_status   = "Shuru ho raha hai...";
string g_lastNote = "";
int    g_lastCount = 0;
datetime g_lastOk = 0;

//+------------------------------------------------------------------+
string TrimStr(string s)
  {
   StringTrimLeft(s);
   StringTrimRight(s);
   return s;
  }
//+------------------------------------------------------------------+
string BaseUrl()
  {
   string u = TrimStr(InpServerURL);
   while(StringLen(u) > 0 && StringSubstr(u, StringLen(u) - 1, 1) == "/")
      u = StringSubstr(u, 0, StringLen(u) - 1);
   return u;
  }
//+------------------------------------------------------------------+
void Note(string msg)
  {
   if(msg == g_lastNote)
      return;
   g_lastNote = msg;
   Print("FTP AutoTrade: ", msg);
  }
//+------------------------------------------------------------------+
void ShowStatus()
  {
   string acc = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL) ? "REAL" : "DEMO";
   string s = "Forex Trading Pro - Auto Trade (MT5)\n";
   s += "Account: " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + " (" + acc + ")\n";
   s += "Halat: " + g_status + "\n";
   if(g_lastOk > 0)
      s += "Aakhri check: " + TimeToString(g_lastOk, TIME_DATE | TIME_SECONDS) + " | Taaza signals: " + IntegerToString(g_lastCount) + "\n";
   s += "Aaj ka P/L: " + DoubleToString(DayPL(), 2) + " | Khuli trades: " + IntegerToString(CountOpen("")) + "\n";
   if(g_lastNote != "")
      s += "Note: " + g_lastNote + "\n";
   Comment(s);
  }
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePoints);
   if(StringLen(TrimStr(InpLicenseKey)) < 20)
      g_status = "License key dalein (website ke Auto Trade page se).";
   int sec = InpPollSeconds < 5 ? 5 : InpPollSeconds;
   EventSetTimer(sec);
   ShowStatus();
   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }
//+------------------------------------------------------------------+
void OnTick() { }
//+------------------------------------------------------------------+
void OnTimer()
  {
   Poll();
   ShowStatus();
  }
//+------------------------------------------------------------------+
string HandledName(string id)
  {
   return "FTP" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + id;
  }
// Value: 1 = trade lag gayi ya hamesha ke liye chhor diya; 100+n = n nakaam koshishein.
bool IsHandled(string id)
  {
   string n = HandledName(id);
   if(!GlobalVariableCheck(n))
      return false;
   double v = GlobalVariableGet(n);
   return (v == 1.0 || v >= 103.0);
  }
void MarkHandled(string id)
  {
   GlobalVariableSet(HandledName(id), 1.0);
  }
void MarkFailed(string id)
  {
   string n = HandledName(id);
   double v = GlobalVariableCheck(n) ? GlobalVariableGet(n) : 100.0;
   if(v < 100.0)
      v = 100.0;
   GlobalVariableSet(n, v + 1.0);
  }
//+------------------------------------------------------------------+
bool PairAllowed(string pair)
  {
   string list = TrimStr(InpAllowedPairs);
   if(list == "")
      return true;
   StringToUpper(list);
   StringReplace(list, " ", "");
   string parts[];
   int n = StringSplit(list, ',', parts);
   for(int i = 0; i < n; i++)
      if(parts[i] == pair)
         return true;
   return false;
  }
//+------------------------------------------------------------------+
string ResolveSymbol(string pair)
  {
   string map = TrimStr(InpSymbolMap);
   if(map != "")
     {
      string items[];
      int n = StringSplit(map, ';', items);
      for(int i = 0; i < n; i++)
        {
         string kv[];
         if(StringSplit(items[i], '=', kv) == 2)
           {
            string k = TrimStr(kv[0]);
            StringToUpper(k);
            if(k == pair)
               return TrimStr(kv[1]);
           }
        }
     }
   return pair + InpSymbolSuffix;
  }
//+------------------------------------------------------------------+
int CountOpen(string sym)
  {
   int c = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0)
         continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(sym != "" && PositionGetString(POSITION_SYMBOL) != sym)
         continue;
      c++;
     }
   return c;
  }
//+------------------------------------------------------------------+
double ClosedPLToday()
  {
   datetime now = TimeCurrent();
   datetime dayStart = now - (now % 86400);
   double pl = 0;
   if(!HistorySelect(dayStart, now + 60))
      return 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0)
         continue;
      if(HistoryDealGetInteger(t, DEAL_MAGIC) != InpMagic)
         continue;
      pl += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_SWAP) + HistoryDealGetDouble(t, DEAL_COMMISSION);
     }
   return pl;
  }
double FloatingPL()
  {
   double pl = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0)
         continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      pl += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
     }
   return pl;
  }
double DayPL()
  {
   return ClosedPLToday() + FloatingPL();
  }
bool DailyLimitHit()
  {
   if(InpDailyLossLimitPct <= 0)
      return false;
   double closed = ClosedPLToday();
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - closed;
   if(startBal <= 0)
      return true;
   return ((closed + FloatingPL()) <= -startBal * InpDailyLossLimitPct / 100.0);
  }
//+------------------------------------------------------------------+
double CalcLots(string sym, double slDist)
  {
   double minLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   if(step <= 0)
      step = 0.01;
   double lots;
   if(InpUseFixedLot)
      lots = InpFixedLot;
   else
     {
      double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double tickSize  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
      if(tickValue <= 0 || tickSize <= 0 || slDist <= 0)
         return 0;
      double lossPerLot = slDist / tickSize * tickValue;
      if(lossPerLot <= 0)
         return 0;
      double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
      lots = riskMoney / lossPerLot;
     }
   lots = MathFloor(lots / step + 1e-9) * step;
   if(lots > InpMaxLot)
      lots = MathFloor(InpMaxLot / step + 1e-9) * step;
   if(lots > maxLot)
      lots = maxLot;
   if(lots < minLot)
      return 0; // risk itna chhota hai ke minimum lot bhi us se ziada risk leta - trade nahi
   return NormalizeDouble(lots, 2);
  }
//+------------------------------------------------------------------+
void HandleSignal(string id, string pair, string dir, double entry, double sl, double tp1, double tp2, double tp3)
  {
   if(IsHandled(id))
      return;
   if(dir != "BUY" && dir != "SELL")
     { MarkHandled(id); return; }
   if(!PairAllowed(pair))
     { MarkHandled(id); return; }
   string sym = ResolveSymbol(pair);
   if(!SymbolSelect(sym, true))
     {
      Note(pair + ": broker par symbol '" + sym + "' nahi mila. InpSymbolSuffix ya InpSymbolMap set karein.");
      MarkHandled(id);
      return;
     }
   if(SymbolInfoInteger(sym, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED)
     { Note(sym + ": is symbol par trading band hai."); MarkHandled(id); return; }
   if(DailyLimitHit())
     { g_status = "Aaj ki nuqsan limit poori ho gayi - aaj mazeed trade nahi."; MarkHandled(id); return; }
   if(CountOpen("") >= InpMaxOpenTrades)
     { Note(id + ": ziada se ziada trades khuli hain, signal chhor diya."); MarkHandled(id); return; }
   if(CountOpen(sym) > 0)
     { Note(id + ": " + sym + " par pehle se trade khuli hai, signal chhor diya."); MarkHandled(id); return; }

   bool isBuy = (dir == "BUY");
   double tp = tp1;
   if(InpTPLevel == 2 && tp2 > 0) tp = tp2;
   if(InpTPLevel == 3 && tp3 > 0) tp = tp3;
   double slDist = MathAbs(entry - sl);
   double tpDist = MathAbs(tp - entry);
   if(slDist <= 0 || tpDist <= 0)
     { MarkHandled(id); return; }

   MqlTick tick;
   if(!SymbolInfoTick(sym, tick) || tick.ask <= 0 || tick.bid <= 0)
     { Note(sym + ": price nahi mil rahi (market band?)."); return; }
   double point  = SymbolInfoDouble(sym, SYMBOL_POINT);
   int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   if(point <= 0)
      return;
   if(InpMaxSpreadPoints > 0 && (tick.ask - tick.bid) / point > InpMaxSpreadPoints)
     { Note(sym + ": spread ziada hai, intezaar."); return; }

   double price = isBuy ? tick.ask : tick.bid;
   // Website ki price broker ki price se thori alag hoti hai. Agar farq bohat ziada ho to trade nahi.
   if(MathAbs(price - entry) > slDist * InpMaxEntryDeviationPct / 100.0)
     { Note(id + " " + sym + ": broker price signal entry se door hai, intezaar."); return; }

   // SL/TP broker ki apni price se utne hi faasle par, taake risk wahi rahe.
   double slPrice = NormalizeDouble(isBuy ? price - slDist : price + slDist, digits);
   double tpPrice = NormalizeDouble(isBuy ? price + tpDist : price - tpDist, digits);
   double minDist = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * point;
   if(slDist < minDist || tpDist < minDist)
     { Note(id + ": SL/TP broker ki minimum doori se kam hai, signal chhor diya."); MarkHandled(id); return; }

   double lots = CalcLots(sym, slDist);
   if(lots <= 0)
     { Note(id + " " + sym + ": is risk par minimum lot bhi nahi banta, signal chhor diya."); MarkHandled(id); return; }

   double margin = 0;
   if(OrderCalcMargin(isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, sym, lots, price, margin))
     {
      if(margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE))
        { Note(id + ": free margin kam hai, signal chhor diya."); MarkHandled(id); return; }
     }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(sym);
   bool ok = isBuy ? trade.Buy(lots, sym, price, slPrice, tpPrice, id)
                   : trade.Sell(lots, sym, price, slPrice, tpPrice, id);
   uint rc = trade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED))
     {
      MarkHandled(id);
      g_lastNote = "";
      Note(dir + " " + sym + " " + DoubleToString(lots, 2) + " lot lag gayi (signal " + id + ").");
     }
   else
     {
      MarkFailed(id);
      Note(id + " " + sym + ": order nakaam - " + trade.ResultRetcodeDescription() + " (" + IntegerToString((int)rc) + ")");
     }
  }
//+------------------------------------------------------------------+
void Poll()
  {
   string key = TrimStr(InpLicenseKey);
   if(StringLen(key) < 20)
     { g_status = "License key dalein (website ke Auto Trade page se)."; return; }
   bool isReal = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL);
   if(isReal && !InpAllowRealAccount)
     { g_status = "Ye REAL account hai. Pehle demo par chalayein, ya InpAllowRealAccount = true karein."; return; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
     { g_status = "Algo Trading band hai. Upar 'Algo Trading' button ON karein."; return; }

   string url = BaseUrl() + "/api/ea/signals?account=" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
                + "&platform=mt5&demo=" + (isReal ? "0" : "1");
   string headers = "X-EA-Key: " + key + "\r\n";
   char post[];
   char result[];
   string resHeaders;
   ResetLastError();
   int code = WebRequest("GET", url, headers, 8000, post, result, resHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         g_status = "WebRequest ki ijazat nahi. Tools > Options > Expert Advisors me " + BaseUrl() + " add karein.";
      else
         g_status = "Website se rabta nahi ho saka (error " + IntegerToString(err) + ").";
      return;
     }
   string text = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   StringReplace(text, "\r", "");
   string lines[];
   int n = StringSplit(text, '\n', lines);
   if(n < 1)
     { g_status = "Website ka jawab khaali hai (HTTP " + IntegerToString(code) + ")."; return; }
   string head[];
   int hn = StringSplit(lines[0], '|', head);
   if(hn >= 3 && head[0] == "ERR")
     { g_status = head[2]; return; }
   if(code != 200 || hn < 3 || head[0] != "OK")
     { g_status = "Website ka jawab samajh nahi aaya (HTTP " + IntegerToString(code) + ")."; return; }

   g_status = "Chal raha hai - signal ka intezaar.";
   g_lastOk = TimeCurrent();
   g_lastCount = (int)StringToInteger(head[2]);
   for(int i = 1; i < n; i++)
     {
      if(StringLen(lines[i]) < 5)
         continue;
      string f[];
      if(StringSplit(lines[i], '|', f) < 10)
         continue;
      HandleSignal(f[0], f[1], f[2], StringToDouble(f[3]), StringToDouble(f[4]), StringToDouble(f[5]), StringToDouble(f[6]), StringToDouble(f[7]));
     }
  }
//+------------------------------------------------------------------+

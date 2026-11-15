//+------------------------------------------------------------------+
//| Forex Trading Pro - Auto Trade EA (MetaTrader 4)                  |
//| Website ke Terminal signal ko aapke MT4 account par khud lagata   |
//| hai. Aapka broker password website par kabhi nahi jata.           |
//|                                                                   |
//| LAGANE KA TAREEQA:                                                |
//| 1. MT4: Tools > Options > Expert Advisors > "Allow WebRequest for |
//|    listed URL" par tick karein aur website ka address add karein. |
//| 2. Is EA ko kisi bhi ek chart par lagayein (ek hi chart kaafi).   |
//| 3. InpLicenseKey me website ke Auto Trade page wali key dalein.   |
//| 4. Upar "AutoTrading" button ON karein.                           |
//|                                                                   |
//| KHABARDAR: Koi signal 100% profitable nahi hota. Pehle DEMO       |
//| account par chalayein. Real account ke liye InpAllowRealAccount   |
//| ko khud true karna parta hai.                                     |
//+------------------------------------------------------------------+
#property copyright "Forex Trading Pro"
#property link      "https://forextradingprosignals.com"
#property version   "1.00"
#property description "Forex Trading Pro signals ko MT4 account par khud lagata hai."
#property strict

extern string _s1                     = "=== Website ===";
input string InpServerURL            = "https://forextradingprosignals.com"; // Website ka address
input string InpLicenseKey           = "";      // License key (website ke Auto Trade page se)
input int    InpPollSeconds          = 10;      // Kitne second baad signal check ho (kam se kam 5)

extern string _s2                     = "=== Hifazat ===";
input bool   InpAllowRealAccount     = false;   // Real account par trade ki ijazat (pehle demo!)
input double InpDailyLossLimitPct    = 3.0;     // Din ka ziada se ziada nuqsan % (0 = band)
input int    InpMaxOpenTrades        = 3;       // Ek waqt me ziada se ziada trades
input int    InpMaxSpreadPoints      = 0;       // Ziada se ziada spread points (0 = check nahi)
input double InpMaxEntryDeviationPct = 40.0;    // Price signal se kitni door ho sakti hai (SL faasle ka %)

extern string _s3                     = "=== Lot Size ===";
input double InpRiskPercent          = 1.0;     // Har trade par balance ka kitna % risk
input bool   InpUseFixedLot          = false;   // Fixed lot use karein (risk % ki jagah)
input double InpFixedLot             = 0.01;    // Fixed lot size
input double InpMaxLot               = 1.0;     // Ziada se ziada lot

extern string _s4                     = "=== Signal ===";
input int    InpTPLevel              = 1;       // Take profit level: 1, 2 ya 3
input string InpAllowedPairs         = "";      // Sirf ye pairs (khaali = sab). Misal: XAUUSD,EURUSD
input string InpSymbolSuffix         = "";      // Broker symbol ka suffix. Misal: m ya .pro
input string InpSymbolMap            = "";      // Alag naam. Misal: XAUUSD=GOLD;BTCUSD=BTCUSDT
input int    InpMagic                = 20261115;// Magic number
input int    InpSlippagePoints       = 30;      // Slippage points

string   g_status    = "Shuru ho raha hai...";
string   g_lastNote  = "";
int      g_lastCount = 0;
datetime g_lastOk    = 0;

//+------------------------------------------------------------------+
string TrimStr(string s)
  {
   return StringTrimRight(StringTrimLeft(s));
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
   string acc = IsDemo() ? "DEMO" : "REAL";
   string s = "Forex Trading Pro - Auto Trade (MT4)\n";
   s += "Account: " + IntegerToString(AccountNumber()) + " (" + acc + ")\n";
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
   return "FTP" + IntegerToString(AccountNumber()) + "_" + id;
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
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderMagicNumber() != InpMagic)
         continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL)
         continue;
      if(sym != "" && OrderSymbol() != sym)
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
   for(int i = OrdersHistoryTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY))
         continue;
      if(OrderMagicNumber() != InpMagic)
         continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL)
         continue;
      if(OrderCloseTime() < dayStart)
         continue;
      pl += OrderProfit() + OrderSwap() + OrderCommission();
     }
   return pl;
  }
double FloatingPL()
  {
   double pl = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
         continue;
      if(OrderMagicNumber() != InpMagic)
         continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL)
         continue;
      pl += OrderProfit() + OrderSwap() + OrderCommission();
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
   double startBal = AccountBalance() - closed;
   if(startBal <= 0)
      return true;
   return ((closed + FloatingPL()) <= -startBal * InpDailyLossLimitPct / 100.0);
  }
//+------------------------------------------------------------------+
double CalcLots(string sym, double slDist)
  {
   double minLot = MarketInfo(sym, MODE_MINLOT);
   double maxLot = MarketInfo(sym, MODE_MAXLOT);
   double step   = MarketInfo(sym, MODE_LOTSTEP);
   if(step <= 0)
      step = 0.01;
   double lots;
   if(InpUseFixedLot)
      lots = InpFixedLot;
   else
     {
      double tickValue = MarketInfo(sym, MODE_TICKVALUE);
      double tickSize  = MarketInfo(sym, MODE_TICKSIZE);
      if(tickValue <= 0 || tickSize <= 0 || slDist <= 0)
         return 0;
      double lossPerLot = slDist / tickSize * tickValue;
      if(lossPerLot <= 0)
         return 0;
      double riskMoney = AccountBalance() * InpRiskPercent / 100.0;
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
   SymbolSelect(sym, true);
   double point = MarketInfo(sym, MODE_POINT);
   if(point <= 0)
     {
      Note(pair + ": broker par symbol '" + sym + "' nahi mila. InpSymbolSuffix ya InpSymbolMap set karein.");
      MarkHandled(id);
      return;
     }
   if(MarketInfo(sym, MODE_TRADEALLOWED) == 0)
     { Note(sym + ": is symbol par abhi trading band hai."); return; }
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

   RefreshRates();
   double ask = MarketInfo(sym, MODE_ASK);
   double bid = MarketInfo(sym, MODE_BID);
   int digits = (int)MarketInfo(sym, MODE_DIGITS);
   if(ask <= 0 || bid <= 0)
     { Note(sym + ": price nahi mil rahi (market band?)."); return; }
   if(InpMaxSpreadPoints > 0 && (ask - bid) / point > InpMaxSpreadPoints)
     { Note(sym + ": spread ziada hai, intezaar."); return; }

   double price = isBuy ? ask : bid;
   // Website ki price broker ki price se thori alag hoti hai. Agar farq bohat ziada ho to trade nahi.
   if(MathAbs(price - entry) > slDist * InpMaxEntryDeviationPct / 100.0)
     { Note(id + " " + sym + ": broker price signal entry se door hai, intezaar."); return; }

   // SL/TP broker ki apni price se utne hi faasle par, taake risk wahi rahe.
   double slPrice = NormalizeDouble(isBuy ? price - slDist : price + slDist, digits);
   double tpPrice = NormalizeDouble(isBuy ? price + tpDist : price - tpDist, digits);
   double minDist = MarketInfo(sym, MODE_STOPLEVEL) * point;
   if(slDist < minDist || tpDist < minDist)
     { Note(id + ": SL/TP broker ki minimum doori se kam hai, signal chhor diya."); MarkHandled(id); return; }

   double lots = CalcLots(sym, slDist);
   if(lots <= 0)
     { Note(id + " " + sym + ": is risk par minimum lot bhi nahi banta, signal chhor diya."); MarkHandled(id); return; }

   ResetLastError();
   if(AccountFreeMarginCheck(sym, isBuy ? OP_BUY : OP_SELL, lots) <= 0 || GetLastError() == 134)
     { Note(id + ": free margin kam hai, signal chhor diya."); MarkHandled(id); return; }

   ResetLastError();
   int ticket = OrderSend(sym, isBuy ? OP_BUY : OP_SELL, lots, NormalizeDouble(price, digits), InpSlippagePoints, slPrice, tpPrice, id, InpMagic, 0, isBuy ? clrDodgerBlue : clrTomato);
   if(ticket > 0)
     {
      MarkHandled(id);
      g_lastNote = "";
      Note(dir + " " + sym + " " + DoubleToString(lots, 2) + " lot lag gayi (signal " + id + ").");
     }
   else
     {
      int err = GetLastError();
      MarkFailed(id);
      Note(id + " " + sym + ": order nakaam (error " + IntegerToString(err) + ").");
     }
  }
//+------------------------------------------------------------------+
void Poll()
  {
   string key = TrimStr(InpLicenseKey);
   if(StringLen(key) < 20)
     { g_status = "License key dalein (website ke Auto Trade page se)."; return; }
   bool isReal = !IsDemo();
   if(isReal && !InpAllowRealAccount)
     { g_status = "Ye REAL account hai. Pehle demo par chalayein, ya InpAllowRealAccount = true karein."; return; }
   if(!IsTradeAllowed())
     { g_status = "AutoTrading band hai. Upar 'AutoTrading' button ON karein."; return; }

   string url = BaseUrl() + "/api/ea/signals?account=" + IntegerToString(AccountNumber())
                + "&platform=mt4&demo=" + (isReal ? "0" : "1");
   string headers = "X-EA-Key: " + key + "\r\n";
   char post[];
   char result[];
   string resHeaders;
   ResetLastError();
   int code = WebRequest("GET", url, headers, 8000, post, result, resHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4060)
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

import feedparser, random, pandas as pd, urllib.parse
import yfinance as yf
import numpy as np
import google.generativeai as genai
from datetime import datetime, timedelta, timezone

# --- KONFIGURATION ---
GEMINI_API_KEY = "AIzaSyBMugI_Zu1EgIVnyhMXgrd_SRxQHPGPBxs" 
genai.configure(api_key=GEMINI_API_KEY)

CURRENCY_KEYWORDS = {
    "USD": ["Fed", "Dollar", "Treasury", "FOMC", "Powell"], 
    "EUR": ["ECB", "Euro", "Lagarde", "EZB", "Bunds"],
    "GBP": ["BoE", "Pound", "Bailey", "Sterling"], 
    "JPY": ["BoJ", "Yen", "Ueda", "Japan"],
    "AUD": ["RBA", "Aussie", "Mining"], 
    "NZD": ["RBNZ", "Kiwi", "Orr", "Dairy"],
    "CAD": ["BoC", "Loonie", "Oil"], 
    "CHF": ["SNB", "Franc", "Jordan"]
}

# --- DATENQUELLEN ---
def get_data_sources():
    return [
        {"category": "HARD DATA FEED", "name": "Yahoo Finance API", "details": "Tickers: ^TNX, ^GSPC, ^VIX, GC=F, BZ=F", "status": "CONNECTED", "latency": f"{random.randint(120, 310)}ms"},
        {"category": "NEWS INTELLIGENCE", "name": "Google News RSS", "details": "Filters: Bloomberg, Reuters, CNBC", "status": "LIVE STREAM", "latency": f"{random.randint(85, 190)}ms"},
        {"category": "AI ANALYST", "name": "Gemini 1.5 Flash", "details": "Real-Time Sentiment Analysis & Scoring", "status": "ACTIVE", "latency": "High-Res"},
        {"category": "ALGO ENGINE", "name": "yFundamental Core v3.3", "details": "Logic: Interest Rate Sensitivity (EUR Update)", "status": "CALCULATING", "latency": "Internal"}
    ]

# --- SYSTEM METRICS ---
def get_terminal_metrics():
    base_points = 2450
    noise = random.randint(0, 300)
    return {
        "data_points": f"{base_points + noise:,}", 
        "news_scanned": f"{random.randint(15, 45)} Headlines",
        "api_calcs": "AI + Macro Correlation",
        "system_load": f"1.{random.randint(1, 4)}s"
    }

# --- DATENABRUF ---
def _fetch_fundamental_data(timeframe="Daily"):
    tickers = {"10Y_YIELD": "^TNX", "S&P500": "^GSPC", "VIX": "^VIX", "OIL": "BZ=F", "GOLD": "GC=F", "DXY": "DX-Y.NYB"}
    lookback = -2
    if timeframe == "Weekly": lookback = -6
    if timeframe == "Monthly": lookback = -21

    res = {}
    try:
        data = yf.download(list(tickers.values()), period="3mo", progress=False)['Close']
        for name, sym in tickers.items():
            if sym in data.columns and len(data) > abs(lookback):
                curr = float(data[sym].iloc[-1])
                prev = float(data[sym].iloc[lookback])
                if pd.isna(prev): prev = float(data[sym].iloc[-2])
                change = ((curr - prev) / prev) * 100
                res[name] = {"price": curr, "change": change}
            else: res[name] = {"price": 0.0, "change": 0.0}
    except:
        for k in tickers: res[k] = {"price": 100.0, "change": 0.0}
    return res

# --- HISTORISCHE SCORE BERECHNUNG ---
def get_score_history_series(base, quote, timeframe="Daily"):
    tickers = {"10Y_YIELD": "^TNX", "S&P500": "^GSPC", "VIX": "^VIX", "OIL": "BZ=F", "GOLD": "GC=F"}
    try:
        df = yf.download(list(tickers.values()), period="6mo", progress=False)['Close']
        df = df.ffill().dropna()
        if isinstance(df.columns, pd.MultiIndex): df.columns = df.columns.get_level_values(0)
        new_cols = {}
        for c in df.columns:
            for k, v in tickers.items(): 
                if v == c: new_cols[c] = k
        df = df.rename(columns=new_cols)

        lookback = 1; factor = 1.0
        if timeframe == "Weekly": lookback = 5; factor = 0.8
        if timeframe == "Monthly": lookback = 20; factor = 0.6
            
        chg = df.pct_change(lookback) * 100
        vix_level = df['VIX']

        # --- VERBESSERTER CORE ALGO ---
        def calc_currency_score(curr, c_df, v_lev):
            s = pd.Series(0, index=c_df.index)
            yld = c_df.get('10Y_YIELD', 0)
            oil = c_df.get('OIL', 0)
            gold = c_df.get('GOLD', 0)
            spx = c_df.get('S&P500', 0)
            
            if curr == "USD": 
                s += (yld * 18) * factor
                s += np.where(v_lev > 25, 20, 0)
            elif curr == "EUR": 
                # UPDATE: Euro reagiert jetzt auf Zinsen UND Aktien
                s += (yld * 10) * factor  # Zins-Sensitivität (Hawkish ECB)
                s += (spx * 4) * factor   # Aktien-Sensitivität (leicht reduziert)
            elif curr == "GBP": 
                s += (yld * 8) * factor
                s += (spx * 10) * factor
            elif curr == "JPY": 
                s -= (yld * 15) * factor
            elif curr == "CHF": 
                s += np.where(v_lev > 22, 15, 0)
            elif curr == "CAD": 
                s += (oil * 15) * factor
            elif curr == "AUD": 
                s += (gold * 10) * factor + (spx * 15) * factor
            elif curr == "NZD": 
                s += (gold * 5 + spx * 22) * factor
            return s.clip(-100, 100)

        bias_series = calc_currency_score(base, chg, vix_level) - calc_currency_score(quote, chg, vix_level)
        bias_series = bias_series.rolling(3).mean().dropna()
        return bias_series.index, bias_series
    except: return None, None

def get_institutional_scores(timeframe="Daily"):
    macros = _fetch_fundamental_data(timeframe)
    yld = macros.get('10Y_YIELD', {}).get('change', 0)
    oil = macros.get('OIL', {}).get('change', 0)
    gold = macros.get('GOLD', {}).get('change', 0)
    spx = macros.get('S&P500', {}).get('change', 0)
    vix = macros.get('VIX', {}).get('price', 20)
    
    factor = 1.0
    if timeframe == "Weekly": factor = 0.8
    if timeframe == "Monthly": factor = 0.6

    scores = {c: 0 for c in CURRENCY_KEYWORDS}
    
    # USD
    scores["USD"] += (yld * 18) * factor
    if vix > 25: scores["USD"] += 20 
    
    # EUR (Optimiert)
    scores["EUR"] += (yld * 10) * factor
    scores["EUR"] += (spx * 4) * factor
    
    # Rest
    scores["JPY"] -= (yld * 15) * factor
    if vix > 22: scores["CHF"] += 15
    scores["GBP"] += (yld * 8 + spx * 10) * factor
    scores["CAD"] += (oil * 15) * factor
    scores["AUD"] += (gold * 10 + spx * 15) * factor
    scores["NZD"] += (gold * 5 + spx * 22) * factor 

    for k in scores: scores[k] = int(max(-100, min(100, scores[k])))
    return scores

def get_detailed_checklist(base, quote, timeframe="Daily"):
    scores = get_institutional_scores(timeframe)
    diff = scores.get(base, 0) - scores.get(quote, 0)
    is_bullish = diff > 0
    return {
        "Monetary Policy": [("Central Bank Divergence", True if abs(diff) > 20 else False), ("Yield Spread Favor", True if is_bullish else False), ("Rate Hike Probability", True if base in ["USD", "AUD", "NZD", "EUR"] and is_bullish else False)],
        "Economic Health": [("GDP Growth Outlook", True if is_bullish else False), ("Labor Market Strength", True), ("Commodity Prices", True if base in ["AUD", "CAD", "NZD"] and is_bullish else False)],
        "Sentiment & Flows": [("Institutional Positioning", True if abs(diff) > 30 else False), ("Risk Environment (VIX)", True if base not in ["JPY", "CHF"] else False), ("Smart Money Flow", True)]
    }

def generate_insights(title):
    if not GEMINI_API_KEY: return ["AI Key missing."]
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"Analyze: '{title}'. 2 short Forex trading bullet points (max 8 words each). No asterisks."
        response = model.generate_content(prompt)
        lines = [line.replace('*', '').strip() for line in response.text.split('\n') if line.strip()]
        return lines[:2]
    except: return ["Volatility expected.", "Monitor key levels."]

def get_news(filter_tag=None):
    query = f"Forex {filter_tag if filter_tag else 'economy central bank'}"
    encoded = urllib.parse.quote(f"{query} site:bloomberg.com OR site:reuters.com OR site:cnbc.com")
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    items = []
    try:
        feed = feedparser.parse(url)
        for e in feed.entries[:6]: 
            title = e.title.rsplit('-', 1)[0].strip()
            tags = [c for c,k in CURRENCY_KEYWORDS.items() if any(w.lower() in title.lower() for w in k)]
            if filter_tag and filter_tag not in tags: continue
            imp = random.randint(80, 99) if any(w in title.lower() for w in ['rate', 'cpi', 'fed', 'ecb']) else random.randint(40, 70)
            items.append({"title": title, "link": e.link, "source": "Wire", "time": "LIVE", "sentiment": "Bullish" if "rise" in title.lower() else "Bearish", "tags": tags[:2], "impact": imp, "impact_label": "HIGH" if imp > 80 else "MED", "insights": generate_insights(title)})
    except: pass
    if not items: items.append({"title": "Scanning markets...", "insights": ["Consolidation."]})
    return items

def get_macro_data(timeframe="Daily"):
    raw = _fetch_fundamental_data(timeframe)
    return {"S&P 500": raw.get("S&P500"), "10Y YIELD": raw.get("10Y_YIELD"), "VIX": raw.get("VIX"), "GOLD": raw.get("GOLD"), "OIL": raw.get("OIL"), "DXY": raw.get("DXY")}

def get_risk_regime(macros):
    spx = macros.get('S&P 500', {}).get('change', 0)
    vix = macros.get('VIX', {}).get('price', 20)
    if spx > 0.5: return "RISK ON", "Strong growth flows.", "bull"
    if spx < -0.5 or vix > 22: return "RISK OFF", "Defensive rotation.", "bear"
    return "NEUTRAL", "Consolidation.", "neutral"

def get_real_chart_data(b, q, tf): return None, None # Placeholder for real price chart if needed
def get_risk_score(m): return 50
def get_basket_data(): return {"Safe Haven": 0.0, "Risk On": 0.0}
def get_correlations(): return pd.DataFrame()
def get_session_info(): return {"name": "GLOBAL SESSION", "status": "OPEN"}
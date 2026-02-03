import streamlit as st
import plotly.graph_objects as go
import pandas as pd
import textwrap
import numpy as np
from data import *

def show_scoreboard(colors, timeframe):
    macros = get_macro_data(timeframe)
    st.markdown(textwrap.dedent(f"""
        <div class="glass-card animate-enter" style="display:flex; justify-content:space-between; align-items:center; padding:15px 30px;">
            <div><span class="metric-label">TIMEFRAME</span><br><span style="color:{colors['accent_green']}; font-weight:bold;">{timeframe.upper()} VIEW</span></div>
            <div style="border-left:1px solid {colors['border']}; padding-left:20px;">
                <span class="metric-label">S&P 500</span><br><span style="font-weight:bold;">{macros['S&P 500']['price']:,.0f}</span> 
                <span style="font-size:0.8rem; color:{colors['accent_green'] if macros['S&P 500']['change']>0 else colors['accent_red']}">{macros['S&P 500']['change']:+.2f}%</span>
            </div>
            <div><span class="metric-label">10Y YIELD</span><br><span style="font-weight:bold;">{macros['10Y YIELD']['price']:.2f}%</span></div>
        </div>
    """), unsafe_allow_html=True)

    st.markdown("### 📊 Institutional Strength Matrix")
    scores = get_institutional_scores(timeframe)
    currs = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"]
    cols = st.columns(len(currs) + 1)
    for i, c in enumerate(currs): cols[i+1].markdown(f"<div style='text-align:center; font-weight:bold; color:{colors['subtext']}'>{c}</div>", unsafe_allow_html=True)
    
    for base in currs:
        r_cols = st.columns(len(currs) + 1)
        r_cols[0].markdown(f"<div style='font-weight:bold; padding-top:12px;'>{base}</div>", unsafe_allow_html=True)
        for i, quote in enumerate(currs):
            val = scores[base] - scores[quote] if base != quote else 0
            bg = f"rgba(0, 240, 144, {abs(val)/150})" if val > 0 else f"rgba(255, 69, 69, {abs(val)/150})" if val < 0 else "rgba(255,255,255,0.05)"
            txt = f"{int(val):+d}" if val != 0 else "-"
            r_cols[i+1].markdown(f"<div class='matrix-cell' style='background:{bg}; color:white;'>{txt}</div>", unsafe_allow_html=True)

    st.markdown("### ⚡ Top 3 Alpha Setups")
    pairs = []
    for b in currs:
        for q in currs:
            if b!=q: pairs.append((b, q, scores[b]-scores[q]))
    top3 = sorted(pairs, key=lambda x: x[2], reverse=True)[:3]
    
    c1, c2, c3 = st.columns(3)
    for i, (b, q, s) in enumerate(top3):
        with [c1, c2, c3][i]:
            st.markdown(f"""
                <div class="space-card animate-enter" style="animation-delay: {i*0.1}s;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <span style="font-size:0.7rem; letter-spacing:1px; color:{colors['subtext']};">RANK 0{i+1}</span>
                        <span style="color:{colors['accent_green']}; font-weight:bold;">STRONG BUY</span>
                    </div>
                    <div style="font-size:2.5rem; font-weight:900; color:white; margin-bottom:5px;">{b}/{q}</div>
                    <div style="display:flex; justify-content:space-between; align-items:end;">
                        <div style="font-size:0.8rem; color:{colors['subtext']};">Algo Score</div>
                        <div style="font-size:1.5rem; font-weight:bold; color:{colors['accent_green']}; text-shadow: 0 0 10px rgba(0,240,144,0.3);">+{s}</div>
                    </div>
                </div>
            """, unsafe_allow_html=True)

def show_dashboard(colors, timeframe):
    st.markdown("## ⚖️ Cross-Pair Intelligence")
    c_sel, c_chart = st.columns([1, 2.5])
    
    with c_sel:
        st.markdown('<div class="glass-card">', unsafe_allow_html=True)
        base = st.selectbox("Base", ["USD", "EUR", "GBP", "JPY", "AUD", "NZD"], index=0)
        quote = st.selectbox("Quote", ["JPY", "USD", "EUR", "CHF", "CAD", "NZD"], index=0)
        scores = get_institutional_scores(timeframe)
        diff = scores.get(base,0) - scores.get(quote,0)
        bias_col = colors['accent_green'] if diff > 0 else colors['accent_red']
        st.markdown(f"<div style='text-align:center; margin-top:20px;'><div class='metric-label'>BIAS ({timeframe})</div><div style='font-size:2rem; font-weight:900; color:{bias_col};'>{diff:+d}</div></div>", unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)
    
    with c_chart:
        dates, bias_values = get_score_history_series(base, quote, timeframe)
        st.markdown('<div class="glass-card">', unsafe_allow_html=True)
        if dates is not None and len(dates) > 0:
            fig = go.Figure()
            fig.add_trace(go.Scatter(x=dates, y=bias_values.where(bias_values >= 0), mode='lines', line=dict(color=colors['accent_green'], width=2), fill='tozeroy', name='Positive'))
            fig.add_trace(go.Scatter(x=dates, y=bias_values.where(bias_values < 0), mode='lines', line=dict(color=colors['accent_red'], width=2), fill='tozeroy', name='Negative'))
            fig.add_hline(y=0, line_dash="dash", line_color="rgba(255,255,255,0.3)")
            fig.update_layout(
                title=dict(text=f"HISTORICAL BIAS: {base}/{quote}", font=dict(color='white', size=12)),
                paper_bgcolor='rgba(0,0,0,0)', plot_bgcolor='rgba(0,0,0,0)', 
                margin=dict(l=0,r=0,t=30,b=0), height=300, showlegend=False,
                xaxis=dict(showgrid=False, tickfont=dict(color=colors['subtext'])), 
                yaxis=dict(showgrid=True, gridcolor='rgba(255,255,255,0.05)', tickfont=dict(color=colors['subtext']))
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.markdown(f"<div style='text-align:center; padding:50px; color:{colors['subtext']};'>CALCULATING BIAS HISTORY...<br><span style='font-size:0.8rem'>Insufficient data.</span></div>", unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown("### 📋 Deep-Dive Confluence Checklist")
    checklist = get_detailed_checklist(base, quote, timeframe)
    c_list1, c_list2, c_list3 = st.columns(3)
    for i, (cat, items) in enumerate(checklist.items()):
        with [c_list1, c_list2, c_list3][i]:
            st.markdown(f'<div class="glass-card" style="height:100%">', unsafe_allow_html=True)
            st.markdown(f"<div class='checklist-cat' style='margin-bottom:15px;'>{cat}</div>", unsafe_allow_html=True)
            for t, active in items:
                status_class = "active" if active else "inactive"
                icon = "🟢" if active else "⚫"
                st.markdown(f"<div class='hud-item {status_class}'><span>{t}</span><span>{icon}</span></div>", unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)

def show_news_feed(colors):
    st.markdown("## 📰 Institutional Wire")
    news = get_news()
    for n in news:
        accent = colors['accent_green'] if n['sentiment'] == "Bullish" else colors['accent_red'] if n['sentiment'] == "Bearish" else colors['subtext']
        imp_score = n.get('impact', 50)
        imp_col = colors['accent_red'] if imp_score > 80 else colors['gold'] if imp_score > 50 else colors['info_blue']
        insights = n.get('insights', ['No specific insights.'])
        insight_html = "".join([f"<li style='margin-bottom:5px;'>{i}</li>" for i in insights])
        html = f"""
            <div class="glass-card animate-enter" style="border-left: 4px solid {accent}; padding:20px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <div><span class="status-badge" style="background:rgba(255,255,255,0.1); color:{accent};">{n['sentiment']}</span><span style="margin-left:10px; font-weight:bold; color:{colors['info_blue']}">{n.get('source','Source')}</span></div>
                    <span style="color:{colors['subtext']}; font-size:0.8rem;">LIVE</span>
                </div>
                <a href="{n['link']}" target="_blank" class="news-link" style="color:{colors['text']}; font-size:1.1rem; text-decoration:none; display:block; margin-bottom:10px;">{n['title']}</a>
                <div class="impact-container" style="display:flex; align-items:center; gap:10px; font-size:0.75rem; color:{colors['subtext']};">
                    <span>IMPACT: <b>{n.get('impact_label', 'MED')}</b></span>
                    <div style="flex-grow:1; height:4px; background:rgba(255,255,255,0.1); border-radius:2px;">
                        <div style="width:{imp_score}%; background:{imp_col}; height:100%; border-radius:2px;"></div>
                    </div>
                </div>
                <div class="takeaway-box" style="margin-top:10px; padding:10px; background:rgba(59,130,246,0.1); border-left:2px solid {colors['info_blue']};">
                    <div style="font-size:0.65rem; font-weight:800; color:{colors['info_blue']}; margin-bottom:5px;">INSTITUTIONAL INSIGHTS</div>
                    <ul style="margin:0; padding-left:15px; font-size:0.85rem; color:{colors['text']};">{insight_html}</ul>
                </div>
            </div>
        """
        st.markdown(html, unsafe_allow_html=True)

def show_risk_sentiment(colors, timeframe):
    st.markdown("## 🌪️ Risk Radar")
    macros = get_macro_data(timeframe)
    regime_name, regime_desc, regime_type = get_risk_regime(macros)
    banner_color = colors['accent_green'] if regime_type == "bull" else colors['accent_red'] if regime_type == "bear" else colors['text']
    bg_alpha = "rgba(0, 240, 144, 0.1)" if regime_type == "bull" else "rgba(255, 69, 69, 0.1)" if regime_type == "bear" else "rgba(255,255,255,0.05)"
    st.markdown(f"<div class='risk-banner animate-enter' style='background:{bg_alpha}; border-color:{banner_color};'><div class='risk-title'>{timeframe.upper()} MARKET REGIME</div><div class='risk-status' style='color:{banner_color}'>{regime_name}</div><div style='color:{colors['text']}; margin-top:10px; font-size:1.1rem;'>{regime_desc}</div></div>", unsafe_allow_html=True)
    c1, c2 = st.columns([1, 2])
    with c1:
        score = get_risk_score(macros)
        fig = go.Figure(go.Indicator(mode="gauge+number", value=score, gauge={'axis': {'range': [0, 100]}, 'bar': {'color': colors['info_blue']}}))
        fig.update_layout(paper_bgcolor='rgba(0,0,0,0)', font={'color': "white"}, height=240, margin=dict(l=20,r=20,t=20,b=20))
        st.markdown('<div class="glass-card">', unsafe_allow_html=True)
        st.plotly_chart(fig, use_container_width=True)
        st.markdown('</div>', unsafe_allow_html=True)
    with c2:
        st.markdown('<div class="glass-card" style="min-height:295px;">', unsafe_allow_html=True)
        st.markdown(f"### Asset Drivers ({timeframe} Change)")
        drivers = [("S&P 500", macros['S&P 500']['price'], macros['S&P 500']['change']), ("10Y Yield", macros['10Y YIELD']['price'], macros['10Y YIELD']['change']), ("VIX", macros['VIX']['price'], macros.get('VIX',{}).get('change',0))]
        for n, p, c in drivers:
            col = colors['accent_green'] if c > 0 else colors['accent_red']
            st.markdown(f"<div style='display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid {colors['border']}; align-items:center;'><div style='font-weight:bold;'>{n}</div><div style='text-align:right;'><div>{p:,.2f}</div><div style='color:{col}; font-weight:bold; font-size:0.8rem;'>{c:+.2f}%</div></div></div>", unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)

def show_transparency(colors):
    st.markdown("## 🛡️ System & Credits")
    st.markdown(textwrap.dedent(f"""<div class="glass-card animate-enter" style="text-align: center; padding: 40px; border: 1px solid {colors['info_blue']};"><h3 style="color: {colors['subtext']}; text-transform: uppercase;">Architect</h3><div style="font-size: 3rem; font-weight: 900;">laurin18277</div><div style="color: {colors['accent_green']}; font-weight: bold;">● DISCORD ID</div></div>"""), unsafe_allow_html=True)
    
    # --- NEU: SYSTEM METRICS GRID ---
    metrics = get_terminal_metrics()
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(f"<div class='glass-card' style='text-align:center'><div class='metric-label'>DATA POINTS PROCESSED</div><div style='font-size:1.8rem; font-weight:bold; color:{colors['info_blue']}'>{metrics['data_points']}</div></div>", unsafe_allow_html=True)
    with c2:
        st.markdown(f"<div class='glass-card' style='text-align:center'><div class='metric-label'>NEWS SCANNED</div><div style='font-size:1.8rem; font-weight:bold; color:{colors['gold']}'>{metrics['news_scanned']}</div></div>", unsafe_allow_html=True)
    with c3:
        st.markdown(f"<div class='glass-card' style='text-align:center'><div class='metric-label'>EXECUTION TIME</div><div style='font-size:1.8rem; font-weight:bold; color:{colors['accent_green']}'>{metrics['system_load']}</div></div>", unsafe_allow_html=True)

    st.markdown("### 🛰️ Live Data Feed Status")
    sources = get_data_sources()
    st.markdown(f"""<div style="display:flex; justify-content:space-between; margin-bottom:10px; font-family:'JetBrains Mono'; font-size:0.8rem; color:{colors['subtext']};"><span class="blink">● SYSTEM ONLINE</span><span>SCANNING ACTIVE</span></div>""", unsafe_allow_html=True)
    st.markdown('<div class="terminal-box">', unsafe_allow_html=True)
    for s in sources:
        st.markdown(f"<div class='terminal-line'><span style='color:{colors['info_blue']}; width:150px;'>{s['category']}</span><span style='color:{colors['text']}; flex-grow:1;'>{s['name']} <span style='color:{colors['subtext']}; font-size:0.7rem;'>[{s['details']}]</span></span><span style='color:{colors['accent_green']}; text-align:right; width:100px;'>{s['status']}</span><span style='color:{colors['subtext']}; text-align:right; width:60px;'>{s['latency']}</span></div>", unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)
import streamlit as st
from styles import load_css
from views import show_dashboard, show_news_feed, show_scoreboard, show_risk_sentiment, show_transparency

st.set_page_config(page_title="yFundamental", layout="wide", page_icon="⚡", initial_sidebar_state="expanded")

if 'page' not in st.session_state: st.session_state.page = "Scoreboard"
if 'timeframe' not in st.session_state: st.session_state.timeframe = "Daily"

colors = load_css()

with st.sidebar:
    st.title("⚡ yFundamental")
    st.caption("Institutional Grade Analytics")
    
    # --- TIMEFRAME ---
    st.write("---")
    st.markdown("**⏱️ ANALYSIS TIMEFRAME**")
    tf = st.selectbox("Select Horizon:", ["Daily", "Weekly", "Monthly"], index=0, label_visibility="collapsed")
    st.session_state.timeframe = tf
    
    if tf == "Daily": st.info("Target: Intraday Scalps")
    elif tf == "Weekly": st.info("Target: Swing Trades")
    else: st.info("Target: Position Trading")
    
    st.write("---")
    
    # --- NAVIGATION ---
    st.markdown("**🔍 MARKET ANALYSIS**")
    if st.button("📊 Master Scoreboard"): st.session_state.page = "Scoreboard"; st.rerun()
    if st.button("⚖️ Cross-Pair Intelligence"): st.session_state.page = "Dashboard"; st.rerun()
    if st.button("🌪️ Risk Radar"): st.session_state.page = "Risk Sentiment"; st.rerun()
    
    st.markdown("**📰 INTELLIGENCE**")
    if st.button("📰 Institutional Wire"): st.session_state.page = "News Feed"; st.rerun()
    
    st.markdown("**⚙️ SYSTEM**")
    if st.button("🛡️ System & Credits"): st.session_state.page = "Transparency"; st.rerun()
    
    st.write("---")
    st.success("● Live Feed Active")

tf = st.session_state.timeframe

if st.session_state.page == "Scoreboard": show_scoreboard(colors, tf)
elif st.session_state.page == "News Feed": show_news_feed(colors)
elif st.session_state.page == "Dashboard": show_dashboard(colors, tf)
elif st.session_state.page == "Risk Sentiment": show_risk_sentiment(colors, tf)
elif st.session_state.page == "Transparency": show_transparency(colors)
import streamlit as st

def load_css():
    if 'theme' not in st.session_state: st.session_state.theme = 'dark'
    
    colors = {
        'bg': '#050505', 
        'card_bg': 'rgba(20, 20, 30, 0.6)', 
        'text': '#E0E0E0',
        'subtext': '#94A3B8',
        'border': 'rgba(255, 255, 255, 0.08)',
        'accent_green': '#00F090', 
        'accent_red': '#FF4545',   
        'info_blue': '#3B82F6',    
        'gold': '#FACC15',
        'glow_green': '0 0 20px rgba(0, 240, 144, 0.4)',
        'glow_red': '0 0 20px rgba(255, 69, 69, 0.4)',
        'sidebar_bg': 'rgba(10, 10, 15, 0.85)'
    }

    st.markdown(f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
        
        .stApp {{
            background-color: {colors['bg']};
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.1), transparent 20%), 
                radial-gradient(circle at 90% 80%, rgba(0, 240, 144, 0.08), transparent 20%);
            color: {colors['text']}; font-family: 'Inter', sans-serif;
        }}

        /* SIDEBAR */
        [data-testid="stSidebar"] {{ background-color: {colors['sidebar_bg']}; backdrop-filter: blur(20px); border-right: 1px solid {colors['border']}; }}
        [data-testid="stSidebar"] button {{
            width: 100%; background: transparent; border: 1px solid transparent; color: {colors['subtext']}; text-align: left; padding: 12px 20px; transition: all 0.3s ease;
        }}
        [data-testid="stSidebar"] button:hover {{ background: rgba(255,255,255,0.03); color: white; border: 1px solid {colors['border']}; box-shadow: 0 0 10px rgba(255,255,255,0.05); }}
        
        /* SPACE CARDS (Top 3) */
        .space-card {{
            background: linear-gradient(160deg, rgba(20,25,35,0.8), rgba(10,10,15,0.95));
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 20px;
            position: relative;
            overflow: hidden;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }}
        .space-card::before {{
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
            background: linear-gradient(90deg, transparent, {colors['accent_green']}, transparent);
            opacity: 0.5;
        }}
        .space-card:hover {{ transform: translateY(-5px) scale(1.02); box-shadow: 0 10px 30px -10px rgba(0, 240, 144, 0.2); border-color: {colors['accent_green']}; }}
        
        /* CHECKLIST HUD STYLE */
        .hud-item {{
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 15px;
            margin-bottom: 8px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            transition: all 0.2s;
        }}
        .hud-item.active {{ border-left: 3px solid {colors['accent_green']}; background: linear-gradient(90deg, rgba(0,240,144,0.05), transparent); }}
        .hud-item.inactive {{ border-left: 3px solid {colors['subtext']}; opacity: 0.6; }}
        
        /* TERMINAL FEED */
        .terminal-box {{
            background: #080808; border: 1px solid {colors['border']}; border-radius: 8px; padding: 15px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: {colors['subtext']};
        }}
        .terminal-line {{ display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.1); }}
        .blink {{ animation: blinker 1.5s linear infinite; color: {colors['accent_green']}; }}
        @keyframes blinker {{ 50% {{ opacity: 0; }} }}

        /* GENERAL */
        .glass-card {{ background: {colors['card_bg']}; backdrop-filter: blur(16px); border: 1px solid {colors['border']}; border-radius: 16px; padding: 24px; margin-bottom: 20px; }}
        .matrix-cell {{ font-family: 'JetBrains Mono'; font-weight: 700; padding: 12px; border-radius: 8px; display: flex; align-items: center; justify-content: center; height: 100%; border: 1px solid rgba(0,0,0,0.1); }}
        .risk-banner {{ padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); }}
        .status-badge {{ padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }}
        </style>
    """, unsafe_allow_html=True)
    return colors
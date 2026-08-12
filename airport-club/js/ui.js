// ============================================================
//  AIRPORT – Club Simulator · UI (HUD, Karten, Modals)
// ============================================================
import * as G from './game.js';
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP, ROOMS,
  T2_REQ, ROOF_REQ, PERFORMER, AUTOCOLLECT, CLUB_EXPAND, WHEEL, ACHIEVEMENTS, PRESTIGE,
  MARKETING, DJS, DJ_MAP, DRINKS, CLUB_THEMES,
  UNDERGROUND_JOBS, HEAT_MAX, BOOT_REQ,
  autoCollectInterval, MILESTONE_STEP, fmt, fmtTime, costOf, milestoneMult, nextMilestone,
} from './data.js';
import { playSfx, setMusic, cycleMusicStyle, currentMusicStyleName, setMusicStyle } from './sfx.js';
import { enterRoom, exitRoom, detailBack, nextRoom, prevRoom, currentRoom, devSetClock, addShake, coinBurst, exportShareImage } from './render.js';

const ROOM_META = {
  t1:   { icon: '🪩', name: 'Terminal 1',        sub: 'Mainfloor' },
  klo:  { icon: '🚻', name: 'WC',                sub: 'Waschräume' },
  t2:   { icon: '🪩', name: 'Terminal 2',        sub: 'Zweiter Floor' },
  roof: { icon: '🌃', name: 'Rooftop · VIP',     sub: 'VIP Sky Lounge' },
  hinter: { icon: '🕶️', name: 'Hinterzimmer',    sub: 'Schwarzmarkt · Ware beschaffen & dealen' },
};

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

let buyMode = 1; // 1 | 10 | 25 | 'max'
const BUY_MODES = [1, 10, 25, 'max'];
let rivalUnseen = false, ugUnseen = false, ugWasUnlocked = false;   // Seiten-Button-Badges

// ------------------------------------------------------------------
//  HUD
// ------------------------------------------------------------------
export function updateHUD() {
  $('#hud-level .pill-val').textContent = 'Lvl ' + G.state.level;
  $('#hud-gems .pill-val').textContent = fmt(G.state.gems);
  $('#hud-cash .pill-val').textContent = fmt(G.state.money);
  $('#income-rate').textContent = fmt(G.incomePerSec()) + ' €/s';

  // Nordstern: sichtbares Doppel-Ziel (legal + Unterwelt)
  if (G.northStar) {
    const ns = G.northStar();
    const lf = $('#ns-legal-fill'), cf = $('#ns-crime-fill'), nl = $('#ns-label');
    if (lf) lf.style.width = Math.round(ns.legal.frac * 100) + '%';
    if (cf) cf.style.width = Math.round(ns.crime.frac * 100) + '%';
    if (nl) nl.textContent = ns.legal.label;
  }

  // Phasen-Fortschritt (jetzt im Seiten-Button 📋)
  const p = G.phaseInfo();
  const rp = $('#rail-prog'); if (rp) rp.textContent = `${p.doneCount}/${p.total}`;

  // Hype
  const hypePct = G.dropActive() ? 100 : G.state.hype;
  $('#hype-fill').style.width = hypePct + '%';
  $('#hype-label').textContent = G.dropActive()
    ? '🔊 DROP! x3'
    : `🔥 Hype ${Math.floor(G.state.hype)}%`;
  $('#hype-meter').classList.toggle('dropping', G.dropActive());

  // Live-Event-Banner
  const banner = $('#event-banner');
  const ev = G.eventDef();
  if (ev) {
    const left = Math.ceil((G.state.event.expires - Date.now()) / 1000);
    banner.innerHTML = `${ev.icon} <b>${ev.name}</b> · x${ev.mult} Einkommen · ${left}s`;
    banner.classList.add('show');
  } else banner.classList.remove('show');

  // Seiten-Buttons: Badges & Show-Act-Sichtbarkeit
  $('#badge-daily').classList.toggle('on', G.dailyDue());
  const claimable = G.achievementsInfo().some(a => a.done && !a.claimed);
  const badgeAch = $('#badge-ach');
  badgeAch.classList.toggle('on', claimable);
  badgeAch.textContent = claimable ? '!' : '';
  // Weltrangliste-Badge (neuer Überhol-Erfolg)
  $('#badge-rivals').classList.toggle('on', rivalUnseen);
  // Hinterzimmer: sichtbar ab Freischaltung; Badge bei fertigem Job
  const ugUnlocked = G.undergroundUnlocked();
  $('#btn-underground').classList.toggle('hidden', !ugUnlocked);
  if (ugUnlocked && !ugWasUnlocked) { ugWasUnlocked = true; toast('🕶️ Das Hinterzimmer hat geöffnet…'); }
  const ugBadge = $('#badge-ug');
  ugBadge.classList.toggle('on', ugUnseen || !!G.activeJob());
  ugBadge.textContent = G.activeJob() ? '⏳' : (ugUnseen ? '!' : '');
  // „Das Boot"-Endgame: einmalige Ankündigung, wenn erreichbar
  if (G.bootProgress().ready && !G.state.bootTeased) {
    G.state.bootTeased = true; playSfx('chest'); confetti(40);
    toast('🚢 „Das Boot" ist bereit — das große Franchise-Endgame wartet!');
  }

  // Boost-Button
  const bs = G.boostState();
  const btn = $('#btn-boost');
  const timer = $('#boost-timer');
  if (bs.st === 'active') {
    btn.classList.add('active'); btn.classList.remove('cooldown');
    timer.textContent = '⏱️ ' + fmtTime(bs.left);
    $('#boost-label').textContent = 'x2 läuft!';
  } else if (bs.st === 'cooldown') {
    btn.classList.remove('active'); btn.classList.add('cooldown');
    timer.textContent = '💤 ' + fmtTime(bs.left);
    $('#boost-label').textContent = 'x2 Einkommen';
  } else {
    btn.classList.remove('active', 'cooldown');
    timer.textContent = '▶ Bereit';
    $('#boost-label').textContent = 'x2 Einkommen';
  }

  updateCards();
}

// ------------------------------------------------------------------
//  Upgrade-Karten (Top 3 des aktuellen Raums)
// ------------------------------------------------------------------
function cardStations() {
  // alle freigeschalteten Räume, die 3 günstigsten nächsten Upgrades zuerst
  const list = STATIONS.filter(s => s.room === 't1' || G.state.t2Unlocked);
  return list
    .sort((a, b) => costOf(a, G.state.stations[a.id] || 0) - costOf(b, G.state.stations[b.id] || 0))
    .slice(0, 3);
}

function updateCards() {
  const wrap = $('#upgrade-cards');
  const stations = cardStations();
  stations.forEach((st, i) => {
    let card = wrap.children[i];
    if (!card || card.dataset.station !== st.id) {
      card = buildCard(st);
      if (wrap.children[i]) wrap.replaceChild(card, wrap.children[i]);
      else wrap.appendChild(card);
    }
    fillCard(card, st);
  });
}

function buildCard(st) {
  const card = el('button', 'up-card');
  card.dataset.station = st.id;
  card.innerHTML = `
    <div class="up-title"></div>
    <div class="up-progress"><div class="up-fill"></div><span class="up-count"></span></div>
    <div class="up-cost"></div>`;
  card.addEventListener('click', () => {
    if (G.buyStation(st.id, 1)) {
      playSfx('buy');
      floatText(card.getBoundingClientRect(), '+1 ' + st.icon, 'float-buy');
    } else {
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    }
  });
  return card;
}

function fillCard(card, st) {
  const lvl = G.state.stations[st.id] || 0;
  const target = nextMilestone(lvl);
  const cost = costOf(st, lvl);
  const afford = G.state.money >= cost;
  card.querySelector('.up-title').textContent =
    lvl === 0 ? `${st.icon} ${st.name} eröffnen` : `${st.icon} ${st.name} auf Stufe ${target}`;
  card.querySelector('.up-fill').style.width = (lvl % MILESTONE_STEP) / MILESTONE_STEP * 100 + '%';
  card.querySelector('.up-count').textContent = `${lvl}/${target}`;
  card.querySelector('.up-cost').textContent = fmt(cost) + ' €';
  card.classList.toggle('affordable', afford);
}

// ------------------------------------------------------------------
//  Schwebende Texte & Konfetti
// ------------------------------------------------------------------
export function floatText(rectOrPos, txt, cls = '') {
  const f = el('div', 'float-txt ' + cls, txt);
  let x, y;
  if (rectOrPos instanceof DOMRect) { x = rectOrPos.left + rectOrPos.width / 2; y = rectOrPos.top; }
  else { x = rectOrPos.x; y = rectOrPos.y; }
  f.style.left = x + 'px';
  f.style.top = y + 'px';
  $('#floats').appendChild(f);
  setTimeout(() => f.remove(), 1400);
}

export function confetti(n = 26) {
  const wrap = $('#floats');
  const colors = ['#8b5cf6', '#43d95e', '#ffd93c', '#ff5e8a', '#4fd7f7'];
  for (let i = 0; i < n; i++) {
    const c = el('div', 'confetti');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.4 + 's';
    c.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
    wrap.appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }
}

function toast(txt) {
  const t = $('#toast');
  t.textContent = txt;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------
//  Modal-System
// ------------------------------------------------------------------
function openModal(title, build) {
  closeModal();
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay');
  const sheet = el('div', 'modal-sheet');
  sheet.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="modal-x">✕</button></div>
    <div class="modal-body"></div>`;
  overlay.appendChild(sheet);
  root.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  sheet.querySelector('.modal-x').addEventListener('click', closeModal);
  build(sheet.querySelector('.modal-body'));
  requestAnimationFrame(() => overlay.classList.add('open'));
  return sheet;
}

function closeModal() {
  const o = $('#modal-root .modal-overlay');
  if (o) o.remove();
}

// Aktualisierbare Modals: merken, welches offen ist
let openModalRefresh = null;
function setRefresher(fn) { openModalRefresh = fn; }
setInterval(() => { if (openModalRefresh && $('#modal-root .modal-overlay')) openModalRefresh(); }, 400);

// ---- Stationen-Modal ------------------------------------------------
function openStationsModal() {
  const sheet = openModal('🏗️ Stationen ausbauen', body => {
    const modeBar = el('div', 'mode-bar');
    BUY_MODES.forEach(m => {
      const b = el('button', 'mode-btn', m === 'max' ? 'Max' : 'x' + m);
      b.dataset.mode = m;
      b.addEventListener('click', () => { buyMode = m; playSfx('click'); renderRows(); });
      modeBar.appendChild(b);
    });
    body.appendChild(modeBar);
    const list = el('div', 'station-list');
    body.appendChild(list);

    function renderRows() {
      modeBar.querySelectorAll('.mode-btn').forEach(b =>
        b.classList.toggle('active', String(buyMode) === b.dataset.mode));
      list.innerHTML = '';
      // Club-Ausbau (Gebäude vergrößern) — ganz oben
      {
        const maxed = G.state.clubSize >= CLUB_EXPAND.max;
        const cost = G.clubExpandCost();
        const afford = !maxed && G.state.money >= cost;
        const row = el('div', 'station-row hilite' + (afford ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">🏗️</div>
          <div class="st-info">
            <div class="st-name">Club vergrößern <span class="st-lvl">Stufe ${G.state.clubSize}/${CLUB_EXPAND.max}</span></div>
            <div class="st-desc">${maxed ? 'Maximale Größe erreicht' : 'Größeres Gebäude & mehr Gäste'}</div>
          </div>
          <button class="btn-buy${afford ? '' : ' disabled'}">
            ${maxed ? '<b>MAX</b>' : `<span>Ausbauen</span><b>${fmt(cost)} €</b>`}
          </button>`;
        if (!maxed) row.querySelector('.btn-buy').addEventListener('click', () => {
          if (G.buyClubExpand()) { playSfx('chest'); confetti(30); renderRows(); updateHUD(); toast('🏗️ Der Club ist gewachsen!'); }
        });
        list.appendChild(row);
      }
      // Marketing — mehr & schnellere Gäste, bis der Raum voll ist
      {
        const lvl = G.state.marketing || 0, maxed = lvl >= MARKETING.max;
        const cost = G.marketingCostNext();
        const afford = !maxed && G.state.money >= cost;
        const row = el('div', 'station-row hilite' + (afford ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">📣</div>
          <div class="st-info">
            <div class="st-name">Marketing <span class="st-lvl">Stufe ${lvl}/${MARKETING.max}</span></div>
            <div class="st-desc">${maxed ? 'Maximal beworben' : `Mehr & schnellere Gäste (+${MARKETING.guestsPerLevel} Gäste/Stufe)`}</div>
          </div>
          <button class="btn-buy${afford ? '' : ' disabled'}">
            ${maxed ? '<b>MAX</b>' : `<span>Bewerben</span><b>${fmt(cost)} €</b>`}
          </button>`;
        if (!maxed) row.querySelector('.btn-buy').addEventListener('click', () => {
          if (G.buyMarketing()) { playSfx('buy'); renderRows(); updateHUD(); toast('📣 Mehr Andrang! Der Laden füllt sich.'); }
        });
        list.appendChild(row);
      }
      // DJ anheuern — öffnet die DJ-Auswahl
      {
        const dj = G.activeDjDef();
        const row = el('div', 'station-row hilite');
        row.innerHTML = `
          <div class="st-icon">🎧</div>
          <div class="st-info">
            <div class="st-name">DJ anheuern <span class="st-lvl">${dj.icon} ${dj.name}</span></div>
            <div class="st-desc">Andere DJs mit mehr Einkommen & eigenem Sound</div>
          </div>
          <button class="btn-buy"><span>Auswählen</span><b>🎧</b></button>`;
        row.querySelector('.btn-buy').addEventListener('click', () => { playSfx('click'); openDjModal(); });
        list.appendChild(row);
      }
      for (const roomDef of ROOMS) {
        list.appendChild(el('div', 'list-caption', `${roomDef.icon} ${roomDef.name} · ${roomDef.sub}`));
        // Gesperrter Raum → Freischalt-Zeile (Terminal 2 / Rooftop)
        if (!G.roomUnlocked(roomDef.id)) {
          const isRoof = roomDef.id === 'roof';
          const req = isRoof ? ROOF_REQ : T2_REQ;
          const ready = isRoof ? G.canUnlockRoof() : G.canUnlockT2();
          const lvlOk = G.state.level >= req.level;
          const hint = isRoof && !G.state.t2Unlocked ? 'Erst Terminal 2 freischalten'
            : lvlOk ? 'Bereit zur Eröffnung!' : 'Ab Level ' + req.level + ' (du: Level ' + G.state.level + ')';
          const row = el('div', 'station-row' + (ready ? '' : ' dim'));
          row.innerHTML = `
            <div class="st-icon">🔒</div>
            <div class="st-info">
              <div class="st-name">${roomDef.name} gesperrt</div>
              <div class="st-desc">${hint}</div>
            </div>
            <button class="btn-buy${ready ? '' : ' disabled'}">
              <span>Freischalten</span><b>${fmt(req.cost)} €</b>
            </button>`;
          row.querySelector('.btn-buy').addEventListener('click', () => {
            if (isRoof ? G.unlockRoof() : G.unlockT2()) {
              playSfx('chest'); confetti(40); renderRows(); updateHUD();
              toast(`🎉 ${roomDef.name} ist eröffnet!`);
            }
          });
          list.appendChild(row);
          continue;
        }
        for (const st of STATIONS.filter(s => s.room === roomDef.id)) {
          const lvl = G.state.stations[st.id] || 0;
          const info = G.buyInfo(st.id, buyMode);
          const income = G.stationIncome(st.id) * G.globalMult();
          const row = el('div', 'station-row' + (info.affordable ? '' : ' dim'));
          const barExtra = st.id === 'bar' ? ` · 🍸 ${G.currentDrink().e} ${G.currentDrink().name}` : '';
          row.innerHTML = `
            <div class="st-icon">${st.icon}</div>
            <div class="st-info">
              <div class="st-name">${st.name} <span class="st-lvl">Stufe ${lvl}</span></div>
              <div class="st-desc">${lvl > 0 ? '💶 ' + fmt(income) + ' €/s' : st.desc}
                ${milestoneMult(lvl) > 1 ? ` · <b>x${milestoneMult(lvl)}</b>` : ''}${barExtra}</div>
            </div>
            <button class="btn-buy${info.affordable ? '' : ' disabled'}">
              <span>+${info.count}</span><b>${fmt(info.cost)} €</b>
            </button>`;
          row.querySelector('.btn-buy').addEventListener('click', () => {
            if (G.buyStation(st.id, buyMode)) { playSfx('buy'); renderRows(); updateHUD(); }
          });
          list.appendChild(row);
        }
      }
    }
    renderRows();
    setRefresher(renderRows);
  });
}

// ---- DJ-Modal (andere DJs anheuern & auflegen lassen) -----------------
function openDjModal() {
  openModal('🎧 DJ anheuern', body => {
    const list = el('div', 'room-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      for (const dj of DJS) {
        const owned = G.djOwned(dj.id);
        const active = G.activeDjId() === dj.id;
        const afford = G.state.money >= dj.cost;
        const card = el('div', 'room-card' + (owned ? ' unlocked' : ' locked'));
        let btn;
        if (active) btn = `<button class="btn-buy disabled"><b>Legt auf ✓</b></button>`;
        else if (owned) btn = `<button class="btn-buy"><span>Auflegen</span><b>▶</b></button>`;
        else btn = `<button class="btn-buy${afford ? '' : ' disabled'}"><span>Anheuern</span><b>${dj.cost > 0 ? fmt(dj.cost) + ' €' : 'gratis'}</b></button>`;
        card.innerHTML = `<div class="room-emoji">${dj.icon}</div>
          <div class="room-info"><b>${active ? '🔊 ' : ''}${dj.name}</b><span>${dj.desc}</span></div>${btn}`;
        if (!active) card.querySelector('button').addEventListener('click', () => {
          if (owned) { G.setActiveDj(dj.id); playSfx('click'); }
          else { if (!G.hireDj(dj.id)) return; playSfx('chest'); confetti(30); toast(`🎧 ${dj.name} legt jetzt auf!`); }
          if (dj.style) setMusicStyle(dj.style);
          render(); updateHUD();
        });
        list.appendChild(card);
      }
    }
    render();
  });
}

// ---- Ziele & Freischaltungen (Roadmap + Club-Themes) ------------------
function goalRoom(id, icon, title, sub, reqLvl) {
  return { icon, title, sub, done: G.roomUnlocked(id), progress: G.state.level / reqLvl, reqLabel: `Level ${reqLvl} · du: ${G.state.level}` };
}
function buildGoals() {
  const s = G.state, out = [];
  out.push(goalRoom('t2', '🪩', 'Terminal 2', 'Zweiter Dancefloor mit Bar & Lounge', T2_REQ.level));
  out.push({ icon: '💃', title: 'Show-Act', sub: 'Bewegliche Tänzerin, die einen Raum boostet', done: s.performer.unlocked, progress: s.level / PERFORMER.level, reqLabel: `Level ${PERFORMER.level} · du: ${s.level}` });
  out.push(goalRoom('roof', '🌃', 'Rooftop · VIP', 'VIP Sky Lounge mit Pool, Skybar & Champagner', ROOF_REQ.level));
  const nd = G.nextDrink();
  if (nd) out.push({ icon: nd.e, title: `Drink: ${nd.name}`, sub: `${nd.price} € pro Drink · mehr Bar-Umsatz`, done: false, progress: (s.stations.bar || 0) / nd.lvl, reqLabel: `Bar Stufe ${nd.lvl} · du: ${s.stations.bar || 0}` });
  const nt = CLUB_THEMES.find(x => !G.themeOwned(x.id));
  if (nt) out.push({ icon: '🎨', title: `Theme: ${nt.name}`, sub: nt.desc, done: false, progress: s.lifetime / nt.req, reqLabel: `${fmt(nt.req)} € gesamt` });
  const ndj = DJS.find(d => !G.djOwned(d.id));
  if (ndj) out.push({ icon: ndj.icon, title: `DJ: ${ndj.name}`, sub: ndj.desc, done: false, progress: s.money / ndj.cost, reqLabel: `${fmt(ndj.cost)} €` });
  out.push({ icon: '♻️', title: 'Neueröffnung (Prestige)', sub: 'Ruf-Sterne für dauerhaften Bonus', done: s.fame > 0, progress: s.level / PRESTIGE.minLevel, reqLabel: `Level ${PRESTIGE.minLevel} · du: ${s.level}` });
  const bp = G.bootProgress();
  out.push({ icon: '🚢', title: 'Franchise: „Das Boot“', sub: 'Der 2. Club (Würzburg) — 3 Etagen, Wasser-Theme. Das große Endgame.',
    done: bp.ready, progress: Math.min(bp.fame / bp.fameReq, bp.lifetime / bp.ltReq),
    reqLabel: `${bp.fame}/${bp.fameReq} ⭐ Ruf · ${fmt(bp.lifetime)} / ${fmt(bp.ltReq)} €` });
  return out;
}
function openGoalsModal() {
  openModal('🎯 Ziele & Freischaltungen', body => {
    const wrap = el('div'); body.appendChild(wrap);
    function render() {
      wrap.innerHTML = '';
      const head = el('div', 'goals-head');
      head.innerHTML = `<span>Bisher verdient</span><b>${fmt(G.state.lifetime)} €</b>`;
      wrap.appendChild(head);
      // Zwei-Wege-Nordstern
      if (G.northStar) {
        const ns = G.northStar(), ug = G.ugPhaseInfo ? G.ugPhaseInfo() : null;
        const two = el('div', 'twopath');
        two.innerHTML = `
          <div class="tp-card legal">
            <div class="tp-h">🏆 Club-Imperium</div>
            <div class="tp-goal">${ns.legal.label}</div>
            <div class="goal-bar"><i style="width:${Math.round(ns.legal.frac * 100)}%"></i></div>
            <div class="tp-sub">Ziel: ${ns.nemesis.icon} ${ns.nemesis.name} vom Thron stoßen</div>
          </div>
          <div class="tp-card crime">
            <div class="tp-h">🕶️ Unterwelt</div>
            <div class="tp-goal">${ns.crime.label}</div>
            <div class="goal-bar"><i class="crime" style="width:${Math.round(ns.crime.frac * 100)}%"></i></div>
            <div class="tp-sub">${ug ? 'Kapitel: „' + ug.name + '" · ' + ug.done + '/' + ug.total : 'Ziel: Kingpin am Hafen'}</div>
          </div>`;
        wrap.appendChild(two);
      }
      wrap.appendChild(el('div', 'list-caption', '🚀 Nächste große Freischaltungen'));
      const road = el('div', 'goal-list');
      for (const g of buildGoals()) {
        const card = el('div', 'goal-card' + (g.done ? ' done' : ''));
        const pct = Math.round(Math.max(0, Math.min(1, g.progress)) * 100);
        card.innerHTML = `<div class="goal-ic">${g.icon}</div>
          <div class="goal-info">
            <div class="goal-title">${g.title}${g.done ? ' <span class="goal-check">✓</span>' : ''}</div>
            <div class="goal-sub">${g.sub}</div>
            ${g.done ? '' : `<div class="goal-bar"><i style="width:${pct}%"></i></div><div class="goal-req">${g.reqLabel}</div>`}</div>`;
        road.appendChild(card);
      }
      wrap.appendChild(road);
      wrap.appendChild(el('div', 'list-caption', '🎨 Club-Themes — schalte neue Looks frei'));
      const grid = el('div', 'theme-grid');
      for (const th of CLUB_THEMES) {
        const owned = G.themeOwned(th.id), can = G.themeUnlocked(th.id), active = G.state.clubTheme === th.id;
        const inSeason = !th.season || G.themeInSeason(th.id);
        const card = el('div', 'theme-card' + (active ? ' active' : owned ? ' owned' : can ? ' ready' : ' locked') + (th.season ? ' seasonal' : ''));
        const sw = th.sw.map(c => `<i style="background:${c}"></i>`).join('');
        let btn;
        if (active) btn = '<div class="theme-btn on">Aktiv ✓</div>';
        else if (owned) btn = '<div class="theme-btn">Anwenden</div>';
        else if (can) btn = '<div class="theme-btn buy">Freischalten</div>';
        else if (th.season && !inSeason) btn = `<div class="theme-btn lock">🔒 ${th.season.label}</div>`;
        else btn = `<div class="theme-btn lock">🔒 ${fmt(th.req)} €</div>`;
        const ribbon = th.season && !owned ? `<div class="theme-ribbon">${th.season.label}</div>` : '';
        card.innerHTML = `${ribbon}<div class="theme-sw">${sw}</div><div class="theme-name">${th.name}</div><div class="theme-desc">${th.desc}</div>${btn}`;
        if (!active) card.addEventListener('click', () => {
          if (owned) { G.setTheme(th.id); playSfx('click'); }
          else if (can) { if (!G.unlockTheme(th.id)) return; confetti(30); playSfx('chest'); toast(`🎨 Theme „${th.name}" freigeschaltet!`); }
          else return;
          render();
        });
        grid.appendChild(card);
      }
      wrap.appendChild(grid);
    }
    render();
    setRefresher(render);
  });
}

// ---- Personal-Modal ---------------------------------------------------
function openStaffModal() {
  openModal('👥 Personal', body => {
    const list = el('div', 'station-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      // Show-Act (Tänzerin) — hier verwalten (nicht mehr als Rand-Symbol)
      {
        const unlocked = G.state.performer.unlocked;
        const avail = unlocked || G.state.level >= PERFORMER.level;
        const row = el('div', 'station-row' + (avail ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">💃</div>
          <div class="st-info">
            <div class="st-name">Show-Act <span class="st-lvl">${unlocked ? 'in ' + (ROOM_META[G.state.performer.room]?.name || '') : 'ab Level ' + PERFORMER.level}</span></div>
            <div class="st-desc">Erotische Tänzerin, die den Raum boostet, in dem sie steht</div>
          </div>
          <button class="btn-buy"><span>${unlocked ? 'Verwalten' : 'Ansehen'}</span></button>`;
        row.querySelector('.btn-buy').addEventListener('click', () => { closeModal(); openPerformerModal(); });
        list.appendChild(row);
      }
      // Auto-Kassierer (sammelt Geld-Pins von allein ein)
      {
        const lvl = G.state.autoCollect;
        const maxed = lvl >= AUTOCOLLECT.max;
        const cost = G.autoCollectCost();
        const afford = !maxed && G.state.money >= cost;
        const row = el('div', 'station-row' + (afford ? '' : ' dim'));
        const eff = lvl > 0 ? `Sammelt alle ${autoCollectInterval(lvl)}s automatisch ein` : 'Sammelt Geld-Pins automatisch ein';
        row.innerHTML = `
          <div class="st-icon">🤖</div>
          <div class="st-info">
            <div class="st-name">Auto-Kassierer <span class="st-lvl">${lvl > 0 ? 'Stufe ' + lvl : 'Nicht aktiv'}</span></div>
            <div class="st-desc">${eff}</div>
          </div>
          <button class="btn-buy${afford ? '' : ' disabled'}">
            ${maxed ? '<b>MAX</b>' : `<span>${lvl === 0 ? 'Aktivieren' : 'Schneller'}</span><b>${fmt(cost)} €</b>`}
          </button>`;
        if (!maxed) row.querySelector('.btn-buy').addEventListener('click', () => {
          if (G.buyAutoCollect()) { playSfx('buy'); confetti(10); render(); updateHUD(); }
        });
        list.appendChild(row);
      }
      for (const s of STAFF) {
        const lvl = G.state.staff[s.id] || 0;
        const maxed = lvl >= s.max;
        const cost = G.staffCost(s.id);
        const afford = !maxed && G.state.money >= cost;
        const row = el('div', 'station-row' + (afford ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">${s.icon}</div>
          <div class="st-info">
            <div class="st-name">${s.name} <span class="st-lvl">${lvl > 0 ? 'Stufe ' + lvl : 'Nicht eingestellt'}</span></div>
            <div class="st-desc">${s.desc}</div>
          </div>
          <button class="btn-buy${afford ? '' : ' disabled'}">
            ${maxed ? '<b>MAX</b>' : `<span>${lvl === 0 ? 'Einstellen' : 'Befördern'}</span><b>${fmt(cost)} €</b>`}
          </button>`;
        if (!maxed) row.querySelector('.btn-buy').addEventListener('click', () => {
          if (G.hireStaff(s.id)) { playSfx('buy'); confetti(12); render(); updateHUD(); }
        });
        list.appendChild(row);
      }
    }
    render();
    setRefresher(render);
  });
}

// ---- Shop-Modal ---------------------------------------------------------
function openShopModal() {
  openModal('💎 Diamanten-Shop', body => {
    body.appendChild(el('div', 'list-caption', `Du hast ${fmt(G.state.gems)} 💎 — verdiene mehr über Quests, Truhen & Level-Ups!`));
    const list = el('div', 'station-list');
    body.appendChild(list);
    function render() {
      body.querySelector('.list-caption').textContent =
        `Du hast ${fmt(G.state.gems)} 💎 — verdiene mehr über Quests, Truhen & Level-Ups!`;
      list.innerHTML = '';
      for (const item of SHOP) {
        const afford = G.state.gems >= item.gems;
        const row = el('div', 'station-row' + (afford ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">${item.icon}</div>
          <div class="st-info">
            <div class="st-name">${item.name}</div>
            <div class="st-desc">${item.desc}</div>
          </div>
          <button class="btn-buy gem${afford ? '' : ' disabled'}"><b>${item.gems} 💎</b></button>`;
        row.querySelector('.btn-buy').addEventListener('click', () => {
          if (G.buyShopItem(item.id)) { playSfx('chest'); confetti(14); render(); updateHUD(); }
        });
        list.appendChild(row);
      }
    }
    render();
    setRefresher(render);
  });
}

// ---- Räume-Modal ----------------------------------------------------------
function unlockedRoomCard(id) {
  const m = ROOM_META[id];
  const card = el('div', 'room-card unlocked clickable');
  const isPerf = G.state.performer.unlocked && G.state.performer.room === id;
  card.innerHTML = `<div class="room-emoji">${m.icon}</div>
    <div class="room-info"><b>${m.name}</b><span>${m.sub} · ${fmt(G.roomIncome(id))} €/s${isPerf ? ' · 💃 Show-Act' : ''}</span></div>
    <div class="room-emoji enter-arrow">→</div>`;
  card.addEventListener('click', () => { closeModal(); openRoomView(id); });
  return card;
}

function lockedRoomCard(id, req, canUnlock, doUnlock, extraHint) {
  const m = ROOM_META[id];
  const lvlOk = G.state.level >= req.level;
  const afford = G.state.money >= req.cost;
  const ready = canUnlock();
  const card = el('div', 'room-card locked');
  const hint = extraHint || (lvlOk ? 'Bereit zur Eröffnung!' : 'Ab Level ' + req.level + ' (du: ' + G.state.level + ')');
  card.innerHTML = `<div class="room-emoji">🔒</div>
    <div class="room-info"><b>${m.name}</b><span>${hint}</span></div>
    <button class="btn-buy${ready ? '' : ' disabled'}"><span>Freischalten</span><b>${fmt(req.cost)} €</b></button>`;
  card.querySelector('button').addEventListener('click', () => {
    if (doUnlock()) {
      playSfx('chest'); confetti(40); updateHUD();
      toast(`🎉 ${m.name} ist eröffnet!`);
    }
  });
  return card;
}

function openRoomsModal() {
  openModal('📍 Räume & Etagen', body => {
    const list = el('div', 'room-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      list.appendChild(unlockedRoomCard('t1'));
      // Terminal 2
      if (G.state.t2Unlocked) list.appendChild(unlockedRoomCard('t2'));
      else list.appendChild(lockedRoomCard('t2', T2_REQ, G.canUnlockT2, G.unlockT2));
      // Rooftop
      if (G.state.roofUnlocked) list.appendChild(unlockedRoomCard('roof'));
      else list.appendChild(lockedRoomCard('roof', ROOF_REQ, G.canUnlockRoof, G.unlockRoof,
        G.state.t2Unlocked ? null : 'Erst Terminal 2 freischalten'));

      // Hinterzimmer (Untergrund) — eigener Raum, sobald freigeschaltet
      if (G.undergroundUnlocked()) {
        const m = ROOM_META.hinter;
        const jailed = G.dealerJailed && G.dealerJailed();
        const hc = el('div', 'room-card ' + (jailed ? 'locked' : 'unlocked clickable'));
        const n = G.stockCount ? G.stockCount() : 0;
        const sub = jailed ? `🔒 Festgenommen — noch ${Math.ceil(G.jailLeft())}s` : (n > 0 ? '📦 ' + n + ' Ware im Lager' : m.sub);
        hc.innerHTML = `<div class="room-emoji">${m.icon}</div>
          <div class="room-info"><b>${m.name}</b><span>${sub}</span></div>
          <div class="room-emoji enter-arrow">${jailed ? '🔒' : '→'}</div>`;
        if (!jailed) hc.addEventListener('click', () => { closeModal(); openRoomView('hinter'); });
        list.appendChild(hc);
      }

      // Show-Act (Tänzerin) — freischalten oder in einen Raum stellen
      list.appendChild(performerCard(render));

      // Neueröffnung (Prestige)
      const pi = G.prestigeInfo();
      const pr = el('div', 'room-card prestige' + (pi.available ? '' : ' locked'));
      pr.innerHTML = `<div class="room-emoji">⭐</div>
        <div class="room-info"><b>Neueröffnung</b>
          <span>${pi.current > 0 ? pi.current + ' Ruf-Sterne (+' + (pi.current * 25) + '% Einkommen) · ' : ''}${
            pi.available ? '+' + pi.gain + ' ⭐ verfügbar!' : 'Ab Level ' + pi.minLevel + ': Club neu eröffnen für permanente Boni'}</span></div>
        <button class="btn-buy${pi.available ? '' : ' disabled'}"><b>${pi.available ? '+' + pi.gain + ' ⭐' : '⭐'}</b></button>`;
      if (pi.available) pr.querySelector('button').addEventListener('click', () => openPrestigeConfirm(pi));
      list.appendChild(pr);
    }
    render();
    setRefresher(render);
  });
}

// ---- Show-Act / Tänzerin ----------------------------------------------------
function performerCard(refresh) {
  const card = el('div', 'room-card ' + (G.state.performer.unlocked ? 'perf' : 'locked'));
  if (!G.state.performer.unlocked) {
    const lvlOk = G.state.level >= PERFORMER.level;
    const ready = G.canUnlockPerformer();
    card.innerHTML = `<div class="room-emoji">💃</div>
      <div class="room-info"><b>Show-Act engagieren</b>
        <span>${lvlOk ? `Boostet ihren Raum um x${PERFORMER.roomMult}!` : 'Ab Level ' + PERFORMER.level + ' (du: ' + G.state.level + ')'}</span></div>
      <button class="btn-buy${ready ? '' : ' disabled'}"><span>Engagieren</span><b>${fmt(PERFORMER.cost)} €</b></button>`;
    card.querySelector('button').addEventListener('click', () => {
      if (G.unlockPerformer()) { playSfx('chest'); confetti(24); refresh(); updateHUD(); toast('💃 Show-Act engagiert! Stell sie in einen Raum.'); }
    });
  } else {
    card.innerHTML = `<div class="room-emoji">💃</div>
      <div class="room-info"><b>Show-Act</b><span>Boostet ihren Raum um x${PERFORMER.roomMult} Einkommen</span></div>`;
    const btn = el('button', 'btn-flat small-flat', 'Umstellen ▸');
    btn.addEventListener('click', () => openPerformerModal());
    card.appendChild(btn);
  }
  return card;
}

function openPerformerModal() {
  if (!G.state.performer.unlocked) { openRoomsModal(); return; }
  openModal('💃 Show-Act platzieren', body => {
    body.appendChild(el('div', 'list-caption', `Die Tänzerin boostet den Raum, in dem sie steht, um <b>x${PERFORMER.roomMult}</b> Einkommen & mehr Hype. Immer nur ein Raum!`));
    const list = el('div', 'station-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      for (const id of ['t1', 't2', 'roof']) {
        if (!G.roomUnlocked(id)) continue;
        const m = ROOM_META[id];
        const here = G.state.performer.room === id;
        const row = el('div', 'station-row' + (here ? ' active-row' : ''));
        row.innerHTML = `<div class="st-icon">${m.icon}</div>
          <div class="st-info"><div class="st-name">${m.name}</div>
            <div class="st-desc">${fmt(G.roomIncome(id))} €/s${here ? ' · 💃 hier!' : ''}</div></div>
          <button class="btn-buy${here ? ' disabled' : ''}"><b>${here ? '✔ hier' : 'Hierhin'}</b></button>`;
        if (!here) row.querySelector('button').addEventListener('click', () => {
          if (G.setPerformerRoom(id)) { playSfx('buy'); render(); updateHUD(); toast(`💃 Show-Act ist jetzt in ${m.name}!`); }
        });
        list.appendChild(row);
      }
    }
    render();
    setRefresher(render);
  });
}

function openPrestigeConfirm(pi) {
  openModal('⭐ Neueröffnung', body => {
    body.innerHTML = `
      <p class="modal-text">Der Club „Airport“ wird komplett renoviert und neu eröffnet!</p>
      <p class="modal-text">Du verlierst: <b>Geld, Stationen, Personal & Terminal 2</b>.<br>
      Du behältst: <b>Diamanten, Level & Phasen</b>.</p>
      <p class="modal-text big">Dafür bekommst du <b>+${pi.gain} ⭐ Ruf</b><br>= dauerhaft <b>+${pi.gain * 25}% Einkommen</b>, für immer!</p>
      <button class="btn-big" id="btn-prestige-go">🎊 Neu eröffnen!</button>
      <button class="btn-flat" id="btn-prestige-no">Doch nicht</button>`;
    body.querySelector('#btn-prestige-go').addEventListener('click', () => {
      if (G.doPrestige()) {
        playSfx('chest'); confetti(60); closeModal(); updateHUD();
        toast('⭐ Neueröffnung! Dein Ruf eilt dir voraus …');
      }
    });
    body.querySelector('#btn-prestige-no').addEventListener('click', closeModal);
  });
}

// ---- Quest-Modal -------------------------------------------------------------
function openQuestModal() {
  openModal('📋 Aufgaben', body => {
    function render() {
      const p = G.phaseInfo();
      body.innerHTML = `<div class="list-caption">Phase ${p.idx + 1} · <b>${p.name}</b> — Truhen bei 50% und 100%!</div>`;
      const list = el('div', 'quest-list');
      for (const q of p.quests) {
        const row = el('div', 'quest-row' + (q.done ? ' done' : ''));
        const pct = q.done ? 100 : Math.min(100, q.value / q.v * 100);
        row.innerHTML = `
          <div class="q-check">${q.done ? '✔' : ''}</div>
          <div class="q-info">
            <div class="q-txt">${q.txt}</div>
            <div class="q-bar"><div class="q-fill" style="width:${pct}%"></div></div>
          </div>`;
        list.appendChild(row);
      }
      body.appendChild(list);
    }
    render();
    setRefresher(render);
  });
}

// ---- Täglicher Bonus / Glücksrad -------------------------------------------------
function openDailyModal() {
  openModal('🎁 Täglicher Bonus', body => {
    const due = G.dailyDue();
    body.appendChild(el('div', 'list-caption',
      due ? `Dreh am Rad! Aktuelle Streak: <b>${G.state.daily.streak}🔥</b> — mehr Streak = mehr Belohnung.`
          : `Heute schon abgeholt — komm morgen wieder! Streak: <b>${G.state.daily.streak}🔥</b>`));
    const stage = el('div', 'wheel-stage');
    const N = WHEEL.length, seg = 360 / N;
    const grad = WHEEL.map((w, i) => `${w.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(',');
    const wheel = el('div', 'wheel');
    wheel.style.background = `conic-gradient(${grad})`;
    WHEEL.forEach((w, i) => {
      const lab = el('div', 'wheel-lab', w.label);
      const th = (i * seg + seg / 2) * Math.PI / 180;   // Winkel der Segmentmitte (0 = oben)
      const R = 52;                                       // Radius, auf dem der Text sitzt
      lab.style.transform = `translate(-50%,-50%) translate(${Math.sin(th) * R}px, ${-Math.cos(th) * R}px)`;
      wheel.appendChild(lab);
    });
    stage.appendChild(wheel);
    stage.appendChild(el('div', 'wheel-pointer', '▼'));
    stage.appendChild(el('div', 'wheel-hub', '🎡'));
    body.appendChild(stage);
    const btn = el('button', 'btn-big', due ? '🎡 Drehen!' : 'Schließen');
    body.appendChild(btn);
    let spinning = false;
    btn.addEventListener('click', () => {
      if (!due) { closeModal(); return; }
      if (spinning) return;
      spinning = true; btn.classList.add('disabled');
      const idx = G.spinWheelIndex();
      const target = 360 * 6 - (idx * seg + seg / 2);
      wheel.style.transition = 'transform 3.6s cubic-bezier(.15,.72,.24,1.05)';
      requestAnimationFrame(() => { wheel.style.transform = `rotate(${target}deg)`; });
      setTimeout(() => {
        const r = G.claimWheel(idx);
        playSfx('chest'); confetti(46);
        let msg = '🎁';
        if (r) { if (r.money) msg = '+' + fmt(r.money) + ' €'; else if (r.gems) msg = '+' + r.gems + ' 💎'; else if (r.boost) msg = '⚡ x2 Boost!'; else if (r.drop) msg = '🔊 DROP!'; }
        toast(`🎁 Gewonnen: ${msg}${r ? ' · Streak ' + r.streak + '🔥' : ''}`);
        updateHUD();
        btn.textContent = '✔ Eingesammelt — bis morgen!';
      }, 3700);
    });
  });
}
export function maybeOpenDaily() { if (G.dailyDue()) openDailyModal(); }

// ---- Erfolge / Achievements ------------------------------------------------------
function openAchievementsModal() {
  openModal('🏆 Erfolge', body => {
    const list = el('div', 'quest-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      for (const a of G.achievementsInfo()) {
        const pct = a.done ? 100 : Math.min(100, a.value / a.v * 100);
        const row = el('div', 'quest-row' + (a.done ? ' done' : ''));
        row.innerHTML = `
          <div class="q-check">${a.claimed ? '✔' : a.icon}</div>
          <div class="q-info">
            <div class="q-txt">${a.name} — ${a.txt}</div>
            <div class="q-bar"><div class="q-fill" style="width:${pct}%"></div></div>
          </div>`;
        const canClaim = a.done && !a.claimed;
        const btn = el('button', 'btn-buy gem' + (canClaim ? '' : ' disabled'), `<b>${a.claimed ? '✔' : '+' + a.gems + ' 💎'}</b>`);
        if (canClaim) btn.addEventListener('click', () => {
          if (G.claimAchievement(a.id)) { playSfx('chest'); confetti(16); render(); updateHUD(); }
        });
        row.appendChild(btn);
        list.appendChild(row);
      }
    }
    render();
    setRefresher(render);
  });
}

// ---- Foto-Modus (Share-Karte) -----------------------------------------------------
function downloadCanvas(canvas) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'airport-club.png';
  document.body.appendChild(a); a.click(); a.remove();
}
function openPhotoModal() {
  const img = exportShareImage();
  if (!img) return;
  playSfx('chest');
  openModal('📸 Foto-Modus', body => {
    body.innerHTML = `
      <img src="${img.toDataURL('image/png')}" style="width:100%;border-radius:16px;display:block;margin:2px 0 12px;box-shadow:0 8px 20px rgba(0,0,0,0.4)" />
      <button class="btn-big" id="photo-share">📤 Teilen</button>
      <button class="btn-flat" id="photo-save">⬇️ Als Bild speichern</button>
      <div class="modal-text small">Zeigt deinen aktuellen Club, Level & Weltrang.</div>`;
    body.querySelector('#photo-share').addEventListener('click', () => {
      img.toBlob(async blob => {
        if (!blob) return;
        const file = new File([blob], 'airport-club.png', { type: 'image/png' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          try { await navigator.share({ files: [file], title: 'Airport – Club Simulator' }); return; }
          catch (e) { /* Nutzer hat Teilen abgebrochen */ return; }
        }
        downloadCanvas(img);
      }, 'image/png');
    });
    body.querySelector('#photo-save').addEventListener('click', () => downloadCanvas(img));
  });
}

// ---- Weltrangliste (Rivalen) -----------------------------------------------------
function openRivalsModal() {
  G.state._rivalSeen = (G.state.rivals?.beaten || []).length;   // Badge quittieren
  openModal('🌍 Weltrangliste', body => {
    const render = () => {
      const rank = G.rivalRank(), board = G.rivalBoard(), nx = G.nextRival();
      body.innerHTML = `<div class="modal-text">Dein Rang: <b>#${rank}</b> von ${board.length} · dauerhafter Bonus: <b style="color:#43d95e">+${Math.round((G.rivalMult() - 1) * 100)} %</b> Einkommen</div>`;
      body.insertAdjacentHTML('beforeend', nx
        ? `<div class="modal-text">🎯 Nächstes Ziel: <b>${nx.name}</b> — noch <b>${fmt(nx.worth - G.playerWorth())} €</b> Vermögen (Career-€)</div>`
        : `<div class="modal-text">👑 Du bist der reichste Club-Boss der Welt!</div>`);
      const list = el('div', 'rival-list');
      board.forEach((r, i) => {
        const row = el('div', 'rival-row' + (r.isPlayer ? ' me' : (r.beaten ? ' beaten' : '')));
        row.innerHTML = `<span class="rr-rank">#${i + 1}</span>
          <span class="rr-name">${r.isPlayer ? '⭐ DU' : r.name}${r.beaten ? ' <span class="rr-tick">✓</span>' : ''}</span>
          <span class="rr-worth">${fmt(r.worth)} €</span>`;
        list.appendChild(row);
      });
      body.appendChild(list);
    };
    render(); setRefresher(render);
  });
  updateHUD();
}

// ---- Untergrund-Wirtschaft („Das Hinterzimmer") ----------------------------------
function openUndergroundModal() {
  openModal('🕶️ Das Hinterzimmer', body => {
    body.classList.add('ug-modal');
    const render = () => {
      const u = G.state.underground;
      body.innerHTML = `<div class="ug-heat"><span>🔥 Heat ${Math.round(u.heat)} %</span>
        <div class="ug-heatbar"><div class="ug-heatfill" style="width:${(u.heat / HEAT_MAX * 100).toFixed(0)}%"></div></div>
        <span class="ug-heat-hint">Heat erhöht das Risiko — lass den Laden abkühlen.</span></div>`;
      const active = G.activeJob();
      if (active) {
        const p = (1 - active.left / active.def.dur) * 100;
        body.insertAdjacentHTML('beforeend', `<div class="ug-active">
          <div class="ug-active-h">${active.def.icon} <b>${active.def.name}</b> läuft…</div>
          <div class="ug-prog"><div class="ug-progfill" style="width:${p.toFixed(1)}%"></div></div>
          <div class="modal-text">Fertig in <b>${fmtTime(active.left)}</b> · Einsatz ${fmt(active.stake)} €</div></div>`);
      } else {
        if (u.lastResult) {
          const r = u.lastResult;
          body.insertAdjacentHTML('beforeend', `<div class="ug-result ${r.ok ? 'ok' : 'fail'}">${r.ok
            ? `✅ ${r.name} erfolgreich — <b>+${fmt(r.gain)} €</b>`
            : `🚨 ${r.name} ist aufgeflogen — <b>−${fmt(r.lost)} €</b>`}</div>`);
        }
        UNDERGROUND_JOBS.forEach(job => {
          const stake = G.jobStake(job), reward = G.jobReward(job), fail = Math.round(G.jobFailChance(job) * 100);
          const afford = G.state.money >= stake;
          const row = el('div', 'station-row' + (afford ? '' : ' dim'));
          row.innerHTML = `
            <div class="st-icon">${job.icon}</div>
            <div class="st-info">
              <div class="st-name">${job.name} <span class="st-lvl">Risiko ${fail} %</span></div>
              <div class="st-desc">${job.txt}<br>⏱️ ${fmtTime(job.dur)} · Einsatz ${fmt(stake)} € · Gewinn <b style="color:#43d95e">${fmt(reward)} €</b></div>
            </div>
            <button class="btn-buy${afford ? '' : ' disabled'}"><span>Starten</span></button>`;
          if (afford) row.querySelector('.btn-buy').addEventListener('click', () => {
            if (G.startJob(job.id)) { playSfx('click'); render(); updateHUD(); }
          });
          body.appendChild(row);
        });
      }
    };
    render(); setRefresher(render);
  });
}

// ---- Einstellungen ---------------------------------------------------------------
function openSettingsModal() {
  openModal('⚙️ Einstellungen', body => {
    body.innerHTML = `
      <button class="btn-flat" id="set-music">${G.state.settings.music ? '🎵 Musik: an' : '🎵 Musik: aus'}</button>
      <button class="btn-flat" id="set-style">🎚️ Stil: ${currentMusicStyleName()}</button>
      <button class="btn-flat" id="set-sound">${G.state.settings.sound ? '🔊 Sound: an' : '🔇 Sound: aus'}</button>
      <button class="btn-flat danger" id="set-reset">🗑️ Spielstand löschen</button>
      ${G.devActive() ? '<button class="btn-flat" id="set-dev" style="border-color:#38c95c;color:#38c95c">🧪 Dev-Modus öffnen</button>' : `
      <div class="dev-code-row">
        <input id="dev-code" type="text" inputmode="numeric" placeholder="Code" maxlength="8" autocomplete="off">
        <button class="btn-flat" id="dev-code-ok">OK</button>
      </div>`}
      <p class="modal-text small">„Airport“ Club Simulator · Spielstand wird automatisch lokal gespeichert.<br>
      Ruf-Sterne: ${G.state.fame} ⭐ · Insgesamt verdient: ${fmt(G.state.lifetime)} €</p>`;
    body.querySelector('#set-music').addEventListener('click', e => {
      setMusic(!G.state.settings.music);
      G.save();
      e.target.textContent = G.state.settings.music ? '🎵 Musik: an' : '🎵 Musik: aus';
    });
    body.querySelector('#set-style').addEventListener('click', e => {
      const name = cycleMusicStyle();
      G.save();
      e.target.textContent = '🎚️ Stil: ' + name;
      toast('🎶 Musik: ' + name);
    });
    body.querySelector('#set-sound').addEventListener('click', e => {
      G.state.settings.sound = !G.state.settings.sound;
      G.save();
      e.target.textContent = G.state.settings.sound ? '🔊 Sound: an' : '🔇 Sound: aus';
    });
    body.querySelector('#set-reset').addEventListener('click', () => {
      if (confirm('Wirklich ALLES löschen? Das kann nicht rückgängig gemacht werden!')) G.resetSave();
    });
    const devBtn = body.querySelector('#set-dev');
    if (devBtn) devBtn.addEventListener('click', () => { closeModal(); openDevModal(); });
    const codeOk = body.querySelector('#dev-code-ok');
    if (codeOk) codeOk.addEventListener('click', () => {
      const val = body.querySelector('#dev-code').value;
      if (G.enterDevCode(val)) { playSfx('chest'); toast('🧪 Dev-Modus freigeschaltet!'); closeModal(); openDevModal(); }
      else { playSfx('click'); toast('❌ Falscher Code'); }
    });
  });
}

// ---- Dev-Modus (alles testen) ------------------------------------------------------
function openDevModal() {
  openModal('🧪 Dev-Modus', body => {
    const rows = [
      ['dev-m1', '💶 +1 Mio €'], ['dev-m2', '💶 +1 Mrd €'], ['dev-gems', '💎 +100 Diamanten'],
      ['dev-lvl', '⭐ Level +10'], ['dev-all', '🔓 Alles freischalten (Räume, Tänzerin, DJs, Themes)'],
      ['dev-club', '🏗️ Club-Ausbau & Marketing & Auto-Kasse MAX'],
      ['dev-st', '📈 Alle aktiven Stationen +10'],
      ['dev-night', '🌙 Nacht auf kurz vor 02:00 stellen'],
    ];
    body.innerHTML = `<p class="modal-text small">Nur zum Testen — Fortschritt zählt ganz normal.</p>`
      + rows.map(([id, label]) => `<button class="btn-flat" id="${id}">${label}</button>`).join('');
    const act = (id, kind, msg) => body.querySelector('#' + id).addEventListener('click', () => {
      G.devAction(kind); playSfx('buy'); toast(msg); updateHUD(); updateCards();
    });
    act('dev-m1', 'money1m', '+1 Mio €');
    act('dev-m2', 'money1b', '+1 Mrd €');
    act('dev-gems', 'gems', '+100 💎');
    act('dev-lvl', 'level10', '⭐ Level +10');
    act('dev-all', 'unlockAll', '🔓 Alles freigeschaltet');
    act('dev-club', 'maxClub', '🏗️ Club maximal ausgebaut');
    act('dev-st', 'stations10', '📈 Stationen +10');
    body.querySelector('#dev-night').addEventListener('click', () => {
      devSetClock(25.97 * 60); playSfx('click'); toast('🌙 Gleich ist die Nacht rum …');
    });
  });
}

// ---- Truhen-Popup ------------------------------------------------------------------
function chestPopup(kind, gems, money) {
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay chest-pop');
  overlay.innerHTML = `
    <div class="chest-box">
      <div class="chest-emoji">${kind === 'mid' ? '📦' : '🎁'}</div>
      <h2>Truhe geöffnet!</h2>
      <div class="chest-rewards">
        <span>+${gems} 💎</span>
        <span>+${fmt(money)} €</span>
      </div>
      <button class="btn-big">Einsammeln!</button>
    </div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.querySelector('.btn-big').addEventListener('click', () => { overlay.remove(); });
  playSfx('chest');
  confetti(30);
}

// ---- Story-Beat: kurze erzählte Karte (Kapitel/Erstereignis) -----------------------
function storyPopup(beat) {
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay story-pop');
  overlay.innerHTML = `
    <div class="story-box">
      <div class="story-emoji">${beat.icon || '📖'}</div>
      <div class="story-title">${beat.title || ''}</div>
      <div class="story-text">${beat.text || ''}</div>
      <button class="btn-big">Weiter ›</button>
    </div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const close = () => overlay.remove();
  overlay.querySelector('.btn-big').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  playSfx('quest');
}

// ---- Nacht-Report (02:00 — Club-Nacht geschafft) -----------------------------------
function nightReportPopup({ night, earned, bonus, gems }) {
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay chest-pop');
  overlay.innerHTML = `
    <div class="chest-box">
      <div class="chest-emoji">🌙</div>
      <h2>Nacht ${night} geschafft!</h2>
      <p class="modal-text small">Der Club hat bis 02:00 durchgezogen.<br>Einnahmen der Nacht: <b>${fmt(earned)} €</b></p>
      <div class="chest-rewards">
        <span>+${fmt(bonus)} € Bonus</span>
        ${gems ? `<span>+${gems} 💎</span>` : ''}
      </div>
      <p class="modal-text small">🔥 Nacht-Serie: ${night} — je länger die Serie, desto fetter der Bonus!</p>
      <button class="btn-big">Weiter feiern!</button>
    </div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.querySelector('.btn-big').addEventListener('click', () => overlay.remove());
  playSfx('chest');
  confetti(24);
}

// ---- Offline-Popup -----------------------------------------------------------------
export function offlinePopup(away, money) {
  const root = $('#modal-root');
  const overlay = el('div', 'modal-overlay chest-pop');
  const hours = Math.floor(away / 3600), mins = Math.floor((away % 3600) / 60);
  overlay.innerHTML = `
    <div class="chest-box">
      <div class="chest-emoji">🌙</div>
      <h2>Willkommen zurück!</h2>
      <p class="modal-text">Dein Club hat ${hours > 0 ? hours + ' Std ' : ''}${mins} Min ohne dich weitergefeiert:</p>
      <div class="chest-rewards"><span>+${fmt(money)} €</span></div>
      <button class="btn-big" id="off-claim">Einsammeln</button>
      <button class="btn-big gemtint" id="off-double">x2 für 5 💎</button>
    </div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.querySelector('#off-claim').addEventListener('click', () => {
    G.claimOffline(money, false); overlay.remove(); updateHUD();
  });
  overlay.querySelector('#off-double').addEventListener('click', () => {
    if (G.state.gems >= 5) {
      G.state.gems -= 5;
      G.claimOffline(money, true);
      confetti(20);
    } else {
      G.claimOffline(money, false);
      toast('Nicht genug Diamanten — normal eingesammelt.');
    }
    overlay.remove(); updateHUD();
  });
}

// ------------------------------------------------------------------
//  Initialisierung & Event-Verdrahtung
// ------------------------------------------------------------------
export function initUI() {
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#btn-quests').addEventListener('click', openQuestModal);
  $('#btn-shop').addEventListener('click', openShopModal);
  $('#btn-staff').addEventListener('click', openStaffModal);
  $('#btn-rooms').addEventListener('click', openRoomsModal);
  $('#btn-stations').addEventListener('click', openStationsModal);
  $('#btn-boost').addEventListener('click', () => {
    if (G.startBoost()) {
      playSfx('boost');
      toast('⚡ x2 Einkommen für 5 Minuten!');
    } else if (G.boostState().st === 'cooldown') {
      toast('Boost lädt noch … (oder ⚡ im Shop sofort starten)');
    }
  });
  // Schwebende Seiten-Buttons
  $('#btn-goals').addEventListener('click', openGoalsModal);
  $('#northstar').addEventListener('click', openGoalsModal);
  $('#btn-daily').addEventListener('click', openDailyModal);
  $('#btn-ach').addEventListener('click', openAchievementsModal);
  $('#btn-rivals').addEventListener('click', () => { rivalUnseen = false; openRivalsModal(); });
  $('#btn-photo').addEventListener('click', openPhotoModal);
  $('#btn-underground').addEventListener('click', () => { ugUnseen = false; openRoomView('hinter'); });
  // Zurück aus der Raum-Detailansicht
  $('#room-back').addEventListener('click', closeRoomView);
  // Raumwechsel per Pfeilen; Titel antippen öffnet die Raum-Auswahl
  $('#room-prev').addEventListener('click', () => { const id = prevRoom(); showRoomHud(id); playSfx('click'); });
  $('#room-next').addEventListener('click', () => { const id = nextRoom(); showRoomHud(id); playSfx('click'); });
  $('#room-title').addEventListener('click', openRoomsModal);

  // Spiel-Events
  G.on('levelup', ({ level, gems }) => {
    playSfx('level');
    confetti(24); addShake(6);
    toast(`⭐ Level ${level}!` + (gems ? ` +${gems} 💎` : ''));
  });
  G.on('milestone', ({ id, level }) => {
    const st = STATION_MAP[id];
    playSfx('milestone');
    confetti(20); addShake(8);
    toast(`🚀 ${st.icon} ${st.name} Stufe ${level}: Einkommen x2!`);
  });
  G.on('quest', ({ txt }) => {
    playSfx('quest');
    toast('✅ Aufgabe geschafft: ' + txt);
  });
  G.on('chest', ({ kind, gems, money }) => chestPopup(kind, gems, money));
  G.on('phase', ({ idx, name }) => toast(`🏁 Phase ${idx + 1} erreicht: „${name}“`));
  G.on('drop', () => { playSfx('drop'); addShake(12); toast('🔊 DROP! Alle rasten aus — x3 Einkommen!'); });
  G.on('celebSpawn', () => toast('🌟 Ein Promi ist im Club! Tipp ihn an!'));
  G.on('t2unlocked', () => {});
  G.on('roofunlocked', () => { playSfx('chest'); confetti(50); toast('🌃 Rooftop eröffnet — Sky Lounge über den Dächern!'); });
  G.on('story', beat => storyPopup(beat));
  G.on('ugPhase', ({ name }) => { playSfx('quest'); toast(`🕶️ Unterwelt-Kapitel: „${name}"`); updateHUD(); });
  G.on('performer', () => {});
  G.on('autocollect', () => {});
  G.on('event', def => { playSfx('boost'); toast(`${def.icon} ${def.name}! ${def.txt}`); });
  G.on('eventEnd', () => {});
  G.on('achievement', a => { playSfx('level'); toast(`🏆 Erfolg: ${a.name} · +${a.gems} 💎`); });
  G.on('rivalBeaten', ({ name, gems, count }) => { rivalUnseen = true; playSfx('chest'); confetti(24);
    toast(`🌍 Rivale überholt: ${name}${count > 1 ? ` +${count - 1}` : ''} · +${gems} 💎`); updateHUD(); });
  G.on('ugDone', r => { ugUnseen = true; playSfx(r.ok ? 'chest' : 'click');
    toast(r.ok ? `🕶️ Job durchgezogen: +${fmt(r.gain)} €` : `🚨 Erwischt: −${fmt(r.lost)} €`); updateHUD(); });
  // Schwarzmarkt: Run-Modus blendet die Club-Bedienelemente aus
  G.on('runStart', () => { document.body.classList.add('run-mode'); });
  const endRun = () => { document.body.classList.remove('run-mode'); updateHUD(); };
  G.on('runDone', ({ qty }) => { endRun(); playSfx('chest'); confetti(16); toast(`📦 Run erfolgreich — ${qty} Ware im Lager!`); });
  G.on('runAbort', ({ busted }) => { endRun(); if (!busted) toast('🏃 Run abgebrochen — Einsatz futsch.'); });
  G.on('runBust', b => { playSfx('milestone');
    toast(`🚨 ERWISCHT! Kaution −${fmt(b.bail)} €, ${b.seized} Ware weg, 🔒 ${b.jail}s gesperrt`); updateHUD(); });
  G.on('dealDone', r => { updateHUD(); });
  G.on('raid', ({ left, reason }) => { playSfx('milestone');
    toast(reason === 'body'
      ? `🚨 Die Leiche wurde gefunden — RAZZIA! Club ${left}s dicht.`
      : `🚨 RAZZIA! Der Club ist ${left}s fast geschlossen — die Gäste sind weg.`); updateHUD(); });
  G.on('combo', ({ n, mult }) => { playSfx('coin', 1 + Math.min(12, n) * 0.06); if (n === 2 || n % 3 === 0) { addShake(2); toast(`🔥 COMBO ×${n} — ${Math.round((mult - 1) * 100)} % Bonus!`); } });
  G.on('nightReport', r => nightReportPopup(r));
  G.on('boost', () => {});

  updateHUD();
}

// ------------------------------------------------------------------
//  Raum-Detailansicht (Zoom in einen Raum)
// ------------------------------------------------------------------
function showRoomHud(id) {
  const m = ROOM_META[id] || { icon: '📍', name: id };
  $('#room-title').textContent = `${m.icon} ${m.name}`;
  $('#room-hud').classList.remove('hidden');
  $('#side-rail').classList.add('dim-hide');
  $('#tap-hint').classList.add('dim-hide');
}
function hideRoomHud() {
  $('#room-hud').classList.add('hidden');
  $('#side-rail').classList.remove('dim-hide');
  $('#tap-hint').classList.remove('dim-hide');
}
function openRoomView(id) { if (enterRoom(id)) { showRoomHud(id); playSfx('click'); } }
// Zurück: Raum verlassen → Iso-Übersicht
function closeRoomView() { detailBack(); hideRoomHud(); playSfx('click'); }

// Feedback vom Canvas (Taps)
export function canvasFeedback(fb) {
  if (fb.type === 'enterRoom') { showRoomHud(fb.room); playSfx('click'); return; }
  if (fb.type === 'tap') {
    floatText({ x: fb.x, y: fb.y - 10 }, '+🔥 Hype', 'float-buy');
    playSfx('tap');
  } else if (fb.type === 'collect') {
    const combo = G.comboInfo ? G.comboInfo() : { n: 0 };
    const big = combo.n >= 3;
    floatText({ x: fb.x, y: fb.y - 10 }, '+' + fmt(fb.amount) + ' €' + (combo.n >= 2 ? '  ×' + combo.n : ''), big ? 'float-crit' : 'float-money');
    coinBurst(fb.x, fb.y, Math.min(14, 5 + (combo.n || 1)));
    addShake(big ? 3.5 : 1.6);
    playSfx('buy');
  } else if (fb.type === 'step') {
    playSfx('step');
  } else if (fb.type === 'gold') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🍾 +' + fmt(fb.money) + ' €' + (fb.gems ? ' +' + fb.gems + '💎' : ''), 'float-celeb');
    playSfx('chest');
    confetti(20);
  } else if (fb.type === 'celeb') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🌟 +' + fmt(fb.money) + ' €' + (fb.gems ? ' +' + fb.gems + '💎' : ''), 'float-celeb');
    playSfx('chest');
    confetti(16);
  } else if (fb.type === 'work') {
    floatText({ x: fb.x, y: fb.y - 10 }, '＋', 'float-buy');
    playSfx('tap');
  } else if (fb.type === 'ugstart') {
    playSfx('buy');
  } else if (fb.type === 'ugtrip') {
    const p = fb.x != null ? { x: fb.x, y: fb.y - 10 } : { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
    floatText(p, '📦 Fuhre geschafft', 'float-money');
    playSfx('buy');
  } else if (fb.type === 'ugdone') {
    playSfx('chest'); confetti(14);
  } else if (fb.type === 'ugspotted') {
    playSfx('click');
  } else if (fb.type === 'ugdistract') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🔊 Ablenkung', 'float-buy');
    playSfx('tap');
  } else if (fb.type === 'ugbribe') {
    floatText({ x: fb.x, y: fb.y - 10 }, '💶 Bestochen', 'float-money');
    playSfx('buy');
  } else if (fb.type === 'ugflee') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🏃 Abgehauen', 'float-celeb');
    playSfx('click');
  } else if (fb.type === 'ugcaught') {
    playSfx('milestone');
  } else if (fb.type === 'ugkill') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🔫 Ausgeschaltet', 'float-celeb');
    playSfx('milestone');
  } else if (fb.type === 'ugbodyfound') {
    floatText({ x: fb.x, y: fb.y - 10 }, '😱 gefunden…', 'float-celeb');
    playSfx('click');
  } else if (fb.type === 'ugbodyhid') {
    floatText({ x: fb.x, y: fb.y - 10 }, '😮‍💨 entsorgt', 'float-money');
    playSfx('buy');
  } else if (fb.type === 'ugbust') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🚨 ERWISCHT!', 'float-celeb');
    playSfx('milestone');
  } else if (fb.type === 'runStart') {
    playSfx('buy');
  } else if (fb.type === 'runGrab') {
    playSfx('chest');
  } else if (fb.type === 'runNoCash') {
    floatText({ x: fb.x, y: fb.y - 10 }, '❌ Zu wenig Geld', 'float-celeb');
    playSfx('click');
  } else if (fb.type === 'shoot') {
    playSfx('shot');
  } else if (fb.type === 'hitGuard') {
    playSfx('shot');
  } else if (fb.type === 'guardDown') {
    playSfx('buy'); playSfx('coin', 1.3);
  } else if (fb.type === 'playerHit') {
    playSfx('hurt');
  } else if (fb.type === 'runDead' || fb.type === 'runSurrender') {
    playSfx('alarm');
  } else if (fb.type === 'runExit' || fb.type === 'runFled') {
    document.body.classList.remove('run-mode'); updateHUD();
  } else if (fb.type === 'dealInstant') {
    floatText({ x: fb.x, y: fb.y - 10 }, `🤝 Deal! +${fmt(fb.price)} €`, 'float-money');
    playSfx('chest'); confetti(10);
  } else if (fb.type === 'dealOk') {
    floatText({ x: fb.x, y: fb.y - 10 }, `💰 Verkauft! +${fmt(fb.price)} €`, 'float-money');
    playSfx('buy'); confetti(8);
  } else if (fb.type === 'dealCounter') {
    floatText({ x: fb.x, y: fb.y - 10 }, `😒 Gegenangebot ${fmt(fb.counter)} €`, 'float-buy');
    playSfx('click');
  } else if (fb.type === 'dealWalkout') {
    floatText({ x: fb.x, y: fb.y - 10 }, fb.wucher ? '😡 Wucher! Weg.' : '🚪 Kunde geht…', 'float-celeb');
    playSfx('click');
  } else if (fb.type === 'locked') {
    // Tap auf den gesperrten Nachbarraum → Freischalt-Dialog
    playSfx('click');
    openRoomsModal();
  }
}

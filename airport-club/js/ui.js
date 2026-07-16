// ============================================================
//  AIRPORT – Club Simulator · UI (HUD, Karten, Modals)
// ============================================================
import * as G from './game.js';
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP, ROOMS,
  T2_REQ, MILESTONE_STEP, fmt, fmtTime, costOf, milestoneMult, nextMilestone,
} from './data.js';
import { playSfx } from './sfx.js';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

let buyMode = 1; // 1 | 10 | 25 | 'max'
const BUY_MODES = [1, 10, 25, 'max'];

// ------------------------------------------------------------------
//  HUD
// ------------------------------------------------------------------
export function updateHUD() {
  $('#hud-level .pill-val').textContent = 'Lvl ' + G.state.level;
  $('#hud-gems .pill-val').textContent = fmt(G.state.gems);
  $('#hud-cash .pill-val').textContent = fmt(G.state.money);
  $('#income-rate').textContent = fmt(G.incomePerSec()) + ' €/s';

  // Phasen-Leiste
  const p = G.phaseInfo();
  $('#phase-name').textContent = `Phase ${p.idx + 1} · ${p.name}`;
  $('#phase-count').textContent = `${p.doneCount}/${p.total}`;
  $('#phase-fill').style.width = (p.doneCount / p.total * 100) + '%';
  $('#chest-mid').classList.toggle('chest-open', G.state.midChestClaimed);

  // Hype
  const hypePct = G.dropActive() ? 100 : G.state.hype;
  $('#hype-fill').style.width = hypePct + '%';
  $('#hype-label').textContent = G.dropActive()
    ? '🔊 DROP! x3'
    : `🔥 Hype ${Math.floor(G.state.hype)}%`;
  $('#hype-meter').classList.toggle('dropping', G.dropActive());

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
  updateRoomTabs();
}

// ------------------------------------------------------------------
//  Upgrade-Karten (Top 3 des aktuellen Raums)
// ------------------------------------------------------------------
function cardStations() {
  const room = G.state.room === 't2' && G.state.t2Unlocked ? 't2' : 't1';
  const list = STATIONS.filter(s => s.room === room);
  // die 3 günstigsten nächsten Upgrades zuerst
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
//  Raum-Tabs
// ------------------------------------------------------------------
function updateRoomTabs() {
  ROOMS.forEach(r => {
    const tab = $('#tab-' + r.id);
    tab.classList.toggle('active', G.state.room === r.id);
    if (r.id === 't2') tab.classList.toggle('locked', !G.state.t2Unlocked);
  });
}

function initRoomTabs() {
  const wrap = $('#room-tabs');
  ROOMS.forEach(r => {
    const tab = el('button', 'room-tab', `${r.icon} ${r.name}`);
    tab.id = 'tab-' + r.id;
    tab.addEventListener('click', () => {
      G.state.room = r.id;
      playSfx('click');
      updateHUD();
    });
    wrap.appendChild(tab);
  });
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
      const room = G.state.room === 't2' && G.state.t2Unlocked ? 't2' : 't1';
      const roomDef = ROOMS.find(r => r.id === room);
      list.appendChild(el('div', 'list-caption', `${roomDef.icon} ${roomDef.name} · ${roomDef.sub}`));
      for (const st of STATIONS.filter(s => s.room === room)) {
        const lvl = G.state.stations[st.id] || 0;
        const info = G.buyInfo(st.id, buyMode);
        const income = G.stationIncome(st.id) * G.globalMult();
        const row = el('div', 'station-row' + (info.affordable ? '' : ' dim'));
        row.innerHTML = `
          <div class="st-icon">${st.icon}</div>
          <div class="st-info">
            <div class="st-name">${st.name} <span class="st-lvl">Stufe ${lvl}</span></div>
            <div class="st-desc">${lvl > 0 ? '💶 ' + fmt(income) + ' €/s' : st.desc}
              ${milestoneMult(lvl) > 1 ? ` · <b>x${milestoneMult(lvl)}</b>` : ''}</div>
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
    renderRows();
    setRefresher(renderRows);
  });
}

// ---- Personal-Modal ---------------------------------------------------
function openStaffModal() {
  openModal('👥 Personal', body => {
    const list = el('div', 'station-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
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
function openRoomsModal() {
  openModal('📍 Räume', body => {
    const list = el('div', 'room-list');
    body.appendChild(list);
    function render() {
      list.innerHTML = '';
      // Terminal 1
      const r1 = el('div', 'room-card unlocked');
      r1.innerHTML = `<div class="room-emoji">🪩</div>
        <div class="room-info"><b>Terminal 1</b><span>Mainfloor · ${fmt(G.roomIncome('t1'))} €/s</span></div>
        <button class="btn-buy"><b>Betreten</b></button>`;
      r1.querySelector('button').addEventListener('click', () => { G.state.room = 't1'; closeModal(); updateHUD(); });
      list.appendChild(r1);
      // Terminal 2
      const r2 = el('div', 'room-card ' + (G.state.t2Unlocked ? 'unlocked' : 'locked'));
      if (G.state.t2Unlocked) {
        r2.innerHTML = `<div class="room-emoji">🥂</div>
          <div class="room-info"><b>Terminal 2</b><span>VIP-Etage · ${fmt(G.roomIncome('t2'))} €/s</span></div>
          <button class="btn-buy"><b>Betreten</b></button>`;
        r2.querySelector('button').addEventListener('click', () => { G.state.room = 't2'; closeModal(); updateHUD(); });
      } else {
        const lvlOk = G.state.level >= T2_REQ.level;
        const afford = G.state.money >= T2_REQ.cost;
        r2.innerHTML = `<div class="room-emoji">🔒</div>
          <div class="room-info"><b>Terminal 2 · VIP</b>
            <span>${lvlOk ? 'Bereit zur Eröffnung!' : 'Ab Level ' + T2_REQ.level + ' (du: ' + G.state.level + ')'}</span></div>
          <button class="btn-buy${lvlOk && afford ? '' : ' disabled'}"><span>Freischalten</span><b>${fmt(T2_REQ.cost)} €</b></button>`;
        r2.querySelector('button').addEventListener('click', () => {
          if (G.unlockT2()) {
            playSfx('chest'); confetti(40); closeModal(); updateHUD();
            toast('🎉 Terminal 2 ist eröffnet! VIP-Gäste strömen rein!');
          }
        });
      }
      list.appendChild(r2);
      // Rooftop-Teaser
      const r3 = el('div', 'room-card teaser');
      r3.innerHTML = `<div class="room-emoji">🌃</div>
        <div class="room-info"><b>Rooftop „Tower“</b><span>Demnächst … 👀</span></div>
        <button class="btn-buy disabled"><b>Bald</b></button>`;
      list.appendChild(r3);

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

// ---- Einstellungen ---------------------------------------------------------------
function openSettingsModal() {
  openModal('⚙️ Einstellungen', body => {
    body.innerHTML = `
      <button class="btn-flat" id="set-sound">${G.state.settings.sound ? '🔊 Sound: an' : '🔇 Sound: aus'}</button>
      <button class="btn-flat danger" id="set-reset">🗑️ Spielstand löschen</button>
      <p class="modal-text small">„Airport“ Club Simulator · Spielstand wird automatisch lokal gespeichert.<br>
      Ruf-Sterne: ${G.state.fame} ⭐ · Insgesamt verdient: ${fmt(G.state.lifetime)} €</p>`;
    body.querySelector('#set-sound').addEventListener('click', e => {
      G.state.settings.sound = !G.state.settings.sound;
      G.save();
      e.target.textContent = G.state.settings.sound ? '🔊 Sound: an' : '🔇 Sound: aus';
    });
    body.querySelector('#set-reset').addEventListener('click', () => {
      if (confirm('Wirklich ALLES löschen? Das kann nicht rückgängig gemacht werden!')) G.resetSave();
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
  initRoomTabs();

  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#phasebar').addEventListener('click', openQuestModal);
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

  // Spiel-Events
  G.on('levelup', ({ level, gems }) => {
    playSfx('level');
    confetti(24);
    toast(`⭐ Level ${level}! +${gems} 💎`);
  });
  G.on('milestone', ({ id, level }) => {
    const st = STATION_MAP[id];
    playSfx('milestone');
    confetti(20);
    toast(`🚀 ${st.icon} ${st.name} Stufe ${level}: Einkommen x2!`);
  });
  G.on('quest', ({ txt }) => {
    playSfx('quest');
    toast('✅ Aufgabe geschafft: ' + txt);
  });
  G.on('chest', ({ kind, gems, money }) => chestPopup(kind, gems, money));
  G.on('phase', ({ idx, name }) => toast(`🏁 Phase ${idx + 1} erreicht: „${name}“`));
  G.on('drop', () => { playSfx('drop'); toast('🔊 DROP! Alle rasten aus — x3 Einkommen!'); });
  G.on('celebSpawn', () => toast('🌟 Ein Promi ist im Club! Tipp ihn an!'));
  G.on('t2unlocked', () => {});
  G.on('boost', () => {});

  updateHUD();
}

// Feedback vom Canvas (Taps)
export function canvasFeedback(fb) {
  if (fb.type === 'tap') {
    floatText({ x: fb.x, y: fb.y - 10 }, '+' + fmt(fb.gain) + ' €', 'float-money');
    playSfx('tap');
  } else if (fb.type === 'celeb') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🌟 +' + fmt(fb.money) + ' €' + (fb.gems ? ' +' + fb.gems + '💎' : ''), 'float-celeb');
    playSfx('chest');
    confetti(16);
  }
}

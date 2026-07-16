// ============================================================
//  AIRPORT – Club Simulator · UI (HUD, Karten, Modals)
// ============================================================
import * as G from './game.js';
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP, ROOMS,
  T2_REQ, ROOF_REQ, PERFORMER, AUTOCOLLECT, WHEEL, ACHIEVEMENTS,
  autoCollectInterval, MILESTONE_STEP, fmt, fmtTime, costOf, milestoneMult, nextMilestone,
} from './data.js';
import { playSfx, setMusic } from './sfx.js';
import { enterRoom, exitRoom } from './render.js';

const ROOM_META = {
  t1:   { icon: '🪩', name: 'Terminal 1',        sub: 'Mainfloor' },
  t2:   { icon: '🥂', name: 'Terminal 2 · VIP',  sub: 'VIP-Etage' },
  roof: { icon: '🌃', name: 'Rooftop',           sub: 'Sky Lounge' },
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

// ------------------------------------------------------------------
//  HUD
// ------------------------------------------------------------------
export function updateHUD() {
  $('#hud-level .pill-val').textContent = 'Lvl ' + G.state.level;
  $('#hud-gems .pill-val').textContent = fmt(G.state.gems);
  $('#hud-cash .pill-val').textContent = fmt(G.state.money);
  $('#income-rate').textContent = fmt(G.incomePerSec()) + ' €/s';

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
  $('#btn-showact').classList.toggle('hidden', !(G.state.performer.unlocked || G.state.level >= PERFORMER.level));

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

// ---- Einstellungen ---------------------------------------------------------------
function openSettingsModal() {
  openModal('⚙️ Einstellungen', body => {
    body.innerHTML = `
      <button class="btn-flat" id="set-music">${G.state.settings.music ? '🎵 Musik: an' : '🎵 Musik: aus'}</button>
      <button class="btn-flat" id="set-sound">${G.state.settings.sound ? '🔊 Sound: an' : '🔇 Sound: aus'}</button>
      <button class="btn-flat danger" id="set-reset">🗑️ Spielstand löschen</button>
      <p class="modal-text small">„Airport“ Club Simulator · Spielstand wird automatisch lokal gespeichert.<br>
      Ruf-Sterne: ${G.state.fame} ⭐ · Insgesamt verdient: ${fmt(G.state.lifetime)} €</p>`;
    body.querySelector('#set-music').addEventListener('click', e => {
      setMusic(!G.state.settings.music);
      G.save();
      e.target.textContent = G.state.settings.music ? '🎵 Musik: an' : '🎵 Musik: aus';
    });
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
  $('#btn-daily').addEventListener('click', openDailyModal);
  $('#btn-ach').addEventListener('click', openAchievementsModal);
  $('#btn-showact').addEventListener('click', openPerformerModal);
  // Zurück aus der Raum-Detailansicht
  $('#room-back').addEventListener('click', closeRoomView);

  // Spiel-Events
  G.on('levelup', ({ level, gems }) => {
    playSfx('level');
    confetti(24);
    toast(`⭐ Level ${level}!` + (gems ? ` +${gems} 💎` : ''));
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
  G.on('roofunlocked', () => { playSfx('chest'); confetti(50); toast('🌃 Rooftop eröffnet — Sky Lounge über den Dächern!'); });
  G.on('performer', () => {});
  G.on('autocollect', () => {});
  G.on('event', def => { playSfx('boost'); toast(`${def.icon} ${def.name}! ${def.txt}`); });
  G.on('eventEnd', () => {});
  G.on('achievement', a => { playSfx('level'); toast(`🏆 Erfolg: ${a.name} · +${a.gems} 💎`); });
  G.on('boost', () => {});

  updateHUD();
}

// ------------------------------------------------------------------
//  Raum-Detailansicht (Zoom in einen Raum)
// ------------------------------------------------------------------
function showRoomHud(id) {
  const m = ROOM_META[id];
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
function closeRoomView() { exitRoom(); hideRoomHud(); playSfx('click'); }

// Feedback vom Canvas (Taps)
export function canvasFeedback(fb) {
  if (fb.type === 'enterRoom') { showRoomHud(fb.room); playSfx('click'); return; }
  if (fb.type === 'tap') {
    floatText({ x: fb.x, y: fb.y - 10 }, '+🔥 Hype', 'float-buy');
    playSfx('tap');
  } else if (fb.type === 'collect') {
    floatText({ x: fb.x, y: fb.y - 10 }, '+' + fmt(fb.amount) + ' €', 'float-money');
    playSfx('buy');
  } else if (fb.type === 'celeb') {
    floatText({ x: fb.x, y: fb.y - 10 }, '🌟 +' + fmt(fb.money) + ' €' + (fb.gems ? ' +' + fb.gems + '💎' : ''), 'float-celeb');
    playSfx('chest');
    confetti(16);
  } else if (fb.type === 'locked') {
    // Tap auf den gesperrten Nachbarraum → Freischalt-Dialog
    playSfx('click');
    openRoomsModal();
  }
}

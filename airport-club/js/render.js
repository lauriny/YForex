// ============================================================
//  AIRPORT – Club Simulator · Isometrische Render-Engine
//  2:1-Iso, fit-to-view-Kamera, 4 Räume als Cutaway-Grundriss,
//  plastische Möbel (3 Sichtflächen), detaillierte Figuren.
// ============================================================
import {
  state, totalLevels, dropActive, tapCeleb, tapHype,
  depositAtStation, collectStation, roomUnlocked,
  eventDef, eventGuestMult, incomePerSec,
  marketingGuestBonus, marketingSpawnBonus, activeDjDef,
  currentDrink, activeTheme, goldenBottleReward, nightReport,
} from './game.js';
import { fmt, CASH_STATIONS, DRINKS, drinkTier } from './data.js';
import { musicBpm } from './sfx.js';

let canvas, ctx, W = 0, H = 0, DPR = 1;
let particles = [];
let startTime = performance.now();

// ---------------- Iso-Projektion & Kamera ----------------
// Welt in Tiles: x → rechts-unten, y → links-unten, z → hoch.
const TILE = { w: 32, h: 16, z: 15 };
const cam = { s: 1, ox: 0, oy: 0 };        // aktuelle (animierte) Transform
let camOver = { s: 1, ox: 0, oy: 0 };      // Übersicht
let camRooms = {};                          // id -> Detail-Transform
let focusRoom = null;                       // null = Übersicht, sonst Raum-Id
let focusAmt = 0;                            // 0..1 (Detail-Fokus, animiert)
let lastFocusRoom = 't1';                    // zuletzt fokussierter Raum (für Vignette-Ausblenden)

// rohe Iso-Projektion (ohne Kamera) — für Kamera-Berechnungen
function projRaw(x, y, z = 0) {
  return { x: (x - y) * TILE.w * 0.5, y: (x + y) * TILE.h * 0.5 - z * TILE.z };
}
function iso(x, y, z = 0) {
  const p = projRaw(x, y, z);
  return { x: cam.ox + p.x * cam.s, y: cam.oy + p.y * cam.s };
}

// Transform, die eine Punktwolke ins View einpasst
function fitTransform(pts, padX, padY, zoom = 1, biasY = 0) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const c of pts) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const s = Math.min((W - padX * 2) / (maxX - minX), (H - padY * 2) / (maxY - minY)) * zoom;
  return {
    s,
    ox: (W - (maxX - minX) * s) / 2 - minX * s,
    oy: (H - (maxY - minY) * s) / 2 - minY * s + biasY,
  };
}

// ---------------- Grundriss (Welt-Tiles) ----------------
// Vier Räume; Kamera fasst immer alle, gesperrte werden abgedunkelt.
const RM = {
  t1:   { x: 0,  y: 7,  w: 9, d: 8, name: 'TERMINAL 1' },
  klo:  { x: 0,  y: 0,  w: 4, d: 6, name: 'WC' },
  t2:   { x: 10, y: 0,  w: 9, d: 9, name: 'TERMINAL 2' },
  roof: { x: 10, y: 10, w: 9, d: 8, name: 'ROOFTOP · VIP' },
};
// Club-Ausbau vergrößert das GEBÄUDE (Terminal 1): Wände wandern nach rechts/unten,
// Möbel bleiben an den Wänden (nach aussen), die Tanzfläche in der Mitte wird größer.
function t1Grow() { const cs = state.clubSize || 0; return { dw: cs * 1.0, dd: cs * 0.7 }; }   // moderater Ausbau (Raum bleibt luftig)
function applyClubSize() { const g = t1Grow(); RM.t1.w = 9 + g.dw; RM.t1.d = 8 + g.dd; }
// Tanzfläche wächst mit dem Gebäude (gemeinsam genutzt von Zeichnung & Gäste-Ziel)
function t1DanceFloor() { const g = t1Grow(); return { x: 2.5, y: 9.3, w: 4.6 + g.dw, d: 4.2 + g.dd }; }
// Eingang (innen, direkt am Türsteher) — skaliert mit dem Gebäude
function doorPoint() { const g = t1Grow(); return { x: 4.0 + g.dw * 0.5, y: 14.2 + g.dd }; }

// ---- Nachtzeit & „je später, desto mehr geht ab" ----
let clubClock = 22 * 60;                 // Minuten seit Mitternacht, Start 22:00
const NIGHT_START = 22 * 60, NIGHT_END = 26 * 60;   // 22:00 → 02:00 (dann Loop)
let nightLifetimeStart = null;           // Einnahmen-Snapshot beim Nacht-Start (für den Nacht-Report)
export function devSetClock(min) { clubClock = Math.max(NIGHT_START, Math.min(NIGHT_END - 0.5, min)); }
function updateClock(dt) {
  if (nightLifetimeStart == null) nightLifetimeStart = state.lifetime;
  clubClock += dt * 0.7;                 // ~1 Spielminute/1.4 s
  if (clubClock >= NIGHT_END) {          // 02:00 — Nacht geschafft → Report + Bonus + neue Nacht
    clubClock = NIGHT_START;
    nightReport(Math.max(0, state.lifetime - nightLifetimeStart));
    nightLifetimeStart = state.lifetime;
  }
}
function nightProgress() { return Math.max(0, Math.min(1, (clubClock - NIGHT_START) / (NIGHT_END - NIGHT_START))); }
function nightDrunk() { return nightProgress() * (dropActive() ? 1 : 0.9); }   // 0..1 Betrunkenheit/Energie
function clockLabel() { const h = Math.floor(clubClock / 60) % 24, m = Math.floor(clubClock % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
// Welt-Position eines Geld-Ankers inkl. Club-Ausbau-Versatz (Shots/Garderobe wandern nach aussen)
function anchorWorld(id) {
  const a = A[id], g = t1Grow();
  if (id === 'shots') return { x: a.x + g.dw, y: a.y };
  if (id === 'garderobe') return { x: a.x + g.dw, y: a.y + g.dd };
  return a;
}
const WALL_H = 2.1;  // Wandhöhe in z-Einheiten
const CENTER = { x: 9.4, y: 8.4 };            // Kreuzung der Räume
const DOOR = {                                 // Übergang je Raum → Zentrum
  t1:   { x: 8.4, y: 10.5 },
  klo:  { x: 3.0, y: 6.2 },
  t2:   { x: 10.6, y: 6.5 },
  roof: { x: 10.6, y: 10.6 },
};
const ENTRY_OUT = { x: 4, y: 17.5 };
const ENTRY_IN  = { x: 4, y: 14 };

// Möbel-Anker (Welt-Mittelpunkte) — auch Ziel der Gäste & Ort der Geld-Pins
const A = {
  dj:        { x: 4.5, y: 7.7, room: 't1' },
  bar:       { x: 0.9, y: 10.5, room: 't1' },
  shots:     { x: 7.9, y: 9.0, room: 't1' },
  garderobe: { x: 7.4, y: 13.4, room: 't1' },
  dance1:    { x: 4.3, y: 11.2, room: 't1' },
  toilet:    { x: 2.0, y: 2.2, room: 'klo' },
  vipbar:    { x: 11.2, y: 1.4, room: 't2' },  // champus
  dance2:    { x: 14.2, y: 4.2, room: 't2' },  // second
  tables:    { x: 16.2, y: 6.4, room: 't2' },
  chill:     { x: 17.3, y: 2.4, room: 't2' },
  vipdoor:   { x: 10.7, y: 6.6, room: 't2' },  // vipEinlass
  skybar:    { x: 11.3, y: 11.3, room: 'roof' },
  pool:      { x: 16.6, y: 15.3, room: 'roof' },
  stars:     { x: 14.0, y: 13.2, room: 'roof' },
};
// Station-Id → Anker für Geld-Pin
const PIN_AT = {
  bar: 'bar', shots: 'shots', garderobe: 'garderobe',
  champus: 'vipbar', tables: 'tables', chill: 'chill',
  skybar: 'skybar', pool: 'pool',
};

const GUEST_COLORS = ['#e74c8b', '#4f9cf7', '#f7b32b', '#42d6a4', '#b06df7', '#f76d4f', '#4fd7f7', '#95e04a', '#ff8fab', '#5eead4'];
const SKIN = ['#ffd9b3', '#f0b98c', '#c68a53', '#8c5a33', '#5c3a21'];
const HAIR = ['#2b1c10', '#5a3617', '#c98b2d', '#1a1a22', '#7a4a86', '#b8452c', '#d9d0c0'];
const DRINKS_T1 = ['🍹', '🍺', '🍸', '🥃'];
const DRINKS_T2 = ['🥂', '🍾', '🍸'];

// ---------------- Setup ----------------
export function initCanvas(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', () => { ptr = null; });
}

// Pointer/Wisch: unterscheidet Tippen (Aktion) von Ziehen (Raum verschieben)
let ptr = null;
function onPointerDown(e) {
  ptr = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
}
function onPointerMove(e) {
  if (!ptr) return;
  ptr.lx = e.clientX; ptr.ly = e.clientY;
  if (Math.abs(e.clientX - ptr.x0) + Math.abs(e.clientY - ptr.y0) > 8) ptr.moved = true;
  // kein Kamera-Pan mehr: Räume werden per ◀ ▶ gewechselt, nicht durch Wischen
}
function onPointerUp(e) {
  if (!ptr) return;
  const moved = ptr.moved; ptr = null;
  if (!moved) handleTap(e);
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  DPR = Math.min(1.5, window.devicePixelRatio || 1);   // Deckel für flüssige Performance auf Retina
  W = r.width; H = r.height;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  setupCamera();
}

// Übersichts- und Raum-Detail-Kameras berechnen
function setupCamera() {
  // Übersicht: ganze Szene inkl. Vorplatz
  const overPts = [
    projRaw(RM.klo.x - 0.6, RM.klo.y - 0.6, WALL_H + 0.6),
    projRaw(RM.t2.x + RM.t2.w + 0.6, RM.t2.y - 0.6, WALL_H),
    projRaw(RM.roof.x + RM.roof.w + 0.6, RM.roof.y + RM.roof.d + 0.6, 0),
    projRaw(RM.t1.x - 1.4, RM.t1.y + RM.t1.d + 0.6, 0),
    projRaw(ENTRY_OUT.x + 3.2, ENTRY_OUT.y + 1.4, 0),
    projRaw(ENTRY_OUT.x - 3.2, ENTRY_OUT.y + 1.4, 0),
  ];
  camOver = fitTransform(overPts, W * 0.03, H * 0.03, 1.12, H * 0.03);

  // Raum-Detail: einzelnen Raum groß einpassen (Nachbarn dürfen am Rand bleiben)
  camRooms = {};
  for (const id in RM) {
    const r = RM[id];
    const m = 0.8;
    const pts = [
      projRaw(r.x - m, r.y - m, WALL_H + 0.5),
      projRaw(r.x + r.w + m, r.y - m, WALL_H),
      projRaw(r.x + r.w + m, r.y + r.d + m, 0),
      projRaw(r.x - m, r.y + r.d + m, 0),
    ];
    camRooms[id] = fitTransform(pts, W * 0.02, H * 0.18, 1.0, 0);
  }

  if (!focusRoom) Object.assign(cam, camOver);
  frameRoom(framedRoom, false);   // Einzel-Raum-Rahmen an neue Bildschirmgröße anpassen
}

// Raum betreten / verlassen (von Tap oder UI aufgerufen)
export function enterRoom(id) {
  if (!roomUnlocked(id) || !RM[id]) return false;
  focusRoom = id; frameRoom(id, false);   // genau diesen Raum bildschirmfüllend zeigen
  return true;
}
// freigeschaltete Räume der Reihe nach (für ◀ ▶ Raumwechsel)
function unlockedRooms() { return ROOM_ORDER.filter(roomUnlocked); }
export function switchRoom(dir) {
  const list = unlockedRooms(); if (!list.length) return framedRoom;
  let i = list.indexOf(framedRoom); if (i < 0) i = 0;
  const id = list[(i + dir + list.length) % list.length];
  focusRoom = id; frameRoom(id, true);
  return id;
}
export function nextRoom() { return switchRoom(1); }
export function prevRoom() { return switchRoom(-1); }
// Zurück-Taste: Raum verlassen → Iso-Übersicht
export function detailBack() { focusRoom = null; return 'exit'; }
export function exitRoom() { focusRoom = null; }
export function currentRoom() { return focusRoom; }
export function inRoomView() { return focusAmt > 0.5; }

// ---------------- Interaktion ----------------
let onTapFeedback = null;
export function setTapFeedback(cb) { onTapFeedback = cb; }

function pointInQuad(px, py, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const xi = q[i].x, yi = q[i].y, xj = q[j].x, yj = q[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function roomFloorQuad(r) {
  return [iso(r.x, r.y), iso(r.x + r.w, r.y), iso(r.x + r.w, r.y + r.d), iso(r.x, r.y + r.d)];
}

function handleTap(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  // Promi zuerst (große Trefferfläche)
  if (state.celeb) {
    const c = guests.find(g => g.celeb);
    if (c) {
      const s = iso(c.x, c.y);
      if (Math.hypot(mx - s.x, my - (s.y - 22)) < 40) {
        const r = tapCeleb();
        if (r && onTapFeedback) onTapFeedback({ type: 'celeb', x: e.clientX, y: e.clientY, ...r });
        return;
      }
    }
  }
  const roomV = inRoomView();
  // Goldene Flasche antippen → Bonus
  if (goldBottle && roomV && goldBottle.room === framedRoom) {
    const p = detailProj(goldBottle.x, goldBottle.y);
    if (Math.hypot(mx - p.x, my - (p.y - dTileW() * 0.5)) < 44) {
      const r = goldenBottleReward();
      if (onTapFeedback) onTapFeedback({ type: 'gold', x: e.clientX, y: e.clientY, ...r });
      goldBottle = null; gbTimer = rnd(35, 70);
      return;
    }
  }
  // Geld-Pins einsammeln (Iso-Übersicht ODER im gezeigten Raum)
  for (const [stId, anchorId] of Object.entries(PIN_AT)) {
    if ((state.stationCash[stId] || 0) < 1) continue;
    if (roomV && A[anchorId].room !== framedRoom) continue;   // nur der gerade gezeigte Raum
    const a = roomV ? anchorWorld(anchorId) : A[anchorId];
    const s = roomV ? (() => { const p = detailProj(a.x, a.y); return { x: p.x, y: p.y - dTileW() * 1.05 }; })() : iso(a.x, a.y, 1.15);
    if (Math.hypot(mx - s.x, my - s.y) < (roomV ? 40 : 30)) {
      const amount = collectStation(stId, true);   // manuell → Combo-Bonus möglich
      if (amount > 0 && onTapFeedback) onTapFeedback({ type: 'collect', x: e.clientX, y: e.clientY, amount });
      return;
    }
  }
  // In der Iso-Übersicht: Tap auf einen Raum wählt ihn aus
  if (!inRoomView()) {
    for (const id of ['roof', 't2', 't1']) {   // WC gehört zu Terminal 1
      if (pointInQuad(mx, my, roomFloorQuad(RM[id]))) {
        if (roomUnlocked(id)) {
          enterRoom(id);
          if (onTapFeedback) onTapFeedback({ type: 'enterRoom', room: id });
        } else {
          if (onTapFeedback) onTapFeedback({ type: 'locked', room: id });
        }
        return;
      }
    }
  }
  // Leerer Tap: nichts (Hype entsteht nur automatisch durch den Betrieb)
}

// ============================================================
//  Gäste-Simulation (Zustandsautomat auf Iso-Grid)
// ============================================================
// Lokaler Toiletten-Ausgang je Raum (Gäste bleiben im Raum sichtbar)
// WC-Ausgang zeigt in die Richtung, in der das Klo in der Übersicht liegt (oben-links)
const WC_DOOR = { t1: { x: 0.55, y: 7.75 }, t2: { x: 17.6, y: 7.9 }, roof: { x: 17.4, y: 16.6 } };   // t1: innere Verbindungstür zum WC-Anbau (an der linken Wand)
// WC-Anbau: kleiner Raum direkt über Terminal 1 (Teil von T1, kein eigener wechselbarer Raum)
const WC_ANNEX = { x: -2.85, y: 6.2, w: 2.6, d: 3.0 };   // eigenständiger WC-Anbau AUSSEN oben-links, mit Tür nach draußen + Tür ins Gebäude
const BACKSTAGE = { x: 7.35, y: 7.7 };   // oben-rechts, neben dem DJ in Terminal 1
let guests = [];
let taxis = [];        // vorbeifahrende Taxen, die vor dem Eingang Gäste absetzen
let taxiTimer = 5;
let goldBottle = null; // Goldene Flasche: spawnt zufällig im gezeigten Raum, Antippen = Bonus
let gbTimer = 25;
function updateGoldBottle(dt) {
  if (goldBottle) {
    goldBottle.ttl -= dt;
    if (goldBottle.ttl <= 0) { goldBottle = null; gbTimer = rnd(35, 70); }
    return;
  }
  gbTimer -= dt;
  if (gbTimer <= 0 && inRoomView() && roomUnlocked(framedRoom)) {
    const r = RM[framedRoom];
    goldBottle = { room: framedRoom, x: rnd(r.x + 1.2, r.x + r.w - 1.2), y: rnd(r.y + 2.2, r.y + r.d - 1.2), ttl: 11, t0: performance.now() / 1000 };
  }
}
let sec = null;   // aktiver Security/Türsteher-Einsatz bei Randalierern: { x, y, phase, tm }

function aliveGuests() { let n = 0; for (const g of guests) if (!g.celeb) n++; return n; }

// Taxen: gelegentlich fährt eins vorbei, hält vor dem Eingang und lässt Leute raus.
// Mit Marketing kommen mehrere Taxen dichter hintereinander (Gäste „strömen von draußen rein").
const CAR_COLORS = ['#3b6bd6', '#2fa36b', '#c0392b', '#d98a1e', '#5b4b8a', '#2b2f38', '#c9c2b6'];
function updateTaxis(dt) {
  const mkt = marketingSpawnBonus();          // >0, wenn Marketing aktiv
  const busy = mkt > 0.05;
  taxiTimer -= dt;
  if (taxiTimer <= 0 && taxis.length < (busy ? 3 : 2) && roomUnlocked('t1')) {
    taxiTimer = busy ? rnd(3.5, 8) : rnd(12, 24);
    // Fahrzeug-Typ würfeln: meistens Taxi, oft ein normales Auto, selten ein Supercar mit vielen Mädels
    const roll = Math.random();
    let v;
    if (roll < 0.16) {          // Supercar: hält, viele weibliche Gäste steigen aus
      v = { kind: 'super', color: pick(['#e11d2e', '#ff7a00', '#111318', '#f4c400', '#00b3a4']),
            state: 'drive', stops: true, allFemale: true, n: Math.round(rnd(3, 5)) };
    } else if (roll < 0.48) {   // normales Auto: fährt meist nur vorbei, setzt selten jmd. ab
      const stops = Math.random() < 0.4;
      v = { kind: 'car', color: pick(CAR_COLORS), state: 'drive', stops, allFemale: false, n: stops ? Math.round(rnd(1, 2)) : 0 };
    } else {                    // Taxi
      v = { kind: 'taxi', color: '#f4bf1a', state: 'drive', stops: true, allFemale: false,
            n: busy ? Math.round(rnd(2, 4)) : Math.round(rnd(1, 2)) };
    }
    v.fx = -0.14; v.tm = 0; v.dropped = 0; v.stopFx = rnd(0.4, 0.56);
    taxis.push(v);
  }
  for (let i = taxis.length - 1; i >= 0; i--) {
    const tx = taxis[i];
    if (tx.state === 'drive') {
      tx.fx += dt * (tx.kind === 'super' ? 0.4 : 0.34);
      if (tx.stops && tx.fx >= tx.stopFx) { tx.fx = tx.stopFx; tx.state = 'stop'; tx.tm = tx.kind === 'super' ? 2.4 : 1.8; }
      else if (!tx.stops && tx.fx > 1.25) taxis.splice(i, 1);
    } else if (tx.state === 'stop') {
      tx.tm -= dt;
      const dur = tx.kind === 'super' ? 2.4 : 1.8;
      if (tx.dropped < tx.n && tx.tm < dur - tx.dropped * (tx.kind === 'super' ? 0.32 : 0.45)) {
        if (aliveGuests() < targetGuestCount()) { const g = spawnGuest(); if (g && tx.allFemale) { g.female = true; g.color = pick(['#ff4fa3', '#e6b3ff', '#ff85b3', '#c98fe0']); } }
        tx.dropped++;
      }
      if (tx.tm <= 0) tx.state = 'go';
    } else { tx.fx += dt * (tx.kind === 'super' ? 0.5 : 0.42); if (tx.fx > 1.3) taxis.splice(i, 1); }
  }
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function inRoom(r, mx = 0.6) { return { x: rnd(r.x + mx, r.x + r.w - mx), y: rnd(r.y + mx, r.y + r.d - mx) }; }

function targetGuestCount() {
  let base = 6 + Math.floor(totalLevels() / 7);
  if (state.roofUnlocked) base += 6; else if (state.t2Unlocked) base += 3;
  base += (state.clubSize || 0) * 6;   // größerer Club → mehr Gäste
  base += marketingGuestBonus();       // Marketing → mehr Gäste bis der Raum voll ist
  return Math.min(60, Math.floor(base * eventGuestMult()));   // Deckel für flüssige Performance
}

function spawnGuest(celeb = false) {
  const vip = !celeb && state.t2Unlocked && Math.random() < 0.4;
  const dp = doorPoint();
  const g = {
    x: dp.x + rnd(-0.5, 0.5), y: dp.y + rnd(-0.2, 0.3),   // erscheint INNEN am Eingang
    color: celeb ? '#ffd700' : vip ? pick(['#e6b800', '#d4941e', '#c9a227']) : pick(GUEST_COLORS),
    skin: pick(SKIN), hair: pick(HAIR),
    speed: rnd(1.7, 2.5),
    bobPhase: Math.random() * Math.PI * 2,
    female: Math.random() < 0.5,
    vip, celeb, mode: 'walk', act: 'dance', actT: 0,
    drink: null, alpha: 0.05, fadeIn: true, path: [],   // sanft einblenden
  };
  if (!celeb && Math.random() < 0.28) { g.path = [anchorWorld('garderobe')]; g.afterPath = 'ward'; }
  else pushActivity(g, celeb ? 'dance' : chooseAct(g));
  guests.push(g);
  return g;
}

// Routing zwischen Räumen über das Zentrum
function roomOf(x, y) {
  for (const id of ['t1', 'klo', 't2', 'roof']) {
    const r = RM[id];
    if (x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.d + 1) return id;
  }
  return 't1';
}
function routeTo(g, tx, ty) {
  const from = roomOf(g.x, g.y), to = roomOf(tx, ty);
  const path = [];
  if (from !== to) {
    if (DOOR[from]) path.push(DOOR[from]);
    path.push(CENTER);
    if (DOOR[to]) path.push(DOOR[to]);
  }
  path.push({ x: tx, y: ty });
  return path;
}

function chooseAct(g) {
  const r = Math.random();
  if (g.vip && state.roofUnlocked && r < 0.22) return 'roofbar';
  if (g.vip && state.t2Unlocked) {
    if (r < 0.32) return 'vipdance';
    if (r < 0.52) return 'champ';
    if (r < 0.68) return 'sofa';
    if (r < 0.80) return 'dance';
    if (r < 0.90) return 'wc';
    return 'leave';
  }
  if (state.roofUnlocked && r < 0.09) return 'roofbar';
  const inT1 = roomOf(g.x, g.y) === 't1';
  if (r < 0.34) return 'dance';
  if (r < 0.47) return 'bar';
  if (r < 0.57) return 'shots';
  if (r < 0.66) return 'chat';
  if (r < 0.73) return 'selfie';
  if (r < 0.80) return 'wc';
  if (r < 0.86) return 'ward';
  if (r < 0.90 && inT1) return 'backstage';
  if (r < 0.95 && state.t2Unlocked) return 'vipdance';
  return 'leave';
}

function actTarget(act, g) {
  switch (act) {
    case 'dance':    return inRoom(t1DanceFloor());   // Tanzfläche wächst mit dem Gebäude
    case 'vipdance': return inRoom({ x: 12.5, y: 2.5, w: 4, d: 3.5 });
    case 'roofbar':  return Math.random() < 0.5 ? { x: A.skybar.x + rnd(-0.8, 1.2), y: A.skybar.y + 0.9 }
                                                 : { x: A.pool.x + rnd(-1, 1), y: A.pool.y - 1 };
    case 'bar':      return { x: A.bar.x + 1.6, y: A.bar.y + rnd(-1.4, 1.4) };   // klar rechts neben der Theke
    case 'shots': {  const s = anchorWorld('shots'); return { x: s.x - 1.3, y: s.y + rnd(-1, 1) }; }   // links neben der Shot-Bar (wandert mit)
    case 'champ':    return { x: A.vipbar.x + rnd(-0.8, 1), y: A.vipbar.y + 1.3 };
    case 'sofa':     return Math.random() < 0.5 ? { x: A.tables.x + rnd(-0.8, 0.8), y: A.tables.y + 0.9 }
                                                : { x: A.chill.x + rnd(-0.8, 0.8), y: A.chill.y + 0.9 };
    case 'wc': {      // lokaler WC-Ausgang im aktuellen Raum
      const d = WC_DOOR[roomOf(g.x, g.y)] || { x: A.toilet.x, y: A.toilet.y };
      return { x: d.x + rnd(-0.3, 0.3), y: d.y };
    }
    case 'backstage': return { x: BACKSTAGE.x + rnd(-0.4, 0.4), y: BACKSTAGE.y };
    case 'chat':     return inRoom({ x: 2.4, y: 9.2, w: 4.8, d: 4.4 }, 0.4);
    case 'selfie':   return inRoom({ x: 2.9, y: 9.8, w: 3.8, d: 3.8 }, 0.4);
    case 'ward': {   const wd = anchorWorld('garderobe'); return { x: wd.x - 0.6, y: wd.y + 0.6 }; }   // Garderobe wandert mit
    case 'leave':    return doorPoint();   // zum Eingang gehen und dort ausblenden
    default:         return inRoom(RM.t1);
  }
}
const ACT_STATION = { bar: 'bar', shots: 'shots', ward: 'garderobe', champ: 'champus', sofa: null, roofbar: null };
function stationForAct(act) {
  if (act === 'sofa') return Math.random() < 0.5 ? 'tables' : 'chill';
  if (act === 'roofbar') return Math.random() < 0.5 ? 'skybar' : 'pool';
  return ACT_STATION[act] || null;
}

function pushActivity(g, act) {
  g.act = act;
  const t = actTarget(act, g);
  g.mode = 'walk';
  g.path = routeTo(g, t.x, t.y);
}
function actDuration(act) {
  switch (act) {
    case 'dance': case 'vipdance': return rnd(4, 9);
    case 'bar': case 'shots': case 'champ': case 'roofbar': return rnd(3.5, 7);
    case 'sofa': return rnd(5, 10);
    case 'wc': return rnd(2.5, 4.5);
    case 'backstage': return rnd(5, 11);
    case 'chat': return rnd(5, 10);
    case 'selfie': return rnd(2, 4);
    case 'ward': return rnd(1.5, 2.5);
    default: return 2;
  }
}

// Gast aus Möbel-Hindernissen herausdrücken → er gleitet aussen herum statt durch
function avoidObstacles(g) {
  const rad = 0.28, gr = t1Grow();
  for (const o of OBSTACLES) {
    let ox = o.x, oy = o.y;
    if (o.grow === 'shots') ox += gr.dw; else if (o.grow === 'ward') { ox += gr.dw; oy += gr.dd; } else if (o.grow === 'dj') ox += gr.dw * 0.5;
    const minX = ox - rad, maxX = ox + o.w + rad, minY = oy - rad, maxY = oy + o.d + rad;
    if (g.x <= minX || g.x >= maxX || g.y <= minY || g.y >= maxY) continue;
    // kleinste Überlappung finden und in diese Richtung herausschieben (an der Kante entlanggleiten)
    const dL = g.x - minX, dR = maxX - g.x, dT = g.y - minY, dB = maxY - g.y;
    const m = Math.min(dL, dR, dT, dB);
    if (m === dL) g.x = minX; else if (m === dR) g.x = maxX;
    else if (m === dT) g.y = minY; else g.y = maxY;
  }
}

// Gäste, die zu dicht stehen, sanft auseinanderdrücken (kein Stapeln/Schlange an Ständen)
function separateGuests() {
  const minD = 0.52, minD2 = minD * minD;
  for (let i = 0; i < guests.length; i++) {
    const a = guests[i];
    for (let j = i + 1; j < guests.length; j++) {
      const b = guests[j];
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 > minD2 || d2 < 1e-5) continue;
      const d = Math.sqrt(d2), push = (minD - d) * 0.5, nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
  }
  for (const g of guests) if (g.mode === 'act') avoidObstacles(g);   // stehende Gäste von Möbeln fernhalten
}

// Security/Türsteher: manchmal dreht ein (betrunkener) Gast durch → Türsteher eskortiert ihn raus
function updateSecurity(dt) {
  if (!sec) {
    const pool = guests.filter(g => !g.celeb && !g.leaving && !g.trouble && g.y >= RM.t1.y && g.y <= RM.t1.y + RM.t1.d);
    if (pool.length > 4 && Math.random() < dt * (0.012 + nightDrunk() * 0.05)) {
      const tm = pick(pool); tm.trouble = true;
      const dp = doorPoint(); sec = { x: dp.x, y: dp.y, phase: 'toTrouble', tm, bob: 0 };
    }
    return;
  }
  const tm = sec.tm;
  if (!tm || !guests.includes(tm)) { sec = null; return; }        // Randalierer ist raus → Einsatz vorbei
  if (sec.phase === 'toTrouble') {
    const dx = tm.x - sec.x, dy = tm.y - sec.y, d = Math.hypot(dx, dy) || 1;
    if (d < 0.7) { sec.phase = 'escort'; tm.mode = 'walk'; tm.act = 'leave'; tm.afterPath = null; tm.path = [doorPoint()]; tm.walkT = 0; tm.speed = 2.6; }
    else { sec.x += dx / d * 3.2 * dt; sec.y += dy / d * 3.2 * dt; }
  } else {   // escort: dicht hinter dem Randalierer zum Ausgang
    sec.x += (tm.x - sec.x) * dt * 5; sec.y += (tm.y + 0.45 - sec.y) * dt * 5;
  }
}

function updateGuests(dt) {
  updateClock(dt);
  const want = targetGuestCount();
  const alive = guests.filter(g => !g.celeb).length;
  // Gäste kommen GLEICHMÄSSIG rein (nicht alle auf einmal) — Marketing hebt nur das Ziel, nicht die Rate.
  const spawnRate = (dropActive() ? 1.6 : 0.9) + Math.min(0.8, marketingSpawnBonus());
  if (alive < want && Math.random() < dt * spawnRate) spawnGuest();
  if (alive > want + 3) { const g = guests.find(g => !g.celeb && g.act !== 'leave'); if (g) pushActivity(g, 'leave'); }

  // Gäste auseinanderdrücken, damit sie sich nicht stapeln (z. B. Schlange an der Shot-Bar)
  separateGuests(dt);
  updateSecurity(dt);
  updateTaxis(dt);
  updateGoldBottle(dt);
  // selten kippt spät nachts ein betrunkener Gast um und liegt kurz am Boden (K.O.)
  if (nightDrunk() > 0.45 && Math.random() < dt * 0.03) {
    const cand = guests.filter(g => !g.celeb && !g.ko && !g.leaving && !g.trouble && g.mode === 'act');
    if (cand.length && guests.filter(g => g.ko).length < 3) {
      const g = pick(cand); g.ko = true; g.koT = rnd(6, 12); g.drink = null; g.mode = 'act';
    }
  }

  const hasCeleb = guests.some(g => g.celeb);
  if (state.celeb && !hasCeleb) spawnGuest(true);
  if (!state.celeb && hasCeleb) guests = guests.filter(g => !g.celeb);

  const speedMult = (dropActive() ? 1.5 : 1) * (1 + nightDrunk() * 0.15);
  for (let i = guests.length - 1; i >= 0; i--) {
    const g = guests[i];
    if (g.fadeIn) { g.alpha = Math.min(1, (g.alpha || 0) + dt * 1.6); if (g.alpha >= 1) g.fadeIn = false; }
    if (g.ko) {   // liegt betrunken am Boden, bis er sich erholt
      g.koT -= dt;
      if (g.koT <= 0) { g.ko = false; g.mode = 'act'; pushActivity(g, chooseAct(g)); }
      continue;
    }
    if (g.mode === 'walk') {
      g.walkT = (g.walkT || 0) + dt;
      const t = g.path[0];
      if (!t) { g.mode = 'act'; g.actT = actDuration(g.act); continue; }
      const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
      const step = g.speed * speedMult * dt;
      g.face = dx - dy;   // Blickrichtung für Animation
      if (d < step || g.walkT > 9) {   // Ankunft ODER Not-Ankunft (kein ewiges Kreisen/Verhaken)
        g.x = t.x; g.y = t.y; g.path.shift(); g.walkT = 0;
        if (g.path.length === 0) {
          if (g.afterPath) { g.act = g.afterPath; g.afterPath = null; }
          if (g.act === 'leave') { g.leaving = true; }   // am Eingang ausblenden statt teleportieren
          else {
            g.mode = 'act'; g.actT = actDuration(g.act);
            if (g.act === 'bar') g.drink = currentDrink().e;   // aktueller Signature-Drink
            else if (g.act === 'shots') g.drink = '🥃';
            else if (g.act === 'champ' || g.act === 'sofa' || g.act === 'roofbar') g.drink = pick(DRINKS_T2);
          }
        }
      } else {
        g.x += dx / d * step; g.y += dy / d * step;
        if (d > 1.2) avoidObstacles(g);   // nur unterwegs ausweichen, nicht auf den letzten Metern
      }
    } else {
      g.actT -= dt;
      if (!g.fadeIn && !g.leaving) g.alpha = (g.act === 'wc' && g.actT < actDuration('wc') - 0.5) ? 0.2 : 1;
      if (g.actT <= 0) {
        const stId = stationForAct(g.act);
        if (stId) depositAtStation(stId);
        g.drink = null;
        if (g.celeb) pushActivity(g, 'dance');
        else pushActivity(g, chooseAct(g));
      }
    }
    if (g.leaving) { g.alpha -= dt * 1.8; if (g.alpha <= 0) { guests.splice(i, 1); continue; } }
  }
}

// ============================================================
//  Iso-Zeichenhelfer
// ============================================================
function quad(p, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

// Iso-Quader mit 3 Sichtflächen (Deckel, Front = +y, rechts = +x)
function isoBox(x, y, w, d, h, top, front, side, stroke) {
  const A0 = iso(x, y, h), B0 = iso(x + w, y, h), C0 = iso(x + w, y + d, h), D0 = iso(x, y + d, h);
  const Cf = iso(x + w, y + d, 0), Df = iso(x, y + d, 0), Bf = iso(x + w, y, 0);
  quad([D0, C0, Cf, Df], front, stroke, 1);          // Frontfläche (+y)
  quad([B0, C0, Cf, Bf], side, stroke, 1);           // rechte Fläche (+x)
  quad([A0, B0, C0, D0], top, stroke, 1);            // Deckel
}

// gefüllter Boden eines Rechtecks (z=0)
function floorRect(x, y, w, d, fill, stroke) {
  quad([iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)], fill, stroke, 1);
}

function screenShadow(sx, sy, rx, ry) {
  ctx.fillStyle = 'rgba(10,6,26,0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------------- Figuren (Billboard, detailliert) ----------------
function drawPerson(wx, wy, o = {}) {
  const p = iso(wx, wy, 0);
  drawPersonAt(p.x, p.y - (o.lift || 0), (o.s || 1) * cam.s, o);
}
function drawPersonAt(px, py, s, o = {}) {
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  screenShadow(px, py, 7 * s, 3.2 * s);
  const bob = o.bob || 0;
  const cy = py - 13 * s + bob;      // Körperzentrum
  if (o.glow) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 16; }

  // Beine
  ctx.strokeStyle = o.pants || '#2b2b3a';
  ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
  const legSpread = o.dancing ? Math.sin((o.arms || 0)) * 2 * s : 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(px - 1.6 * s, py - 6 * s + bob); ctx.lineTo(px - legSpread, py - 0.5 * s);
  ctx.moveTo(px + 1.6 * s, py - 6 * s + bob); ctx.lineTo(px + legSpread, py - 0.5 * s);
  ctx.stroke();

  // Arme (tanzend hoch)
  ctx.strokeStyle = o.skin || '#ffd9b3';
  ctx.lineWidth = 2.2 * s;
  if (o.arms != null) {
    const a = Math.sin(o.arms) * 5 * s;
    ctx.beginPath();
    ctx.moveTo(px - 3 * s, cy + 1 * s); ctx.lineTo(px - 6.5 * s, cy - 6 * s - a);
    ctx.moveTo(px + 3 * s, cy + 1 * s); ctx.lineTo(px + 6.5 * s, cy - 6 * s + a);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(px - 3 * s, cy); ctx.lineTo(px - 4.5 * s, cy + 6 * s);
    ctx.moveTo(px + 3 * s, cy); ctx.lineTo(px + 4.5 * s, cy + 6 * s);
    ctx.stroke();
  }

  // Oberkörper (Kleid/Shirt) — Showgirl-Tänzerin, Frau oder Standard
  if (o.showgirl) {
    // kurvige Silhouette (Taille rein, Hüfte raus) in Haut, mit glänzendem Bühnen-Outfit
    ctx.fillStyle = o.skin || '#f0b98c';
    ctx.beginPath();
    ctx.moveTo(px - 3.0 * s, cy - 3.2 * s);
    ctx.quadraticCurveTo(px - 4.7 * s, cy + 1 * s, px - 3.2 * s, cy + 3.6 * s);
    ctx.quadraticCurveTo(px - 4.8 * s, cy + 6 * s, px - 4.0 * s, cy + 8 * s);
    ctx.lineTo(px + 4.0 * s, cy + 8 * s);
    ctx.quadraticCurveTo(px + 4.8 * s, cy + 6 * s, px + 3.2 * s, cy + 3.6 * s);
    ctx.quadraticCurveTo(px + 4.7 * s, cy + 1 * s, px + 3.0 * s, cy - 3.2 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(px - 1.7 * s, cy - 2.0 * s, 1.9 * s, 0, 7); ctx.arc(px + 1.7 * s, cy - 2.0 * s, 1.9 * s, 0, 7); ctx.fill();   // Büste
    ctx.fillStyle = o.color || '#ff2e8a';                                    // Bikini-Oberteil
    ctx.beginPath(); ctx.ellipse(px - 1.7 * s, cy - 1.9 * s, 2.0 * s, 1.5 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + 1.7 * s, cy - 1.9 * s, 2.0 * s, 1.5 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - 3.3 * s, cy + 5 * s); ctx.lineTo(px + 3.3 * s, cy + 5 * s); ctx.lineTo(px + 2.5 * s, cy + 8 * s); ctx.lineTo(px - 2.5 * s, cy + 8 * s); ctx.closePath(); ctx.fill();   // Höschen
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(px - 1.9 * s, cy - 2.3 * s, 0.7 * s, 0, 7); ctx.fill();   // Glanz
  } else if (o.female) {
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.moveTo(px - 3.4 * s, cy - 3 * s);
    ctx.lineTo(px + 3.4 * s, cy - 3 * s);
    ctx.lineTo(px + 4.2 * s, cy + 7 * s);
    ctx.lineTo(px - 4.2 * s, cy + 7 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; roundRectP(px - 3 * s, cy - 3 * s, 2 * s, 8 * s, 1 * s); ctx.fill();
  } else {
    ctx.fillStyle = o.color;
    roundRectP(px - 3.6 * s, cy - 4 * s, 7.2 * s, 11 * s, 3 * s); ctx.fill();
    if (o.apron) { ctx.fillStyle = o.apron; roundRectP(px - 2.9 * s, cy - 0.5 * s, 5.8 * s, 7.6 * s, 1.4 * s); ctx.fill();   // Barkeeper-Schürze
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px - 0.4 * s, cy - 0.5 * s, 0.8 * s, 7 * s); }
    if (o.bowtie) { ctx.fillStyle = '#c0392b';                                 // Fliege
      ctx.beginPath(); ctx.moveTo(px - 2 * s, cy - 3.6 * s); ctx.lineTo(px - 0.2 * s, cy - 2.8 * s); ctx.lineTo(px - 2 * s, cy - 2 * s); ctx.closePath();
      ctx.moveTo(px + 2 * s, cy - 3.6 * s); ctx.lineTo(px + 0.2 * s, cy - 2.8 * s); ctx.lineTo(px + 2 * s, cy - 2 * s); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; roundRectP(px - 3 * s, cy - 3 * s, 2 * s, 8 * s, 1 * s); ctx.fill();
  }

  // Kopf
  ctx.fillStyle = o.skin || '#ffd9b3';
  ctx.beginPath(); ctx.arc(px, cy - 8 * s, 3.9 * s, 0, Math.PI * 2); ctx.fill();
  // Haare
  ctx.fillStyle = o.hair || '#2b1c10';
  ctx.beginPath();
  if (o.female) {
    ctx.arc(px, cy - 8.6 * s, 4.2 * s, Math.PI * 0.85, Math.PI * 2.15); // längere Haare
    ctx.lineTo(px + 3.5 * s, cy - 4 * s); ctx.lineTo(px - 3.5 * s, cy - 4 * s);
  } else {
    ctx.arc(px, cy - 9 * s, 3.6 * s, Math.PI, 2 * Math.PI);
  }
  ctx.fill();

  // Gesicht (animiert: Blinzeln + Mund im Takt)
  if (!o.shades) {
    const hy = cy - 7.5 * s, now = performance.now() / 1000;
    const blink = Math.sin(now * 1.7 + (o.bobPhase || 0) * 5) > 0.94;
    ctx.fillStyle = '#241a22';
    if (blink) {
      ctx.fillRect(px - 2.1 * s, hy - 0.25 * s, 1.3 * s, 0.5 * s);
      ctx.fillRect(px + 0.8 * s, hy - 0.25 * s, 1.3 * s, 0.5 * s);
    } else {
      ctx.beginPath(); ctx.arc(px - 1.45 * s, hy, 0.82 * s, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 1.45 * s, hy, 0.82 * s, 0, 7); ctx.fill();
    }
    const my = cy - 5.3 * s;
    if (o.dancing) {
      const mo = 0.35 + 0.55 * Math.abs(Math.sin(o.arms != null ? o.arms : now * 6));
      ctx.beginPath(); ctx.ellipse(px, my, 1.05 * s, mo * 1.3 * s, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = '#241a22'; ctx.lineWidth = 0.7 * s;
      ctx.beginPath(); ctx.arc(px, my - 0.6 * s, 1.35 * s, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
    }
    // betrunken → rote Wangen
    if (o.drunk > 0.35) {
      ctx.fillStyle = `rgba(255,90,90,${Math.min(0.55, o.drunk * 0.6)})`;
      ctx.beginPath(); ctx.arc(px - 2.6 * s, hy + 1.4 * s, 1.1 * s, 0, 7); ctx.arc(px + 2.6 * s, hy + 1.4 * s, 1.1 * s, 0, 7); ctx.fill();
    }
  }

  // Accessoires
  if (o.headphones) {
    ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1.8 * s;
    ctx.beginPath(); ctx.arc(px, cy - 8 * s, 5 * s, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath(); ctx.arc(px - 4.4 * s, cy - 7.6 * s, 1.7 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 4.4 * s, cy - 7.6 * s, 1.7 * s, 0, 7); ctx.fill();
  }
  if (o.shades) { ctx.fillStyle = '#111'; roundRectP(px - 3.4 * s, cy - 9 * s, 6.8 * s, 2 * s, 1); ctx.fill(); }
  if (o.earpiece) {
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2 * s; ctx.beginPath();
    ctx.moveTo(px + 4.2 * s, cy - 8.4 * s); ctx.lineTo(px + 5 * s, cy - 3.5 * s); ctx.stroke();
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(px + 4.3 * s, cy - 8.1 * s, 1 * s, 0, 7); ctx.fill();
  }
  ctx.restore();

  if (o.drink) {
    const tilt = Math.sin(performance.now() / 400 + (o.bobPhase || 0)) * 2;
    ctx.font = `${11 * s}px sans-serif`; ctx.textAlign = 'center';
    ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
    ctx.fillText(o.drink, px + 6.5 * s, cy - 2 * s - tilt);
    ctx.globalAlpha = 1;
  }
  if (o.star) { ctx.font = `${14 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⭐', px, cy - 15 * s + bob); }
  if (o.emote) {
    ctx.font = `${12 * s}px sans-serif`; ctx.textAlign = 'center';
    ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
    ctx.fillText(o.emote, px, cy - 15 * s + bob);
    ctx.globalAlpha = 1;
  }
}

function roundRectP(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ============================================================
//  Szene
// ============================================================
function drawGround() {
  // Nachthimmel-Verlauf als Hintergrund
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1e56'); g.addColorStop(0.5, '#1c1436'); g.addColorStop(1, '#120c22');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Mond
  ctx.fillStyle = 'rgba(255,246,214,0.9)';
  ctx.beginPath(); ctx.arc(W * 0.82, H * 0.1, 16, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 40; i++) { const sx = (i * 97) % W, sy = (i * 53) % (H * 0.4);
    ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(i)); ctx.fillRect(sx, sy, 1.4, 1.4); }
  ctx.globalAlpha = 1;
  // City-Skyline hinter dem Club (füllt den oberen Bereich)
  const skyTop = iso((RM.klo.x + RM.t2.x) / 2, RM.klo.y - 0.6, WALL_H);
  const base = Math.max(H * 0.30, skyTop.y + 10);
  const bw = W / 11;
  for (let i = 0; i < 12; i++) {
    const bh = 45 + ((i * 47) % 90);
    ctx.fillStyle = i % 2 ? '#191340' : '#221a4e';
    ctx.fillRect(i * bw - 4, base - bh, bw - 3, bh);
    ctx.fillStyle = 'rgba(255,214,120,0.55)';
    for (let wy = base - bh + 6; wy < base - 6; wy += 9)
      for (let wx = i * bw + 2; wx < i * bw + bw - 7; wx += 8)
        if ((wx * 7 + wy) % 3 === 0) ctx.fillRect(wx, wy, 2.5, 3.5);
  }
  // Dunst-Verlauf über der Skyline für Tiefe
  const haze = ctx.createLinearGradient(0, base - 40, 0, base + 20);
  haze.addColorStop(0, 'rgba(28,20,54,0)'); haze.addColorStop(1, 'rgba(28,20,54,0.9)');
  ctx.fillStyle = haze; ctx.fillRect(0, base - 40, W, 62);

  // Straße unten
  ctx.fillStyle = '#20233a'; ctx.fillRect(0, H * 0.9, W, H * 0.1);
  ctx.strokeStyle = 'rgba(255,220,120,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.moveTo(0, H * 0.95); ctx.lineTo(W, H * 0.95); ctx.stroke(); ctx.setLineDash([]);

  // Boden-Plattform unter dem ganzen Club (leichter Überstand)
  const pad = 0.6;
  const p = [
    iso(RM.klo.x - pad, RM.klo.y - pad), iso(RM.t2.x + RM.t2.w + pad, RM.t2.y - pad),
    iso(RM.roof.x + RM.roof.w + pad, RM.roof.y + RM.roof.d + pad), iso(RM.t1.x - pad, RM.t1.y + RM.t1.d + pad),
  ];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  quad(p, '#2a2350'); ctx.restore();
  quad(p, null, 'rgba(255,255,255,0.06)', 1.5);
}

// Vorplatz: roter Teppich, Kordeln, Neon-Schild, Warteschlange läuft hier
function drawPlaza(t) {
  // roter Teppich vom Eingang nach vorne
  const cw = 1.6;
  quad([iso(ENTRY_IN.x - cw, ENTRY_IN.y), iso(ENTRY_IN.x + cw, ENTRY_IN.y),
        iso(ENTRY_OUT.x + cw + 0.4, ENTRY_OUT.y + 1.4), iso(ENTRY_OUT.x - cw - 0.4, ENTRY_OUT.y + 1.4)], '#b3243a');
  quad([iso(ENTRY_IN.x - cw, ENTRY_IN.y), iso(ENTRY_IN.x + cw, ENTRY_IN.y),
        iso(ENTRY_OUT.x + cw + 0.4, ENTRY_OUT.y + 1.4), iso(ENTRY_OUT.x - cw - 0.4, ENTRY_OUT.y + 1.4)], null, 'rgba(255,210,140,0.4)', 1.5);
  // Kordel-Pfosten
  for (const side of [-1, 1]) for (const yy of [15.2, 16.6]) {
    const p = iso(ENTRY_OUT.x + side * (cw + 0.6), yy, 0);
    ctx.fillStyle = '#8a6f4d'; ctx.fillRect(p.x - 1, p.y - 8 * cam.s, 2, 8 * cam.s);
    ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(p.x, p.y - 8 * cam.s, 2.4 * cam.s, 0, 7); ctx.fill();
  }
  // Vordach + Neon-Schild über dem Eingang
  const sgn = iso(ENTRY_IN.x, ENTRY_IN.y + 0.2, WALL_H + 0.3);
  ctx.font = `800 ${Math.max(11, 12 * cam.s + 3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `hsl(${(t * 40) % 360}, 90%, 65%)`;
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
  ctx.fillText('✈ AIRPORT', sgn.x, sgn.y);
  ctx.shadowBlur = 0;
}

// Rückwände (Cutaway): nur hintere zwei Wände je Raum
function drawWalls(r, colBack, colLeft, cap) {
  const h = WALL_H;
  // Rückwand (y = r.y)
  quad([iso(r.x, r.y, 0), iso(r.x + r.w, r.y, 0), iso(r.x + r.w, r.y, h), iso(r.x, r.y, h)], colBack);
  // linke Wand (x = r.x)
  quad([iso(r.x, r.y, 0), iso(r.x, r.y + r.d, 0), iso(r.x, r.y + r.d, h), iso(r.x, r.y, h)], colLeft);
  // Wandkronen
  if (cap) {
    quad([iso(r.x, r.y, h), iso(r.x + r.w, r.y, h), iso(r.x + r.w + 0.12, r.y - 0.12, h), iso(r.x - 0.12, r.y - 0.12, h)], cap);
    quad([iso(r.x, r.y, h), iso(r.x, r.y + r.d, h), iso(r.x - 0.12, r.y + r.d + 0.12, h), iso(r.x - 0.12, r.y - 0.12, h)], cap);
  }
}

// Neon-Tanzboden mit pulsierenden Diamant-Kacheln
function drawDanceFloor(x, y, w, d, t, beat, palette) {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const pulse = 0.5 + 0.5 * Math.sin(beat + i + j);
      let col;
      if (palette === 'vip') col = `hsla(${42 + ((i + j) % 3) * 8}, 88%, ${30 + pulse * 22}%, 1)`;
      else if (palette === 'roof') col = `hsla(${(t * 30 + (i + j) * 24) % 360}, 70%, ${26 + pulse * 16}%, 1)`;
      else col = `hsla(${((i + j) * 42 + t * 80) % 360}, 85%, ${dropActive() ? 50 + pulse * 18 : 34 + pulse * 14}%, 1)`;
      floorRect(x + i, y + j, 1, 1, col, 'rgba(255,255,255,0.06)');
    }
  }
}

// ---------------- Möbel & Personal je Raum ----------------
function drawT1(t, beat, drawables) {
  const r = RM.t1;
  drawWalls(r, '#3a2f63', '#2f2652', '#5a4a8a');
  floorRect(r.x, r.y, r.w, r.d, '#2c2450');
  drawDanceFloor(2.5, 9.5, 5, 4, t, beat, 'main');
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5;
  quad([iso(2.5, 9.5), iso(7.5, 9.5), iso(7.5, 13.5), iso(2.5, 13.5)], null, 'rgba(255,255,255,0.18)', 1.5);
  drawTV(0.05, 8.4, WALL_H - 0.35, 'left');   // TV an linker Wand
  drawTV(6.2, 0 + r.y, WALL_H - 0.35, 'back'); // TV an Rückwand

  // DJ-Pult + Boxen (Deko, gehört zum Boden-Layer)
  const d = A.dj;
  isoBox(d.x - 1.6, d.y - 0.5, 3.2, 1.1, 0.55, '#4a3a7d', '#33285c', '#281f49', '#6a58a0');
  isoBox(d.x - 1.2, d.y - 0.35, 2.4, 0.8, 0.85, '#5a4a9a', '#3d3070', '#2f2557');
  for (const bx of [d.x - 2.4, d.x + 1.9]) {
    isoBox(bx, d.y - 0.4, 0.8, 1.0, 1.4, '#141024', '#0d0a1c', '#080615');
    const s = iso(bx + 0.4, d.y + 0.1, 0.7);
    ctx.fillStyle = `rgba(170,130,255,${0.4 + 0.45 * Math.abs(Math.sin(beat))})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, (5 + Math.abs(Math.sin(beat)) * 2) * cam.s, 0, 7); ctx.fill();
  }
  drawables.push({ d: d.x + d.y - 1, fn: () => drawPerson(d.x, d.y - 0.2, {
    s: 1.2, color: '#3b2f7a', skin: '#f0b98c', hair: '#1a1a22', bob: Math.sin(beat) * 1.6 * cam.s, headphones: true, arms: beat }) });

  // Bar (Theke + Regal + Barkeeper)
  const b = A.bar;
  isoBox(b.x - 0.55, b.y - 2.4, 0.5, 4.8, 1.7, '#4a3320', '#33220f', '#281a0b'); // Regal an Wand
  isoBox(b.x - 0.1, b.y - 2.2, 1.1, 4.4, 1.0, '#7a5330', '#4a3320', '#3a2818', '#33220f'); // Theke
  drawables.push({ d: b.x + b.y, fn: () => drawPerson(b.x + 0.2, b.y - 1.6, {
    s: 1.0, color: '#f5f0e6', skin: '#f0b98c', hair: '#5a3617', bob: Math.sin(t * 2.5) * 1.1 * cam.s }) });

  // Shot-Bar
  const sh = A.shots;
  isoBox(sh.x - 0.6, sh.y - 1.1, 1.2, 2.2, 0.95, '#6a2f80', '#4a2058', '#3a1846', '#7d3a95');
  drawLabel(sh.x, sh.y - 1.4, 'SHOTS', `hsla(${(t * 80) % 360},80%,68%,1)`);

  // Garderobe
  const gd = A.garderobe;
  isoBox(gd.x - 1.3, gd.y - 0.5, 2.6, 1.0, 1.0, '#8a5c9e', '#6b4080', '#552f68');
  drawLabel(gd.x, gd.y - 0.9, '🧥', '#e9d5ff', 9);

  // Türsteher am Eingang (außen)
  drawables.push({ d: ENTRY_IN.x + ENTRY_IN.y + 1, fn: () => drawPerson(ENTRY_IN.x + 1.7, ENTRY_IN.y + 1.2, {
    s: 1.25, color: '#22222e', skin: '#c68a53', hair: '#1a1a22', shades: true }) });

  drawRoomLabel(r, 'TERMINAL 1', '#c9b6ff');
}

function drawKlo(t) {
  const r = RM.klo;
  drawWalls(r, '#3b4a58', '#2f3c48', '#5a6b7e');
  floorRect(r.x, r.y, r.w, r.d, '#46586a');
  // Fliesen-Raster
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let i = 1; i < r.w; i++) quad([iso(r.x + i, r.y), iso(r.x + i, r.y + r.d)], null, 'rgba(255,255,255,0.08)');
  for (let j = 1; j < r.d; j++) quad([iso(r.x, r.y + j), iso(r.x + r.w, r.y + j)], null, 'rgba(255,255,255,0.08)');
  // Kabinen
  for (let k = 0; k < 2; k++) isoBox(r.x + 0.4 + k * 1.5, r.y + 0.4, 1.2, 1.1, 1.3, '#7a8fa5', '#5a6b7e', '#46545f', '#8fa4b8');
  drawLabel(r.x + r.w / 2, r.y - 0.3, '🚻 WC', '#dfeaf5', 8);
}

function drawT2(t, beat, drawables) {
  const r = RM.t2;
  const locked = !state.t2Unlocked;
  drawWalls(r, '#4a2450', '#3d1f42', locked ? '#3a2a3a' : '#c9a227');
  floorRect(r.x, r.y, r.w, r.d, locked ? '#241631' : '#3a1f42');
  if (locked) return;   // Lock-Overlay beschriftet den Raum

  drawDanceFloor(12.5, 2.5, 4, 3, t, beat, 'vip');
  drawTV(RM.t2.x + 3.5, r.y, WALL_H - 0.35, 'back');

  // Champagner-Bar
  const c = A.vipbar;
  isoBox(c.x - 1.3, c.y - 0.5, 2.6, 1.0, 1.0, '#8a6a3a', '#5e4423', '#453218', '#b28a4a');
  drawLabel(c.x, c.y - 0.9, '🍾', '#ffe9a8', 9);

  // Sofas (tables + chill)
  for (const a of [A.tables, A.chill]) {
    isoBox(a.x - 1.2, a.y - 0.5, 2.4, 1.0, 0.35, '#c24e72', '#943353', '#7a2846');
    isoBox(a.x - 1.2, a.y - 0.5, 2.4, 0.3, 0.8, '#a63a5c', '#7a2440', '#611d33'); // Lehne
  }
  // Bottle-Tische mit Wunderkerzen
  for (const [tx, ty] of [[13.2, 5.5], [15.5, 3.2]]) {
    isoBox(tx - 0.35, ty - 0.35, 0.7, 0.7, 0.7, '#3a2044', '#2a1633', '#1f1026');
    if (Math.random() < 0.25) spawnWorldParticle(tx, ty, 1.1, '✨', 8, 0.6);
  }
  drawRoomLabel(r, 'TERMINAL 2', '#8fd0ff');
}

function drawRoof(t, beat, drawables) {
  const r = RM.roof;
  const locked = !state.roofUnlocked;
  floorRect(r.x, r.y, r.w, r.d, locked ? '#1b2033' : '#1b2138');
  // Brüstung (niedrige Rückwände)
  const bh = 0.5;
  quad([iso(r.x, r.y, 0), iso(r.x + r.w, r.y, 0), iso(r.x + r.w, r.y, bh), iso(r.x, r.y, bh)], '#2b3350');
  quad([iso(r.x, r.y, 0), iso(r.x, r.y + r.d, 0), iso(r.x, r.y + r.d, bh), iso(r.x, r.y, bh)], '#232a44');
  if (locked) return;   // Lock-Overlay beschriftet den Raum

  drawDanceFloor(12, 11, 4, 3, t, beat, 'roof');
  // funkelnde Sterne auf dem Floor
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 14; i++) {
    const s = iso(r.x + ((i * 2.7) % r.w), r.y + ((i * 1.9) % r.d), 0.02);
    ctx.globalAlpha = 0.3 + (0.5 + 0.5 * Math.sin(t * 2 + i)) * 0.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.1 * cam.s, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Skybar
  const sb = A.skybar;
  isoBox(sb.x - 1.3, sb.y - 0.5, 2.6, 1.0, 1.0, '#2f6f8a', '#204a5e', '#183846', '#3f93b0');
  drawLabel(sb.x, sb.y - 0.9, '🍸', '#a8ecff', 9);
  // Pool
  const pl = A.pool;
  floorRect(pl.x - 1.4, pl.y - 1.0, 2.8, 2.0, '#2f7fd6');
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  quad([iso(pl.x - 1.4, pl.y - 1.0), iso(pl.x + 1.4, pl.y - 1.0), iso(pl.x + 1.4, pl.y + 1.0), iso(pl.x - 1.4, pl.y + 1.0)], null, 'rgba(255,255,255,0.3)');

  drawRoomLabel(r, 'ROOFTOP · VIP', '#ffd970');
}

// Performer (Tänzerin) auf kleiner Bühne im zugewiesenen Raum
function drawPerformer(t, beat, drawables) {
  if (!state.performer.unlocked) return;
  const room = state.performer.room;
  const centers = { t1: { x: 6.2, y: 8.6 }, t2: { x: 15.5, y: 5.5 }, roof: { x: 13.5, y: 15.2 } };
  const c = centers[room] || centers.t1;
  if (!roomUnlocked(room)) return;
  // Bühne
  isoBox(c.x - 0.8, c.y - 0.8, 1.6, 1.6, 0.3, '#ff5e8a', '#c73d68', '#a32e52');
  // Spotlight
  const sp = iso(c.x, c.y, 0);
  const grd = ctx.createRadialGradient(sp.x, sp.y - 20 * cam.s, 2, sp.x, sp.y - 20 * cam.s, 40 * cam.s);
  grd.addColorStop(0, 'rgba(255,180,220,0.35)'); grd.addColorStop(1, 'rgba(255,180,220,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sp.x, sp.y - 14 * cam.s, 34 * cam.s, 0, 7); ctx.fill();
  drawables.push({ d: c.x + c.y + 0.3, fn: () => drawPerson(c.x, c.y, {
    s: 1.15, color: '#ff4fa3', skin: '#f0b98c', hair: '#1a1a22', female: true, showgirl: true,
    bob: Math.sin(beat * 1.5) * 3 * cam.s, arms: beat * 1.5, dancing: true, lift: 5 * cam.s }) });
}

// ---------------- TV-Screens & Ticker ----------------
let tickerX = 0;
function drawTV(wx, wy, wz, facing) {
  // Bildschirm als Billboard an der Wand-Position
  const p = iso(wx, wy, wz);
  const w = 46 * cam.s, h = 26 * cam.s;
  const x = p.x - w / 2, y = p.y - h;
  ctx.fillStyle = '#0a0a14'; roundRectP(x - 2, y - 2, w + 4, h + 4, 3); ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#123'); g.addColorStop(1, '#1a2b4a');
  ctx.fillStyle = g; roundRectP(x, y, w, h, 2); ctx.fill();
  ctx.save();
  roundRectP(x, y, w, h, 2); ctx.clip();
  // Inhalt: Hype-Balken + €/s
  ctx.fillStyle = dropActive() ? '#4fd7f7' : '#ff9f43';
  ctx.fillRect(x + 3, y + 3, (w - 6) * (dropActive() ? 1 : Math.min(1, state.hype / 100)), 4 * cam.s);
  ctx.fillStyle = '#9dedaa'; ctx.font = `800 ${8 * cam.s}px system-ui`; ctx.textAlign = 'center';
  ctx.fillText(fmt(incomeCache) + ' €/s', x + w / 2, y + h * 0.55);
  // Ticker
  const ev = eventDef();
  const msg = ev ? `★ ${ev.name.toUpperCase()} — ${ev.txt} ★   ` : `AIRPORT CLUB · HYPE ${Math.floor(state.hype)}% · LVL ${state.level} · `;
  ctx.fillStyle = ev ? '#ffd93c' : '#c9b6ff'; ctx.font = `700 ${7 * cam.s}px system-ui`; ctx.textAlign = 'left';
  const tw = ctx.measureText(msg).width;
  let tx = x + (tickerX % tw);
  while (tx > x) tx -= tw;
  for (; tx < x + w; tx += tw) ctx.fillText(msg, tx, y + h - 4 * cam.s);
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,160,255,0.4)'; ctx.lineWidth = 1; roundRectP(x, y, w, h, 2); ctx.stroke();
}

function drawLabel(wx, wy, txt, color, size = 8) {
  const p = iso(wx, wy, 1.2);
  ctx.font = `800 ${Math.max(7, size * cam.s + 2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(txt, p.x, p.y + 0.5);
  ctx.fillStyle = color; ctx.fillText(txt, p.x, p.y);
}

function drawRoomLabel(r, txt, color) {
  const p = iso(r.x + r.w / 2, r.y + 0.25, WALL_H + 0.15);
  ctx.font = `800 ${Math.max(8, 9 * cam.s + 3)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(txt, p.x + 1, p.y + 1);
  ctx.fillStyle = color; ctx.fillText(txt, p.x, p.y);
}

// ---------------- Lock-Overlays ----------------
function drawLockOverlay(r, title, hint) {
  quad(roomFloorQuad(r), 'rgba(10,6,22,0.6)');
  const c = iso(r.x + r.w / 2, r.y + r.d / 2, 0.5);
  ctx.textAlign = 'center';
  ctx.font = `${Math.min(30, 22 * cam.s + 8)}px sans-serif`;
  ctx.fillText('🔒', c.x, c.y - 6 * cam.s);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(10, 10 * cam.s + 2)}px system-ui`;
  ctx.fillText(title, c.x, c.y + 12 * cam.s);
  ctx.fillStyle = '#ffd93c'; ctx.font = `700 ${Math.max(8, 8 * cam.s + 1)}px system-ui`;
  ctx.fillText(hint, c.x, c.y + 26 * cam.s);
}

// ---------------- Fokus-Vignette (Raum-Detail) ----------------
function drawFocusVignette(id, amt) {
  const r = RM[id];
  if (!r) return;
  // Bildschirm-Umfang des Raums bestimmen
  const cs = [iso(r.x, r.y, 0), iso(r.x + r.w, r.y, 0), iso(r.x + r.w, r.y + r.d, 0), iso(r.x, r.y + r.d, 0),
              iso(r.x + r.w / 2, r.y + r.d / 2, WALL_H)];
  let cx = 0, cy = 0;
  for (const c of cs) { cx += c.x; cy += c.y; }
  cx /= cs.length; cy /= cs.length;
  let rad = 0;
  for (const c of cs) rad = Math.max(rad, Math.hypot(c.x - cx, c.y - cy));
  rad *= 1.35;
  ctx.save();
  ctx.fillStyle = `rgba(8,5,20,${0.7 * amt})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(cx, cy - rad * 0.1, rad * 0.5, cx, cy - rad * 0.1, rad);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy - rad * 0.1, rad, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------------- Geld-Pins ----------------
function drawCashPins(t) {
  let idx = 0;
  for (const [stId, anchorId] of Object.entries(PIN_AT)) {
    idx++;
    const amount = state.stationCash[stId] || 0;
    if (amount < 1) continue;
    const a = A[anchorId];
    const p = iso(a.x, a.y, 1.15);
    const bounce = Math.sin(t * 3 + idx) * 2.5;
    const px = p.x, py = p.y - bounce;
    const label = fmt(amount);
    ctx.font = `800 ${Math.max(9, 10 * cam.s + 1)}px system-ui, sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 26, bh = 18;
    ctx.fillStyle = '#2ea84a';
    ctx.beginPath(); ctx.moveTo(px, py + bh / 2 + 7); ctx.lineTo(px - 5, py + bh / 2 - 1); ctx.lineTo(px + 5, py + bh / 2 - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#38c95c'; roundRectP(px - bw / 2, py - bh / 2, bw, bh, bh / 2); ctx.fill();
    ctx.strokeStyle = '#1d7a33'; ctx.lineWidth = 2; roundRectP(px - bw / 2, py - bh / 2, bw, bh, bh / 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `${11}px sans-serif`;
    ctx.fillText('💶', px - bw / 2 + 5, py + 4);
    ctx.font = `800 ${Math.max(9, 10 * cam.s + 1)}px system-ui, sans-serif`;
    ctx.fillText(label, px - bw / 2 + 20, py + 3.5);
    ctx.textAlign = 'center';
  }
}

// ---------------- Partikel ----------------
function spawnScreenParticle(sx, sy, txt, size, life, color) { particles.push({ screen: true, x: sx, y: sy, vy: -40, life, txt, size, color }); }
function spawnWorldParticle(wx, wy, wz, txt, size, life) { const p = iso(wx, wy, wz); particles.push({ screen: true, x: p.x, y: p.y, vy: -35, life, txt, size }); }
export function spawnMoneyParticle() {}

function updateParticles(dt) {
  if (dropActive() && Math.random() < dt * 10) spawnScreenParticle(rnd(0, W), -10, pick(['🎉','✨','💜','🎊']), 12 + Math.random() * 8, 2.2, null), particles[particles.length-1].vy = rnd(40, 90);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============================================================
//  Top-Down-Detailansicht eines Raums (v2-Look, überarbeitet)
//  Bildschirmfüllende Draufsicht, gespeist aus derselben Sim.
// ============================================================
function dPad() { return { x: W * 0.06, top: H * 0.085, bot: H * 0.17 }; }   // unten mehr Platz für die Straße vorm Eingang
// Einzel-Raum-Ansicht: genau EIN Raum wird bildschirmfüllend gezeigt (kein Pan, kein Grundriss).
let detailCam = { x: 4.5, y: 11 };   // Weltmittelpunkt des gezeigten Raums
let detailScale = 40;                // px pro Welt-Einheit (pro Raum eingepasst)
let detailBiasY = 0;                 // vertikale Verschiebung (T1: Raum hoch, Straßen-Band unten frei)
let framedRoom = 't1';               // aktuell gezeigter Raum
let roomFade = 0;                    // kurzer Überblend-Effekt beim Raumwechsel
const ROOM_ORDER = ['t1', 't2', 'roof'];   // WC ist als Anbau Teil von Terminal 1, kein eigener Raum
const CLUB_BB = { x0: -1.2, y0: -1.2, x1: 20.2, y1: 19.6 };   // (nur noch für Iso-Kamerarechnung)
// unten reserviertes Straßen-Band für Terminal 1 (Gebäude sitzt weiter hinten, Straße klar davor)
function t1StreetBand() { return Math.min(150, H * 0.19); }
// passt einen Raum formatfüllend in die Detailfläche ein; T1 lässt unten ein Straßen-Band frei,
// Roof lässt oben/unten etwas Himmel & Dachkante frei
function roomFrame(id) {
  const r = RM[id], p = dPad();
  const band = id === 't1' ? t1StreetBand() : 0;   // Höhe des Straßen-Bands (Pixel), bleibt unten frei
  const aw = W - 2 * p.x, ah = H - p.top - p.bot - band;
  const wallPad = 1.15;                       // Platz für die Rückwand-Höhe (Welt-Einheiten)
  const sideMargin = id === 'roof' ? 1.15 : 0.3;   // T1 wieder volle Breite (nicht eng), Roof: Dachkante sichtbar
  let x0 = r.x - sideMargin, y0 = r.y - (id === 'roof' ? 0.95 : wallPad), x1 = r.x + r.w + sideMargin, y1 = r.y + r.d + (id === 'roof' ? 1.35 : 0.2);
  if (id === 't1') { x0 = Math.min(x0, WC_ANNEX.x - 0.5); y0 = Math.min(y0, WC_ANNEX.y - 0.6); }   // WC-Anbau links mit einrahmen
  const s = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s, biasY: -band / 2 };   // biasY hebt den Raum an, das Band bleibt unten
}
function frameRoom(id, fade = true) {
  const f = roomFrame(id); detailCam.x = f.x; detailCam.y = f.y; detailScale = f.s; detailBiasY = f.biasY || 0; framedRoom = id;
  if (fade) roomFade = 1;
}
function detailZoom() { return detailScale; }
function detailViewCy() { const p = dPad(); return p.top + (H - p.top - p.bot) / 2; }
function detailProj(wx, wy) {
  return { x: W / 2 + (wx - detailCam.x) * detailScale, y: detailViewCy() + detailBiasY + (wy - detailCam.y) * detailScale };
}
function dTileW() { return detailScale; }
function dPersonScale() { return dTileW() / 34; }
// Optik-Stufe einer Station (0..3) für „krasser werdende" Möbel
function lvlTier(lvl) { return lvl >= 75 ? 3 : lvl >= 40 ? 2 : lvl >= 15 ? 1 : 0; }
// Verwahrlosungs-Grad: 1 = am Anfang alt & runtergekommen, 0 = renoviert (steigt mit Ausbau)
function clubShabby() { return Math.max(0, Math.min(0.85, 1 - totalLevels() / 45)); }

function dRect(wx, wy, ww, wd, fill, stroke, rad = 8) {
  const a = detailProj(wx, wy), b = detailProj(wx + ww, wy + wd);
  ctx.beginPath(); ctx.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, rad);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
// Stationen-Beschriftungen bewusst entfernt (Aufgeräumt) — Namen kommen aus der Karten-Ebene.
function dLabel(wx, wy, txt, color, px = 11) { /* no-op: keine Möbel-Labels mehr im Grundriss */ }
// erhöhte, beleuchtete 3D-Tanzfläche (Kacheln mit Kante + Sockel)
// Dancefloor-Farbton je nach freigeschaltetem Club-Theme
function themeFloorHue(i, j, t) {
  const base = (i + j) * 55 + t * 90, wv = Math.sin(base * 0.017) * 0.5 + 0.5;
  switch (state.clubTheme || 'classic') {
    case 'sunset': return (320 + wv * 90) % 360;   // Pink → Orange
    case 'toxic':  return 90 + wv * 70;            // Neon-Grün
    case 'ice':    return 180 + wv * 70;           // Eisblau
    case 'gold':   return 40 + wv * 18;            // Gold
    default:       return base % 360;              // Classic-Regenbogen
  }
}
function dTiles(wx, wy, ww, wd, cols, rows, palette, t, beat) {
  const a = detailProj(wx, wy), b = detailProj(wx + ww, wy + wd);
  const W0 = b.x - a.x, H0 = b.y - a.y;
  const cw = W0 / cols, ch = H0 / rows;
  const lift = Math.max(6, ch * 0.55);
  // Bodenschatten + Sockel-Seitenwand (Plattform-Höhe)
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(a.x + W0 / 2, b.y + lift * 0.7, W0 * 0.6, H0 * 0.3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#0f0b22';
  ctx.beginPath(); ctx.roundRect(a.x - 3, b.y - 6, W0 + 6, lift, 8); ctx.fill();
  const bev = Math.max(2.5, ch * 0.18);
  // Performance: solide Füllungen statt eines Gradients pro Kachel (spart hunderte Gradient-Objekte/Frame)
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const pulse = 0.5 + 0.5 * Math.sin(beat + i + j);
    let hue, light;
    if (palette === 'vip') { hue = 42 + ((i + j) % 3) * 8; light = 34 + pulse * 22; }
    else if (palette === 'roof') { hue = (t * 30 + (i + j) * 24) % 360; light = 30 + pulse * 18; }
    else { hue = themeFloorHue(i, j, t); light = dropActive() ? 52 + pulse * 16 : 37 + pulse * 13; }
    hue = hue | 0;
    const tx = a.x + i * cw + 1.5, ty = a.y + j * ch + 1.5, tw = cw - 3, th = ch - 3;
    ctx.fillStyle = `hsl(${hue},72%,${Math.max(10, light - 24) | 0}%)`;            // dunkle Kante (Höhe)
    ctx.beginPath(); ctx.roundRect(tx, ty + th - bev, tw, bev + 2.5, 3); ctx.fill();
    ctx.fillStyle = `hsl(${hue},90%,${Math.min(72, light + 6) | 0}%)`;            // Oberseite (solide)
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th - bev * 0.5, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';                                     // Glanz
    ctx.fillRect(tx + 2, ty + 1.5, tw - 4, th * 0.24);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(a.x - 3, a.y - 3, W0 + 6, H0 + 6, 8); ctx.stroke();
}
// weicher Bodenschatten unter einem Möbel-Footprint
function dShadow(wx, wy, ww, wd) {
  const a = detailProj(wx, wy), b = detailProj(wx + ww, wy + wd);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, b.y - 1, (b.x - a.x) * 0.58, (b.y - a.y) * 0.42 + 3, 0, 0, 7); ctx.fill();
}
// extrudierter 3D-Block (Deckel angehoben um z, Frontfläche zeigt Höhe)
function dBox(wx, wy, ww, wd, z, top, front, stroke, rad = 6) {
  const a = detailProj(wx, wy), b = detailProj(wx + ww, wy + wd);
  const x = a.x, y = a.y, w = b.x - a.x, h = b.y - a.y;
  // Frontfläche (unten dunkler für Tiefe)
  const fg = ctx.createLinearGradient(0, y + h - z, 0, y + h + rad);
  fg.addColorStop(0, front); fg.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.roundRect(x, y + h - z, w, z + rad, rad); ctx.fill();
  // Deckfläche
  ctx.fillStyle = top;
  ctx.beginPath(); ctx.roundRect(x, y - z, w, h, rad); ctx.fill();
  // Glanz-Sheen oben
  const sg = ctx.createLinearGradient(0, y - z, 0, y - z + h * 0.7);
  sg.addColorStop(0, 'rgba(255,255,255,0.28)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.roundRect(x, y - z, w, h * 0.7, rad); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y - z, w, h, rad); ctx.stroke(); }
  // helle Oberkante
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + rad, y - z + 1.2); ctx.lineTo(x + w - rad, y - z + 1.2); ctx.stroke();
}
function dPerson(wx, wy, o) {
  const p = detailProj(wx, wy);
  drawPersonAt(p.x, p.y - (o.groundZ || 0), dPersonScale() * (o.s || 1), o);
}

const FLOORCOL = { t1: '#463a72', klo: '#46586a', t2: '#2c2140', roof: '#1c2438' };   // T2 dunkles Lounge-Plum, Roof Holzdeck-Blau
const GRASS = { t1: true, klo: true, t2: true, roof: false };
// Neon-Akzent je Raum (für Wand-Trims, Türrahmen, Bodenkanten)
const ACCENT = { t1: '#8b5cf6', klo: '#5aa6c8', t2: '#ffcf6a', roof: '#5ad0ff' };   // T2 warmes Gold (Upscale-Lounge)
// Durchgänge zwischen direkt anliegenden Räumen: Boden-Schwelle + Türrahmen im Wandspalt
const DOORWAYS = [
  { a: 'klo', b: 't1',  rect: { x: 1.4,  y: 5.85, w: 1.3, d: 1.3  }, dir: 'v' },  // WC ↕ Terminal 1
  { a: 't1',  b: 't2',  rect: { x: 8.85, y: 7.35, w: 1.3, d: 1.4  }, dir: 'h' },  // Terminal 1 ↔ Terminal 2
  { a: 't1',  b: 'roof',rect: { x: 8.85, y: 11.4, w: 1.3, d: 1.6  }, dir: 'h' },  // Terminal 1 ↔ Rooftop
  { a: 't2',  b: 'roof',rect: { x: 12.8, y: 8.85, w: 1.6, d: 1.3  }, dir: 'v' },  // Terminal 2 ↕ Rooftop
];
// Möbel-Hindernisse (Welt-Rechtecke) — Gäste laufen aussen herum statt drüber
const OBSTACLES = [
  { x: 2.9,  y: 7.25, w: 3.2,  d: 1.35, room: 't1', grow: 'dj' },   // DJ-Pult
  { x: 2.55, y: 8.4,  w: 3.8,  d: 0.4,  room: 't1', grow: 'dj' },   // Stahlgeländer vorm Pult
  { x: 2.3,  y: 7.3,  w: 0.6,  d: 1.2,  room: 't1' },   // linke Box
  { x: 6.0,  y: 7.3,  w: 0.6,  d: 1.2,  room: 't1' },   // rechte Box
  { x: 0.25, y: 8.85, w: 1.75, d: 4.2,  room: 't1' },   // Bar
  { x: 7.3,  y: 8.5,  w: 1.55, d: 2.65, room: 't1', grow: 'shots' },   // Shot-Bar (wandert nach aussen)
  { x: 6.9,  y: 13.1, w: 1.8,  d: 1.0,  room: 't1', grow: 'ward' },    // Garderoben-Ständer (wandert nach aussen)
  { x: 6.7,  y: 6.95, w: 1.3,  d: 0.6,  room: 't1' },   // Backstage
  { x: 9.8,  y: 0.85, w: 2.7,  d: 1.1,  room: 't2' },   // Champagner-Bar
  { x: 14.9, y: 5.85, w: 2.5,  d: 1.5,  room: 't2' },   // Sofa-Ecke 1
  { x: 16.0, y: 1.85, w: 2.5,  d: 1.5,  room: 't2' },   // Sofa-Ecke 2
  { x: 9.8,  y: 10.75,w: 2.7,  d: 1.1,  room: 'roof' }, // Skybar
  { x: 13.7, y: 13.8, w: 3.2,  d: 2.4,  room: 'roof' }, // Pool
];

// Straßenrand: Bürgersteig, darunter (vorm Eingang) die Straße mit Zebrastreifen, Laterne & Auto
function drawGrassBg() {
  const streetY = Math.round(H * 0.84);      // Straße beginnt unten, vor dem Ausgang
  const sh = H - streetY;
  // Bürgersteig (heller Beton) mit Plattenfugen — oberhalb der Straße
  ctx.fillStyle = '#9aa0a8'; ctx.fillRect(0, 0, W, streetY);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, streetY); ctx.stroke(); }
  for (let y = 0; y < streetY; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // Bordsteinkante
  ctx.fillStyle = '#c7ccd2'; ctx.fillRect(0, streetY - 4, W, 4);
  // Straße (Asphalt) unten
  ctx.fillStyle = '#2f3237'; ctx.fillRect(0, streetY, W, sh);
  ctx.strokeStyle = 'rgba(240,210,90,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([18, 14]);   // Mittellinie
  ctx.beginPath(); ctx.moveTo(0, streetY + sh * 0.62); ctx.lineTo(W, streetY + sh * 0.62); ctx.stroke(); ctx.setLineDash([]);
  // Zebrastreifen mittig (genau vor dem Eingang / roten Teppich)
  ctx.fillStyle = 'rgba(238,238,238,0.92)';
  for (let i = 0; i < 7; i++) ctx.fillRect(W * 0.30 + i * 15, streetY + 3, 10, sh * 0.5);
}

// Straßen-/Aussen-Deko im VORDERGRUND (nach dem Raum gezeichnet, im SICHTBAREN Band über dem HUD):
// Straßenstreifen, Laterne, Mülleimer/Hydrant an den Rändern + vorbeifahrende Taxen mit Fahrgästen.
function drawStreetFg(t) {
  const pb = H - dPad().bot;                    // untere Kante des sichtbaren Detailbereichs
  const band = t1StreetBand();                  // reserviertes Band unter dem Gebäude
  const bandTop = pb - band;                    // Oberkante Bürgersteig (direkt unter dem Gebäude)
  const roadH = Math.min(52, band * 0.5);
  const roadY = pb - roadH;                     // Asphalt ganz unten
  ctx.save();
  ctx.beginPath(); ctx.rect(0, bandTop, W, band); ctx.clip();  // nur ins Straßen-Band malen
  // Bürgersteig (heller Beton) zwischen Gebäude und Straße
  const sw = ctx.createLinearGradient(0, bandTop, 0, roadY);
  sw.addColorStop(0, '#8f96a0'); sw.addColorStop(1, '#7c828c');
  ctx.fillStyle = sw; ctx.fillRect(0, bandTop, W, roadY - bandTop);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;     // Plattenfugen
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, bandTop); ctx.lineTo(x, roadY); ctx.stroke(); }
  // roter Teppich vom Eingang nach VORN bis zur Straße
  { const cc = detailProj(RM.t1.x + RM.t1.w / 2, RM.t1.y + RM.t1.d).x;   // Gebäude-Mitte (Eingang)
    const w0 = band * 0.34, w1 = band * 0.46;
    ctx.fillStyle = '#b3243a'; ctx.beginPath();
    ctx.moveTo(cc - w0, bandTop); ctx.lineTo(cc + w0, bandTop); ctx.lineTo(cc + w1, roadY); ctx.lineTo(cc - w1, roadY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cc - w0, bandTop, 3, roadY - bandTop); ctx.fillRect(cc + w0 - 3, bandTop, 3, roadY - bandTop); }
  // Asphalt + Bordstein + Mittellinie
  ctx.fillStyle = '#2f3237'; ctx.fillRect(0, roadY, W, roadH);
  ctx.fillStyle = '#c7ccd2'; ctx.fillRect(0, roadY - 4, W, 4);
  ctx.strokeStyle = 'rgba(240,210,90,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(0, roadY + roadH * 0.58); ctx.lineTo(W, roadY + roadH * 0.58); ctx.stroke(); ctx.setLineDash([]);
  // --- Straßenlaterne links (Sockel auf dem Bordstein, ragt hoch, jetzt klar sichtbar) ---
  { const lx = 22; ctx.strokeStyle = '#3c4048'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, roadY - 2); ctx.lineTo(lx, roadY - 72); ctx.lineTo(lx + 24, roadY - 76); ctx.stroke();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.ellipse(lx + 26, roadY - 72, 6, 3.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,226,122,0.13)'; ctx.beginPath(); ctx.moveTo(lx + 26, roadY - 68); ctx.lineTo(lx - 8, pb); ctx.lineTo(lx + 74, pb); ctx.closePath(); ctx.fill(); }
  // --- Mülleimer, Hydrant an den Rändern (draußen-Feeling) ---
  const trash = (x, y, s, col) => {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 9 * s, 3 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x - 8 * s, y - 20 * s, 16 * s, 20 * s, 3 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x - 8 * s, y - 15 * s, 16 * s, 2 * s); ctx.fillRect(x - 8 * s, y - 9 * s, 16 * s, 2 * s);
    ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.roundRect(x - 9 * s, y - 23 * s, 18 * s, 4 * s, 2 * s); ctx.fill(); };
  const hydrant = (x, y, s) => {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 8 * s, 2.6 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#c23a2a'; ctx.beginPath(); ctx.roundRect(x - 5 * s, y - 16 * s, 10 * s, 16 * s, 3 * s); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 16 * s, 5 * s, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#e0554a'; ctx.beginPath(); ctx.arc(x - 6 * s, y - 9 * s, 2.5 * s, 0, 7); ctx.arc(x + 6 * s, y - 9 * s, 2.5 * s, 0, 7); ctx.fill(); };
  const cy0 = roadY - 6;
  trash(42, cy0, 1.0, '#3f6b4a'); trash(60, cy0 + 2, 0.85, '#4a5566');
  hydrant(W - 26, cy0, 1.0); trash(W - 50, cy0 + 2, 0.9, '#5a4a3a');
  // --- Taxen auf der Straße ---
  for (const tx of taxis) drawTaxi(roadY + roadH * 0.52, roadH, tx);
  ctx.restore();
}

function drawTaxi(cy, roadH, tx) {
  const kind = tx.kind || 'taxi';
  const w = kind === 'super' ? 84 : 74, bh = roadH * (kind === 'super' ? 0.4 : 0.5), x = tx.fx * (W + 190) - 95;
  const top = cy - bh / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + w / 2, top + bh + 5, w * 0.55, 5, 0, 0, 7); ctx.fill();
  if (kind === 'super') {
    // flacher, keilförmiger Supercar mit Spoiler + Glanzstreifen
    ctx.fillStyle = tx.color; ctx.beginPath();
    ctx.moveTo(x + 2, top + bh); ctx.lineTo(x + 12, top + bh * 0.2); ctx.lineTo(x + w - 24, top + bh * 0.05);
    ctx.lineTo(x + w - 6, top + bh * 0.5); ctx.lineTo(x + w, top + bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath();   // getönte Kabine
    ctx.moveTo(x + 20, top + bh * 0.22); ctx.lineTo(x + w - 30, top + bh * 0.1); ctx.lineTo(x + w - 26, top + bh * 0.42); ctx.lineTo(x + 24, top + bh * 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 12, top + bh * 0.52, w - 22, 2);   // Glanzlinie
    ctx.fillStyle = tx.color; ctx.fillRect(x + w - 10, top - 2, 10, 4);                            // Heckspoiler
    ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(x + 3, top + bh * 0.6, 2.6, 0, 7); ctx.fill();   // Scheinwerfer vorn (fährt nach links raus? -> vorn links)
    ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(x + w - 2, top + bh * 0.6, 2.2, 0, 7); ctx.fill();
    // Felgen
    ctx.fillStyle = '#0e0e14'; ctx.beginPath(); ctx.arc(x + 20, top + bh, 7.5, 0, 7); ctx.arc(x + w - 20, top + bh, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#c7ccd2'; ctx.beginPath(); ctx.arc(x + 20, top + bh, 3, 0, 7); ctx.arc(x + w - 20, top + bh, 3, 0, 7); ctx.fill();
    if (tx.state === 'stop') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('✨', x + w / 2, top - 4); }
    ctx.restore(); return;
  }
  // Taxi / normales Auto (Fließheck)
  ctx.fillStyle = tx.color; ctx.beginPath(); ctx.roundRect(x, top, w, bh, 6); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.roundRect(x + 12, top - bh * 0.55, w - 30, bh * 0.6, 5); ctx.fill();
  ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.roundRect(x + 16, top - bh * 0.46, w - 38, bh * 0.46, 3); ctx.fill();
  if (kind === 'taxi') {
    ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.roundRect(x + w / 2 - 10, top - bh * 0.82, 20, bh * 0.28, 2); ctx.fill();
    ctx.fillStyle = '#ffd94a'; ctx.font = `700 ${Math.max(7, bh * 0.24)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', x + w / 2, top - bh * 0.68); ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#20232a'; for (let i = 0; i < 8; i++) ctx.fillRect(x + 4 + i * 9, top + bh * 0.44 + (i % 2) * 3, 9, 4);
  }
  ctx.fillStyle = '#0e0e14'; ctx.beginPath(); ctx.arc(x + 18, top + bh, 7, 0, 7); ctx.arc(x + w - 18, top + bh, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a3d45'; ctx.beginPath(); ctx.arc(x + 18, top + bh, 3, 0, 7); ctx.arc(x + w - 18, top + bh, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.arc(x + w - 1, top + bh * 0.4, 3, 0, 7); ctx.fill();
  ctx.restore();
}

// Rooftop-Hintergrund: man steht AUF dem Dach — Nachthimmel, Mond, Skyline in der Tiefe,
// Beton-Dachplatte mit Kante, Geländer, Lüftungsanlagen und Antenne.
function drawRoofBg(t) {
  // --- Nachthimmel ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#070a24'); sky.addColorStop(0.55, '#131a40'); sky.addColorStop(1, '#2b2456');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // Sterne (funkelnd)
  for (let i = 0; i < 64; i++) {
    const sx = ((i * 97) % 100) / 100 * W, sy = ((i * 61) % 100) / 100 * H * 0.7;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.5 + (i % 5) * 0.22) + i));
    ctx.fillStyle = `rgba(255,255,255,${0.2 + tw * 0.5})`;
    const sz = i % 9 === 0 ? 2.2 : 1.4;
    ctx.fillRect(sx, sy, sz, sz);
  }
  // Mond mit Glow
  { const mx2 = W * 0.82, my2 = H * 0.11;
    const mg = ctx.createRadialGradient(mx2, my2, 4, mx2, my2, 60);
    mg.addColorStop(0, 'rgba(240,240,255,0.5)'); mg.addColorStop(1, 'rgba(240,240,255,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx2, my2, 60, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2f2fa'; ctx.beginPath(); ctx.arc(mx2, my2, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#d9d9ea'; ctx.beginPath(); ctx.arc(mx2 - 5, my2 - 3, 3.5, 0, 7); ctx.arc(mx2 + 4, my2 + 5, 2.4, 0, 7); ctx.fill(); }
  // dünne, driftende Wolken
  ctx.fillStyle = 'rgba(200,210,255,0.05)';
  for (let c = 0; c < 3; c++) { const cx2 = ((t * 6 + c * 170) % (W + 240)) - 120, cy2 = H * (0.1 + c * 0.09);
    ctx.beginPath(); ctx.ellipse(cx2, cy2, 90, 12, 0, 0, 7); ctx.ellipse(cx2 + 50, cy2 + 6, 60, 9, 0, 0, 7); ctx.fill(); }
  // --- Skyline in der TIEFE (unter der Dachkante — man ist weit oben) ---
  const pb = H - dPad().bot;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, pb); ctx.clip();
  const hz = ctx.createLinearGradient(0, pb - 130, 0, pb);   // Stadt-Glow am Horizont
  hz.addColorStop(0, 'rgba(255,150,80,0)'); hz.addColorStop(1, 'rgba(255,150,80,0.14)');
  ctx.fillStyle = hz; ctx.fillRect(0, pb - 130, W, 130);
  for (let i = 0; i < 14; i++) {                             // ferne Hochhäuser mit Lichtern
    const bw2 = 26 + (i * 37) % 26, bx = (i / 14) * (W + 30) - 15;
    const bh2 = 42 + ((i * 53) % 70);
    ctx.fillStyle = i % 2 ? '#101530' : '#0c1128';
    ctx.fillRect(bx, pb - bh2, bw2, bh2);
    ctx.fillStyle = 'rgba(255,220,130,0.5)';
    for (let wy2 = pb - bh2 + 5; wy2 < pb - 4; wy2 += 9)
      for (let wx2 = bx + 4; wx2 < bx + bw2 - 4; wx2 += 8)
        if (((wx2 * 7 + wy2 * 13 + i) % 11) < 4) ctx.fillRect(wx2, wy2, 3, 4);
  }
  ctx.restore();
  // --- Beton-Dachplatte rund um den Raum (mit Kante, Fugen, Geländer) ---
  const r = RM.roof;
  const a = detailProj(r.x - 0.85, r.y - 0.6), b = detailProj(r.x + r.w + 0.85, r.y + r.d + 0.85);
  const aw2 = b.x - a.x, ah2 = b.y - a.y;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';                                          // Fallkante (Tiefe unter dem Dach)
  ctx.beginPath(); ctx.roundRect(a.x - 3, a.y + 6, aw2 + 6, ah2 + 6, 14); ctx.fill();
  ctx.fillStyle = '#262c3d'; ctx.beginPath(); ctx.roundRect(a.x - 3, a.y - 3, aw2 + 6, ah2 + 9, 14); ctx.fill();   // Dachrand-Seite
  ctx.fillStyle = '#454d61'; ctx.beginPath(); ctx.roundRect(a.x, a.y, aw2, ah2, 12); ctx.fill();                  // Beton-Platte
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;                    // Plattenfugen
  for (let x = a.x + 42; x < b.x; x += 42) { ctx.beginPath(); ctx.moveTo(x, a.y + 3); ctx.lineTo(x, b.y - 3); ctx.stroke(); }
  for (let y = a.y + 42; y < b.y; y += 42) { ctx.beginPath(); ctx.moveTo(a.x + 3, y); ctx.lineTo(b.x - 3, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;              // helle Dachkante
  ctx.beginPath(); ctx.roundRect(a.x, a.y, aw2, ah2, 12); ctx.stroke();
  // Sicherheits-Geländer entlang der Außenkante
  ctx.strokeStyle = '#89a2b8';
  ctx.lineWidth = 2;
  const railY = a.y - 10;
  for (let x = a.x + 8; x <= b.x - 8; x += 34) { ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x, railY); ctx.stroke(); }
  ctx.strokeStyle = '#b9cede'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(a.x + 4, railY); ctx.lineTo(b.x - 4, railY); ctx.stroke();
  // Lüftungsanlagen (AC-Boxen) unten-links auf der Platte
  const ac = (x, y, s) => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 13 * s, y + 15 * s, 16 * s, 5 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5d6779'; ctx.beginPath(); ctx.roundRect(x, y - 6 * s, 26 * s, 20 * s, 3); ctx.fill();
    ctx.fillStyle = '#49525f'; ctx.beginPath(); ctx.roundRect(x + 3 * s, y - 3 * s, 20 * s, 14 * s, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 4 * s, y + i * 3.4 * s - 1); ctx.lineTo(x + 22 * s, y + i * 3.4 * s - 1); ctx.stroke(); }
    ctx.fillStyle = '#3a4553'; ctx.beginPath(); ctx.arc(x + 13 * s, y + 4 * s, 5.5 * s, 0, 7); ctx.fill();   // Lüfterrad
    ctx.strokeStyle = '#8a97a8'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const an = t * 9 + i * 2.1; ctx.beginPath(); ctx.moveTo(x + 13 * s, y + 4 * s); ctx.lineTo(x + 13 * s + Math.cos(an) * 4.5 * s, y + 4 * s + Math.sin(an) * 4.5 * s); ctx.stroke(); } };
  ac(a.x + 8, b.y - 34, 1.0); ac(a.x + 44, b.y - 26, 0.85);
  // Antenne mit rot blinkendem Licht (oben-rechts)
  { const ax2 = b.x - 26, ay2 = a.y + 12;
    ctx.strokeStyle = '#77808f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax2, ay2); ctx.lineTo(ax2, ay2 - 46); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ax2 - 8, ay2 - 14); ctx.lineTo(ax2 + 8, ay2 - 14); ctx.moveTo(ax2 - 5, ay2 - 27); ctx.lineTo(ax2 + 5, ay2 - 27); ctx.stroke();
    const blink = Math.sin(t * 2.5) > 0.4;
    ctx.fillStyle = blink ? '#ff4a4a' : '#7a2a2a'; ctx.beginPath(); ctx.arc(ax2, ay2 - 48, 3, 0, 7); ctx.fill();
    if (blink) { ctx.fillStyle = 'rgba(255,74,74,0.25)'; ctx.beginPath(); ctx.arc(ax2, ay2 - 48, 8, 0, 7); ctx.fill(); } }
}

// Ein einzelner Raum (Boden + Wände + Möbel) an seiner Weltposition im Grundriss
function drawRoomDetail(id, t, beat) {
  const r = RM[id];
  const u = dTileW();
  const a0 = detailProj(r.x, r.y), c0 = detailProj(r.x + r.w, r.y + r.d);
  const rw = c0.x - a0.x, rh = c0.y - a0.y;
  const ac = ACCENT[id] || '#8b5cf6';
  // Boden
  ctx.fillStyle = FLOORCOL[id] || '#463a72';
  ctx.beginPath(); ctx.roundRect(a0.x, a0.y, rw, rh, 6); ctx.fill();
  // Rückwand: je Raum ein eigener Look — T1 Club-Paneele, T2 Industrial, Roof Glas-Brüstung
  const wallH = id === 'roof' ? u * 0.4 : u * 1.05;
  if (id === 'roof') {
    // niedrige GLAS-Brüstung: dahinter bleibt der Himmel sichtbar
    ctx.fillStyle = 'rgba(140,200,255,0.13)'; ctx.fillRect(a0.x, a0.y - wallH, rw, wallH);
    ctx.strokeStyle = 'rgba(190,230,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a0.x, a0.y - wallH); ctx.lineTo(a0.x + rw, a0.y - wallH); ctx.stroke();   // Handlauf
    ctx.strokeStyle = 'rgba(190,230,255,0.25)'; ctx.lineWidth = 1;
    for (let x = a0.x + u * 1.1; x < a0.x + rw - 2; x += u * 1.1) { ctx.beginPath(); ctx.moveTo(x, a0.y - wallH + 2); ctx.lineTo(x, a0.y - 2); ctx.stroke(); }
  } else if (id === 't2') {
    // Upscale-Lounge: dunkle Samt-Paneele mit vergoldeten Pilastern & warmem Neon-Trim
    const wg = ctx.createLinearGradient(0, a0.y - wallH, 0, a0.y);
    wg.addColorStop(0, '#2a2036'); wg.addColorStop(1, '#170f22');
    ctx.fillStyle = wg; ctx.fillRect(a0.x, a0.y - wallH, rw, wallH);
    ctx.strokeStyle = 'rgba(255,215,120,0.12)'; ctx.lineWidth = 1;   // Paneel-Fugen (Rautenmuster angedeutet)
    for (let x = a0.x + u * 1.15; x < a0.x + rw - 2; x += u * 1.15) { ctx.beginPath(); ctx.moveTo(x, a0.y - wallH + 3); ctx.lineTo(x, a0.y - 3); ctx.stroke(); }
    ctx.fillStyle = '#c9a24a';                                       // vergoldete Pilaster
    for (let x = a0.x + u * 2.3; x < a0.x + rw - u; x += u * 3.4) {
      ctx.fillRect(x - 2.5, a0.y - wallH, 5, wallH);
      ctx.fillStyle = '#e8c56a'; ctx.fillRect(x - 3.5, a0.y - wallH, 1.6, wallH); ctx.fillStyle = '#c9a24a';
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';            // warmes Gold-Neon oben
    ctx.fillStyle = 'rgba(255,205,110,0.8)'; ctx.fillRect(a0.x, a0.y - wallH + 2, rw, 2.5);
    ctx.restore();
    const tg2 = ctx.createLinearGradient(0, a0.y - 5, 0, a0.y);      // warmes Glimmen an der Unterkante
    tg2.addColorStop(0, 'rgba(255,205,110,0.5)'); tg2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg2; ctx.fillRect(a0.x, a0.y - 5, rw, 5);
  } else {
    const wg = ctx.createLinearGradient(0, a0.y - wallH, 0, a0.y);
    wg.addColorStop(0, '#282034'); wg.addColorStop(1, '#151020');
    ctx.fillStyle = wg; ctx.fillRect(a0.x, a0.y - wallH, rw, wallH);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;   // Paneel-Fugen
    for (let x = a0.x + u * 0.95; x < a0.x + rw - 2; x += u * 0.95) { ctx.beginPath(); ctx.moveTo(x, a0.y - wallH + 3); ctx.lineTo(x, a0.y - 3); ctx.stroke(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';           // Neon-Trim oben
    ctx.fillStyle = ac; ctx.globalAlpha = 0.75; ctx.fillRect(a0.x, a0.y - wallH + 1, rw, 2.5);
    ctx.restore();
    const tg = ctx.createLinearGradient(0, a0.y - 5, 0, a0.y);      // Neon-Glimmen an der Unterkante
    tg.addColorStop(0, ac); tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg; ctx.globalAlpha = 0.7; ctx.fillRect(a0.x, a0.y - 5, rw, 5); ctx.globalAlpha = 1;
  }
  const wsh = ctx.createLinearGradient(0, a0.y, 0, a0.y + u * 0.7);
  wsh.addColorStop(0, id === 'roof' ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.35)'); wsh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wsh; ctx.fillRect(a0.x, a0.y, rw, u * 0.7);
  // dünne Sockelleisten an den übrigen Kanten (rahmt den Raum)
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(a0.x, c0.y - 3, rw, 3); ctx.fillRect(a0.x, a0.y, 3, rh); ctx.fillRect(c0.x - 3, a0.y, 3, rh);
  if (!roomUnlocked(id)) {
    ctx.fillStyle = 'rgba(8,5,20,0.62)'; ctx.beginPath(); ctx.roundRect(a0.x, a0.y, rw, rh, 6); ctx.fill();
    const cc = detailProj(r.x + r.w / 2, r.y + r.d / 2); ctx.textAlign = 'center';
    ctx.font = `${Math.min(30, u * 0.7)}px sans-serif`; ctx.fillText('🔒', cc.x, cc.y - u * 0.2);
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(10, u * 0.26)}px system-ui, sans-serif`; ctx.fillText(r.name, cc.x, cc.y + u * 0.55);
    ctx.fillStyle = '#ffd93c'; ctx.font = `700 ${Math.max(8, u * 0.2)}px system-ui, sans-serif`;
    ctx.fillText(id === 'roof' && !state.t2Unlocked ? 'Erst Terminal 2' : 'Antippen zum Freischalten', cc.x, cc.y + u * 1.05);
    return;
  }
  // Runtergekommener Boden/Wände am Anfang (schwindet mit Ausbau) — unter die Möbel gelegt
  drawShabby(id, a0, rw, rh, u);

  if (id === 't1') {
    const cs = state.clubSize || 0;
    const grow = t1Grow();
    const fl = t1DanceFloor();          // wächst mit dem Gebäude
    // === Club-Name als grosses Neon-Schild oben an der Rückwand (mittig über dem Floor, klar sichtbar) ===
    { const wallTop = a0.y - u * 1.05, sgx = detailProj(fl.x + fl.w / 2, r.y).x, sy = wallTop + u * 0.3;
      const hue = (t * 40) % 360, sc = `hsl(${hue},92%,66%)`;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.max(12, u * 0.42)}px system-ui, sans-serif`;
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = sc; ctx.shadowBlur = 14;
      ctx.fillStyle = sc; ctx.fillText('✈ AIRPORT', sgx, sy);
      ctx.restore(); ctx.textBaseline = 'alphabetic'; }
    dTiles(fl.x, fl.y, fl.w, fl.d, Math.min(9, 6 + Math.round(grow.dw)), Math.min(9, 6 + Math.round(grow.dd)), 'main', t, beat);
    dLabel(fl.x + fl.w / 2, fl.y - 0.35, 'DANCEFLOOR', 'rgba(255,255,255,0.5)', 10);
    const djx = grow.dw * 0.5;   // DJ-Bereich bleibt oben MITTIG, wenn das Gebäude wächst
    // DJ-Lichtkegel (additiv)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const djp = detailProj(4.45 + djx, 8.4), fb = detailProj(fl.x + fl.w / 2, fl.y + fl.d);
    for (let i = 0; i < 3; i++) { const ang = Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.5;
      ctx.fillStyle = `hsla(${(t * 60 + i * 120) % 360},90%,65%,${dropActive() ? 0.14 : 0.07})`;
      ctx.beginPath(); ctx.moveTo(djp.x, djp.y - u * 0.5);
      ctx.lineTo(djp.x + Math.sin(ang) * W * 0.24 - W * 0.12, fb.y);
      ctx.lineTo(djp.x + Math.sin(ang) * W * 0.24 + W * 0.12, fb.y);
      ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.translate(dTileW() * djx, 0);   // ==== DJ-Gruppe (Pult, Screen, Backstage, Geländer) mittig ====
    // Backstage (oben-rechts, neben DJ)
    { dShadow(6.75, 7.0, 1.2, 0.5);
      dBox(6.75, 7.0, 1.2, 0.5, u * 1.15, '#2a1e50', '#160e30', '#3d2c70');
      const p = detailProj(7.35, 7.05); ctx.fillStyle = '#120b28';
      ctx.beginPath(); ctx.roundRect(p.x - u * 0.3, p.y - u * 1.02, u * 0.6, u * 0.95, 3); ctx.fill();
      ctx.fillStyle = 'rgba(139,92,246,0.5)'; ctx.beginPath(); ctx.roundRect(p.x - u * 0.3, p.y - u * 1.02, u * 0.18, u * 0.95, 3); ctx.fill();
      dLabel(7.35, 6.74, 'BACKSTAGE', '#c9b6ff', 8); }
    // Boxen + DJ-Pult + DJ
    for (const bx of [2.35, 6.05]) { dShadow(bx, 7.35, 0.55, 1.15);
      dBox(bx, 7.35, 0.55, 1.15, u, '#241a40', '#0d0a1c', '#3a2a5e');
      const p = detailProj(bx + 0.27, 7.9); ctx.fillStyle = `rgba(170,130,255,${0.4 + 0.45 * Math.abs(Math.sin(beat))})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - u, u * (0.15 + Math.abs(Math.sin(beat)) * 0.08), 0, 7); ctx.fill(); }
    dShadow(2.95, 7.3, 3.05, 1.2);
    dBox(2.95, 7.3, 3.05, 1.2, u * 0.5, '#37295e', '#241a40', '#5a4a8a');
    dBox(3.35, 7.45, 2.25, 0.65, u * 0.72, '#5a4a9a', '#2f2557');
    for (const dx of [3.95, 5.0]) { const p = detailProj(dx, 7.78); ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y - u * 0.72, u * 0.18, t * 4, t * 4 + Math.PI * 1.4); ctx.stroke(); }
    dPerson(4.45, 8.1, { s: 1.15, color: '#3b2f7a', skin: '#f0b98c', hair: '#1a1a22', headphones: true, arms: beat, bob: Math.sin(beat) * 2, groundZ: u * 0.5 });
    // Stahlgeländer vor dem DJ-Pult — damit die Gäste nicht ans Pult drängen
    { const ry = 8.62, l = detailProj(2.55, ry), rr = detailProj(6.35, ry), railY = l.y - u * 0.42;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(l.x, l.y + 1, rr.x - l.x, 3);
      ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let p = 0; p <= 6; p++) { const x = l.x + (rr.x - l.x) * p / 6; ctx.beginPath(); ctx.moveTo(x, l.y); ctx.lineTo(x, railY); ctx.stroke(); }
      ctx.strokeStyle = '#d3d8df'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(l.x, railY); ctx.lineTo(rr.x, railY); ctx.stroke();
      ctx.strokeStyle = '#7f858e'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(l.x, railY + u * 0.2); ctx.lineTo(rr.x, railY + u * 0.2); ctx.stroke(); }
    const djT = lvlTier(state.stations.dj || 0);
    // === DJ-Werbe-Screen an der Wand hinterm Pult: animiertes Logo & Name des aktiven DJs ===
    { const dj = activeDjDef();
      const sx = detailProj(3.2, 7.1), ex = detailProj(5.7, 7.1), sw = ex.x - sx.x, sHt = u * 1.05;
      const topY = sx.y - u * 1.3 - sHt;
      ctx.fillStyle = '#05060c'; ctx.beginPath(); ctx.roundRect(sx.x - 4, topY - 4, sw + 8, sHt + 8, 7); ctx.fill();   // Gehäuse
      const g = ctx.createLinearGradient(sx.x, topY, ex.x, topY + sHt);
      g.addColorStop(0, `hsl(${(t * 45) % 360},85%,42%)`); g.addColorStop(1, `hsl(${(t * 45 + 140) % 360},85%,38%)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(sx.x, topY, sw, sHt, 4); ctx.fill();
      // Animation NUR im oberen Zwei-Drittel (Logo-Zone), damit der Name klar bleibt
      const nameH = sHt * 0.36, logoBot = topY + sHt - nameH;
      ctx.save(); ctx.beginPath(); ctx.rect(sx.x, topY, sw, logoBot - topY); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const rr = (t * 45 + i * 26) % 60;                     // pulsierende Ringe
        ctx.strokeStyle = `rgba(255,255,255,${0.24 * (1 - rr / 60)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx.x + sw / 2, topY + (logoBot - topY) * 0.5, rr, 0, 7); ctx.stroke(); }
      if (djT >= 1) { const bars = 11; for (let i = 0; i < bars; i++) {                     // Equalizer
        const bh = (0.1 + 0.42 * Math.abs(Math.sin(beat + i * 0.6))) * (logoBot - topY);
        ctx.fillStyle = `hsla(${(t * 80 + i * 30) % 360},95%,65%,0.8)`;
        ctx.fillRect(sx.x + 3 + i * (sw - 6) / bars, logoBot - bh, (sw - 6) / bars - 2, bh); } }
      ctx.restore();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${(logoBot - topY) * 0.5}px sans-serif`;                                  // Icon in der Logo-Zone
      ctx.fillText(dj.icon, sx.x + sw / 2, topY + (logoBot - topY) * 0.45);
      // === cleane, SOLIDE Namensleiste unten (keine Animation dahinter → gut lesbar) ===
      ctx.fillStyle = '#0a0b12'; ctx.fillRect(sx.x, logoBot, sw, nameH);
      ctx.fillStyle = ACCENT.t1; ctx.fillRect(sx.x, logoBot, sw, 1.5);                       // dünne Akzentlinie oben
      const nm = dj.name.toUpperCase();
      let fs = Math.max(9, nameH * 0.62); ctx.font = `800 ${fs}px system-ui, sans-serif`;
      while (ctx.measureText(nm).width > sw - 10 && fs > 6) { fs -= 0.5; ctx.font = `800 ${fs}px system-ui, sans-serif`; }
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(nm, sx.x + sw / 2, logoBot + nameH * 0.56);
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = 'rgba(190,150,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(sx.x - 4, topY - 4, sw + 8, sHt + 8, 7); ctx.stroke();
    }
    if (false) {   // (alte Equalizer-Wand ersetzt durch den DJ-Screen oben)
      const sx = detailProj(3.35, 7.12), ex = detailProj(5.65, 7.12), sw = ex.x - sx.x, sh = u * 0.72;
      const topY = sx.y - u * 1.15 - sh;
      ctx.fillStyle = '#080814'; ctx.beginPath(); ctx.roundRect(sx.x, topY, sw, sh, 4); ctx.fill();
      const bars = 9;
      for (let i = 0; i < bars; i++) { const bh = (0.25 + 0.7 * Math.abs(Math.sin(beat + i * 0.6))) * (sh - 4);
        ctx.fillStyle = `hsl(${(t * 80 + i * 32) % 360},92%,60%)`;
        ctx.fillRect(sx.x + 3 + i * (sw - 6) / bars, topY + sh - 2 - bh, (sw - 6) / bars - 2, bh); }
      ctx.strokeStyle = 'rgba(150,200,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(sx.x, topY, sw, sh, 4); ctx.stroke();
    }
    if (djT >= 2) {   // Laserstrahlen über den Floor
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const o = detailProj(4.5, 8.05), floorB = detailProj(4.5, fl.y + fl.d);
      for (let i = 0; i < 5; i++) { const ang = Math.sin(t * 2.2 + i * 1.5) * 0.7;
        ctx.strokeStyle = `hsla(${(t * 130 + i * 72) % 360},95%,62%,0.55)`; ctx.lineWidth = djT >= 3 ? 2 : 1.4;
        ctx.beginPath(); ctx.moveTo(o.x, o.y - u * 0.9); ctx.lineTo(o.x + Math.sin(ang) * W * 0.32, floorB.y); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();   // ==== Ende DJ-Gruppe ====
    // Digitale Wanduhr (Nachtzeit) — oben rechts an der Wand
    { const cp = detailProj(r.x + r.w - 1.5, 6.78), cw = u * 1.5, ch = u * 0.5;
      ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.roundRect(cp.x - cw / 2, cp.y - ch / 2, cw, ch, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#4fe0ff'; ctx.font = `900 ${Math.max(11, u * 0.32)}px "Courier New", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#4fe0ff'; ctx.shadowBlur = 6; ctx.fillText(clockLabel(), cp.x, cp.y); ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic'; }
    // === Bar: Rückregal, Barkeeper HINTER der Theke, Bar-Werkzeug, nur freigeschaltete Drinks ===
    dShadow(0.3, 8.85, 1.9, 4.35);
    dBox(0.3, 8.9, 0.62, 4.15, u * 1.28, '#3a2817', '#20130a', '#503a22');   // Rückregal an der Wand
    const barT = lvlTier(state.stations.bar || 0);
    { const a = detailProj(0.36, 9.05), c = detailProj(0.9, 12.9);           // Backlight
      const sg = ctx.createLinearGradient(a.x, a.y - u * 1.2, a.x, c.y); const al = 0.24 + barT * 0.13;
      sg.addColorStop(0, `rgba(90,190,255,${al})`); sg.addColorStop(1, `rgba(255,120,200,${al * 0.7})`);
      ctx.fillStyle = sg; ctx.fillRect(a.x, a.y - u * 1.2, c.x - a.x, c.y - (a.y - u * 1.2));
      if (barT >= 2) { ctx.strokeStyle = 'rgba(130,220,255,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(a.x, a.y - u * 1.2, c.x - a.x, c.y - (a.y - u * 1.2)); } }
    // NUR die bereits freigeschalteten Getränke stehen im Regal (anfangs nur Bier)
    { const nT = drinkTier(state.stations.bar || 0); ctx.font = `${u * 0.32}px sans-serif`; ctx.textAlign = 'center';
      for (let k = 0; k <= nT; k++) { const col = k % 2, rowk = Math.floor(k / 2);
        const p = detailProj(0.44 + col * 0.3, 9.5 + rowk * 0.85); ctx.fillText(DRINKS[k].e, p.x, p.y - u * (1.15 - col * 0.02)); } }
    // Barkeeper HINTER der Theke (links neben der Theke, steht dahinter)
    dPerson(0.66, 10.6, { s: 1.14, color: '#f4f6fa', pants: '#20242e', skin: '#f0b98c', hair: '#33241a', apron: '#1c2740', bowtie: true, bob: Math.sin(t * 2.4) * 1.6, groundZ: u * 0.3 });
    // Theke davor
    dBox(0.95, 9.1, 1.05, 3.85, u * 0.6, '#7a5330', '#42300f', '#8f6338');
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2; { const a = detailProj(0.95, 9.1), c = detailProj(2.0, 9.1); ctx.beginPath(); ctx.moveTo(a.x, a.y - u * 0.6); ctx.lineTo(c.x, c.y - u * 0.6); ctx.stroke(); }   // Messingkante
    // Bar-Werkzeug auf der Theke: Zapfhähne, Shaker, Kasse, Servietten
    { // Zapfhähne
      ctx.strokeStyle = '#cfd4db'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const p = detailProj(1.15, 9.5 + i * 0.42); ctx.beginPath(); ctx.moveTo(p.x, p.y - u * 0.6); ctx.lineTo(p.x, p.y - u * 0.6 - 8); ctx.stroke();
        ctx.fillStyle = ['#e0b64a','#8a8f98','#c0392b'][i]; ctx.beginPath(); ctx.arc(p.x, p.y - u * 0.6 - 9, 2.2, 0, 7); ctx.fill(); }
      // Shaker (Edelstahl)
      { const p = detailProj(1.65, 10.0); const g = ctx.createLinearGradient(p.x - 4, 0, p.x + 4, 0); g.addColorStop(0, '#8f96a0'); g.addColorStop(0.5, '#e6ebf0'); g.addColorStop(1, '#8f96a0');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(p.x - 3.5, p.y - u * 0.6 - 13, 7, 13, 2); ctx.fill(); ctx.fillStyle = '#b7bec8'; ctx.beginPath(); ctx.roundRect(p.x - 4, p.y - u * 0.6 - 15, 8, 3, 1); ctx.fill(); }
      // Kasse (Registrierkasse)
      { const p = detailProj(1.6, 11.4); ctx.fillStyle = '#2b2f38'; ctx.beginPath(); ctx.roundRect(p.x - 6, p.y - u * 0.6 - 10, 13, 10, 2); ctx.fill();
        ctx.fillStyle = '#4fe0c0'; ctx.fillRect(p.x - 4, p.y - u * 0.6 - 8, 9, 4); ctx.fillStyle = '#1a1d22'; ctx.fillRect(p.x - 5, p.y - u * 0.6 - 2, 11, 3); }
      // Servietten + Zitronen-Schale
      { const p = detailProj(1.35, 12.3); ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.roundRect(p.x - 4, p.y - u * 0.6 - 5, 8, 5, 1); ctx.fill();
        const q = detailProj(1.75, 12.3); ctx.fillStyle = '#caa24a'; ctx.beginPath(); ctx.arc(q.x, q.y - u * 0.6 - 2, 4, 0, 7); ctx.fill(); ctx.font = `${u * 0.24}px sans-serif`; ctx.fillText('🍋', q.x, q.y - u * 0.6 - 1); } }
    ctx.save(); ctx.translate(dTileW() * grow.dw, 0);   // Shot-Bar wandert mit der rechten Wand nach aussen
    // === Shot-Bar (rechts): Regal + Theke + Gläserreihen + Barkeeper ===
    dShadow(7.35, 8.55, 1.5, 2.65);
    dBox(7.35, 8.55, 1.45, 0.45, u * 1.1, '#4a2058', '#2a1233', '#5d2a70');
    ctx.font = `${u * 0.3}px sans-serif`;
    for (let i = 0; i < 4; i++) { const p = detailProj(7.55 + i * 0.35, 8.77); ctx.fillText(['🍾','🥃','🍶','🍾'][i], p.x, p.y - u * 1.1); }
    dBox(7.35, 9.05, 1.45, 2.05, u * 0.55, '#6a2f80', '#41224d', '#7d3a95');
    ctx.font = `${u * 0.26}px sans-serif`;
    for (let ri = 0; ri < 3; ri++) for (let ci = 0; ci < 3; ci++) { const p = detailProj(7.6 + ci * 0.34, 9.4 + ri * 0.45); ctx.fillText('🥃', p.x, p.y - u * 0.55); }
    dPerson(8.1, 8.95, { s: 1.0, color: '#efe6f5', pants: '#241233', skin: '#c68a53', hair: '#1a1a22', bob: Math.sin(t * 3) * 1.6, groundZ: u * 0.55 });
    dLabel(8.05, 8.28, 'SHOTS', `hsl(${(t * 80) % 360},80%,68%)`, 10);
    ctx.restore();
    ctx.save(); ctx.translate(dTileW() * grow.dw, dTileW() * grow.dd);   // Garderobe in die Ecke unten-rechts
    // === Garderobe: zwei Rollständer (Garderobenwagen) mit Klamotten + Garderobiere ===
    const rack = (rx, ry, rw) => {
      dShadow(rx, ry, rw, 0.28);
      const l = detailProj(rx, ry), rt = detailProj(rx + rw, ry), railY = l.y - u * 0.92;
      ctx.lineWidth = 2.5;
      for (const px of [l.x + 2.5, rt.x - 2.5]) {
        ctx.strokeStyle = '#9aa0ad'; ctx.beginPath(); ctx.moveTo(px, railY); ctx.lineTo(px, l.y); ctx.stroke();
        ctx.fillStyle = '#2b2b34'; ctx.beginPath(); ctx.arc(px - 2, l.y, 2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(px + 2, l.y, 2, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = '#c3c7d0'; ctx.beginPath(); ctx.moveTo(l.x, railY); ctx.lineTo(rt.x, railY); ctx.stroke();
      const clothes = ['🧥','👗','🧥','👚','🧥','👕'];
      ctx.font = `${u * 0.4}px sans-serif`; ctx.textAlign = 'center';
      const n = Math.max(3, Math.round(rw / 0.42));
      for (let i = 0; i < n; i++) { const x = l.x + (rt.x - l.x) * (i + 0.5) / n; ctx.fillText(clothes[i % clothes.length], x, railY + u * 0.42); }
    };
    rack(6.95, 13.2, 1.6);
    rack(7.1, 13.66, 1.35);
    dPerson(7.0, 13.45, { s: 0.95, color: '#c98fe0', skin: '#f0b98c', hair: '#3a2350', bob: Math.sin(t * 2) * 1.4 });
    dLabel(7.85, 12.78, 'GARDEROBE', '#e9d5ff', 9);
    ctx.restore();
    ctx.save(); ctx.translate(dTileW() * grow.dw * 0.5, dTileW() * grow.dd);   // Eingang bleibt unten-mittig
    // Eingang: roter Teppich + AIRPORT + Türsteher (wächst mit Einlass-Stufe)
    const c1 = detailProj(3.6, 13.9), c2 = detailProj(5.4, 15.3), sp = (c2.x - c1.x) * 0.18;
    ctx.fillStyle = '#b3243a'; ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c1.y); ctx.lineTo(c2.x + sp, c2.y); ctx.lineTo(c1.x - sp, c2.y); ctx.closePath(); ctx.fill();
    const einLvl = state.stations.einlass || 0, einT = lvlTier(einLvl);
    const bs = 1.2 + Math.min(0.6, einLvl * 0.013);   // breiter/größer je Stufe
    const bounce = (bx, suit) => dPerson(bx, 14.25, { s: bs, color: suit, pants: '#14141c', skin: '#8c5a33', hair: '#1a1a22', shades: true, earpiece: true });
    bounce(einT >= 1 ? 3.75 : 4.5, einT >= 3 ? '#1a1a26' : '#22222e');
    if (einT >= 1) bounce(5.25, einT >= 3 ? '#1a1a26' : '#2a2a38');   // zweiter Türsteher
    // === Eingangs-Deko: füllt den Vorplatz (Leuchtschild, Kordeln, Pflanzen) ===
    { const sp = detailProj(2.0, 14.55), bw2 = u * 2.0, bh2 = u * 0.6;   // Neon-Leuchtschild
      ctx.fillStyle = '#100b1e'; ctx.beginPath(); ctx.roundRect(sp.x - bw2 / 2, sp.y - bh2 / 2, bw2, bh2, 6); ctx.fill();
      const sc = `hsl(${(t * 40) % 360},90%,62%)`;
      ctx.strokeStyle = sc; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(sp.x - bw2 / 2, sp.y - bh2 / 2, bw2, bh2, 6); ctx.stroke();
      ctx.fillStyle = '#ffe9a8'; ctx.font = `800 ${Math.max(9, u * 0.25)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('✦ EINGANG ✦', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }
    const stanch = (wx, wy) => { const p = detailProj(wx, wy);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2.2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - u * 0.5); ctx.stroke();
      ctx.fillStyle = '#e8c56a'; ctx.beginPath(); ctx.arc(p.x, p.y - u * 0.52, 3.2, 0, 7); ctx.fill(); return p; };
    const rope = (p1, p2) => { ctx.strokeStyle = '#8a1f33'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y - u * 0.5); ctx.quadraticCurveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - u * 0.5 + 6, p2.x, p2.y - u * 0.5); ctx.stroke(); };
    { const l1 = stanch(3.15, 14.0), l2 = stanch(3.15, 14.95), r1 = stanch(5.85, 14.0), r2 = stanch(5.85, 14.95); rope(l1, l2); rope(r1, r2); }
    const plant = (wx, wy) => { dShadow(wx - 0.28, wy - 0.12, 0.56, 0.28); const p = detailProj(wx, wy);
      ctx.fillStyle = '#5a3d24'; ctx.beginPath(); ctx.roundRect(p.x - 7, p.y - 9, 14, 11, 3); ctx.fill();
      ctx.fillStyle = '#2f8f4a'; for (const [ox, oy, rr] of [[-6, -15, 6], [6, -15, 6], [0, -20, 7], [-2, -13, 5], [3, -13, 5]]) { ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, rr, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#3fb060'; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 19, 4, 0, 7); ctx.fill(); };
    plant(1.0, 13.9); plant(8.3, 14.7);
    ctx.restore();
    // === Gang nach rechts Richtung Terminal 2 (unter der Shot-Bar, führt aus dem Bild) + Türsteher ===
    { const gx = r.x + r.w, gy0 = 11.7, gy1 = 13.2, gyc = (gy0 + gy1) / 2;
      const o0 = detailProj(gx, gy0), o1 = detailProj(gx, gy1), cEnd = detailProj(gx + 2.6, gyc);
      const cg = ctx.createLinearGradient(o0.x, 0, cEnd.x, 0);
      cg.addColorStop(0, '#2b2542'); cg.addColorStop(1, 'rgba(43,37,66,0)');   // Gang verläuft aus dem Bild
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(o0.x, o0.y); ctx.lineTo(cEnd.x, o0.y - u * 0.4); ctx.lineTo(cEnd.x, o1.y + u * 0.4); ctx.lineTo(o1.x, o1.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4c4570'; ctx.fillRect(o0.x - 2, o0.y - u * 0.9, 5, u * 0.9); ctx.fillRect(o1.x - 2, o1.y - 2, 5, u * 0.6);   // Türrahmen
      const sp = detailProj(gx + 1.0, gy0 - 0.05); const open = state.t2Unlocked;
      ctx.font = `800 ${Math.max(8, u * 0.2)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lab = open ? 'TERMINAL 2 →' : '🔒 TERMINAL 2'; const lw = ctx.measureText(lab).width;
      ctx.fillStyle = 'rgba(10,8,20,0.8)'; ctx.beginPath(); ctx.roundRect(sp.x - lw / 2 - 6, sp.y - u * 0.17, lw + 12, u * 0.34, u * 0.17); ctx.fill();
      ctx.fillStyle = open ? '#ffcf6a' : '#c9b6d6'; ctx.fillText(lab, sp.x, sp.y); ctx.textBaseline = 'alphabetic';
      // Türsteher an der Öffnung
      dPerson(gx - 0.55, gyc, { s: 1.18, color: '#1e1e2a', pants: '#141420', skin: '#8c5a33', hair: '#1a1a22', shades: true, earpiece: true, bob: 0 });
    }
  } else if (id === 'klo') {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < r.w; i++) { const p1 = detailProj(r.x+i, r.y+1.6), p2 = detailProj(r.x+i, r.y+r.d); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
    for (let j = 2; j < r.d; j++) { const p1 = detailProj(r.x, r.y+j), p2 = detailProj(r.x+r.w, r.y+j); ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }
    for (let k = 0; k < 3; k++) { const bx = r.x + 0.55 + k * 1.1;   // kleinere Kabinen
      dShadow(bx, r.y + 0.85, 0.7, 0.95);
      dBox(bx, r.y + 0.85, 0.7, 0.95, u * 0.42, '#7a8fa5', '#46545f', '#8fa4b8');
      const p = detailProj(bx + 0.35, r.y + 1.3); ctx.font = `${u * 0.32}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🚽', p.x, p.y - u * 0.42); }
    // Waschbecken-Reihe an der unteren Wand (mehr Detail)
    dShadow(r.x + 0.5, r.y + r.d - 1.1, r.w - 1.0, 0.5);
    dBox(r.x + 0.5, r.y + r.d - 1.1, r.w - 1.0, 0.5, u * 0.35, '#c3ccd6', '#8996a3', '#dde4ec');
    for (let k = 0; k < 3; k++) { const p = detailProj(r.x + 1.0 + k * 1.0, r.y + r.d - 0.85); ctx.font = `${u * 0.26}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🚰', p.x, p.y - u * 0.35); }
    dLabel(r.x+r.w/2, r.y+0.3, '🚻 WC', '#dfeaf5', 13);
  } else if (id === 't2') {
    // === TERMINAL 2 — Upscale-Zweit-Etage. Jede Station ist als eigenes, LEVEL-REAKTIVES Möbel sichtbar. ===
    const sT = (k) => lvlTier(state.stations[k] || 0);            // 0..3 Optik-Stufe je Station
    const sparkler = (px, py, n, seed) => {                       // Wunderkerze (additiv)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < n; s++) { const ang = t * 7 + s * 2.1 + seed;
        ctx.fillStyle = `hsla(${(t * 220 + s * 60) % 360},100%,74%,${0.4 + 0.45 * Math.sin(t * 22 + s + seed)})`;
        ctx.beginPath(); ctx.arc(px + Math.cos(ang) * u * 0.22, py + Math.sin(ang) * u * 0.22, 1.5, 0, 7); ctx.fill(); }
      ctx.restore(); };
    // warmer Teppichboden mit dezenten Fugen
    ctx.strokeStyle = 'rgba(255,215,120,0.04)'; ctx.lineWidth = 1;
    for (let gx = 2; gx < r.w; gx += 2.4) { const q1 = detailProj(r.x + gx, r.y), q2 = detailProj(r.x + gx, r.y + r.d); ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); }

    // --- SECOND FLOOR (Station 'second'): zweite Tanzfläche in der Mitte ---
    const fl = { x: 12.5, y: 3.0, w: 4.4, d: 3.4 };
    dTiles(fl.x, fl.y, fl.w, fl.d, 5, 4, 'main', t, beat);
    dLabel(fl.x + fl.w / 2, fl.y - 0.35, 'SECOND FLOOR', 'rgba(255,255,255,0.55)', 10);
    { const dj2 = detailProj(fl.x + fl.w / 2, fl.y - 0.1), fb = detailProj(fl.x + fl.w / 2, fl.y + fl.d);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';        // Lichtstrahlen (mehr je Stufe)
      const rays = 2 + sT('second');
      for (let i = 0; i < rays; i++) { const ang = Math.sin(t * (0.8 + i * 0.3) + i * 2) * 0.55;
        ctx.fillStyle = `hsla(${(t * 70 + i * 110) % 360},90%,66%,${dropActive() ? 0.14 : 0.07})`;
        ctx.beginPath(); ctx.moveTo(dj2.x, dj2.y - u * 0.3);
        ctx.lineTo(dj2.x + Math.sin(ang) * u * 3 - u * 1.3, fb.y); ctx.lineTo(dj2.x + Math.sin(ang) * u * 3 + u * 1.3, fb.y); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#cfd6e6'; ctx.beginPath(); ctx.arc(dj2.x, dj2.y - u * 1.15, u * 0.16, 0, 7); ctx.fill();   // Disco-Kugel
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(dj2.x - u * 0.05, dj2.y - u * 1.2, u * 0.05, 0, 7); ctx.fill(); }

    // --- CHAMPAGNER-LOUNGE (Station 'champus'): Bar oben-links, Flaschen in Eiskübeln + Wunderkerzen ---
    { const bx = 9.9, by = 1.55, bt = sT('champus');
      dShadow(bx - 0.05, by + 0.15, 2.9, 1.0);
      dBox(bx, by, 2.7, 0.8, u * (0.6 + bt * 0.05), '#3a2a52', '#221436', '#4d3a6e');
      if (roomUnlocked('t2')) dPerson(bx + 1.35, by - 0.35, { s: 1.05, color: '#efe6f5', pants: '#241233', skin: '#f0b98c', hair: '#c98b2d', apron: '#3a2452', bowtie: true, bob: Math.sin(t * 2.4) * 1.5, groundZ: u * 0.3 });
      const buckets = 2 + bt;
      for (let i = 0; i < buckets; i++) { const p = detailProj(bx + 0.4 + i * 0.5, by + 0.2);
        ctx.fillStyle = '#9aa6b8'; ctx.beginPath(); ctx.roundRect(p.x - 5, p.y - u * 0.6 - 8, 10, 9, 2); ctx.fill();
        ctx.font = `${u * 0.28}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🍾', p.x, p.y - u * 0.6 - 4);
        if (bt >= 1) sparkler(p.x, p.y - u * 0.6 - 12, 4, i); }
      dLabel(bx + 1.35, by - 0.7, 'CHAMPAGNER', '#ffd970', 9); }

    // --- VIP-EINLASS (Station 'vipEinlass'): Gold-Kordel + Host unten-links (Andockpunkt von T1) ---
    { const vt = sT('vipEinlass');
      const gold = (wx, wy) => { const p = detailProj(wx, wy);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2.2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#e8c56a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - u * 0.5); ctx.stroke();
        ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(p.x, p.y - u * 0.52, 3.2, 0, 7); ctx.fill(); return p; };
      const c1 = detailProj(10.15, 6.05), c2 = detailProj(11.05, 7.05);   // roter Läufer
      ctx.fillStyle = '#8a1f33'; ctx.fillRect(Math.min(c1.x, c2.x), c1.y, Math.abs(c2.x - c1.x) + 8, c2.y - c1.y);
      const l1 = gold(10.5, 6.0), l2 = gold(10.5, 7.1);
      ctx.strokeStyle = '#b3123a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(l1.x, l1.y - u * 0.5); ctx.quadraticCurveTo(l1.x - 6, (l1.y + l2.y) / 2 - u * 0.5 + 6, l2.x, l2.y - u * 0.5); ctx.stroke();
      if (roomUnlocked('t2')) dPerson(11.0, 6.7, { s: 1.12, color: vt >= 2 ? '#1a1a26' : '#26202e', pants: '#0e0e16', skin: '#8c5a33', hair: '#1a1a22', shades: true, earpiece: true });
      dLabel(10.75, 5.55, 'VIP', '#ffd970', 9); }

    // --- BOTTLE-SERVICE (Station 'tables'): reservierte Tische rechts mit Flaschen & Wunderkerzen ---
    { const bt = sT('tables');
      const spots = [[16.4, 6.6], [17.6, 7.8], [15.3, 8.0]].slice(0, 1 + Math.max(1, bt));
      for (const [tx, ty] of spots) {
        dShadow(tx - 1.0, ty - 0.4, 2.0, 0.9);
        dBox(tx - 1.0, ty - 0.4, 2.0, 0.9, u * 0.3, '#3a2f4e', '#241a38', '#4a3d63');     // Sofa
        dBox(tx - 0.32, ty - 0.12, 0.64, 0.5, u * 0.5, '#2a2036', '#160f22', '#372a47');  // niedriger Tisch
        const p = detailProj(tx, ty - 0.12); ctx.font = `${u * 0.34}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🍾', p.x, p.y - u * 0.55);
        sparkler(p.x, p.y - u * 0.9, 5, tx); }
      dLabel(16.6, 6.1, 'BOTTLE SERVICE', '#e9d5ff', 9); }

    // --- CHILL-OUT-AREA (Station 'chill'): Lounge oben-rechts, Soft-Glow + Laternen ---
    { const ct = sT('chill');
      dShadow(16.9, 2.15, 2.0, 1.05);
      dBox(16.9, 1.9, 1.9, 0.95, u * 0.28, '#2f2a4a', '#1e1830', '#403a63');   // L-Sofa
      dBox(16.9, 1.6, 1.9, 0.36, u * 0.66, '#403a63', '#2a2340');              // Rückenlehne
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gc = detailProj(17.85, 2.5);
      const gg = ctx.createRadialGradient(gc.x, gc.y, 3, gc.x, gc.y, u * 1.6);
      gg.addColorStop(0, `rgba(255,180,90,${0.06 + ct * 0.03})`); gg.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gc.x, gc.y, u * 1.6, 0, 7); ctx.fill();
      ctx.restore();
      for (const lx of [17.0, 18.6]) { const p = detailProj(lx, 1.75); ctx.font = `${u * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🏮', p.x, p.y - u * 0.35); }
      dLabel(17.85, 1.25, 'CHILL-OUT', '#ffcf9a', 9); }

    // --- Deko-Palmen in Gold-Töpfen ---
    { const palm = (wx, wy) => { dShadow(wx - 0.3, wy - 0.12, 0.6, 0.3); const p = detailProj(wx, wy);
        ctx.fillStyle = '#8a6a2e'; ctx.beginPath(); ctx.roundRect(p.x - 6, p.y - 8, 12, 10, 3); ctx.fill();
        ctx.fillStyle = '#2f8f4a'; for (const [ox, oy] of [[-8, -16], [8, -16], [0, -22], [-5, -12], [5, -12]]) { ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy, 3.4, 8, ox * 0.05, 0, 7); ctx.fill(); } };
      palm(18.5, 8.4); palm(10.3, 3.6); }
  } else if (id === 'roof') {
    // === ROOFTOP · VIP: Holzdeck-Fugen + „SKY LOUNGE"-Schriftzug (der Himmel ist echt im Hintergrund) ===
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;   // Deck-Dielen
    for (let dx2 = 0.55; dx2 < r.w; dx2 += 0.55) { const q1 = detailProj(r.x + dx2, r.y), q2 = detailProj(r.x + dx2, r.y + r.d); ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke(); }
    { const sg = detailProj(r.x + r.w / 2, r.y + 0.55);              // Neon „SKY LOUNGE" schwebt über der Glas-Brüstung
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.max(11, u * 0.38)}px system-ui, sans-serif`;
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#5ad0ff'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#8fe3ff'; ctx.fillText('✦ SKY LOUNGE · VIP ✦', sg.x, sg.y - u * 1.0);
      ctx.restore(); ctx.textBaseline = 'alphabetic'; }
    const fl = { x: 12.0, y: 11.0, w: 4.2, d: 3.2 };
    dTiles(fl.x, fl.y, fl.w, fl.d, 5, 4, 'roof', t, beat);
    // Lichterketten über dem Floor
    ctx.strokeStyle = 'rgba(255,220,140,0.5)'; ctx.lineWidth = 1.2;
    { const s1 = detailProj(fl.x, fl.y - 0.2), s2 = detailProj(fl.x + fl.w, fl.y - 0.2);
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.quadraticCurveTo((s1.x + s2.x) / 2, s1.y + 10, s2.x, s2.y); ctx.stroke();
      for (let i = 0; i <= 8; i++) { const x = s1.x + (s2.x - s1.x) * i / 8, y = s1.y + 10 * (1 - Math.pow(2 * i / 8 - 1, 2)) * 0.85;
        ctx.fillStyle = `hsl(${(i * 40 + t * 40) % 360},90%,68%)`; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); } }
    // Skybar + Barkeeper
    dShadow(9.85, 10.7, 2.9, 1.2); dBox(9.85, 10.7, 2.9, 1.0, u * 1.05, '#245566', '#12303a', '#3f93b0');
    ctx.font = `${u * 0.3}px sans-serif`; ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) { const p = detailProj(10.2 + i * 0.5, 11.0); ctx.fillText(['🍹','🍸','🥃','🍹','🍸'][i], p.x, p.y - u * 0.95); }
    if (roomUnlocked('roof')) dPerson(11.2, 11.9, { s: 1.05, color: '#e6f2f5', pants: '#12303a', skin: '#c68a53', hair: '#1a1a22', bob: Math.sin(t * 2.8) * 1.6, groundZ: u * 0.5 });
    // === VIP-Signatur: goldene Kordel am Eingang + Champagner-Kübel (Rooftop ist der VIP-Bereich) ===
    { const goldStanch = (wx, wy) => { const p = detailProj(wx, wy);
        ctx.strokeStyle = '#e8c56a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - u * 0.5); ctx.stroke();
        ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(p.x, p.y - u * 0.52, 3.2, 0, 7); ctx.fill(); return p; };
      const l1 = goldStanch(10.7, 15.4), l2 = goldStanch(10.7, 16.4);
      ctx.strokeStyle = '#b3123a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(l1.x, l1.y - u * 0.5); ctx.quadraticCurveTo(l1.x - 6, (l1.y + l2.y) / 2 - u * 0.5 + 6, l2.x, l2.y - u * 0.5); ctx.stroke();
      const cb = detailProj(12.4, 11.0); ctx.font = `${u * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🍾', cb.x, cb.y - u * 0.95); }
    // Pool (bottom-rechts, eigene Ecke mit klarem Abstand) + Sonnenliegen
    dRect(A.pool.x - 1.35, A.pool.y - 1.05, 2.7, 2.1, '#1f4a6e', '#14324c', 12);
    dRect(A.pool.x - 1.2, A.pool.y - 0.9, 2.4, 1.8, '#2f7fd6', 'rgba(255,255,255,0.35)', 10);
    { ctx.save(); const pa = detailProj(A.pool.x - 1.2, A.pool.y - 0.9), pb = detailProj(A.pool.x + 1.2, A.pool.y + 0.9);
      ctx.beginPath(); ctx.rect(pa.x, pa.y, pb.x - pa.x, pb.y - pa.y); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); const yy = pa.y + (pb.y - pa.y) * (((t * 0.15 + i * 0.25) % 1)); ctx.moveTo(pa.x, yy); ctx.lineTo(pb.x, yy + 4); ctx.stroke(); }
      ctx.restore(); }
    const lounger = (lx, ly) => { dShadow(lx - 0.45, ly - 0.15, 0.9, 0.5); dBox(lx - 0.45, ly - 0.2, 0.9, 0.5, u * 0.26, '#eae3d2', '#b6ae98', '#f6f1e2');
      const p = detailProj(lx + 0.05, ly); ctx.font = `${u * 0.3}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⛱️', p.x, p.y - u * 0.28); };
    lounger(11.6, 16.4); lounger(12.7, 16.8); lounger(11.9, 15.1);   // klar links vom Pool
    // Feuerstelle / Lounge-Ecke
    { const fp = detailProj(17.4, 12.4); dShadow(17.05, 12.05, 0.7, 0.7);
      dBox(17.05, 12.05, 0.7, 0.7, u * 0.3, '#3a3038', '#1c161c', '#4a3e48');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let s = 0; s < 5; s++) { ctx.fillStyle = `hsla(${20 + s * 8},100%,60%,${0.4 + 0.4 * Math.sin(t * 12 + s)})`;
        ctx.beginPath(); ctx.ellipse(fp.x, fp.y - u * 0.5 - Math.abs(Math.sin(t * 8 + s)) * u * 0.2, u * 0.1, u * 0.2, 0, 0, 7); ctx.fill(); }
      ctx.restore(); }
    // Infinity-Pool-Glow: Wasser leuchtet von unten (türkis pulsierend)
    { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pc = detailProj(A.pool.x, A.pool.y);
      const pg = ctx.createRadialGradient(pc.x, pc.y, 4, pc.x, pc.y, u * 2.2);
      const al = 0.12 + 0.06 * Math.sin(t * 1.6);
      pg.addColorStop(0, `rgba(80,220,255,${al})`); pg.addColorStop(1, 'rgba(80,220,255,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(pc.x, pc.y, u * 2.2, 0, 7); ctx.fill();
      ctx.restore(); }
    // Heizstrahler (warmes Glühen) neben den Liegen
    { const heat = (wx, wy) => { const p = detailProj(wx, wy);
        ctx.strokeStyle = '#5c5464'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - u * 0.9); ctx.stroke();
        ctx.fillStyle = '#3a3442'; ctx.beginPath(); ctx.roundRect(p.x - 7, p.y - u * 0.9 - 8, 14, 9, 4); ctx.fill();
        ctx.fillStyle = `rgba(255,150,60,${0.7 + 0.3 * Math.sin(t * 5 + wx)})`; ctx.beginPath(); ctx.roundRect(p.x - 5, p.y - u * 0.9 - 5, 10, 4, 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,150,60,0.08)'; ctx.beginPath(); ctx.moveTo(p.x, p.y - u * 0.9); ctx.lineTo(p.x - u * 0.5, p.y + 4); ctx.lineTo(p.x + u * 0.5, p.y + 4); ctx.closePath(); ctx.fill(); };
      heat(10.9, 17.2); heat(18.2, 13.0); }
  }
  // Alt-&-dunkel-Schleier ganz oben drauf: entsättigt Neon/Möbel am Anfang (schwindet mit Ausbau)
  if (roomUnlocked(id)) {
    const sh = clubShabby();
    if (sh > 0.05) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(a0.x, a0.y, rw, rh, 6); ctx.clip();
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = sh * 0.32;
      ctx.fillStyle = '#b3a888'; ctx.fillRect(a0.x, a0.y, rw, rh);      // leichter Sepia-Schleier (entsättigt, nicht dunkel)
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = sh * 0.1;
      ctx.fillStyle = '#0c0906'; ctx.fillRect(a0.x, a0.y, rw, rh);      // dezent abdunkeln
      ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// Runtergekommener Look am Anfang: Schmutzflecken, kaputte Stellen, Wandrisse — schwindet mit Ausbau
const GRIME = [[0.2,0.3],[0.7,0.22],[0.5,0.62],[0.16,0.82],[0.84,0.72],[0.4,0.44],[0.66,0.86]];
const CRACKS = [0.22,0.55,0.8];
function drawShabby(id, a0, rw, rh, u) {
  const sh = clubShabby();
  if (sh < 0.05) return;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(a0.x, a0.y, rw, rh, 6); ctx.clip();
  ctx.globalAlpha = sh * 0.33;                        // Schmutzflecken (dezent)
  for (const [fx, fy] of GRIME) {
    const rx = a0.x + fx * rw, ry = a0.y + fy * rh, rr = Math.max(14, u * 0.6);
    const gg = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
    gg.addColorStop(0, 'rgba(48,36,18,0.6)'); gg.addColorStop(1, 'rgba(48,36,18,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = sh * 0.4; ctx.fillStyle = '#15111c';   // kaputte Stellen
  for (let i = 0; i < 4; i++) { const [fx, fy] = GRIME[i];
    ctx.beginPath(); ctx.ellipse(a0.x + (1 - fx) * rw, a0.y + fy * rh, 7, 4, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  if (sh > 0.3) {                                    // Risse in der Rückwand
    ctx.globalAlpha = Math.min(1, (sh - 0.3) * 2); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.3;
    for (const c of CRACKS) { let x = a0.x + c * rw, y = a0.y - u; ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += Math.sin(c * 30 + s) * 6; y += u * 0.19; ctx.lineTo(x, y); } ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}

// verrammelter Durchgang zu noch gesperrten Räumen: alter Gang mit Holzbrettern vernagelt
function drawBoardedDoor(dw, a, b, w, h) {
  const g = ctx.createLinearGradient(a.x, a.y, dw.dir === 'v' ? a.x : b.x, dw.dir === 'v' ? b.y : a.y);
  g.addColorStop(0, '#242038'); g.addColorStop(0.5, '#2c2745'); g.addColorStop(1, '#242038');   // dunkler, alter Gangboden
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(a.x, a.y, w, h, 4); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.roundRect(a.x, a.y, w, h, 4); ctx.fill();   // düster
  // gekreuzte Holzbretter, die den Gang versperren
  const plank = (x0, y0, x1, y1, tw) => {
    const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
    const pg = ctx.createLinearGradient(0, -tw / 2, 0, tw / 2);
    pg.addColorStop(0, '#8a5a2e'); pg.addColorStop(0.5, '#6b4423'); pg.addColorStop(1, '#4a2f18');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(0, -tw / 2, len, tw, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(len - 4, 0); ctx.stroke();   // Maserung
    ctx.fillStyle = '#2b2b30'; ctx.beginPath(); ctx.arc(6, 0, 1.8, 0, 7); ctx.arc(len - 6, 0, 1.8, 0, 7); ctx.fill();   // Nägel
    ctx.restore();
  };
  const tw = Math.max(6, (dw.dir === 'v' ? h : w) * 0.16), pad = 3;
  if (dw.dir === 'v') {   // horizontale Bretter quer über den vertikalen Gang
    plank(a.x - pad, a.y + h * 0.28, b.x + pad, a.y + h * 0.42, tw);
    plank(a.x - pad, a.y + h * 0.72, b.x + pad, a.y + h * 0.58, tw);
  } else {                // vertikale Bretter quer über den horizontalen Gang
    plank(a.x + w * 0.28, a.y - pad, a.x + w * 0.42, b.y + pad, tw);
    plank(a.x + w * 0.72, a.y - pad, a.x + w * 0.58, b.y + pad, tw);
  }
  // Absperrband-Feeling + Warnschild
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  ctx.font = `${Math.max(11, tw * 1.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🚧', cx, cy); ctx.textBaseline = 'alphabetic';
}

// Durchgänge zwischen anliegenden Räumen: Schwellen-Boden + Türrahmen-Pfosten
function drawDoorways(t) {
  const u = dTileW();
  for (const dw of DOORWAYS) {
    const ua = roomUnlocked(dw.a), ub = roomUnlocked(dw.b);
    if (!ua && !ub) continue;                         // beide dicht → kein sichtbarer Gang
    const r = dw.rect;
    const a = detailProj(r.x, r.y), b = detailProj(r.x + r.w, r.y + r.d);
    const w = b.x - a.x, h = b.y - a.y;
    if (!ua || !ub) {                                 // ein Raum noch gesperrt → verrammelter alter Gang
      drawBoardedDoor(dw, a, b, w, h);
      ctx.fillStyle = '#3a3550';
      if (dw.dir === 'v') { ctx.fillRect(a.x - 4, a.y, 4, h); ctx.fillRect(b.x, a.y, 4, h); }
      else { ctx.fillRect(a.x, a.y - 4, w, 4); ctx.fillRect(a.x, b.y, w, 4); }
      continue;
    }
    // Schwelle (heller Durchgangs-Boden)
    const g = ctx.createLinearGradient(a.x, a.y, dw.dir === 'v' ? a.x : b.x, dw.dir === 'v' ? b.y : a.y);
    g.addColorStop(0, '#2b2542'); g.addColorStop(0.5, '#3d3660'); g.addColorStop(1, '#2b2542');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(a.x, a.y, w, h, 4); ctx.fill();
    // Trittmarken in Laufrichtung
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = -1; k <= 1; k++) {
      const cx = (a.x + b.x) / 2 + (dw.dir === 'h' ? k * u * 0.32 : 0);
      const cy = (a.y + b.y) / 2 + (dw.dir === 'v' ? k * u * 0.32 : 0);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, u * 0.07), 0, 7); ctx.fill();
    }
    // Türrahmen-Pfosten seitlich des Durchgangs
    ctx.fillStyle = '#4c4570';
    if (dw.dir === 'v') { ctx.fillRect(a.x - 4, a.y, 4, h); ctx.fillRect(b.x, a.y, 4, h); }
    else { ctx.fillRect(a.x, a.y - 4, w, 4); ctx.fillRect(a.x, b.y, w, 4); }
  }
}

// Airport-Deko für die großen freien Flächen im Gebäude (füllt die Leere im Grundriss)
const BAGS = ['🧳','🎒','💼','🧳','🎒','💼'];
function decoPlant(wx, wy, u) { dShadow(wx - 0.28, wy - 0.1, 0.56, 0.26); const p = detailProj(wx, wy);
  ctx.fillStyle = '#4a3320'; ctx.beginPath(); ctx.roundRect(p.x - 7, p.y - 8, 14, 10, 3); ctx.fill();
  ctx.fillStyle = '#2f8f4a'; for (const [ox, oy, rr] of [[-6, -14, 6], [6, -14, 6], [0, -19, 7], [-2, -12, 5], [3, -12, 5]]) { ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, rr, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#3fb060'; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 18, 4, 0, 7); ctx.fill(); }
function drawBuildingDecor(t) {
  const u = dTileW();
  // === Concourse in der grossen Freifläche oben-mitte (zwischen WC und Terminal 2) ===
  dRect(4.4, -0.5, 5.2, 6.2, '#211c31', 'rgba(255,255,255,0.05)', 8);
  // Abflugtafel an der oberen Wand
  { const bp = detailProj(7.0, 0.15), bw2 = u * 3.4, bh2 = u * 0.8;
    ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.roundRect(bp.x - bw2 / 2, bp.y - bh2 / 2, bw2, bh2, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(120,200,255,0.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(bp.x - bw2 / 2, bp.y - bh2 / 2, bw2, bh2);
    ctx.fillStyle = '#ffcf5a'; ctx.font = `700 ${Math.max(7, u * 0.2)}px system-ui, monospace`; ctx.textAlign = 'left';
    const rows = ['✈ BERLIN   BOARDING', '✈ IBIZA    ON TIME', '✈ MIAMI    DELAY'];
    for (let i = 0; i < 3; i++) ctx.fillText(rows[i], bp.x - bw2 / 2 + 6, bp.y - bh2 / 2 + u * 0.24 + i * u * 0.24); }
  // Gepäckband (rotierende Koffer)
  const cxw = 6.9, cyw = 2.7, c = detailProj(cxw, cyw), cr = detailProj(cxw + 1.9, cyw + 1.1);
  const rx = cr.x - c.x, ry = cr.y - c.y;
  dShadow(cxw - 1.9, cyw - 1.1, 3.8, 2.2);
  ctx.fillStyle = '#413a58'; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx + 9, ry + 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2438'; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y, (rx + rx + 9) / 2, (ry + ry + 9) / 2, 0, 0, 7); ctx.stroke();
  ctx.font = `${u * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) { const ang = t * 0.5 + i * Math.PI / 3;
    ctx.fillText(BAGS[i], c.x + Math.cos(ang) * (rx + 4.5), c.y + Math.sin(ang) * (ry + 4.5)); }
  ctx.textBaseline = 'alphabetic';
  // Sitzreihe darunter
  for (let s = 0; s < 4; s++) { const sx = 4.9 + s * 1.05;
    dBox(sx, 4.7, 0.85, 0.4, u * 0.28, '#3a4a6a', '#22304a', '#4a5c80');
    dBox(sx, 4.5, 0.85, 0.18, u * 0.5, '#324060', '#1e2a42'); }
  decoPlant(4.7, 5.4, u); decoPlant(9.2, 5.4, u); decoPlant(4.7, 0.7, u);
  // Wegweiser-Pfeil Richtung Terminals
  { const sp = detailProj(8.7, 3.2); ctx.fillStyle = '#1f6f3a'; ctx.beginPath(); ctx.roundRect(sp.x - u * 0.5, sp.y - u * 0.22, u, u * 0.44, 3); ctx.fill();
    ctx.fillStyle = '#eafff0'; ctx.font = `700 ${Math.max(7, u * 0.2)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('T2 →', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }

  // === Ankunftsbereich unter Terminal 1 (Taxistand + Wartebank) füllt die untere Freifläche ===
  dRect(0.2, 15.6, 8.6, 2.6, '#20182a', 'rgba(255,255,255,0.04)', 8);
  { const sp = detailProj(1.6, 16.1); ctx.fillStyle = '#c9a11e'; ctx.beginPath(); ctx.roundRect(sp.x - u * 0.55, sp.y - u * 0.2, u * 1.1, u * 0.4, 3); ctx.fill();
    ctx.fillStyle = '#1a1206'; ctx.font = `800 ${Math.max(7, u * 0.2)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚕 TAXI', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }
  for (let s = 0; s < 3; s++) { const sx = 5.0 + s * 1.05; dBox(sx, 16.7, 0.85, 0.4, u * 0.28, '#3a4a6a', '#22304a', '#4a5c80'); }
  decoPlant(0.9, 17.6, u); decoPlant(8.2, 17.4, u);
}

// Eigenständiger WC-Anbau AUSSEN oben-links: eigenes kleines Gebäude, Tür nach draußen
// (oben-links) + Verbindungstür ins Terminal 1 (rechte Wand, andockend ans Gebäude).
function drawWcAnnex(t) {
  const a = WC_ANNEX, u = dTileW();
  const p0 = detailProj(a.x, a.y), p1 = detailProj(a.x + a.w, a.y + a.d);
  const w = p1.x - p0.x, h = p1.y - p0.y;
  const wallH = u * 0.95, ac = ACCENT.klo;
  // Schlagschatten des Anbaus auf den Bürgersteig
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.roundRect(p0.x + 5, p0.y + 7, w, h, 8); ctx.fill();
  // Boden (helle Fliesen)
  ctx.fillStyle = '#46586a'; ctx.beginPath(); ctx.roundRect(p0.x, p0.y, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 1; i < a.w; i++) { const q = detailProj(a.x + i, a.y); ctx.beginPath(); ctx.moveTo(q.x, p0.y); ctx.lineTo(q.x, p1.y); ctx.stroke(); }
  for (let j = 1; j < a.d; j++) { const q = detailProj(a.x, a.y + j); ctx.beginPath(); ctx.moveTo(p0.x, q.y); ctx.lineTo(p1.x, q.y); ctx.stroke(); }
  // Verbindungssteg zum Gebäude (dockt rechte Wand an die T1-Linkswand an)
  { const g0 = detailProj(a.x + a.w, a.y + 0.9), g1 = detailProj(RM.t1.x, a.y + 1.9);
    ctx.fillStyle = '#3a4453'; ctx.fillRect(g0.x - 1, g0.y, g1.x - g0.x + 2, g1.y - g0.y); }
  // Möbel: 3 Kabinen (oben) + 2 Waschbecken (unten)
  for (let k = 0; k < 3; k++) { const bx = a.x + 0.28 + k * 0.72;
    dShadow(bx, a.y + 0.3, 0.6, 0.8); dBox(bx, a.y + 0.3, 0.6, 0.8, u * 0.42, '#7f93a8', '#495866', '#95a9bd');
    const q = detailProj(bx + 0.3, a.y + 0.7); ctx.font = `${u * 0.26}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🚽', q.x, q.y - u * 0.4); }
  for (let k = 0; k < 2; k++) { const bx = a.x + 0.45 + k * 1.0;
    dBox(bx, a.y + 2.05, 0.7, 0.42, u * 0.32, '#ccd4de', '#8f9aa6', '#e4eaf0');
    const q = detailProj(bx + 0.35, a.y + 2.35); ctx.font = `${u * 0.22}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🚰', q.x, q.y - u * 0.3); }
  // Wände ringsum (eigenes Gebäude)
  const wg = ctx.createLinearGradient(0, p0.y - wallH, 0, p0.y); wg.addColorStop(0, '#2c2438'); wg.addColorStop(1, '#181222');
  ctx.fillStyle = wg; ctx.fillRect(p0.x, p0.y - wallH, w, wallH);                     // Rückwand oben
  ctx.fillStyle = ac; ctx.globalAlpha = 0.7; ctx.fillRect(p0.x, p0.y - wallH + 1, w, 2.2); ctx.globalAlpha = 1;   // Neon-Trim
  ctx.fillStyle = '#241d30'; ctx.fillRect(p0.x - 3, p0.y - wallH, 4, h + wallH);       // linke Wand
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(p0.x, p1.y - 3, w, 3);              // Sockel unten
  // rechte Wand mit Verbindungstür-Öffnung (Mitte offen → ins Gebäude)
  { const dt = detailProj(a.x + a.w, a.y + 0.9).y, db = detailProj(a.x + a.w, a.y + 1.9).y;
    ctx.fillStyle = '#241d30'; ctx.fillRect(p1.x - 1, p0.y - wallH, 4, dt - (p0.y - wallH)); ctx.fillRect(p1.x - 1, db, 4, p1.y - db);
    ctx.fillStyle = ac; ctx.globalAlpha = 0.5; ctx.fillRect(p1.x - 1, dt, 3, db - dt); ctx.globalAlpha = 1; }   // beleuchtete Schwelle (innen)
  // Aussentür oben-links (zur Straße/Bürgersteig) — Rahmen + kleine Stufe
  { const od0 = detailProj(a.x + 0.35, a.y).x, od1 = detailProj(a.x + 1.15, a.y).x;
    ctx.fillStyle = '#5a5378'; ctx.fillRect(od0 - 2, p0.y - wallH, 3, wallH); ctx.fillRect(od1 - 1, p0.y - wallH, 3, wallH);   // Türpfosten
    ctx.fillStyle = '#120d1c'; ctx.fillRect(od0, p0.y - wallH + 2, od1 - od0, wallH - 2);                                     // dunkle Türöffnung
    const step = detailProj(a.x + 0.75, a.y - 0.35); ctx.fillStyle = 'rgba(90,166,200,0.2)';
    ctx.beginPath(); ctx.ellipse(step.x, step.y, (od1 - od0) * 0.7, u * 0.22, 0, 0, 7); ctx.fill(); }   // Stufe/Matte draussen
  // Türschild oben
  const lp = detailProj(a.x + a.w / 2, a.y - 0.15);
  ctx.font = `800 ${Math.max(9, u * 0.24)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lw = ctx.measureText('🚻 WC').width;
  ctx.fillStyle = 'rgba(12,10,20,0.78)'; ctx.beginPath(); ctx.roundRect(lp.x - lw / 2 - 7, lp.y - u * 0.2, lw + 14, u * 0.38, u * 0.19); ctx.fill();
  ctx.strokeStyle = 'rgba(90,166,200,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#eaf3fb'; ctx.fillText('🚻 WC', lp.x, lp.y); ctx.textBaseline = 'alphabetic';
}

// Einzel-Raum-Ansicht: genau EIN Raum bildschirmfüllend (Boden, Wände, Möbel, Gäste, Geld-Pins).
function drawFocusRoom(t, beat) {
  const id = framedRoom, r = RM[id];
  if (id === 'roof') drawRoofBg(t);   // Rooftop: Nachthimmel + Skyline + Dach-Platte statt Bürgersteig
  else drawGrassBg();
  drawRoomDetail(id, t, beat);        // Boden + Wände + Möbel + Deko + Shabby des Raums
  if (id === 't1') drawWcAnnex(t);    // WC-Anbau außen oben-links
  if (id === 't1') drawStreetFg(t);   // Straßen-Band unten VOR dem Gebäude (Autos fahren nie drunter durch)

  // Performer auf 3D-Bühne, falls diesem Raum zugewiesen
  if (state.performer.unlocked && state.performer.room === id && roomUnlocked(id)) {
    const u = dTileW();
    const c = { t1:[6.2,9.0], t2:[15.0,5.2], roof:[13.5,14.5] }[id] || [6,9];
    dShadow(c[0]-0.7, c[1]-0.7, 1.4, 1.4);
    dBox(c[0]-0.7, c[1]-0.7, 1.4, 1.4, u * 0.35, '#ff5e8a', '#a32e52', '#ff85b3');
    dPerson(c[0], c[1], { s: 1.2, color: '#ff2d86', skin: '#f0b98c', hair: '#1a1a22', female: true, showgirl: true, arms: beat*1.5, dancing: true, bob: Math.sin(beat*1.5)*3, groundZ: u * 0.35 });
  }

  // Gäste NUR strikt INNERHALB des Raums zeichnen (nichts läuft ausserhalb der Wände)
  if (roomUnlocked(id)) {
    const drunk = nightDrunk();
    const gs = guests.filter(g => g.x >= r.x + 0.15 && g.x <= r.x + r.w - 0.15 && g.y >= r.y + 0.15 && g.y <= r.y + r.d - 0.05)
      .sort((a, b) => a.y - b.y);
    for (const g of gs) {
      if (g.ko) { drawKO(g, t); continue; }   // liegt am Boden
      const dancing = g.mode === 'act' && (g.act === 'dance' || g.act === 'vipdance' || g.act === 'roofbar');
      // je später/betrunkener, desto wilder das Tanzen + leichtes Torkeln
      const bob = dancing ? Math.sin(beat + g.bobPhase) * ((dropActive() ? 4 : 2.5) + drunk * 3) : 0;
      const sway = drunk > 0.2 ? Math.sin(t * 1.7 + g.bobPhase) * drunk * 0.12 : 0;   // Torkeln
      let emote = null;
      if (g.trouble) emote = Math.sin(t * 6 + g.bobPhase) > 0 ? '😡' : '🤬';
      else if (g.mode === 'act') {
        if (g.act === 'chat' && Math.sin(t * 2.5 + g.bobPhase) > 0.55) emote = '💬';
        else if (g.act === 'selfie') emote = '📸';
        else if (drunk > 0.5 && Math.sin(t * 1.3 + g.bobPhase * 3) > 0.9) emote = pick(['🥴', '🍺', '🎉']);
      }
      dPerson(g.x + sway, g.y, { s: g.celeb ? 1.3 : g.vip ? 1.08 : 1, color: g.color, skin: g.skin, hair: g.hair, female: g.female,
        bob: g.trouble ? Math.sin(t * 9) * 3 : bob, arms: (dancing || g.trouble) ? beat + g.bobPhase : null, dancing,
        drink: g.mode === 'act' ? g.drink : null, emote, alpha: g.alpha, glow: g.celeb, star: g.celeb, bobPhase: g.bobPhase, drunk });
    }
    // Security/Türsteher im Einsatz
    if (sec) dPerson(sec.x, sec.y, { s: 1.24, color: '#15151f', pants: '#0d0d15', skin: '#8c5a33', hair: '#1a1a22', shades: true, earpiece: true, bob: Math.sin(t * 5) * 1.4 });
    // Goldene Flasche (Bonus zum Antippen) — pulsierender Glow + Schweben + Countdown-Ring
    if (goldBottle && goldBottle.room === id) {
      const gb = goldBottle, p = detailProj(gb.x, gb.y), u2 = dTileW();
      const age = t - gb.t0, fl = Math.sin(age * 3) * u2 * 0.08;
      const gy = p.y - u2 * 0.5 + fl;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(p.x, gy, 2, p.x, gy, u2 * 0.9);
      gl.addColorStop(0, 'rgba(255,215,80,0.45)'); gl.addColorStop(1, 'rgba(255,215,80,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, gy, u2 * 0.9, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(10,6,26,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, u2 * 0.28, u2 * 0.1, 0, 0, 7); ctx.fill();
      ctx.font = `${u2 * 0.62}px sans-serif`; ctx.textAlign = 'center';
      ctx.save(); ctx.shadowColor = '#ffd94a'; ctx.shadowBlur = 14; ctx.fillText('🍾', p.x, gy); ctx.restore();
      for (let s2 = 0; s2 < 3; s2++) { const a2 = age * 2.4 + s2 * 2.1;   // Funkeln
        ctx.fillStyle = `rgba(255,240,160,${0.5 + 0.5 * Math.sin(age * 6 + s2 * 2)})`;
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a2) * u2 * 0.5, gy - u2 * 0.15 + Math.sin(a2) * u2 * 0.3, 1.6, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 3;   // Restzeit-Ring
      ctx.beginPath(); ctx.arc(p.x, gy - u2 * 0.05, u2 * 0.55, -Math.PI / 2, -Math.PI / 2 + (gb.ttl / 11) * Math.PI * 2); ctx.stroke();
    }
    // Geld-Pins dieses Raums (Shots/Garderobe wandern mit dem Ausbau nach aussen)
    for (const [stId, anchorId] of Object.entries(PIN_AT)) {
      if (A[anchorId].room !== id) continue;
      const amount = state.stationCash[stId] || 0;
      if (amount < 1) continue;
      const a = anchorWorld(anchorId);
      const p = detailProj(a.x, a.y);
      drawPinAt(p.x, p.y - dTileW() * 1.05, amount, t, stId.length);
    }
  }

  // kurzer weicher Überblend beim Raumwechsel
  if (roomFade > 0) { const p = dPad(); ctx.fillStyle = `rgba(10,7,20,${roomFade * 0.5})`; ctx.fillRect(0, p.top, W, H - p.top - p.bot); }
}

// betrunkener Gast liegt am Boden (K.O.) — quer liegende Figur + Zzz
function drawKO(g, t) {
  const p = detailProj(g.x, g.y), s = dPersonScale() * 34 * 0.9;
  ctx.save(); ctx.globalAlpha = g.alpha != null ? g.alpha : 1;
  ctx.fillStyle = 'rgba(10,6,26,0.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 12 * s / 6, 4 * s / 6, 0, 0, 7); ctx.fill();
  const bx = p.x, by = p.y - 3 * s / 6;
  // Beine
  ctx.strokeStyle = g.pants || '#2b2b3a'; ctx.lineWidth = 2.4 * s / 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx + 2 * s / 6, by); ctx.lineTo(bx + 10 * s / 6, by - 1 * s / 6);
  ctx.moveTo(bx + 2 * s / 6, by + 1.5 * s / 6); ctx.lineTo(bx + 10 * s / 6, by + 2 * s / 6); ctx.stroke();
  // Körper (liegend)
  ctx.fillStyle = g.color; ctx.beginPath(); ctx.ellipse(bx - 1 * s / 6, by, 5 * s / 6, 3.2 * s / 6, 0, 0, 7); ctx.fill();
  // Kopf
  ctx.fillStyle = g.skin || '#ffd9b3'; ctx.beginPath(); ctx.arc(bx - 6 * s / 6, by - 0.5 * s / 6, 3.4 * s / 6, 0, 7); ctx.fill();
  ctx.fillStyle = g.hair || '#2b1c10'; ctx.beginPath(); ctx.arc(bx - 7 * s / 6, by - 1.5 * s / 6, 3.0 * s / 6, Math.PI * 0.6, Math.PI * 1.8); ctx.fill();
  // Zzz
  ctx.fillStyle = '#cfe3ff'; ctx.font = `700 ${Math.max(8, s * 0.9)}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.globalAlpha *= 0.85; ctx.fillText('💤', bx - 6 * s / 6, by - 7 * s / 6 - Math.sin(t * 2 + g.bobPhase) * 2);
  ctx.restore();
}

// ein Geld-Pin an Bildschirmkoordinaten
function drawPinAt(px, py, amount, t, seed) {
  const bounce = Math.sin(t * 3 + seed) * 2.5;
  py -= bounce;
  const label = fmt(amount);
  ctx.font = `800 ${Math.max(10, 11 * (lastFocusRoom && focusAmt > 0.5 ? 1.15 : 1))}px system-ui, sans-serif`;
  const tw = ctx.measureText(label).width, bw = tw + 28, bh = 20;
  ctx.fillStyle = '#2ea84a'; ctx.beginPath(); ctx.moveTo(px, py + bh/2 + 8); ctx.lineTo(px-6, py+bh/2-1); ctx.lineTo(px+6, py+bh/2-1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#38c95c'; ctx.beginPath(); ctx.roundRect(px-bw/2, py-bh/2, bw, bh, bh/2); ctx.fill();
  ctx.strokeStyle = '#1d7a33'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(px-bw/2, py-bh/2, bw, bh, bh/2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
  ctx.fillText('💶', px-bw/2+6, py+4);
  ctx.font = `800 12px system-ui, sans-serif`; ctx.fillText(label, px-bw/2+23, py+4);
  ctx.textAlign = 'center';
}

// ---------------- Frame ----------------
let lastFrame = 0;
let incomeCache = 0, incomeTimer = 0;

let lastClubSize = -1;
export function renderFrame(now) {
  if (!ctx) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0.016;
  lastFrame = now;
  // Gebäudegröße an Club-Ausbau anpassen; bei Änderung neu einrahmen
  applyClubSize();
  if ((state.clubSize || 0) !== lastClubSize) { lastClubSize = state.clubSize || 0; if (focusRoom === 't1') frameRoom('t1', false); }
  const t = (now - startTime) / 1000;
  const bpm = musicBpm() * (dropActive() ? 1.25 : 1);
  const beat = t * (bpm / 60) * Math.PI;
  tickerX -= dt * 40 * cam.s;

  // Kamera zum Ziel animieren (Übersicht ↔ Raum-Detail)
  const target = focusRoom ? (camRooms[focusRoom] || camOver) : camOver;
  const k = 1 - Math.pow(0.0015, dt);
  cam.s += (target.s - cam.s) * k;
  cam.ox += (target.ox - cam.ox) * k;
  cam.oy += (target.oy - cam.oy) * k;
  focusAmt += ((focusRoom ? 1 : 0) - focusAmt) * k;
  if (focusRoom) lastFocusRoom = focusRoom;
  if (roomFade > 0) roomFade = Math.max(0, roomFade - dt * 4.5);   // kurzer Überblend beim Raumwechsel

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  updateGuests(dt);
  updateParticles(dt);
  incomeTimer += dt; if (incomeTimer > 0.25) { incomeTimer = 0; incomeCache = incomePerSec(); }

  // Iso-Übersicht NUR zeichnen, wenn sie sichtbar ist (in der Raumansicht deckt drawFocusRoom
  // sie komplett ab → sonst würden alle Gäste doppelt gezeichnet = Ruckeln).
  if (focusAmt < 0.985) {
    drawGround();
    drawPlaza(t);
    // Räume (Boden/Wände/Deko) + Sammel-Liste für tiefen­sortierte Objekte
    const drawables = [];
    drawT2(t, beat, drawables);
    drawT1(t, beat, drawables);
    drawRoof(t, beat, drawables);
    drawPerformer(t, beat, drawables);
    // Gäste als Drawables (Tiefe = x+y)
    for (const g of guests) {
      const dancing = g.mode === 'act' && (g.act === 'dance' || g.act === 'vipdance' || g.act === 'roofbar');
      const bob = dancing ? Math.sin(beat + g.bobPhase) * (dropActive() ? 3.2 : 2) * cam.s : 0;
      const gg = g;
      drawables.push({ d: g.x + g.y, fn: () => drawPerson(gg.x, gg.y, {
        s: gg.celeb ? 1.35 : gg.vip ? 1.08 : 1, color: gg.color, skin: gg.skin, hair: gg.hair, female: gg.female,
        bob, arms: dancing ? beat + gg.bobPhase : null, dancing,
        drink: gg.mode === 'act' ? gg.drink : null, alpha: gg.alpha, glow: gg.celeb, star: gg.celeb, bobPhase: gg.bobPhase }) });
    }
    drawables.sort((a, b) => a.d - b.d);
    for (const it of drawables) it.fn();
    if (!state.t2Unlocked) drawLockOverlay(RM.t2, 'Terminal 2', 'Antippen zum Freischalten');
    if (!state.roofUnlocked) drawLockOverlay(RM.roof, 'Rooftop · VIP', state.t2Unlocked ? 'Antippen zum Freischalten' : 'Erst Terminal 2');
    drawCashPins(t);
  }

  // Raum-Detailansicht (genau EIN Raum, bildschirmfüllend) über die Iso-Übersicht blenden
  if (focusAmt > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, focusAmt * 1.2);
    drawFocusRoom(t, beat);
    ctx.restore();
  }

  // Partikel
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.font = `700 ${p.size}px system-ui, sans-serif`; ctx.textAlign = 'center';
    ctx.fillStyle = p.color || '#fff';
    ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (dropActive()) { ctx.fillStyle = `rgba(255,255,255,${0.04 + 0.05 * Math.abs(Math.sin(t * 20))})`; ctx.fillRect(0, 0, W, H); }
}

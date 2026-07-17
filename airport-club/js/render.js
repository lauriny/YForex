// ============================================================
//  AIRPORT – Club Simulator · Isometrische Render-Engine
//  2:1-Iso, fit-to-view-Kamera, 4 Räume als Cutaway-Grundriss,
//  plastische Möbel (3 Sichtflächen), detaillierte Figuren.
// ============================================================
import {
  state, totalLevels, dropActive, tapCeleb, tapHype,
  depositAtStation, collectStation, roomUnlocked,
  eventDef, eventGuestMult, incomePerSec,
} from './game.js';
import { fmt, CASH_STATIONS } from './data.js';
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
  t2:   { x: 10, y: 0,  w: 9, d: 9, name: 'TERMINAL 2 · VIP' },
  roof: { x: 10, y: 10, w: 9, d: 8, name: 'ROOFTOP' },
};
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
  pool:      { x: 15.3, y: 15.0, room: 'roof' },
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
  const dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly;
  ptr.lx = e.clientX; ptr.ly = e.clientY;
  if (Math.abs(e.clientX - ptr.x0) + Math.abs(e.clientY - ptr.y0) > 8) ptr.moved = true;
  if (inRoomView() && !planIsMap()) { const z = detailZoom(); detailCam.x -= dx / z; detailCam.y -= dy / z; clampPan(); }
}
function onPointerUp(e) {
  if (!ptr) return;
  const moved = ptr.moved; ptr = null;
  if (!moved) handleTap(e);
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
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
}

// Raum betreten / verlassen (von Tap oder UI aufgerufen)
export function enterRoom(id) {
  if (!roomUnlocked(id) || !RM[id]) return false;
  focusRoom = id; planFocus = id; zoomTarget = 1;   // direkt in den Raum zoomen
  detailCam.x = RM[id].x + RM[id].w / 2;   // Kamera auf den gewählten Raum
  detailCam.y = RM[id].y + RM[id].d / 2;
  clampPan();
  return true;
}
// In der Grundriss-Karte einen Raum antippen → in ihn hineinzoomen
export function zoomToRoom(id) {
  if (!roomUnlocked(id) || !RM[id]) return false;
  planFocus = id; zoomTarget = 1;
  return true;
}
// Zurück-Taste: Raum → Karte, Karte → Iso-Übersicht
export function detailBack() {
  if (!planIsMap()) { zoomTarget = 0; return 'map'; }   // rauszoomen auf die Karte
  focusRoom = null; return 'exit';                       // Karte verlassen → Übersicht
}
export function exitRoom() { focusRoom = null; zoomTarget = 1; }
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
  // Grundriss-Karte (rausgezoomt): Tap auf einen Raum → hineinzoomen (kein Geld sichtbar)
  if (roomV && planIsMap()) {
    for (const id of ['roof', 't2', 't1', 'klo']) {
      const a = detailProj(RM[id].x, RM[id].y), b = detailProj(RM[id].x + RM[id].w, RM[id].y + RM[id].d);
      if (mx >= a.x && mx <= b.x && my >= a.y && my <= b.y) {
        if (roomUnlocked(id)) { zoomToRoom(id); if (onTapFeedback) onTapFeedback({ type: 'enterRoom', room: id }); }
        else if (onTapFeedback) onTapFeedback({ type: 'locked', room: id });
        return;
      }
    }
    return;
  }
  // Geld-Pins einsammeln (Iso-Übersicht ODER hineingezoomter Raum)
  for (const [stId, anchorId] of Object.entries(PIN_AT)) {
    if ((state.stationCash[stId] || 0) < 1) continue;
    const a = A[anchorId];
    if (roomV && !roomUnlocked(a.room)) continue;
    const s = roomV ? (() => { const p = detailProj(a.x, a.y); return { x: p.x, y: p.y - dTileW() * 1.05 }; })() : iso(a.x, a.y, 1.15);
    if (Math.hypot(mx - s.x, my - s.y) < (roomV ? 40 : 30)) {
      const amount = collectStation(stId);
      if (amount > 0 && onTapFeedback) onTapFeedback({ type: 'collect', x: e.clientX, y: e.clientY, amount });
      return;
    }
  }
  // In der Iso-Übersicht: Tap auf einen Raum wählt ihn aus
  if (!inRoomView()) {
    for (const id of ['roof', 't2', 't1', 'klo']) {
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
const WC_DOOR = { t1: { x: 1.05, y: 8.55 }, t2: { x: 17.6, y: 7.9 }, roof: { x: 17.4, y: 16.6 } };
const BACKSTAGE = { x: 7.35, y: 7.7 };   // oben-rechts, neben dem DJ in Terminal 1
let guests = [];
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function inRoom(r, mx = 0.6) { return { x: rnd(r.x + mx, r.x + r.w - mx), y: rnd(r.y + mx, r.y + r.d - mx) }; }

function targetGuestCount() {
  let base = 6 + Math.floor(totalLevels() / 7);
  if (state.roofUnlocked) base += 6; else if (state.t2Unlocked) base += 3;
  base += (state.clubSize || 0) * 6;   // größerer Club → mehr Gäste
  return Math.min(64, Math.floor(base * eventGuestMult()));
}

function spawnGuest(celeb = false) {
  const vip = !celeb && state.t2Unlocked && Math.random() < 0.4;
  const g = {
    x: ENTRY_OUT.x + rnd(-0.6, 0.6), y: ENTRY_OUT.y,
    color: celeb ? '#ffd700' : vip ? pick(['#e6b800', '#d4941e', '#c9a227']) : pick(GUEST_COLORS),
    skin: pick(SKIN), hair: pick(HAIR),
    speed: rnd(1.7, 2.7),
    bobPhase: Math.random() * Math.PI * 2,
    female: Math.random() < 0.5,
    vip, celeb, mode: 'walk', act: 'dance', actT: 0,
    drink: null, alpha: 1, path: [],
  };
  g.path = [ENTRY_IN];
  if (!celeb && Math.random() < 0.3) { g.path.push({ ...A.garderobe }); g.afterPath = 'ward'; }
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
    case 'dance': {   // Tanzfläche wächst mit dem Club-Ausbau (deckt sich mit dem gezeichneten Floor)
      const cs = state.clubSize || 0;
      return inRoom({ x: 2.55 - 0.15 * cs, y: 9.4 - 0.2 * cs, w: Math.min(5.7, 4.0 + 0.55 * cs), d: Math.min(5.4, 4.4 + 0.35 * cs) });
    }
    case 'vipdance': return inRoom({ x: 12.5, y: 2.5, w: 4, d: 3.5 });
    case 'roofbar':  return Math.random() < 0.5 ? { x: A.skybar.x + rnd(-0.8, 1.2), y: A.skybar.y + 0.9 }
                                                 : { x: A.pool.x + rnd(-1, 1), y: A.pool.y - 1 };
    case 'bar':      return { x: A.bar.x + 1.3, y: A.bar.y + rnd(-1.5, 1.5) };
    case 'shots':    return { x: A.shots.x - 1.1, y: A.shots.y + rnd(-1, 1) };
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
    case 'ward':     return { x: A.garderobe.x - 0.6, y: A.garderobe.y + 0.6 };
    case 'leave':    return ENTRY_OUT;
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
  const rad = 0.28;
  for (const o of OBSTACLES) {
    const minX = o.x - rad, maxX = o.x + o.w + rad, minY = o.y - rad, maxY = o.y + o.d + rad;
    if (g.x <= minX || g.x >= maxX || g.y <= minY || g.y >= maxY) continue;
    // kleinste Überlappung finden und in diese Richtung herausschieben (an der Kante entlanggleiten)
    const dL = g.x - minX, dR = maxX - g.x, dT = g.y - minY, dB = maxY - g.y;
    const m = Math.min(dL, dR, dT, dB);
    if (m === dL) g.x = minX; else if (m === dR) g.x = maxX;
    else if (m === dT) g.y = minY; else g.y = maxY;
  }
}

function updateGuests(dt) {
  const want = targetGuestCount();
  const alive = guests.filter(g => !g.celeb).length;
  if (alive < want && Math.random() < dt * (dropActive() ? 3 : 1.7)) spawnGuest();
  if (alive > want + 3) { const g = guests.find(g => !g.celeb && g.act !== 'leave'); if (g) pushActivity(g, 'leave'); }

  const hasCeleb = guests.some(g => g.celeb);
  if (state.celeb && !hasCeleb) spawnGuest(true);
  if (!state.celeb && hasCeleb) guests = guests.filter(g => !g.celeb);

  const speedMult = dropActive() ? 1.5 : 1;
  for (let i = guests.length - 1; i >= 0; i--) {
    const g = guests[i];
    if (g.mode === 'walk') {
      const t = g.path[0];
      if (!t) { g.mode = 'act'; g.actT = actDuration(g.act); continue; }
      const dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
      const step = g.speed * speedMult * dt;
      g.face = dx - dy;   // Blickrichtung für Animation
      if (d < step) {
        g.x = t.x; g.y = t.y; g.path.shift();
        if (g.path.length === 0) {
          if (g.afterPath) { g.act = g.afterPath; g.afterPath = null; }
          if (g.act === 'leave') { guests.splice(i, 1); continue; }
          g.mode = 'act'; g.actT = actDuration(g.act);
          if (g.act === 'bar') g.drink = pick(DRINKS_T1);
          else if (g.act === 'shots') g.drink = '🥃';
          else if (g.act === 'champ' || g.act === 'sofa' || g.act === 'roofbar') g.drink = pick(DRINKS_T2);
        }
      } else { g.x += dx / d * step; g.y += dy / d * step; avoidObstacles(g); }
    } else {
      g.actT -= dt;
      g.alpha = (g.act === 'wc' && g.actT < actDuration('wc') - 0.5) ? 0.2 : 1;
      if (g.actT <= 0) {
        const stId = stationForAct(g.act);
        if (stId) depositAtStation(stId);
        g.drink = null; g.alpha = 1;
        if (g.celeb) pushActivity(g, 'dance');
        else pushActivity(g, chooseAct(g));
      }
    }
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

  // Oberkörper (Kleid/Shirt)
  ctx.fillStyle = o.color;
  if (o.female) {
    ctx.beginPath();
    ctx.moveTo(px - 3.4 * s, cy - 3 * s);
    ctx.lineTo(px + 3.4 * s, cy - 3 * s);
    ctx.lineTo(px + 4.2 * s, cy + 7 * s);
    ctx.lineTo(px - 4.2 * s, cy + 7 * s);
    ctx.closePath(); ctx.fill();
  } else {
    roundRectP(px - 3.6 * s, cy - 4 * s, 7.2 * s, 11 * s, 3 * s); ctx.fill();
  }
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRectP(px - 3 * s, cy - 3 * s, 2 * s, 8 * s, 1 * s); ctx.fill();

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
  drawRoomLabel(r, 'TERMINAL 2 · VIP', '#ffd970');
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

  drawRoomLabel(r, 'ROOFTOP', '#8fe3ff');
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
    s: 1.15, color: '#ff4fa3', skin: '#f0b98c', hair: '#1a1a22', female: true,
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
function dPad() { return { x: W * 0.05, top: H * 0.088, bot: H * 0.055 }; }
// Detailansicht = zusammenhängender Grundriss; Kamera schwenkt per Wisch durchs Gebäude.
let detailCam = { x: 4.5, y: 11 };   // Weltpunkt in Bildschirmmitte
// Zwei Zoomstufen im Grundriss: Karte (nur Namen) ↔ Raum (Möbel + Geld)
let zoomAmt = 1;        // 0 = Karte, 1 = Raum (animiert)
let zoomTarget = 1;
let planFocus = 't1';   // Raum, in den gezoomt wird
function roomScale() { return ((W - 2 * dPad().x) / 9) * (1 + (state.clubSize || 0) * 0.1); }
function mapScale() {
  const p = dPad(), aw = W - 2 * p.x, ah = H - p.top - p.bot;
  return Math.min(aw / (CLUB_BB.x1 - CLUB_BB.x0), ah / (CLUB_BB.y1 - CLUB_BB.y0)) * 0.94;
}
function detailZoom() { return mapScale() + (roomScale() - mapScale()) * zoomAmt; }  // px pro Welt-Einheit
function bldCenter() { return { x: (CLUB_BB.x0 + CLUB_BB.x1) / 2, y: (CLUB_BB.y0 + CLUB_BB.y1) / 2 }; }
function planIsMap() { return zoomAmt < 0.5; }
function detailViewCy() { const p = dPad(); return p.top + (H - p.top - p.bot) / 2; }
function detailProj(wx, wy) {
  const z = detailZoom();
  return { x: W / 2 + (wx - detailCam.x) * z, y: detailViewCy() + (wy - detailCam.y) * z };
}
function dTileW() { return detailZoom(); }
const CLUB_BB = { x0: -1.2, y0: -1.2, x1: 20.2, y1: 19.6 };   // Gebäude-Grenzen für Wisch-Clamping
function clampPan() {
  const z = detailZoom(), p = dPad();
  const hw = W / (2 * z), hh = (H - p.top - p.bot) / (2 * z);
  const cxMin = CLUB_BB.x0 + hw, cxMax = CLUB_BB.x1 - hw;
  const cyMin = CLUB_BB.y0 + hh, cyMax = CLUB_BB.y1 - hh;
  detailCam.x = cxMin <= cxMax ? Math.max(cxMin, Math.min(cxMax, detailCam.x)) : (CLUB_BB.x0 + CLUB_BB.x1) / 2;
  detailCam.y = cyMin <= cyMax ? Math.max(cyMin, Math.min(cyMax, detailCam.y)) : (CLUB_BB.y0 + CLUB_BB.y1) / 2;
}
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
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const pulse = 0.5 + 0.5 * Math.sin(beat + i + j);
    let hue, light;
    if (palette === 'vip') { hue = 42 + ((i + j) % 3) * 8; light = 34 + pulse * 22; }
    else if (palette === 'roof') { hue = (t * 30 + (i + j) * 24) % 360; light = 30 + pulse * 18; }
    else { hue = ((i + j) * 55 + t * 90) % 360; light = dropActive() ? 52 + pulse * 16 : 37 + pulse * 13; }
    const tx = a.x + i * cw + 1.5, ty = a.y + j * ch + 1.5, tw = cw - 3, th = ch - 3;
    ctx.fillStyle = `hsl(${hue},72%,${Math.max(10, light - 24)}%)`;               // dunkle Kante (Höhe)
    ctx.beginPath(); ctx.roundRect(tx, ty + th - bev, tw, bev + 2.5, 3); ctx.fill();
    const tg = ctx.createLinearGradient(0, ty, 0, ty + th);                       // Oberseite mit Verlauf
    tg.addColorStop(0, `hsl(${hue},95%,${Math.min(78, light + 14)}%)`);
    tg.addColorStop(1, `hsl(${hue},85%,${Math.max(14, light - 5)}%)`);
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th - bev * 0.5, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';                                      // Glanz
    ctx.beginPath(); ctx.roundRect(tx + 2, ty + 1.5, tw - 4, th * 0.26, 2); ctx.fill();
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

const FLOORCOL = { t1: '#463a72', klo: '#46586a', t2: '#3d1f42', roof: '#12203a' };
const GRASS = { t1: true, klo: true, t2: true, roof: false };
// Neon-Akzent je Raum (für Wand-Trims, Türrahmen, Bodenkanten)
const ACCENT = { t1: '#8b5cf6', klo: '#5aa6c8', t2: '#ffcf6a', roof: '#5ad0ff' };
// Durchgänge zwischen direkt anliegenden Räumen: Boden-Schwelle + Türrahmen im Wandspalt
const DOORWAYS = [
  { a: 'klo', b: 't1',  rect: { x: 1.4,  y: 5.85, w: 1.3, d: 1.3  }, dir: 'v' },  // WC ↕ Terminal 1
  { a: 't1',  b: 't2',  rect: { x: 8.85, y: 7.35, w: 1.3, d: 1.4  }, dir: 'h' },  // Terminal 1 ↔ Terminal 2
  { a: 't1',  b: 'roof',rect: { x: 8.85, y: 11.4, w: 1.3, d: 1.6  }, dir: 'h' },  // Terminal 1 ↔ Rooftop
  { a: 't2',  b: 'roof',rect: { x: 12.8, y: 8.85, w: 1.6, d: 1.3  }, dir: 'v' },  // Terminal 2 ↕ Rooftop
];
// Möbel-Hindernisse (Welt-Rechtecke) — Gäste laufen aussen herum statt drüber
const OBSTACLES = [
  { x: 2.9,  y: 7.25, w: 3.2,  d: 1.35, room: 't1' },   // DJ-Pult
  { x: 2.3,  y: 7.3,  w: 0.6,  d: 1.2,  room: 't1' },   // linke Box
  { x: 6.0,  y: 7.3,  w: 0.6,  d: 1.2,  room: 't1' },   // rechte Box
  { x: 0.25, y: 8.85, w: 1.75, d: 4.2,  room: 't1' },   // Bar
  { x: 7.3,  y: 8.5,  w: 1.55, d: 2.65, room: 't1' },   // Shot-Bar
  { x: 6.9,  y: 13.1, w: 1.8,  d: 1.0,  room: 't1' },   // Garderoben-Ständer
  { x: 6.7,  y: 6.95, w: 1.3,  d: 0.6,  room: 't1' },   // Backstage
  { x: 9.8,  y: 0.85, w: 2.7,  d: 1.1,  room: 't2' },   // Champagner-Bar
  { x: 14.9, y: 5.85, w: 2.5,  d: 1.5,  room: 't2' },   // Sofa-Ecke 1
  { x: 16.0, y: 1.85, w: 2.5,  d: 1.5,  room: 't2' },   // Sofa-Ecke 2
  { x: 9.8,  y: 10.75,w: 2.7,  d: 1.1,  room: 'roof' }, // Skybar
  { x: 13.7, y: 13.8, w: 3.2,  d: 2.4,  room: 'roof' }, // Pool
];

// grüner Wiesen-Hintergrund wie in v2
function drawGrassBg() {
  ctx.fillStyle = '#7ec24f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const cell = W / 8;
  for (let i = 0; i < 8; i++) for (let j = 0; j < Math.ceil(H / cell); j++) if ((i + j) % 2 === 0) ctx.fillRect(i * cell, j * cell, cell, cell);
  const bush = (x, y, rr) => { ctx.fillStyle = '#3f9142'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    ctx.fillStyle = '#54ad55'; ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.5, 0, 7); ctx.fill(); };
  bush(W * 0.05, H * 0.16, 11); bush(W * 0.95, H * 0.22, 13); bush(W * 0.04, H * 0.82, 12); bush(W * 0.96, H * 0.8, 11);
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
  // Rückwand: dunkle Club-Wand mit Paneelen + Neon-Trim (Akzentfarbe des Raums)
  const wallH = u * 1.05;
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
  const wsh = ctx.createLinearGradient(0, a0.y, 0, a0.y + u * 0.7);
  wsh.addColorStop(0, 'rgba(0,0,0,0.35)'); wsh.addColorStop(1, 'rgba(0,0,0,0)');
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
    const fl = { x: 2.55 - 0.15 * cs, y: 9.4 - 0.2 * cs, w: Math.min(5.7, 4.0 + 0.55 * cs), d: Math.min(5.4, 4.4 + 0.35 * cs) };
    dTiles(fl.x, fl.y, fl.w, fl.d, 6 + (state.clubSize || 0), 6 + (state.clubSize || 0), 'main', t, beat);
    dLabel(fl.x + fl.w / 2, fl.y - 0.35, 'DANCEFLOOR', 'rgba(255,255,255,0.5)', 10);
    // DJ-Lichtkegel (additiv)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const djp = detailProj(4.45, 8.4), fb = detailProj(fl.x + fl.w / 2, fl.y + fl.d);
    for (let i = 0; i < 3; i++) { const ang = Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.5;
      ctx.fillStyle = `hsla(${(t * 60 + i * 120) % 360},90%,65%,${dropActive() ? 0.14 : 0.07})`;
      ctx.beginPath(); ctx.moveTo(djp.x, djp.y - u * 0.5);
      ctx.lineTo(djp.x + Math.sin(ang) * W * 0.24 - W * 0.12, fb.y);
      ctx.lineTo(djp.x + Math.sin(ang) * W * 0.24 + W * 0.12, fb.y);
      ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // WC-Ausgang (linke Wand über der Bar → Richtung Klo wie in der Übersicht)
    { dShadow(0.3, 8.05, 1.05, 0.5);
      dBox(0.3, 8.05, 1.05, 0.5, u * 1.05, '#3b4a58', '#202a33', '#5a6b7e');
      const p = detailProj(0.8, 8.1); ctx.fillStyle = '#0c0f16';
      ctx.beginPath(); ctx.roundRect(p.x - u * 0.28, p.y - u * 0.95, u * 0.56, u * 0.88, 3); ctx.fill();
      ctx.fillStyle = 'rgba(120,180,220,0.5)'; ctx.beginPath(); ctx.roundRect(p.x - u * 0.28, p.y - u * 0.95, u * 0.56, u * 0.15, 3); ctx.fill();
      dLabel(1.55, 8.02, '🚻 WC', '#dfeaf5', 10); }
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
    dLabel(4.45, 6.95, '🎧 DJ', '#c9b6ff', 10);
    // DJ-Optik-Upgrades: je höher die DJ-Stufe, desto mehr Gear
    const djT = lvlTier(state.stations.dj || 0);
    if (djT >= 1) {   // LED-Wand mit Equalizer über dem Pult
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
    // === Bar (Top-Tier): Regal mit Backlight, Theke, Zapfhähne, Deko, Barkeeper ===
    dShadow(0.3, 8.85, 1.75, 4.35);
    dBox(0.3, 8.9, 0.55, 4.15, u * 1.25, '#3a2817', '#20130a', '#503a22');
    const barT = lvlTier(state.stations.bar || 0);
    { const a = detailProj(0.36, 9.05), c = detailProj(0.82, 12.9);
      const sg = ctx.createLinearGradient(a.x, a.y - u * 1.2, a.x, c.y);
      const al = 0.24 + barT * 0.13;
      sg.addColorStop(0, `rgba(90,190,255,${al})`); sg.addColorStop(1, `rgba(255,120,200,${al * 0.7})`);
      ctx.fillStyle = sg; ctx.fillRect(a.x, a.y - u * 1.2, c.x - a.x, c.y - (a.y - u * 1.2));
      if (barT >= 2) { ctx.strokeStyle = 'rgba(130,220,255,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(a.x, a.y - u * 1.2, c.x - a.x, c.y - (a.y - u * 1.2)); } }
    ctx.font = `${u * 0.32}px sans-serif`; ctx.textAlign = 'center';
    const shelf = ['🍾','🥃','🍷','🍸','🍶','🥂','🍾','🧉'];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) { const p = detailProj(0.44 + row * 0.26, 9.35 + i * 0.95); ctx.fillText(shelf[row * 4 + i], p.x, p.y - u * (1.2 - row * 0.42)); }
    dBox(0.9, 9.1, 1.05, 3.85, u * 0.58, '#7a5330', '#42300f', '#8f6338');
    { ctx.fillStyle = '#d8dde6'; for (let i = 0; i < 3; i++) { const p = detailProj(1.05, 9.55 + i * 0.5); ctx.fillRect(p.x - 2, p.y - u * 0.58 - 7, 4, 9); } }
    ctx.font = `${u * 0.32}px sans-serif`;
    const props = ['🍸','🍹','🧉','🍺','🍋'];
    for (let i = 0; i < 5; i++) { const p = detailProj(1.55, 9.4 + i * 0.66); ctx.fillText(props[i], p.x, p.y - u * 0.58); }
    dLabel(1.45, 8.6, '🍸 BAR', '#7fe6ff', 11);
    dPerson(1.3, 9.4, { s: 1.12, color: '#eef2f7', pants: '#1c2230', skin: '#f0b98c', hair: '#3a2617', bob: Math.sin(t * 2.5) * 2, groundZ: u * 0.58 });
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
    // Eingang: roter Teppich + AIRPORT + Türsteher (wächst mit Einlass-Stufe)
    const c1 = detailProj(3.6, 13.9), c2 = detailProj(5.4, 15.3), sp = (c2.x - c1.x) * 0.18;
    ctx.fillStyle = '#b3243a'; ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c1.y); ctx.lineTo(c2.x + sp, c2.y); ctx.lineTo(c1.x - sp, c2.y); ctx.closePath(); ctx.fill();
    dLabel(2.3, 14.3, '✈ AIRPORT', `hsl(${(t * 40) % 360},90%,65%)`, 11);
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
      ctx.fillText('✈ AIRPORT', sp.x, sp.y); ctx.textBaseline = 'alphabetic'; }
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
    const fl = { x: 12.2, y: 2.4, w: 4.4, d: 3.4 };
    dTiles(fl.x, fl.y, fl.w, fl.d, 5, 4, 'vip', t, beat);
    dLabel(fl.x + fl.w / 2, fl.y - 0.35, 'VIP DANCEFLOOR', 'rgba(255,215,120,0.6)', 10);
    dShadow(9.9, 0.9, 2.6, 1.0); dBox(9.9, 0.9, 2.6, 1.0, u * 0.55, '#8a6a3a', '#453218', '#b28a4a');
    dLabel(11.2, 0.5, '🍾 CHAMPAGNE', '#ffe9a8', 10);
    if (roomUnlocked('t2')) dPerson(11.2, 1.6, { s: 1.1, color: '#1c1c28', skin: '#f0b98c', hair: '#c98b2d', bob: Math.sin(t*2.2)*2, groundZ: u * 0.25 });
    for (const [ax, ay] of [[16.2,6.4],[17.3,2.4]]) { dShadow(ax-1.2, ay-0.5, 2.4, 1.0);
      dBox(ax-1.2, ay-0.5, 2.4, 1.0, u * 0.3, '#c24e72', '#7a2846', '#d4638a');            // Sitzfläche
      dBox(ax-1.2, ay-0.85, 2.4, 0.4, u * 0.75, '#a63a5c', '#611d33', '#c24e72'); }         // Lehne
    for (const [tx, ty] of [[13.2,5.5],[15.5,3.2]]) { dShadow(tx-0.35, ty-0.35, 0.7, 0.7);
      dBox(tx-0.35, ty-0.35, 0.7, 0.7, u * 0.6, '#3a2044', '#1f1026', '#4a2a55');
      const p=detailProj(tx,ty); ctx.font=`${u*0.5}px sans-serif`; ctx.textAlign='center'; ctx.fillText('🍾',p.x,p.y-u*0.6); }
  } else if (id === 'roof') {
    const fl = { x: 11.8, y: 10.8, w: 4.2, d: 3.2 };
    dTiles(fl.x, fl.y, fl.w, fl.d, 5, 4, 'roof', t, beat);
    dLabel(fl.x + fl.w / 2, fl.y - 0.35, 'SKY FLOOR', 'rgba(160,220,255,0.6)', 10);
    dShadow(9.9, 10.8, 2.6, 1.0); dBox(9.9, 10.8, 2.6, 1.0, u * 0.55, '#2f6f8a', '#183846', '#3f93b0');
    dLabel(11.2, 10.4, '🍸 SKYBAR', '#a8ecff', 10);
    // Pool (in den Boden eingelassen)
    dRect(A.pool.x-1.55, A.pool.y-1.15, 3.1, 2.3, '#1f4a6e', '#14324c', 12);
    dRect(A.pool.x-1.4, A.pool.y-1.0, 2.8, 2.0, '#2f7fd6', 'rgba(255,255,255,0.35)', 10);
    dLabel(A.pool.x, A.pool.y-1.35, '🏊 POOL', '#bfe6ff', 10);
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

// Zusammenhängender Grundriss: Gebäude + alle Räume + Gäste + Pins in Weltkoordinaten.
// Per Wisch schwenkt die Kamera (detailCam) durchs Gebäude — Wände sind Teil des Baus.
function drawClub(t, beat) {
  drawGrassBg();
  // Gebäude: Aussenwand-Ring + dunkler Innenboden (Flure zwischen den Räumen) — pannt mit
  const bb0 = detailProj(CLUB_BB.x0, CLUB_BB.y0), bb1 = detailProj(CLUB_BB.x1, CLUB_BB.y1);
  const bw = bb1.x - bb0.x, bh = bb1.y - bb0.y;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';                         // Gebäude-Schlagschatten
  ctx.beginPath(); ctx.roundRect(bb0.x + 8, bb0.y + 14, bw, bh, 20); ctx.fill();
  const wallGrad = ctx.createLinearGradient(0, bb0.y, 0, bb1.y);   // Aussenwand
  wallGrad.addColorStop(0, '#3c3552'); wallGrad.addColorStop(1, '#241f38');
  ctx.fillStyle = wallGrad;
  ctx.beginPath(); ctx.roundRect(bb0.x, bb0.y, bw, bh, 20); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; // heller Oberkanten-Bevel
  ctx.beginPath(); ctx.roundRect(bb0.x + 1.5, bb0.y + 1.5, bw - 3, bh - 3, 19); ctx.stroke();
  const wt = Math.max(9, dTileW() * 0.5);                     // Wanddicke
  ctx.fillStyle = '#181425';                                  // Innenboden (Beton/Flur)
  ctx.beginPath(); ctx.roundRect(bb0.x + wt, bb0.y + wt, bw - 2 * wt, bh - 2 * wt, 12); ctx.fill();
  ctx.save();                                                 // dezentes Fliesenraster
  ctx.beginPath(); ctx.roundRect(bb0.x + wt, bb0.y + wt, bw - 2 * wt, bh - 2 * wt, 12); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
  for (let gx = Math.ceil(CLUB_BB.x0); gx <= CLUB_BB.x1; gx++) { const p = detailProj(gx, 0); ctx.beginPath(); ctx.moveTo(p.x, bb0.y); ctx.lineTo(p.x, bb1.y); ctx.stroke(); }
  for (let gy = Math.ceil(CLUB_BB.y0); gy <= CLUB_BB.y1; gy++) { const p = detailProj(0, gy); ctx.beginPath(); ctx.moveTo(bb0.x, p.y); ctx.lineTo(bb1.x, p.y); ctx.stroke(); }
  ctx.restore();

  // Airport-Deko füllt die freien Gebäudeflächen (Concourse, Gepäckband, Sitze, Pflanzen)
  drawBuildingDecor(t);

  // Räume (Boden + Wände + Möbel) in Tiefen-Reihenfolge — hinten zuerst
  for (const id of ['klo', 't2', 'roof', 't1']) drawRoomDetail(id, t, beat);
  // Durchgänge über die Wände legen → öffnet sie zwischen anliegenden Räumen
  drawDoorways(t);

  // Performer auf 3D-Bühne im zugewiesenen Raum
  if (state.performer.unlocked && roomUnlocked(state.performer.room)) {
    const pid = state.performer.room, u = dTileW();
    const c = { t1:[6.2,9.0], t2:[15.0,5.2], roof:[13.5,14.5] }[pid] || [6,9];
    dShadow(c[0]-0.7, c[1]-0.7, 1.4, 1.4);
    dBox(c[0]-0.7, c[1]-0.7, 1.4, 1.4, u * 0.35, '#ff5e8a', '#a32e52', '#ff85b3');
    dPerson(c[0], c[1], { s: 1.15, color: '#ff4fa3', skin: '#f0b98c', hair: '#1a1a22', female: true, arms: beat*1.5, dancing: true, bob: Math.sin(beat*1.5)*3, groundZ: u * 0.35 });
  }

  // Gäste (alle sichtbaren im Gebäude), tiefensortiert nach Welt-y
  const gs = guests.filter(g => g.x >= CLUB_BB.x0 && g.x <= CLUB_BB.x1 && g.y >= CLUB_BB.y0 && g.y <= CLUB_BB.y1)
    .sort((a, b) => a.y - b.y);
  for (const g of gs) {
    const dancing = g.mode === 'act' && (g.act === 'dance' || g.act === 'vipdance' || g.act === 'roofbar');
    const bob = dancing ? Math.sin(beat + g.bobPhase) * (dropActive() ? 4 : 2.5) : 0;
    let emote = null;
    if (g.mode === 'act') {
      if (g.act === 'chat' && Math.sin(t * 2.5 + g.bobPhase) > 0.55) emote = '💬';
      else if (g.act === 'selfie') emote = '📸';
    }
    dPerson(g.x, g.y, { s: g.celeb ? 1.3 : g.vip ? 1.08 : 1, color: g.color, skin: g.skin, hair: g.hair, female: g.female,
      bob, arms: dancing ? beat + g.bobPhase : null, dancing, drink: g.mode === 'act' ? g.drink : null,
      emote, alpha: g.alpha, glow: g.celeb, star: g.celeb, bobPhase: g.bobPhase });
  }

  // Geld-Pins nur im hineingezoomten Raum (in der Karte kein Geld, nur Namen)
  if (zoomAmt > 0.5) {
    ctx.globalAlpha = Math.min(1, (zoomAmt - 0.5) * 2.2);
    for (const [stId, anchorId] of Object.entries(PIN_AT)) {
      const a = A[anchorId];
      if (!roomUnlocked(a.room)) continue;
      const amount = state.stationCash[stId] || 0;
      if (amount < 1) continue;
      const p = detailProj(a.x, a.y);
      drawPinAt(p.x, p.y - dTileW() * 1.05, amount, t, stId.length);
    }
    ctx.globalAlpha = 1;
  }
  // Raumnamen: in der Karte gross sichtbar, beim Reinzoomen ausblenden
  if (zoomAmt < 0.9) {
    ctx.globalAlpha = 1 - zoomAmt / 0.9;
    const fs = Math.max(13, mapScale() * 0.4);
    ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const id of ['t1', 'klo', 't2', 'roof']) {
      if (!roomUnlocked(id)) continue;   // gesperrte Räume beschriftet bereits ihr Schloss-Overlay
      const r = RM[id];
      const p = detailProj(r.x + r.w / 2, r.y + r.d / 2);
      const nm = r.name;
      const col = ACCENT[id] || '#fff';
      // Chip-Hintergrund für Lesbarkeit
      const tw = ctx.measureText(nm).width;
      ctx.fillStyle = 'rgba(10,7,20,0.55)';
      ctx.beginPath(); ctx.roundRect(p.x - tw / 2 - 10, p.y - fs * 0.7, tw + 20, fs * 1.4, fs * 0.7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(nm, p.x + 1, p.y + 1);
      ctx.fillStyle = col; ctx.fillText(nm, p.x, p.y);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }
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

export function renderFrame(now) {
  if (!ctx) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0.016;
  lastFrame = now;
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

  // Grundriss-Zoom animieren: Karte (nur Namen) ↔ Raum (Möbel + Geld)
  zoomAmt += (zoomTarget - zoomAmt) * k;
  if (zoomTarget === 0) {                    // zur Karte → auf Gebäudemitte zentrieren
    const c = bldCenter();
    detailCam.x += (c.x - detailCam.x) * k; detailCam.y += (c.y - detailCam.y) * k;
  } else if (zoomAmt < 0.985) {              // beim Reinzoomen → auf den Fokusraum ziehen
    const r = RM[planFocus];
    detailCam.x += (r.x + r.w / 2 - detailCam.x) * k; detailCam.y += (r.y + r.d / 2 - detailCam.y) * k;
  }
  clampPan();

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  updateGuests(dt);
  updateParticles(dt);
  incomeTimer += dt; if (incomeTimer > 0.25) { incomeTimer = 0; incomeCache = incomePerSec(); }

  drawGround();
  drawPlaza(t);

  // Räume (Boden/Wände/Deko) + Sammel-Liste für tiefen­sortierte Objekte
  const drawables = [];
  drawKlo(t);
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

  // Lock-Overlays über gesperrten Räumen
  if (!state.t2Unlocked) drawLockOverlay(RM.t2, 'Terminal 2 · VIP', 'Antippen zum Freischalten');
  if (!state.roofUnlocked) drawLockOverlay(RM.roof, 'Rooftop', state.t2Unlocked ? 'Antippen zum Freischalten' : 'Erst Terminal 2');

  drawCashPins(t);

  // Raum-Detailansicht (Top-Down) über die Iso-Übersicht blenden
  if (focusAmt > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, focusAmt * 1.2);
    drawClub(t, beat);
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

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

let canvas, ctx, W = 0, H = 0, DPR = 1;
let particles = [];
let startTime = performance.now();

// ---------------- Iso-Projektion & Kamera ----------------
// Welt in Tiles: x → rechts-unten, y → links-unten, z → hoch.
const TILE = { w: 32, h: 16, z: 15 };
const cam = { s: 1, ox: 0, oy: 0 };

function iso(x, y, z = 0) {
  return {
    x: cam.ox + (x - y) * TILE.w * 0.5 * cam.s,
    y: cam.oy + (x + y) * TILE.h * 0.5 * cam.s - z * TILE.z * cam.s,
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
  canvas.addEventListener('pointerdown', onTap);
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

// Kamera so skalieren/verschieben, dass die ganze Szene (Räume + Vorplatz) passt
function setupCamera() {
  cam.s = 1; cam.ox = 0; cam.oy = 0;
  // Extrempunkte der Welt inkl. Vorplatz vorne und Wandhöhe oben
  const pts = [
    iso(RM.klo.x - 0.6, RM.klo.y - 0.6, WALL_H + 0.6),  // hinten oben
    iso(RM.t2.x + RM.t2.w + 0.6, RM.t2.y - 0.6, WALL_H),// rechts hinten
    iso(RM.roof.x + RM.roof.w + 0.6, RM.roof.y + RM.roof.d + 0.6, 0), // rechts vorne
    iso(RM.t1.x - 1.4, RM.t1.y + RM.t1.d + 0.6, 0),     // links
    iso(ENTRY_OUT.x + 3.2, ENTRY_OUT.y + 1.4, 0),       // Vorplatz vorne unten
    iso(ENTRY_OUT.x - 3.2, ENTRY_OUT.y + 1.4, 0),
  ];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const c of pts) {
    minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
  }
  const padX = W * 0.03, padY = H * 0.03;
  const ZOOM = 1.12;   // etwas näher dran, damit der Club dominiert
  const s = Math.min((W - padX * 2) / (maxX - minX), (H - padY * 2) / (maxY - minY)) * ZOOM;
  cam.s = s;
  minX *= s; maxX *= s; minY *= s; maxY *= s;
  cam.ox = (W - (maxX - minX)) / 2 - minX;
  cam.oy = (H - (maxY - minY)) / 2 - minY + H * 0.03;   // vertikal zentriert, minimal tiefer
}

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

function onTap(e) {
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
  // Geld-Pins einsammeln (an den Konsum-Stationen)
  for (const [stId, anchorId] of Object.entries(PIN_AT)) {
    if ((state.stationCash[stId] || 0) < 1) continue;
    const a = A[anchorId];
    const s = iso(a.x, a.y, 1.15);
    if (Math.hypot(mx - s.x, my - s.y) < 30) {
      const amount = collectStation(stId);
      if (amount > 0 && onTapFeedback) onTapFeedback({ type: 'collect', x: e.clientX, y: e.clientY, amount });
      return;
    }
  }
  // Tap auf gesperrten Raum → passender Freischalt-Dialog
  for (const id of ['t2', 'roof']) {
    if (!roomUnlocked(id) && pointInQuad(mx, my, roomFloorQuad(RM[id]))) {
      if (onTapFeedback) onTapFeedback({ type: 'locked', room: id });
      return;
    }
  }
  // Sonst: kleiner Hype-Schub (optional)
  tapHype();
  spawnScreenParticle(mx, my, '🔥', 12, 0.8);
  if (onTapFeedback) onTapFeedback({ type: 'tap', x: e.clientX, y: e.clientY });
}

// ============================================================
//  Gäste-Simulation (Zustandsautomat auf Iso-Grid)
// ============================================================
let guests = [];
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function inRoom(r, mx = 0.6) { return { x: rnd(r.x + mx, r.x + r.w - mx), y: rnd(r.y + mx, r.y + r.d - mx) }; }

function targetGuestCount() {
  let base = 6 + Math.floor(totalLevels() / 7);
  if (state.roofUnlocked) base += 6; else if (state.t2Unlocked) base += 3;
  return Math.min(38, Math.floor(base * eventGuestMult()));
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
  if (state.roofUnlocked && r < 0.10) return 'roofbar';
  if (r < 0.40) return 'dance';
  if (r < 0.58) return 'bar';
  if (r < 0.70) return 'shots';
  if (r < 0.80) return 'wc';
  if (r < 0.87) return 'ward';
  if (r < 0.93 && state.t2Unlocked) return 'vipdance';
  return 'leave';
}

function actTarget(act) {
  switch (act) {
    case 'dance':    return inRoom({ x: 2.5, y: 9.5, w: 5, d: 4 });
    case 'vipdance': return inRoom({ x: 12.5, y: 2.5, w: 4, d: 3.5 });
    case 'roofbar':  return Math.random() < 0.5 ? { x: A.skybar.x + rnd(-0.8, 1.2), y: A.skybar.y + 0.9 }
                                                 : { x: A.pool.x + rnd(-1, 1), y: A.pool.y - 1 };
    case 'bar':      return { x: A.bar.x + 1.3, y: A.bar.y + rnd(-1.5, 1.5) };
    case 'shots':    return { x: A.shots.x - 1.1, y: A.shots.y + rnd(-1, 1) };
    case 'champ':    return { x: A.vipbar.x + rnd(-0.8, 1), y: A.vipbar.y + 1.3 };
    case 'sofa':     return Math.random() < 0.5 ? { x: A.tables.x + rnd(-0.8, 0.8), y: A.tables.y + 0.9 }
                                                : { x: A.chill.x + rnd(-0.8, 0.8), y: A.chill.y + 0.9 };
    case 'wc':       return { x: A.toilet.x + rnd(-0.5, 0.5), y: A.toilet.y + 1 };
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
  const t = actTarget(act);
  g.mode = 'walk';
  g.path = routeTo(g, t.x, t.y);
}
function actDuration(act) {
  switch (act) {
    case 'dance': case 'vipdance': return rnd(4, 9);
    case 'bar': case 'shots': case 'champ': case 'roofbar': return rnd(3.5, 7);
    case 'sofa': return rnd(5, 10);
    case 'wc': return rnd(2.5, 4.5);
    case 'ward': return rnd(1.5, 2.5);
    default: return 2;
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
      } else { g.x += dx / d * step; g.y += dy / d * step; }
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

// ---------------- Figuren (Iso-Billboard, detailliert) ----------------
function drawPerson(wx, wy, o = {}) {
  const s = (o.s || 1) * cam.s * 1.0;
  const p = iso(wx, wy, 0);
  const px = p.x, py = p.y - (o.lift || 0);
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

  // Accessoires
  if (o.headphones) {
    ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1.8 * s;
    ctx.beginPath(); ctx.arc(px, cy - 8 * s, 5 * s, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath(); ctx.arc(px - 4.4 * s, cy - 7.6 * s, 1.7 * s, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 4.4 * s, cy - 7.6 * s, 1.7 * s, 0, 7); ctx.fill();
  }
  if (o.shades) { ctx.fillStyle = '#111'; roundRectP(px - 3.4 * s, cy - 9 * s, 6.8 * s, 2 * s, 1); ctx.fill(); }
  ctx.restore();

  if (o.drink) {
    const tilt = Math.sin(performance.now() / 400 + (o.bobPhase || 0)) * 2;
    ctx.font = `${11 * s}px sans-serif`; ctx.textAlign = 'center';
    ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
    ctx.fillText(o.drink, px + 6.5 * s, cy - 2 * s - tilt);
    ctx.globalAlpha = 1;
  }
  if (o.star) { ctx.font = `${14 * s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('⭐', px, cy - 15 * s + bob); }
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

// ---------------- Frame ----------------
let lastFrame = 0;
let incomeCache = 0, incomeTimer = 0;

export function renderFrame(now) {
  if (!ctx) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0.016;
  lastFrame = now;
  const t = (now - startTime) / 1000;
  const bpm = dropActive() ? 160 : 126;
  const beat = t * (bpm / 60) * Math.PI;
  tickerX -= dt * 40 * cam.s;

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

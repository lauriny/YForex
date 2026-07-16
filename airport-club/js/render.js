// ============================================================
//  AIRPORT – Club Simulator · Pseudo-3D-Ansicht von oben
//  (Cartoon-Tycoon-Look: Gebäude mit aufgeschnittenem Dach,
//   Wände/Möbel mit Tiefe, Gäste mit echtem Verhalten)
// ============================================================
import { state, totalLevels, dropActive, tapCeleb, tapHype } from './game.js';

let canvas, ctx, W = 0, H = 0, DPR = 1;
let particles = [];
let startTime = performance.now();

// ---------------- Grundriss (normierte Koordinaten) ----------------
const L = {
  // Gebäude
  bld:   { x: 0.05, y: 0.05, w: 0.90, h: 0.76 },
  wallT: 0.016,                                   // Wanddicke
  split: 0.345,                                   // Trennwand T1/T2 (y)
  stair: { x: 0.66, w: 0.13 },                    // Durchgang zur VIP-Etage
  entry: { x: 0.42, w: 0.16 },                    // Eingangstür unten

  // Terminal 1 (unten)
  dj:    { x: 0.36, y: 0.375, w: 0.28, h: 0.062 },
  floor1:{ x: 0.295, y: 0.47, w: 0.41, h: 0.245 },
  bar:   { x: 0.085, y: 0.42, w: 0.125, h: 0.26 },
  shots: { x: 0.795, y: 0.44, w: 0.115, h: 0.16 },
  wc:    { x: 0.085, y: 0.655, w: 0.15, h: 0.11 },
  ward:  { x: 0.73, y: 0.665, w: 0.175, h: 0.095 },

  // Terminal 2 (oben, VIP)
  floor2:{ x: 0.375, y: 0.115, w: 0.29, h: 0.165 },
  champ: { x: 0.095, y: 0.10, w: 0.19, h: 0.075 },
  sofaR1:{ x: 0.72, y: 0.11, w: 0.17, h: 0.05 },
  sofaR2:{ x: 0.72, y: 0.215, w: 0.17, h: 0.05 },
  sofaL: { x: 0.10, y: 0.24, w: 0.16, h: 0.05 },
};

const GUEST_COLORS = ['#e74c8b', '#4f9cf7', '#f7b32b', '#42d6a4', '#b06df7', '#f76d4f', '#4fd7f7', '#95e04a'];
const SKIN = ['#ffd9b3', '#f0b98c', '#c68a53', '#8c5a33'];
const HAIR = ['#2b1c10', '#5a3617', '#c98b2d', '#1a1a22', '#7a4a86', '#b8452c'];
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
}

// ---------------- Interaktion ----------------
let onTapFeedback = null;
export function setTapFeedback(cb) { onTapFeedback = cb; }

function onTap(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / W;
  const y = (e.clientY - rect.top) / H;
  // Promi zuerst (große Trefferfläche)
  if (state.celeb) {
    const c = guests.find(g => g.celeb);
    if (c && Math.hypot((x - c.x) * W, (y - c.y) * H) < 44) {
      const r = tapCeleb();
      if (r && onTapFeedback) onTapFeedback({ type: 'celeb', x: e.clientX, y: e.clientY, ...r });
      return;
    }
  }
  // Tap auf gesperrtes Terminal 2 → Freischalt-Dialog
  if (!state.t2Unlocked && y < L.split && y > L.bld.y && x > L.bld.x && x < L.bld.x + L.bld.w) {
    if (onTapFeedback) onTapFeedback({ type: 'locked' });
    return;
  }
  const gain = tapHype();
  particles.push({ x, y, vy: -0.06, life: 1, txt: '💶', size: 13 });
  if (onTapFeedback) onTapFeedback({ type: 'tap', x: e.clientX, y: e.clientY, gain });
}

// ============================================================
//  Gäste-Simulation (Zustandsautomat)
//  Modi: enter → (dance | bar | shots | wc | ward | vip…) → leave
// ============================================================
let guests = [];

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function targetGuestCount() {
  return Math.min(30, 5 + Math.floor(totalLevels() / 8));
}

function spawnGuest(celeb = false) {
  const vip = !celeb && state.t2Unlocked && Math.random() < 0.4;
  const g = {
    x: L.entry.x + L.entry.w / 2 + rnd(-0.02, 0.02),
    y: 0.93,
    color: celeb ? '#ffd700' : vip ? pick(['#e6b800', '#d4941e', '#c9a227']) : pick(GUEST_COLORS),
    skin: pick(SKIN),
    hair: pick(HAIR),
    speed: rnd(0.045, 0.075),
    bobPhase: Math.random() * Math.PI * 2,
    vip, celeb,
    mode: 'walk',
    act: 'dance',
    actT: 0,
    drink: null,
    alpha: 1,
    path: [],
  };
  // erst rein durch die Tür, dann zur Garderobe oder direkt tanzen
  const inside = { x: L.entry.x + L.entry.w / 2, y: 0.755 };
  g.path = [inside];
  if (!celeb && Math.random() < 0.35) {
    g.path.push({ x: L.ward.x - 0.03, y: L.ward.y + L.ward.h / 2 });
    g.afterPath = 'ward';
  } else {
    pushActivity(g, celeb || (vip && Math.random() < 0.75) ? (vip ? 'vipdance' : 'dance') : 'dance');
  }
  guests.push(g);
  return g;
}

// Wege über den Treppen-Durchgang routen, wenn Raumgrenze gekreuzt wird
function routeTo(g, tx, ty) {
  const door = { x: L.stair.x + L.stair.w / 2, y: L.split };
  const crossing = (g.y < L.split) !== (ty < L.split);
  const path = [];
  if (crossing) {
    path.push({ x: door.x, y: door.y + (g.y > L.split ? 0.03 : -0.03) });
    path.push({ x: door.x, y: door.y + (ty > L.split ? 0.05 : -0.05) });
  }
  path.push({ x: tx, y: ty });
  return path;
}

function pushActivity(g, act) {
  g.act = act;
  let tx, ty;
  switch (act) {
    case 'dance':
      tx = rnd(L.floor1.x + 0.02, L.floor1.x + L.floor1.w - 0.02);
      ty = rnd(L.floor1.y + 0.02, L.floor1.y + L.floor1.h - 0.02);
      break;
    case 'vipdance':
      tx = rnd(L.floor2.x + 0.02, L.floor2.x + L.floor2.w - 0.02);
      ty = rnd(L.floor2.y + 0.02, L.floor2.y + L.floor2.h - 0.02);
      break;
    case 'bar':      // rechts an der Theke anstehen
      tx = L.bar.x + L.bar.w + 0.03;
      ty = rnd(L.bar.y + 0.03, L.bar.y + L.bar.h - 0.03);
      break;
    case 'shots':
      tx = L.shots.x - 0.03;
      ty = rnd(L.shots.y + 0.02, L.shots.y + L.shots.h - 0.02);
      break;
    case 'champ':    // Champagner-Bar (VIP)
      tx = rnd(L.champ.x + 0.02, L.champ.x + L.champ.w - 0.02);
      ty = L.champ.y + L.champ.h + 0.035;
      break;
    case 'sofa': {
      const s = pick([L.sofaR1, L.sofaR2, L.sofaL]);
      tx = rnd(s.x + 0.02, s.x + s.w - 0.02);
      ty = s.y + 0.022;
      break;
    }
    case 'wc':
      tx = L.wc.x + L.wc.w + 0.025;   // erst zur Tür …
      ty = L.wc.y + L.wc.h / 2;
      break;
    case 'ward':
      tx = L.ward.x - 0.03;
      ty = L.ward.y + L.ward.h / 2;
      break;
    case 'leave':
      tx = L.entry.x + L.entry.w / 2;
      ty = 0.87;
      break;
  }
  g.mode = 'walk';
  g.path = routeTo(g, tx, ty);
}

function nextActivity(g) {
  if (g.celeb) { pushActivity(g, 'dance'); return; }
  const r = Math.random();
  if (g.vip && state.t2Unlocked) {
    if (r < 0.35) pushActivity(g, 'vipdance');
    else if (r < 0.55) pushActivity(g, 'champ');
    else if (r < 0.72) pushActivity(g, 'sofa');
    else if (r < 0.82) pushActivity(g, 'dance');
    else if (r < 0.92) pushActivity(g, 'wc');
    else pushActivity(g, 'leave');
  } else {
    if (r < 0.42) pushActivity(g, 'dance');
    else if (r < 0.60) pushActivity(g, 'bar');
    else if (r < 0.70) pushActivity(g, 'shots');
    else if (r < 0.80) pushActivity(g, 'wc');
    else if (r < 0.86) pushActivity(g, 'ward');
    else if (r < 0.93 && state.t2Unlocked) pushActivity(g, 'vipdance');
    else pushActivity(g, 'leave');
  }
}

function actDuration(act) {
  switch (act) {
    case 'dance': case 'vipdance': return rnd(4, 10);
    case 'bar': case 'shots': case 'champ': return rnd(4, 8);
    case 'sofa': return rnd(5, 10);
    case 'wc': return rnd(2.5, 4.5);
    case 'ward': return rnd(1.5, 2.5);
    default: return 2;
  }
}

function updateGuests(dt) {
  const want = targetGuestCount();

  // Nachschub: Gäste kommen einzeln durch den Eingang
  const alive = guests.filter(g => !g.celeb).length;
  if (alive < want && Math.random() < dt * 1.6) spawnGuest();
  if (alive > want + 3) {
    const g = guests.find(g => !g.celeb && g.act !== 'leave');
    if (g) pushActivity(g, 'leave');
  }

  // Promi-Gast synchron zum Spiel-State halten
  const hasCeleb = guests.some(g => g.celeb);
  if (state.celeb && !hasCeleb) spawnGuest(true);
  if (!state.celeb && hasCeleb) guests = guests.filter(g => !g.celeb);

  for (let i = guests.length - 1; i >= 0; i--) {
    const g = guests[i];
    const speedMult = dropActive() ? 1.6 : 1;

    if (g.mode === 'walk') {
      const t = g.path[0];
      if (!t) { g.mode = 'act'; g.actT = actDuration(g.act); continue; }
      const dx = t.x - g.x, dy = t.y - g.y;
      const d = Math.hypot(dx, dy);
      const step = g.speed * speedMult * dt;
      if (d < step) {
        g.x = t.x; g.y = t.y;
        g.path.shift();
        if (g.path.length === 0) {
          if (g.afterPath) { g.act = g.afterPath; g.afterPath = null; }
          if (g.act === 'leave' ) { guests.splice(i, 1); continue; }
          g.mode = 'act';
          g.actT = actDuration(g.act);
          if (g.act === 'bar') g.drink = pick(DRINKS_T1);
          if (g.act === 'shots') g.drink = '🥃';
          if (g.act === 'champ' || g.act === 'sofa') g.drink = pick(DRINKS_T2);
        }
      } else {
        g.x += dx / d * step;
        g.y += dy / d * step;
      }
    } else { // act
      g.actT -= dt;
      // im WC: kurz "verschwinden"
      if (g.act === 'wc') {
        const inWC = g.actT < actDuration('wc') - 0.5;
        g.alpha = inWC ? 0.25 : 1;
      } else g.alpha = 1;
      if (g.actT <= 0) {
        g.drink = null;
        g.alpha = 1;
        if (g.celeb) pushActivity(g, 'dance');
        else nextActivity(g);
      }
    }
  }
}

// ============================================================
//  Zeichnen · Pseudo-3D-Helfer
// ============================================================
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// Quader in 3/4-Ansicht: Grundfläche (x,y,w,h in Weltkoordinaten 0..1), z = Höhe px
function box(nx, ny, nw, nh, z, topColor, frontColor, r = 6, stroke) {
  const x = nx * W, y = ny * H, w = nw * W, h = nh * H;
  // Frontseite
  ctx.fillStyle = frontColor;
  rr(x, y + h - z - r, w, z + r, r); ctx.fill();
  // Deckfläche
  ctx.fillStyle = topColor;
  rr(x, y - z, w, h, r); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; rr(x, y - z, w, h, r); ctx.stroke(); }
}

function shadow(nx, ny, rx, ry = rx * 0.45) {
  ctx.fillStyle = 'rgba(20,10,40,0.25)';
  ctx.beginPath();
  ctx.ellipse(nx * W, ny * H, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Figur (stehend, von schräg oben): Schatten, Körper-Kapsel, Kopf, Haare
function drawPerson(nx, ny, o = {}) {
  const s = o.s || 1;
  const px = nx * W, py = ny * H + (o.bob || 0);
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  shadow(nx, ny + 0.004, 6 * s);
  if (o.glow) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 16; }
  // Arme beim Tanzen (hinter dem Körper)
  if (o.arms) {
    ctx.strokeStyle = o.color;
    ctx.lineWidth = 2.6 * s;
    ctx.lineCap = 'round';
    const a = Math.sin(o.arms) * 4 * s;
    ctx.beginPath();
    ctx.moveTo(px - 4 * s, py - 4 * s); ctx.lineTo(px - 7.5 * s, py - 8 * s - a);
    ctx.moveTo(px + 4 * s, py - 4 * s); ctx.lineTo(px + 7.5 * s, py - 8 * s + a);
    ctx.stroke();
  }
  // Körper
  ctx.fillStyle = o.color;
  rr(px - 4.4 * s, py - 7 * s, 8.8 * s, 12.5 * s, 4.4 * s); ctx.fill();
  // Kopf
  ctx.fillStyle = o.skin || '#ffd9b3';
  ctx.beginPath(); ctx.arc(px, py - 10.5 * s, 4.6 * s, 0, Math.PI * 2); ctx.fill();
  // Haare (kleine Kappe von oben)
  ctx.fillStyle = o.hair || '#2b1c10';
  ctx.beginPath(); ctx.arc(px, py - 11.6 * s, 3.4 * s, Math.PI, 2 * Math.PI); ctx.fill();
  // Kopfhörer (DJ)
  if (o.headphones) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath(); ctx.arc(px, py - 10.5 * s, 5.4 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(px - 4.8 * s, py - 10 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 4.8 * s, py - 10 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
  }
  // Sonnenbrille (Türsteher)
  if (o.shades) {
    ctx.fillStyle = '#111';
    rr(px - 3.6 * s, py - 11.6 * s, 7.2 * s, 2.2 * s, 1); ctx.fill();
  }
  ctx.restore();
  // Getränk in der Hand (leicht zum Mund kippend)
  if (o.drink) {
    const tilt = Math.sin(performance.now() / 400 + (o.bobPhase || 0)) * 2;
    ctx.font = `${10 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
    ctx.fillText(o.drink, px + 6.5 * s, py - 4 * s - tilt);
    ctx.globalAlpha = 1;
  }
  if (o.star) {
    ctx.font = `${13 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⭐', px, py - 20 * s);
  }
}

// ============================================================
//  Szene
// ============================================================
function drawOutside(t) {
  // Wiese im hellen Cartoon-Look mit Schachbrett-Schimmer
  ctx.fillStyle = '#7ec24f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const cell = W / 8;
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < Math.ceil(H / cell); j++)
      if ((i + j) % 2 === 0) ctx.fillRect(i * cell, j * cell, cell, cell);

  // Straße unten
  ctx.fillStyle = '#4c4f5e';
  ctx.fillRect(0, H * 0.945, W, H * 0.055);
  ctx.fillStyle = '#e8e8e8';
  for (let i = 0; i < 7; i++) ctx.fillRect((i * 0.15 + 0.03) * W, H * 0.968, W * 0.06, 2.5);
  // Gehweg
  ctx.fillStyle = '#b9b3a5';
  ctx.fillRect(0, H * 0.915, W, H * 0.03);

  // Bäume & Büsche
  const bush = (nx, ny, r) => {
    shadow(nx, ny + 0.008, r * 1.1);
    ctx.fillStyle = '#3f9142';
    ctx.beginPath(); ctx.arc(nx * W, ny * H, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#54ad55';
    ctx.beginPath(); ctx.arc(nx * W - r * 0.3, ny * H - r * 0.35, r * 0.55, 0, Math.PI * 2); ctx.fill();
  };
  bush(0.025, 0.12, 9); bush(0.975, 0.2, 11); bush(0.02, 0.5, 10);
  bush(0.978, 0.55, 9); bush(0.03, 0.9, 10); bush(0.97, 0.9, 11);

  // Roter Teppich vom Gehweg zur Tür
  const ex = (L.entry.x + L.entry.w / 2) * W;
  const ew = L.entry.w * 0.7 * W;
  ctx.fillStyle = '#c22b3f';
  ctx.beginPath();
  ctx.moveTo(ex - ew / 2, L.bld.y === 0 ? 0 : (L.bld.y + L.bld.h) * H - 2);
  ctx.lineTo(ex + ew / 2, (L.bld.y + L.bld.h) * H - 2);
  ctx.lineTo(ex + ew * 0.8, H * 0.945);
  ctx.lineTo(ex - ew * 0.8, H * 0.945);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(ex - ew / 2, (L.bld.y + L.bld.h) * H, ew, 2.5);

  // Absperrpfosten mit Kordel
  for (const side of [-1, 1]) {
    for (const dy of [0.845, 0.885]) {
      const bx = ex + side * ew * 0.75;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(bx, dy * H, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a6f4d';
      ctx.fillRect(bx - 1, dy * H, 2, 7);
    }
  }

}

function drawBuilding() {
  const b = L.bld;
  const z = 12; // Wandhöhe in px
  // Gebäudeschatten
  ctx.fillStyle = 'rgba(20,30,10,0.25)';
  rr(b.x * W + 6, b.y * H + 8, b.w * W, b.h * H, 18); ctx.fill();
  // Außenwand (Deckfläche des Mauerrings)
  box(b.x, b.y, b.w, b.h, z, '#e8d5b8', '#b39a76', 16, '#8a6f4d');
  // Innenboden Terminal 1 (dunkler Clubboden)
  const ix = b.x + L.wallT, iw = b.w - L.wallT * 2;
  ctx.fillStyle = '#463a72';
  rr(ix * W, (L.split + 0.012) * H, iw * W, (b.y + b.h - L.split - 0.012 - L.wallT) * H, 8);
  ctx.fill();
  // Innenboden Terminal 2 (VIP: dunkles Plum)
  ctx.fillStyle = '#3d1f42';
  rr(ix * W, (b.y + L.wallT - 0.012) * H + 0, iw * W, (L.split - b.y - L.wallT) * H, 8);
  ctx.fill();

  // Trennwand mit Treppen-Durchgang
  ctx.fillStyle = '#e8d5b8';
  const wy = L.split * H - 8, wh = 0.024 * H + 8;
  rr(ix * W, wy, (L.stair.x - ix) * W, wh, 4); ctx.fill();
  rr((L.stair.x + L.stair.w) * W, wy, (ix + iw - L.stair.x - L.stair.w) * W, wh, 4); ctx.fill();
  ctx.fillStyle = '#b39a76';
  rr(ix * W, wy + wh - 4, (L.stair.x - ix) * W, 6, 3); ctx.fill();
  rr((L.stair.x + L.stair.w) * W, wy + wh - 4, (ix + iw - L.stair.x - L.stair.w) * W, 6, 3); ctx.fill();
  // Stufen im Durchgang
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#6b5a94' : '#7d6ba8';
    rr((L.stair.x + 0.01) * W, wy + i * (wh / 4), (L.stair.w - 0.02) * W, wh / 4 + 1, 2);
    ctx.fill();
  }

  // Eingangstür (Lücke in der Südwand) + Vordach
  const ex = L.entry.x * W, ew = L.entry.w * W;
  const by = (b.y + b.h) * H;
  ctx.fillStyle = '#2c2350';
  rr(ex, by - 14, ew, 16, 4); ctx.fill();      // dunkle Türöffnung
  ctx.fillStyle = '#8b5cf6';
  rr(ex - 6, by - 20, ew + 12, 8, 4); ctx.fill(); // Vordach lila
  ctx.fillStyle = '#6d3fd4';
  rr(ex - 6, by - 13, ew + 12, 4, 2); ctx.fill();

  // Neon-Schild an der Frontwand (links neben dem Eingang)
  const t = (performance.now() - startTime) / 1000;
  const signX = (b.x + L.entry.x) / 2;
  ctx.font = `800 ${Math.min(15, W * 0.036)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `hsla(${(t * 40) % 360}, 90%, 65%, 1)`;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10;
  ctx.fillText('✈ AIRPORT', signX * W, by - 3);
  ctx.shadowBlur = 0;
}

function drawTerminal1(t, beat) {
  // --- Tanzfläche: pulsierende Neon-Kacheln ---
  const f = L.floor1;
  const cols = 6, rows = 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const hue = ((i + j) * 55 + t * 90) % 360;
      const pulse = 0.5 + 0.5 * Math.sin(beat + i + j);
      ctx.fillStyle = `hsla(${hue}, 85%, ${dropActive() ? 52 + pulse * 16 : 36 + pulse * 12}%, 0.95)`;
      rr((f.x + i * f.w / cols) * W + 1, (f.y + j * f.h / rows) * H + 1,
         f.w / cols * W - 2, f.h / rows * H - 2, 4);
      ctx.fill();
    }
  }
  // Rand der Tanzfläche
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  rr(f.x * W - 2, f.y * H - 2, f.w * W + 4, f.h * H + 4, 6); ctx.stroke();

  // --- DJ-Bühne (Podest an der Trennwand) ---
  const d = L.dj;
  box(d.x, d.y, d.w, d.h, 8, '#37295e', '#241a40', 6, '#5a4a8a');
  // Mischpult
  box(d.x + 0.05, d.y + 0.012, d.w - 0.1, d.h - 0.028, 6, '#5a4a9a', '#3a2f68', 4);
  // Plattenteller
  for (const dx of [0.35, 0.65]) {
    ctx.fillStyle = '#1c1535';
    ctx.beginPath();
    ctx.arc((d.x + d.w * dx) * W, (d.y + d.h * 0.42) * H - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc((d.x + d.w * dx) * W, (d.y + d.h * 0.42) * H - 6, 5, t * 4, t * 4 + Math.PI * 1.4);
    ctx.stroke();
  }
  // Boxen links & rechts, Membran pulsiert
  for (const bx of [d.x - 0.055, d.x + d.w + 0.012]) {
    box(bx, d.y + 0.004, 0.045, d.h - 0.01, 10, '#1a1430', '#0f0b20', 4);
    ctx.fillStyle = `rgba(170,130,255,${0.45 + 0.4 * Math.abs(Math.sin(beat))})`;
    ctx.beginPath();
    ctx.arc((bx + 0.0225) * W, (d.y + d.h / 2) * H - 4, 4.5 + Math.abs(Math.sin(beat)) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // DJ hinter dem Pult
  drawPerson(0.5, d.y + 0.012, {
    s: 1.15, color: '#3b2f7a', skin: '#f0b98c', hair: '#1a1a22',
    bob: Math.sin(beat) * 1.6, headphones: true, arms: beat,
  });

  // --- Lichtkegel über der Tanzfläche ---
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ang = Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.55;
    ctx.fillStyle = `hsla(${(t * 60 + i * 120) % 360}, 90%, 65%, ${dropActive() ? 0.16 : 0.08})`;
    ctx.beginPath();
    ctx.moveTo(W / 2, (d.y + d.h) * H);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.32 - W * 0.08, (f.y + f.h) * H);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.32 + W * 0.08, (f.y + f.h) * H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // --- Bar links (Theke mit Tiefe, Flaschenregal, Hocker) ---
  const b = L.bar;
  box(b.x - 0.045, b.y, 0.04, b.h, 14, '#4a3320', '#33220f', 4);   // Flaschenregal an der Wand
  const bottles = ['🍾', '🥃', '🍷', '🍹', '🧉'];
  ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {                                     // Flaschen
    ctx.fillText(bottles[i], (b.x - 0.025) * W, (b.y + 0.03 + i * (b.h - 0.05) / 4) * H - 12);
  }
  box(b.x, b.y, b.w, b.h, 10, '#6b4a2f', '#4a3320', 6, '#33220f'); // Theke
  ctx.fillStyle = 'rgba(255,255,255,0.12)';                        // Thekenglanz
  rr(b.x * W + 3, b.y * H - 8, b.w * W - 6, 4, 2); ctx.fill();
  for (let i = 0; i < 4; i++) {                                     // Barhocker
    const hy = b.y + 0.028 + i * (b.h - 0.05) / 3;
    shadow(b.x + b.w + 0.028, hy + 0.004, 4);
    ctx.fillStyle = '#a2452f';
    ctx.beginPath(); ctx.arc((b.x + b.w + 0.028) * W, hy * H, 4, 0, Math.PI * 2); ctx.fill();
  }
  // Barkeeper (am Kopfende hinter der Theke)
  drawPerson(b.x + b.w / 2, b.y - 0.008, {
    s: 1.0, color: '#f5f0e6', skin: '#f0b98c', hair: '#5a3617',
    bob: Math.sin(t * 2.5) * 1.2,
  });

  // --- Shot-Bar rechts ---
  const s = L.shots;
  box(s.x, s.y, s.w, s.h, 9, '#5d2a70', '#41224d', 6, '#2c1535');
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🥃', (s.x + s.w * 0.3) * W, s.y * H + s.h * H * 0.4 - 9);
  ctx.fillText('🥃', (s.x + s.w * 0.7) * W, s.y * H + s.h * H * 0.6 - 9);
  ctx.fillStyle = `hsla(${(t * 80) % 360}, 80%, 65%, 0.9)`;
  ctx.font = `800 ${Math.max(7, W * 0.017)}px system-ui, sans-serif`;
  ctx.fillText('SHOTS', (s.x + s.w / 2) * W, s.y * H - 12);

  // --- WC unten links (kleiner Raum) ---
  const w = L.wc;
  box(w.x, w.y, w.w, w.h, 10, '#7a8fa5', '#5a6b7e', 6, '#46545f');
  ctx.fillStyle = '#2c3540';
  rr((w.x + w.w) * W - 4, (w.y + w.h * 0.3) * H, 6, w.h * 0.4 * H, 2); ctx.fill(); // Tür
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(9, W * 0.024)}px system-ui, sans-serif`;
  ctx.fillText('WC', (w.x + w.w / 2) * W, (w.y + w.h / 2) * H - 4);
  ctx.font = '9px sans-serif';
  ctx.fillText('🚻', (w.x + w.w / 2) * W, (w.y + w.h / 2) * H + 7);

  // --- Garderobe unten rechts ---
  const g = L.ward;
  box(g.x, g.y, g.w, g.h, 9, '#8a5c9e', '#6b4080', 6, '#4d2c5e');
  ctx.font = '10px sans-serif';
  for (let i = 0; i < 4; i++)
    ctx.fillText('🧥', (g.x + 0.02 + i * (g.w - 0.04) / 3) * W, (g.y + g.h / 2) * H - 6);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(7, W * 0.016)}px system-ui, sans-serif`;
  ctx.fillText('GARDEROBE', (g.x + g.w / 2) * W, g.y * H - 12);

  // Türsteher am Eingang (draußen, neben dem Teppich)
  drawPerson(L.entry.x + L.entry.w + 0.05, 0.845, {
    s: 1.2, color: '#22222e', skin: '#c68a53', hair: '#1a1a22', shades: true,
  });
}

function drawTerminal2(t, beat) {
  const b = L.bld;
  // --- goldene VIP-Tanzfläche ---
  const f = L.floor2;
  const cols = 5, rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const pulse = 0.5 + 0.5 * Math.sin(beat + i * j);
      const warm = 38 + ((i + j) % 3) * 10;
      ctx.fillStyle = `hsla(${warm}, 88%, ${28 + pulse * 20}%, 0.95)`;
      rr((f.x + i * f.w / cols) * W + 1, (f.y + j * f.h / rows) * H + 1,
         f.w / cols * W - 2, f.h / rows * H - 2, 4);
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(255,215,0,0.4)';
  ctx.lineWidth = 2;
  rr(f.x * W - 2, f.y * H - 2, f.w * W + 4, f.h * H + 4, 6); ctx.stroke();

  // --- Champagner-Bar ---
  const c = L.champ;
  box(c.x, c.y, c.w, c.h, 10, '#8a6a3a', '#5e4423', 6, '#453218');
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🍾', (c.x + c.w * 0.25) * W, (c.y + c.h * 0.5) * H - 8);
  ctx.fillText('🥂', (c.x + c.w * 0.6) * W, (c.y + c.h * 0.5) * H - 8);
  ctx.fillText('🍸', (c.x + c.w * 0.85) * W, (c.y + c.h * 0.5) * H - 8);
  // VIP-Barkeeper
  if (state.t2Unlocked) {
    drawPerson(c.x + c.w / 2, c.y + 0.01, {
      s: 0.95, color: '#1c1c28', skin: pick(SKIN), hair: '#c98b2d',
      bob: Math.sin(t * 2.2) * 1.1,
    });
  }

  // --- Sofas (Samt mit Rückenlehne) ---
  for (const s of [L.sofaR1, L.sofaR2, L.sofaL]) {
    box(s.x, s.y - 0.012, s.w, 0.016, 8, '#a63a5c', '#7a2440', 5);  // Lehne
    box(s.x, s.y, s.w, s.h, 6, '#c24e72', '#943353', 6);            // Sitzfläche
  }

  // --- Bottle-Service-Tische mit Wunderkerzen ---
  for (const [tx, ty] of [[0.33, 0.30], [0.68, 0.31]]) {
    shadow(tx, ty + 0.008, 9);
    ctx.fillStyle = '#3a2044';
    ctx.beginPath(); ctx.arc(tx * W, ty * H - 4, 9, 0, Math.PI * 2); ctx.fill();
    ctx.font = '10px sans-serif';
    ctx.fillText('🍾', tx * W, ty * H - 6);
    if (state.t2Unlocked && Math.random() < 0.25) {
      particles.push({ x: tx + rnd(-0.01, 0.01), y: ty - 0.03, vy: -0.09, life: 0.55, txt: '✨', size: 8 });
    }
  }

  // Schriftzug
  ctx.fillStyle = '#ffd700';
  ctx.font = `800 ${Math.max(8, W * 0.02)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
  ctx.fillText('✦ TERMINAL 2 · VIP ✦', W / 2, (b.y + 0.045) * H);
  ctx.shadowBlur = 0;
}

function drawT2Lock(t) {
  const b = L.bld;
  const ix = b.x + L.wallT, iw = b.w - L.wallT * 2;
  ctx.fillStyle = 'rgba(12,8,24,0.72)';
  rr(ix * W, (b.y + 0.004) * H, iw * W, (L.split - b.y - 0.004) * H, 8);
  ctx.fill();
  // Absperrband am Treppenaufgang
  ctx.save();
  ctx.translate((L.stair.x + L.stair.w / 2) * W, L.split * H + 2);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#f7c625';
  ctx.fillRect(-L.stair.w * W * 0.7, -4, L.stair.w * W * 1.4, 8);
  ctx.fillStyle = '#222';
  ctx.font = '700 6px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GESPERRT · GESPERRT', 0, 2);
  ctx.restore();
  // Schloss + Hinweis
  ctx.textAlign = 'center';
  const bob = Math.sin(t * 2) * 2;
  ctx.font = `${Math.min(34, W * 0.085)}px sans-serif`;
  ctx.fillText('🔒', W / 2, (b.y + (L.split - b.y) * 0.48) * H + bob);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.min(13, W * 0.032)}px system-ui, sans-serif`;
  ctx.fillText('Terminal 2 · VIP-Etage', W / 2, (b.y + (L.split - b.y) * 0.68) * H);
  ctx.fillStyle = '#ffd93c';
  ctx.font = `700 ${Math.min(11, W * 0.027)}px system-ui, sans-serif`;
  ctx.fillText('Zum Freischalten antippen', W / 2, (b.y + (L.split - b.y) * 0.82) * H);
}

// ---------------- Partikel ----------------
export function spawnMoneyParticle(nx, ny) {
  particles.push({ x: nx, y: ny, vy: -0.06, life: 1, txt: '💶', size: 13 });
}

function ambientParticles(dt) {
  if (Math.random() < dt * (dropActive() ? 4 : 0.9) && guests.length) {
    const g = pick(guests);
    particles.push({ x: g.x, y: g.y - 0.05, vy: -0.05, life: 1, txt: '+€', size: 11, color: '#d7ffd9' });
  }
  if (dropActive() && Math.random() < dt * 12) {
    particles.push({
      x: Math.random(), y: -0.02, vy: 0.15 + Math.random() * 0.2, life: 2.2,
      txt: pick(['🎉', '✨', '💜', '🎊']), size: 12 + Math.random() * 8, fall: true,
    });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.y += p.vy * dt;
    p.life -= dt * (p.fall ? 0.45 : 1);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---------------- Frame ----------------
let lastFrame = 0;

export function renderFrame(now) {
  if (!ctx) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0.016;
  lastFrame = now;
  const t = (now - startTime) / 1000;
  const bpm = dropActive() ? 160 : 126;
  const beat = t * (bpm / 60) * Math.PI;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  updateGuests(dt);
  ambientParticles(dt);

  drawOutside(t);
  drawBuilding();
  drawTerminal2(t, beat);
  drawTerminal1(t, beat);

  // Gäste (nach y sortiert → Pseudo-Tiefe), gesperrter VIP-Bereich hat keine
  const sorted = [...guests].sort((a, b) => a.y - b.y);
  for (const g of sorted) {
    const dancing = g.mode === 'act' && (g.act === 'dance' || g.act === 'vipdance');
    const bob = dancing ? Math.sin(beat + g.bobPhase) * (dropActive() ? 3.5 : 2.2) : 0;
    drawPerson(g.x, g.y, {
      s: g.celeb ? 1.35 : g.vip ? 1.08 : 1,
      color: g.color, skin: g.skin, hair: g.hair,
      bob,
      arms: dancing ? beat + g.bobPhase : null,
      drink: g.mode === 'act' ? g.drink : null,
      alpha: g.alpha,
      glow: g.celeb,
      star: g.celeb,
      bobPhase: g.bobPhase,
    });
    if (g.celeb && state.celeb) {
      const frac = Math.max(0, (state.celeb.expires - Date.now()) / 20000);
      ctx.strokeStyle = 'rgba(255,215,0,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x * W, g.y * H - 6, 26, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
  }

  // VIP-Etage gesperrt → Overlay über allem in T2
  if (!state.t2Unlocked) drawT2Lock(t);

  // Partikel
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.font = `700 ${p.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    if (p.color) ctx.fillStyle = p.color;
    ctx.fillText(p.txt, p.x * W, p.y * H);
  }
  ctx.globalAlpha = 1;

  // DROP-Strobe
  if (dropActive()) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * Math.abs(Math.sin(t * 20))})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ============================================================
//  AIRPORT – Club Simulator · Canvas-Rendering der Räume
// ============================================================
import { state, totalLevels, dropActive, tapCeleb, tapHype } from './game.js';
import { STATIONS } from './data.js';

let canvas, ctx, W = 0, H = 0, DPR = 1;
let guests = [];       // { x,y, tx,ty, color, skin, speed, bobPhase, vip }
let particles = [];    // schwebende +€ / Konfetti auf dem Canvas
let celebPos = { x: 0.5, y: 0.55, tx: 0.5, ty: 0.55 };
let startTime = performance.now();

const GUEST_COLORS = ['#e74c8b', '#4f9cf7', '#f7b32b', '#42d6a4', '#b06df7', '#f76d4f', '#4fd7f7', '#95e04a'];
const SKIN = ['#ffd9b3', '#f0b98c', '#c68a53', '#8c5a33'];

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

// ---- Interaktion --------------------------------------------------
let onTapFeedback = null;
export function setTapFeedback(cb) { onTapFeedback = cb; }

function onTap(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / W;
  const y = (e.clientY - rect.top) / H;
  // Promi zuerst prüfen (größere Trefferfläche)
  if (state.celeb) {
    const dx = x - celebPos.x, dy = y - celebPos.y;
    if (Math.hypot(dx * W, dy * H) < 44) {
      const r = tapCeleb();
      if (r && onTapFeedback) onTapFeedback({ type: 'celeb', x: e.clientX, y: e.clientY, ...r });
      return;
    }
  }
  const gain = tapHype();
  spawnMoneyParticle(x, y);
  if (onTapFeedback) onTapFeedback({ type: 'tap', x: e.clientX, y: e.clientY, gain });
}

// ---- Gäste ----------------------------------------------------------
function targetGuestCount() {
  const n = 4 + Math.floor(totalLevels() / 8);
  return Math.min(state.room === 't2' ? 18 : 26, n);
}

function makeGuest(vip) {
  return {
    x: 0.1 + Math.random() * 0.8, y: 0.35 + Math.random() * 0.55,
    tx: 0, ty: 0,
    color: vip ? '#ffd700' : GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
    skin: SKIN[Math.floor(Math.random() * SKIN.length)],
    speed: 0.02 + Math.random() * 0.03,
    bobPhase: Math.random() * Math.PI * 2,
    wait: 0,
    vip,
  };
}

function pickTarget(g) {
  // Gäste pendeln zwischen Tanzfläche (Mitte) und den Rändern (Bar etc.)
  if (Math.random() < 0.6) {
    g.tx = 0.32 + Math.random() * 0.36; g.ty = 0.42 + Math.random() * 0.3; // Tanzfläche
  } else {
    const spots = state.room === 't2'
      ? [[0.13, 0.4], [0.87, 0.42], [0.15, 0.8], [0.85, 0.8], [0.5, 0.87]]
      : [[0.12, 0.5], [0.88, 0.55], [0.2, 0.88], [0.8, 0.88], [0.5, 0.9]];
    const s = spots[Math.floor(Math.random() * spots.length)];
    g.tx = s[0] + (Math.random() - 0.5) * 0.06;
    g.ty = s[1] + (Math.random() - 0.5) * 0.04;
  }
  g.wait = 1 + Math.random() * 4;
}

function updateGuests(dt) {
  const want = targetGuestCount();
  const vip = state.room === 't2';
  while (guests.length < want) { const g = makeGuest(vip); pickTarget(g); guests.push(g); }
  if (guests.length > want) guests.length = want;
  for (const g of guests) {
    const dx = g.tx - g.x, dy = g.ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      g.wait -= dt;
      if (g.wait <= 0) pickTarget(g);
    } else {
      const sp = g.speed * (dropActive() ? 2 : 1);
      g.x += (dx / d) * sp * dt * 3;
      g.y += (dy / d) * sp * dt * 3;
    }
  }
  // Promi bewegt sich gemächlich
  if (state.celeb) {
    const dx = celebPos.tx - celebPos.x, dy = celebPos.ty - celebPos.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      celebPos.tx = 0.25 + Math.random() * 0.5;
      celebPos.ty = 0.4 + Math.random() * 0.4;
    } else {
      celebPos.x += (dx / d) * 0.015 * dt * 3;
      celebPos.y += (dy / d) * 0.015 * dt * 3;
    }
  }
}

// ---- Partikel ---------------------------------------------------------
export function spawnMoneyParticle(nx, ny) {
  particles.push({ x: nx, y: ny, vy: -0.06, life: 1, txt: '💶', size: 13 });
}

function ambientParticles(dt) {
  if (Math.random() < dt * (dropActive() ? 4 : 0.8) && guests.length) {
    const g = guests[Math.floor(Math.random() * guests.length)];
    particles.push({ x: g.x, y: g.y - 0.05, vy: -0.05, life: 1, txt: '+€', size: 11, color: '#7CFC8E' });
  }
  if (dropActive() && Math.random() < dt * 12) {
    particles.push({
      x: Math.random(), y: -0.02, vy: 0.15 + Math.random() * 0.2, life: 2.2,
      txt: ['🎉', '✨', '💜', '🎊'][Math.floor(Math.random() * 4)], size: 12 + Math.random() * 8, fall: true,
    });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.y += p.vy * dt;
    p.life -= dt * (p.fall ? 0.45 : 1);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ---- Zeichnen ------------------------------------------------------------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawPerson(x, y, s, color, skin, bob, glow) {
  const px = x * W, py = y * H + bob;
  if (glow) {
    ctx.save();
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
  }
  // Körper
  ctx.fillStyle = color;
  rr(px - 4.2 * s, py - 6 * s, 8.4 * s, 12 * s, 4.2 * s);
  ctx.fill();
  // Kopf
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(px, py - 9.5 * s, 4.4 * s, 0, Math.PI * 2);
  ctx.fill();
  if (glow) {
    ctx.restore();
    // Stern über dem Promi
    ctx.font = `${14 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⭐', px, py - 20 * s);
  }
}

function drawRoomT1(t, beat) {
  // Boden
  ctx.fillStyle = '#171232';
  ctx.fillRect(0, 0, W, H);
  // Wandstreifen oben
  ctx.fillStyle = '#241b4d';
  ctx.fillRect(0, 0, W, H * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, H * 0.155, W, 3);

  // Schriftzug "AIRPORT" als Neon (unter den Raum-Tabs)
  ctx.font = `800 ${Math.min(26, W * 0.055)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = `hsla(${(t * 40) % 360}, 90%, 70%, 0.95)`;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 16;
  ctx.fillText('✈ AIRPORT', W / 2, H * 0.135);
  ctx.shadowBlur = 0;

  // DJ-Booth oben Mitte
  const bw = W * 0.3, bx = W / 2 - bw / 2, by = H * 0.17;
  ctx.fillStyle = '#2e2560';
  rr(bx, by, bw, H * 0.075, 8); ctx.fill();
  ctx.fillStyle = '#463a8c';
  rr(bx + 6, by + 5, bw - 12, H * 0.03, 5); ctx.fill();
  drawPerson(0.5, 0.205, 1.05, '#3b2f7a', '#f0b98c', Math.sin(beat) * 1.5);
  ctx.font = '11px sans-serif';
  ctx.fillText('🎧', W / 2, by + 8);

  // Boxen links/rechts der Booth
  for (const sx of [bx - 18, bx + bw + 4]) {
    ctx.fillStyle = '#12102a';
    rr(sx, by + 2, 14, H * 0.07, 4); ctx.fill();
    ctx.fillStyle = `rgba(160,120,255,${0.4 + 0.35 * Math.abs(Math.sin(beat))})`;
    ctx.beginPath(); ctx.arc(sx + 7, by + 2 + H * 0.045, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  // Tanzfläche: pulsierende Neon-Kacheln
  const fx = W * 0.26, fy = H * 0.36, fw = W * 0.48, fh = H * 0.4;
  const cols = 6, rows = 5;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const hue = ((i + j) * 55 + t * 90) % 360;
      const pulse = 0.5 + 0.5 * Math.sin(beat + (i + j));
      ctx.fillStyle = `hsla(${hue}, 85%, ${dropActive() ? 55 + pulse * 15 : 38 + pulse * 12}%, 0.9)`;
      rr(fx + i * (fw / cols) + 1.5, fy + j * (fh / rows) + 1.5, fw / cols - 3, fh / rows - 3, 5);
      ctx.fill();
    }
  }

  // Lichtkegel vom DJ
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ang = Math.sin(t * (0.7 + i * 0.3) + i * 2) * 0.7;
    ctx.fillStyle = `hsla(${(t * 60 + i * 120) % 360}, 90%, 65%, ${dropActive() ? 0.18 : 0.09})`;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.17);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.4 - W * 0.09, H * 0.85);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.4 + W * 0.09, H * 0.85);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Bar links
  ctx.fillStyle = '#3d2b1f';
  rr(W * 0.03, H * 0.3, W * 0.13, H * 0.42, 10); ctx.fill();
  ctx.fillStyle = '#5a4030';
  rr(W * 0.03, H * 0.3, W * 0.13, H * 0.06, 10); ctx.fill();
  ctx.font = `${Math.min(18, W * 0.04)}px sans-serif`;
  ctx.fillText('🍹', W * 0.095, H * 0.42);
  ctx.fillText('🍸', W * 0.095, H * 0.54);
  ctx.fillText('🍾', W * 0.095, H * 0.66);

  // Shot-Bar rechts
  ctx.fillStyle = '#41224d';
  rr(W * 0.85, H * 0.34, W * 0.12, H * 0.3, 10); ctx.fill();
  ctx.fillText('🥃', W * 0.91, H * 0.46);
  ctx.fillText('🥃', W * 0.91, H * 0.58);

  // Einlass unten (über der Hype-Leiste sichtbar)
  ctx.fillStyle = '#241b4d';
  rr(W * 0.4, H * 0.82, W * 0.2, H * 0.055, 8); ctx.fill();
  ctx.fillStyle = '#ffd700';
  ctx.font = `700 ${Math.min(11, W * 0.028)}px system-ui, sans-serif`;
  ctx.fillText('EINLASS', W / 2, H * 0.856);
}

function drawRoomT2(t, beat) {
  // Edler VIP-Look: dunkles Bordeaux + Gold
  ctx.fillStyle = '#1c0f24';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b1533';
  ctx.fillRect(0, 0, W, H * 0.16);
  ctx.fillStyle = 'rgba(255,215,0,0.25)';
  ctx.fillRect(0, H * 0.155, W, 3);

  ctx.font = `800 ${Math.min(24, W * 0.05)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd700';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 14;
  ctx.fillText('✦ TERMINAL 2 · VIP ✦', W / 2, H * 0.135);
  ctx.shadowBlur = 0;

  // Goldene Tanzfläche in der Mitte
  const fx = W * 0.28, fy = H * 0.38, fw = W * 0.44, fh = H * 0.34;
  const cols = 5, rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const pulse = 0.5 + 0.5 * Math.sin(beat + (i * j));
      const warm = 38 + ((i + j) % 3) * 12;
      ctx.fillStyle = `hsla(${warm}, 90%, ${30 + pulse * 22}%, 0.95)`;
      rr(fx + i * (fw / cols) + 1.5, fy + j * (fh / rows) + 1.5, fw / cols - 3, fh / rows - 3, 5);
      ctx.fill();
    }
  }

  // Champagner-Bar oben links
  ctx.fillStyle = '#3a2410';
  rr(W * 0.04, H * 0.2, W * 0.2, H * 0.12, 10); ctx.fill();
  ctx.font = `${Math.min(16, W * 0.038)}px sans-serif`;
  ctx.fillText('🍾', W * 0.1, H * 0.28);
  ctx.fillText('🥂', W * 0.18, H * 0.28);

  // Lounge-Sofas
  const sofa = (x, y, w) => {
    ctx.fillStyle = '#7a1f3d';
    rr(x, y, w, H * 0.07, 10); ctx.fill();
    ctx.fillStyle = '#9b2950';
    rr(x, y - H * 0.025, w, H * 0.035, 8); ctx.fill();
  };
  sofa(W * 0.05, H * 0.5, W * 0.16);
  sofa(W * 0.79, H * 0.48, W * 0.16);
  sofa(W * 0.06, H * 0.8, W * 0.18);
  sofa(W * 0.76, H * 0.8, W * 0.18);

  // Bottle-Service-Tische mit Kühler
  for (const [tx, ty] of [[0.34, 0.85], [0.5, 0.9], [0.66, 0.85]]) {
    ctx.fillStyle = '#241226';
    ctx.beginPath(); ctx.arc(W * tx, H * ty, 13, 0, Math.PI * 2); ctx.fill();
    ctx.font = '12px sans-serif';
    ctx.fillText('🍾', W * tx, H * ty + 4);
  }

  // Wunderkerzen-Funken
  if (Math.random() < 0.3) {
    particles.push({
      x: 0.34 + Math.random() * 0.32, y: 0.82, vy: -0.1 - Math.random() * 0.1,
      life: 0.6, txt: '✨', size: 9,
    });
  }

  // sanfte goldene Lichtkegel
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const ang = Math.sin(t * 0.5 + i * 3) * 0.5;
    ctx.fillStyle = 'hsla(45, 95%, 65%, 0.07)';
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.1);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.35 - W * 0.1, H * 0.8);
    ctx.lineTo(W / 2 + Math.sin(ang) * W * 0.35 + W * 0.1, H * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawLockedT2() {
  ctx.fillStyle = '#141021';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.25;
  drawRoomT2(0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,8,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = `${Math.min(64, W * 0.16)}px sans-serif`;
  ctx.fillText('🔒', W / 2, H * 0.42);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${Math.min(20, W * 0.05)}px system-ui, sans-serif`;
  ctx.fillText('Terminal 2 · VIP-Etage', W / 2, H * 0.52);
  ctx.fillStyle = '#b9a8e8';
  ctx.font = `600 ${Math.min(14, W * 0.036)}px system-ui, sans-serif`;
  ctx.fillText('Freischalten über „Räume“ unten rechts', W / 2, H * 0.58);
}

let lastFrame = 0;

export function renderFrame(now) {
  if (!ctx) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000) || 0.016;
  lastFrame = now;
  const t = (now - startTime) / 1000;
  const bpm = dropActive() ? 160 : 126;
  const beat = t * (bpm / 60) * Math.PI;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const showT2 = state.room === 't2';
  if (showT2 && !state.t2Unlocked) { drawLockedT2(); return; }

  updateGuests(dt);
  ambientParticles(dt);

  if (showT2) drawRoomT2(t, beat); else drawRoomT1(t, beat);

  // Gäste (nach y sortiert für Pseudo-Tiefe)
  const sorted = [...guests].sort((a, b) => a.y - b.y);
  for (const g of sorted) {
    const onFloor = g.x > 0.26 && g.x < 0.74 && g.y > 0.36 && g.y < 0.78;
    const bob = onFloor ? Math.sin(beat + g.bobPhase) * (dropActive() ? 3.5 : 2) : 0;
    drawPerson(g.x, g.y, g.vip ? 1.1 : 1, g.color, g.skin, bob);
  }

  // Promi-Gast
  if (state.celeb) {
    const pulse = 1 + Math.sin(t * 6) * 0.08;
    drawPerson(celebPos.x, celebPos.y, 1.35 * pulse, '#ffd700', '#f0b98c', Math.sin(beat) * 2, true);
    // Zeit-Ring
    const frac = Math.max(0, (state.celeb.expires - Date.now()) / 20000);
    ctx.strokeStyle = 'rgba(255,215,0,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(celebPos.x * W, celebPos.y * H - 4, 26, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  // Partikel
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.font = `700 ${p.size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    if (p.color) { ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x * W, p.y * H); }
    else ctx.fillText(p.txt, p.x * W, p.y * H);
  }
  ctx.globalAlpha = 1;

  // DROP-Strobe
  if (dropActive()) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * Math.abs(Math.sin(t * 20))})`;
    ctx.fillRect(0, 0, W, H);
  }
}

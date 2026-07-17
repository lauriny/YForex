// ============================================================
//  AIRPORT – Club Simulator · Mini-Sound-Engine (WebAudio)
//  + prozeduraler Club-Track (Techno/House, 126 BPM)
// ============================================================
import { state, dropActive } from './game.js';

let actx = null;

function ctx() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function tone(freq, dur, type = 'square', vol = 0.08, delay = 0) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur);
}

const SFX = {
  click:     () => tone(600, 0.06, 'square', 0.05),
  tap:       () => tone(880 + Math.random() * 200, 0.05, 'triangle', 0.06),
  buy:       () => { tone(523, 0.07, 'square', 0.06); tone(784, 0.09, 'square', 0.06, 0.06); },
  quest:     () => { tone(659, 0.08, 'triangle', 0.07); tone(880, 0.12, 'triangle', 0.07, 0.09); },
  level:     () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.07, i * 0.09)); },
  milestone: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.1, 'square', 0.06, i * 0.07)); },
  chest:     () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, i * 0.08)); },
  boost:     () => { tone(300, 0.25, 'sawtooth', 0.05); tone(600, 0.25, 'sawtooth', 0.05, 0.15); },
  drop:      () => {
    const a = ctx(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.5);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + 0.6);
  },
};

export function playSfx(name) {
  if (!state.settings.sound) return;
  const fn = SFX[name];
  if (fn) { try { fn(); } catch (e) {} }
}

// ============================================================
//  Hintergrund-Musik: endloser Club-Loop, komplett generiert.
//  Aufbau: Kick (4-to-the-floor), Clap auf 2+4, Hats, Bassline
//  in a-Moll, Chord-Stabs — alles über einen "Sidechain"-Bus,
//  der bei jedem Kick wegduckt (das typische Club-Pumpen).
//  Im DROP: 16tel-Hats, offener Filter, Extra-Energie.
// ============================================================
// Verschiedene Musikrichtungen (prozedural) — umschaltbar
const _ = null;
const MUSIC_STYLES = {
  house:  { name: 'House',       bpm: 124, kickF: [150, 44], kickDec: 0.24, bCut: [320, 900], bWave: 'sawtooth',
            hats: '8',      clap: true,  stab: true,  stabCut: [1100, 2400], roots: [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49],
            bassPat: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1],
            leadWave: 'triangle', lead: [12, _, 7, _, 3, _, 7, _, 12, _, 15, _, 10, _, 7, _] },
  techno: { name: 'Techno',      bpm: 132, kickF: [160, 40], kickDec: 0.20, bCut: [240, 620], bWave: 'square',
            hats: 'off',    clap: false, stab: false, stabCut: [900, 2000],  roots: [41.2, 41.2, 41.2, 41.2, 55, 55, 49, 49],
            bassPat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
            leadWave: 'sawtooth', lead: [0, _, _, 12, _, _, 7, _, 0, _, _, 12, _, 7, _, 10] },
  rave:   { name: 'Rave/EDM',    bpm: 150, kickF: [180, 46], kickDec: 0.30, bCut: [420, 1200], bWave: 'sawtooth',
            hats: '16',     clap: true,  stab: true,  stabCut: [1600, 3000], roots: [55, 55, 65.41, 65.41, 49, 49, 58.27, 58.27],
            bassPat: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
            leadWave: 'sawtooth', lead: [12, 12, 15, 19, 12, 12, 15, 19, 17, 15, 12, 15, 10, 7, 10, 12] },
  afro:   { name: 'Afro House',  bpm: 114, kickF: [140, 42], kickDec: 0.26, bCut: [300, 760], bWave: 'sawtooth',
            hats: 'shaker', clap: true,  stab: true,  stabCut: [1300, 2200], roots: [49, 49, 55, 55, 43.65, 43.65, 58.27, 58.27],
            bassPat: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
            leadWave: 'triangle', lead: [7, _, 12, _, 10, _, 7, _, 3, _, 7, _, 10, _, 12, _] },
};
export const MUSIC_ORDER = ['house', 'techno', 'rave', 'afro'];
let M = MUSIC_STYLES.house;
let STEP = 60 / M.bpm / 4;                     // 16tel-Note

let music = null; // { master, bus, noise, timer, nextT, step }

function makeNoiseBuffer(a) {
  const buf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseHit(t, { hp = 8000, gain = 0.06, dur = 0.05, bp = 0 }) {
  const a = actx;
  const src = a.createBufferSource();
  src.buffer = music.noise;
  const f = a.createBiquadFilter();
  if (bp) { f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 1.2; }
  else { f.type = 'highpass'; f.frequency.value = hp; }
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(music.master);
  src.start(t); src.stop(t + dur + 0.02);
}

function kick(t) {
  const a = actx;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(M.kickF[0], t);
  o.frequency.exponentialRampToValueAtTime(M.kickF[1], t + 0.11);
  g.gain.setValueAtTime(0.85, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + M.kickDec);
  o.connect(g).connect(music.master);
  o.start(t); o.stop(t + M.kickDec + 0.03);
  // Sidechain: Bus duckt weg und pumpt zurück
  music.bus.gain.cancelScheduledValues(t);
  music.bus.gain.setValueAtTime(0.07, t);
  music.bus.gain.linearRampToValueAtTime(0.3, t + Math.min(0.32, STEP * 4 * 0.95));
}

function bass(t, freq, open) {
  const a = actx;
  const o = a.createOscillator();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  o.type = M.bWave;
  o.frequency.value = freq;
  f.type = 'lowpass';
  f.frequency.value = open ? M.bCut[1] : M.bCut[0];
  g.gain.setValueAtTime(0.62, t);
  g.gain.exponentialRampToValueAtTime(0.01, t + STEP * 0.9);
  o.connect(f).connect(g).connect(music.bus);
  o.start(t); o.stop(t + STEP);
}

function stab(t, root, open) {
  const a = actx;
  for (const ratio of [2, 2.3784, 2.9966]) {   // Moll-Akkord, eine Oktave hoch
    for (const det of [-4, 4]) {
      const o = a.createOscillator();
      const f = a.createBiquadFilter();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.value = root * ratio;
      o.detune.value = det;
      f.type = 'lowpass';
      f.frequency.value = open ? M.stabCut[1] : M.stabCut[0];
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(f).connect(g).connect(music.bus);
      o.start(t); o.stop(t + 0.36);
    }
  }
}

function semi(n) { return Math.pow(2, n / 12); }

// Melodischer Pluck-Lead (macht aus dem Beat einen „Song") — mit Delay-Send für Club-Raum
function pluck(t, freq, wave) {
  const a = actx;
  const o = a.createOscillator(), o2 = a.createOscillator();
  const f = a.createBiquadFilter(), g = a.createGain();
  o.type = wave || 'triangle'; o2.type = o.type;
  o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 8;
  f.type = 'lowpass'; f.frequency.setValueAtTime(4600, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.2); f.Q.value = 5;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(music.bus);
  if (music.delay) g.connect(music.delay);
  o.start(t); o2.start(t); o.stop(t + 0.32); o2.stop(t + 0.32);
}

// Sub-Bass unter der Bassline (Wumms)
function sub(t, freq) {
  const a = actx, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.value = freq / 2;
  g.gain.setValueAtTime(0.34, t); g.gain.exponentialRampToValueAtTime(0.01, t + STEP * 0.95);
  o.connect(g).connect(music.bus); o.start(t); o.stop(t + STEP);
}

function tom(t) {   // Afro-Log-Drum
  const a = actx, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(78, t + 0.18);
  g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(music.bus); o.start(t); o.stop(t + 0.24);
}

function playMusicStep(s, t) {
  const bar = Math.floor(s / 16) % 8;
  const st = s % 16;
  const drop = dropActive();
  if (st % 4 === 0) kick(t);
  if (M.clap && (st === 4 || st === 12)) noiseHit(t, { bp: 1500, gain: 0.12, dur: 0.14 });   // Clap
  // Hi-Hats je nach Stil
  let playHat = false, hg = 0.045, hd = 0.045, hp = 8500;
  if (drop) { playHat = true; hg = st % 4 === 2 ? 0.08 : 0.045; hd = 0.05; }
  else if (M.hats === '16') { playHat = true; hg = st % 2 === 0 ? 0.055 : 0.032; }
  else if (M.hats === '8') { playHat = st % 2 === 0; hg = st % 4 === 2 ? 0.075 : 0.04; hd = st % 4 === 2 ? 0.08 : 0.04; }
  else if (M.hats === 'off') { playHat = st % 4 === 2; hg = 0.075; hd = 0.06; }
  else if (M.hats === 'shaker') { playHat = true; hg = st % 4 === 2 ? 0.06 : 0.028; hd = 0.03; hp = 9500; }
  if (playHat) noiseHit(t, { hp, gain: hg, dur: hd });
  // Bass (+ Sub-Bass für Wumms)
  if (M.bassPat[st]) { const bf = st % 8 === 6 ? M.roots[bar] * 2 : M.roots[bar]; bass(t, bf, drop); if (st % 4 === 0) sub(t, M.roots[bar]); }
  // Stabs
  if (M.stab && (st === 0 || (st === 10 && bar % 2 === 1))) stab(t, M.roots[bar], drop);
  // Melodischer Lead (der „Hook" — im DROP jede Stufe, sonst ab Bar 2 für Aufbau/Abwechslung)
  if (M.lead && M.lead[st] != null && (drop || bar >= 2)) pluck(t, M.roots[bar] * semi(M.lead[st]) * 4, M.leadWave);
  // Afro-Log-Drum
  if (M.name === 'Afro House' && (st === 6 || st === 14)) tom(t);
}

export function startMusic() {
  if (music || !state.settings.music) return;
  const a = ctx();
  if (!a) return;
  M = MUSIC_STYLES[state.settings.musicStyle] || MUSIC_STYLES.house;
  STEP = 60 / M.bpm / 4;
  const master = a.createGain();
  master.gain.value = 0.30;
  const comp = a.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(a.destination);
  const bus = a.createGain();  // Sidechain-Bus für Bass, Stabs & Lead
  bus.gain.value = 0.3;
  bus.connect(master);
  // Feedback-Delay für Lead/Stabs → Club-Raum/Tiefe
  const delay = a.createDelay(1.0);
  delay.delayTime.value = STEP * 3;            // punktierter Achtel-Vibe
  const fb = a.createGain(); fb.gain.value = 0.34;
  const delWet = a.createGain(); delWet.gain.value = 0.42;
  const delFilt = a.createBiquadFilter(); delFilt.type = 'highpass'; delFilt.frequency.value = 500;
  delay.connect(fb); fb.connect(delay); delay.connect(delFilt); delFilt.connect(delWet); delWet.connect(master);
  music = { master, bus, delay, noise: null, timer: null, nextT: a.currentTime + 0.1, step: 0 };
  music.noise = makeNoiseBuffer(a);
  music.timer = setInterval(() => {
    if (!music) return;
    try {
      while (music.nextT < a.currentTime + 0.15) {
        playMusicStep(music.step, music.nextT);
        music.nextT += STEP;
        music.step = (music.step + 1) % 128;
      }
    } catch (e) {}
  }, 30);
}

export function stopMusic() {
  if (!music) return;
  clearInterval(music.timer);
  try { music.master.disconnect(); } catch (e) {}
  music = null;
}

export function setMusic(on) {
  state.settings.music = on;
  if (on) startMusic(); else stopMusic();
}

// ---- Musikrichtung wechseln ----
export function setMusicStyle(style) {
  if (!MUSIC_STYLES[style]) return;
  state.settings.musicStyle = style;
  M = MUSIC_STYLES[style];
  STEP = 60 / M.bpm / 4;
  if (music) { stopMusic(); startMusic(); }   // sofort mit neuem Stil weiterlaufen
}
export function cycleMusicStyle() {
  const cur = state.settings.musicStyle || 'house';
  const next = MUSIC_ORDER[(MUSIC_ORDER.indexOf(cur) + 1) % MUSIC_ORDER.length];
  setMusicStyle(next);
  return MUSIC_STYLES[next].name;
}
export function currentMusicStyleName() {
  return (MUSIC_STYLES[state.settings.musicStyle] || M).name;
}
export function musicBpm() {
  return (MUSIC_STYLES[state.settings.musicStyle] || M).bpm;
}

export function pauseAudio(hidden) {
  if (!actx) return;
  if (hidden) actx.suspend();
  else if (state.settings.music || state.settings.sound) actx.resume();
}

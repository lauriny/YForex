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
const BPM = 126;
const STEP = 60 / BPM / 4;                    // 16tel-Note
const ROOTS = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49]; // A1 A1 F1 F1 C2 C2 G1 G1
const BASSPAT = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];

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
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
  g.gain.setValueAtTime(0.85, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  o.connect(g).connect(music.master);
  o.start(t); o.stop(t + 0.26);
  // Sidechain: Bus duckt weg und pumpt zurück
  music.bus.gain.cancelScheduledValues(t);
  music.bus.gain.setValueAtTime(0.07, t);
  music.bus.gain.linearRampToValueAtTime(0.3, t + 0.28);
}

function bass(t, freq, open) {
  const a = actx;
  const o = a.createOscillator();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  f.type = 'lowpass';
  f.frequency.value = open ? 900 : 320;
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
      f.frequency.value = open ? 2400 : 1100;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(f).connect(g).connect(music.bus);
      o.start(t); o.stop(t + 0.36);
    }
  }
}

function playMusicStep(s, t) {
  const bar = Math.floor(s / 16) % 8;
  const st = s % 16;
  const drop = dropActive();
  if (st % 4 === 0) kick(t);
  if (st === 4 || st === 12) noiseHit(t, { bp: 1500, gain: 0.12, dur: 0.14 });          // Clap
  if (drop ? true : st % 2 === 0)                                                        // Hats
    noiseHit(t, { hp: 8500, gain: st % 4 === 2 ? 0.075 : 0.04, dur: st % 4 === 2 ? 0.08 : 0.04 });
  if (BASSPAT[st]) bass(t, st % 8 === 6 ? ROOTS[bar] * 2 : ROOTS[bar], drop);
  if (st === 0 || (st === 10 && bar % 2 === 1)) stab(t, ROOTS[bar], drop);
}

export function startMusic() {
  if (music || !state.settings.music) return;
  const a = ctx();
  if (!a) return;
  const master = a.createGain();
  master.gain.value = 0.30;
  const comp = a.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(a.destination);
  const bus = a.createGain();  // Sidechain-Bus für Bass & Stabs
  bus.gain.value = 0.3;
  bus.connect(master);
  music = { master, bus, noise: null, timer: null, nextT: a.currentTime + 0.1, step: 0 };
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

export function pauseAudio(hidden) {
  if (!actx) return;
  if (hidden) actx.suspend();
  else if (state.settings.music || state.settings.sound) actx.resume();
}

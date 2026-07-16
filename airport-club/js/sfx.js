// ============================================================
//  AIRPORT – Club Simulator · Mini-Sound-Engine (WebAudio)
// ============================================================
import { state } from './game.js';

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

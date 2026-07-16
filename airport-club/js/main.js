// ============================================================
//  AIRPORT – Club Simulator · Einstiegspunkt
// ============================================================
import * as G from './game.js';
import { initCanvas, renderFrame, setTapFeedback } from './render.js';
import { initUI, updateHUD, offlinePopup, canvasFeedback } from './ui.js';
import { startMusic, pauseAudio } from './sfx.js';

// Spielstand laden (liefert ggf. Offline-Einnahmen)
const offline = G.load();

initUI();
initCanvas(document.getElementById('club-canvas'));
setTapFeedback(canvasFeedback);

if (offline && offline.money > 1) {
  offlinePopup(offline.away, offline.money);
}

// Haupt-Loop
let hudTimer = 0;
function loop(now) {
  G.tick(now);
  renderFrame(now);
  hudTimer += 1;
  if (hudTimer % 6 === 0) updateHUD(); // HUD ~10x/s reicht
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Musik startet mit der ersten Berührung (Browser-Autoplay-Regel)
document.addEventListener('pointerdown', () => startMusic(), { once: true });

// Speichern & Audio pausieren, wenn die App in den Hintergrund geht
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  if (hidden) G.save();
  pauseAudio(hidden);
});
window.addEventListener('pagehide', () => G.save());

// Für Debugging & Tests in der Konsole
window.AirportGame = G;

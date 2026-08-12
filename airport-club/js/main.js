// ============================================================
//  AIRPORT – Club Simulator · Einstiegspunkt
// ============================================================
import * as G from './game.js';
import * as R from './render.js';
import { initCanvas, renderFrame, setTapFeedback } from './render.js';
import { initUI, updateHUD, offlinePopup, canvasFeedback, maybeOpenDaily } from './ui.js';
import { startMusic, pauseAudio } from './sfx.js';

// Spielstand laden (liefert ggf. Offline-Einnahmen)
const offline = G.load();

initUI();
initCanvas(document.getElementById('club-canvas'));
setTapFeedback(canvasFeedback);

// Start-Splash: erster Tap startet Audio/Musik synchron in der Geste (iOS-sicher)
const splash = document.getElementById('splash');
let started = false;
function startGame() {
  if (started) return;
  started = true;
  startMusic();
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 400);
  if (offline && offline.money > 1) offlinePopup(offline.away, offline.money);
  else maybeOpenDaily();
  setTimeout(() => G.storyFire('intro'), 600);   // erzählter Einstieg (nur einmal)
}
splash.addEventListener('click', startGame);
splash.addEventListener('touchstart', startGame, { passive: true });

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

// Speichern & Audio pausieren, wenn die App in den Hintergrund geht
document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  if (hidden) G.saveNow();
  pauseAudio(hidden);
});
window.addEventListener('pagehide', () => G.saveNow());

// Für Debugging & Tests in der Konsole
window.AirportGame = G;
window.AirportRender = R;

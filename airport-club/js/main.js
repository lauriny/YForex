// ============================================================
//  AIRPORT – Club Simulator · Einstiegspunkt
// ============================================================
import * as G from './game.js';
import { initCanvas, renderFrame, setTapFeedback } from './render.js';
import { initUI, updateHUD, offlinePopup, canvasFeedback } from './ui.js';

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

// Speichern, wenn die App in den Hintergrund geht
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') G.save();
});
window.addEventListener('pagehide', () => G.save());

// Für Debugging & Tests in der Konsole
window.AirportGame = G;

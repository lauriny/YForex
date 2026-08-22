// ============================================================
//  AIRPORT – Club Simulator · Spiellogik & State
// ============================================================
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP, CASH_STATIONS,
  T2_REQ, ROOF_REQ, PERFORMER, AUTOCOLLECT, CLUB_EXPAND, autoCollectInterval,
  MARKETING, marketingCost, DJS, DJ_MAP, DRINKS, drinkTier, CLUB_THEMES, THEME_MAP, inSeasonWindow,
  BOOST, DROP, OFFLINE, CELEB, PRESTIGE,
  EVENTS, EVENT_GAP, WHEEL, DAILY_MIN_GAP_H, DAILY_STREAK_MAX, ACHIEVEMENTS,
  getPhase, chestReward, costOf, bulkCost, maxAffordable, milestoneMult,
  RIVALS, RIVAL_OVERTAKE_MULT, UNDERGROUND_JOBS, UNDERGROUND_REQ, HEAT_MAX, HEAT_DECAY, BOOT_REQ, RAID_DUR, TAKEDOWN_CD, BODY_RAID_DELAY, BRIBE_MULT,
  DEAL_CATS, DEAL_GOODS, DEAL_GOODS_FLAT, goodById, CUSTOMER_ARCHETYPES, DEAL_CFG, SOURCING,
  SHOOTER, BUST_PENALTY, NEMESIS, UNDERWORLD_PHASES, getUgPhase, STORY,
  NIGHT, REP, repTier, INCIDENTS, CHAPTERS, chapterFor,
} from './data.js';

const SAVE_KEY = 'airportClub.save.v1';

// ---- Events ------------------------------------------------------
const listeners = {};
export function on(ev, cb) { (listeners[ev] ||= []).push(cb); }
export function emit(ev, data) { (listeners[ev] || []).forEach(cb => cb(data)); }

// ---- State -------------------------------------------------------
function freshStations() {
  const o = {};
  STATIONS.forEach(s => o[s.id] = 0);
  o.einlass = 1;
  return o;
}

export const state = {
  money: 25,
  gems: 5,
  level: 1,
  fame: 0,                 // Ruf-Sterne (Prestige)
  lifetime: 0,             // insgesamt je verdient (bleibt für immer)
  stations: freshStations(),
  staff: {},               // id -> Stufe
  t2Unlocked: false,
  roofUnlocked: false,
  stationCash: {},         // id -> aufgelaufener, einsammelbarer Umsatz
  autoCollect: 0,          // Stufe des Auto-Kassierers (0 = aus)
  marketing: 0,            // Marketing-Stufe (mehr & schnellere Gäste)
  djsOwned: ['resident'],  // angeheuerte DJs
  activeDj: 'resident',    // aktiver DJ
  clubTheme: 'classic',    // aktives Club-Theme (Dancefloor-Look)
  themesOwned: ['classic'],// freigeschaltete Themes
  clubSize: 0,             // Club-Ausbaustufe (Gebäude größer)
  performer: { unlocked: false, room: 't1' },
  event: null,             // { id, expires }
  nextEventAt: Date.now() + 180_000,
  daily: { lastClaim: 0, streak: 0 },
  achievements: {},        // id -> true (Belohnung abgeholt)
  boostUntil: 0,
  boostCdUntil: 0,
  hype: 0,
  dropUntil: 0,
  celeb: null,             // { expires, seed }
  nextCelebAt: Date.now() + 90_000,
  phase: 0,
  questsDone: {},          // "phase:i" -> true
  midChestClaimed: false,
  stats: { drops: 0, celebs: 0, boostsUsed: 0, chests: 0, prestiges: 0 },
  settings: { sound: true, music: true, musicStyle: 'house' },
  devMode: false,          // Dev-Modus (per Code in den Einstellungen)
  nightStreak: 0,          // wie viele Club-Nächte in Folge durchgezogen
  // ---- Die Nacht: Kern-Loop mit Ziel, Verlauf und Ausgang ----
  clock: NIGHT.startMin,   // aktuelle Uhrzeit in Minuten (22:00 → 04:00)
  nights: 0,               // erfolgreich abgeschlossene Nächte
  nightGoal: 0,            // Umsatzziel dieser Nacht (0 = noch nicht gesetzt)
  nightEarned: 0,          // in dieser Nacht bereits verdient
  nightMult: 1,            // temporärer Gäste-/Einkommensschub aus Vorfällen
  rep: REP.start,          // Ruf 0..100 — zweite knappe Ressource
  incident: null,          // aktuell offener Vorfall { id, until, opts }
  nextIncidentAt: 0,       // Uhrzeit (Nacht-Minuten) des nächsten Vorfalls
  incidentsHandled: 0,
  chapter: 0,              // erreichtes Story-Kapitel
  rivals: { beaten: [], seeded: false },  // ids überholter Rivalen (dauerhafter Einkommens-Bonus)
  underground: { unlocked: false, job: null, heat: 0, done: 0, lastResult: null, takedownCdUntil: 0, pendingRaidAt: 0 },
  dealer: { rep: 0, stock: [], served: 0, runsDone: 0, catsRun: {}, lastDeal: null, run: null, customer: null, jailUntil: 0, lastBust: null },   // Schwarzmarkt
  ugPhase: 0,              // Unterwelt-Kapitel (Story-Strang)
  storySeen: {},          // gesehene Story-Beats (id -> true)
  raidUntil: 0,            // bis dahin ist der Club nach einer Razzia fast dicht
  bootTeased: false,       // „Das Boot"-Endgame schon einmal angekündigt?
  bootUnlocked: false,     // Franchise #2 eröffnet?
  location: 'airport',     // aktueller Standort: 'airport' | 'boot'
  createdAt: Date.now(),
};

// ---- Raum-Freischaltung -------------------------------------------
export function roomUnlocked(roomId) {
  if (roomId === 't2') return state.t2Unlocked;
  if (roomId === 'roof') return state.roofUnlocked;
  if (roomId === 'boot1' || roomId === 'boot2' || roomId === 'boot3') return state.bootUnlocked;   // ganzes Schiff auf einmal
  if (roomId === 'hinter') return undergroundUnlocked() && !dealerJailed();
  return true; // t1
}

// ---- Abgeleitete Werte --------------------------------------------
export function staffStationMult(stationId) {
  let m = 1;
  for (const s of STAFF) {
    const lvl = state.staff[s.id] || 0;
    if (lvl > 0 && s.targets && s.targets.includes(stationId)) m += s.perLevel * lvl;
  }
  return m;
}

export function staffGlobalMult() {
  let m = 1;
  for (const s of STAFF) {
    const lvl = state.staff[s.id] || 0;
    if (lvl > 0 && s.global) m += s.global * lvl;
  }
  return m;
}

export function fameMult() { return 1 + state.fame * PRESTIGE.multPerStar; }
export function boostActive() { return Date.now() < state.boostUntil; }
export function dropActive() { return Date.now() < state.dropUntil; }

// Show-Act: der Raum, in dem die Tänzerin steht, wird geboostet
export function performerRoomMult(roomId) {
  return (state.performer.unlocked && state.performer.room === roomId) ? PERFORMER.roomMult : 1;
}

export function stationIncome(id) {
  const lvl = state.stations[id] || 0;
  if (lvl <= 0) return 0;
  const st = STATION_MAP[id];
  if (!roomUnlocked(st.room)) return 0;
  let inc = st.baseIncome * lvl * milestoneMult(lvl) * staffStationMult(id) * performerRoomMult(st.room);
  if (id === 'bar') inc *= drinkMult();   // besserer Signature-Drink → mehr Umsatz
  return inc;
}

export function roomIncome(roomId) {
  let sum = 0;
  for (const st of STATIONS) if (st.room === roomId) sum += stationIncome(st.id);
  return sum * globalMult();
}

// ---- Live-Events ---------------------------------------------------
export function eventActive() { return state.event && Date.now() < state.event.expires; }
export function eventDef() { return eventActive() ? EVENTS.find(e => e.id === state.event.id) : null; }
export function eventMult() { const d = eventDef(); return d ? d.mult : 1; }
export function eventGuestMult() { const d = eventDef(); return d ? d.guests : 1; }

export function raidActive() { return Date.now() < (state.raidUntil || 0); }
export function raidLeft() { return Math.max(0, ((state.raidUntil || 0) - Date.now()) / 1000); }

// Multiplikatoren OHNE Ruf/Nacht — Basis für Zielwerte und Vorfallskosten,
// damit sich Kosten nicht mit dem Ruf selbst aufschaukeln.
export function baseMult() {
  let m = staffGlobalMult() * fameMult() * djMult() * rivalMult();
  if (raidActive()) m *= 0.05;
  return m;
}
export function baseIncomePerSec() {
  let sum = 0;
  for (const st of STATIONS) sum += stationIncome(st.id);
  return sum * baseMult();
}
export function globalMult() {
  let m = baseMult();
  m *= REP.multAt(state.rep);                  // Ruf schlägt direkt aufs Geschäft durch
  m *= state.nightMult || 1;                   // temporärer Schub aus Vorfällen
  m *= 0.55 + 0.75 * nightPeak();              // Kurve der Nacht: leer → Peak → Ausklang
  if (boostActive()) m *= BOOST.mult;
  if (dropActive()) m *= DROP.mult;
  if (eventActive()) m *= eventMult();
  return m;
}

// ---- Globale Rangliste (Rivalen) -----------------------------------
export function rivalMult() { return 1 + (state.rivals?.beaten?.length || 0) * RIVAL_OVERTAKE_MULT; }
export function playerWorth() { return state.lifetime; }
// Rangliste absteigend nach Vermögen, Spieler eingefügt
export function rivalBoard() {
  const pw = playerWorth();
  const rows = RIVALS.map(r => ({ id: r.id, name: r.name, worth: r.worth, gems: r.gems, isPlayer: false, beaten: (state.rivals?.beaten || []).includes(r.id) }));
  rows.push({ id: 'player', name: 'DU', worth: pw, isPlayer: true });
  rows.sort((a, b) => b.worth - a.worth);
  return rows;
}
export function rivalRank() {
  const pw = playerWorth();
  let rank = 1;
  for (const r of RIVALS) if (r.worth > pw) rank++;
  return rank;                              // 1 = Weltspitze
}
export function nextRival() {
  const pw = playerWorth();
  let best = null;
  for (const r of RIVALS) if (r.worth > pw && (!best || r.worth < best.worth)) best = r;
  return best;                             // der nächste zu überholende (oder null = ganz oben)
}
// prüft Überholmanöver, vergibt einmalige Belohnungen
export function checkRivals() {
  const pw = playerWorth();
  const beaten = state.rivals.beaten || (state.rivals.beaten = []);
  let gems = 0, newly = [];
  for (const r of RIVALS) {
    if (r.worth <= pw && !beaten.includes(r.id)) { beaten.push(r.id); gems += r.gems; newly.push(r); }
  }
  if (!state.rivals.seeded) {   // erster Lauf (neues Spiel ODER Alt-Save): Bestand still nachtragen
    state.rivals.seeded = true;
    return;
  }
  if (!newly.length) { if (rivalRank() <= 3) storyFire('nemesisIntro'); return; }
  state.gems += gems;
  const top = newly.reduce((a, b) => (b.worth > a.worth ? b : a));
  emit('rivalBeaten', { name: top.name, gems, count: newly.length, rank: rivalRank() });
  if (newly.some(r => r.id === NEMESIS.id)) storyFire('nemesisBeaten');
  else if (rivalRank() <= 3) storyFire('nemesisIntro');
}

// ---- Untergrund-Wirtschaft („Das Hinterzimmer") --------------------
export function undergroundUnlocked() {
  if (state.underground.unlocked) return true;
  if (state.level >= UNDERGROUND_REQ.level) { state.underground.unlocked = true; return true; }
  return false;
}
export function jobStake(job) { return Math.max(50, incomePerSec() * job.stakeSec); }
export function jobReward(job) { return jobStake(job) * job.reward; }
export function jobFailChance(job) { return Math.min(0.85, job.risk + (state.underground.heat / HEAT_MAX) * 0.4); }
// Wie oft muss man die Ware durch den Raum tragen (größere Jobs = mehr Fuhren)
export function jobTrips(job) { return Math.max(2, Math.min(6, Math.round(job.dur / 60) + 1)); }
export function activeJob() {
  const u = state.underground;
  if (!u.job) return null;
  const def = UNDERGROUND_JOBS.find(j => j.id === u.job.id);
  return def ? { def, stake: u.job.stake, progress: u.job.progress || 0, trips: jobTrips(def) } : null;
}
export function startJob(id) {
  const u = state.underground;
  if (u.job || !undergroundUnlocked()) return false;
  const job = UNDERGROUND_JOBS.find(j => j.id === id);
  if (!job) return false;
  const stake = jobStake(job);
  if (state.money < stake) return false;
  state.money -= stake;
  u.job = { id, stake, progress: 0 };   // wird durch aktives Durch-den-Raum-Tragen erfüllt
  u.lastResult = null;
  save();
  return true;
}
// eine Fuhre erfolgreich an der Polizei vorbei ans andere Raumende gebracht
export function deliverGoods() {
  const u = state.underground;
  if (!u.job) return null;
  const def = UNDERGROUND_JOBS.find(j => j.id === u.job.id);
  u.job.progress = (u.job.progress || 0) + 1 / jobTrips(def);
  if (u.job.progress >= 1) { resolveJob(); return { done: true }; }
  save();
  return { done: false, progress: u.job.progress };
}
// erwischt & gestellt: Einsatz weg + sofortige Club-Razzia
export function surrenderJob() {
  const u = state.underground;
  if (!u.job) return false;
  const def = UNDERGROUND_JOBS.find(j => j.id === u.job.id);
  const stake = u.job.stake;
  u.job = null;
  u.heat = Math.min(HEAT_MAX, u.heat + def.heat * 1.4);
  state.raidUntil = Date.now() + RAID_DUR * 1000;
  u.lastResult = { ok: false, busted: true, name: def.name, lost: stake };
  emit('ugDone', u.lastResult);
  emit('raid', { left: RAID_DUR, reason: 'busted' });
  save();
  return true;
}
// bestechen: Geld zahlen → keine Razzia, +Heat, Auftrag läuft WEITER
export function bribeCost() { const u = state.underground; return u.job ? Math.max(100, u.job.stake * BRIBE_MULT) : 0; }
export function bribeJob() {
  const u = state.underground;
  if (!u.job) return false;
  const cost = bribeCost();
  if (state.money < cost) return false;
  state.money -= cost;
  u.heat = Math.min(HEAT_MAX, u.heat + 10);
  save();
  return true;
}
// Ware fallen lassen & fliehen: Auftrag weg (Einsatz futsch), aber KEINE Razzia
export function dropAndFlee() {
  const u = state.underground;
  if (!u.job) return false;
  const def = UNDERGROUND_JOBS.find(j => j.id === u.job.id);
  const stake = u.job.stake;
  u.job = null;
  u.heat = Math.min(HEAT_MAX, u.heat + def.heat * 0.6);
  u.lastResult = { ok: false, fled: true, name: def.name, lost: stake };
  emit('ugDone', u.lastResult);
  save();
  return true;
}
// den Polizisten ausschalten — geht nur selten (lange Abklingzeit)
export function takedownAvailable() { return Date.now() >= (state.underground.takedownCdUntil || 0); }
export function takedownLeft() { return Math.max(0, ((state.underground.takedownCdUntil || 0) - Date.now()) / 1000); }
export function doTakedown() {
  if (!takedownAvailable()) return false;
  state.underground.takedownCdUntil = Date.now() + TAKEDOWN_CD * 1000;
  state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + 15);
  save();
  return true;
}
// Leiche an einem Ort entsorgen — je nach Ort wird sie evtl. gefunden (→ verzögerte Razzia)
export function disposeBody(spotRisk) {
  const found = Math.random() < spotRisk;
  if (found) {
    const [a, b] = BODY_RAID_DELAY;
    state.underground.pendingRaidAt = Date.now() + (a + Math.random() * (b - a)) * 1000;
  }
  save();
  return { found };
}
// Auftrag komplett durchgeschmuggelt → Erfolg
function resolveJob() {
  const u = state.underground;
  const def = UNDERGROUND_JOBS.find(j => j.id === u.job.id);
  const stake = u.job.stake;
  u.job = null;
  u.heat = Math.min(HEAT_MAX, u.heat + def.heat);
  u.done = (u.done || 0) + 1;
  const gain = stake * def.reward;
  addMoney(gain, 'underground');
  u.lastResult = { ok: true, name: def.name, gain };
  emit('ugDone', u.lastResult);
  save();
}
// Anteil des Polizei-Zyklus, in dem geschaut wird (Risiko + Heat machen es enger/gefährlicher)
export function ugDangerFrac() {
  const aj = state.underground.job;
  const risk = aj ? (UNDERGROUND_JOBS.find(j => j.id === aj.id)?.risk || 0.15) : 0.15;
  return Math.min(0.6, 0.16 + risk + (state.underground.heat / HEAT_MAX) * 0.25);
}

// ================================================================
//  Schwarzmarkt-Business: Lager, Beschaffungs-Run, Feilsch-Engine
// ================================================================
let _uid = 1;
export function dealerRep() { return state.dealer.rep || 0; }
export function calcValue(item) {   // item: { goodId, cond }
  const g = goodById(item.goodId); if (!g) return 0;
  return Math.round(g.baseValue * item.cond * g.rarityMult);
}
export function stockList() { return state.dealer.stock || []; }
export function stockCount() { return (state.dealer.stock || []).length; }
export function stockByCat() {
  const o = { weapons: 0, drugs: 0, fenced: 0 };
  for (const it of state.dealer.stock || []) { const g = goodById(it.goodId); if (g) o[g.cat] = (o[g.cat] || 0) + 1; }
  return o;
}
function addStock(goodId, cond) { const it = { uid: _uid++, goodId, cond }; state.dealer.stock.push(it); return it; }

// ---- Beschaffungs-Run (Stealth-Gauntlet) -----------------------
export function runStakeFor(cat) { const c = SOURCING.cats[cat]; return c ? Math.max(80, Math.round(incomePerSec() * c.stakeSec)) : 0; }
export function activeRun() { return state.dealer.run; }
export function startRun(cat) {
  if (state.dealer.run || !SOURCING.cats[cat] || !undergroundUnlocked()) return false;
  const stake = runStakeFor(cat);
  if (state.money < stake) return false;
  state.money -= stake;
  state.dealer.run = { cat, stake, stage: 'infil', loot: 0 };   // stage: infil → (Stash) haul → done
  storyFire('firstRun');
  emit('runStart', { cat });
  save();
  return true;
}
// Ware am Stash aufgenommen (Rückweg beginnt)
export function grabLoot() { const r = state.dealer.run; if (r) { r.stage = 'haul'; save(); } }
// Extraktion erreicht → Beute ins Lager, Erfolg
export function finishRun() {
  const r = state.dealer.run; if (!r) return null;
  const c = SOURCING.cats[r.cat], pool = DEAL_GOODS[c.lootFrom];
  const [a, b] = c.lootQty, qty = a + Math.floor(Math.random() * (b - a + 1));
  const got = [];
  for (let i = 0; i < qty; i++) {
    const g = pool[Math.floor(Math.random() * pool.length)];
    const cond = 0.7 + Math.random() * 0.3;
    got.push(addStock(g.id, cond));
  }
  state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + c.heat);
  state.dealer.run = null;
  state.dealer.lastRun = { cat: r.cat, qty };
  state.dealer.runsDone = (state.dealer.runsDone || 0) + 1;
  (state.dealer.catsRun || (state.dealer.catsRun = {}))[r.cat] = true;
  emit('runDone', { cat: r.cat, qty });
  checkUgPhase();
  save();
  return { qty, got };
}
export function runBribeCost() { const r = state.dealer.run; return r ? Math.max(150, Math.round(r.stake * BRIBE_MULT)) : 0; }
export function runBribe() {   // Wache bestechen → Run läuft weiter, +Heat, keine Razzia
  const r = state.dealer.run; if (!r) return false;
  const cost = runBribeCost();
  if (state.money < cost) return false;
  state.money -= cost;
  state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + 10);
  save();
  return true;
}
// Run abbrechen (erwischt/fliehen): Einsatz weg, keine Beute
export function abortRun(busted) {
  const r = state.dealer.run; if (!r) return false;
  const c = SOURCING.cats[r.cat];
  state.dealer.run = null;
  if (busted) {
    state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + c.heat * 1.2);
    state.raidUntil = Date.now() + RAID_DUR * 1000;
    emit('raid', { left: RAID_DUR, reason: 'busted' });
  } else {
    state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + c.heat * 0.5);
  }
  emit('runAbort', { busted: !!busted });
  save();
  return true;
}

// ---- Festnahme / harte Strafe (Ego-Shooter-Run) ----------------
export function dealerJailed() { return Date.now() < (state.dealer.jailUntil || 0); }
export function jailLeft() { return Math.max(0, ((state.dealer.jailUntil || 0) - Date.now()) / 1000); }
// Erwischt/erschossen → alle vier Strafen: Kaution, Lager-Beschlagnahme, Heat-Explosion, Festnahme+Razzia
export function bustPenalty(cat) {
  const P = BUST_PENALTY, m = P.catMult[cat] || 1;
  const bail = Math.min(state.money, Math.max(P.bailMin, Math.round(state.money * P.bailFrac * m)));
  state.money = Math.max(0, state.money - bail);
  const stock = state.dealer.stock || [], lose = Math.min(stock.length, Math.round(stock.length * P.stockLossFrac * m));
  let seized = 0;
  for (let i = 0; i < lose && stock.length; i++) { stock.splice(Math.floor(Math.random() * stock.length), 1); seized++; }
  state.underground.heat = Math.min(HEAT_MAX, Math.max(state.underground.heat, P.heatTo));
  const raid = Math.round(RAID_DUR * P.raidMult), jail = Math.round(P.jailSec * m);
  state.raidUntil = Date.now() + raid * 1000;
  state.dealer.jailUntil = Date.now() + jail * 1000;
  state.dealer.run = null;
  const res = { cat, bail, seized, jail, raid, heat: Math.round(P.heatTo) };
  state.dealer.lastBust = res;
  storyFire('firstBust');
  emit('runBust', res);
  emit('raid', { left: raid, reason: 'busted' });
  save();
  return res;
}

// ---- Story-Beats & Zwei-Wege-Ziele (Nordstern) -----------------
export function storyFire(id) {
  if (!STORY[id] || (state.storySeen && state.storySeen[id])) return false;
  (state.storySeen || (state.storySeen = {}))[id] = true;
  emit('story', { id, ...STORY[id] });
  save();
  return true;
}
function ugQuestVal(q) {
  const d = state.dealer;
  if (q.t === 'runs') return d.runsDone || 0;
  if (q.t === 'sold') return d.served || 0;
  if (q.t === 'rep') return Math.round(d.rep || 0);
  if (q.t === 'cat') return (d.catsRun && d.catsRun[q.v]) ? 1 : 0;
  return 0;
}
function ugQuestDone(q) { return q.t === 'cat' ? ugQuestVal(q) >= 1 : ugQuestVal(q) >= q.v; }
export function ugPhaseInfo() {
  const ph = getUgPhase(state.ugPhase), done = ph.quests.filter(ugQuestDone).length;
  return { idx: state.ugPhase, name: ph.name, quests: ph.quests.map(q => ({ ...q, val: ugQuestVal(q), done: ugQuestDone(q) })),
    done, total: ph.quests.length, frac: ph.quests.length ? done / ph.quests.length : 0 };
}
export function checkUgPhase() {
  let guard = 0;
  while (guard++ < 20) {
    const ph = getUgPhase(state.ugPhase);
    if (ph.quests.every(ugQuestDone)) { state.ugPhase++; emit('ugPhase', { idx: state.ugPhase, name: getUgPhase(state.ugPhase).name }); }
    else break;
  }
  if (state.ugPhase >= 2) storyFire('bootTease');
  save();
}
// Nordstern: beide Endgame-Wege mit Fortschritt (0..1)
// northStar/nightReport wurden vom Kapitel- und Nacht-System abgelöst.

// ---- Feilsch-Engine (Theke) ------------------------------------
export function offerPrice(item, kind) { return Math.max(1, Math.round(calcValue(item) * (DEAL_CFG.offers[kind] || 1))); }
// nächsten Kunden würfeln (nur wenn Lager nicht leer) → Payload für den Renderer
export function rollCustomer() {
  const stock = state.dealer.stock || [];
  if (!stock.length) return null;
  const item = stock[Math.floor(Math.random() * stock.length)];
  const g = goodById(item.goodId);
  // Archetyp gewichten: passende Sparte bevorzugt, Reputation zieht bessere Kundschaft an
  const repF = 1 + dealerRep() / DEAL_CFG.repMax;   // 1..2
  const pool = [];
  for (const a of CUSTOMER_ARCHETYPES) {
    let w = a.weight;
    if (a.wants) { if (a.wants.includes(g.cat)) w *= 2.2; else w *= 0.15; }
    if (a.budgetMult > 1.6) w *= repF;   // Sammler/Neureich häufiger bei hoher Reputation
    pool.push({ a, w });
  }
  let tot = pool.reduce((s, p) => s + p.w, 0), r = Math.random() * tot, pick = pool[0].a;
  for (const p of pool) { r -= p.w; if (r <= 0) { pick = p.a; break; } }
  return { archId: pick.id, uid: item.uid, goodId: item.goodId, cond: item.cond };
}
// Verhandlung starten: maxWillingToPay + Geduld berechnen, Startangebot = fair
export function beginNegotiation(payload) {
  const arch = CUSTOMER_ARCHETYPES.find(a => a.id === payload.archId);
  const item = (state.dealer.stock || []).find(s => s.uid === payload.uid);
  if (!arch || !item) return null;
  const cv = calcValue(item);
  const [lo, hi] = DEAL_CFG.variance, variance = lo + Math.random() * (hi - lo);
  const budgetCap = Math.round(cv * arch.budgetMult);
  const maxPay = Math.min(budgetCap, Math.round(cv * arch.priceTolerance * variance));
  state.dealer.customer = {
    archId: arch.id, uid: item.uid, goodId: item.goodId, cond: item.cond,
    cv, maxPay, budget: budgetCap, patience: arch.patience, patience0: arch.patience,
    offer: offerPrice(item, 'fair'), phase: 'active', counter: 0, tries: 0,
  };
  return state.dealer.customer;
}
export function currentCustomer() { return state.dealer.customer; }
export function setOffer(kind) { const c = state.dealer.customer; if (c) { const it = { goodId: c.goodId, cond: c.cond }; c.offer = offerPrice(it, kind); } return c && c.offer; }
export function nudgeOffer() {   // „Nachbessern": Angebot senken
  const c = state.dealer.customer; if (!c) return 0;
  c.offer = Math.max(1, Math.round(c.offer - c.cv * DEAL_CFG.nudge));
  return c.offer;
}
// Angebot bewerten → Szenario A–D der Spec
export function submitOffer() {
  const c = state.dealer.customer; if (!c) return { result: 'none' };
  const offer = c.offer;
  if (offer <= c.cv * DEAL_CFG.instantThresh) { finalizeDeal(offer, true); return { result: 'instant', price: offer }; }
  if (offer <= c.maxPay) { finalizeDeal(offer, false); return { result: 'deal', price: offer }; }
  // zu teuer
  const wucher = offer > c.maxPay * DEAL_CFG.wucherThresh;
  c.tries++;
  c.patience -= wucher ? 2 : 1;
  if (wucher && Math.random() < DEAL_CFG.walkoutOnWucher) { walkoutCustomer(); return { result: 'walkout', wucher: true }; }
  if (c.patience <= 0) { walkoutCustomer(); return { result: 'walkout', wucher }; }
  const [lo, hi] = DEAL_CFG.counterRange;
  c.counter = Math.round(c.maxPay * (lo + Math.random() * (hi - lo)));
  c.phase = 'counter';
  return { result: 'counter', counter: c.counter, patience: c.patience, wucher };
}
export function acceptCounter() { const c = state.dealer.customer; if (!c || !c.counter) return false; finalizeDeal(c.counter, false); return true; }
function finalizeDeal(price, instant) {
  const c = state.dealer.customer; if (!c) return;
  state.dealer.stock = (state.dealer.stock || []).filter(s => s.uid !== c.uid);
  addMoney(price, 'dealer');
  state.dealer.rep = Math.min(DEAL_CFG.repMax, state.dealer.rep + (instant ? DEAL_CFG.repGainInstant : DEAL_CFG.repGainDeal));
  state.dealer.served = (state.dealer.served || 0) + 1;
  state.underground.heat = Math.min(HEAT_MAX, state.underground.heat + 2);
  state.dealer.lastDeal = { goodId: c.goodId, price, instant };
  state.dealer.customer = null;
  storyFire('firstDeal');
  emit('dealDone', { ok: true, price, instant });
  checkUgPhase();
  save();
}
function walkoutCustomer() {
  const c = state.dealer.customer; if (!c) return;
  state.dealer.rep = Math.max(0, state.dealer.rep - DEAL_CFG.repLossWalkout);
  state.dealer.customer = null;
  emit('dealDone', { ok: false, walkout: true });
  save();
}
export function dismissCustomer() { state.dealer.customer = null; save(); }   // Kunde weggeschickt (kein Rep-Verlust)
export function custSpawnInterval() {
  const repF = 1 - DEAL_CFG.spawnRepFactor * (dealerRep() / DEAL_CFG.repMax);   // 1..0.5
  const mkt = 1 - Math.min(0.35, (state.marketing || 0) * 0.05);
  return Math.max(3, DEAL_CFG.spawnBase * repF * mkt);
}

// ---- Endgame „Das Boot" (Teaser-Gate) ------------------------------
export function bootProgress() {
  return { fame: state.fame, fameReq: BOOT_REQ.fame, lifetime: state.lifetime, ltReq: BOOT_REQ.lifetime,
    ready: state.fame >= BOOT_REQ.fame && state.lifetime >= BOOT_REQ.lifetime };
}
export function canUnlockBoot() { return !state.bootUnlocked && bootProgress().ready; }
export function unlockBoot() {
  if (!canUnlockBoot()) return false;
  state.bootUnlocked = true;
  state.location = 'boot';
  emit('bootunlocked');
  storyFire('bootOpen');
  save();
  return true;
}
// Standort wechseln (Airport ↔ Boot) — reines Präsentations-Feld, dieselbe Wirtschaft läuft weiter
export function setLocation(loc) {
  if (loc === 'boot' && !state.bootUnlocked) return false;
  state.location = loc === 'boot' ? 'boot' : 'airport';
  save();
  return true;
}

export function incomePerSec() {
  let sum = 0;
  for (const st of STATIONS) sum += stationIncome(st.id);
  return sum * globalMult();
}

export function totalLevels() {
  return Object.values(state.stations).reduce((a, b) => a + b, 0);
}

export function dropDuration() {
  const neon = state.staff.neon || 0;
  return DROP.dur + neon * (STAFF_MAP.neon.dropBonus || 0);
}

// Spielerlevel leitet sich aus dem Lebenszeit-Umsatz ab (bewusst flach)
export function levelFor(lifetime) {
  return 1 + Math.max(0, Math.floor(Math.log(1 + lifetime / 160) / Math.log(2.9)));
}

// ---- Geld ----------------------------------------------------------
const NIGHT_EXCLUDED = new Set(['chest', 'offline', 'night', 'daily', 'shop', 'dev', 'underground', 'dealer']);
export function addMoney(n, source) {
  if (n <= 0) return;
  state.money += n;
  state.lifetime += n;
  // Aufs Nachtziel zählt nur der Betrieb — nicht Truhen, Offline, Shop & Co.
  // Das Ziel misst „wie gut lief der Laden heute", nicht wie viele Geschenke ankamen.
  if (!NIGHT_EXCLUDED.has(source)) state.nightEarned += n;
  const newLevel = levelFor(state.lifetime);
  while (newLevel > state.level) {
    state.level++;
    // Diamanten bewusst selten: nur alle 5 Level ein Diamant
    const gems = state.level % 5 === 0 ? 1 : 0;
    if (gems) state.gems += gems;
    emit('levelup', { level: state.level, gems });
  }
  if (source) emit('money', { n, source });
}

// ---- Stationen kaufen ----------------------------------------------
export function buyInfo(id, mode) { // mode: 1 | 10 | 25 | 'max'
  const st = STATION_MAP[id];
  const lvl = state.stations[id] || 0;
  let count = mode === 'max' ? maxAffordable(st, lvl, state.money) : mode;
  if (mode === 'max' && count === 0) count = 1;
  const cost = bulkCost(st, lvl, count);
  return { count, cost, affordable: state.money >= cost };
}

export function buyStation(id, mode = 1) {
  const { count, cost, affordable } = buyInfo(id, mode);
  if (!affordable) return false;
  const st = STATION_MAP[id];
  if (!roomUnlocked(st.room)) return false;
  const before = state.stations[id] || 0;
  state.money -= cost;
  state.stations[id] = before + count;
  const ms = Math.floor((before + count) / 25) > Math.floor(before / 25);
  emit('buy', { id, count, level: state.stations[id], milestone: ms });
  if (ms) emit('milestone', { id, level: state.stations[id] });
  save();
  return true;
}

// ---- Räume freischalten ------------------------------------------
export function canUnlockT2() {
  return !state.t2Unlocked && state.level >= T2_REQ.level && state.money >= T2_REQ.cost;
}
export function unlockT2() {
  if (state.t2Unlocked) return false;
  if (state.level < T2_REQ.level || state.money < T2_REQ.cost) return false;
  state.money -= T2_REQ.cost;
  state.t2Unlocked = true;
  emit('t2unlocked');
  save();
  return true;
}

export function canUnlockRoof() {
  return state.t2Unlocked && !state.roofUnlocked && state.level >= ROOF_REQ.level && state.money >= ROOF_REQ.cost;
}
export function unlockRoof() {
  if (state.roofUnlocked || !state.t2Unlocked) return false;
  if (state.level < ROOF_REQ.level || state.money < ROOF_REQ.cost) return false;
  state.money -= ROOF_REQ.cost;
  state.roofUnlocked = true;
  emit('roofunlocked');
  save();
  return true;
}

// ---- Show-Act (bewegliche Tänzerin) -------------------------------
export function canUnlockPerformer() {
  return !state.performer.unlocked && state.level >= PERFORMER.level && state.money >= PERFORMER.cost;
}
export function unlockPerformer() {
  if (state.performer.unlocked) return false;
  if (state.level < PERFORMER.level || state.money < PERFORMER.cost) return false;
  state.money -= PERFORMER.cost;
  state.performer.unlocked = true;
  state.performer.room = 't1';
  emit('performer');
  save();
  return true;
}
export function setPerformerRoom(roomId) {
  if (!state.performer.unlocked || !roomUnlocked(roomId)) return false;
  state.performer.room = roomId;
  emit('performer');
  save();
  return true;
}

// ---- Personal ---------------------------------------------------------
export function staffCost(id) {
  const s = STAFF_MAP[id];
  const lvl = state.staff[id] || 0;
  return s.baseCost * Math.pow(s.growth, lvl);
}
export function hireStaff(id) {
  const s = STAFF_MAP[id];
  const lvl = state.staff[id] || 0;
  if (lvl >= s.max) return false;
  const cost = staffCost(id);
  if (state.money < cost) return false;
  state.money -= cost;
  state.staff[id] = lvl + 1;
  emit('staff', { id, level: state.staff[id] });
  save();
  return true;
}

// ---- Club-Ausbau (Gebäude vergrößern) ---------------------------------
export function clubExpandCost() {
  return CLUB_EXPAND.baseCost * Math.pow(CLUB_EXPAND.growth, state.clubSize);
}
export function buyClubExpand() {
  if (state.clubSize >= CLUB_EXPAND.max) return false;
  const cost = clubExpandCost();
  if (state.money < cost) return false;
  state.money -= cost;
  state.clubSize++;
  emit('clubexpand', { size: state.clubSize });
  save();
  return true;
}

// ---- Auto-Kassierer ---------------------------------------------------
export function autoCollectCost() {
  return AUTOCOLLECT.baseCost * Math.pow(AUTOCOLLECT.growth, state.autoCollect);
}
export function buyAutoCollect() {
  if (state.autoCollect >= AUTOCOLLECT.max) return false;
  const cost = autoCollectCost();
  if (state.money < cost) return false;
  state.money -= cost;
  state.autoCollect++;
  emit('autocollect', { level: state.autoCollect });
  save();
  return true;
}

// ---- Marketing (mehr & schnellere Gäste) ------------------------------
export function marketingLevel() { return state.marketing || 0; }
export function marketingCostNext() { return marketingCost(state.marketing || 0); }
export function marketingGuestBonus() { return (state.marketing || 0) * MARKETING.guestsPerLevel; }
export function marketingSpawnBonus() { return (state.marketing || 0) * MARKETING.spawnPerLevel; }
export function buyMarketing() {
  if ((state.marketing || 0) >= MARKETING.max) return false;
  const cost = marketingCostNext();
  if (state.money < cost) return false;
  state.money -= cost;
  state.marketing = (state.marketing || 0) + 1;
  emit('marketing', { level: state.marketing });
  save();
  return true;
}

// ---- DJs anheuern & auswählen -----------------------------------------
export function djsOwned() { return state.djsOwned || ['resident']; }
export function activeDjId() { return state.activeDj || 'resident'; }
export function activeDjDef() { return DJ_MAP[activeDjId()] || DJ_MAP.resident; }
export function djMult() { return activeDjDef().mult || 1; }
export function djOwned(id) { return djsOwned().includes(id); }
export function hireDj(id) {
  const dj = DJ_MAP[id]; if (!dj || djOwned(id)) return false;
  if (state.money < dj.cost) return false;
  state.money -= dj.cost;
  (state.djsOwned ||= ['resident']).push(id);
  setActiveDj(id);
  emit('dj', { id, hired: true });
  save();
  return true;
}
export function setActiveDj(id) {
  if (!djOwned(id)) return false;
  state.activeDj = id;
  const dj = DJ_MAP[id];
  if (dj && dj.style) { state.settings.musicStyle = dj.style; emit('musicstyle', { style: dj.style }); }
  emit('dj', { id, active: true });
  save();
  return true;
}

// ---- Bar-Getränke (Signature-Drink hebt Bar-Einkommen) ----------------
export function currentDrink() { return DRINKS[drinkTier(state.stations.bar || 0)]; }
export function nextDrink() { const t = drinkTier(state.stations.bar || 0); return DRINKS[t + 1] || null; }
export function drinkMult() { return 1 + drinkTier(state.stations.bar || 0) * 0.18; }

// ---- Club-Themes (freischaltbare Dancefloor-Looks) --------------------
// Saison-Themes lassen sich nur in ihrem Zeitfenster NEU freischalten (danach dauerhaft nutzbar,
// unabhängig von der Saison — kein nachträgliches Wegnehmen bereits gekaufter Looks).
export function themeInSeason(id) { const th = THEME_MAP[id]; return !th?.season || inSeasonWindow(th.season.from, th.season.to); }
export function themeUnlocked(id) {
  const th = THEME_MAP[id];
  if (!th) return false;
  if (th.season && !themeOwned(id) && !themeInSeason(id)) return false;
  return state.lifetime >= th.req;
}
export function themeOwned(id) { return (state.themesOwned || ['classic']).includes(id); }
export function unlockTheme(id) {
  if (themeOwned(id) || !themeUnlocked(id)) return false;
  (state.themesOwned ||= ['classic']).push(id); setTheme(id); emit('theme', { id }); save(); return true;
}
export function setTheme(id) { if (!themeOwned(id)) return false; state.clubTheme = id; emit('theme', { id, active: true }); save(); return true; }
export function activeTheme() { return THEME_MAP[state.clubTheme] || THEME_MAP.classic; }

// ---- Boost -------------------------------------------------------------
export function boostState() {
  const now = Date.now();
  if (now < state.boostUntil) return { st: 'active', left: (state.boostUntil - now) / 1000 };
  if (now < state.boostCdUntil) return { st: 'cooldown', left: (state.boostCdUntil - now) / 1000 };
  return { st: 'ready', left: 0 };
}
export function startBoost(force = false) {
  const bs = boostState();
  if (bs.st === 'active') return false;
  if (bs.st === 'cooldown' && !force) return false;
  state.boostUntil = Date.now() + BOOST.dur * 1000;
  state.boostCdUntil = state.boostUntil + BOOST.cd * 1000;
  state.stats.boostsUsed++;
  emit('boost');
  save();
  return true;
}

// ---- Stations-Kassen (Gäste kaufen → Geld liegt am Stand) -------------------
// Nur Konsum-Stationen erzeugen Pins; Eintritt (einlass/vipEinlass) läuft passiv.
export function depositAtStation(id) {
  if (!CASH_STATIONS.includes(id)) return 0;
  const income = stationIncome(id) * globalMult();
  if (income <= 0) return 0;
  const amount = income * (2 + Math.random() * 2);
  const cap = income * 24; // max. 24 s Stations-Einkommen pro Kasse
  const cur = state.stationCash[id] || 0;
  const add = Math.min(amount, Math.max(0, cap - cur));
  if (add <= 0) return 0;
  state.stationCash[id] = cur + add;
  return add;
}

// Combo: schnell hintereinander selbst eingesammelte Kassen geben Bonus (Auto-Kassierer nicht)
let comboN = 0, comboLast = 0;
export function comboInfo() { return { n: comboN, mult: 1 + Math.min(10, Math.max(0, comboN - 1)) * 0.08 }; }
export function collectStation(id, manual = false) {
  const base = state.stationCash[id] || 0;
  if (base <= 0) return 0;
  state.stationCash[id] = 0;
  let amount = base;
  if (manual) {
    const now = Date.now();
    comboN = (now - comboLast < 2500) ? comboN + 1 : 1;
    comboLast = now;
    const mult = 1 + Math.min(10, comboN - 1) * 0.08;      // bis zu +80 % bei Combo ×11
    amount = base * mult;
    if (comboN >= 2) emit('combo', { n: comboN, mult, bonus: amount - base });
  }
  addMoney(amount, 'collect');
  emit('collect', { id, amount });
  return amount;
}

export function totalStationCash() {
  return Object.values(state.stationCash).reduce((a, b) => a + b, 0);
}

// ---- Hype & DROP ----------------------------------------------------------
// Hype baut sich AUTOMATISCH durch den Betrieb auf (kein Tippen!):
// mehr Gäste/DJ/Ausbau/Tänzerin/Events → schneller voll → DROP.
export function hypeFillSeconds() {
  let base = Math.max(30, 100 - (state.stations.dj || 0) * 1.0 - totalLevels() * 0.03);
  if (state.performer.unlocked) base /= PERFORMER.hypeMult;
  if (eventActive()) base *= 0.55;   // Events heizen den Hype an
  return base;
}
export function tapHype() { return 0; }   // (deaktiviert – Hype entsteht nicht mehr durch Tippen)
export function triggerDrop() {
  state.hype = 0;
  state.dropUntil = Date.now() + dropDuration() * 1000;
  state.stats.drops++;
  emit('drop');
}

// ---- Promi-Gast -------------------------------------------------------------
function scheduleCeleb() {
  const gap = CELEB.minGap + Math.random() * (CELEB.maxGap - CELEB.minGap);
  state.nextCelebAt = Date.now() + gap * 1000;
}
export function tapCeleb() {
  if (!state.celeb) return null;
  state.celeb = null;
  state.stats.celebs++;
  scheduleCeleb();
  const money = incomePerSec() * (12 + Math.random() * 13);
  const gems = Math.random() < 0.15 ? 1 : 0;
  addMoney(money, 'celeb');
  state.gems += gems;
  emit('celeb', { money, gems });
  save();
  return { money, gems };
}

// ---- Live-Events (Happy Hour / Rush) ---------------------------------------
function scheduleEvent() {
  const gap = EVENT_GAP.min + Math.random() * (EVENT_GAP.max - EVENT_GAP.min);
  state.nextEventAt = Date.now() + gap * 1000;
}
export function startRandomEvent() {
  const def = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  state.event = { id: def.id, expires: Date.now() + def.dur * 1000 };
  scheduleEvent();
  emit('event', def);
}

// ---- Diamant-Shop --------------------------------------------------------------
export function buyShopItem(id) {
  const item = SHOP.find(i => i.id === id);
  if (!item || state.gems < item.gems) return false;
  if (id === 'boost' && boostState().st === 'active') return false;
  state.gems -= item.gems;
  if (item.minutes) {
    const money = incomePerSec() * 60 * item.minutes;
    addMoney(money, 'shop');
    emit('shopCash', { money });
  } else if (id === 'boost') {
    startBoost(true);
  } else if (id === 'drop') {
    triggerDrop();
  }
  save();
  return true;
}

// ---- Täglicher Bonus & Glücksrad -------------------------------------------
export function dailyDue() {
  return Date.now() - (state.daily.lastClaim || 0) >= DAILY_MIN_GAP_H * 3600 * 1000;
}
// liefert Index des Rad-Segments (Zufall) — die UI dreht optisch dorthin
export function spinWheelIndex() {
  return Math.floor(Math.random() * WHEEL.length);
}
export function claimWheel(index) {
  if (!dailyDue()) return null;
  const seg = WHEEL[index];
  // Streak pflegen (innerhalb 48 h fortsetzen, sonst Reset)
  const gap = Date.now() - (state.daily.lastClaim || 0);
  state.daily.streak = gap <= 48 * 3600 * 1000 ? Math.min(DAILY_STREAK_MAX, (state.daily.streak || 0) + 1) : 1;
  state.daily.lastClaim = Date.now();
  const streakMult = 1 + (state.daily.streak - 1) * 0.15;
  const result = { streak: state.daily.streak, seg };
  if (seg.type === 'money') {
    const money = Math.max(200, incomePerSec() * 60 * seg.minutes) * streakMult;
    addMoney(money, 'daily'); result.money = money;
  } else if (seg.type === 'gems') {
    const gems = Math.ceil(seg.gems * streakMult); state.gems += gems; result.gems = gems;
  } else if (seg.type === 'boost') {
    startBoost(true); result.boost = true;
  } else if (seg.type === 'drop') {
    triggerDrop(); result.drop = true;
  }
  save();
  return result;
}

// ---- Erfolge / Achievements ------------------------------------------------
export function achievementDone(a) { return questValue(a) >= a.v; }
export function claimAchievement(id) {
  if (state.achievements[id]) return false;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a || !achievementDone(a)) return false;
  state.achievements[id] = true;
  state.gems += a.gems;
  emit('achievement', a);
  save();
  return true;
}
export function achievementsInfo() {
  return ACHIEVEMENTS.map(a => ({
    ...a,
    done: achievementDone(a),
    claimed: !!state.achievements[a.id],
    value: Math.min(questValue(a), a.v),
  }));
}

// ---- Quests & Phasen --------------------------------------------------------------
export function questValue(q) {
  switch (q.t) {
    case 'station':     return state.stations[q.id] || 0;
    case 'levels':      return totalLevels();
    case 'earn':        return state.lifetime;
    case 'income':      return incomePerSec();
    case 'level':       return state.level;
    case 'staff':       return Object.values(state.staff).filter(l => l > 0).length;
    case 'staffLevels': return Object.values(state.staff).reduce((a, b) => a + b, 0);
    case 'drops':       return state.stats.drops;
    case 'celebs':      return state.stats.celebs;
    case 'boosts':      return state.stats.boostsUsed;
    case 't2':          return state.t2Unlocked ? 1 : 0;
    case 'roof':        return state.roofUnlocked ? 1 : 0;
    case 'fame':        return state.fame;
    default:            return 0;
  }
}

export function phaseInfo() {
  const phase = getPhase(state.phase);
  const quests = phase.quests.map((q, i) => {
    const key = `${state.phase}:${i}`;
    const done = state.questsDone[key] || questValue(q) >= q.v;
    return { ...q, i, done, value: Math.min(questValue(q), q.v) };
  });
  const doneCount = quests.filter(q => q.done).length;
  return { name: phase.name, idx: state.phase, quests, doneCount, total: quests.length };
}

function checkQuests() {
  const phase = getPhase(state.phase);
  let changed = false;
  phase.quests.forEach((q, i) => {
    const key = `${state.phase}:${i}`;
    if (!state.questsDone[key] && questValue(q) >= q.v) {
      state.questsDone[key] = true;
      changed = true;
      emit('quest', { txt: q.txt });
    }
  });
  const done = phase.quests.filter((q, i) => state.questsDone[`${state.phase}:${i}`]).length;
  const total = phase.quests.length;

  if (!state.midChestClaimed && done >= Math.ceil(total / 2) && done < total) {
    state.midChestClaimed = true;
    openChest('mid');
  }
  if (done >= total) {
    if (!state.midChestClaimed) { state.midChestClaimed = true; openChest('mid'); }
    openChest('end');
    state.phase++;
    state.midChestClaimed = false;
    emit('phase', { idx: state.phase, name: getPhase(state.phase).name });
  }
  if (changed) save();
}

function openChest(kind) {
  const r = chestReward(state.phase, kind);
  const money = Math.max(100, incomePerSec() * 60 * r.minutes);
  state.gems += r.gems;
  addMoney(money, 'chest');
  state.stats.chests++;
  emit('chest', { kind, gems: r.gems, money });
}

// ---- Prestige ("Neueröffnung") ---------------------------------------------------
export function prestigeStars() {
  return Math.floor(Math.sqrt(state.lifetime / PRESTIGE.div));
}
export function prestigeInfo() {
  const totalStars = prestigeStars();
  return {
    available: state.level >= PRESTIGE.minLevel && totalStars > state.fame,
    minLevel: PRESTIGE.minLevel,
    gain: Math.max(0, totalStars - state.fame),
    current: state.fame,
  };
}
export function doPrestige() {
  const info = prestigeInfo();
  if (!info.available) return false;
  state.fame += info.gain;
  state.money = 25;
  state.stations = freshStations();
  state.staff = {};
  state.t2Unlocked = false;
  state.roofUnlocked = false;
  state.stationCash = {};
  state.autoCollect = 0;
  state.marketing = 0;          // Marketing zurück (DJs bleiben angeheuert)
  state.clubSize = 0;
  state.performer.room = 't1';   // Tänzerin bleibt engagiert, zurück auf Mainfloor
  state.hype = 0;
  state.event = null;
  state.boostUntil = 0; state.boostCdUntil = 0; state.dropUntil = 0;
  state.celeb = null;
  state.stats.prestiges++;
  emit('prestige', { fame: state.fame, gain: info.gain });
  save();
  return true;
}

// ---- Game-Loop ------------------------------------------------------------------
let lastTick = 0;
let questTimer = 0;
let saveTimer = 0;
let autoTimer = 0;

export function tick(now) {
  if (!lastTick) lastTick = now;
  const dt = Math.min(1, (now - lastTick) / 1000);
  lastTick = now;
  if (dt <= 0) return;

  advanceClock(dt);            // Die Nacht läuft — Ziel, Vorfälle, Nachtende
  addMoney(incomePerSec() * dt);

  // Hype füllt sich automatisch → regelmäßiger DROP ohne Tippen
  if (!dropActive()) {
    state.hype += (100 / hypeFillSeconds()) * dt;
    if (state.hype >= 100) triggerDrop();
  }

  // Auto-Kassierer sammelt Pins ein
  if (state.autoCollect > 0) {
    autoTimer += dt;
    if (autoTimer >= autoCollectInterval(state.autoCollect)) {
      autoTimer = 0;
      for (const id of CASH_STATIONS) if ((state.stationCash[id] || 0) > 0) collectStation(id);
    }
  }

  // Promi-Gast
  const nowMs = Date.now();
  if (state.celeb && nowMs > state.celeb.expires) {
    state.celeb = null; scheduleCeleb(); emit('celebGone');
  }
  if (!state.celeb && nowMs > state.nextCelebAt) {
    state.celeb = { expires: nowMs + CELEB.stay * 1000, seed: Math.random() };
    emit('celebSpawn');
  }

  // Live-Events
  if (state.event && nowMs > state.event.expires) { state.event = null; emit('eventEnd'); }
  if (!state.event && nowMs > state.nextEventAt) startRandomEvent();

  // Untergrund: Jobs werden aktiv im Hinterzimmer erledigt, Heat kühlt ab
  if (state.underground.heat > 0) state.underground.heat = Math.max(0, state.underground.heat - HEAT_DECAY * dt);
  // gefundene Leiche → verzögerte Razzia schlägt jetzt zu
  if (state.underground.pendingRaidAt && nowMs >= state.underground.pendingRaidAt) {
    state.underground.pendingRaidAt = 0;
    if (!raidActive()) { state.raidUntil = nowMs + RAID_DUR * 1000; emit('raid', { left: RAID_DUR, reason: 'body' }); }
  }

  questTimer += dt;
  if (questTimer > 0.5) { questTimer = 0; checkQuests(); checkRivals(); }

  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; save(); }
}

// ---- Goldene Flasche (Zufalls-Bonus zum Antippen) ---------------------------------
export function goldenBottleReward() {
  const base = Math.max(400, incomePerSec() * 45) * (1.2 + Math.random() * 1.3);
  const gems = Math.random() < 0.15 ? 1 : 0;
  addMoney(base, 'gold');
  if (gems) state.gems += gems;
  save();
  return { money: base, gems };
}

// ---- Nacht-Report (Club-Nacht 22:00 → 02:00 durchgezogen) -------------------------

// ---- Dev-Modus (per Code in den Einstellungen) ------------------------------------
const DEV_CODE = '1337';
export function devActive() { return !!state.devMode; }
export function enterDevCode(code) {
  if (String(code).trim() !== DEV_CODE) return false;
  state.devMode = true; save();
  return true;
}
export function devAction(kind) {
  if (!state.devMode) return false;
  switch (kind) {
    case 'money1m':  addMoney(1e6, 'dev'); break;
    case 'money1b':  addMoney(1e9, 'dev'); break;
    case 'gems':     state.gems += 100; break;
    case 'level10': {                                  // Lifetime hochziehen, bis Level +10 erreicht ist
      const target = state.level + 10;
      let lt = Math.max(100, state.lifetime);
      while (levelFor(lt) < target) lt *= 1.35;
      state.lifetime = lt; state.level = levelFor(lt);
      emit('level', state.level);
      break;
    }
    case 'unlockAll':
      state.t2Unlocked = true; state.roofUnlocked = true;
      state.performer.unlocked = true;
      state.djsOwned = DJS.map(d => d.id);
      state.themesOwned = CLUB_THEMES.map(t => t.id);
      emit('t2'); emit('roof'); break;
    case 'maxClub':
      state.clubSize = CLUB_EXPAND.max;
      state.autoCollect = AUTOCOLLECT.max;
      state.marketing = MARKETING.max;
      break;
    case 'stations10':
      for (const s of STATIONS) if (state.stations[s.id] > 0 || s.id === 'einlass') state.stations[s.id] = (state.stations[s.id] || 0) + 10;
      break;
    case 'resetNight': state.nightStreak = 0; break;
  }
  save();
  return true;
}

// ---- Speichern & Laden ------------------------------------------------------------
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch (e) { /* Speicher voll/blockiert – Spiel läuft weiter */ }
}
let savePending = null;
// Häufige Käufe/Level-Ups würden sonst bei jedem Klick synchron JSON.stringify + localStorage
// auslösen; hier gebündelt auf max. 1 Schreibzugriff alle 400ms.
export function save() {
  if (savePending) return;
  savePending = setTimeout(() => { savePending = null; writeSave(); }, 400);
}
// Sofort-Speicherung für Fälle, in denen die Seite direkt danach beendet werden könnte
// (Tab-Wechsel/Hintergrund) oder ein Test/Reset unmittelbar danach den Spielstand liest.
export function saveNow() {
  if (savePending) { clearTimeout(savePending); savePending = null; }
  writeSave();
}

export function load() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const ts = data.ts || Date.now();
    delete data.ts;
    for (const k of Object.keys(state)) {
      if (data[k] === undefined) continue;
      if (typeof state[k] === 'object' && state[k] !== null && !Array.isArray(state[k])) {
        Object.assign(state[k], data[k]);
      } else {
        state[k] = data[k];
      }
    }
    state.level = Math.max(state.level, levelFor(state.lifetime));
    state.celeb = null;
    state.event = null;
    if (state.dealer) { state.dealer.customer = null; state.dealer.run = null; if (!Array.isArray(state.dealer.stock)) state.dealer.stock = []; }
    // Offline-Einnahmen
    const away = (Date.now() - ts) / 1000;
    if (away > 60) {
      const lea = state.staff.lea || 0;
      const eff = OFFLINE.eff * (1 + lea * (STAFF_MAP.lea.offline || 0));
      const secs = Math.min(away, OFFLINE.cap);
      const money = incomePerSec() * secs * eff;
      if (money > 1) return { away: secs, money };
    }
    return { away: 0, money: 0 };
  } catch (e) {
    return null;
  }
}

export function claimOffline(money, doubled) {
  const total = doubled ? money * 2 : money;
  addMoney(total, 'offline');
  save();
  return total;
}

export function resetSave() {
  if (savePending) { clearTimeout(savePending); savePending = null; }   // sonst könnte ein noch ausstehendes save() den Reset überschreiben
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
}

// ============================================================
//  DIE NACHT — Kern-Loop: Ziel, Verlauf, Ausgang
// ============================================================
const INCIDENT_MIN_LEVEL = 4;   // vorher lernt der Spieler erst den Grundbetrieb

export function nightProgress() {
  return Math.max(0, Math.min(1, (state.clock - NIGHT.startMin) / (NIGHT.endMin - NIGHT.startMin)));
}
export function clockLabel() {
  const h = Math.floor(state.clock / 60) % 24, m = Math.floor(state.clock % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
// „Wie voll ist der Laden" — steigt zur Kernzeit an und fällt gegen Morgen
export function nightPeak() {
  const p = nightProgress();
  return 0.35 + 0.65 * Math.sin(Math.min(1, p * 1.15) * Math.PI);
}
export function nightGoalInfo() {
  const goal = state.nightGoal || 1;
  return { goal, earned: state.nightEarned, frac: Math.min(1, state.nightEarned / goal), done: state.nightEarned >= goal };
}
function rollNightGoal() {
  // Ziel bemisst sich am aktuellen Einkommen, wächst mit jeder geschafften Nacht
  const base = Math.max(200, baseIncomePerSec() * NIGHT.goalSeconds);
  state.nightGoal = Math.floor(base * Math.pow(NIGHT.goalGrowth, Math.min(NIGHT.goalGrowthCap, state.nights)));
  state.nightEarned = 0;
  state.nightMult = 1;
  state.incident = null;
  state.incidentsHandled = 0;
  state.nextIncidentAt = NIGHT.startMin + 25 + Math.random() * 30;
}
export function startNightIfNeeded() { if (!state.nightGoal) rollNightGoal(); }

function endNight() {
  const info = nightGoalInfo();
  const won = info.done;
  const before = state.rep;
  addRep(won ? NIGHT.repWin : -NIGHT.repLose);
  if (won) state.nights++;
  state.nightStreak = won ? (state.nightStreak || 0) + 1 : 0;
  const bonus = won ? Math.max(100, info.earned * (0.15 + Math.min(0.35, state.nightStreak * 0.03))) : 0;
  const gems = won && state.nightStreak % 3 === 0 ? 2 : 0;
  if (bonus) addMoney(bonus, 'night');
  if (gems) state.gems += gems;
  const out = { won, night: state.nights, streak: state.nightStreak, earned: info.earned, goal: info.goal,
    bonus, gems, rep: state.rep, repDelta: state.rep - before };
  state.clock = NIGHT.startMin;
  rollNightGoal();
  checkChapter();
  saveNow();
  emit('nightEnd', out);
  return out;
}

// Uhr läuft — wird aus tick() gespeist
function advanceClock(dt) {
  startNightIfNeeded();
  state.clock += dt * NIGHT.minutesPerSecond;
  if (state.clock >= NIGHT.endMin) { endNight(); return; }
  // Vorfall fällig? (erst wenn der Laden läuft — ein Neuling ohne Kasse
  // soll nicht für Entscheidungen bestraft werden, die er nicht bezahlen kann)
  if (!state.incident && state.level >= INCIDENT_MIN_LEVEL && state.clock >= state.nextIncidentAt) rollIncident();
  // offener Vorfall läuft ab → gilt als „nichts getan"
  if (state.incident && state.clock >= state.incident.until) resolveIncident(-1);
}

// ---- Ruf -----------------------------------------------------------
export function addRep(d) {
  const before = state.rep;
  state.rep = Math.max(REP.min, Math.min(REP.max, state.rep + d));
  if (state.rep !== before) emit('rep', { rep: state.rep, delta: state.rep - before });
  return state.rep;
}
export function repMult() { return REP.multAt(state.rep); }
export function repInfo() { const t = repTier(state.rep); return { rep: Math.round(state.rep), ...t }; }

// ---- Vorfälle: die Entscheidungen -----------------------------------
function incidentPool() {
  return INCIDENTS.filter(i => {
    if (i.minLevel && state.level < i.minLevel) return false;
    if (i.nemesis && state.chapter < 3) return false;
    return true;
  });
}
function rollIncident() {
  const pool = incidentPool();
  if (!pool.length) return;
  let total = 0; for (const i of pool) total += i.w;
  let r = Math.random() * total, pickedDef = pool[0];
  for (const i of pool) { r -= i.w; if (r <= 0) { pickedDef = i; break; } }
  // Optionen, die eine Bedingung haben (z. B. nur mit Untergrund), rausfiltern
  const opts = pickedDef.opts.filter(o => o.hidden !== 'crime' || undergroundUnlocked());
  state.incident = { id: pickedDef.id, until: state.clock + 45, opts: opts.map((_, i) => i) };
  emit('incident', incidentInfo());
}
export function incidentInfo() {
  if (!state.incident) return null;
  const def = INCIDENTS.find(i => i.id === state.incident.id);
  if (!def) return null;
  const opts = def.opts.filter(o => o.hidden !== 'crime' || undergroundUnlocked());
  const per = baseIncomePerSec();
  return {
    id: def.id, icon: def.icon, title: def.title, text: def.text,
    left: Math.max(0, (state.incident.until - state.clock) / NIGHT.minutesPerSecond),
    opts: opts.map((o, i) => ({
      i, label: o.label,
      money: Math.round((o.money || 0) * per),
      rep: o.rep || 0, heat: o.heat || 0,
      affordable: (o.money || 0) >= 0 || state.money >= Math.abs((o.money || 0) * per),
    })),
  };
}
// idx = -1 bedeutet: abgelaufen / nichts getan
export function resolveIncident(idx) {
  if (!state.incident) return null;
  const def = INCIDENTS.find(i => i.id === state.incident.id);
  // Nicht bezahlbare Option: gar nicht erst zulassen — der Vorfall bleibt offen,
  // damit niemand bestraft wird, nur weil die Kasse gerade leer ist.
  if (def && idx >= 0) {
    const opts0 = def.opts.filter(o => o.hidden !== 'crime' || undergroundUnlocked());
    const o0 = opts0[idx];
    if (o0 && (o0.money || 0) < 0 && state.money < Math.abs((o0.money || 0) * baseIncomePerSec())) return null;
  }
  state.incident = null;
  state.nextIncidentAt = state.clock + 45 + Math.random() * 55;
  if (!def) return null;
  const opts = def.opts.filter(o => o.hidden !== 'crime' || undergroundUnlocked());
  const per = baseIncomePerSec();
  let out;
  if (idx < 0 || !opts[idx]) {
    // Nichts tun ist auch eine Entscheidung — und meistens die teuerste
    addRep(-5);
    out = { id: def.id, icon: def.icon, ignored: true, rep: -5, money: 0,
      txt: 'Du hast zu lange gezögert. Das Problem hat sich von selbst gelöst — zu deinen Lasten.' };
  } else {
    const o = opts[idx];
    const money = Math.round((o.money || 0) * per);
    if (money < 0) state.money += money;
    else if (money > 0) addMoney(money, 'incident');
    if (o.rep) addRep(o.rep);
    if (o.heat) state.underground.heat = Math.max(0, Math.min(HEAT_MAX, state.underground.heat + o.heat));
    if (o.guests) state.nightMult *= o.guests;
    out = { id: def.id, icon: def.icon, label: o.label, money, rep: o.rep || 0, heat: o.heat || 0, txt: o.txt };
  }
  state.incidentsHandled++;
  emit('incidentDone', out);
  save();
  return out;
}

// ---- Kapitel --------------------------------------------------------
export function chapterInfo() {
  const ch = chapterFor(state);
  return { ...ch, idx: ch.id, total: CHAPTERS.length };
}
function checkChapter() {
  const ch = chapterFor(state);
  if (ch.id > (state.chapter || 0)) {
    state.chapter = ch.id;
    emit('chapter', ch);
  }
}

export function devSetNightClock(min) {
  state.clock = Math.max(NIGHT.startMin, Math.min(NIGHT.endMin - 0.5, min));
}

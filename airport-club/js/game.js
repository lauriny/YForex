// ============================================================
//  AIRPORT – Club Simulator · Spiellogik & State
// ============================================================
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP, CASH_STATIONS,
  T2_REQ, ROOF_REQ, PERFORMER, AUTOCOLLECT, CLUB_EXPAND, autoCollectInterval,
  MARKETING, marketingCost, DJS, DJ_MAP,
  BOOST, DROP, OFFLINE, CELEB, PRESTIGE,
  EVENTS, EVENT_GAP, WHEEL, DAILY_MIN_GAP_H, DAILY_STREAK_MAX, ACHIEVEMENTS,
  getPhase, chestReward, costOf, bulkCost, maxAffordable, milestoneMult,
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
  createdAt: Date.now(),
};

// ---- Raum-Freischaltung -------------------------------------------
export function roomUnlocked(roomId) {
  if (roomId === 't2') return state.t2Unlocked;
  if (roomId === 'roof') return state.roofUnlocked;
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
  return st.baseIncome * lvl * milestoneMult(lvl) * staffStationMult(id) * performerRoomMult(st.room);
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

export function globalMult() {
  let m = staffGlobalMult() * fameMult() * djMult();
  if (boostActive()) m *= BOOST.mult;
  if (dropActive()) m *= DROP.mult;
  if (eventActive()) m *= eventMult();
  return m;
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
export function addMoney(n, source) {
  if (n <= 0) return;
  state.money += n;
  state.lifetime += n;
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

export function collectStation(id) {
  const amount = state.stationCash[id] || 0;
  if (amount <= 0) return 0;
  state.stationCash[id] = 0;
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

  questTimer += dt;
  if (questTimer > 0.5) { questTimer = 0; checkQuests(); }

  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; save(); }
}

// ---- Speichern & Laden ------------------------------------------------------------
export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch (e) { /* Speicher voll/blockiert – Spiel läuft weiter */ }
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
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
}

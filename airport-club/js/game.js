// ============================================================
//  AIRPORT – Club Simulator · Spiellogik & State
// ============================================================
import {
  STATIONS, STATION_MAP, STAFF, STAFF_MAP, SHOP,
  T2_REQ, BOOST, DROP, HYPE_PER_TAP, HYPE_DECAY, OFFLINE, CELEB, PRESTIGE,
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
  settings: { sound: true },
  createdAt: Date.now(),
};

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

export function stationIncome(id) {
  const lvl = state.stations[id] || 0;
  if (lvl <= 0) return 0;
  const st = STATION_MAP[id];
  if (st.room === 't2' && !state.t2Unlocked) return 0;
  return st.baseIncome * lvl * milestoneMult(lvl) * staffStationMult(id);
}

export function roomIncome(roomId) {
  let sum = 0;
  for (const st of STATIONS) if (st.room === roomId) sum += stationIncome(st.id);
  return sum * globalMult();
}

export function globalMult() {
  let m = staffGlobalMult() * fameMult();
  if (boostActive()) m *= BOOST.mult;
  if (dropActive()) m *= DROP.mult;
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

// Spielerlevel leitet sich aus dem Lebenszeit-Umsatz ab
export function levelFor(lifetime) {
  return 1 + Math.max(0, Math.floor(Math.log(1 + lifetime / 50) / Math.log(2.6)));
}

// ---- Geld ----------------------------------------------------------
export function addMoney(n, source) {
  if (n <= 0) return;
  state.money += n;
  state.lifetime += n;
  const newLevel = levelFor(state.lifetime);
  while (newLevel > state.level) {
    state.level++;
    const gems = 1 + Math.floor(state.level / 5);
    state.gems += gems;
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
  if (st.room === 't2' && !state.t2Unlocked) return false;
  const before = state.stations[id] || 0;
  state.money -= cost;
  state.stations[id] = before + count;
  const ms = Math.floor((before + count) / 25) > Math.floor(before / 25);
  emit('buy', { id, count, level: state.stations[id], milestone: ms });
  if (ms) emit('milestone', { id, level: state.stations[id] });
  save();
  return true;
}

// ---- Terminal 2 ------------------------------------------------------
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

// ---- Hype & DROP ----------------------------------------------------------
export function tapHype(mult = 1) {
  // Aktives Tippen: kleiner Sofort-Verdienst + Hype
  const gain = Math.max(0.5, incomePerSec() * 0.6) * mult;
  addMoney(gain, 'tap');
  if (!dropActive()) {
    state.hype = Math.min(100, state.hype + HYPE_PER_TAP);
    if (state.hype >= 100) triggerDrop();
  }
  return gain;
}

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
  const money = incomePerSec() * (90 + Math.random() * 90);
  const gems = Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 2) : 0;
  addMoney(money, 'celeb');
  state.gems += gems;
  emit('celeb', { money, gems });
  save();
  return { money, gems };
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
  state.hype = 0;
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

export function tick(now) {
  if (!lastTick) lastTick = now;
  const dt = Math.min(1, (now - lastTick) / 1000);
  lastTick = now;
  if (dt <= 0) return;

  addMoney(incomePerSec() * dt);

  // Hype fällt langsam ab
  if (!dropActive() && state.hype > 0) {
    state.hype = Math.max(0, state.hype - HYPE_DECAY * dt);
  }

  // Promi-Gast
  const nowMs = Date.now();
  if (state.celeb && nowMs > state.celeb.expires) {
    state.celeb = null;
    scheduleCeleb();
    emit('celebGone');
  }
  if (!state.celeb && nowMs > state.nextCelebAt) {
    state.celeb = { expires: nowMs + CELEB.stay * 1000, seed: Math.random() };
    emit('celebSpawn');
  }

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
    // sanft mergen, damit neue Felder Defaults behalten
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

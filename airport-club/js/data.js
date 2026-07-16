// ============================================================
//  AIRPORT – Club Simulator · Spieldaten & Balancing
// ============================================================

export const MILESTONE_STEP = 25;   // alle 25 Stufen ...
export const MILESTONE_MULT = 2;    // ... verdoppelt sich das Einkommen der Station

export const T2_REQ = { level: 10, cost: 500_000 };

export const BOOST = { dur: 300, cd: 600, mult: 2 };      // x2-Einkommen: 5 min an, 10 min Cooldown
export const DROP  = { dur: 12, mult: 3 };                // Hype-DROP: 12 s x3
export const HYPE_PER_TAP = 3;                            // % Hype pro Tap
export const HYPE_DECAY = 4;                              // % Hype-Verfall pro Sekunde
export const OFFLINE = { cap: 8 * 3600, eff: 0.5 };       // Offline: max 8 h, 50 % Effizienz
export const CELEB = { minGap: 120, maxGap: 300, stay: 20 }; // Promi-Gast (Sekunden)
export const PRESTIGE = { minLevel: 20, div: 2e9, multPerStar: 0.25 };

export const ROOMS = [
  { id: 't1', name: 'Terminal 1', sub: 'Mainfloor',  icon: '🪩' },
  { id: 't2', name: 'Terminal 2', sub: 'VIP-Etage',  icon: '🥂' },
];

// ---- Stationen -------------------------------------------------
// baseIncome = €/s pro Stufe · Kosten = baseCost * growth^stufe
export const STATIONS = [
  { id: 'einlass',   room: 't1', name: 'Einlass',            icon: '🚪', desc: 'Mehr Gäste kommen rein',        baseCost: 10,     growth: 1.14, baseIncome: 0.5 },
  { id: 'garderobe', room: 't1', name: 'Garderobe',          icon: '🧥', desc: 'Eintritt & Trinkgeld',          baseCost: 60,     growth: 1.15, baseIncome: 2.2 },
  { id: 'bar',       room: 't1', name: 'Bar',                icon: '🍹', desc: 'Cocktails & Longdrinks',        baseCost: 400,    growth: 1.15, baseIncome: 10 },
  { id: 'dj',        room: 't1', name: 'DJ-Pult',            icon: '🎧', desc: 'Beats für die Menge',           baseCost: 2500,   growth: 1.15, baseIncome: 45 },
  { id: 'dance',     room: 't1', name: 'Tanzfläche',         icon: '💃', desc: 'Platz für mehr Leute',          baseCost: 16000,  growth: 1.16, baseIncome: 190 },
  { id: 'shots',     room: 't1', name: 'Shot-Bar',           icon: '🥃', desc: 'Eine Runde Shots!',             baseCost: 95000,  growth: 1.16, baseIncome: 800 },
  { id: 'vipEinlass',room: 't2', name: 'VIP-Einlass',        icon: '🎫', desc: 'Nur wer auf der Liste steht',   baseCost: 6.5e5,  growth: 1.15, baseIncome: 4200 },
  { id: 'second',    room: 't2', name: 'Second Floor',       icon: '✨', desc: 'Die zweite Tanzfläche',         baseCost: 3.6e6,  growth: 1.15, baseIncome: 16000 },
  { id: 'champus',   room: 't2', name: 'Champagner-Lounge',  icon: '🍾', desc: 'Flaschen mit Wunderkerzen',     baseCost: 2.2e7,  growth: 1.16, baseIncome: 68000 },
  { id: 'tables',    room: 't2', name: 'Bottle-Service',     icon: '🛋️', desc: 'Reservierte Tische',            baseCost: 1.3e8,  growth: 1.16, baseIncome: 290000 },
  { id: 'chill',     room: 't2', name: 'Chill-Out-Area',     icon: '🌙', desc: 'Durchatmen & weiterfeiern',     baseCost: 8e8,    growth: 1.17, baseIncome: 1.2e6 },
];

export const STATION_MAP = Object.fromEntries(STATIONS.map(s => [s.id, s]));

// ---- Personal ---------------------------------------------------
export const STAFF = [
  { id: 'bruno', name: 'Türsteher Bruno',  icon: '🕶️', desc: '+20 % auf Einlass, Garderobe & VIP-Einlass pro Stufe', baseCost: 2000,  growth: 6, max: 10, targets: ['einlass', 'garderobe', 'vipEinlass'], perLevel: 0.2 },
  { id: 'mia',   name: 'Barkeeperin Mia',  icon: '🍸', desc: '+20 % auf Bar, Shot-Bar, Champagner & Bottle-Service pro Stufe', baseCost: 30000, growth: 6, max: 10, targets: ['bar', 'shots', 'champus', 'tables'], perLevel: 0.2 },
  { id: 'neon',  name: 'DJ Neon',          icon: '🎛️', desc: '+8 % Gesamteinkommen & +2 s DROP-Dauer pro Stufe', baseCost: 450000, growth: 6, max: 10, global: 0.08, dropBonus: 2 },
  { id: 'lea',   name: 'Promoterin Lea',   icon: '📣', desc: '+25 % Offline-Einnahmen & +5 % Gesamteinkommen pro Stufe', baseCost: 6e6, growth: 6, max: 10, global: 0.05, offline: 0.25 },
];

export const STAFF_MAP = Object.fromEntries(STAFF.map(s => [s.id, s]));

// ---- Diamant-Shop ----------------------------------------------
export const SHOP = [
  { id: 'cash1',  name: 'Geldkoffer',     icon: '💼', desc: '10 Minuten Einkommen sofort',  gems: 3,  minutes: 10 },
  { id: 'cash2',  name: 'Geld-Palette',   icon: '🧳', desc: '45 Minuten Einkommen sofort',  gems: 10, minutes: 45 },
  { id: 'boost',  name: 'Sofort-Boost',   icon: '⚡', desc: 'x2 Einkommen sofort starten (Cooldown egal)', gems: 8 },
  { id: 'drop',   name: 'Instant-DROP',   icon: '🔊', desc: 'Löst sofort einen DROP aus',   gems: 4 },
];

// ---- Phasen & Quests --------------------------------------------
// Quest-Typen: station | levels | earn | income | level | staff | staffLevels
//              drops | celebs | boosts | t2 | fame
export const PHASES = [
  { name: 'Eröffnungsnacht', quests: [
    { t: 'station', id: 'einlass',   v: 5,   txt: 'Einlass auf Stufe 5' },
    { t: 'station', id: 'garderobe', v: 3,   txt: 'Garderobe auf Stufe 3' },
    { t: 'station', id: 'bar',       v: 1,   txt: 'Eröffne die Bar' },
    { t: 'earn',    v: 800,               txt: 'Verdiene insgesamt 800 €' },
  ]},
  { name: 'Es spricht sich rum', quests: [
    { t: 'station', id: 'einlass', v: 15,  txt: 'Einlass auf Stufe 15' },
    { t: 'station', id: 'bar',     v: 10,  txt: 'Bar auf Stufe 10' },
    { t: 'station', id: 'dj',      v: 1,   txt: 'Stell einen DJ ans Pult' },
    { t: 'income',  v: 25,                txt: 'Erreiche 25 €/s Einkommen' },
    { t: 'earn',    v: 10_000,            txt: 'Verdiene insgesamt 10K €' },
  ]},
  { name: 'Volle Hütte', quests: [
    { t: 'station', id: 'dance', v: 5,    txt: 'Tanzfläche auf Stufe 5' },
    { t: 'station', id: 'bar',   v: 25,   txt: 'Bar auf Stufe 25 (Meilenstein!)' },
    { t: 'drops',   v: 1,                 txt: 'Löse deinen ersten DROP aus' },
    { t: 'staff',   v: 1,                 txt: 'Stelle dein erstes Personal ein' },
    { t: 'earn',    v: 100_000,           txt: 'Verdiene insgesamt 100K €' },
  ]},
  { name: 'VIP-Gerüchte', quests: [
    { t: 'level',   v: 10,                txt: 'Erreiche Level 10' },
    { t: 'station', id: 'shots', v: 5,    txt: 'Shot-Bar auf Stufe 5' },
    { t: 'celebs',  v: 1,                 txt: 'Begrüße einen Promi-Gast' },
    { t: 'income',  v: 600,               txt: 'Erreiche 600 €/s Einkommen' },
    { t: 'earn',    v: 500_000,           txt: 'Verdiene insgesamt 500K €' },
  ]},
  { name: 'Terminal 2 öffnet', quests: [
    { t: 't2',      v: 1,                 txt: 'Schalte Terminal 2 frei' },
    { t: 'station', id: 'vipEinlass', v: 10, txt: 'VIP-Einlass auf Stufe 10' },
    { t: 'staff',   v: 2,                 txt: 'Beschäftige 2 Mitarbeiter' },
    { t: 'boosts',  v: 1,                 txt: 'Nutze den x2-Einkommen-Boost' },
    { t: 'earn',    v: 5e6,               txt: 'Verdiene insgesamt 5M €' },
  ]},
  { name: 'Die goldene Etage', quests: [
    { t: 'station', id: 'second',  v: 10, txt: 'Second Floor auf Stufe 10' },
    { t: 'station', id: 'bar',     v: 50, txt: 'Bar auf Stufe 50' },
    { t: 'station', id: 'champus', v: 5,  txt: 'Champagner-Lounge auf Stufe 5' },
    { t: 'drops',   v: 5,                 txt: 'Löse 5 DROPs aus' },
    { t: 'earn',    v: 5e7,               txt: 'Verdiene insgesamt 50M €' },
  ]},
  { name: 'Stadtgespräch', quests: [
    { t: 'station', id: 'tables', v: 10,  txt: 'Bottle-Service auf Stufe 10' },
    { t: 'levels',  v: 300,               txt: 'Insgesamt 300 Stationsstufen' },
    { t: 'income',  v: 1e6,               txt: 'Erreiche 1M €/s Einkommen' },
    { t: 'celebs',  v: 5,                 txt: 'Begrüße 5 Promi-Gäste' },
    { t: 'earn',    v: 1e9,               txt: 'Verdiene insgesamt 1B €' },
  ]},
  { name: 'After-Hour-Legende', quests: [
    { t: 'station', id: 'chill', v: 10,   txt: 'Chill-Out-Area auf Stufe 10' },
    { t: 'staffLevels', v: 12,            txt: 'Insgesamt 12 Personal-Stufen' },
    { t: 'drops',   v: 15,                txt: 'Löse 15 DROPs aus' },
    { t: 'earn',    v: 1e10,              txt: 'Verdiene insgesamt 10B €' },
  ]},
  { name: 'Kult-Club', quests: [
    { t: 'level',   v: 20,                txt: 'Erreiche Level 20' },
    { t: 'station', id: 'champus', v: 50, txt: 'Champagner-Lounge auf Stufe 50' },
    { t: 'levels',  v: 600,               txt: 'Insgesamt 600 Stationsstufen' },
    { t: 'earn',    v: 1e11,              txt: 'Verdiene insgesamt 100B €' },
  ]},
  { name: 'Neueröffnung?', quests: [
    { t: 'fame',    v: 1,                 txt: 'Eröffne den Club neu (1 Ruf-Stern)' },
    { t: 'station', id: 'tables', v: 50,  txt: 'Bottle-Service auf Stufe 50' },
    { t: 'income',  v: 1e8,               txt: 'Erreiche 100M €/s Einkommen' },
    { t: 'earn',    v: 1e12,              txt: 'Verdiene insgesamt 1T €' },
  ]},
];

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV'];

// Endlos-Phasen nach den handgebauten
export function getPhase(i) {
  if (i < PHASES.length) return PHASES[i];
  const k = i - PHASES.length + 1;
  const m = Math.pow(8, k);
  return { name: 'Club-Legende ' + (ROMAN[k - 1] || k), quests: [
    { t: 'levels', v: 700 + 150 * k,  txt: `Insgesamt ${700 + 150 * k} Stationsstufen` },
    { t: 'earn',   v: 5e12 * m,       txt: `Verdiene insgesamt ${fmt(5e12 * m)} €` },
    { t: 'income', v: 3e8 * m,        txt: `Erreiche ${fmt(3e8 * m)} €/s Einkommen` },
    { t: 'drops',  v: 20 + 10 * k,    txt: `Löse ${20 + 10 * k} DROPs aus` },
    { t: 'celebs', v: 8 + 4 * k,      txt: `Begrüße ${8 + 4 * k} Promi-Gäste` },
  ]};
}

export function chestReward(phaseIdx, kind) { // kind: 'mid' | 'end'
  return kind === 'mid'
    ? { gems: 4 + phaseIdx,     minutes: 10 }
    : { gems: 8 + 2 * phaseIdx, minutes: 30 };
}

// ---- Zahlen & Kosten --------------------------------------------
const UNITS = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad'];

export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 100 && n % 1 !== 0
    ? n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
    : Math.floor(n).toLocaleString('de-DE');
  let u = 0;
  while (n >= 1000 && u < UNITS.length - 1) { n /= 1000; u++; }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits }) + UNITS[u];
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function costOf(st, level) {
  return st.baseCost * Math.pow(st.growth, level);
}

// Kosten für `count` Stufen ab `level` (geometrische Summe)
export function bulkCost(st, level, count) {
  const g = st.growth;
  return st.baseCost * Math.pow(g, level) * (Math.pow(g, count) - 1) / (g - 1);
}

// Wie viele Stufen sind mit `money` drin?
export function maxAffordable(st, level, money) {
  const g = st.growth;
  const first = costOf(st, level);
  if (money < first) return 0;
  const n = Math.floor(Math.log(money * (g - 1) / first + 1) / Math.log(g));
  return Math.max(1, Math.min(n, 5000));
}

export function milestoneMult(level) {
  return Math.pow(MILESTONE_MULT, Math.floor(level / MILESTONE_STEP));
}

export function nextMilestone(level) {
  return (Math.floor(level / MILESTONE_STEP) + 1) * MILESTONE_STEP;
}

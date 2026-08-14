// ============================================================
//  AIRPORT – Club Simulator · Spieldaten & Balancing
// ============================================================

export const MILESTONE_STEP = 25;   // alle 25 Stufen ...
export const MILESTONE_MULT = 2;    // ... verdoppelt sich das Einkommen der Station

// ---- Freischalt-Gates ------------------------------------------
export const T2_REQ   = { level: 10, cost: 750_000 };
export const ROOF_REQ = { level: 20, cost: 250_000_000 };

// ---- Show-Act (bewegliche Tänzerin) ----------------------------
export const PERFORMER = { level: 14, cost: 12_000_000, roomMult: 2.2, hypeMult: 1.6 };

// ---- Club-Ausbau (Gebäude vergrößern) --------------------------
export const CLUB_EXPAND = { max: 5, baseCost: 300_000, growth: 14 };

// ---- Auto-Kassierer (sammelt Geld-Pins von allein ein) ---------
export const AUTOCOLLECT = { baseCost: 400_000, growth: 5.5, max: 6 };
export function autoCollectInterval(lvl) {   // Sekunden zwischen Einsammel-Runden
  return lvl <= 0 ? Infinity : Math.max(2, 20 - lvl * 3);
}

// ---- Marketing (mehr & schneller Gäste, bis der Raum voll ist) --
export const MARKETING = { baseCost: 4000, growth: 1.85, max: 25, guestsPerLevel: 3, spawnPerLevel: 0.16 };
export function marketingCost(lvl) { return Math.floor(MARKETING.baseCost * Math.pow(MARKETING.growth, lvl)); }

// ---- DJs zum Anheuern (Namen, Kosten, Einkommens-Bonus, Musikstil) ----
export const DJS = [
  { id: 'resident',  name: 'Resident DJ',       icon: '🎧', cost: 0,             mult: 1.0,  style: null,     desc: 'Der Haus-DJ – immer am Start.' },
  { id: 'bakerman',  name: 'DJ Bakerman',       icon: '🥖', cost: 200_000,       mult: 1.12, style: 'techno', desc: '+12 % Einkommen · knallharter Techno.' },
  { id: 'chandler',  name: 'DJ Chandler Bing',  icon: '📎', cost: 4_000_000,     mult: 1.25, style: 'rave',   desc: '+25 % Einkommen · Rave-Anthems.' },
  { id: 'afroqueen', name: 'DJ Afro Queen',     icon: '👑', cost: 90_000_000,    mult: 1.42, style: 'afro',   desc: '+42 % Einkommen · Afro House.' },
  { id: 'housemvp',  name: 'DJ Housemaster',    icon: '🏠', cost: 2_000_000_000, mult: 1.65, style: 'house',  desc: '+65 % Einkommen · Deep House.' },
];
export const DJ_MAP = Object.fromEntries(DJS.map(d => [d.id, d]));

// ---- Bar-Getränke: vom Bier hoch zu teuren Longdrinks (schaltet mit der Bar-Stufe frei) ----
// Realistische Preise pro Getränk; die Bar-Stufe hebt zusätzlich Menge & Multiplikator.
export const DRINKS = [
  { name: 'Bier',                 price: 5,   lvl: 1,   e: '🍺' },
  { name: 'Aperol Spritz',        price: 8,   lvl: 8,   e: '🥂' },
  { name: 'Cuba Libre',           price: 9,   lvl: 20,  e: '🍹' },
  { name: 'Gin Tonic',            price: 11,  lvl: 35,  e: '🍸' },
  { name: 'Mojito',               price: 12,  lvl: 50,  e: '🍃' },
  { name: 'Long Island Iced Tea', price: 14,  lvl: 70,  e: '🧉' },
  { name: 'Touchdown',            price: 16,  lvl: 90,  e: '🍹' },
  { name: 'Dom Pérignon',         price: 290, lvl: 120, e: '🍾' },
];
export function drinkTier(barLvl) {   // Index des höchsten freigeschalteten Getränks
  let i = 0; for (let k = 0; k < DRINKS.length; k++) if (barLvl >= DRINKS[k].lvl) i = k; return i;
}

// ---- Club-Themes: freischaltbare Dancefloor-/Neon-Looks (nach Gesamt-Einnahmen) ----
export const CLUB_THEMES = [
  { id: 'classic', name: 'Classic Neon', req: 0,     accent: '#8b5cf6', sw: ['#ff4fd8', '#4f9cf7', '#39ff88'], desc: 'Der Original-Regenbogen-Look.' },
  { id: 'sunset',  name: 'Sunset Miami', req: 2e6,   accent: '#ff6a3d', sw: ['#ff2e63', '#ff9f1c', '#ff6a3d'], desc: 'Warme Pink-Orange-Vibes.' },
  { id: 'toxic',   name: 'Toxic',        req: 5e8,   accent: '#39ff14', sw: ['#39ff14', '#b6ff00', '#00e5a0'], desc: 'Grelles Neon-Grün.' },
  { id: 'ice',     name: 'Ice',          req: 5e10,  accent: '#5ad0ff', sw: ['#5ad0ff', '#7a9cff', '#a0f0ff'], desc: 'Kühles Eisblau.' },
  { id: 'gold',    name: 'Gold VIP',     req: 5e12,  accent: '#ffcf6a', sw: ['#ffd93c', '#ffb347', '#fff1a8'], desc: 'Purer Luxus in Gold.' },
  // ---- Saison-Themes: nur in ihrem Zeitfenster neu freischaltbar, danach dauerhaft im Besitz ----
  { id: 'halloween', name: 'Spooky Night',      req: 50_000,  accent: '#ff8a00', sw: ['#ff8a00', '#7c3aed', '#39ff14'], desc: 'Kürbis-Orange trifft Hexen-Violett.',
    season: { from: '10-15', to: '11-05', label: '🎃 Nur im Oktober' } },
  { id: 'summer',    name: 'Sommer Beach Club', req: 100_000, accent: '#4fe0ff', sw: ['#4fe0ff', '#ff9f43', '#ffe14d'], desc: 'Türkises Meer & Korallen-Sonnenuntergang.',
    season: { from: '06-01', to: '08-31', label: '☀️ Nur im Sommer' } },
  { id: 'silvester', name: 'Neon Silvester',    req: 200_000, accent: '#ffd93c', sw: ['#ffd93c', '#ff4fd8', '#fff1a8'], desc: 'Feuerwerk, Gold & Konfetti zum Jahreswechsel.',
    season: { from: '12-20', to: '01-05', label: '🎆 Nur zum Jahreswechsel' } },
];
export const THEME_MAP = Object.fromEntries(CLUB_THEMES.map(x => [x.id, x]));

// Prüft, ob "jetzt" innerhalb eines MM-DD…MM-DD-Fensters liegt (Fenster darf übers Jahresende laufen)
export function inSeasonWindow(fromMD, toMD, now = new Date()) {
  const y = now.getFullYear();
  const [fm, fd] = fromMD.split('-').map(Number);
  const [tm, td] = toMD.split('-').map(Number);
  const from = new Date(y, fm - 1, fd, 0, 0, 0);
  const to = new Date(y, tm - 1, td, 23, 59, 59);
  if (to < from) {   // Fenster wraps über Silvester (z. B. 12-20 → 01-05)
    if (now >= from) to.setFullYear(y + 1); else from.setFullYear(y - 1);
  }
  return now >= from && now <= to;
}

export const BOOST = { dur: 300, cd: 300, mult: 2 };      // x2-Einkommen: 5 min an, dann 5 min CD → alle 10 min nutzbar
export const DROP  = { dur: 12, mult: 3 };                // Hype-DROP: 12 s x3
export const OFFLINE = { cap: 8 * 3600, eff: 0.3 };       // Offline: max 8 h, 30 % Effizienz
export const CELEB = { minGap: 180, maxGap: 360, stay: 20 }; // Promi-Gast (Sekunden)
export const PRESTIGE = { minLevel: 25, div: 5e10, multPerStar: 0.25 };

// ---- Globale Rangliste (Rivalen-System) ------------------------
// Offline simuliert: fiktive Club-Bosse mit „Vermögen". Der Spieler misst sich
// über sein Lifetime-Vermögen. Jeder überholte Rivale gibt eine einmalige Belohnung
// (Diamanten) + einen kleinen dauerhaften Einkommens-Bonus (bindet & motiviert).
export const RIVAL_OVERTAKE_MULT = 0.015;   // +1,5 % Einkommen je überholtem Rivalen (dauerhaft)
export const RIVALS = [
  { id: 'r01', name: 'DJ Kevin',        worth: 3.0e3,  gems: 1 },
  { id: 'r02', name: 'Tanja vom Tresen',worth: 2.5e4,  gems: 1 },
  { id: 'r03', name: 'Malle-Manni',     worth: 1.8e5,  gems: 2 },
  { id: 'r04', name: 'Baron von Beat',  worth: 1.2e6,  gems: 2 },
  { id: 'r05', name: 'Ibiza-Iggy',      worth: 8.0e6,  gems: 3 },
  { id: 'r06', name: 'Lady Lumière',    worth: 5.0e7,  gems: 3 },
  { id: 'r07', name: 'Don Discoteca',   worth: 3.0e8,  gems: 4 },
  { id: 'r08', name: 'Sheikh Sound',    worth: 2.0e9,  gems: 5 },
  { id: 'r09', name: 'Vegas Vivian',    worth: 1.4e10, gems: 6 },
  { id: 'r10', name: 'Mr. Manhattan',   worth: 9.0e10, gems: 8 },
  { id: 'r11', name: 'Tycoon Tao',      worth: 6.0e11, gems: 10 },
  { id: 'r12', name: 'Elon M.',         worth: 5.0e12, gems: 14 },
  { id: 'r13', name: 'König der Nacht',  worth: 4.0e13, gems: 20 },
];

// ---- Untergrund-Wirtschaft („Das Hinterzimmer") ----------------
// Riskante Zeit-Jobs: kosten Einsatz, dauern Minuten, bringen fette Boni — oder scheitern.
// „Heat" steigt pro Job und erhöht die Fehlschlag-Chance (Risiko/Belohnung, kein Spam).
export const UNDERGROUND_REQ = { level: 8 };          // ab Level 8 spielbar
export const HEAT_MAX = 100;
export const RAID_DUR = 90;                           // Sek.: Club-Razzia (fast geschlossen), wenn man erwischt wird
export const TAKEDOWN_CD = 240;                       // Sek. Abklingzeit: den Polizisten ausschalten geht nur selten
export const BODY_RAID_DELAY = [35, 75];              // Sek.-Spanne, bis eine gefundene Leiche zur Razzia führt
export const HEAT_DECAY = 100 / (12 * 60);            // volle Abkühlung in ~12 Min
// weight = Gewicht der Ware (0..1) → langsamerer Schmuggler bei schwerem Zeug
export const UNDERGROUND_JOBS = [
  { id: 'schmuggel', name: 'Zigaretten-Schmuggel', short: 'Schmuggel', icon: '📦', dur: 45,  stakeSec: 20,  reward: 3.0, risk: 0.10, heat: 12, weight: 0.12, txt: 'Ein paar Stangen über die Grenze.' },
  { id: 'tuersteher',name: 'Schutzgeld eintreiben',short: 'Schutzgeld',icon: '💪', dur: 90,  stakeSec: 45,  reward: 3.4, risk: 0.16, heat: 18, weight: 0.28, txt: 'Die Nachbar-Bar zahlt „freiwillig".' },
  { id: 'falschgeld',name: 'Falschgeld waschen',   short: 'Falschgeld',icon: '💵', dur: 180, stakeSec: 120, reward: 4.2, risk: 0.24, heat: 28, weight: 0.42, txt: 'Über die Garderobe läuft am meisten.' },
  { id: 'waffendeal',name: 'Waffendeal',           short: 'Waffen',   icon: '🔫', dur: 300, stakeSec: 260, reward: 5.5, risk: 0.34, heat: 42, weight: 0.6,  txt: 'Hohes Risiko, fettes Geld.' },
];

// ---- Stealth-Minispiel: Tuning je Job-Tier (Index in UNDERGROUND_JOBS) + Heat ----
export const UG_STEALTH = {
  tiers: [
    { guards: 1, coneHalf: 0.42, coneRange: 3.0, guardSpeed: 0.85, look: 0.6 },
    { guards: 1, coneHalf: 0.48, coneRange: 3.3, guardSpeed: 1.05, look: 0.8 },
    { guards: 2, coneHalf: 0.54, coneRange: 3.6, guardSpeed: 1.20, look: 1.0 },
    { guards: 2, coneHalf: 0.60, coneRange: 3.9, guardSpeed: 1.35, look: 1.1 },
  ],
  suspicionRise: 0.85,      // pro Sek. bei voller Sicht aus der Nähe
  suspicionFall: 0.7,       // pro Sek. außer Sicht
  heatGuardBonus: 1,        // +1 Wache bei hohem Heat (>55 %)
  heatConeBonus: 0.12,      // Kegel breiter bei hohem Heat
  distractCharges: 2,       // Ablenk-Ladungen (ab Tier ≥ 1)
  distractCd: 6,            // Sek. Abklingzeit je Ablenkung
  smugSpeed: 3.5,           // Basis-Tempo Schmuggler (world/s)
};
export const BRIBE_MULT = 1.6;   // Bestechung kostet 1.6× Einsatz (dafür keine Razzia, weiter schmuggeln)

// ================================================================
//  Schwarzmarkt-Business: Ware beschaffen (Stealth-Run) + an der
//  Theke verkaufen (Feilschen mit Kunden-Archetypen).
// ================================================================

// ---- Warensparten & Item-Vorlagen ------------------------------
// calculatedValue = baseValue * condition(0.7..1.0) * rarityMult
export const DEAL_CATS = [
  { id: 'weapons', name: 'Waffen',     icon: '🔫', color: '#c0392b', accent: '#ff9a9a' },
  { id: 'drugs',   name: 'Drogen',     icon: '💊', color: '#8e44ad', accent: '#d9a6ff' },
  { id: 'fenced',  name: 'Hehlerware', icon: '💎', color: '#c79a2b', accent: '#ffe08a' },
];
export const DEAL_GOODS = {
  weapons: [
    { id: 'pistole',   name: 'Pistole',            icon: '🔫', cat: 'weapons', baseValue: 420,  rarityMult: 1.0, type: 'firearm' },
    { id: 'schrot',    name: 'Schrotflinte',       icon: '🔫', cat: 'weapons', baseValue: 820,  rarityMult: 1.3, type: 'firearm' },
    { id: 'sturm',     name: 'Sturmgewehr',        icon: '🔫', cat: 'weapons', baseValue: 1900, rarityMult: 1.8, type: 'firearm' },
    { id: 'sniper',    name: 'Scharfschützengewehr', icon: '🎯', cat: 'weapons', baseValue: 3600, rarityMult: 2.4, type: 'firearm' },
    { id: 'granate',   name: 'Handgranaten',       icon: '💣', cat: 'weapons', baseValue: 1250, rarityMult: 1.5, type: 'explosive' },
  ],
  drugs: [
    { id: 'gras',      name: 'Gras',               icon: '🌿', cat: 'drugs',   baseValue: 210,  rarityMult: 1.0, type: 'soft' },
    { id: 'pillen',    name: 'Pillen',             icon: '💊', cat: 'drugs',   baseValue: 360,  rarityMult: 1.2, type: 'party' },
    { id: 'koks',      name: 'Koks',               icon: '❄️', cat: 'drugs',   baseValue: 950,  rarityMult: 1.6, type: 'hard' },
    { id: 'heroin',    name: 'Heroin',             icon: '🩸', cat: 'drugs',   baseValue: 1600, rarityMult: 2.0, type: 'hard' },
  ],
  fenced: [
    { id: 'uhr',       name: 'Luxusuhr',           icon: '⌚', cat: 'fenced',  baseValue: 640,  rarityMult: 1.4, type: 'luxury' },
    { id: 'schmuck',   name: 'Diamantschmuck',     icon: '💍', cat: 'fenced',  baseValue: 1450, rarityMult: 2.0, type: 'luxury' },
    { id: 'vase',      name: 'Antik-Vase',         icon: '🏺', cat: 'fenced',  baseValue: 980,  rarityMult: 1.7, type: 'art' },
    { id: 'gemaelde',  name: 'Gemälde',            icon: '🖼️', cat: 'fenced',  baseValue: 2600, rarityMult: 2.6, type: 'art' },
  ],
};
export const DEAL_GOODS_FLAT = [...DEAL_GOODS.weapons, ...DEAL_GOODS.drugs, ...DEAL_GOODS.fenced];
export function goodById(id) { return DEAL_GOODS_FLAT.find(g => g.id === id) || null; }

// ---- Kunden-Archetypen -----------------------------------------
// priceTolerance: Faktor auf den wahren Wert → wie viel er max. zu zahlen bereit ist.
// budgetMult: Deckel = calcValue * budgetMult (begrenzt maxWillingToPay zusätzlich).
// patience: Fehlversuche, bevor er geht. wants: bevorzugte Sparten (spawn-Gewichtung).
export const CUSTOMER_ARCHETYPES = [
  { id: 'geizig',   name: 'Geizhals',      icon: '🤏', color: '#5a6570', priceTolerance: 0.85, budgetMult: 1.05, patience: 3, wants: null,        weight: 3,
    quips: { greet: 'Zeig her — aber mach mir keinen Fantasiepreis.', accept: 'Na gut, meinetwegen.', reject: 'Wucher! Runter mit dem Preis.', walkout: 'Vergiss es. Ich bin weg.' } },
  { id: 'ahnungslos', name: 'Ahnungsloser', icon: '🤷', color: '#4a8fbf', priceTolerance: 1.15, budgetMult: 1.4,  patience: 4, wants: null,        weight: 2,
    quips: { greet: 'Sieht gut aus… was kostet das?', accept: 'Klingt fair, nehm ich!', reject: 'Oha, so viel?', walkout: 'Ich denk nochmal drüber nach…' } },
  { id: 'sammler',  name: 'Sammler',       icon: '🎩', color: '#7a5cbf', priceTolerance: 1.9,  budgetMult: 2.6,  patience: 5, wants: null,        weight: 1,
    quips: { greet: 'Ein besonderes Stück? Dafür zahle ich gut.', accept: 'Exquisit. Es gehört mir.', reject: 'Selbst mir ist das zu teuer.', walkout: 'Schade um das schöne Stück.' } },
  { id: 'soeldner', name: 'Söldner',       icon: '🪖', color: '#4a5d3a', priceTolerance: 1.1,  budgetMult: 1.6,  patience: 4, wants: ['weapons'], weight: 2,
    quips: { greet: 'Brauch was Zuverlässiges. Zeig die Ware.', accept: 'Guter Deal. Bis zum nächsten Auftrag.', reject: 'Für den Preis nehm ich woanders.', walkout: 'Zeitverschwendung.' } },
  { id: 'junkie',   name: 'Junkie',        icon: '😰', color: '#6b7a4a', priceTolerance: 1.35, budgetMult: 0.75, patience: 2, wants: ['drugs'],   weight: 2,
    quips: { greet: 'Haste was für mich? Schnell, Mann…', accept: 'Endlich! Danke, danke.', reject: 'So viel hab ich nicht…', walkout: 'Ich such wen anders.' } },
  { id: 'dealer',   name: 'Straßendealer', icon: '🧢', color: '#3a4a5d', priceTolerance: 0.92, budgetMult: 1.9,  patience: 4, wants: ['drugs'],   weight: 2,
    quips: { greet: 'Ich kauf im Großen. Was geht am Preis?', accept: 'Läuft. Ich meld mich wieder.', reject: 'Zu teuer für Wiederverkauf.', walkout: 'Dann eben nicht.' } },
  { id: 'faelscher', name: 'Fälscher',     icon: '🕵️', color: '#5d4a3a', priceTolerance: 0.98, budgetMult: 1.5,  patience: 3, wants: ['fenced'],  weight: 2,
    quips: { greet: 'Sauber, ohne Papiere? Interessant.', accept: 'Diskret und günstig. Perfekt.', reject: 'Der Aufschlag ist mir zu heiß.', walkout: 'Zu riskant zu dem Kurs.' } },
  { id: 'neureich', name: 'Neureicher',    icon: '🤵', color: '#8a6d3a', priceTolerance: 1.45, budgetMult: 2.3,  patience: 4, wants: ['fenced', 'weapons'], weight: 1,
    quips: { greet: 'Ich will das Beste — Geld ist Nebensache.', accept: 'Vorzüglich. Aufrunden bitte.', reject: 'Selbst mir zu unverschämt.', walkout: 'Enttäuschend.' } },
];

// ---- Feilsch-Konfiguration -------------------------------------
export const DEAL_CFG = {
  offers: { lowball: 0.7, fair: 1.0, wucher: 1.4 },   // Multiplikator auf calcValue = Startangebot
  nudge: 0.12,                 // „Nachbessern" senkt das Angebot um 12 % des calcValue
  instantThresh: 0.9,          // Angebot ≤ calcValue*0.9 → Sofort-Deal (+Reputation)
  wucherThresh: 1.5,           // Angebot > maxWillingToPay*1.5 → patience −2 (Wucher)
  variance: [0.9, 1.1],        // Zufalls-Schwankung auf maxWillingToPay
  counterRange: [0.7, 0.9],    // Gegenangebot = maxWillingToPay * random(…)
  walkoutOnWucher: 0.35,       // Chance auf Sofort-Abbruch bei Wucher
  repGainInstant: 2.5, repGainDeal: 1.2, repLossWalkout: 2.0, repMax: 100,
  spawnBase: 11,               // Sek. bis der nächste Kunde kommt
  spawnRepFactor: 0.5,         // volle Reputation halbiert die Wartezeit
};

// ---- Beschaffungs-Run (Stealth-Gauntlet) -----------------------
// Baut auf UG_STEALTH (Kegel/Speed/Verdacht) auf; hier Map-Größe & Ausbeute.
export const SOURCING = {
  segLen: 9.5,                 // Länge eines Map-Segments (world units)
  segWide: 6.5,                // Breite des Gauntlets
  cats: {
    drugs:   { name: 'Drogen-Run',   icon: '💊', segments: 3, guards: 1, cover: 3, stakeSec: 60,  heat: 18, lootQty: [3, 4], lootFrom: 'drugs' },
    fenced:  { name: 'Hehler-Run',   icon: '💎', segments: 3, guards: 2, cover: 3, stakeSec: 110, heat: 24, lootQty: [2, 3], lootFrom: 'fenced' },
    weapons: { name: 'Waffen-Run',   icon: '🔫', segments: 4, guards: 2, cover: 4, stakeSec: 200, heat: 32, lootQty: [2, 3], lootFrom: 'weapons' },
  },
  heatSegBonus: 1,             // +1 Segment bei hohem Heat (>55 %)
  heatGuardBonus: 1,          // +1 Wache je Segment bei hohem Heat
};

// ---- Ego-Shooter-Raycaster (Beschaffungs-Run in 3D) ------------
export const SHOOTER = {
  fov: Math.PI / 3,          // 60° Sichtfeld
  moveSpeed: 2.9,            // Tiles/s
  turnSpeed: 2.7,            // rad/s (Joystick-Drehung)
  playerHp: 100,
  gunDamage: 42,
  fireCd: 0.32,              // s zwischen Schüssen
  aimAssist: 0.36,           // rad: Frontkegel fürs Auto-Aim
  guardHp: 55,
  guardDmg: 10,
  guardFireCd: 1.15,         // s zwischen Wach-Schüssen
  guardRange: 9,             // Sicht-/Feuerreichweite (Tiles)
  guardViewHalf: 0.62,       // Sicht-Halbwinkel im Patrouillenzustand (rad)
  hitBaseChance: 0.85,       // Wach-Trefferchance auf kurze Distanz
  wallH: 1.0,
  cats: {   // Map-Größe (Räume im Raster) + Wachenzahl je Sparte
    drugs:   { rooms: 3, guards: 3 },
    fenced:  { rooms: 4, guards: 4 },
    weapons: { rooms: 5, guards: 6 },
  },
  heatGuardBonus: 2,         // +Wachen bei hohem Heat (>55 %)
};
// Harte Strafe fürs Erwischt-/Erschossenwerden — alle vier Bausteine
export const BUST_PENALTY = {
  bailFrac: 0.25,            // Anteil des Barvermögens als Kaution
  bailMin: 500,
  stockLossFrac: 0.4,        // Anteil des Lagers wird beschlagnahmt
  jailSec: 90,               // Hinterzimmer so lange gesperrt (Knast)
  heatTo: 92,                // Heat schnellt auf diesen Wert
  raidMult: 1.5,             // Club-Razzia dauert länger
  catMult: { drugs: 0.8, fenced: 1.0, weapons: 1.3 },   // Waffen am härtesten
};

// ---- Endgame-Ziel: Franchise „Das Boot" (Teaser/Gate) ----------
export const BOOT_REQ = { fame: 3, lifetime: 5e12 };  // erst mit Prestige-Sternen + Vermögen

// ================================================================
//  Story & Ziele: zwei gleichwertige Wege mit eigenem Endgame
//  Legal: „Club-Imperium → Weltrangliste #1 (König der Nacht stürzen)"
//  Unterwelt: „Das Boot → Kingpin des Hafens"
// ================================================================
export const NEMESIS = { id: 'r13', name: 'König der Nacht', icon: '👑',
  taunts: [
    'Süß, dein kleiner Laden. Ruf mich, wenn du echte Gäste willst.',
    'Noch #%r%? Ich hab Nächte, die mehr wert sind als dein Leben.',
    'Du kommst näher. Niedlich. Aber der Thron gehört mir.',
    'Du atmest mir in den Nacken… das gefällt mir nicht.',
  ],
  beaten: 'Der König ist tot. Die Nacht gehört jetzt DIR. 👑' };

// Unterwelt-Kapitel (paralleler Story-Strang zum legalen PHASES)
export const UNDERWORLD_PHASES = [
  { name: 'Erste Ware', quests: [
    { t: 'runs', v: 1,  txt: 'Zieh deinen ersten Beschaffungs-Run durch' },
    { t: 'sold', v: 3,  txt: 'Verkaufe 3 Stück an der Theke' },
  ]},
  { name: 'Das Geschäft läuft', quests: [
    { t: 'sold', v: 12, txt: 'Verkaufe 12 Stück' },
    { t: 'rep',  v: 25, txt: 'Erreiche Ruf 25' },
    { t: 'runs', v: 4,  txt: 'Überstehe 4 Runs' },
  ]},
  { name: 'Heiße Ware', quests: [
    { t: 'sold', v: 30, txt: 'Verkaufe 30 Stück' },
    { t: 'rep',  v: 50, txt: 'Erreiche Ruf 50' },
    { t: 'cat',  v: 'weapons', txt: 'Zieh einen Waffen-Run durch' },
  ]},
  { name: 'Der Hafen ruft', quests: [
    { t: 'sold', v: 60, txt: 'Verkaufe 60 Stück' },
    { t: 'rep',  v: 80, txt: 'Erreiche Ruf 80' },
    { t: 'runs', v: 12, txt: 'Überstehe 12 Runs' },
  ]},
];
export function getUgPhase(i) {
  if (i < UNDERWORLD_PHASES.length) return UNDERWORLD_PHASES[i];
  const k = i - UNDERWORLD_PHASES.length + 1;
  return { name: `Imperium ${k}`, quests: [
    { t: 'sold', v: 60 + k * 40, txt: `Verkaufe ${60 + k * 40} Stück` },
    { t: 'rep',  v: Math.min(100, 80 + k * 5), txt: `Ruf ${Math.min(100, 80 + k * 5)}` },
  ]};
}

// Story-Beats: einmalige erzählte Karten bei Erstereignissen/Kapiteln
export const STORY = {
  intro:        { icon: '✈️', title: 'Willkommen im AIRPORT', text: 'Ein leeres Terminal, ein Traum und 25 €. Bau den heißesten Club der Stadt — und wer weiß, was im Hinterzimmer noch geht.' },
  firstDeal:    { icon: '🤝', title: 'Erster Deal', text: 'Sauberes Geld ist langsam. DAS hier geht schneller. Aber jeder Kunde ist ein Risiko — und der Ruf zählt.' },
  firstRun:     { icon: '🗺️', title: 'Ware besorgen', text: 'Kein Lager, kein Geschäft. Schlag dich durch, hol die Ware, komm lebend raus. Willkommen im Untergrund.' },
  firstBust:    { icon: '🚨', title: 'Hochgenommen', text: 'Kaution, beschlagnahmte Ware, Knast. Das Geschäft vergisst nicht. Nächstes Mal: leiser oder tödlicher.' },
  bootTease:    { icon: '🚢', title: '„Das Boot"', text: 'Man munkelt vom Hafen — wer dort das Sagen hat, ist unantastbar. Prestige-Sterne und ein Vermögen öffnen die Tür.' },
  bootOpen:     { icon: '⚓', title: 'Franchise #2: Das Boot', text: 'Würzburg, Hafenbecken. Dein zweiter Club schwimmt buchstäblich — das Oberdeck ist eröffnet. Der Airport läuft weiter, während du hier ausbaust.' },
  nemesisIntro: { icon: '👑', title: 'König der Nacht', text: 'Ganz oben thront einer. Er kennt deinen Namen noch nicht. Das wird sich ändern.' },
  nemesisBeaten:{ icon: '🏆', title: 'Der Thron ist deiner', text: 'Du hast den König gestürzt. Die Weltrangliste führt jetzt EIN Name: deiner.' },
};

// ---- Live-Events (Happy Hour / Rush) ---------------------------
export const EVENT_GAP = { min: 210, max: 420 };          // Sekunden zwischen Events
export const EVENTS = [
  { id: 'happyhour', name: 'Happy Hour',   icon: '🍹', mult: 2,   dur: 60, guests: 1.2, txt: 'Doppeltes Einkommen an allen Bars!' },
  { id: 'rush',      name: 'Freitagnacht', icon: '🎉', mult: 2.5, dur: 45, guests: 1.8, txt: 'Der Laden ist rappelvoll!' },
  { id: 'vipnight',  name: 'VIP-Nacht',    icon: '🥂', mult: 3,   dur: 40, guests: 1.4, txt: 'Die High-Roller sind da!' },
  { id: 'ladies',    name: 'Ladies Night', icon: '💃', mult: 2.2, dur: 50, guests: 1.5, txt: 'Freier Eintritt — volle Tanzfläche!' },
];

// ---- Glücksrad (täglicher Bonus) -------------------------------
// reward: money = incomePerSec * minutes*60 (skaliert mit Fortschritt), gems fest.
export const WHEEL = [
  { label: '5 Min €',  color: '#43d95e', type: 'money', minutes: 5 },
  { label: '3 💎',      color: '#c56cf0', type: 'gems',  gems: 3 },
  { label: '15 Min €', color: '#4fd7f7', type: 'money', minutes: 15 },
  { label: '⚡ Boost',  color: '#ffd93c', type: 'boost' },
  { label: '8 Min €',  color: '#43d95e', type: 'money', minutes: 8 },
  { label: '6 💎',      color: '#f2a9ff', type: 'gems',  gems: 6 },
  { label: '30 Min €', color: '#ff9f43', type: 'money', minutes: 30 },
  { label: '🔊 DROP',   color: '#ff5e8a', type: 'drop' },
];
export const DAILY_MIN_GAP_H = 20;   // frühestens nach 20 h wieder
export const DAILY_STREAK_MAX = 7;   // Streak-Bonus deckelt bei x7

// ---- Räume -----------------------------------------------------
export const ROOMS = [
  { id: 't1',   name: 'Terminal 1', sub: 'Mainfloor',  icon: '🪩' },
  { id: 't2',   name: 'Terminal 2', sub: 'Zweiter Floor', icon: '🪩' },
  { id: 'roof', name: 'Rooftop',    sub: 'VIP Sky Lounge', icon: '🌃' },
  { id: 'boot1', name: 'Das Boot · Oberdeck', sub: 'Franchise #2 · Würzburg', icon: '🚢' },
];

// ---- Stationen -------------------------------------------------
// baseIncome = €/s pro Stufe · Kosten = baseCost * growth^stufe
export const STATIONS = [
  { id: 'einlass',   room: 't1', name: 'Einlass',            icon: '🚪', desc: 'Mehr Gäste kommen rein',        baseCost: 12,     growth: 1.15, baseIncome: 0.45 },
  { id: 'garderobe', room: 't1', name: 'Garderobe',          icon: '🧥', desc: 'Eintritt & Trinkgeld',          baseCost: 75,     growth: 1.16, baseIncome: 2.0 },
  { id: 'bar',       room: 't1', name: 'Bar',                icon: '🍹', desc: 'Cocktails & Longdrinks',        baseCost: 550,    growth: 1.16, baseIncome: 9 },
  { id: 'dj',        room: 't1', name: 'DJ-Pult',            icon: '🎧', desc: 'Beats für die Menge',           baseCost: 3800,   growth: 1.17, baseIncome: 40 },
  { id: 'dance',     room: 't1', name: 'Tanzfläche',         icon: '💃', desc: 'Platz für mehr Leute',          baseCost: 24000,  growth: 1.17, baseIncome: 165 },
  { id: 'shots',     room: 't1', name: 'Shot-Bar',           icon: '🥃', desc: 'Eine Runde Shots!',             baseCost: 150000, growth: 1.17, baseIncome: 680 },
  { id: 'vipEinlass',room: 't2', name: 'VIP-Einlass',        icon: '🎫', desc: 'Nur wer auf der Liste steht',   baseCost: 9e5,    growth: 1.16, baseIncome: 3400 },
  { id: 'second',    room: 't2', name: 'Second Floor',       icon: '✨', desc: 'Die zweite Tanzfläche',         baseCost: 5e6,    growth: 1.16, baseIncome: 13000 },
  { id: 'champus',   room: 't2', name: 'Champagner-Lounge',  icon: '🍾', desc: 'Flaschen mit Wunderkerzen',     baseCost: 3.2e7,  growth: 1.17, baseIncome: 55000 },
  { id: 'tables',    room: 't2', name: 'Bottle-Service',     icon: '🛋️', desc: 'Reservierte Tische',            baseCost: 2e8,    growth: 1.17, baseIncome: 230000 },
  { id: 'chill',     room: 't2', name: 'Chill-Out-Area',     icon: '🌙', desc: 'Durchatmen & weiterfeiern',     baseCost: 1.3e9,  growth: 1.18, baseIncome: 950000 },
  { id: 'skybar',    room: 'roof', name: 'Skybar',           icon: '🍸', desc: 'Drinks über den Dächern',       baseCost: 8e9,    growth: 1.18, baseIncome: 4.2e6 },
  { id: 'pool',      room: 'roof', name: 'Pool-Bar',         icon: '🏊', desc: 'Party am Rooftop-Pool',         baseCost: 5e10,   growth: 1.18, baseIncome: 1.9e7 },
  { id: 'stars',     room: 'roof', name: 'Sternenhimmel',    icon: '🌌', desc: 'Open-Air-Floor unterm Himmel',  baseCost: 3.5e11, growth: 1.19, baseIncome: 9e7 },
  // ---- Das Boot · Oberdeck (Franchise #2, Endgame — setzt die Kurve hinter Rooftop fort) ----
  { id: 'gangway',        room: 'boot1', name: 'Gangway',           icon: '🛳️', desc: 'Mehr Gäste kommen an Bord',     baseCost: 2e12,   growth: 1.16, baseIncome: 2e8 },
  { id: 'hafenbar',       room: 'boot1', name: 'Hafenbar',          icon: '⚓',  desc: 'Cocktails mit Meerblick',       baseCost: 1.2e13, growth: 1.17, baseIncome: 9e8 },
  { id: 'sonnendeck',     room: 'boot1', name: 'Sonnendeck-Lounge', icon: '🌊', desc: 'Liegen & Champagner an Deck',   baseCost: 8e13,   growth: 1.18, baseIncome: 4e9 },
  { id: 'kapitaenssuite', room: 'boot1', name: 'Kapitänssuite',     icon: '👑', desc: 'Die exklusivste Adresse an Bord', baseCost: 6e14, growth: 1.19, baseIncome: 1.8e10 },
];

export const STATION_MAP = Object.fromEntries(STATIONS.map(s => [s.id, s]));

// Konsum-Stationen: hier fällt einsammelbares Geld an (Pins).
export const CASH_STATIONS = ['garderobe', 'bar', 'shots', 'champus', 'tables', 'chill', 'skybar', 'pool', 'hafenbar', 'sonnendeck', 'kapitaenssuite'];

// ---- Personal ---------------------------------------------------
export const STAFF = [
  { id: 'bruno', name: 'Türsteher Bruno',  icon: '🕶️', desc: '+20 % auf Einlass, Garderobe & VIP-Einlass pro Stufe', baseCost: 2500,  growth: 6, max: 10, targets: ['einlass', 'garderobe', 'vipEinlass'], perLevel: 0.2 },
  { id: 'mia',   name: 'Barkeeperin Mia',  icon: '🍸', desc: '+20 % auf alle Bars & Lounges pro Stufe', baseCost: 40000, growth: 6, max: 10, targets: ['bar', 'shots', 'champus', 'tables', 'skybar', 'pool'], perLevel: 0.2 },
  { id: 'neon',  name: 'DJ Neon',          icon: '🎛️', desc: '+8 % Gesamteinkommen & +2 s DROP-Dauer pro Stufe', baseCost: 600000, growth: 6, max: 10, global: 0.08, dropBonus: 2 },
  { id: 'lea',   name: 'Promoterin Lea',   icon: '📣', desc: '+25 % Offline-Einnahmen & +5 % Gesamteinkommen pro Stufe', baseCost: 9e6, growth: 6, max: 10, global: 0.05, offline: 0.25 },
  { id: 'kapitaen', name: 'Kapitän Henriksen', icon: '⚓', desc: '+20 % auf alle Boot-Stationen pro Stufe', baseCost: 5e12, growth: 6, max: 10, targets: ['hafenbar', 'sonnendeck', 'kapitaenssuite'], perLevel: 0.2 },
];

export const STAFF_MAP = Object.fromEntries(STAFF.map(s => [s.id, s]));

// ---- Diamant-Shop ----------------------------------------------
export const SHOP = [
  { id: 'cash1',  name: 'Geldkoffer',     icon: '💼', desc: '10 Minuten Einkommen sofort',  gems: 3,  minutes: 10 },
  { id: 'cash2',  name: 'Geld-Palette',   icon: '🧳', desc: '45 Minuten Einkommen sofort',  gems: 10, minutes: 45 },
  { id: 'boost',  name: 'Sofort-Boost',   icon: '⚡', desc: 'x2 Einkommen sofort starten (Cooldown egal)', gems: 8 },
  { id: 'drop',   name: 'Instant-DROP',   icon: '🔊', desc: 'Löst sofort einen DROP aus',   gems: 4 },
];

// ---- Erfolge / Achievements ------------------------------------
// Bedingung nutzt dieselbe questValue()-Logik wie Quests (t + v).
export const ACHIEVEMENTS = [
  { id: 'earn1',  icon: '💶', name: 'Erste Kasse',       t: 'earn',   v: 10_000,   txt: '10K € insgesamt verdient',       gems: 2 },
  { id: 'earn2',  icon: '💰', name: 'Geldmaschine',      t: 'earn',   v: 10e6,     txt: '10M € insgesamt verdient',       gems: 5 },
  { id: 'earn3',  icon: '🤑', name: 'Millionärsclub',    t: 'earn',   v: 1e9,      txt: '1B € insgesamt verdient',        gems: 10 },
  { id: 'earn4',  icon: '🏦', name: 'Imperium',          t: 'earn',   v: 1e12,     txt: '1T € insgesamt verdient',        gems: 20 },
  { id: 'lvl1',   icon: '⭐', name: 'Aufsteiger',        t: 'level',  v: 10,       txt: 'Level 10 erreicht',              gems: 4 },
  { id: 'lvl2',   icon: '🌟', name: 'Szene-Größe',       t: 'level',  v: 25,       txt: 'Level 25 erreicht',              gems: 10 },
  { id: 'drops1', icon: '🔊', name: 'Bass-Drop',         t: 'drops',  v: 10,       txt: '10 DROPs ausgelöst',             gems: 4 },
  { id: 'drops2', icon: '📢', name: 'DROP-Meister',      t: 'drops',  v: 50,       txt: '50 DROPs ausgelöst',             gems: 12 },
  { id: 'celeb1', icon: '🌟', name: 'Roter Teppich',     t: 'celebs', v: 5,        txt: '5 Promis begrüßt',               gems: 6 },
  { id: 'staff1', icon: '👥', name: 'Chef-Etage',        t: 'staffLevels', v: 20,  txt: '20 Personal-Stufen',             gems: 8 },
  { id: 't2a',    icon: '🥂', name: 'VIP-Betreiber',     t: 't2',     v: 1,        txt: 'Terminal 2 freigeschaltet',      gems: 6 },
  { id: 'roofa',  icon: '🌃', name: 'Über den Dächern',  t: 'roof',   v: 1,        txt: 'Rooftop freigeschaltet',         gems: 15 },
  { id: 'levels1',icon: '🏗️', name: 'Dauerbaustelle',    t: 'levels', v: 300,      txt: '300 Stationsstufen insgesamt',   gems: 10 },
  { id: 'fame1',  icon: '♻️', name: 'Neuanfang',         t: 'fame',   v: 1,        txt: 'Einmal neu eröffnet',            gems: 15 },
  // ---- Lategame-Tiers (für Spieler jenseits von Rooftop & erstem Prestige) ----
  { id: 'earn5',  icon: '👑', name: 'Nachtclub-Dynastie', t: 'earn',   v: 1e15,     txt: '1 Billiarde € insgesamt verdient', gems: 35 },
  { id: 'lvl3',   icon: '🏆', name: 'Legende der Szene',  t: 'level',  v: 50,       txt: 'Level 50 erreicht',              gems: 20 },
  { id: 'levels2',icon: '🧱', name: 'Mega-Ausbau',        t: 'levels', v: 800,      txt: '800 Stationsstufen insgesamt',   gems: 18 },
  { id: 'fame3',  icon: '♻️', name: 'Serien-Gründer',     t: 'fame',   v: 3,        txt: '3× neu eröffnet',                gems: 25 },
];

// ---- Phasen & Quests --------------------------------------------
// Quest-Typen: station | levels | earn | income | level | staff | staffLevels
//              drops | celebs | boosts | t2 | roof | fame
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
  { name: 'Ab aufs Dach', quests: [
    { t: 'level',   v: 20,                txt: 'Erreiche Level 20' },
    { t: 'roof',    v: 1,                 txt: 'Schalte das Rooftop frei' },
    { t: 'station', id: 'tables', v: 10,  txt: 'Bottle-Service auf Stufe 10' },
    { t: 'income',  v: 1e6,               txt: 'Erreiche 1M €/s Einkommen' },
    { t: 'earn',    v: 1e9,               txt: 'Verdiene insgesamt 1B €' },
  ]},
  { name: 'Sky is the limit', quests: [
    { t: 'station', id: 'skybar', v: 10,  txt: 'Skybar auf Stufe 10' },
    { t: 'station', id: 'chill',  v: 25,  txt: 'Chill-Out-Area auf Stufe 25' },
    { t: 'celebs',  v: 5,                 txt: 'Begrüße 5 Promi-Gäste' },
    { t: 'staffLevels', v: 12,            txt: 'Insgesamt 12 Personal-Stufen' },
    { t: 'earn',    v: 5e10,              txt: 'Verdiene insgesamt 50B €' },
  ]},
  { name: 'Kult-Club', quests: [
    { t: 'level',   v: 25,                txt: 'Erreiche Level 25' },
    { t: 'station', id: 'pool',  v: 10,   txt: 'Pool-Bar auf Stufe 10' },
    { t: 'levels',  v: 600,               txt: 'Insgesamt 600 Stationsstufen' },
    { t: 'earn',    v: 5e11,              txt: 'Verdiene insgesamt 500B €' },
  ]},
  { name: 'Neueröffnung?', quests: [
    { t: 'fame',    v: 1,                 txt: 'Eröffne den Club neu (1 Ruf-Stern)' },
    { t: 'station', id: 'stars', v: 25,   txt: 'Sternenhimmel auf Stufe 25' },
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
    ? { gems: 1 + Math.floor(phaseIdx / 3), minutes: 2 }
    : { gems: 2 + Math.floor(phaseIdx / 2), minutes: 5 };
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

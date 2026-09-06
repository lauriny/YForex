// ============================================================
//  Icon-Set — gezeichnete SVGs statt System-Emoji.
//  Emoji rendern auf jedem Gerät anders (Apple/Google/Windows);
//  das ist das deutlichste „selbstgebaut"-Signal in einem Produkt.
//  Alle Pfade: 24×24-Raster, Strichstärke 2, runde Enden — ein Stil.
// ============================================================
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const P = {
  // Regler statt Zahnrad — eindeutiger und moderner
  gear:    `<path d="M4 7h9M17 7h3M4 17h3M11 17h9" ${S}/><circle cx="15" cy="7" r="2.4" ${S}/><circle cx="9" cy="17" r="2.4" ${S}/>`,
  star:    `<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z" ${S}/>`,
  gem:     `<path d="M6 3.6h12l3.4 5.2L12 20.6 2.6 8.8z" ${S}/><path d="M2.6 8.8h18.8M9 3.6l-1.6 5.2L12 20.6l4.6-11.8L15 3.6" ${S}/>`,
  cash:    `<rect x="2.6" y="6" width="18.8" height="12" rx="2.2" ${S}/><circle cx="12" cy="12" r="2.8" ${S}/><path d="M6 9.6v4.8M18 9.6v4.8" ${S}/>`,
  book:    `<path d="M3.4 4.6a1.6 1.6 0 0 1 1.6-1.6H10a2.6 2.6 0 0 1 2 1 2.6 2.6 0 0 1 2-1h5a1.6 1.6 0 0 1 1.6 1.6v12.6a1.4 1.4 0 0 1-1.4 1.4H14a2 2 0 0 0-2 1.4 2 2 0 0 0-2-1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" ${S}/><path d="M12 4v16" ${S}/>`,
  globe:   `<circle cx="12" cy="12" r="9" ${S}/><path d="M3.2 12h17.6M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" ${S}/>`,
  hammer:  `<path d="M14.4 3.6l6 6-2.6 2.6-6-6z" ${S}/><path d="M12.4 8.2 4.6 16a2.4 2.4 0 0 0 3.4 3.4l7.8-7.8" ${S}/>`,
  people:  `<circle cx="9" cy="8" r="3.2" ${S}/><path d="M3 20a6 6 0 0 1 12 0" ${S}/><path d="M16.4 5.2a3.2 3.2 0 0 1 0 5.6M17.6 14.6A6 6 0 0 1 21 20" ${S}/>`,
  pin:     `<path d="M12 21.4s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" ${S}/><circle cx="12" cy="10.2" r="2.6" ${S}/>`,
  flame:   `<path d="M12 21c3.6 0 6.2-2.4 6.2-5.7 0-4.4-4.4-5.9-3.4-11.3-2.6.8-5.1 3.6-5.1 6.6 0 1.1.3 1.9.3 1.9s-1.6-.6-2.1-2.2C6.6 12 5.8 13.4 5.8 15.3 5.8 18.6 8.4 21 12 21z" ${S}/>`,
  ship:    `<path d="M3.4 14.6 5 9.4h14l1.6 5.2" ${S}/><path d="M2.6 14.6h18.8l-1.7 4.2a2.4 2.4 0 0 1-2.2 1.4H6.5a2.4 2.4 0 0 1-2.2-1.4z" ${S}/><path d="M8.6 9.4V6.2h6.8v3.2M12 6.2V3.4" ${S}/>`,
  plane:   `<path d="M10.4 3.2a1.6 1.6 0 0 1 3.2 0v5.6l7.8 4.4v2.4l-7.8-2.4v4.2l2.6 1.8v1.8L12 20l-4.2.9v-1.8l2.6-1.8v-4.2L2.6 15.6v-2.4l7.8-4.4z" ${S}/>`,
  shades:  `<path d="M2.6 8.6h18.8" ${S}/><path d="M3.4 8.6h7v3.2a3.2 3.2 0 0 1-6.4 0zM13.6 8.6h7v3.2a3.2 3.2 0 0 1-6.4 0z" ${S}/><path d="M10.4 10.2h3.2" ${S}/>`,
  dots:    `<circle cx="5.4" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.6" cy="12" r="1.6" fill="currentColor"/>`,
  bolt:    `<path d="M13.4 2.6 4.6 13.4h6L10.6 21.4l8.8-10.8h-6z" ${S}/>`,
  gift:    `<rect x="3" y="9.4" width="18" height="11.2" rx="1.8" ${S}/><path d="M2.2 9.4h19.6M12 9.4v11.2" ${S}/><path d="M12 9.4C10.6 6.6 9.4 5 7.8 5a2.4 2.4 0 0 0 0 4.4M12 9.4c1.4-2.8 2.6-4.4 4.2-4.4a2.4 2.4 0 0 1 0 4.4" ${S}/>`,
  trophy:  `<path d="M7.4 4h9.2v5.4a4.6 4.6 0 0 1-9.2 0z" ${S}/><path d="M7.4 5.6H4.6v1.6a3 3 0 0 0 3 3M16.6 5.6h2.8v1.6a3 3 0 0 1-3 3" ${S}/><path d="M12 14v3.4M8.6 20.4h6.8l-.8-3H9.4z" ${S}/>`,
  camera:  `<rect x="2.6" y="7" width="18.8" height="13" rx="2.4" ${S}/><circle cx="12" cy="13.4" r="3.6" ${S}/><path d="M8.6 7l1.4-2.6h4L15.4 7" ${S}/>`,
  clock:   `<circle cx="12" cy="12" r="9" ${S}/><path d="M12 6.6V12l3.6 2.2" ${S}/>`,
  check:   `<path d="M4.6 12.6 9.4 17.4 19.4 6.6" ${S}/>`,
  x:       `<path d="M6 6l12 12M18 6 6 18" ${S}/>`,
  lock:    `<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.2" ${S}/><path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" ${S}/>`,
  // --- Stationen & Räume ---
  door:    `<rect x="5.4" y="3" width="13.2" height="18" rx="1.6" ${S}/><circle cx="15" cy="12" r="1.1" fill="currentColor"/>`,
  coat:    `<path d="M12 3.4a2.3 2.3 0 0 0 0 4.6c1 0 1.6.5 1.6 1.3M12 9.3 4.4 14.6v4.2a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-4.2z" ${S}/>`,
  drink:   `<path d="M4.6 4.6h14.8L12 12.8zM12 12.8v6.6M8.4 19.4h7.2" ${S}/>`,
  headset: `<path d="M4.4 14v-2a7.6 7.6 0 0 1 15.2 0v2" ${S}/><rect x="2.8" y="13.4" width="4" height="6.2" rx="1.6" ${S}/><rect x="17.2" y="13.4" width="4" height="6.2" rx="1.6" ${S}/>`,
  dance:   `<circle cx="13.4" cy="4.6" r="2" ${S}/><path d="M13.4 7v5l3.6 3M13.4 12l-3.4 2.4-1.4 5.4M17 15l1.6 5M5.6 9.4l4-1.4 3.8-1" ${S}/>`,
  shot:    `<path d="M7 4.6h10l-1.4 14a1.6 1.6 0 0 1-1.6 1.4h-4a1.6 1.6 0 0 1-1.6-1.4z" ${S}/><path d="M7.6 11h8.8" ${S}/>`,
  ticket:  `<path d="M3 8.4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.4a2.2 2.2 0 0 0 0 4.4v1.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.4a2.2 2.2 0 0 0 0-4.4z" ${S}/><path d="M14 7.4v9.2" stroke-dasharray="2 2.4" ${S}/>`,
  sparkle: `<path d="M12 3.2 13.8 9 19.6 10.8 13.8 12.6 12 18.4 10.2 12.6 4.4 10.8 10.2 9z" ${S}/><path d="M18.4 16.4 19.2 18.8 21.6 19.6 19.2 20.4 18.4 22.8 17.6 20.4 15.2 19.6 17.6 18.8z" ${S}/>`,
  bottle:  `<path d="M10 3h4v3.4l2.4 3.2v9.8a1.6 1.6 0 0 1-1.6 1.6H9.2a1.6 1.6 0 0 1-1.6-1.6V9.6L10 6.4z" ${S}/><path d="M7.6 13.4h8.8" ${S}/>`,
  sofa:    `<path d="M4 11.6V8.4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3.2" ${S}/><path d="M2.6 12.6a2 2 0 0 1 4 0v2.8h10.8v-2.8a2 2 0 0 1 4 0v4.6H2.6z" ${S}/><path d="M5 17.2v2M19 17.2v2" ${S}/>`,
  moon:    `<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6z" ${S}/>`,
  pool:    `<path d="M3 16.4c1.8 0 1.8 1.6 3.6 1.6s1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6 1.8-1.6 3.6-1.6 1.8 1.6 3.6 1.6" ${S}/><path d="M7.4 14V6.4a2.4 2.4 0 0 1 4.8 0M14.4 14V6.4a2.4 2.4 0 0 1 4.8 0" ${S}/><path d="M7.4 10h4.8M14.4 10h4.8" ${S}/>`,
  stars:   `<path d="M6.6 3.4 7.6 6.2 10.4 7.2 7.6 8.2 6.6 11 5.6 8.2 2.8 7.2 5.6 6.2z" ${S}/><path d="M16 9.4 17.2 12.8 20.6 14 17.2 15.2 16 18.6 14.8 15.2 11.4 14 14.8 12.8z" ${S}/>`,
  anchor:  `<circle cx="12" cy="5" r="2.2" ${S}/><path d="M12 7.2V21M7 10.4h10M3.4 15.4a8.6 8.6 0 0 0 17.2 0" ${S}/>`,
  beer:    `<path d="M5 7.4h11v12.2a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19.6z" ${S}/><path d="M16 10.4h2.4a2.4 2.4 0 0 1 0 4.8H16" ${S}/><path d="M5 7.4a2.4 2.4 0 0 1 2.4-2.4 2.4 2.4 0 0 1 4.6-.6 2.4 2.4 0 0 1 4 3" ${S}/>`,
  wave:    `<path d="M2.6 8.6c1.9 0 1.9 1.8 3.8 1.8s1.9-1.8 3.8-1.8 1.9 1.8 3.8 1.8 1.9-1.8 3.8-1.8 1.9 1.8 3.8 1.8" ${S}/><path d="M2.6 14c1.9 0 1.9 1.8 3.8 1.8s1.9-1.8 3.8-1.8 1.9 1.8 3.8 1.8 1.9-1.8 3.8-1.8 1.9 1.8 3.8 1.8" ${S}/>`,
  crown:   `<path d="M3.4 7.4 6.6 13 12 5.4 17.4 13l3.2-5.6v10.2a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z" ${S}/>`,
  boiler:  `<rect x="6" y="4" width="12" height="16" rx="3" ${S}/><circle cx="12" cy="10.4" r="2.4" ${S}/><path d="M9 16h6" ${S}/>`,
  megaphone:`<path d="M4 10v4a1.6 1.6 0 0 0 1.6 1.6h1.8L14 20V4L7.4 8.4H5.6A1.6 1.6 0 0 0 4 10z" ${S}/><path d="M17.4 9a4 4 0 0 1 0 6" ${S}/>`,
  crane:   `<path d="M4 21V4h9l7 3.4M4 8h9" ${S}/><path d="M17 7.4v4.2M14.6 11.6h4.8l-.8 3h-3.2z" ${S}/>`,
  arrow:   `<path d="M4.6 12h14M13 6.6l5.6 5.4-5.6 5.4" ${S}/>`,
};

// Ruf-Anzeige: Ring statt Emoji-Gesicht — Füllstand zeigt den Wert
export function repIcon(rep, color) {
  const r = 9, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, rep)) / 100;
  return `<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="${r}" fill="none" stroke="currentColor" stroke-width="2.4" opacity="0.22"/>` +
    `<circle cx="12" cy="12" r="${r}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"` +
    ` stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - f)}" transform="rotate(-90 12 12)"/></svg>`;
}

export function icon(name, cls = '') {
  const p = P[name];
  if (!p) return '';
  return `<svg viewBox="0 0 24 24" class="ic ${cls}" aria-hidden="true">${p}</svg>`;
}
// Alle <i data-ic="name"> im Baum durch das echte SVG ersetzen
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => {
    if (el.dataset.icDone) return;
    el.innerHTML = icon(el.dataset.ic);
    el.dataset.icDone = '1';
  });
}

// Emoji-freie Zuordnung für Stationen, Personal und Räume.
// Die Daten behalten ihr Emoji als Fallback; angezeigt wird das gezeichnete Icon.
export const ICON_FOR = {
  // Stationen
  einlass: 'door', garderobe: 'coat', bar: 'drink', dj: 'headset', dance: 'dance', shots: 'shot',
  vipEinlass: 'ticket', second: 'sparkle', champus: 'bottle', tables: 'sofa', chill: 'moon',
  skybar: 'drink', pool: 'pool', stars: 'stars',
  gangway: 'ship', hafenbar: 'anchor', bierpong: 'beer', sonnendeck: 'wave',
  kapitaenssuite: 'crown', salon: 'bottle', maschinenraum: 'cog', kesselbar: 'boiler',
  // Personal
  bruno: 'shades', mia: 'drink', neon: 'headset', lea: 'megaphone', kapitaen: 'anchor',
  // Räume
  t1: 'sparkle', t2: 'sparkle', roof: 'stars', klo: 'door', hinter: 'shades',
  boot1: 'ship', boot2: 'bottle', boot3: 'cog',
  // Shop
  cash1: 'cash', cash2: 'cash', boost: 'bolt', drop: 'megaphone',
};
export function iconFor(id, fallback = '') {
  const n = ICON_FOR[id];
  return n ? icon(n) : fallback;
}

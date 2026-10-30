// Line icons for the hub (24×24 grid, 1.75 stroke, drawn in currentColor).
import { html } from '../vendor/preact-htm.js?v=202610300457';

const P = {
  orders: ['M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  menu: ['M4 5h16', 'M4 10h16', 'M4 15h10', 'M4 20h7'],
  tables: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h3v3h-3z', 'M20 17v3h-3', 'M17 20h-3'],
  printers: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
  stats: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  soundOn: ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
  soundOff: ['M11 5 6 9H2v6h4l5 4V5z', 'M22 9l-6 6', 'M16 9l6 6'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  pause: ['M8 5v14', 'M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  sun: ['M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'M5.6 5.6l1.4 1.4', 'M17 17l1.4 1.4', 'M5.6 18.4 7 17', 'M17 7l1.4-1.4', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  external: ['M14 3h7v7', 'M10 14 21 3', 'M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5'],
  chevron: ['M6 9l6 6 6-6'],
  check: ['M5 12l5 5L20 7'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  globe: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  bill: ['M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z', 'M9 8h6', 'M9 12h6'],
  waiter: ['M3 18h18', 'M5 18a7 7 0 0 1 14 0', 'M12 9V7', 'M10 7h4'],
  kitchen: ['M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-7.5z'],
  bar: ['M7 3h10l-1 8a4 4 0 0 1-8 0z', 'M12 15v6', 'M8 21h8'],
  photo: ['M3 6h4l2-2h6l2 2h4v14H3z', 'M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z'],
  alert: ['M12 8v5', 'M12 16.5v.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 7v5l3 2'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  store: ['M3 9l1.5-5h15L21 9', 'M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z', 'M5 13v8h14v-8'],
};

export function Icon({ name, size = 18, className = '' }) {
  return html`<svg class="h-ico ${className}" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    ${(P[name] || []).map((d) => html`<path d=${d} />`)}
  </svg>`;
}

/** The Farol mark: a lamp inside a lighthouse lantern. */
export function Mark({ size = 22 }) {
  return html`<svg class="h-markico" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="18" height="18" rx="6" fill="var(--mark-bg)" />
    <circle cx="12" cy="12" r="3.6" fill="var(--lamp)" />
    <path d="M12 3.6v2.4M12 18v2.4M3.6 12H6M18 12h2.4" stroke="var(--lamp)" stroke-width="1.6" stroke-linecap="round" opacity=".55" />
  </svg>`;
}

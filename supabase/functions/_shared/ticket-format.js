// Kitchen ticket ("comanda") formatting — shared by the browser hub and the cloud printer functions.
// Tickets list what to prepare. They carry no prices, so they are never mistaken for a receipt/invoice.

const STATION = { kitchen: 'COCINA', bar: 'BARRA', all: '' };

export function stripAccents(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/[¡¿]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '');
}

const name = (x) => x?.name_es || x?.name_en || '';

// Wraps text to `width` columns. The first line keeps its own leading spaces,
// continuation lines start with `indent`.
function wrap(text, width, indent = '') {
  text = String(text);
  const lead = text.match(/^\s*/)[0];
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out = [];
  let line = lead;
  for (const w of words) {
    const start = out.length ? indent : lead;
    if (line.trim() && (line + ' ' + w).length > width) {
      out.push(line);
      line = indent + w;
    } else {
      line = line.trim() ? line + ' ' + w : start + w;
    }
  }
  if (line.trim()) out.push(line);
  return out.length ? out : [''];
}

const center = (s, w) => {
  s = String(s).slice(0, w);
  const pad = Math.max(0, Math.floor((w - s.length) / 2));
  return ' '.repeat(pad) + s;
};
const spread = (a, b, w) => {
  a = String(a); b = String(b);
  const gap = Math.max(1, w - a.length - b.length);
  return a + ' '.repeat(gap) + b;
};

/** Structured lines: [{ text, big?, bold?, center? }] — the source for every output format. */
export function ticketModel(t) {
  const L = [];
  const push = (text, o = {}) => L.push({ text, ...o });
  push(t.restaurant || '', { center: true, bold: true });
  if (t.kind === 'test') {
    push('PRUEBA DE IMPRESIÓN / TEST PRINT', { center: true, bold: true });
    push('---');
    push(`Impresora: ${t.printer || ''}`);
    push(`Sección: ${STATION[t.station] || 'TODO'}`);
    push(`${t.date || ''} ${t.time || ''}`);
    push('---');
    push('Todo listo. Los pedidos aceptados', { center: true });
    push('se imprimirán aquí.', { center: true });
    return L;
  }
  const station = STATION[t.station];
  push(station ? `COMANDA - ${station}` : 'COMANDA', { center: true });
  if (t.reprint) push('** COPIA **', { center: true, bold: true });
  push('===');
  push({ left: `#${t.number}`, right: t.table || '' }, { big: true, spread: true });
  push({ left: t.time || '', right: t.date || '' }, { spread: true });
  push('---');
  for (const l of t.lines || []) {
    push(`${l.qty}x ${name(l)}`, { bold: true, big: true, wrapIndent: '   ' });
    for (const o of l.options || []) push(`+ ${name(o)}`, { indent: '   ' });
    if (l.note) push(`! ${l.note}`, { indent: '   ', bold: true });
  }
  if (t.other_station_lines > 0) {
    push('---');
    const other = t.station === 'kitchen' ? 'barra' : 'cocina';
    push(`(+${t.other_station_lines} en ticket de ${other})`);
  }
  if (t.note || t.customer_name) push('---');
  if (t.note) push(`NOTA: ${t.note}`, { bold: true });
  if (t.customer_name) push(`Cliente: ${t.customer_name}`);
  push('===');
  push('Documento no válido como factura', { center: true });
  return L;
}

/** Plain text for Star CloudPRNT (text/plain). 80 mm = 48 columns, 58 mm = 32 columns. */
export function ticketToText(t, opts = {}) {
  const w = opts.cols || (t.paper_mm === 58 ? 32 : 48);
  const out = [];
  for (const l of ticketModel(t)) {
    if (l.text === '---') { out.push('-'.repeat(w)); continue; }
    if (l.text === '===') { out.push('='.repeat(w)); continue; }
    if (l.spread) { out.push(spread(stripAccents(l.text.left), stripAccents(l.text.right), w)); continue; }
    const text = stripAccents(l.text);
    if (l.center) { out.push(center(text, w)); continue; }
    const indent = l.indent || '';
    wrap(indent + text, w, l.wrapIndent || indent).forEach((x) => out.push(x));
  }
  return out.join('\n') + '\n\n\n\n';
}

const xml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** ePOS-Print XML body for Epson Server Direct Print. */
export function ticketToEposXml(t) {
  const w = t.paper_mm === 58 ? 32 : 48;
  const parts = ['<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">',
    '<text lang="en" smooth="true"/>'];
  const text = (s, o = {}) => {
    parts.push(`<text align="${o.center ? 'center' : 'left'}"/>`);
    parts.push(`<text dw="${o.big ? 'true' : 'false'}" dh="${o.big ? 'true' : 'false'}" em="${o.bold ? 'true' : 'false'}"/>`);
    parts.push(`<text>${xml(s)}&#10;</text>`);
  };
  for (const l of ticketModel(t)) {
    if (l.text === '---') { text('-'.repeat(w)); continue; }
    if (l.text === '===') { text('='.repeat(w)); continue; }
    const cols = l.big ? Math.floor(w / 2) : w;
    if (l.spread) { text(spread(l.text.left, l.text.right, cols), l); continue; }
    if (l.center) { text(l.text, l); continue; }
    const indent = l.indent || '';
    wrap(indent + l.text, cols, l.wrapIndent || indent).forEach((x) => text(x, l));
  }
  parts.push('<text dw="false" dh="false" em="false"/>');
  parts.push('<feed line="3"/><cut type="feed"/></epos-print>');
  return parts.join('');
}

const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inner HTML of a ticket, for on-screen preview and browser printing. */
export function ticketToHtmlBody(t) {
  return ticketModel(t).map((l) => {
    if (l.text === '---') return '<hr class="tk-dash">';
    if (l.text === '===') return '<hr class="tk-solid">';
    const cls = ['tk-line', l.big && 'tk-big', l.bold && 'tk-bold', l.center && 'tk-center', l.indent && 'tk-indent']
      .filter(Boolean).join(' ');
    if (l.spread) return `<div class="${cls} tk-spread"><span>${html(l.text.left)}</span><span>${html(l.text.right)}</span></div>`;
    return `<div class="${cls}">${html(l.text)}</div>`;
  }).join('');
}

export const TICKET_CSS = `
  .tk{font-family:"Courier New",ui-monospace,monospace;color:#000;background:#fff;font-size:13px;line-height:1.35}
  .tk-line{white-space:pre-wrap;word-break:break-word}
  .tk-big{font-size:1.45em;font-weight:700;line-height:1.2}
  .tk-bold{font-weight:700}
  .tk-center{text-align:center}
  .tk-indent{padding-left:1.6em}
  .tk-spread{display:flex;justify-content:space-between;gap:8px}
  .tk hr{border:0;margin:6px 0}
  .tk-dash{border-top:1px dashed #000!important}
  .tk-solid{border-top:2px solid #000!important}
`;

/** Full HTML document sized for a thermal roll (used for silent kiosk printing). */
export function ticketToHtmlDocument(t) {
  const mm = t.paper_mm === 58 ? 58 : 80;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Comanda #${html(t.number ?? '')}</title>
<style>@page{size:${mm}mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}
body{width:${mm - 6}mm;padding:3mm}${TICKET_CSS}</style></head>
<body><div class="tk">${ticketToHtmlBody(t)}</div></body></html>`;
}

// Tables and their QR codes. Every table has its own secret code, so orders arrive with the table name.
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610300621';
import qrcode from '../vendor/qrcode.mjs?v=202610300621';
import { randomToken } from '../core/util.js?v=202610300621';
import { siteBase } from '../api/index.js?v=202610300621';
import { Switch, attempt, toast, Empty, askConfirm } from './ui.js?v=202610300621';
import { hubError } from './strings.js?v=202610300621';
import { Icon } from './icons.js?v=202610300621';

export function tableUrl(api, token) {
  return `${siteBase()}order.html?t=${token}${api.mode === 'demo' ? '&demo' : ''}`;
}

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function printSheet(r, tables, api, t) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cards = tables.filter((x) => x.active).map((x) => `<div class="card">
      <div class="name">${esc(r.name)}</div>
      <div class="qr">${qrSvg(tableUrl(api, x.token))}</div>
      <div class="table">${esc(x.label)}</div>
      <div class="cta">${esc(t.scanToOrder)}</div></div>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR · ${esc(r.name)}</title>
<style>@page{size:A4;margin:10mm}body{margin:0;font-family:Archivo,system-ui,sans-serif;color:#14213D}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.card{border:1.5px solid #14213D;border-radius:4mm;padding:5mm;text-align:center;break-inside:avoid}
.name{font-weight:700;font-size:13pt;color:${r.accent_color || '#2F5D50'}}
.qr{width:44mm;height:44mm;margin:3mm auto}.qr svg{width:100%;height:100%}
.table{font-size:16pt;font-weight:800}.cta{font-size:9pt;margin-top:1mm}</style></head>
<body><div class="grid">${cards}</div><script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

export function TablesView({ api, t, r, role, onTryTable }) {
  const [tables, setTables] = useState(null);
  const [label, setLabel] = useState('');
  const [bulk, setBulk] = useState({ prefix: 'Mesa', from: 1, to: 10 });
  const owner = role === 'owner';
  const err = (e) => hubError(t, e);
  const load = async () => setTables(await api.listTables(r.id));
  useEffect(() => { load(); }, [r.id]);

  const add = async (labels) => {
    if (!labels.length) return;
    await attempt(() => api.createTables(r.id, labels, tables.length), err);
    load();
  };
  const copy = async (url) => {
    try { await navigator.clipboard.writeText(url); toast(t.copied); } catch { toast(url); }
  };

  if (!tables) return html`<p class="h-muted">…</p>`;
  return html`<div class="h-tables">
    <p class="h-muted">${t.tablesHint}</p>
    ${owner && html`<div class="h-toolbar h-toolbar-wrap">
      <form class="h-inline-form" onSubmit=${(e) => { e.preventDefault(); if (label.trim()) { add([label.trim()]); setLabel(''); } }}>
        <input class="h-input" placeholder=${t.tableName} value=${label} maxlength="30" onInput=${(e) => setLabel(e.target.value)} aria-label=${t.tableName} />
        <button class="h-btn h-btn-primary"><${Icon} name="plus" size=${16} />${t.addTable}</button>
      </form>
      <form class="h-inline-form" onSubmit=${(e) => {
        e.preventDefault();
        const from = Number(bulk.from), to = Number(bulk.to);
        if (!(from >= 0 && to >= from && to - from < 100)) return;
        add(Array.from({ length: to - from + 1 }, (_, i) => `${bulk.prefix.trim()} ${from + i}`.trim()));
      }}>
        <span class="h-muted">${t.bulkAdd}:</span>
        <input class="h-input h-input-short" value=${bulk.prefix} onInput=${(e) => setBulk({ ...bulk, prefix: e.target.value })} aria-label=${t.prefix} />
        <span>${t.from}</span><input class="h-input h-input-num" type="number" min="0" value=${bulk.from} onInput=${(e) => setBulk({ ...bulk, from: e.target.value })} aria-label=${t.from} />
        <span>${t.to}</span><input class="h-input h-input-num" type="number" min="0" value=${bulk.to} onInput=${(e) => setBulk({ ...bulk, to: e.target.value })} aria-label=${t.to} />
        <button class="h-btn h-btn-ghost">${t.create}</button>
      </form>
      <span class="h-grow"></span>
      <button class="h-btn h-btn-ghost" disabled=${!tables.length} onClick=${() => printSheet(r, tables, api, t)}>
        <${Icon} name="printers" size=${16} />${t.printQrSheet}</button>
    </div>`}
    ${!tables.length && html`<${Empty}>${t.noTables}</${Empty}>`}
    <ul class="h-qr-grid">
      ${tables.map((x) => {
        const url = tableUrl(api, x.token);
        return html`<li class="h-qr-card ${x.active ? '' : 'is-off'}">
          <div class="h-qr" dangerouslySetInnerHTML=${{ __html: qrSvg(url) }}></div>
          ${owner
            ? html`<input class="h-qr-label" value=${x.label} maxlength="30" aria-label=${t.tableName}
                onChange=${(e) => e.target.value.trim() && attempt(() => api.updateTable(x.id, { label: e.target.value.trim() }), err).then(load)} />`
            : html`<div class="h-qr-label">${x.label}</div>`}
          <div class="h-qr-actions">
            <button class="h-link" onClick=${() => copy(url)}>${t.copyLink}</button>
            ${onTryTable
              ? html`<button class="h-link" onClick=${() => onTryTable(x.token)}>${t.testOrder}</button>`
              : html`<a class="h-link" href=${url} target="_blank" rel="noopener">${t.testOrder}</a>`}
          </div>
          ${owner && html`<div class="h-qr-actions">
            <${Switch} checked=${x.active} label=${x.active ? t.active : t.inactive}
              onChange=${(v) => attempt(() => api.updateTable(x.id, { active: v }), err).then(load)} />
            <button class="h-link" onClick=${async () => {
              if (!(await askConfirm(t.confirmNewCode, t.confirmYes, t.cancel))) return;
              await attempt(() => api.updateTable(x.id, { token: randomToken(16) }), err); load();
            }}>${t.newCode}</button>
            <button class="h-link h-link-bad" onClick=${async () => {
              if (!(await askConfirm(t.confirmDeleteTable, t.confirmYes, t.cancel))) return;
              await attempt(() => api.deleteTable(x.id), err); load();
            }}>${t.delete}</button>
          </div>`}
        </li>`;
      })}
    </ul>
  </div>`;
}

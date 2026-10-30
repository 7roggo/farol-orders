// Printers: set up this screen as a printer (option 1) or add a cloud printer (option 3).
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610301053';
import { minutesAgo, clockTime } from '../core/util.js?v=202610301053';
import { Modal, Field, attempt, toast, Empty, askConfirm } from './ui.js?v=202610301053';
import { hubError } from './strings.js?v=202610301053';
import { setDevice } from './printing.js?v=202610301053';
import { Icon } from './icons.js?v=202610301053';

const KIOSK_WIN = '--kiosk-printing';
const KIOSK_MAC = 'open -a "Google Chrome" --args --kiosk-printing';

function printerUrl(api, p) {
  const fn = p.kind === 'star' ? 'cloudprnt' : 'epson-print';
  return `${api.functionsUrl}/${fn}/${p.key}`;
}

function CopyBox({ value, t }) {
  return html`<div class="h-copy">
    <code>${value}</code>
    <button class="h-btn h-btn-small h-btn-ghost" onClick=${async () => {
      try { await navigator.clipboard.writeText(value); toast(t.copied); } catch { toast(value); }
    }}><${Icon} name="copy" size=${14} />${t.copyLink.split(' ')[0]}</button>
  </div>`;
}

function PrinterEditor({ api, t, rid, printer, onClose, onSaved }) {
  const [f, setF] = useState({ restaurant_id: rid, name: '', kind: 'browser', station: 'all', paper_mm: 80, ...printer });
  const err = (e) => hubError(t, e);
  return html`<${Modal} title=${printer?.id ? f.name : t.addPrinter} onClose=${onClose}
    footer=${html`<button class="h-btn h-btn-ghost" onClick=${onClose}>${t.cancel}</button>
      <button class="h-btn h-btn-primary" disabled=${!f.name.trim()} onClick=${async () => {
        const saved = await attempt(() => api.savePrinter({ ...f, name: f.name.trim() }), err);
        if (saved) { onSaved(saved); onClose(); }
      }}>${t.save}</button>`}>
    <${Field} label=${t.printerName}><input class="h-input" maxlength="40" value=${f.name} placeholder=${t.kitchen}
      onInput=${(e) => setF({ ...f, name: e.target.value })} /></${Field}>
    ${!printer?.id && html`<fieldset class="h-fieldset"><legend>${t.printerType}</legend>
      ${['browser', 'star', 'epson'].map((k) => html`<label class="h-choice-card ${f.kind === k ? 'is-on' : ''}">
        <input type="radio" name="kind" checked=${f.kind === k} onChange=${() => setF({ ...f, kind: k })} />
        <span><strong>${t[`type_${k}`]}</strong><small>${t[`type_${k}_hint`]}</small></span></label>`)}
    </fieldset>`}
    <${Field} label=${t.station}>
      <div class="h-seg">${['kitchen', 'bar', 'all'].map((s) => html`<label class=${f.station === s ? 'is-on' : ''}>
        <input type="radio" name="st" checked=${f.station === s} onChange=${() => setF({ ...f, station: s })} />${t[s]}</label>`)}</div>
    </${Field}>
    <${Field} label=${t.paper}>
      <div class="h-seg">${[80, 58].map((mm) => html`<label class=${f.paper_mm === mm ? 'is-on' : ''}>
        <input type="radio" name="mm" checked=${f.paper_mm === mm} onChange=${() => setF({ ...f, paper_mm: mm })} />${mm} mm</label>`)}</div>
    </${Field}>
    <p class="h-muted h-small">${t.printerHelp}</p>
  </${Modal}>`;
}

export function PrintersView({ api, t, r, role, printers, device, onDevice, onPrintersChanged, engineError }) {
  const [editing, setEditing] = useState(null);
  const [jobs, setJobs] = useState([]);
  const owner = role === 'owner';
  const err = (e) => hubError(t, e);
  const browserPrinters = printers.filter((p) => p.kind === 'browser');
  const myIds = device.printerIds ?? browserPrinters.map((p) => p.id);

  // Only re-render the ticket log when something in it actually changed.
  const loadJobs = async () => {
    const next = await api.listPrintJobs(r.id, 30);
    setJobs((prev) => (JSON.stringify(prev.map((j) => [j.id, j.status, j.error])) === JSON.stringify(next.map((j) => [j.id, j.status, j.error])) ? prev : next));
  };
  useEffect(() => { loadJobs(); const i = setInterval(loadJobs, 10000); return () => clearInterval(i); }, [r.id, printers]);

  const updateDevice = (d) => { setDevice(r.id, d); onDevice(d); };
  const nameOf = (id) => printers.find((p) => p.id === id)?.name || '—';

  return html`<div class="h-printers">
    <section class="h-panel">
      <h2>${t.thisDevice}</h2>
      <p class="h-muted">${t.thisDeviceHint}</p>
      ${browserPrinters.length ? html`<div class="h-check-list">
        ${browserPrinters.map((p) => html`<label class="h-check">
          <input type="checkbox" checked=${myIds.includes(p.id)}
            onChange=${(e) => updateDevice({ ...device, printerIds: e.target.checked ? [...myIds, p.id] : myIds.filter((x) => x !== p.id) })} />
          ${p.name} <span class="h-badge">${t[p.station]}</span></label>`)}
      </div>` : html`<p class="h-muted">—</p>`}
      <fieldset class="h-fieldset"><legend>${t.method}</legend>
        ${['print', 'screen'].map((m) => html`<label class="h-choice-card ${device.method === m ? 'is-on' : ''}">
          <input type="radio" name="method" checked=${device.method === m} onChange=${() => updateDevice({ ...device, method: m })} />
          <span><strong>${m === 'print' ? t.methodPrint : t.methodScreen}</strong><small>${m === 'print' ? t.methodPrintHint : t.methodScreenHint}</small></span>
        </label>`)}
      </fieldset>
      ${engineError && html`<p class="h-error">${engineError}</p>`}
      <details class="h-details">
        <summary>${t.kioskTitle}</summary>
        <ol>
          <li>${t.kioskDefault}</li>
          <li>${t.kioskWin}<${CopyBox} value=${KIOSK_WIN} t=${t} /></li>
          <li>${t.kioskMac}<${CopyBox} value=${KIOSK_MAC} t=${t} /></li>
        </ol>
      </details>
    </section>

    <section class="h-panel">
      <div class="h-panel-head">
        <h2>${t.nav_printers}</h2>
        ${owner && html`<button class="h-btn h-btn-primary" onClick=${() => setEditing({})}><${Icon} name="plus" size=${16} />${t.addPrinter}</button>`}
      </div>
      ${!printers.length && html`<${Empty}>${t.noPrinters}</${Empty}>`}
      <ul class="h-printer-list">
        ${printers.map((p) => {
          const seen = p.last_seen_at ? minutesAgo(p.last_seen_at) : null;
          const online = seen !== null && seen < 3;
          return html`<li class="h-printer">
            <div class="h-printer-main">
              <strong>${p.name}</strong>
              <span class="h-badge">${p.kind === 'browser' ? t.kindBrowser : p.kind === 'star' ? 'Star CloudPRNT' : 'Epson SDP'}</span>
              <span class="h-badge">${t[p.station]}</span>
              <span class="h-badge">${p.paper_mm} mm</span>
              ${p.kind === 'browser' && myIds.includes(p.id) && html`<span class="h-badge is-go">${t.devicePrints}</span>`}
              <span class="h-dot ${online ? 'is-on' : ''}">${seen === null ? t.notSeen : t.lastSeen(seen)}</span>
            </div>
            <div class="h-printer-tools">
              <button class="h-btn h-btn-ghost h-btn-small" onClick=${() => attempt(async () => { await api.testPrint(p.id); toast(t.testTicket + ' ✓'); loadJobs(); }, err)}>${t.test}</button>
              ${owner && html`
                <button class="h-btn h-btn-ghost h-btn-small" onClick=${() => setEditing(p)}>${t.edit}</button>
                <button class="h-link h-link-bad" onClick=${async () => {
                  if (!(await askConfirm(t.confirmDeletePrinter, t.confirmYes, t.cancel))) return;
                  await attempt(() => api.deletePrinter(p.id), err); onPrintersChanged();
                }}>${t.delete}</button>`}
            </div>
            ${p.kind !== 'browser' && owner && html`<details class="h-details">
              <summary>${t.setupTitle}</summary>
              ${api.mode === 'demo' && html`<p class="h-warn">${t.demoCloudNote}</p>`}
              <p class="h-small">${t.setupUrl}:</p>
              <${CopyBox} value=${printerUrl(api, p)} t=${t} />
              <ol>${(p.kind === 'star' ? t.starSteps : t.epsonSteps).map((s) => html`<li>${s}</li>`)}</ol>
            </details>`}
          </li>`;
        })}
      </ul>
    </section>

    <section class="h-panel">
      <h2>${t.recentTickets}</h2>
      <table class="h-table">
        <tbody>
          ${jobs.map((j) => html`<tr>
            <td>${clockTime(j.created_at, r.timezone)}</td>
            <td>${nameOf(j.printer_id)}</td>
            <td>${j.ticket?.kind === 'test' ? t.testTicket : `#${j.ticket?.number} · ${j.ticket?.table || ''}`}${j.ticket?.reprint ? ' (copia)' : ''}</td>
            <td><span class="h-job is-${j.status}">${t[`job_${j.status}`]}</span>${j.error ? html` <small class="h-muted">${j.error}</small>` : null}</td>
            <td>${(j.status === 'failed' || j.status === 'queued') && html`<button class="h-link" onClick=${() => attempt(() => api.retryJob(j.id), err).then(loadJobs)}>${t.retry}</button>`}</td>
          </tr>`)}
        </tbody>
      </table>
    </section>
    ${editing && html`<${PrinterEditor} api=${api} t=${t} rid=${r.id} printer=${editing.id ? editing : null}
      onClose=${() => setEditing(null)} onSaved=${(p) => {
        onPrintersChanged();
        if (!editing.id && p.kind === 'browser' && device.printerIds) updateDevice({ ...device, printerIds: [...myIds, p.id] });
      }} />`}
  </div>`;
}

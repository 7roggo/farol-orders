// Live order board: new → preparing → ready, plus table calls (waiter / bill).
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610301041';
import { money, minutesAgo, clockTime } from '../core/util.js?v=202610301041';
import { Modal, attempt, toast } from './ui.js?v=202610301041';
import { hubError } from './strings.js?v=202610301041';
import { Icon } from './icons.js?v=202610301041';

function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(i); }, []);
}

function OrderCard({ o, t, r, onStatus, onDecline, onReprint, canReprint }) {
  const age = minutesAgo(o.created_at);
  const waited = o.status === 'accepted' ? minutesAgo(o.accepted_at || o.created_at) : age;
  const late = o.status === 'accepted' && waited >= 20 ? 'is-late' : o.status === 'accepted' && waited >= 10 ? 'is-slow' : '';
  const shown = o.status === 'accepted' ? waited : age;
  return html`<article class="h-order is-${o.status} ${late}" aria-label=${`#${o.number} ${o.table_label}`}>
    <header class="h-order-head">
      <div class="h-order-id">
        <span class="h-order-no">${o.number}</span>
        <span class="h-order-table">${o.table_label || '—'}</span>
      </div>
      <div class="h-order-time" title=${clockTime(o.created_at, r.timezone)}>
        <${Icon} name="clock" size=${13} /><span>${shown < 1 ? clockTime(o.created_at, r.timezone) : `${shown} min`}</span>
      </div>
    </header>
    ${(o.lang === 'en' || o.customer_name) && html`<div class="h-order-meta">
      ${o.customer_name && html`<span>${o.customer_name}</span>`}
      ${o.lang === 'en' && html`<span class="h-tag">EN</span>`}
    </div>`}
    <ul class="h-order-lines">
      ${o.lines.map((l) => html`<li>
        <span class="h-qty">${l.qty}</span>
        <span class="h-line">
          <span class="h-line-name">${l.name_es || l.name_en}</span>
          ${l.options?.length ? html`<span class="h-line-opts">${l.options.map((x) => x.name_es || x.name_en).join(' · ')}</span>` : null}
          ${l.note ? html`<span class="h-line-note">${l.note}</span>` : null}
        </span>
        <span class="h-line-station" title=${l.station === 'bar' ? t.bar : t.kitchen}><${Icon} name=${l.station === 'bar' ? 'bar' : 'kitchen'} size=${15} /></span>
      </li>`)}
    </ul>
    ${o.note && html`<p class="h-order-note"><${Icon} name="alert" size=${15} /><span>${o.note}</span></p>`}
    <footer class="h-order-foot">
      <span class="h-order-total">${money(o.total_cents, r.currency)}</span>
      <div class="h-order-actions">
        ${o.status === 'pending' && html`
          <button class="h-btn h-btn-ghost" onClick=${() => onDecline(o)}>${t.decline}</button>
          <button class="h-btn h-btn-primary" onClick=${() => onStatus(o, 'accepted')}><${Icon} name="check" size=${16} />${t.accept}</button>`}
        ${o.status === 'accepted' && html`
          ${canReprint && html`<button class="h-icon-btn" onClick=${() => onReprint(o)} aria-label=${t.reprint} title=${t.reprint}><${Icon} name="printers" size=${16} /></button>`}
          <button class="h-btn h-btn-ready" onClick=${() => onStatus(o, 'ready')}>${t.markReady}</button>`}
        ${o.status === 'ready' && html`
          <button class="h-btn h-btn-ghost" onClick=${() => onStatus(o, 'accepted')}>${t.backToPrep}</button>
          <button class="h-btn h-btn-done" onClick=${() => onStatus(o, 'completed')}>${t.served}</button>`}
      </div>
    </footer>
  </article>`;
}

function DeclineModal({ o, t, onClose, onConfirm }) {
  const [reason, setReason] = useState(t.reasons[0]);
  const [other, setOther] = useState('');
  return html`<${Modal} title=${t.declineTitle(o.number)} onClose=${onClose}
    footer=${html`<button class="h-btn h-btn-ghost" onClick=${onClose}>${t.cancel}</button>
      <button class="h-btn h-btn-bad" onClick=${() => onConfirm(reason === 'other' ? other : reason)}>${t.confirmDecline}</button>`}>
    <p class="h-muted">${t.declineReason}</p>
    <div class="h-reasons" role="radiogroup">
      ${t.reasons.map((x) => html`<label class="h-reason ${reason === x ? 'is-on' : ''}">
        <input type="radio" name="reason" checked=${reason === x} onChange=${() => setReason(x)} />${x}</label>`)}
      <label class="h-reason ${reason === 'other' ? 'is-on' : ''}">
        <input type="radio" name="reason" checked=${reason === 'other'} onChange=${() => setReason('other')} />${t.declineOther}</label>
    </div>
    ${reason === 'other' && html`<input class="h-input" maxlength="140" value=${other} onInput=${(e) => setOther(e.target.value)} autofocus />`}
  </${Modal}>`;
}

export function OrdersView({ api, t, r, orders, requests, printers, onRefresh, deviceWarning }) {
  useTick();
  const [declining, setDeclining] = useState(null);
  const [mobileCol, setMobileCol] = useState('pending');
  const [showDone, setShowDone] = useState(false);
  const err = (e) => hubError(t, e);

  const setStatus = async (o, status, reason) => {
    const res = await attempt(() => api.setOrderStatus(o.id, status, reason), err);
    if (res === undefined) onRefresh();
  };
  const reprint = (o) => attempt(async () => { await api.reprintOrder(o.id, null); toast(t.reprint + ' ✓'); }, err);

  const cols = [
    { key: 'pending', title: t.col_pending, empty: t.noneNew },
    { key: 'accepted', title: t.col_accepted, empty: t.noneAccepted },
    { key: 'ready', title: t.col_ready, empty: t.noneReady },
  ];
  const by = (s) => orders.filter((o) => o.status === s);
  const finished = orders.filter((o) => o.status === 'completed' || o.status === 'declined').reverse();

  return html`<div class="h-orders">
    ${requests.length > 0 && html`<section class="h-requests" aria-live="assertive">
      ${requests.map((q) => html`<div class="h-request is-${q.kind}">
        <span class="h-request-icon"><${Icon} name=${q.kind === 'bill' ? 'bill' : 'waiter'} size=${20} /></span>
        <span class="h-request-text">${q.kind === 'bill' ? t.req_bill(q.table_label) : t.req_waiter(q.table_label)}
          <small>${t.minAgo(minutesAgo(q.created_at))}</small></span>
        <button class="h-btn h-btn-primary" onClick=${() => attempt(() => api.resolveRequest(q.id), err)}><${Icon} name="check" size=${16} />${t.done}</button>
      </div>`)}
    </section>`}
    ${deviceWarning}
    <div class="h-col-tabs" role="tablist">
      ${cols.map((c) => html`<button role="tab" aria-selected=${mobileCol === c.key} class=${mobileCol === c.key ? 'is-on' : ''}
        onClick=${() => setMobileCol(c.key)}>${c.title} <span class="h-count">${by(c.key).length}</span></button>`)}
    </div>
    <div class="h-board">
      ${cols.map((c) => html`<section class="h-col is-${c.key} ${mobileCol === c.key ? 'is-mobile-on' : ''}" aria-label=${c.title}>
        <h2 class="h-col-title"><span class="h-col-dot"></span>${c.title}<span class="h-count">${by(c.key).length}</span></h2>
        ${by(c.key).length === 0 && html`<p class="h-col-empty">${c.empty}</p>`}
        ${by(c.key).map((o) => html`<${OrderCard} key=${o.id} o=${o} t=${t} r=${r} canReprint=${printers.length > 0}
          onStatus=${setStatus} onDecline=${setDeclining} onReprint=${reprint} />`)}
      </section>`)}
    </div>
    ${finished.length > 0 && html`<section class="h-finished">
      <button class="h-link" aria-expanded=${showDone} onClick=${() => setShowDone(!showDone)}>
        ${t.finishedToday} · ${finished.length}<${Icon} name=${showDone ? 'up' : 'chevron'} size=${14} /></button>
      ${showDone && html`<ul class="h-finished-list">
        ${finished.map((o) => html`<li class="is-${o.status}">
          <span class="h-fin-no">${o.number}</span><span>${o.table_label}</span>
          <span class="h-muted">${clockTime(o.created_at, r.timezone)}</span>
          <span class="h-fin-items">${o.lines.map((l) => `${l.qty}× ${l.name_es || l.name_en}`).join(', ')}</span>
          <span>${o.status === 'declined' ? `${t.declined}${o.decline_reason ? ` · ${o.decline_reason}` : ''}` : money(o.total_cents, r.currency)}</span>
          ${o.status === 'completed' ? html`<button class="h-link" onClick=${() => setStatus(o, 'ready')}>${t.reopen}</button>` : html`<span></span>`}
        </li>`)}
      </ul>`}
    </section>`}
    ${declining && html`<${DeclineModal} o=${declining} t=${t} onClose=${() => setDeclining(null)}
      onConfirm=${(reason) => { setStatus(declining, 'declined', reason); setDeclining(null); }} />`}
  </div>`;
}

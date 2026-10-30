// "Help from Farol": a restaurant reports a problem; Farol sees it live in the admin and replies here.
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610301029';
import { Modal, Switch, attempt, toast } from './ui.js?v=202610301029';
import { Icon } from './icons.js?v=202610301029';
import { hubError } from './strings.js?v=202610301029';
import { store } from '../core/util.js?v=202610301029';

const TOPICS = ['orders', 'printer', 'menu', 'other'];

export function useSupport(api, rid) {
  const [tickets, setTickets] = useState([]);
  const load = () => api.listSupport(rid).then(setTickets).catch(() => {});
  useEffect(() => { load(); }, [rid]);
  const seenKey = `farol-support-seen-${rid}`;
  const unread = tickets.filter((x) => x.replied_at && x.replied_at > (store.get(seenKey, '') || '')).length;
  const markSeen = () => store.set(seenKey, new Date().toISOString());
  return { tickets, load, unread, markSeen };
}

export function SupportButton({ t, unread, onClick, compact }) {
  return html`<button class="h-support-btn ${compact ? 'is-compact' : ''}" onClick=${onClick} aria-label=${t.supportOpen}>
    <span class="h-support-ico"><${Icon} name="lifebuoy" size=${compact ? 18 : 17} /></span>
    ${!compact && html`<span class="h-support-text"><strong>${t.supportOpen}</strong><small>${t.supportSub}</small></span>`}
    ${unread > 0 && html`<span class="h-support-dot" aria-label=${t.supportNewReply}>${unread}</span>`}
  </button>`;
}

export function SupportModal({ api, t, r, support, context, onClose }) {
  const [topic, setTopic] = useState('orders');
  const [urgent, setUrgent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { support.markSeen(); }, []);
  const send = async () => {
    setBusy(true);
    const id = await attempt(() => api.createSupport(r.id, { message, topic, urgent, context: context() }), (e) => hubError(t, e));
    setBusy(false);
    if (id) { toast(t.supportSent); setMessage(''); setUrgent(false); support.load(); }
  };
  const fmt = (iso) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return html`<${Modal} title=${t.supportTitle} onClose=${onClose} wide
    footer=${html`<button class="h-btn h-btn-ghost" onClick=${onClose}>${t.dismiss}</button>
      <button class="h-btn h-btn-primary" disabled=${busy || !message.trim()} onClick=${send}><${Icon} name="send" size=${16} />${busy ? t.saving : t.supportSend}</button>`}>
    <p class="h-muted">${t.supportIntro}</p>
    <div class="h-seg h-support-topics" role="radiogroup" aria-label=${t.supportTopic}>
      ${TOPICS.map((k) => html`<label class=${topic === k ? 'is-on' : ''}>
        <input type="radio" name="topic" checked=${topic === k} onChange=${() => setTopic(k)} />${t[`topic_${k}`]}</label>`)}
    </div>
    <textarea class="h-input h-support-msg" rows="4" maxlength="2000" placeholder=${t.supportPh} value=${message}
      onInput=${(e) => setMessage(e.target.value)} aria-label=${t.supportTitle}></textarea>
    <div class="h-support-urgent">
      <${Switch} checked=${urgent} tone="bad" label=${t.supportUrgent} onChange=${setUrgent} />
      <small class="h-field-hint">${t.supportUrgentHint}</small>
    </div>
    ${support.tickets.length > 0 && html`<h3 class="h-support-h">${t.supportHistory}</h3>
      <ul class="h-support-list">
        ${support.tickets.map((x) => html`<li class="is-${x.status}">
          <div class="h-support-meta">
            <span class="h-badge ${x.status === 'open' ? 'is-warn' : 'is-go'}">${x.status === 'open' ? t.supportOpenState : t.supportResolved}</span>
            <span class="h-tag">${t[`topic_${x.topic}`]}</span>
            ${x.urgent && html`<span class="h-tag is-bad">${t.supportUrgentShort}</span>`}
            <span class="h-muted h-small">${fmt(x.created_at)}</span>
          </div>
          <p class="h-support-text-msg">${x.message}</p>
          ${x.reply && html`<div class="h-support-reply"><strong>Farol</strong><p>${x.reply}</p></div>`}
        </li>`)}
      </ul>`}
  </${Modal}>`;
}

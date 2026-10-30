// Small building blocks used across the hub.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js?v=202610301029';

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input,textarea,select,button:not(.h-modal-x)')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return html`<div class="h-modal-wrap" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="h-modal ${wide ? 'is-wide' : ''}" role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
      <header class="h-modal-head"><h2>${title}</h2><button class="h-modal-x" onClick=${onClose} aria-label="Cerrar">×</button></header>
      <div class="h-modal-body">${children}</div>
      ${footer && html`<footer class="h-modal-foot">${footer}</footer>`}
    </div>
  </div>`;
}

export function Switch({ checked, onChange, label, disabled, tone }) {
  return html`<label class="h-switch ${tone ? `is-${tone}` : ''} ${disabled ? 'is-disabled' : ''}">
    <input type="checkbox" role="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} />
    <span class="h-switch-track" aria-hidden="true"></span>
    ${label && html`<span class="h-switch-label">${label}</span>`}
  </label>`;
}

export function Field({ label, hint, children, inline }) {
  return html`<label class="h-field ${inline ? 'is-inline' : ''}"><span class="h-field-label">${label}</span>${children}
    ${hint && html`<small class="h-field-hint">${hint}</small>`}</label>`;
}

let toastSet = null;
export function toast(msg, tone = 'ok') { toastSet?.({ msg, tone, at: Date.now() }); }
export function Toasts() {
  const [t, setT] = useState(null);
  toastSet = setT;
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 3200); return () => clearTimeout(id); }, [t]);
  return t ? html`<div class="h-toast is-${t.tone}" role="status">${t.msg}</div>` : null;
}

export function Empty({ children }) {
  return html`<p class="h-empty">${children}</p>`;
}

// In-page confirmation (browser confirm() pop-ups are blocked in some embedded views).
let askSet = null;
export function askConfirm(msg, okLabel = 'OK', cancelLabel = '✕') {
  return new Promise((resolve) => (askSet ? askSet({ msg, okLabel, cancelLabel, resolve }) : resolve(window.confirm(msg))));
}
export function ConfirmHost() {
  const [q, setQ] = useState(null);
  askSet = setQ;
  if (!q) return null;
  const done = (v) => { q.resolve(v); setQ(null); };
  return html`<${Modal} title=${q.msg} onClose=${() => done(false)}
    footer=${html`<button class="h-btn h-btn-ghost" onClick=${() => done(false)}>${q.cancelLabel}</button>
      <button class="h-btn h-btn-bad" onClick=${() => done(true)}>${q.okLabel}</button>`}>
  </${Modal}>`;
}

/** Runs an async action, shows errors as a toast. */
export async function attempt(fn, errText) {
  try { return await fn(); } catch (e) { console.error(e); toast(errText(e), 'bad'); return undefined; }
}

// Customer ordering page: what people see after scanning the QR code on their table.
import { html, render, useState, useEffect, useMemo, useRef, useCallback } from '../vendor/preact-htm.js?v=202610301041';
import { pick, money, store, allergenById, ALLERGENS, unitPrice, hoursToday, uid } from '../core/util.js?v=202610301041';
import { S, errorText } from './strings.js?v=202610301041';

// Spanish phones get Spanish, any other language gets English; unknown → the restaurant's default.
const browserLang = (fallback) => {
  const l = (navigator.language || '').slice(0, 2).toLowerCase();
  return l === 'es' ? 'es' : l ? 'en' : fallback;
};

function Allergens({ ids, lang, small }) {
  if (!ids?.length) return null;
  return html`<ul class="o-allergens ${small ? 'is-small' : ''}" aria-label=${S[lang].allergens}>
    ${ids.map((id) => allergenById[id] && html`<li title=${allergenById[id][lang]}>
      <span aria-hidden="true">${allergenById[id].icon}</span>${allergenById[id][lang]}</li>`)}
  </ul>`;
}

function Sheet({ onClose, children, label, tall }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return html`<div class="o-sheet-wrap" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="o-sheet ${tall ? 'is-tall' : ''}" role="dialog" aria-modal="true" aria-label=${label} tabindex="-1" ref=${ref}>
      <button class="o-sheet-close" onClick=${onClose} aria-label="Close">×</button>
      ${children}
    </div>
  </div>`;
}

function Stepper({ value, onChange, min = 1, max = 30, lang }) {
  return html`<div class="o-stepper">
    <button type="button" onClick=${() => onChange(Math.max(min, value - 1))} disabled=${value <= min} aria-label=${lang === 'es' ? 'Menos' : 'Fewer'}>−</button>
    <span aria-live="polite">${value}</span>
    <button type="button" onClick=${() => onChange(Math.min(max, value + 1))} disabled=${value >= max} aria-label=${lang === 'es' ? 'Más' : 'More'}>+</button>
  </div>`;
}

function ItemSheet({ item, line, lang, currency, onSave, onClose, canOrder }) {
  const t = S[lang];
  const [choices, setChoices] = useState(line?.choices || []);
  const [qty, setQty] = useState(line?.qty || 1);
  const [note, setNote] = useState(line?.note || '');
  const missing = (item.options || []).some((g) => g.required && !g.choices.some((c) => choices.includes(c.id)));
  const toggle = (g, c) => {
    if (g.multi) setChoices(choices.includes(c.id) ? choices.filter((x) => x !== c.id) : [...choices, c.id]);
    else setChoices([...choices.filter((x) => !g.choices.some((cc) => cc.id === x)), c.id]);
  };
  const price = unitPrice(item, choices) * qty;
  return html`<${Sheet} onClose=${onClose} label=${pick(item, 'name', lang)} tall>
    ${item.image_url && html`<img class="o-sheet-img" src=${item.image_url} alt="" />`}
    <h2 class="o-sheet-title">${pick(item, 'name', lang)}</h2>
    <p class="o-sheet-price">${money(item.price_cents, currency, lang)}</p>
    ${pick(item, 'desc', lang) && html`<p class="o-sheet-desc">${pick(item, 'desc', lang)}</p>`}
    <${Allergens} ids=${item.allergens} lang=${lang} />
    ${(item.options || []).map((g) => html`<fieldset class="o-group">
      <legend><span>${pick(g, 'name', lang)}</span>
        <small class=${g.required ? 'is-req' : ''}>${g.required ? t.required : t.optional}${g.multi ? ` · ${t.chooseMany}` : ''}</small></legend>
      ${g.choices.map((c) => html`<label class="o-choice">
        <input type=${g.multi ? 'checkbox' : 'radio'} name=${g.id} checked=${choices.includes(c.id)} onChange=${() => toggle(g, c)} disabled=${!canOrder} />
        <span class="o-choice-name">${pick(c, 'name', lang)}</span>
        ${c.price_cents ? html`<span class="o-choice-price">+${money(c.price_cents, currency, lang)}</span>` : null}
      </label>`)}
    </fieldset>`)}
    ${canOrder && html`
      <label class="o-field"><span>${t.noteLabel}</span>
        <textarea rows="2" maxlength="140" placeholder=${t.notePh} value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>
      </label>
      <div class="o-sheet-actions">
        <${Stepper} value=${qty} onChange=${setQty} lang=${lang} />
        <button class="o-btn o-btn-primary o-grow" disabled=${missing || item.sold_out}
          onClick=${() => onSave({ key: line?.key || uid(), item_id: item.id, qty, choices, note: note.trim() })}>
          ${item.sold_out ? t.soldOut : missing ? t.mustChoose : `${line ? t.save : t.add} · ${money(price, currency, lang)}`}
        </button>
      </div>`}
  </${Sheet}>`;
}

// The restaurant's own privacy policy if it has one, otherwise Farol's page section for diners.
const privacyLink = (r) => r.privacy_url || 'privacy.html#comensales';

function lineSummary(item, line, lang) {
  const names = [];
  for (const g of item?.options || []) for (const c of g.choices) if (line.choices.includes(c.id)) names.push(pick(c, 'name', lang));
  return names.join(', ');
}

function CartSheet({ cart, itemsById, lang, currency, privacyHref, onChange, onEdit, onSend, onClose, sending, error, badItem }) {
  const t = S[lang];
  const [note, setNote] = useState(store.get('farol-cart-note', ''));
  const [name, setName] = useState(store.get('farol-name', ''));
  const total = cart.reduce((s, l) => s + (itemsById[l.item_id] ? unitPrice(itemsById[l.item_id], l.choices) * l.qty : 0), 0);
  return html`<${Sheet} onClose=${onClose} label=${t.yourOrder} tall>
    <h2 class="o-sheet-title">${t.yourOrder}</h2>
    ${!cart.length && html`<p class="o-muted">${t.empty}</p>`}
    <ul class="o-cart">
      ${cart.map((l) => {
        const it = itemsById[l.item_id];
        if (!it) return null;
        const bad = badItem === it.id || it.sold_out;
        return html`<li class="o-cart-line ${bad ? 'is-bad' : ''}">
          <div class="o-cart-main">
            <div class="o-cart-name">${pick(it, 'name', lang)}${bad && html` <strong class="o-tag-bad">${t.soldOut}</strong>`}</div>
            ${lineSummary(it, l, lang) && html`<div class="o-cart-opts">${lineSummary(it, l, lang)}</div>`}
            ${l.note && html`<div class="o-cart-note">“${l.note}”</div>`}
            <div class="o-cart-links">
              <button class="o-link" onClick=${() => onEdit(l)}>${t.edit}</button>
              <button class="o-link" onClick=${() => onChange(cart.filter((x) => x.key !== l.key))}>${t.remove}</button>
            </div>
          </div>
          <div class="o-cart-side">
            <${Stepper} value=${l.qty} lang=${lang} onChange=${(q) => onChange(cart.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
            <div class="o-cart-price">${money(unitPrice(it, l.choices) * l.qty, currency, lang)}</div>
          </div>
        </li>`;
      })}
    </ul>
    ${cart.length > 0 && html`
      <label class="o-field"><span>${t.orderNote}</span>
        <textarea rows="2" maxlength="300" placeholder=${t.orderNotePh} value=${note}
          onInput=${(e) => { setNote(e.target.value); store.set('farol-cart-note', e.target.value); }}></textarea></label>
      <label class="o-field"><span>${t.yourName}</span>
        <input maxlength="40" value=${name} autocomplete="given-name"
          onInput=${(e) => { setName(e.target.value); store.set('farol-name', e.target.value); }} /></label>
      <p class="o-muted o-small o-privacy-note">${t.privacyNote} <a href=${privacyHref} target="_blank" rel="noopener">${t.privacy}</a></p>
      ${error && html`<p class="o-error" role="alert">${error}</p>`}
      <p class="o-muted o-small">${t.payAtTable}</p>
      <button class="o-btn o-btn-primary o-wide" disabled=${sending} onClick=${() => onSend({ note, name })}>
        ${sending ? t.sending : `${t.send} · ${money(total, currency, lang)}`}
      </button>`}
  </${Sheet}>`;
}

function StatusSteps({ status, t }) {
  if (status === 'declined') return null;
  const steps = ['pending', 'accepted', 'ready', 'completed'];
  const at = steps.indexOf(status);
  return html`<ol class="o-steps" aria-label="Estado">
    ${steps.map((s, i) => html`<li class="${i < at ? 'is-done' : ''} ${i === at ? 'is-now' : ''}" aria-current=${i === at ? 'step' : null}>
      <span class="o-step-dot"></span><span>${t[`st_${s}`]}</span></li>`)}
  </ol>`;
}

function OrderStatus({ api, entry, lang, onBack, onHelp }) {
  const t = S[lang];
  const [o, setO] = useState(null);
  useEffect(() => {
    let stop = false, timer;
    const tick = async () => {
      try {
        const s = await api.getOrderStatus(entry.order_id, entry.client_token);
        if (stop) return;
        setO(s);
        if (!['completed', 'declined'].includes(s.status)) timer = setTimeout(tick, s.status === 'ready' ? 8000 : 4000);
      } catch { if (!stop) timer = setTimeout(tick, 8000); }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [entry.order_id]);
  if (!o) return html`<div class="o-status"><p class="o-muted">${t.loading}</p></div>`;
  const declined = o.status === 'declined';
  return html`<div class="o-status">
    <div class="o-status-card ${declined ? 'is-declined' : `is-${o.status}`}">
      <div class="o-status-no"><small>${t.orderNo}</small>#${o.number}</div>
      <div class="o-status-text" aria-live="polite">
        <strong>${t[`st_${o.status}`]}</strong>
        <span>${t[`st_${o.status}_long`]}</span>
        ${declined && o.decline_reason && html`<span>${t.reason}: ${o.decline_reason}</span>`}
      </div>
    </div>
    <${StatusSteps} status=${o.status} t=${t} />
    <ul class="o-status-lines">
      ${o.lines.map((l) => html`<li><span>${l.qty}× ${pick(l, 'name', lang)}
        ${l.options?.length ? html`<small>${l.options.map((x) => pick(x, 'name', lang)).join(', ')}</small>` : null}
        ${l.note ? html`<small>“${l.note}”</small>` : null}</span><span>${money(l.line_cents, o.currency, lang)}</span></li>`)}
      <li class="o-status-total"><span>${t.total}</span><span>${money(o.total_cents, o.currency, lang)}</span></li>
    </ul>
    ${!declined && o.status !== 'pending' && o.google_review_url && html`<div class="o-review">
      <div><strong>${t.reviewTitle}</strong><span>${t.reviewText}</span></div>
      <a class="o-btn o-btn-quiet" href=${o.google_review_url} target="_blank" rel="noopener">${t.reviewBtn} ★</a>
    </div>`}
    <div class="o-status-actions">
      <button class="o-btn o-btn-primary" onClick=${onBack}>${declined ? t.backToMenu : t.orderMore}</button>
      <button class="o-btn o-btn-quiet" onClick=${onHelp}>${t.helpTitle}</button>
    </div>
  </div>`;
}

function HelpSheet({ api, tableToken, lang, onClose }) {
  const t = S[lang];
  const [msg, setMsg] = useState('');
  const send = async (kind) => {
    try {
      const r = await api.requestService(tableToken, kind);
      setMsg(r.duplicate ? t.alreadySent : kind === 'bill' ? t.billSent : t.waiterSent);
    } catch (e) { setMsg(errorText(t, e)); }
  };
  return html`<${Sheet} onClose=${onClose} label=${t.helpTitle}>
    <h2 class="o-sheet-title">${t.helpTitle}</h2>
    <div class="o-help">
      <button class="o-btn o-btn-big" onClick=${() => send('waiter')}><span aria-hidden="true">🙋</span>${t.callWaiter}</button>
      <button class="o-btn o-btn-big" onClick=${() => send('bill')}><span aria-hidden="true">🧾</span>${t.askBill}</button>
    </div>
    ${msg && html`<p class="o-confirm" role="status">${msg}</p>`}
  </${Sheet}>`;
}

function InfoSheet({ r, lang, onClose }) {
  const t = S[lang];
  return html`<${Sheet} onClose=${onClose} label=${t.info}>
    <h2 class="o-sheet-title">${t.allergens}</h2>
    <p class="o-muted">${t.allergensInfo}</p>
    <ul class="o-allergen-legend">${ALLERGENS.map((a) => html`<li><span aria-hidden="true">${a.icon}</span>${a[lang]}</li>`)}</ul>
    ${r.hours_enabled && html`<h3 class="o-h3">${t.hoursToday}</h3><p>${hoursToday(r.hours, r.timezone, lang)}</p>`}
    <p class="o-muted o-small">${t.payAtTable}</p>
  </${Sheet}>`;
}

export function OrderApp({ api, tableToken, slug }) {
  const [data, setData] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [lang, setLang] = useState(() => store.get('farol-lang', null) || browserLang('es'));
  const cartKey = `farol-cart-${tableToken || slug}`;
  const ordersKey = `farol-orders-${tableToken || slug}`;
  const [cart, setCartState] = useState(() => store.get(cartKey, []));
  const [mine, setMine] = useState(() => (store.get(ordersKey, []) || []).filter((o) => Date.now() - new Date(o.created_at) < 12 * 3600000));
  const [sheet, setSheet] = useState(null);           // {type:'item', item, line} | {type:'cart'} | {type:'help'} | {type:'info'}
  const [viewing, setViewing] = useState(null);       // order entry shown full screen
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [badItem, setBadItem] = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const scrollRef = useRef();
  const t = S[lang];

  const load = useCallback(async () => {
    try {
      const d = await api.getPublicMenu({ tableToken, slug });
      setData(d);
      if (!store.get('farol-lang', null)) setLang(browserLang(d.restaurant.default_lang || 'es'));
    } catch (e) { setFatal(S[lang][`err_${e?.code}`] || S[lang].err_load); }
  }, [tableToken, slug]);
  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, [load]);

  const setCart = (c) => { setCartState(c); store.set(cartKey, c); };
  const switchLang = (l) => { setLang(l); store.set('farol-lang', l); };

  const itemsById = useMemo(() => Object.fromEntries((data?.items || []).map((i) => [i.id, i])), [data]);
  const r = data?.restaurant;
  const canOrder = !!(data?.table && r?.is_open && !r?.is_paused);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + (itemsById[l.item_id] ? unitPrice(itemsById[l.item_id], l.choices) * l.qty : 0), 0);

  useEffect(() => { if (r) document.title = r.name; }, [r?.name]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const addLine = (line) => {
    const exists = cart.some((l) => l.key === line.key);
    setCart(exists ? cart.map((l) => (l.key === line.key ? line : l)) : [...cart, line]);
    setSheet(null);
  };

  const send = async ({ note, name }) => {
    setSending(true); setSendError(''); setBadItem(null);
    try {
      const res = await api.placeOrder({
        tableToken, lang, note, customerName: name,
        lines: cart.map((l) => ({ item_id: l.item_id, qty: l.qty, choices: l.choices, note: l.note })),
      });
      const entry = { order_id: res.order_id, client_token: res.client_token, number: res.number, created_at: new Date().toISOString() };
      const next = [entry, ...mine];
      setMine(next); store.set(ordersKey, next);
      setCart([]); store.del('farol-cart-note');
      setSheet(null); setViewing(entry);
    } catch (e) {
      setSendError(errorText(t, e));
      if (e.code === 'item_sold_out') setBadItem(e.detail);
      if (['item_sold_out', 'menu_changed', 'option_required', 'ordering_paused', 'restaurant_closed'].includes(e.code)) load();
    } finally { setSending(false); }
  };

  // highlight the category in view
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !data) return;
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiveCat(vis.target.dataset.cat);
    }, { root, rootMargin: '-20% 0px -70% 0px' });
    root.querySelectorAll('[data-cat]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data, viewing]);

  const accent = r?.accent_color || '#C8553D';
  const theme = `theme-${r?.menu_theme || 'tasca'}`;
  if (fatal) return html`<div class="ord ${theme}" style=${`--accent:${accent}`}><div class="o-fatal"><p>${fatal}</p></div></div>`;
  if (!data) return html`<div class="ord ${theme}" style=${`--accent:${accent}`}><div class="o-fatal"><p class="o-muted">${t.loading}</p></div></div>`;

  const activeMine = mine.filter((m) => m.order_id);
  const inCart = (id) => cart.filter((l) => l.item_id === id).reduce((s, l) => s + l.qty, 0);
  const picks = data.items.filter((i) => i.featured && i.image_url && !i.sold_out).slice(0, 8);
  const cats = data.categories.filter((c) => data.items.some((i) => i.category_id === c.id));
  const statusLine = !data.table ? t.menuOnly
    : !r.is_open ? `${t.closedShort} · ${hoursToday(r.hours, r.timezone, lang)}`
    : r.is_paused ? t.pausedShort : t.openNow;
  const langSwitch = html`<div class="o-lang" role="group" aria-label="Idioma / Language">
    <button class=${lang === 'es' ? 'is-on' : ''} aria-pressed=${lang === 'es'} onClick=${() => switchLang('es')}>ES</button>
    <button class=${lang === 'en' ? 'is-on' : ''} aria-pressed=${lang === 'en'} onClick=${() => switchLang('en')}>EN</button>
  </div>`;
  const open = (it) => setSheet({ type: 'item', item: it });

  return html`<div class="ord ${theme}" style=${`--accent:${accent}`} lang=${lang}>
    ${viewing ? html`<main class="o-scroll">
        <header class="o-head"><span class="o-head-name">${r.name}</span>${langSwitch}</header>
        <${OrderStatus} api=${api} entry=${viewing} lang=${lang} onBack=${() => setViewing(null)} onHelp=${() => setSheet({ type: 'help' })} />
      </main>` : html`
    <main class="o-scroll" ref=${scrollRef}>
      <header class="o-hero ${r.cover_url ? 'has-cover' : ''}">
        ${r.cover_url && html`<img class="o-hero-img" src=${r.cover_url} alt="" />`}
        <div class="o-hero-top">
          ${data.table ? html`<span class="o-chip">${data.table.label}</span>` : html`<span></span>`}
          ${langSwitch}
        </div>
        <div class="o-hero-body">
          ${r.logo_url && html`<img class="o-logo" src=${r.logo_url} alt="" />`}
          <h1 class="o-name">${r.name}</h1>
          <p class="o-statusline"><span class="o-dot ${data.table && r.is_open && !r.is_paused ? 'is-on' : ''}"></span>${statusLine}</p>
        </div>
      </header>

      ${pick(r, 'welcome', lang) && html`<p class="o-welcome">${pick(r, 'welcome', lang)}</p>`}
      ${!data.table && html`<p class="o-notice">${t.viewOnly}</p>`}
      ${data.table && r.is_open && r.is_paused && html`<p class="o-notice">${t.paused}</p>`}
      ${activeMine.length > 0 && html`<div class="o-mine">
        ${activeMine.slice(0, 3).map((m) => html`<button class="o-mine-row" onClick=${() => setViewing(m)}>
          <span>${t.orderNo} <strong>#${m.number}</strong></span><span class="o-mine-go">${t.seeStatus} ›</span></button>`)}
      </div>`}

      <nav class="o-cats" aria-label="Carta">
        ${cats.map((c) => html`<a href=${`#cat-${c.id}`} class=${activeCat === c.id ? 'is-on' : ''}
          onClick=${(e) => { e.preventDefault(); scrollRef.current.querySelector(`#cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
          ${pick(c, 'name', lang)}</a>`)}
      </nav>

      ${picks.length > 0 && html`<section class="o-picks" aria-label=${t.ourPicks}>
        <h2 class="o-cat-title">${t.ourPicks}</h2>
        <div class="o-picks-row">
          ${picks.map((it) => html`<button class="o-pick" onClick=${() => open(it)}>
            <span class="o-pick-media"><img src=${it.image_url} alt="" loading="lazy" />
              <span class="o-add ${inCart(it.id) ? 'has-qty' : ''}" aria-hidden="true">${inCart(it.id) || '+'}</span></span>
            <span class="o-pick-name">${pick(it, 'name', lang)}</span>
            <span class="o-pick-price">${money(it.price_cents, r.currency, lang)}</span>
          </button>`)}
        </div>
      </section>`}

      ${cats.map((c) => {
        const items = data.items.filter((i) => i.category_id === c.id);
        return html`<section class="o-section" id=${`cat-${c.id}`} data-cat=${c.id}>
          <h2 class="o-cat-title">${pick(c, 'name', lang)}</h2>
          <ul class="o-items">
            ${items.map((it) => html`<li>
              <button class="o-item ${it.sold_out ? 'is-out' : ''} ${it.image_url ? 'has-img' : ''}" onClick=${() => open(it)}>
                <span class="o-item-text">
                  <span class="o-item-name">${pick(it, 'name', lang)}</span>
                  ${pick(it, 'desc', lang) && html`<span class="o-item-desc">${pick(it, 'desc', lang)}</span>`}
                  <span class="o-item-meta">
                    <span class="o-item-price">${it.sold_out ? t.soldOut : money(it.price_cents, r.currency, lang)}</span>
                    ${it.allergens?.length ? html`<span class="o-item-allergens" title=${it.allergens.map((a) => allergenById[a]?.[lang]).join(', ')}>
                      ${it.allergens.map((a) => allergenById[a]?.icon).join(' ')}</span>` : null}
                  </span>
                </span>
                ${it.image_url
                  ? html`<span class="o-item-media"><img src=${it.image_url} alt="" loading="lazy" />
                      ${canOrder && !it.sold_out && html`<span class="o-add ${inCart(it.id) ? 'has-qty' : ''}" aria-hidden="true">${inCart(it.id) || '+'}</span>`}</span>`
                  : canOrder && !it.sold_out && html`<span class="o-add is-solo ${inCart(it.id) ? 'has-qty' : ''}" aria-hidden="true">${inCart(it.id) || '+'}</span>`}
              </button>
            </li>`)}
          </ul>
        </section>`;
      })}
      <footer class="o-foot">
        <button class="o-link" onClick=${() => setSheet({ type: 'info' })}>${t.allergens} · ${t.info}</button>
        <p class="o-made">${t.payAtTable}</p>
        <a class="o-link o-small" href=${privacyLink(r)} target="_blank" rel="noopener">${t.privacy}</a>
      </footer>
    </main>`}

    <div class="o-bar">
      ${data.table && html`<button class="o-btn o-btn-float o-bar-help" onClick=${() => setSheet({ type: 'help' })}>${t.help}</button>`}
      ${!viewing && count > 0 && html`<button class="o-btn o-btn-primary o-grow o-bar-cart" onClick=${() => setSheet({ type: 'cart' })}>
        <span class="o-bar-count">${count}</span><span>${t.viewOrder}</span><span>${money(total, r.currency, lang)}</span></button>`}
    </div>

    ${sheet?.type === 'item' && html`<${ItemSheet} item=${sheet.item} line=${sheet.line} lang=${lang} currency=${r.currency}
      canOrder=${canOrder} onSave=${addLine} onClose=${() => setSheet(sheet.line ? { type: 'cart' } : null)} />`}
    ${sheet?.type === 'cart' && html`<${CartSheet} cart=${cart} itemsById=${itemsById} lang=${lang} currency=${r.currency} privacyHref=${privacyLink(r)}
      onChange=${setCart} onEdit=${(l) => setSheet({ type: 'item', item: itemsById[l.item_id], line: l })}
      onSend=${send} onClose=${() => setSheet(null)} sending=${sending} error=${sendError} badItem=${badItem} />`}
    ${sheet?.type === 'help' && html`<${HelpSheet} api=${api} tableToken=${tableToken} lang=${lang} onClose=${() => setSheet(null)} />`}
    ${sheet?.type === 'info' && html`<${InfoSheet} r=${r} lang=${lang} onClose=${() => setSheet(null)} />`}
  </div>`;
}

export function mountOrderApp(el, props) {
  render(html`<${OrderApp} ...${props} />`, el);
}

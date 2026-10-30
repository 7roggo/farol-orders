// Farol master admin: create restaurant hubs, invite owners, switch hubs on/off, see activity.
import { html, render, useState, useEffect } from '../vendor/preact-htm.js?v=202610300621';
import { money, slugify } from '../core/util.js?v=202610300621';
import { Field, Switch, Toasts, ConfirmHost, toast, attempt } from '../hub/ui.js?v=202610300621';
import { siteBase } from '../api/index.js?v=202610300621';
import { Mark, Icon } from '../hub/icons.js?v=202610300621';
import { ThemeButton, Login } from '../hub/app.js?v=202610300621';
import { HS } from '../hub/strings.js?v=202610300621';
import { store } from '../core/util.js?v=202610300621';
import { chime, unlockAudio } from '../hub/alerts.js?v=202610300621';

const msg = (e) => ({ not_allowed: 'This account is not a Farol admin.', duplicate_slug: 'That web address is already taken.' }[e.code]
  || (/duplicate key|unique/i.test(e.message) ? 'That web address is already taken.' : e.message || 'Something went wrong.'));

function NewRestaurant({ api, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [owner, setOwner] = useState('');
  const [sample, setSample] = useState(true);
  const [busy, setBusy] = useState(false);
  return html`<form class="h-panel" onSubmit=${async (e) => {
    e.preventDefault(); setBusy(true);
    const id = await attempt(() => api.adminCreateRestaurant({ name: name.trim(), slug, ownerEmail: owner.trim(), sampleMenu: sample }), msg);
    setBusy(false);
    if (id) { toast(`${name} created`); setName(''); setSlug(''); setOwner(''); setTouched(false); onCreated(); }
  }}>
    <h2>New restaurant hub</h2>
    <div class="h-grid-2">
      <${Field} label="Restaurant name"><input class="h-input" required maxlength="80" value=${name}
        onInput=${(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} /></${Field}>
      <${Field} label="Web address" hint=${`Customer menu: ${siteBase()}order.html?r=${slug || '…'}`}>
        <input class="h-input" required pattern="[a-z0-9][a-z0-9\\-]{1,39}" value=${slug}
          onInput=${(e) => { setTouched(true); setSlug(slugify(e.target.value)); }} /></${Field}>
      <${Field} label="Owner's e-mail" hint="They create their account with this e-mail on the hub page and get owner access.">
        <input class="h-input" type="email" value=${owner} onInput=${(e) => setOwner(e.target.value)} /></${Field}>
      <${Field} label="Start with">
        <label class="h-check"><input type="checkbox" checked=${sample} onChange=${(e) => setSample(e.target.checked)} /> Sample tapas menu and 13 tables (easy to edit)</label>
      </${Field}>
    </div>
    <button class="h-btn h-btn-primary" disabled=${busy || !name.trim() || slug.length < 2}>${busy ? 'Creating…' : 'Create hub'}</button>
  </form>`;
}

const TOPIC = { orders: 'Orders', printer: 'Printer', menu: 'Menu', other: 'Other' };
const ago = (iso) => { const m = Math.floor((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB'); };

// Live inbox of "Help from Farol" requests: chime + tab title on new ones, reply and solve inline.
function SupportInbox({ api }) {
  const [items, setItems] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [showCtx, setShowCtx] = useState(null);
  const load = () => api.adminSupportList(false).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
    const off = api.adminSubscribeSupport((type) => { if (type === 'INSERT') chime('order'); load(); });
    const poll = setInterval(load, 60000);
    return () => { off(); clearInterval(poll); };
  }, []);
  const open = (items || []).filter((x) => x.status === 'open');
  useEffect(() => { document.title = open.length ? `(${open.length}) Help requests · Farol admin` : 'Farol admin'; }, [open.length]);
  const update = async (x, resolve) => {
    await attempt(() => api.adminSupportUpdate(x.id, drafts[x.id] || '', resolve), msg);
    setDrafts({ ...drafts, [x.id]: '' }); load();
  };
  return html`<section class="h-panel" onClick=${unlockAudio}>
    <div class="h-panel-head"><h2>Help requests${open.length > 0 && html`<span class="h-count-pill">${open.length}</span>`}</h2>
      <span class="h-muted h-small">New requests chime here live. Click anywhere on this page once to allow the sound.</span></div>
    ${!items ? html`<p class="h-muted">…</p>` : !items.length ? html`<p class="h-empty">No help requests. All quiet.</p>` : html`<div class="h-inbox">
      ${items.map((x) => html`<article class="h-inbox-item ${x.urgent && x.status === 'open' ? 'is-urgent' : ''} is-${x.status}">
        <div class="h-inbox-head">
          <strong>${x.restaurant}</strong>
          <span class="h-tag">${TOPIC[x.topic] || x.topic}</span>
          ${x.urgent && html`<span class="h-tag is-bad">Urgent</span>`}
          <span class="h-badge ${x.status === 'open' ? 'is-warn' : 'is-go'}">${x.status === 'open' ? 'Open' : 'Solved'}</span>
          <span class="h-muted h-small">${x.created_email} · ${ago(x.created_at)}</span>
          <span class="h-grow"></span>
          <a class="h-link" href=${`hub.html?r=${x.slug}${api.mode === 'demo' ? '&demo' : ''}`}>Open their hub</a>
        </div>
        <p class="h-inbox-msg">${x.message}</p>
        ${x.reply && html`<div class="h-support-reply"><strong>Your reply</strong><p>${x.reply}</p></div>`}
        <button class="h-link" onClick=${() => setShowCtx(showCtx === x.id ? null : x.id)}>${showCtx === x.id ? 'Hide details' : 'Show screen details'}</button>
        ${showCtx === x.id && html`<pre class="h-copy"><code>${JSON.stringify(x.context, null, 2)}</code></pre>`}
        ${x.status === 'open' && html`<div class="h-inbox-reply">
          <textarea class="h-input" rows="2" placeholder="Reply (they see it in their hub)" value=${drafts[x.id] || ''}
            onInput=${(e) => setDrafts({ ...drafts, [x.id]: e.target.value })}></textarea>
          <button class="h-btn h-btn-ghost" disabled=${!(drafts[x.id] || '').trim()} onClick=${() => update(x, false)}>Reply</button>
          <button class="h-btn h-btn-primary" onClick=${() => update(x, true)}><${Icon} name="check" size=${16} />${(drafts[x.id] || '').trim() ? 'Reply & solve' : 'Mark solved'}</button>
        </div>`}
      </article>`)}
    </div>`}
  </section>`;
}

function Admin({ api, session, theme, setTheme }) {
  const [rows, setRows] = useState(null);
  const [denied, setDenied] = useState(false);
  const load = async () => {
    try { setRows(await api.adminOverview()); } catch (e) { if (e.code === 'not_allowed') setDenied(true); else toast(msg(e), 'bad'); }
  };
  useEffect(() => { load(); }, []);
  if (denied) return html`<div class="h-login"><div class="h-login-card">
    <p>${session.user.email} is not a Farol admin. Add this e-mail to the admin list in Supabase (README, “Make yourself the Farol admin”).</p>
    <button class="h-link" onClick=${() => api.signOut()}>Sign out</button></div></div>`;
  const total = (rows || []).filter((r) => r.active);
  return html`<div class="hub is-admin">
    ${api.mode === 'demo' && html`<div class="h-demo-banner">Demo mode: data is saved in this browser only.</div>`}
    <header class="h-top">
      <div class="h-top-title"><${Mark} size=${24} /><span class="h-wordmark">Farol</span><span class="h-tag">admin</span></div>
      <div class="h-top-tools"><span class="h-muted h-hide-sm">${session.user.email}</span>
        <${ThemeButton} theme=${theme} setTheme=${setTheme} t=${{ themeLight: 'Light theme', themeDark: 'Dark theme' }} />
        <button class="h-icon-btn" onClick=${() => api.signOut()} aria-label="Sign out" title="Sign out"><${Icon} name="logout" /></button></div>
    </header>
    <main class="h-main h-main-full">
      <div class="h-kpis">
        <div class="h-kpi"><span class="h-kpi-value">${total.length}</span><span class="h-kpi-label">Active hubs</span></div>
        <div class="h-kpi"><span class="h-kpi-value">${total.reduce((s, r) => s + r.orders_30d, 0)}</span><span class="h-kpi-label">Orders, last 30 days</span></div>
        <div class="h-kpi"><span class="h-kpi-value">${money(total.reduce((s, r) => s + r.revenue_30d_cents, 0))}</span><span class="h-kpi-label">Ordered through Farol, 30 days</span></div>
      </div>
      <${SupportInbox} api=${api} />
      <${NewRestaurant} api=${api} onCreated=${load} />
      <section class="h-panel">
        <h2>Restaurants</h2>
        ${!rows ? html`<p class="h-muted">…</p>` : html`<table class="h-table h-table-admin">
          <thead><tr><th>Restaurant</th><th>Owner</th><th class="is-num">Orders 30d</th><th class="is-num">Ordered 30d</th><th>Last order</th><th>On</th><th></th></tr></thead>
          <tbody>${rows.map((r) => html`<tr class=${r.active ? '' : 'is-off'}>
            <td><strong>${r.name}</strong><br /><small class="h-muted">${r.slug}</small></td>
            <td>${r.owners.join(', ') || html`<span class="h-muted">—</span>`}
              ${r.pending_invites.length ? html`<br /><small class="h-badge is-warn">invited: ${r.pending_invites.join(', ')}</small>` : null}</td>
            <td class="is-num">${r.orders_30d}</td>
            <td class="is-num">${money(r.revenue_30d_cents)}</td>
            <td>${r.last_order_at ? new Date(r.last_order_at).toLocaleDateString('en-GB') : '—'}</td>
            <td><${Switch} checked=${r.active} label="" onChange=${(v) => attempt(() => api.adminSetActive(r.id, v), msg).then(load)} /></td>
            <td><a class="h-link" href=${`hub.html?r=${r.slug}${api.mode === 'demo' ? '&demo' : ''}`}>Open hub</a> ·
              <a class="h-link" href=${`order.html?r=${r.slug}${api.mode === 'demo' ? '&demo' : ''}`} target="_blank" rel="noopener">Menu</a></td>
          </tr>`)}</tbody>
        </table>`}
        <p class="h-muted h-small">Switching a restaurant off stops customer ordering and hides its menu (for example if they stop paying). Their data is kept.</p>
      </section>
    </main>
  </div>`;
}

function AdminApp({ api }) {
  const [session, setSession] = useState(undefined);
  const [theme, setThemeState] = useState(() => store.get('farol-hub-theme', 'dark'));
  const setTheme = (x) => { setThemeState(x); store.set('farol-hub-theme', x); };
  const [recovery, setRecovery] = useState(false);
  const [lang, setLangState] = useState(() => store.get('farol-hub-lang', null) || ((navigator.language || '').startsWith('es') ? 'es' : 'en'));
  const setLang = (l) => { setLangState(l); store.set('farol-hub-lang', l); };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.getSession().then(setSession);
    return api.onAuthChange((event, s) => { if (event === 'PASSWORD_RECOVERY') setRecovery(true); setSession(s); });
  }, []);
  // a listed Farol e-mail becomes admin on its first confirmed login
  useEffect(() => { setReady(false); if (session) api.claimInvites().catch(() => {}).finally(() => setReady(true)); }, [session?.user?.id]);
  return html`<div class="fh" data-theme=${theme}>${session === undefined ? html`<div class="h-loading"><${Mark} size=${28} /></div>`
    : !session || recovery ? html`<${Login} api=${api} t=${HS[lang]} lang=${lang} setLang=${setLang} recovery=${recovery} title="Farol admin" tag="admin" />`
    : !ready ? html`<div class="h-loading"><${Mark} size=${28} /></div>`
    : html`<${Admin} api=${api} session=${session} theme=${theme} setTheme=${setTheme} />`}<${Toasts} /><${ConfirmHost} /></div>`;
}

export function mountAdminApp(el, props) { render(html`<${AdminApp} ...${props} />`, el); }

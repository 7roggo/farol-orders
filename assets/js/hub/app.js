// Restaurant hub: login, live orders, menu, tables & QR, printers, sales, settings.
import { html, render, useState, useEffect, useRef, useCallback } from '../vendor/preact-htm.js?v=202610300457';
import { store, isOpenNow, isPaused, clockTime } from '../core/util.js?v=202610300457';
import { HS, hubError } from './strings.js?v=202610300457';
import { Toasts, ConfirmHost, attempt, Field } from './ui.js?v=202610300457';
import { useAlerts, unlockAudio } from './alerts.js?v=202610300457';
import { usePrintEngine, getDevice } from './printing.js?v=202610300457';
import { OrdersView } from './orders.js?v=202610300457';
import { MenuView } from './menu.js?v=202610300457';
import { TablesView } from './tables.js?v=202610300457';
import { PrintersView } from './printers.js?v=202610300457';
import { StatsView } from './stats.js?v=202610300457';
import { SettingsView } from './settings.js?v=202610300457';
import { ticketToHtmlBody } from '../../../supabase/functions/_shared/ticket-format.js?v=202610300457';
import { Icon, Mark } from './icons.js?v=202610300457';

const NAV = ['orders', 'menu', 'tables', 'printers', 'stats', 'settings'];

// One button that flips the hub between Spanish and English.
function LangSwitch({ lang, setLang }) {
  const next = lang === 'es' ? 'en' : 'es';
  return html`<button type="button" class="h-lang-btn" onClick=${() => setLang(next)}
    aria-label=${lang === 'es' ? 'Switch to English' : 'Cambiar a español'} title=${lang === 'es' ? 'English' : 'Español'}>
    <${Icon} name="globe" size=${16} /><span>${lang.toUpperCase()}</span></button>`;
}

export function ThemeButton({ theme, setTheme, t }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return html`<button type="button" class="h-icon-btn" onClick=${() => setTheme(next)}
    aria-label=${next === 'light' ? t.themeLight : t.themeDark} title=${next === 'light' ? t.themeLight : t.themeDark}>
    <${Icon} name=${theme === 'dark' ? 'sun' : 'moon'} /></button>`;
}

export function Login({ api, t, lang, setLang, recovery, title, tag }) {
  const [mode, setMode] = useState(recovery ? 'recovery' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      if (mode === 'login') await api.signIn(email.trim(), password);
      if (mode === 'signup') { const r = await api.signUp(email.trim(), password); if (r.needsConfirmation) setMsg(t.checkEmail); }
      if (mode === 'reset') { await api.resetPassword(email.trim()); setMsg(t.resetSent); }
      if (mode === 'recovery') { await api.setNewPassword(password); location.hash = ''; location.reload(); }
    } catch (err) { setMsg(hubError(t, err)); }
    setBusy(false);
  };
  return html`<div class="h-login">
    <form class="h-login-card" onSubmit=${submit}>
      <div class="h-login-brand"><${Mark} size=${30} /><span class="h-wordmark">Farol</span>${tag && html`<span class="h-tag">${tag}</span>`}</div>
      <h1>${mode === 'recovery' ? t.newPassword : mode === 'signup' ? t.createAccount : title || t.loginTitle}</h1>
      ${api.mode === 'demo' && html`<p class="h-note">${t.demoLogin}</p>`}
      ${mode !== 'recovery' && html`<${Field} label=${t.email}><input class="h-input" type="email" required autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} /></${Field}>`}
      ${mode !== 'reset' && html`<${Field} label=${mode === 'recovery' ? t.newPassword : t.password}>
        <input class="h-input" type="password" required minlength="6" autocomplete=${mode === 'login' ? 'current-password' : 'new-password'}
          value=${password} onInput=${(e) => setPassword(e.target.value)} /></${Field}>`}
      ${msg && html`<p class="h-note" role="status">${msg}</p>`}
      <button class="h-btn h-btn-primary h-btn-wide" disabled=${busy}>
        ${{ login: t.login, signup: t.createAccount, reset: t.sendReset, recovery: t.savePassword }[mode]}</button>
      <div class="h-login-links">
        ${mode === 'login' && html`<button type="button" class="h-link" onClick=${() => setMode('signup')}>${t.noAccount}</button>
          <button type="button" class="h-link" onClick=${() => setMode('reset')}>${t.forgot}</button>`}
        ${(mode === 'signup' || mode === 'reset') && html`<button type="button" class="h-link" onClick=${() => setMode('login')}>${mode === 'signup' ? t.haveAccount : t.backToLogin}</button>`}
      </div>
      <div class="h-login-foot"><${LangSwitch} lang=${lang} setLang=${setLang} /></div>
    </form>
  </div>`;
}

// Phone only: theme, language and sign-out tucked behind one button so the top bar stays clean.
function AccountMenu({ email, children }) {
  const [open, setOpen] = useState(false);
  return html`<div class="h-account">
    <button class="h-avatar" aria-expanded=${open} aria-label=${email} onClick=${() => setOpen(!open)}>${(email || '?')[0].toUpperCase()}</button>
    ${open && html`<div class="h-menu-pop is-right" role="menu">
      <p class="h-menu-pop-title">${email}</p>
      <div class="h-menu-pop-row">${children}</div>
    </div>`}
  </div>`;
}

function PauseControl({ api, t, r, onChange }) {
  const [open, setOpen] = useState(false);
  const paused = isPaused(r);
  const openHours = isOpenNow(r.hours_enabled, r.hours, r.timezone);
  const set = async (minutes) => {
    setOpen(false);
    const res = await attempt(() => api.setPause(r.id, minutes), (e) => hubError(t, e));
    if (res) onChange(res);
  };
  const label = paused
    ? (r.paused_until ? t.pausedUntil(clockTime(r.paused_until, r.timezone)) : t.pausedOpenEnded)
    : openHours ? t.open : t.closedHours;
  return html`<div class="h-pause">
    <button class="h-status-pill ${paused ? 'is-paused' : openHours ? 'is-open' : 'is-closed'}" aria-expanded=${open}
      onClick=${() => (paused ? set(null) : setOpen(!open))} title=${paused ? t.resume : t.pause}>
      <span class="h-dot-live" aria-hidden="true"></span><span>${label}</span>
      ${paused ? html`<span class="h-pill-action"><${Icon} name="play" size=${13} />${t.resume}</span>` : html`<${Icon} name="chevron" size=${14} />`}
    </button>
    ${open && html`<div class="h-menu-pop" role="menu">
      <p class="h-menu-pop-title">${t.pause}</p>
      <button role="menuitem" onClick=${() => set(15)}>${t.pause15}</button>
      <button role="menuitem" onClick=${() => set(30)}>${t.pause30}</button>
      <button role="menuitem" onClick=${() => set(60)}>${t.pause60}</button>
      <button role="menuitem" onClick=${() => set(0)}>${t.pauseOpen}</button>
    </div>`}
  </div>`;
}

// "Show on screen" mode: a new ticket slides in, then folds into a small chip after a few
// seconds so it never covers the order buttons. Tap a chip to open it again.
function ScreenTicket({ j, t, onClose }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { if (!open) return; const id = setTimeout(() => setOpen(false), 8000); return () => clearTimeout(id); }, [open]);
  const label = j.ticket.kind === 'test' ? t.testTicket : `#${j.ticket.number} · ${j.ticket.table || ''}`;
  if (!open) return html`<div class="h-ticket-chip">
    <button class="h-ticket-chip-open" onClick=${() => setOpen(true)}><${Icon} name="bill" size=${14} /> ${label}${j.ticket.station && j.ticket.station !== 'all' ? ` · ${t[j.ticket.station]}` : ''}</button>
    <button class="h-ticket-chip-x" onClick=${() => onClose(j.id)} aria-label=${t.dismiss}>×</button>
  </div>`;
  return html`<div class="h-ticket">
    <button class="h-ticket-x" onClick=${() => setOpen(false)} aria-label=${t.dismiss}>–</button>
    <div class="tk" dangerouslySetInnerHTML=${{ __html: ticketToHtmlBody(j.ticket) }}></div>
  </div>`;
}

function ScreenTickets({ tickets, onClose, t }) {
  if (!tickets.length) return null;
  return html`<div class="h-tickets" aria-live="polite">
    ${tickets.slice(-6).map((j) => html`<${ScreenTicket} key=${j.id} j=${j} t=${t} onClose=${onClose} />`)}
  </div>`;
}

function Hub({ api, t, lang, setLang, theme, setTheme, session, restaurantId, restaurants, onSwitch, onTryTable }) {
  const [r, setR] = useState(null);
  const [role, setRole] = useState(null);
  const [view, setView] = useState(() => store.get('farol-hub-view', 'orders'));
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [live, setLive] = useState(true);
  const [shiftStarted, setShiftStarted] = useState(false);
  const [kitchen, setKitchen] = useState(false);
  // Keep the screen awake while the shift runs, so alerts are never missed on a tablet.
  useEffect(() => {
    if (!shiftStarted || !navigator.wakeLock) return;
    let lock = null;
    const get = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    get();
    const onVis = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
  }, [shiftStarted]);
  const toggleKitchen = () => {
    const next = !kitchen;
    setKitchen(next);
    try {
      if (next && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      if (!next && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* fullscreen not allowed here */ }
  };
  const [soundOn, setSoundOn] = useState(() => store.get('farol-sound', true));
  const [device, setDeviceState] = useState(() => getDevice(restaurantId, api.mode === 'demo'));
  const takeJob = useRef(null);
  const [screenTickets, setScreenTickets] = useState([]);
  const [, tick] = useState(0);
  const rRef = useRef(null);

  const refresh = useCallback(async () => {
    const rest = await api.getRestaurant(restaurantId);
    rRef.current = rest;
    setR(rest);
    const [o, q, p] = await Promise.all([
      api.listActiveOrders(restaurantId, rest.timezone), api.listOpenRequests(restaurantId), api.listPrinters(restaurantId),
    ]);
    setOrders(o); setRequests(q); setPrinters(p);
  }, [restaurantId]);

  useEffect(() => {
    setRole(restaurants.find((x) => x.id === restaurantId)?.role || 'staff');
    refresh().catch(console.error);
    const unsub = api.subscribe(restaurantId, (table, type, row) => {
      if (table === '*') { refresh(); return; }
      if (table === 'orders') {
        setOrders((list) => {
          const rest = list.filter((x) => x.id !== row.id);
          return type === 'DELETE' ? rest : [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }
      if (table === 'service_requests') {
        setRequests((list) => {
          const rest = list.filter((x) => x.id !== row.id);
          return type !== 'DELETE' && row.status === 'open' ? [...rest, row] : rest;
        });
      }
      if (table === 'printers') {
        setPrinters((list) => {
          const rest = list.filter((x) => x.id !== row.id);
          return type === 'DELETE' ? rest : [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }
      if (table === 'print_jobs' && type !== 'DELETE') takeJob.current?.({ ...row });
    }, (status) => {
      const ok = status === 'SUBSCRIBED';
      setLive(ok);
      if (ok) refresh().catch(() => {});
    });
    const safety = setInterval(() => refresh().catch(() => setLive(false)), 60000);
    const onVis = () => document.visibilityState === 'visible' && refresh().catch(() => {});
    document.addEventListener('visibilitychange', onVis);
    const t30 = setInterval(() => tick((x) => x + 1), 30000);
    return () => { unsub(); clearInterval(safety); clearInterval(t30); document.removeEventListener('visibilitychange', onVis); };
  }, [restaurantId]);

  const pending = orders.filter((o) => o.status === 'pending').length;
  useAlerts({ pending, requests: requests.length, soundOn: soundOn && shiftStarted, titleBase: r ? `${r.name} · Farol` : 'Farol', newTitle: t.newOrderTitle });

  const engine = usePrintEngine({
    api, rid: restaurantId, printers, device,
    onScreenTicket: (job) => setScreenTickets((x) => [...x, job]),
  });
  takeJob.current = engine.take;

  useEffect(() => store.set('farol-hub-view', view), [view]);

  if (!r) return html`<div class="h-loading"><${Mark} size=${28} /></div>`;
  const browserPrinters = printers.filter((p) => p.kind === 'browser' && p.active);
  const deviceWarning = browserPrinters.length > 0 && engine.myIds.length === 0
    ? html`<p class="h-device-warn"><${Icon} name="printers" size=${15} />${t.deviceNoPrint}
        <button class="h-link" onClick=${() => setView('printers')}>${t.setUp}</button></p>` : null;
  const nav = NAV.filter((k) => role === 'owner' || k !== 'settings');
  const alertsCount = pending + requests.length;
  const account = html`
    <${ThemeButton} theme=${theme} setTheme=${setTheme} t=${t} />
    <${LangSwitch} lang=${lang} setLang=${setLang} />
    <button class="h-icon-btn" onClick=${() => api.signOut()} aria-label=${t.signOut} title=${t.signOut}><${Icon} name="logout" /></button>`;

  return html`<div class="hub ${pending ? 'has-new' : ''} ${kitchen && view === 'orders' ? 'is-kitchen' : ''}">
    <aside class="h-side">
      <div class="h-side-brand"><${Mark} size=${24} /><span class="h-wordmark">Farol</span></div>
      <div class="h-side-rest">
        ${restaurants.length > 1
          ? html`<select class="h-rest-select" value=${restaurantId} onChange=${(e) => onSwitch(e.target.value)} aria-label=${t.chooseRestaurant}>
              ${restaurants.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>`
          : html`<span class="h-rest-name">${r.name}</span>`}
        <span class="h-rest-role">${role === 'owner' ? t.owner : t.staff}</span>
      </div>
      <nav class="h-nav" aria-label="Hub">
        ${nav.map((k) => html`
          <button class="h-nav-item ${view === k ? 'is-on' : ''}" aria-current=${view === k ? 'page' : null} onClick=${() => setView(k)}>
            <${Icon} name=${k} /><span class="h-nav-label">${t[`nav_${k}`]}</span>
            ${k === 'orders' && alertsCount > 0 && html`<span class="h-nav-badge">${alertsCount}</span>`}
          </button>`)}
      </nav>
      <div class="h-side-foot">
        <span class="h-side-user" title=${session.user.email}>${session.user.email}</span>
        <div class="h-side-tools">${account}</div>
      </div>
    </aside>
    <section class="h-body">
      ${api.mode === 'demo' && html`<div class="h-demo-banner">${t.demoBanner}</div>`}
      <header class="h-top">
        <div class="h-top-title">
          <span class="h-only-sm h-top-mark"><${Mark} size=${22} /></span>
          <h1>${t[`nav_${view}`]}</h1>
          <span class="h-only-sm h-top-rest">${r.name}</span>
        </div>
        <div class="h-top-tools">
          ${view === 'orders' && html`<button class="h-btn h-btn-ghost h-hide-sm" onClick=${toggleKitchen} aria-pressed=${kitchen}>
            <${Icon} name=${kitchen ? 'x' : 'kitchen'} size=${16} />${kitchen ? t.exitKitchen : t.kitchenMode}</button>`}
          <${PauseControl} api=${api} t=${t} r=${r} onChange=${(p) => setR({ ...r, ...p })} />
          <span class="h-conn ${live ? 'is-live' : 'is-off'}" title=${live ? t.live : t.offline}><span class="h-conn-dot"></span><span class="h-conn-text">${live ? t.live : t.offline}</span></span>
          <button class="h-icon-btn" aria-pressed=${soundOn} aria-label=${soundOn ? t.soundOn : t.soundOff} title=${soundOn ? t.soundOn : t.soundOff}
            onClick=${() => { unlockAudio(); setSoundOn(!soundOn); store.set('farol-sound', !soundOn); }}><${Icon} name=${soundOn ? 'soundOn' : 'soundOff'} /></button>
          ${!onTryTable && html`<a class="h-icon-btn h-hide-sm" href=${`order.html?r=${r.slug}${api.mode === 'demo' ? '&demo' : ''}`} target="_blank" rel="noopener"
            aria-label=${t.previewMenu} title=${t.previewMenu}><${Icon} name="external" /></a>`}
          <div class="h-only-sm"><${AccountMenu} email=${session.user.email}>${account}</${AccountMenu}></div>
        </div>
      </header>
      ${!live && html`<div class="h-offline" role="alert"><${Icon} name="alert" size=${16} />${t.offlineBanner}</div>`}
      <main class="h-main">
        ${view === 'orders' && html`<${OrdersView} api=${api} t=${t} r=${r} orders=${orders} requests=${requests} printers=${printers}
          onRefresh=${refresh} deviceWarning=${deviceWarning} />`}
        ${view === 'menu' && html`<${MenuView} api=${api} t=${t} r=${r} role=${role} />`}
        ${view === 'tables' && html`<${TablesView} api=${api} t=${t} r=${r} role=${role} onTryTable=${onTryTable} />`}
        ${view === 'printers' && html`<${PrintersView} api=${api} t=${t} r=${r} role=${role} printers=${printers} device=${device}
          onDevice=${setDeviceState} onPrintersChanged=${() => api.listPrinters(restaurantId).then(setPrinters)} engineError=${engine.lastError} />`}
        ${view === 'stats' && html`<${StatsView} api=${api} t=${t} r=${r} lang=${lang} />`}
        ${view === 'settings' && html`<${SettingsView} api=${api} t=${t} r=${r} lang=${lang} role=${role} onSaved=${(x) => setR(x)} />`}
      </main>
    </section>
    <${ScreenTickets} tickets=${screenTickets} t=${t} onClose=${(id) => setScreenTickets((x) => x.filter((j) => j.id !== id))} />
    ${!shiftStarted && html`<div class="h-shift">
      <div class="h-shift-card">
        <div class="h-shift-glow" aria-hidden="true"></div>
        <${Mark} size=${44} />
        <h2>${r.name}</h2>
        <p>${t.startShiftText}</p>
        <button class="h-btn h-btn-primary h-btn-wide" onClick=${() => { unlockAudio(); setShiftStarted(true); }}>${t.startShift}</button>
      </div>
    </div>`}
  </div>`;
}

export function HubApp({ api, onTryTable }) {
  const [lang, setLangState] = useState(() => store.get('farol-hub-lang', null) || ((navigator.language || '').startsWith('es') ? 'es' : 'en'));
  const setLang = (l) => { setLangState(l); store.set('farol-hub-lang', l); };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = HS[lang];
  const [theme, setThemeState] = useState(() => store.get('farol-hub-theme', 'dark'));
  const setTheme = (x) => { setThemeState(x); store.set('farol-hub-theme', x); };
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(false);
  const [restaurants, setRestaurants] = useState(null);
  const [rid, setRid] = useState(null);

  useEffect(() => {
    api.getSession().then(setSession);
    return api.onAuthChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
  }, []);

  useEffect(() => {
    if (!session) { setRestaurants(null); return; }
    (async () => {
      await api.claimInvites().catch(() => {});
      const list = await api.myRestaurants();
      setRestaurants(list);
      const wanted = new URLSearchParams(location.search).get('r');
      const pickR = list.find((x) => x.slug === wanted) || list.find((x) => x.id === store.get('farol-hub-rid')) || (list.length === 1 ? list[0] : null);
      if (pickR) setRid(pickR.id);
    })().catch(console.error);
  }, [session?.user?.id]);

  const choose = (id) => { store.set('farol-hub-rid', id); setRid(id); };

  let body;
  if (session === undefined) body = html`<div class="h-loading"><${Mark} size=${28} /></div>`;
  else if (!session || recovery) body = html`<${Login} api=${api} t=${t} lang=${lang} setLang=${setLang} recovery=${recovery} />`;
  else if (!restaurants) body = html`<div class="h-loading"><${Mark} size=${28} /></div>`;
  else if (!restaurants.length) body = html`<div class="h-login"><div class="h-login-card"><p>${t.noRestaurant}</p>
    <p class="h-muted">${session.user.email}</p><button class="h-link" onClick=${() => api.signOut()}>${t.signOut}</button></div></div>`;
  else if (!rid) body = html`<div class="h-login"><div class="h-login-card"><h1>${t.chooseRestaurant}</h1>
    <ul class="h-pick">${restaurants.map((x) => html`<li><button class="h-btn h-btn-ghost h-btn-wide" onClick=${() => choose(x.id)}><${Icon} name="store" />${x.name}</button></li>`)}</ul></div></div>`;
  else body = html`<${Hub} key=${rid} api=${api} t=${t} lang=${lang} setLang=${setLang} theme=${theme} setTheme=${setTheme} session=${session}
    restaurantId=${rid} restaurants=${restaurants} onSwitch=${choose} onTryTable=${onTryTable} />`;
  return html`<div class="fh" data-theme=${theme}>${body}<${Toasts} /><${ConfirmHost} /></div>`;
}

export function mountHubApp(el, props) {
  render(html`<${HubApp} ...${props} />`, el);
}

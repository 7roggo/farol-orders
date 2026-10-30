// Restaurant settings, ordering hours and team.
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { DAYS } from '../core/util.js';
import { Field, Switch, attempt, toast } from './ui.js';
import { hubError } from './strings.js';

function HoursEditor({ t, lang, hours, onChange }) {
  const setDay = (d, ranges) => {
    const next = { ...hours };
    if (ranges.length) next[d] = ranges; else delete next[d];
    onChange(next);
  };
  return html`<div class="h-hours">
    ${DAYS[lang].map((name, i) => {
      const d = String(i + 1);
      const ranges = hours[d] || [];
      return html`<div class="h-hours-row">
        <span class="h-hours-day">${name}</span>
        <div class="h-hours-ranges">
          ${!ranges.length && html`<span class="h-muted">${t.closedDay}</span>`}
          ${ranges.map(([o, c], ri) => html`<span class="h-range">
            <input type="time" class="h-input h-input-time" value=${o} aria-label=${`${name} ${ri + 1}`}
              onChange=${(e) => setDay(d, ranges.map((r, k) => (k === ri ? [e.target.value, r[1]] : r)))} />
            <span>–</span>
            <input type="time" class="h-input h-input-time" value=${c} aria-label=${`${name} ${ri + 1}`}
              onChange=${(e) => setDay(d, ranges.map((r, k) => (k === ri ? [r[0], e.target.value] : r)))} />
            <button class="h-icon-btn" aria-label=${t.remove} onClick=${() => setDay(d, ranges.filter((_, k) => k !== ri))}>×</button>
          </span>`)}
          ${ranges.length < 3 && html`<button class="h-link" onClick=${() => setDay(d, [...ranges, ranges.length ? ['20:00', '23:30'] : ['13:00', '16:00']])}>+ ${t.addRange}</button>`}
        </div>
      </div>`;
    })}
  </div>`;
}

function Team({ api, t, r }) {
  const [team, setTeam] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const err = (e) => hubError(t, e);
  const load = () => api.listTeam(r.id).then(setTeam).catch(() => setTeam({ members: [], invites: [] }));
  useEffect(() => { load(); }, [r.id]);
  return html`<section class="h-panel">
    <h2>${t.team}</h2>
    <p class="h-muted h-small">${t.ownerHint}</p>
    <ul class="h-team">
      ${team?.members.map((m) => html`<li><span>${m.email}</span><span class="h-badge">${t[m.role]}</span>
        <button class="h-link h-link-bad" onClick=${() => attempt(() => api.removeMember(r.id, m.user_id), err).then(load)}>${t.remove}</button></li>`)}
      ${team?.invites.map((i) => html`<li class="is-pending"><span>${i.email}</span><span class="h-badge is-warn">${t.pendingInvite} · ${t[i.role]}</span>
        <button class="h-link h-link-bad" onClick=${() => attempt(() => api.removeInvite(r.id, i.email), err).then(load)}>${t.remove}</button></li>`)}
    </ul>
    <form class="h-inline-form" onSubmit=${async (e) => {
      e.preventDefault();
      const res = await attempt(() => api.inviteMember(r.id, email, role), err);
      if (res) { toast(res === 'added' ? t.addedMsg : t.invitedMsg); setEmail(''); load(); }
    }}>
      <input class="h-input" type="email" required placeholder=${t.inviteEmail} value=${email} onInput=${(e) => setEmail(e.target.value)} aria-label=${t.inviteEmail} />
      <select class="h-input h-input-short" value=${role} onChange=${(e) => setRole(e.target.value)} aria-label=${t.role}>
        <option value="staff">${t.staff}</option><option value="owner">${t.owner}</option>
      </select>
      <button class="h-btn h-btn-primary">${t.invite}</button>
    </form>
  </section>`;
}

export function SettingsView({ api, t, r, lang, role, onSaved }) {
  const [f, setF] = useState(r);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(r), [r.id]);
  const err = (e) => hubError(t, e);
  const owner = role === 'owner';
  const set = (patch) => setF({ ...f, ...patch });

  const save = async () => {
    setBusy(true);
    const patch = {
      name: f.name.trim(), welcome_es: f.welcome_es, welcome_en: f.welcome_en, accent_color: f.accent_color,
      logo_url: f.logo_url || null, google_review_url: f.google_review_url?.trim() || null, default_lang: f.default_lang,
      cover_url: f.cover_url?.trim() || null, menu_theme: f.menu_theme || 'tasca',
      hours_enabled: f.hours_enabled, hours: f.hours || {},
    };
    const saved = await attempt(() => api.updateRestaurant(r.id, patch), err);
    setBusy(false);
    if (saved) { toast(t.saved); onSaved(saved); }
  };
  if (!owner) return html`<p class="h-muted">${t.ownerOnly}</p>`;

  return html`<div class="h-settings">
    <section class="h-panel">
      <h2>${t.restaurantSettings}</h2>
      <div class="h-grid-2">
        <${Field} label=${t.name}><input class="h-input" value=${f.name} maxlength="80" onInput=${(e) => set({ name: e.target.value })} /></${Field}>
        <${Field} label=${t.defaultLang}>
          <select class="h-input" value=${f.default_lang} onChange=${(e) => set({ default_lang: e.target.value })}>
            <option value="es">Español</option><option value="en">English</option></select></${Field}>
        <${Field} label=${t.welcomeEs}><textarea class="h-input" rows="2" value=${f.welcome_es} onInput=${(e) => set({ welcome_es: e.target.value })}></textarea></${Field}>
        <${Field} label=${t.welcomeEn}><textarea class="h-input" rows="2" value=${f.welcome_en} onInput=${(e) => set({ welcome_en: e.target.value })}></textarea></${Field}>
        <${Field} label=${t.accent}><input type="color" class="h-input h-input-color" value=${f.accent_color} onInput=${(e) => set({ accent_color: e.target.value })} /></${Field}>
        <${Field} label=${t.logo}>
          <div class="h-row">
            ${f.logo_url && html`<img class="h-logo-preview" src=${f.logo_url} alt="" />`}
            <label class="h-btn h-btn-ghost h-btn-small">${t.uploadPhoto}
              <input type="file" accept="image/*" hidden onChange=${async (e) => {
                const url = await attempt(() => api.uploadImage(r.id, e.target.files[0]), err);
                if (url) set({ logo_url: url });
              }} /></label>
            ${f.logo_url && html`<button class="h-link h-link-bad" onClick=${() => set({ logo_url: null })}>${t.remove}</button>`}
          </div></${Field}>
      </div>
      <${Field} label=${t.reviewUrl} hint=${t.reviewHint}>
        <input class="h-input" type="url" placeholder="https://g.page/r/…/review" value=${f.google_review_url || ''} onInput=${(e) => set({ google_review_url: e.target.value })} /></${Field}>
    </section>

    <section class="h-panel">
      <h2>${t.menuLook}</h2>
      <p class="h-muted h-small">${t.menuLookHint}</p>
      <div class="h-themes" role="radiogroup" aria-label=${t.menuStyle}>
        ${['tasca', 'moderno', 'noche'].map((k) => html`<label class="h-theme ${(f.menu_theme || 'tasca') === k ? 'is-on' : ''}">
          <input type="radio" name="menu_theme" checked=${(f.menu_theme || 'tasca') === k} onChange=${() => set({ menu_theme: k })} />
          <span class="h-theme-swatch is-${k}" style=${`--sw:${f.accent_color}`}><span>Aa</span><i></i></span>
          <span><strong>${t[`theme_${k}`]}</strong><small>${t[`theme_${k}_hint`]}</small></span>
        </label>`)}
      </div>
      <${Field} label=${t.coverPhoto} hint=${t.coverHint}>
        <div class="h-cover">
          ${f.cover_url ? html`<img src=${f.cover_url} alt="" />` : html`<div class="h-photo-empty">—</div>`}
          <div class="h-photo-actions">
            <label class="h-btn h-btn-ghost h-btn-small">${t.uploadPhoto}
              <input type="file" accept="image/*" hidden onChange=${async (e) => {
                const url = await attempt(() => api.uploadImage(r.id, e.target.files[0]), err);
                if (url) set({ cover_url: url });
              }} /></label>
            <input class="h-input" placeholder=${t.orPasteUrl} value=${f.cover_url?.startsWith('data:') ? '' : f.cover_url || ''} onChange=${(e) => set({ cover_url: e.target.value.trim() || null })} />
            ${f.cover_url && html`<button class="h-link h-link-bad" onClick=${() => set({ cover_url: null })}>${t.remove}</button>`}
          </div>
        </div>
      </${Field}>
    </section>

    <section class="h-panel">
      <h2>${t.hours}</h2>
      <${Switch} checked=${f.hours_enabled} label=${t.useHours} onChange=${(v) => set({ hours_enabled: v })} />
      <p class="h-muted h-small">${t.hoursHint}</p>
      ${f.hours_enabled && html`<${HoursEditor} t=${t} lang=${lang} hours=${f.hours || {}} onChange=${(hours) => set({ hours })} />`}
    </section>

    <div class="h-sticky-save">
      <button class="h-btn h-btn-primary" disabled=${busy || !f.name.trim()} onClick=${save}>${busy ? t.saving : t.save}</button>
    </div>

    <${Team} api=${api} t=${t} r=${r} />
  </div>`;
}

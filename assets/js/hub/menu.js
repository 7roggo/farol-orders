// Menu editor: categories, items, prices, photos, allergens, options, sold-out, auto-translate.
import { html, useState, useEffect } from '../vendor/preact-htm.js?v=202610300621';
import { money, parseMoney, ALLERGENS, allergenById, uid } from '../core/util.js?v=202610300621';
import { Modal, Switch, Field, attempt, toast, Empty, askConfirm } from './ui.js?v=202610300621';
import { hubError } from './strings.js?v=202610300621';
import { Icon } from './icons.js?v=202610300621';

const euros = (cents) => (cents / 100).toFixed(2).replace('.', ',');

function TranslateBtn({ api, t, from, onDone }) {
  const [busy, setBusy] = useState(false);
  return html`<button type="button" class="h-btn h-btn-small h-btn-ghost" disabled=${busy || !from.trim()}
    onClick=${async () => {
      setBusy(true);
      try { const [x] = await api.translate([from], 'es', 'en'); onDone(x); } catch { toast(t.translateFailed, 'bad'); }
      setBusy(false);
    }}><${Icon} name="globe" size=${14} />${busy ? '…' : t.translate}</button>`;
}

function OptionsEditor({ t, groups, onChange }) {
  const set = (gi, patch) => onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setChoice = (gi, ci, patch) => set(gi, { choices: groups[gi].choices.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  return html`<div class="h-opts">
    ${groups.map((g, gi) => html`<fieldset class="h-opt-group">
      <div class="h-row">
        <input class="h-input" placeholder=${t.groupNameEs} value=${g.name_es} onInput=${(e) => set(gi, { name_es: e.target.value })} aria-label=${t.groupNameEs} />
        <input class="h-input" placeholder=${t.groupNameEn} value=${g.name_en} onInput=${(e) => set(gi, { name_en: e.target.value })} aria-label=${t.groupNameEn} />
      </div>
      <div class="h-row h-row-tight">
        <label class="h-check"><input type="checkbox" checked=${g.required} onChange=${(e) => set(gi, { required: e.target.checked })} /> ${t.requiredOpt}</label>
        <label class="h-check"><input type="checkbox" checked=${g.multi} onChange=${(e) => set(gi, { multi: e.target.checked })} /> ${t.multiOpt}</label>
        <button type="button" class="h-link h-link-bad" onClick=${() => onChange(groups.filter((_, i) => i !== gi))}>${t.removeGroup}</button>
      </div>
      ${g.choices.map((c, ci) => html`<div class="h-row h-choice-row">
        <input class="h-input" placeholder=${t.choiceEs} value=${c.name_es} onInput=${(e) => setChoice(gi, ci, { name_es: e.target.value })} aria-label=${t.choiceEs} />
        <input class="h-input" placeholder=${t.choiceEn} value=${c.name_en} onInput=${(e) => setChoice(gi, ci, { name_en: e.target.value })} aria-label=${t.choiceEn} />
        <input class="h-input h-input-price" inputmode="decimal" placeholder=${t.extraPrice} value=${c.price_cents ? euros(c.price_cents) : ''}
          onChange=${(e) => setChoice(gi, ci, { price_cents: parseMoney(e.target.value) })} aria-label=${t.extraPrice} />
        <button type="button" class="h-icon-btn" aria-label=${t.delete}
          onClick=${() => set(gi, { choices: g.choices.filter((_, i) => i !== ci) })}><${Icon} name="x" size=${15} /></button>
      </div>`)}
      <button type="button" class="h-link" onClick=${() => set(gi, { choices: [...g.choices, { id: uid().slice(0, 8), name_es: '', name_en: '', price_cents: 0 }] })}>+ ${t.addChoice}</button>
    </fieldset>`)}
    <button type="button" class="h-btn h-btn-ghost h-btn-small" onClick=${() => onChange([...groups, {
      id: uid().slice(0, 8), name_es: '', name_en: '', required: false, multi: false,
      choices: [{ id: uid().slice(0, 8), name_es: '', name_en: '', price_cents: 0 }],
    }])}>+ ${t.addGroup}</button>
  </div>`;
}

function ItemEditor({ api, t, rid, item, categories, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    restaurant_id: rid, name_es: '', name_en: '', desc_es: '', desc_en: '', price_cents: 0, allergens: [], options: [],
    image_url: null, category_id: categories[0]?.id, ...item,
  }));
  const [price, setPrice] = useState(euros(f.price_cents || 0));
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF({ ...f, ...patch });
  const err = (e) => hubError(t, e);

  const save = async () => {
    setBusy(true);
    const clean = {
      ...f, price_cents: parseMoney(price),
      options: f.options
        .map((g) => ({ ...g, choices: g.choices.filter((c) => c.name_es.trim() || c.name_en.trim()) }))
        .filter((g) => (g.name_es.trim() || g.name_en.trim()) && g.choices.length),
    };
    const saved = await attempt(() => api.saveItem(clean), err);
    setBusy(false);
    if (saved) { onSaved(saved); onClose(); }
  };
  const upload = async (file) => {
    if (!file) return;
    const url = await attempt(() => api.uploadImage(rid, file), err);
    if (url) set({ image_url: url });
  };

  return html`<${Modal} title=${item?.id ? t.editItem : t.newItem} onClose=${onClose} wide
    footer=${html`
      ${item?.id && html`<button class="h-btn h-btn-ghost h-btn-bad-text" onClick=${async () => {
        if (!(await askConfirm(t.confirmDeleteItem, t.confirmYes, t.cancel))) return;
        await attempt(() => api.deleteItem(item.id), err); onSaved(null, item.id); onClose();
      }}>${t.delete}</button>`}
      <span class="h-grow"></span>
      <button class="h-btn h-btn-ghost" onClick=${onClose}>${t.cancel}</button>
      <button class="h-btn h-btn-primary" disabled=${busy || !(f.name_es.trim() || f.name_en.trim())} onClick=${save}>${busy ? t.saving : t.save}</button>`}>
    <div class="h-grid-2">
      <${Field} label=${t.nameEs}><input class="h-input" value=${f.name_es} onInput=${(e) => set({ name_es: e.target.value })} /></${Field}>
      <${Field} label=${html`${t.nameEn} <${TranslateBtn} api=${api} t=${t} from=${f.name_es} onDone=${(x) => set({ name_en: x })} />`}>
        <input class="h-input" value=${f.name_en} onInput=${(e) => set({ name_en: e.target.value })} /></${Field}>
      <${Field} label=${t.descEs}><textarea class="h-input" rows="2" value=${f.desc_es} onInput=${(e) => set({ desc_es: e.target.value })}></textarea></${Field}>
      <${Field} label=${html`${t.descEn} <${TranslateBtn} api=${api} t=${t} from=${f.desc_es} onDone=${(x) => set({ desc_en: x })} />`}>
        <textarea class="h-input" rows="2" value=${f.desc_en} onInput=${(e) => set({ desc_en: e.target.value })}></textarea></${Field}>
      <${Field} label=${t.price}><input class="h-input" inputmode="decimal" value=${price} onInput=${(e) => setPrice(e.target.value)} /></${Field}>
      <${Field} label=${t.category}>
        <select class="h-input" value=${f.category_id} onChange=${(e) => set({ category_id: e.target.value })}>
          ${categories.map((c) => html`<option value=${c.id}>${c.name_es || c.name_en}</option>`)}
        </select></${Field}>
    </div>
    <fieldset class="h-fieldset"><legend>${t.allergens}</legend>
      <div class="h-allergen-grid">
        ${ALLERGENS.map((a) => html`<label class="h-allergen ${f.allergens.includes(a.id) ? 'is-on' : ''}">
          <input type="checkbox" checked=${f.allergens.includes(a.id)}
            onChange=${(e) => set({ allergens: e.target.checked ? [...f.allergens, a.id] : f.allergens.filter((x) => x !== a.id) })} />
          ${a.es}</label>`)}
      </div>
    </fieldset>
    <div class="h-featured">
      <${Switch} checked=${!!f.featured} label=${t.featured} onChange=${(v) => set({ featured: v })} />
      <small class="h-field-hint">${t.featuredHint}</small>
    </div>
    <fieldset class="h-fieldset"><legend>${t.photo}</legend>
      <div class="h-photo">
        ${f.image_url ? html`<img src=${f.image_url} alt="" />` : html`<div class="h-photo-empty"><${Icon} name="photo" size=${26} /></div>`}
        <div class="h-photo-actions">
          <label class="h-btn h-btn-ghost h-btn-small">${t.uploadPhoto}
            <input type="file" accept="image/*" hidden onChange=${(e) => upload(e.target.files[0])} /></label>
          <input class="h-input" placeholder=${t.orPasteUrl} value=${f.image_url?.startsWith('data:') ? '' : f.image_url || ''}
            onChange=${(e) => set({ image_url: e.target.value.trim() || null })} />
          ${f.image_url && html`<button class="h-link h-link-bad" onClick=${() => set({ image_url: null })}>${t.removePhoto}</button>`}
        </div>
      </div>
    </fieldset>
    <fieldset class="h-fieldset"><legend>${t.options}</legend>
      <p class="h-muted h-small">${t.optionsHint}</p>
      <${OptionsEditor} t=${t} groups=${f.options} onChange=${(options) => set({ options })} />
    </fieldset>
  </${Modal}>`;
}

function CategoryEditor({ api, t, rid, cat, nextSort, onClose, onSaved }) {
  const [f, setF] = useState({ restaurant_id: rid, name_es: '', name_en: '', station: 'kitchen', sort: nextSort, ...cat });
  const err = (e) => hubError(t, e);
  return html`<${Modal} title=${cat?.id ? t.editCategory : t.newCategory} onClose=${onClose}
    footer=${html`
      ${cat?.id && html`<button class="h-btn h-btn-ghost h-btn-bad-text" onClick=${async () => {
        if (!(await askConfirm(t.confirmDeleteCategory, t.confirmYes, t.cancel))) return;
        await attempt(() => api.deleteCategory(cat.id), err); onSaved(); onClose();
      }}>${t.delete}</button>`}
      <span class="h-grow"></span>
      <button class="h-btn h-btn-ghost" onClick=${onClose}>${t.cancel}</button>
      <button class="h-btn h-btn-primary" disabled=${!(f.name_es.trim() || f.name_en.trim())}
        onClick=${async () => { if (await attempt(() => api.saveCategory(f), err)) { onSaved(); onClose(); } }}>${t.save}</button>`}>
    <${Field} label=${t.nameEs}><input class="h-input" value=${f.name_es} onInput=${(e) => setF({ ...f, name_es: e.target.value })} /></${Field}>
    <${Field} label=${html`${t.nameEn} <${TranslateBtn} api=${api} t=${t} from=${f.name_es} onDone=${(x) => setF({ ...f, name_en: x })} />`}>
      <input class="h-input" value=${f.name_en} onInput=${(e) => setF({ ...f, name_en: e.target.value })} /></${Field}>
    <${Field} label=${t.station}>
      <div class="h-seg">
        ${['kitchen', 'bar'].map((s) => html`<label class=${f.station === s ? 'is-on' : ''}>
          <input type="radio" name="station" checked=${f.station === s} onChange=${() => setF({ ...f, station: s })} /><${Icon} name=${s} size=${15} />${s === 'bar' ? t.bar : t.kitchen}</label>`)}
      </div></${Field}>
  </${Modal}>`;
}

export function MenuView({ api, t, r, role }) {
  const [cats, setCats] = useState(null);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);   // {type:'item'|'cat', value}
  const [translating, setTranslating] = useState(false);
  const owner = role === 'owner';
  const err = (e) => hubError(t, e);

  const load = async () => {
    const [c, i] = await Promise.all([api.listCategories(r.id), api.listItems(r.id)]);
    setCats(c); setItems(i);
  };
  useEffect(() => { load(); }, [r.id]);

  const patchItem = async (it, patch) => {
    setItems(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
    const ok = await attempt(() => ('sold_out' in patch && Object.keys(patch).length === 1
      ? api.setSoldOut(it.id, patch.sold_out) : api.saveItem({ ...strip(it), ...patch })), err);
    if (ok === undefined && !('sold_out' in patch)) load();
  };
  // Swap two neighbours and renumber the whole list, saving only rows whose position changed.
  const move = async (list, idx, dir, save) => {
    if (!list[idx] || !list[idx + dir]) return;
    const next = [...list];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    await attempt(async () => {
      for (let i = 0; i < next.length; i++) if (next[i].sort !== i || next[i].__orig !== i) await save({ ...strip(next[i]), sort: i });
    }, err);
    load();
  };
  const strip = ({ __orig, ...x }) => x;
  // keeps each row's stored sort in __orig so we only save what actually moved
  const normalizeSorts = (list) => list.map((x, i) => ({ ...x, __orig: x.sort, sort: i }));

  const translateMissing = async () => {
    const jobs = [];
    cats.forEach((c) => { if (c.name_es && !c.name_en) jobs.push({ kind: 'cat', row: c, field: 'name' }); });
    items.forEach((i) => {
      if (i.name_es && !i.name_en) jobs.push({ kind: 'item', row: i, field: 'name' });
      if (i.desc_es && !i.desc_en) jobs.push({ kind: 'item', row: i, field: 'desc' });
    });
    if (!jobs.length) { toast(t.nothingToTranslate); return; }
    setTranslating(true);
    try {
      const out = await api.translate(jobs.map((j) => j.row[`${j.field}_es`]), 'es', 'en');
      const patched = new Map();
      jobs.forEach((j, n) => {
        const key = j.kind + j.row.id;
        const base = patched.get(key) || { kind: j.kind, row: { ...j.row } };
        base.row[`${j.field}_en`] = out[n];
        patched.set(key, base);
      });
      for (const { kind, row } of patched.values()) await (kind === 'cat' ? api.saveCategory(row) : api.saveItem(row));
      toast(t.translated(jobs.length));
      load();
    } catch { toast(t.translateFailed, 'bad'); }
    setTranslating(false);
  };

  if (!cats) return html`<p class="h-muted">…</p>`;
  const sortedCats = normalizeSorts([...cats].sort((a, b) => a.sort - b.sort));
  return html`<div class="h-menu">
    <div class="h-toolbar">
      ${owner ? html`
        <button class="h-btn h-btn-primary" onClick=${() => setEditing({ type: 'cat', value: null })}><${Icon} name="plus" size=${16} />${t.addCategory}</button>
        <button class="h-btn h-btn-ghost" disabled=${translating} onClick=${translateMissing}><${Icon} name="globe" size=${16} />${translating ? t.translating : t.translateMissing}</button>`
        : html`<p class="h-muted">${t.staffMenuHint}</p>`}
    </div>
    ${!cats.length && html`<${Empty}>${t.emptyMenu}</${Empty}>`}
    ${sortedCats.map((c, ci) => {
      const list = normalizeSorts(items.filter((i) => i.category_id === c.id).sort((a, b) => a.sort - b.sort));
      return html`<section class="h-cat ${c.active ? '' : 'is-hidden'}">
        <header class="h-cat-head">
          <h2>${c.name_es || c.name_en}${c.name_en && c.name_es ? html` <small>${c.name_en}</small>` : null}</h2>
          <span class="h-badge is-${c.station}"><${Icon} name=${c.station === 'bar' ? 'bar' : 'kitchen'} size=${13} />${c.station === 'bar' ? t.bar : t.kitchen}</span>
          ${owner && html`<div class="h-cat-tools">
            <${Switch} checked=${c.active} label=${c.active ? t.visible : t.hidden}
              onChange=${(v) => attempt(() => api.saveCategory({ ...strip(c), active: v }), err).then(load)} />
            <button class="h-icon-btn" aria-label=${t.moveUp} disabled=${ci === 0} onClick=${() => move(sortedCats, ci, -1, api.saveCategory)}><${Icon} name="up" size=${15} /></button>
            <button class="h-icon-btn" aria-label=${t.moveDown} disabled=${ci === sortedCats.length - 1} onClick=${() => move(sortedCats, ci, 1, api.saveCategory)}><${Icon} name="down" size=${15} /></button>
            <button class="h-btn h-btn-ghost h-btn-small" onClick=${() => setEditing({ type: 'cat', value: strip(c) })}>${t.edit}</button>
          </div>`}
        </header>
        <ul class="h-items">
          ${list.map((it, ii) => html`<li class="h-item ${it.sold_out ? 'is-out' : ''} ${it.active ? '' : 'is-hidden'}">
            ${it.image_url ? html`<img class="h-item-img" src=${it.image_url} alt="" />` : html`<span class="h-item-img is-empty" aria-hidden="true"></span>`}
            <div class="h-item-main">
              <div class="h-item-name">${it.name_es || it.name_en}${it.featured ? html` <span class="h-tag is-feat">★</span>` : null}${!it.name_en && owner ? html` <span class="h-tag is-warn">EN</span>` : null}</div>
              <div class="h-item-meta">
                <span>${money(it.price_cents, r.currency)}</span>
                ${it.options?.length ? html`<span>${t.optCount(it.options.length)}</span>` : null}
                ${it.allergens?.length ? html`<span>${it.allergens.map((a) => allergenById[a]?.es).join(', ')}</span>` : null}
              </div>
            </div>
            <div class="h-item-tools">
              <${Switch} checked=${it.sold_out} tone="bad" label=${t.soldOut} onChange=${(v) => patchItem(it, { sold_out: v })} />
              ${owner && html`
                <${Switch} checked=${it.active} label=${t.visible} onChange=${(v) => patchItem(it, { active: v })} />
                <button class="h-icon-btn" aria-label=${t.moveUp} disabled=${ii === 0} onClick=${() => move(list, ii, -1, api.saveItem)}><${Icon} name="up" size=${15} /></button>
                <button class="h-icon-btn" aria-label=${t.moveDown} disabled=${ii === list.length - 1} onClick=${() => move(list, ii, 1, api.saveItem)}><${Icon} name="down" size=${15} /></button>
                <button class="h-btn h-btn-ghost h-btn-small" onClick=${() => setEditing({ type: 'item', value: strip(it) })}>${t.edit}</button>`}
            </div>
          </li>`)}
        </ul>
        ${owner && html`<button class="h-add-item" onClick=${() => setEditing({ type: 'item', value: { category_id: c.id, sort: list.length } })}><${Icon} name="plus" size=${15} />${t.addItem}</button>`}
      </section>`;
    })}
    ${editing?.type === 'item' && html`<${ItemEditor} api=${api} t=${t} rid=${r.id} item=${editing.value} categories=${sortedCats}
      onClose=${() => setEditing(null)} onSaved=${() => load()} />`}
    ${editing?.type === 'cat' && html`<${CategoryEditor} api=${api} t=${t} rid=${r.id} cat=${editing.value} nextSort=${cats.length}
      onClose=${() => setEditing(null)} onSaved=${() => load()} />`}
  </div>`;
}

// Demo backend: the whole platform running inside the browser, no Supabase needed.
// Same functions as supabase-api.js, same rules as the database. Data is kept in this
// browser only (and shared between tabs of the same browser).
import { SAMPLE_MENU, SAMPLE_TABLES, SAMPLE_COVER } from '../core/sample-menu.js?v=202610300457';
import { uid, randomToken, store, localNow, isOpenNow, isPaused } from '../core/util.js?v=202610300457';

const KEY = 'farol-demo-db-v3';
const now = () => new Date().toISOString();
const fail = (code, detail) => { const e = new Error(code); e.code = code; e.detail = detail || null; throw e; };
const clone = (x) => JSON.parse(JSON.stringify(x));

function seed() {
  const rid = uid();
  const db = {
    restaurants: [{
      id: rid, slug: 'casa-lola', name: 'Casa Lola', active: true, timezone: 'Europe/Madrid', currency: 'EUR',
      default_lang: 'es', welcome_es: 'Tapas caseras y la tortilla de la abuela Lola. Pide desde la mesa y te lo llevamos.',
      welcome_en: "Homemade tapas and grandma Lola's tortilla. Order from your table and we'll bring it over.", logo_url: null,
      cover_url: SAMPLE_COVER, menu_theme: 'tasca', accent_color: '#C8553D',
      google_review_url: 'https://www.google.com/maps', hours_enabled: false,
      hours: { 2: [['12:30', '16:30'], ['20:00', '00:30']], 3: [['12:30', '16:30'], ['20:00', '00:30']],
        4: [['12:30', '16:30'], ['20:00', '00:30']], 5: [['12:30', '16:30'], ['20:00', '01:30']],
        6: [['12:30', '01:30']], 7: [['12:30', '17:00']] },
      ordering_paused: false, paused_until: null, created_at: now(),
    }],
    categories: [], items: [], dining_tables: [], orders: [], service_requests: [], printers: [], print_jobs: [],
    members: [{ restaurant_id: rid, user_id: 'demo-owner', role: 'owner' }],
    users: [{ id: 'demo-owner', email: 'lola@casalola.demo' }, { id: 'demo-staff', email: 'camarero@casalola.demo' }],
    invites: [],
  };
  db.members.push({ restaurant_id: rid, user_id: 'demo-staff', role: 'staff' });
  seedMenu(db, rid);
  db.printers.push(
    { id: uid(), restaurant_id: rid, name: 'Cocina', kind: 'browser', station: 'kitchen', paper_mm: 80, key: randomToken(32), active: true, last_seen_at: null, created_at: now() },
    { id: uid(), restaurant_id: rid, name: 'Barra', kind: 'browser', station: 'bar', paper_mm: 80, key: randomToken(32), active: true, last_seen_at: null, created_at: now() },
  );
  seedHistory(db, rid);
  return db;
}

function seedMenu(db, rid) {
  SAMPLE_MENU.forEach((cat, ci) => {
    const cid = uid();
    db.categories.push({ id: cid, restaurant_id: rid, name_es: cat.name_es, name_en: cat.name_en, station: cat.station, sort: ci, active: true, created_at: now() });
    cat.items.forEach((it, ii) => db.items.push({
      id: uid(), restaurant_id: rid, category_id: cid, image_url: null, featured: false, ...clone(it), sold_out: false, active: true, sort: ii, created_at: now(),
    }));
  });
  SAMPLE_TABLES.forEach((label, i) => db.dining_tables.push({ id: uid(), restaurant_id: rid, label, token: randomToken(16), sort: i, active: true, created_at: now() }));
}

// A week of past orders so the stats page has something to show.
function seedHistory(db, rid) {
  const r = db.restaurants[0];
  let seedN = 7;
  const rand = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; };
  const items = db.items;
  for (let d = 7; d >= 0; d--) {
    const count = d === 0 ? 9 : 14 + Math.floor(rand() * 12);
    const day = new Date(Date.now() - d * 86400000);
    const isoDate = localNow(r.timezone, day).isoDate;
    let number = 0;
    for (let k = 0; k < count; k++) {
      const hour = [13, 13, 14, 14, 14, 15, 20, 21, 21, 22, 22, 23][Math.floor(rand() * 12)];
      const at = new Date(`${isoDate}T${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00+01:00`);
      if (at > new Date()) continue;
      const lines = [];
      const n = 1 + Math.floor(rand() * 4);
      for (let j = 0; j < n; j++) {
        const it = items[Math.floor(rand() * items.length)];
        const choices = (it.options || []).filter((g) => g.required).map((g) => g.choices[0].id);
        lines.push(makeLine(db, it, 1 + Math.floor(rand() * 2), choices, ''));
      }
      const table = db.dining_tables[Math.floor(rand() * db.dining_tables.length)];
      const declined = rand() < 0.05;
      number += 1;
      db.orders.push({
        id: uid(), restaurant_id: rid, table_id: table.id, table_label: table.label, number, local_date: isoDate,
        status: declined ? 'declined' : 'completed', decline_reason: declined ? 'Agotado' : null, note: '', customer_name: '',
        lang: rand() < 0.3 ? 'en' : 'es', lines, total_cents: lines.reduce((s, l) => s + l.line_cents, 0),
        client_token: uid(), created_at: at.toISOString(), accepted_at: at.toISOString(), ready_at: null,
        completed_at: at.toISOString(), declined_at: null,
      });
    }
  }
}

function makeLine(db, it, qty, choiceIds, note) {
  const cat = db.categories.find((c) => c.id === it.category_id);
  let unit = it.price_cents;
  const options = [];
  let matched = 0;
  for (const g of it.options || []) {
    let cnt = 0;
    for (const ch of g.choices || []) {
      if (choiceIds.includes(ch.id)) {
        cnt++; unit += ch.price_cents || 0;
        options.push({ group_es: g.name_es, group_en: g.name_en, name_es: ch.name_es, name_en: ch.name_en, price_cents: ch.price_cents || 0 });
      }
    }
    matched += cnt;
    if (g.required && cnt === 0) fail('option_required', it.id);
    if (!g.multi && cnt > 1) fail('menu_changed');
  }
  if (matched !== choiceIds.length) fail('menu_changed');
  return {
    item_id: it.id, name_es: it.name_es, name_en: it.name_en, qty, unit_cents: unit, line_cents: unit * qty,
    options, note: String(note || '').trim().slice(0, 140), station: cat?.station || 'kitchen',
  };
}

export function createDemoApi() {
  let db = store.get(KEY);
  if (!db) { db = seed(); store.set(KEY, db); }
  let session = store.get(KEY + '-session', { user: { id: 'demo-owner', email: 'lola@casalola.demo' } });
  const listeners = new Set();
  const authListeners = new Set();
  let bc = null;
  try { bc = new BroadcastChannel('farol-demo'); } catch { /* not supported */ }

  const save = () => store.set(KEY, db);
  const emit = (table, type, row, fromOtherTab = false) => {
    listeners.forEach((l) => l(table, type, clone(row)));
    if (!fromOtherTab) { save(); bc?.postMessage({ table, type, row }); }
  };
  bc && (bc.onmessage = (e) => {
    db = store.get(KEY) || db;
    emit(e.data.table, e.data.type, e.data.row, true);
  });

  const R = (id) => db.restaurants.find((r) => r.id === id);
  const userId = () => session?.user?.id;
  const role = (rid) => (userId() === 'demo-owner' ? 'owner' : db.members.find((m) => m.restaurant_id === rid && m.user_id === userId())?.role || null);
  const mustMember = (rid) => { if (!role(rid)) fail('not_allowed'); };
  const mustOwner = (rid) => { if (role(rid) !== 'owner') fail('not_allowed'); };
  const delay = (v) => new Promise((res) => setTimeout(() => res(clone(v)), 60));
  const upsert = (table, row, defaults) => {
    const list = db[table];
    const i = row.id ? list.findIndex((x) => x.id === row.id) : -1;
    const saved = i >= 0 ? { ...list[i], ...row } : { id: uid(), created_at: now(), ...defaults, ...row };
    if (i >= 0) list[i] = saved; else list.push(saved);
    emit(table, i >= 0 ? 'UPDATE' : 'INSERT', saved);
    return saved;
  };
  const remove = (table, id) => {
    const row = db[table].find((x) => x.id === id);
    db[table] = db[table].filter((x) => x.id !== id);
    if (row) emit(table, 'DELETE', row);
  };

  function createPrintJobs(order, printerId, reprint) {
    const r = R(order.restaurant_id);
    const at = new Date(order.created_at);
    for (const p of db.printers.filter((x) => x.restaurant_id === order.restaurant_id && x.active && (!printerId || x.id === printerId))) {
      const sel = order.lines.filter((l) => p.station === 'all' || l.station === p.station);
      if (!sel.length) continue;
      upsert('print_jobs', {
        restaurant_id: order.restaurant_id, printer_id: p.id, order_id: order.id, station: p.station, status: 'queued', attempts: 0, error: null,
        ticket: {
          kind: 'order', restaurant: r.name, number: order.number, table: order.table_label, station: p.station,
          time: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: r.timezone }).format(at),
          date: new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: r.timezone }).format(at),
          lines: sel, other_station_lines: order.lines.length - sel.length, note: order.note,
          customer_name: order.customer_name, reprint, paper_mm: p.paper_mm,
        },
      });
    }
  }

  const tableByToken = (token) => {
    const tb = db.dining_tables.find((t) => t.token === token && t.active);
    if (!tb) fail('table_not_found');
    return tb;
  };

  const api = {
    mode: 'demo',
    functionsUrl: 'https://YOUR-PROJECT.supabase.co/functions/v1',
    resetDemo() { db = seed(); save(); bc?.postMessage({ table: '*', type: 'RESET', row: {} }); listeners.forEach((l) => l('*', 'RESET', {})); },

    // ---------- customers ----------
    async getPublicMenu({ tableToken, slug }) {
      let tb = null, r;
      if (tableToken) { tb = tableByToken(tableToken); r = R(tb.restaurant_id); }
      else r = db.restaurants.find((x) => x.slug === slug);
      if (!r || !r.active) fail('restaurant_unavailable');
      const cats = db.categories.filter((c) => c.restaurant_id === r.id && c.active).sort((a, b) => a.sort - b.sort);
      const catIds = new Set(cats.map((c) => c.id));
      return delay({
        restaurant: { ...r, is_open: isOpenNow(r.hours_enabled, r.hours, r.timezone), is_paused: isPaused(r) },
        table: tb ? { label: tb.label, token: tb.token } : null,
        categories: cats,
        items: db.items.filter((i) => i.restaurant_id === r.id && i.active && catIds.has(i.category_id)).sort((a, b) => a.sort - b.sort),
      });
    },
    async placeOrder({ tableToken, lines, note, lang, customerName }) {
      const tb = tableByToken(tableToken);
      const r = R(tb.restaurant_id);
      if (!r.active) fail('restaurant_unavailable');
      if (isPaused(r)) fail('ordering_paused');
      if (!isOpenNow(r.hours_enabled, r.hours, r.timezone)) fail('restaurant_closed');
      if (!lines?.length) fail('empty_order');
      if (db.orders.filter((o) => o.table_id === tb.id && o.status === 'pending').length >= 4) fail('too_many_orders');
      const out = lines.map((ln) => {
        const it = db.items.find((i) => i.id === ln.item_id && i.restaurant_id === r.id && i.active);
        if (!it) fail('menu_changed');
        if (it.sold_out) fail('item_sold_out', it.id);
        const qty = Number(ln.qty) || 1;
        if (qty < 1 || qty > 30) fail('invalid_quantity');
        return makeLine(db, it, qty, ln.choices || [], ln.note);
      });
      const isoDate = localNow(r.timezone).isoDate;
      const number = Math.max(0, ...db.orders.filter((o) => o.restaurant_id === r.id && o.local_date === isoDate).map((o) => o.number)) + 1;
      const o = upsert('orders', {
        restaurant_id: r.id, table_id: tb.id, table_label: tb.label, number, local_date: isoDate, status: 'pending',
        decline_reason: null, note: String(note || '').trim().slice(0, 300), customer_name: String(customerName || '').trim().slice(0, 40),
        lang: lang === 'en' ? 'en' : 'es', lines: out, total_cents: out.reduce((s, l) => s + l.line_cents, 0), client_token: uid(),
        accepted_at: null, ready_at: null, completed_at: null, declined_at: null,
      });
      return delay({ order_id: o.id, client_token: o.client_token, number: o.number, total_cents: o.total_cents });
    },
    async getOrderStatus(orderId, clientToken) {
      const o = db.orders.find((x) => x.id === orderId && x.client_token === clientToken);
      if (!o) fail('order_not_found');
      const r = R(o.restaurant_id);
      return delay({ ...o, order_id: o.id, google_review_url: r.google_review_url, restaurant_name: r.name, currency: r.currency });
    },
    async requestService(tableToken, kind) {
      const tb = tableByToken(tableToken);
      const existing = db.service_requests.find((s) => s.table_id === tb.id && s.kind === kind && s.status === 'open');
      if (existing) return delay({ id: existing.id, duplicate: true });
      const s = upsert('service_requests', { restaurant_id: tb.restaurant_id, table_id: tb.id, table_label: tb.label, kind, status: 'open', done_at: null });
      return delay({ id: s.id, duplicate: false });
    },

    // ---------- login (demo: any e-mail/password works) ----------
    getSession: async () => clone(session),
    onAuthChange(cb) { authListeners.add(cb); return () => authListeners.delete(cb); },
    async signIn(email) {
      const u = db.users.find((x) => x.email === email.toLowerCase()) || db.users[0];
      session = { user: clone(u) }; store.set(KEY + '-session', session);
      authListeners.forEach((l) => l('SIGNED_IN', session));
    },
    async signUp(email, password) { await api.signIn(email, password); return { needsConfirmation: false }; },
    async resetPassword() {},
    async setNewPassword() {},
    async signOut() { session = null; store.set(KEY + '-session', null); authListeners.forEach((l) => l('SIGNED_OUT', null)); },
    claimInvites: async () => 0,
    myRestaurants: async () => delay(db.restaurants.filter((r) => role(r.id)).map((r) => ({ id: r.id, slug: r.slug, name: r.name, active: r.active, role: role(r.id) }))),

    // ---------- restaurant ----------
    async getRestaurant(id) { mustMember(id); return delay(R(id)); },
    async setPause(id, minutes) {
      mustMember(id);
      const r = upsert('restaurants', { id, ordering_paused: minutes === 0,
        paused_until: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null });
      return delay({ ordering_paused: r.ordering_paused, paused_until: r.paused_until });
    },
    async updateRestaurant(id, patch) {
      mustOwner(id);
      const { active, slug, ...rest } = patch;
      const r = upsert('restaurants', { id, ...rest, ...(userId() === 'demo-owner' && active !== undefined ? { active } : {}) });
      return delay(r);
    },

    // ---------- menu ----------
    listCategories: async (rid) => delay(db.categories.filter((c) => c.restaurant_id === rid).sort((a, b) => a.sort - b.sort)),
    async saveCategory(c) { mustOwner(c.restaurant_id); return delay(upsert('categories', c, { active: true, sort: 0, station: 'kitchen' })); },
    async deleteCategory(id) {
      const c = db.categories.find((x) => x.id === id); if (c) mustOwner(c.restaurant_id);
      db.items.filter((i) => i.category_id === id).forEach((i) => remove('items', i.id));
      remove('categories', id);
    },
    listItems: async (rid) => delay(db.items.filter((i) => i.restaurant_id === rid).sort((a, b) => a.sort - b.sort)),
    async saveItem(it) {
      mustOwner(it.restaurant_id);
      return delay(upsert('items', it, { allergens: [], options: [], sold_out: false, active: true, sort: 0, image_url: null, desc_es: '', desc_en: '' }));
    },
    async deleteItem(id) { const it = db.items.find((x) => x.id === id); if (it) mustOwner(it.restaurant_id); remove('items', id); },
    async setSoldOut(itemId, soldOut) {
      const it = db.items.find((x) => x.id === itemId); if (!it) fail('not_allowed'); mustMember(it.restaurant_id);
      upsert('items', { id: itemId, sold_out: soldOut });
    },
    async uploadImage(rid, file) {
      mustOwner(rid);
      return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    },
    async translate(texts, from = 'es', to = 'en') {
      const out = [];
      for (const t of texts) {
        if (!t.trim()) { out.push(t); continue; }
        try {
          const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${to}`);
          const data = await res.json();
          out.push(data?.responseData?.translatedText || t);
        } catch { fail('translation_failed'); }
      }
      return out;
    },

    // ---------- tables ----------
    listTables: async (rid) => delay(db.dining_tables.filter((t) => t.restaurant_id === rid).sort((a, b) => a.sort - b.sort)),
    async createTables(rid, labels, startSort = 0) {
      mustOwner(rid);
      return delay(labels.map((label, i) => upsert('dining_tables', { restaurant_id: rid, label, token: randomToken(16), sort: startSort + i, active: true })));
    },
    async updateTable(id, patch) { const t = db.dining_tables.find((x) => x.id === id); mustOwner(t.restaurant_id); return delay(upsert('dining_tables', { id, ...patch })); },
    async deleteTable(id) { const t = db.dining_tables.find((x) => x.id === id); if (t) mustOwner(t.restaurant_id); remove('dining_tables', id); },

    // ---------- orders ----------
    async listActiveOrders(rid, tz) {
      mustMember(rid);
      const today = localNow(tz).isoDate;
      return delay(db.orders.filter((o) => o.restaurant_id === rid && (['pending', 'accepted', 'ready'].includes(o.status) || o.local_date === today))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    async listOrdersBetween(rid, from, to) {
      mustMember(rid);
      return delay(db.orders.filter((o) => o.restaurant_id === rid && o.local_date >= from && o.local_date <= to));
    },
    async setOrderStatus(orderId, status, reason) {
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) fail('not_allowed'); mustMember(o.restaurant_id);
      const allowed = { pending: ['accepted', 'declined'], accepted: ['ready', 'completed', 'declined'], ready: ['completed', 'accepted'], completed: ['ready'] }[o.status] || [];
      if (!allowed.includes(status)) fail('invalid_status_change');
      const t = now();
      const patch = { id: o.id, status };
      if (status === 'declined') { patch.decline_reason = String(reason || '').slice(0, 140); patch.declined_at = t; }
      if (status === 'accepted') { patch.accepted_at = o.accepted_at || t; patch.ready_at = null; }
      if (status === 'ready') { patch.ready_at = t; patch.completed_at = null; }
      if (status === 'completed') patch.completed_at = t;
      const saved = upsert('orders', patch);
      if (o.status === 'pending' && status === 'accepted') createPrintJobs(saved, null, false);
      return delay(saved);
    },
    async reprintOrder(orderId, printerId) {
      const o = db.orders.find((x) => x.id === orderId); mustMember(o.restaurant_id);
      createPrintJobs(o, printerId, true);
    },

    // ---------- waiter / bill ----------
    listOpenRequests: async (rid) => delay(db.service_requests.filter((s) => s.restaurant_id === rid && s.status === 'open')),
    async resolveRequest(id) { upsert('service_requests', { id, status: 'done', done_at: now() }); },

    // ---------- printers ----------
    listPrinters: async (rid) => delay(db.printers.filter((p) => p.restaurant_id === rid)),
    async savePrinter(p) { mustOwner(p.restaurant_id); return delay(upsert('printers', p, { key: randomToken(32), active: true, paper_mm: 80, station: 'all', last_seen_at: null })); },
    async deletePrinter(id) { remove('printers', id); db.print_jobs = db.print_jobs.filter((j) => j.printer_id !== id); save(); },
    async testPrint(printerId) {
      const p = db.printers.find((x) => x.id === printerId); mustMember(p.restaurant_id);
      const r = R(p.restaurant_id);
      const d = new Date();
      upsert('print_jobs', {
        restaurant_id: p.restaurant_id, printer_id: p.id, order_id: null, station: p.station, status: 'queued', attempts: 0, error: null,
        ticket: { kind: 'test', restaurant: r.name, printer: p.name, station: p.station, paper_mm: p.paper_mm,
          time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }), date: d.toLocaleDateString('es-ES') },
      });
    },
    async printerHeartbeat(printerId) { upsert('printers', { id: printerId, last_seen_at: now() }); },
    listPrintJobs: async (rid, limit = 40) => delay(db.print_jobs.filter((j) => j.restaurant_id === rid).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)),
    listQueuedJobs: async (ids) => delay(db.print_jobs.filter((j) => ids.includes(j.printer_id) && j.status === 'queued')),
    async claimJob(jobId) {
      const j = db.print_jobs.find((x) => x.id === jobId);
      if (!j || j.status !== 'queued') return false;
      upsert('print_jobs', { id: jobId, status: 'sent', sent_at: now() });
      return true;
    },
    async markJob(jobId, ok, error) {
      upsert('print_jobs', ok ? { id: jobId, status: 'printed', printed_at: now(), error: null } : { id: jobId, status: 'failed', error: error || 'print error' });
    },
    async retryJob(jobId) { upsert('print_jobs', { id: jobId, status: 'queued', attempts: 0, error: null }); },

    // ---------- team ----------
    async listTeam(rid) {
      mustOwner(rid);
      return delay({
        members: db.members.filter((m) => m.restaurant_id === rid).map((m) => ({ ...m, email: db.users.find((u) => u.id === m.user_id)?.email })),
        invites: db.invites.filter((i) => i.restaurant_id === rid),
      });
    },
    async inviteMember(rid, email, role_) {
      mustOwner(rid);
      email = email.trim().toLowerCase();
      if (!email.includes('@')) fail('invalid_email');
      const u = db.users.find((x) => x.email === email);
      if (u) {
        db.members = db.members.filter((m) => !(m.restaurant_id === rid && m.user_id === u.id));
        db.members.push({ restaurant_id: rid, user_id: u.id, role: role_ }); save(); return 'added';
      }
      db.invites = db.invites.filter((i) => !(i.restaurant_id === rid && i.email === email));
      db.invites.push({ restaurant_id: rid, email, role: role_ }); save(); return 'invited';
    },
    async removeMember(rid, uidToRemove) {
      mustOwner(rid);
      const owners = db.members.filter((m) => m.restaurant_id === rid && m.role === 'owner');
      if (owners.length <= 1 && owners[0]?.user_id === uidToRemove) fail('last_owner');
      db.members = db.members.filter((m) => !(m.restaurant_id === rid && m.user_id === uidToRemove)); save();
    },
    async removeInvite(rid, email) { db.invites = db.invites.filter((i) => !(i.restaurant_id === rid && i.email === email)); save(); },

    // ---------- Farol admin ----------
    isPlatformAdmin: async () => userId() === 'demo-owner',
    async adminOverview() {
      const since = Date.now() - 30 * 86400000;
      return delay(db.restaurants.map((r) => {
        const os = db.orders.filter((o) => o.restaurant_id === r.id && new Date(o.created_at).getTime() > since);
        return {
          ...r,
          owners: db.members.filter((m) => m.restaurant_id === r.id && m.role === 'owner').map((m) => db.users.find((u) => u.id === m.user_id)?.email),
          pending_invites: db.invites.filter((i) => i.restaurant_id === r.id).map((i) => i.email),
          orders_30d: os.filter((o) => o.status !== 'declined').length,
          revenue_30d_cents: os.filter((o) => ['accepted', 'ready', 'completed'].includes(o.status)).reduce((s, o) => s + o.total_cents, 0),
          last_order_at: os.map((o) => o.created_at).sort().pop() || null,
        };
      }));
    },
    async adminCreateRestaurant({ name, slug, ownerEmail, sampleMenu }) {
      if (db.restaurants.some((r) => r.slug === slug)) fail('duplicate_slug');
      const r = upsert('restaurants', {
        slug, name, active: true, timezone: 'Europe/Madrid', currency: 'EUR', default_lang: 'es', welcome_es: '', welcome_en: '',
        logo_url: null, cover_url: sampleMenu ? SAMPLE_COVER : null, menu_theme: 'tasca', accent_color: '#C8553D', google_review_url: null, hours_enabled: false, hours: {}, ordering_paused: false, paused_until: null,
      });
      if (ownerEmail) db.invites.push({ restaurant_id: r.id, email: ownerEmail.toLowerCase(), role: 'owner' });
      if (sampleMenu) seedMenu(db, r.id);
      save();
      return r.id;
    },
    async adminSetActive(rid, active) { upsert('restaurants', { id: rid, active }); },

    // ---------- live updates ----------
    subscribe(rid, onChange, onStatus) {
      const l = (table, type, row) => { if (table === '*' || row.restaurant_id === rid) onChange(table, type, row); };
      listeners.add(l);
      setTimeout(() => onStatus?.('SUBSCRIBED'), 50);
      return () => listeners.delete(l);
    },
  };
  return api;
}

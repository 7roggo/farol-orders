// Live backend: talks to your Supabase project (database, logins, live updates, functions).
import { uid, localNow } from '../core/util.js?v=202610301029';

function toError(e) {
  const err = new Error(e?.message || String(e));
  err.code = String(e?.message || '').split(/[:\s]/)[0];
  err.detail = e?.details || null;
  return err;
}

export function createSupabaseApi(cfg) {
  if (!window.supabase?.createClient) throw new Error('Supabase library missing (assets/js/vendor/supabase.js)');
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const rpc = async (fn, args = {}) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw toError(error);
    return data;
  };
  const run = async (query) => {
    const { data, error } = await query;
    if (error) throw toError(error);
    return data;
  };

  const api = {
    mode: 'live',
    functionsUrl: `${cfg.supabaseUrl.replace(/\/$/, '')}/functions/v1`,

    // ---------- customers ----------
    getPublicMenu: ({ tableToken, slug }) => rpc('get_public_menu', { p_table_token: tableToken || null, p_slug: slug || null }),
    placeOrder: ({ tableToken, lines, note, lang, customerName }) =>
      rpc('place_order', { p_table_token: tableToken, p_lines: lines, p_note: note || '', p_lang: lang, p_customer_name: customerName || '' }),
    getOrderStatus: (orderId, clientToken) => rpc('get_order_status', { p_order_id: orderId, p_client_token: clientToken }),
    requestService: (tableToken, kind) => rpc('request_service', { p_table_token: tableToken, p_kind: kind }),

    // ---------- login ----------
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session ? { user: { id: data.session.user.id, email: data.session.user.email } } : null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event, session) =>
        cb(event, session ? { user: { id: session.user.id, email: session.user.email } } : null));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw toError(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
      if (error) throw toError(error);
      return { needsConfirmation: !data.session };
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
      if (error) throw toError(error);
    },
    async setNewPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw toError(error);
    },
    async signOut() { await sb.auth.signOut(); },
    claimInvites: () => rpc('claim_invites'),
    myRestaurants: () => rpc('my_restaurants'),

    // ---------- restaurant ----------
    getRestaurant: (id) => run(sb.from('restaurants').select('*').eq('id', id).single()),
    setPause: (id, minutes) => rpc('set_ordering_pause', { p_restaurant_id: id, p_minutes: minutes }),
    updateRestaurant: (id, patch) => run(sb.from('restaurants').update(patch).eq('id', id).select().single()),

    // ---------- menu ----------
    listCategories: (rid) => run(sb.from('categories').select('*').eq('restaurant_id', rid).order('sort').order('created_at')),
    saveCategory: (c) => run(sb.from('categories').upsert(c).select().single()),
    deleteCategory: (id) => run(sb.from('categories').delete().eq('id', id)),
    listItems: (rid) => run(sb.from('items').select('*').eq('restaurant_id', rid).order('sort').order('created_at')),
    saveItem: (it) => run(sb.from('items').upsert(it).select().single()),
    deleteItem: (id) => run(sb.from('items').delete().eq('id', id)),
    setSoldOut: (itemId, soldOut) => rpc('set_item_sold_out', { p_item_id: itemId, p_sold_out: soldOut }),
    async uploadImage(rid, file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${rid}/${uid()}.${ext}`;
      const { error } = await sb.storage.from('menu-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw toError(error);
      return sb.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
    },
    // Uses the "translate" function when it's deployed (DeepL if a key is set); otherwise the free MyMemory service.
    async translate(texts, from = 'es', to = 'en') {
      try {
        const { data, error } = await sb.functions.invoke('translate', { body: { texts, from, to } });
        if (!error && !data?.error && Array.isArray(data?.texts)) return data.texts;
      } catch { /* not deployed: fall back below */ }
      const out = [];
      for (const t of texts) {
        if (!String(t).trim()) { out.push(t); continue; }
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${from}|${to}`);
        if (!res.ok) throw toError({ message: 'translation_failed' });
        const d = await res.json();
        out.push(d?.responseData?.translatedText || t);
      }
      return out;
    },

    // ---------- tables ----------
    listTables: (rid) => run(sb.from('dining_tables').select('*').eq('restaurant_id', rid).order('sort').order('created_at')),
    createTables: (rid, labels, startSort = 0) =>
      run(sb.from('dining_tables').insert(labels.map((label, i) => ({ restaurant_id: rid, label, sort: startSort + i }))).select()),
    updateTable: (id, patch) => run(sb.from('dining_tables').update(patch).eq('id', id).select().single()),
    deleteTable: (id) => run(sb.from('dining_tables').delete().eq('id', id)),

    // ---------- orders ----------
    listActiveOrders(rid, tz) {
      const today = localNow(tz).isoDate;
      const since = new Date(Date.now() - 3 * 86400000).toISOString();
      return run(sb.from('orders').select('*').eq('restaurant_id', rid).gte('created_at', since)
        .or(`status.in.(pending,accepted,ready),local_date.eq.${today}`)
        .order('created_at', { ascending: true }).limit(500));
    },
    listOrdersBetween: (rid, fromDate, toDate) =>
      run(sb.from('orders').select('id,number,status,total_cents,lines,created_at,local_date,table_label')
        .eq('restaurant_id', rid).gte('local_date', fromDate).lte('local_date', toDate)
        .order('created_at').limit(5000)),
    setOrderStatus: (orderId, status, reason) => rpc('set_order_status', { p_order_id: orderId, p_status: status, p_reason: reason || null }),
    reprintOrder: (orderId, printerId) => rpc('reprint_order', { p_order_id: orderId, p_printer_id: printerId || null }),

    // ---------- waiter / bill ----------
    listOpenRequests: (rid) =>
      run(sb.from('service_requests').select('*').eq('restaurant_id', rid).eq('status', 'open').order('created_at')),
    resolveRequest: (id) => run(sb.from('service_requests').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', id)),

    // ---------- printers ----------
    listPrinters: (rid) => run(sb.from('printers').select('*').eq('restaurant_id', rid).order('created_at')),
    savePrinter: (p) => run(sb.from('printers').upsert(p).select().single()),
    deletePrinter: (id) => run(sb.from('printers').delete().eq('id', id)),
    testPrint: (printerId) => rpc('test_print', { p_printer_id: printerId }),
    printerHeartbeat: (printerId) => rpc('printer_heartbeat', { p_printer_id: printerId }),
    listPrintJobs: (rid, limit = 40) =>
      run(sb.from('print_jobs').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(limit)),
    listQueuedJobs: (printerIds) =>
      printerIds.length
        ? run(sb.from('print_jobs').select('*').in('printer_id', printerIds).eq('status', 'queued')
          .gte('created_at', new Date(Date.now() - 2 * 3600000).toISOString()).order('created_at'))
        : Promise.resolve([]),
    async claimJob(jobId) {
      const rows = await run(sb.from('print_jobs').update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', jobId).eq('status', 'queued').select('id'));
      return rows.length > 0;
    },
    markJob: (jobId, ok, error) => run(sb.from('print_jobs').update(ok
      ? { status: 'printed', printed_at: new Date().toISOString(), error: null }
      : { status: 'failed', error: error || 'print error' }).eq('id', jobId)),
    retryJob: (jobId) => rpc('retry_print_job', { p_job_id: jobId }),

    // ---------- team ----------
    listTeam: (rid) => rpc('list_team', { p_restaurant_id: rid }),
    inviteMember: (rid, email, role) => rpc('invite_member', { p_restaurant_id: rid, p_email: email, p_role: role }),
    removeMember: (rid, userId) => rpc('remove_member', { p_restaurant_id: rid, p_user_id: userId }),
    removeInvite: (rid, email) => rpc('remove_invite', { p_restaurant_id: rid, p_email: email }),

    // ---------- support (Help from Farol) ----------
    listSupport: (rid) => run(sb.from('support_tickets').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(20)),
    createSupport: (rid, { message, topic, urgent, context }) =>
      rpc('create_support_ticket', { p_restaurant_id: rid, p_message: message, p_topic: topic, p_urgent: !!urgent, p_context: context || {} }),
    adminSupportList: (includeResolved = false) => rpc('admin_support_list', { p_include_resolved: includeResolved }),
    adminSupportUpdate: (id, reply, resolve) => rpc('admin_support_update', { p_ticket_id: id, p_reply: reply || null, p_resolve: !!resolve }),
    adminSubscribeSupport(onChange) {
      const ch = sb.channel(`support-${uid()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, (p) => onChange(p.eventType, p.new))
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // ---------- Farol admin ----------
    async isPlatformAdmin() {
      const s = await api.getSession();
      if (!s) return false;
      const rows = await run(sb.from('platform_admins').select('user_id').eq('user_id', s.user.id));
      return rows.length > 0;
    },
    adminOverview: () => rpc('admin_overview'),
    adminCreateRestaurant: ({ name, slug, ownerEmail, sampleMenu }) =>
      rpc('admin_create_restaurant', { p_name: name, p_slug: slug, p_owner_email: ownerEmail || null, p_sample_menu: !!sampleMenu }),
    adminSetActive: (rid, active) => run(sb.from('restaurants').update({ active }).eq('id', rid)),

    // ---------- live updates ----------
    subscribe(rid, onChange, onStatus) {
      const ch = sb.channel(`hub-${rid}-${uid()}`);
      for (const table of ['orders', 'service_requests', 'print_jobs', 'printers', 'support_tickets']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `restaurant_id=eq.${rid}` },
          (p) => onChange(table, p.eventType, p.new && Object.keys(p.new).length ? p.new : p.old));
      }
      ch.subscribe((status) => onStatus?.(status));
      return () => sb.removeChannel(ch);
    },
  };
  return api;
}

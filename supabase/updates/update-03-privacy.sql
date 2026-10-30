-- UPDATE 03 — copy ALL of this text into Supabase → SQL Editor → Run.
-- Privacy: each restaurant can link its own privacy policy on the QR menu,
-- and old personal details are cleaned up automatically (names, notes, tickets).
alter table public.restaurants add column if not exists privacy_url text;

create or replace function public.get_public_menu(p_table_token text default null, p_slug text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.restaurants; tb public.dining_tables;
begin
  if coalesce(p_table_token, '') <> '' then
    select * into tb from public.dining_tables where token = p_table_token and active;
    if not found then raise exception 'table_not_found'; end if;
    select * into r from public.restaurants where id = tb.restaurant_id;
  else
    select * into r from public.restaurants where slug = lower(coalesce(p_slug, ''));
  end if;
  if r.id is null or not r.active then raise exception 'restaurant_unavailable'; end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'currency', r.currency,
      'default_lang', r.default_lang, 'welcome_es', r.welcome_es, 'welcome_en', r.welcome_en,
      'logo_url', r.logo_url, 'cover_url', r.cover_url, 'menu_theme', r.menu_theme, 'accent_color', r.accent_color,
      'google_review_url', r.google_review_url, 'privacy_url', r.privacy_url, 'timezone', r.timezone,
      'hours_enabled', r.hours_enabled, 'hours', r.hours,
      'is_open', public.restaurant_is_open(r.hours_enabled, r.hours, r.timezone),
      'is_paused', public.restaurant_is_paused(r), 'paused_until', r.paused_until),
    'table', case when tb.id is null then null
                  else jsonb_build_object('label', tb.label, 'token', tb.token) end,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name_es', c.name_es, 'name_en', c.name_en,
                                          'station', c.station) order by c.sort, c.created_at)
      from public.categories c where c.restaurant_id = r.id and c.active), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'category_id', i.category_id, 'name_es', i.name_es, 'name_en', i.name_en,
        'desc_es', i.desc_es, 'desc_en', i.desc_en, 'price_cents', i.price_cents,
        'image_url', i.image_url, 'allergens', to_jsonb(i.allergens), 'options', i.options,
        'sold_out', i.sold_out, 'featured', i.featured) order by c.sort, i.sort, i.created_at)
      from public.items i join public.categories c on c.id = i.category_id
      where i.restaurant_id = r.id and i.active and c.active), '[]'::jsonb)
  );
end $$;

-- What is kept, and for how long (matches the privacy policy):
--   customer name + order note ........ 30 days, then blanked (the order stays for sales stats)
--   printed tickets, waiter calls ..... 30 days
--   orders (without name/notes) ....... 24 months
--   solved support requests ........... 24 months
create or replace function public.purge_old_order_data()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a int; b int; c int; d int; e int;
begin
  update public.orders
     set customer_name = '', note = '',
         lines = (select coalesce(jsonb_agg(l || '{"note": ""}'::jsonb), '[]'::jsonb) from jsonb_array_elements(lines) l)
   where created_at < now() - interval '30 days'
     and (customer_name <> '' or note <> '' or jsonb_path_exists(lines, '$[*] ? (@.note != "")'));
  get diagnostics a = row_count;
  delete from public.print_jobs where created_at < now() - interval '30 days';
  get diagnostics b = row_count;
  delete from public.service_requests where created_at < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from public.orders where created_at < now() - interval '24 months';
  get diagnostics d = row_count;
  delete from public.support_tickets where status = 'resolved' and resolved_at < now() - interval '24 months';
  get diagnostics e = row_count;
  return jsonb_build_object('orders_cleaned', a, 'tickets_deleted', b, 'calls_deleted', c, 'orders_deleted', d, 'support_deleted', e);
end $$;
revoke all on function public.purge_old_order_data() from public, anon, authenticated;
grant execute on function public.purge_old_order_data() to service_role;

-- Run the clean-up every night at 04:20 (Supabase's built-in scheduler, free plan included).
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'farol-privacy-cleanup';
  perform cron.schedule('farol-privacy-cleanup', '20 4 * * *', 'select public.purge_old_order_data()');
exception when others then
  raise notice 'Nightly clean-up not scheduled (%). Turn on pg_cron under Database → Extensions and run this file again.', sqlerrm;
end $$;

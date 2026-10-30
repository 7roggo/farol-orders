-- Farol Orders — complete database setup. Paste all of this into Supabase → SQL Editor → Run (once).
-- Generated from supabase/migrations by tools/build-setup.mjs.

-- >>> 0001_farol_orders.sql
-- =====================================================================
-- Farol Orders — database for Supabase
-- Run once: Supabase dashboard → SQL Editor → paste this file → Run.
-- Then run 0002_sample_menu.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.random_token() returns text
language sql volatile as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.restaurants (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name              text not null check (length(name) between 1 and 80),
  active            boolean not null default true,          -- Farol can switch a restaurant off
  timezone          text not null default 'Europe/Madrid',
  currency          text not null default 'EUR',
  default_lang      text not null default 'es' check (default_lang in ('es','en')),
  welcome_es        text not null default '',
  welcome_en        text not null default '',
  logo_url          text,
  accent_color      text not null default '#2F5D50' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  google_review_url text,
  hours_enabled     boolean not null default false,          -- false = always open
  hours             jsonb not null default '{}'::jsonb,      -- {"1":[["12:30","16:30"],["20:00","00:30"]], ... } 1 = Monday
  ordering_paused   boolean not null default false,
  paused_until      timestamptz,
  created_at        timestamptz not null default now()
);

create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'staff' check (role in ('owner','staff')),
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index on public.restaurant_members(user_id);

create table public.restaurant_invites (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email         text not null check (email = lower(email) and position('@' in email) > 1),
  role          text not null default 'staff' check (role in ('owner','staff')),
  created_at    timestamptz not null default now(),
  primary key (restaurant_id, email)
);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name_es       text not null default '',
  name_en       text not null default '',
  station       text not null default 'kitchen' check (station in ('kitchen','bar')),
  sort          int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (id, restaurant_id)
);
create index on public.categories(restaurant_id, sort);

create table public.items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid not null,
  name_es       text not null default '',
  name_en       text not null default '',
  desc_es       text not null default '',
  desc_en       text not null default '',
  price_cents   int  not null default 0 check (price_cents between 0 and 1000000),
  image_url     text,
  allergens     text[] not null default '{}' check (allergens <@ array[
                  'gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts',
                  'celery','mustard','sesame','sulphites','lupin','molluscs']::text[]),
  options       jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sold_out      boolean not null default false,
  active        boolean not null default true,
  sort          int  not null default 0,
  created_at    timestamptz not null default now(),
  foreign key (category_id, restaurant_id) references public.categories(id, restaurant_id) on delete cascade
);
create index on public.items(restaurant_id, category_id, sort);

create table public.dining_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label         text not null check (length(label) between 1 and 30),
  token         text not null unique default public.random_token(),
  sort          int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on public.dining_tables(restaurant_id, sort);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid references public.dining_tables(id) on delete set null,
  table_label    text not null default '',
  number         int  not null,
  local_date     date not null,
  status         text not null default 'pending'
                 check (status in ('pending','accepted','ready','completed','declined')),
  decline_reason text,
  note           text not null default '',
  customer_name  text not null default '',
  lang           text not null default 'es',
  lines          jsonb not null,
  total_cents    int  not null,
  client_token   uuid not null default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  ready_at       timestamptz,
  completed_at   timestamptz,
  declined_at    timestamptz
);
create index on public.orders(restaurant_id, created_at desc);
create index on public.orders(table_id, created_at desc);
create unique index on public.orders(restaurant_id, local_date, number);

create table public.service_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid references public.dining_tables(id) on delete set null,
  table_label   text not null default '',
  kind          text not null check (kind in ('waiter','bill')),
  status        text not null default 'open' check (status in ('open','done')),
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
create index on public.service_requests(restaurant_id, status, created_at desc);

create table public.printers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  kind          text not null check (kind in ('browser','star','epson')),
  station       text not null default 'all' check (station in ('kitchen','bar','all')),
  paper_mm      int  not null default 80 check (paper_mm in (58, 80)),
  key           text not null unique default (public.random_token() || public.random_token()),
  active        boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.printers(restaurant_id);

create table public.print_jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  printer_id    uuid not null references public.printers(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete cascade,
  station       text not null default 'all',
  ticket        jsonb not null,
  status        text not null default 'queued' check (status in ('queued','sent','printed','failed')),
  attempts      int  not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  printed_at    timestamptz
);
create index on public.print_jobs(printer_id, status, created_at);
create index on public.print_jobs(restaurant_id, created_at desc);

-- ---------------------------------------------------------------------
-- Who can do what
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.member_role(rid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.is_platform_admin() then 'owner'
    else (select role from public.restaurant_members
          where restaurant_id = rid and user_id = auth.uid())
  end;
$$;

create or replace function public.is_member(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(rid) is not null;
$$;

create or replace function public.is_owner(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(rid) = 'owner', false);
$$;

-- ---------------------------------------------------------------------
-- Opening hours
-- ---------------------------------------------------------------------
create or replace function public.valid_hours(h jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; r jsonb;
begin
  if jsonb_typeof(h) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(h) loop
    if k not in ('1','2','3','4','5','6','7') then return false; end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 3 then return false; end if;
    for r in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2 then return false; end if;
      if coalesce(r->>0, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(r->>1, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

alter table public.restaurants add constraint restaurants_hours_valid check (public.valid_hours(hours));

-- A range like ["20:00","00:30"] runs past midnight into the next day.
create or replace function public.restaurant_is_open(p_enabled boolean, p_hours jsonb, p_tz text, p_at timestamptz default now())
returns boolean language plpgsql stable as $$
declare
  loc  timestamp := p_at at time zone p_tz;
  t    time := loc::time;
  d    int  := extract(isodow from loc)::int;
  prev int  := case when d = 1 then 7 else d - 1 end;
  r jsonb; o time; c time;
begin
  if not p_enabled then return true; end if;
  for r in select * from jsonb_array_elements(coalesce(p_hours -> d::text, '[]'::jsonb)) loop
    o := (r->>0)::time; c := (r->>1)::time;
    if c > o then
      if t >= o and t < c then return true; end if;
    elsif t >= o then
      return true;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_hours -> prev::text, '[]'::jsonb)) loop
    o := (r->>0)::time; c := (r->>1)::time;
    if c <= o and t < c then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.restaurant_is_paused(r public.restaurants) returns boolean
language sql stable as $$
  select r.ordering_paused or coalesce(r.paused_until > now(), false);
$$;

-- Only Farol (platform admins) can change slug or switch a restaurant on/off.
create or replace function public.restaurants_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_platform_admin() then
    new.active := old.active;
    new.slug   := old.slug;
  end if;
  perform now() at time zone new.timezone;   -- raises if the timezone name is invalid
  return new;
end $$;
create trigger restaurants_guard before insert or update on public.restaurants
  for each row execute function public.restaurants_guard();

-- ---------------------------------------------------------------------
-- Printing: create a ticket per printer when an order is accepted
-- ---------------------------------------------------------------------
create or replace function public.create_print_jobs(p_order_id uuid, p_printer_id uuid default null, p_reprint boolean default false)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders; r public.restaurants; p public.printers;
  sel jsonb; n int := 0;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return 0; end if;
  select * into r from public.restaurants where id = o.restaurant_id;
  for p in
    select * from public.printers
    where restaurant_id = o.restaurant_id and active
      and (p_printer_id is null or id = p_printer_id)
  loop
    select coalesce(jsonb_agg(l), '[]'::jsonb) into sel
    from jsonb_array_elements(o.lines) l
    where p.station = 'all' or l->>'station' = p.station;
    if jsonb_array_length(sel) > 0 then
      insert into public.print_jobs (restaurant_id, printer_id, order_id, station, ticket)
      values (o.restaurant_id, p.id, o.id, p.station, jsonb_build_object(
        'kind', 'order',
        'restaurant', r.name,
        'number', o.number,
        'table', o.table_label,
        'station', p.station,
        'time', to_char(o.created_at at time zone r.timezone, 'HH24:MI'),
        'date', to_char(o.created_at at time zone r.timezone, 'DD/MM/YYYY'),
        'lines', sel,
        'other_station_lines', jsonb_array_length(o.lines) - jsonb_array_length(sel),
        'note', o.note,
        'customer_name', o.customer_name,
        'reprint', p_reprint,
        'paper_mm', p.paper_mm
      ));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.orders_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    perform public.create_print_jobs(new.id, null, false);
  end if;
  return new;
end $$;
create trigger orders_after_update after update of status on public.orders
  for each row execute function public.orders_after_update();

-- ---------------------------------------------------------------------
-- Customer-facing functions (no login needed)
-- ---------------------------------------------------------------------
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
      'logo_url', r.logo_url, 'accent_color', r.accent_color,
      'google_review_url', r.google_review_url, 'timezone', r.timezone,
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
        'sold_out', i.sold_out) order by i.sort, i.created_at)
      from public.items i join public.categories c on c.id = i.category_id
      where i.restaurant_id = r.id and i.active and c.active), '[]'::jsonb)
  );
end $$;

-- p_lines: [{ "item_id": uuid, "qty": 2, "choices": ["choice-id", ...], "note": "no onion" }]
-- Prices are always recalculated here, never trusted from the browser.
create or replace function public.place_order(
  p_table_token text, p_lines jsonb, p_note text default '', p_lang text default 'es',
  p_customer_name text default '')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  tb public.dining_tables; r public.restaurants; it public.items; cat public.categories;
  ln jsonb; grp jsonb; ch jsonb; chosen jsonb;
  cnt int; matched int; qty int; unit int; total int := 0;
  out_lines jsonb := '[]'::jsonb; out_opts jsonb;
  v_number int; v_date date; o public.orders;
begin
  select * into tb from public.dining_tables where token = p_table_token and active;
  if not found then raise exception 'table_not_found'; end if;
  select * into r from public.restaurants where id = tb.restaurant_id;
  if not r.active then raise exception 'restaurant_unavailable'; end if;
  if public.restaurant_is_paused(r) then raise exception 'ordering_paused'; end if;
  if not public.restaurant_is_open(r.hours_enabled, r.hours, r.timezone) then
    raise exception 'restaurant_closed';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_order';
  end if;
  if jsonb_array_length(p_lines) > 40 then raise exception 'order_too_large'; end if;

  -- Simple protection against spam / prank orders
  select count(*) into cnt from public.orders
   where table_id = tb.id and created_at > now() - interval '2 minutes';
  if cnt >= 3 then raise exception 'too_many_orders'; end if;
  select count(*) into cnt from public.orders where table_id = tb.id and status = 'pending';
  if cnt >= 4 then raise exception 'too_many_orders'; end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    select * into it from public.items
     where id = (ln->>'item_id')::uuid and restaurant_id = r.id and active;
    if not found then raise exception 'menu_changed'; end if;
    select * into cat from public.categories where id = it.category_id;
    if not cat.active then raise exception 'menu_changed'; end if;
    if it.sold_out then raise exception 'item_sold_out' using detail = it.id::text; end if;

    qty := coalesce((ln->>'qty')::int, 1);
    if qty < 1 or qty > 30 then raise exception 'invalid_quantity'; end if;

    chosen := coalesce(ln->'choices', '[]'::jsonb);
    if jsonb_typeof(chosen) <> 'array' then raise exception 'menu_changed'; end if;
    unit := it.price_cents; out_opts := '[]'::jsonb; matched := 0;

    for grp in select * from jsonb_array_elements(it.options) loop
      cnt := 0;
      for ch in select * from jsonb_array_elements(coalesce(grp->'choices', '[]'::jsonb)) loop
        if chosen ? (ch->>'id') then
          cnt := cnt + 1;
          unit := unit + coalesce((ch->>'price_cents')::int, 0);
          out_opts := out_opts || jsonb_build_object(
            'group_es', coalesce(grp->>'name_es', ''), 'group_en', coalesce(grp->>'name_en', ''),
            'name_es', coalesce(ch->>'name_es', ''), 'name_en', coalesce(ch->>'name_en', ''),
            'price_cents', coalesce((ch->>'price_cents')::int, 0));
        end if;
      end loop;
      matched := matched + cnt;
      if coalesce((grp->>'required')::boolean, false) and cnt = 0 then
        raise exception 'option_required' using detail = it.id::text;
      end if;
      if not coalesce((grp->>'multi')::boolean, false) and cnt > 1 then
        raise exception 'menu_changed';
      end if;
    end loop;
    if matched <> jsonb_array_length(chosen) then raise exception 'menu_changed'; end if;

    out_lines := out_lines || jsonb_build_object(
      'item_id', it.id, 'name_es', it.name_es, 'name_en', it.name_en,
      'qty', qty, 'unit_cents', unit, 'line_cents', unit * qty,
      'options', out_opts, 'note', left(btrim(coalesce(ln->>'note', '')), 140),
      'station', cat.station);
    total := total + unit * qty;
  end loop;

  -- Order numbers restart at 1 every day (restaurant's local date)
  perform pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
  v_date := (now() at time zone r.timezone)::date;
  select coalesce(max(number), 0) + 1 into v_number
    from public.orders where restaurant_id = r.id and local_date = v_date;

  insert into public.orders (restaurant_id, table_id, table_label, number, local_date,
                             note, customer_name, lang, lines, total_cents)
  values (r.id, tb.id, tb.label, v_number, v_date,
          left(btrim(coalesce(p_note, '')), 300), left(btrim(coalesce(p_customer_name, '')), 40),
          case when p_lang in ('es','en') then p_lang else 'es' end, out_lines, total)
  returning * into o;

  return jsonb_build_object('order_id', o.id, 'client_token', o.client_token,
                            'number', o.number, 'total_cents', o.total_cents);
end $$;

create or replace function public.get_order_status(p_order_id uuid, p_client_token uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.orders; r public.restaurants;
begin
  select * into o from public.orders where id = p_order_id and client_token = p_client_token;
  if not found then raise exception 'order_not_found'; end if;
  select * into r from public.restaurants where id = o.restaurant_id;
  return jsonb_build_object(
    'order_id', o.id, 'number', o.number, 'status', o.status, 'decline_reason', o.decline_reason,
    'lines', o.lines, 'total_cents', o.total_cents, 'note', o.note, 'table_label', o.table_label,
    'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
    'google_review_url', r.google_review_url, 'restaurant_name', r.name, 'currency', r.currency);
end $$;

create or replace function public.request_service(p_table_token text, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare tb public.dining_tables; r public.restaurants; existing uuid; cnt int; v_id uuid;
begin
  if p_kind not in ('waiter','bill') then raise exception 'invalid_request'; end if;
  select * into tb from public.dining_tables where token = p_table_token and active;
  if not found then raise exception 'table_not_found'; end if;
  select * into r from public.restaurants where id = tb.restaurant_id;
  if not r.active then raise exception 'restaurant_unavailable'; end if;

  select id into existing from public.service_requests
   where table_id = tb.id and kind = p_kind and status = 'open'
     and created_at > now() - interval '15 minutes'
   limit 1;
  if existing is not null then
    return jsonb_build_object('id', existing, 'duplicate', true);
  end if;
  select count(*) into cnt from public.service_requests
   where table_id = tb.id and created_at > now() - interval '10 minutes';
  if cnt >= 6 then raise exception 'too_many_requests'; end if;

  insert into public.service_requests (restaurant_id, table_id, table_label, kind)
  values (r.id, tb.id, tb.label, p_kind) returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------
-- Hub functions (restaurant staff, logged in)
-- ---------------------------------------------------------------------
create or replace function public.my_restaurants()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'slug', r.slug, 'name', r.name, 'active', r.active,
           'role', public.member_role(r.id)) order by r.name), '[]'::jsonb)
  from public.restaurants r
  where public.is_platform_admin()
     or exists (select 1 from public.restaurant_members m
                where m.restaurant_id = r.id and m.user_id = auth.uid());
$$;

-- Turns e-mail invites into memberships after the person signs up / logs in.
create or replace function public.claim_invites()
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_email text; n int;
begin
  select lower(email) into v_email from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  insert into public.restaurant_members (restaurant_id, user_id, role)
  select restaurant_id, auth.uid(), role from public.restaurant_invites where email = v_email
  on conflict (restaurant_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.restaurant_invites where email = v_email;
  return n;
end $$;

create or replace function public.set_order_status(p_order_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o public.orders; ok boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not public.is_member(o.restaurant_id) then raise exception 'not_allowed'; end if;
  ok := case o.status
    when 'pending'   then p_status in ('accepted','declined')
    when 'accepted'  then p_status in ('ready','completed','declined')
    when 'ready'     then p_status in ('completed','accepted')
    when 'completed' then p_status in ('ready')
    else false end;
  if not ok then raise exception 'invalid_status_change'; end if;

  update public.orders set
    status         = p_status,
    decline_reason = case when p_status = 'declined' then left(coalesce(p_reason, ''), 140) else decline_reason end,
    accepted_at    = case when p_status = 'accepted' and accepted_at is null then now() else accepted_at end,
    ready_at       = case when p_status = 'ready' then now() when p_status = 'accepted' then null else ready_at end,
    completed_at   = case when p_status = 'completed' then now() when p_status = 'ready' then null else completed_at end,
    declined_at    = case when p_status = 'declined' then now() else declined_at end
  where id = p_order_id returning * into o;
  return to_jsonb(o);
end $$;

create or replace function public.reprint_order(p_order_id uuid, p_printer_id uuid default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.orders where id = p_order_id;
  if rid is null or not public.is_member(rid) then raise exception 'not_allowed'; end if;
  return public.create_print_jobs(p_order_id, p_printer_id, true);
end $$;

create or replace function public.test_print(p_printer_id uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare p public.printers; r public.restaurants; v_id uuid;
begin
  select * into p from public.printers where id = p_printer_id;
  if not found or not public.is_member(p.restaurant_id) then raise exception 'not_allowed'; end if;
  select * into r from public.restaurants where id = p.restaurant_id;
  insert into public.print_jobs (restaurant_id, printer_id, station, ticket)
  values (p.restaurant_id, p.id, p.station, jsonb_build_object(
    'kind', 'test', 'restaurant', r.name, 'printer', p.name, 'station', p.station,
    'time', to_char(now() at time zone r.timezone, 'HH24:MI'),
    'date', to_char(now() at time zone r.timezone, 'DD/MM/YYYY'), 'paper_mm', p.paper_mm))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.retry_print_job(p_job_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.print_jobs where id = p_job_id;
  if rid is null or not public.is_member(rid) then raise exception 'not_allowed'; end if;
  update public.print_jobs set status = 'queued', attempts = 0, error = null where id = p_job_id;
end $$;

create or replace function public.printer_heartbeat(p_printer_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.printers where id = p_printer_id;
  if rid is null or not public.is_member(rid) then raise exception 'not_allowed'; end if;
  update public.printers set last_seen_at = now() where id = p_printer_id;
end $$;

-- Pause ordering (any staff member). p_minutes: null = resume, 0 = until resumed, >0 = for that many minutes.
create or replace function public.set_ordering_pause(p_restaurant_id uuid, p_minutes int default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r public.restaurants;
begin
  if not public.is_member(p_restaurant_id) then raise exception 'not_allowed'; end if;
  update public.restaurants
     set ordering_paused = coalesce(p_minutes = 0, false),
         paused_until = case when p_minutes > 0 then now() + make_interval(mins => least(p_minutes, 1440)) else null end
   where id = p_restaurant_id returning * into r;
  return jsonb_build_object('ordering_paused', r.ordering_paused, 'paused_until', r.paused_until);
end $$;

create or replace function public.set_item_sold_out(p_item_id uuid, p_sold_out boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from public.items where id = p_item_id;
  if rid is null or not public.is_member(rid) then raise exception 'not_allowed'; end if;
  update public.items set sold_out = p_sold_out where id = p_item_id;
end $$;

-- Team
create or replace function public.invite_member(p_restaurant_id uuid, p_email text, p_role text default 'staff')
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email)); v_user uuid;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'not_allowed'; end if;
  if p_role not in ('owner','staff') then raise exception 'invalid_role'; end if;
  if position('@' in v_email) < 2 then raise exception 'invalid_email'; end if;
  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_user is not null then
    insert into public.restaurant_members (restaurant_id, user_id, role)
    values (p_restaurant_id, v_user, p_role)
    on conflict (restaurant_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  insert into public.restaurant_invites (restaurant_id, email, role)
  values (p_restaurant_id, v_email, p_role)
  on conflict (restaurant_id, email) do update set role = excluded.role;
  return 'invited';
end $$;

create or replace function public.list_team(p_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email,
                 'role', m.role) order by m.role, u.email)
               from public.restaurant_members m join auth.users u on u.id = m.user_id
               where m.restaurant_id = p_restaurant_id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role)
               order by i.email)
               from public.restaurant_invites i where i.restaurant_id = p_restaurant_id), '[]'::jsonb));
end $$;

create or replace function public.remove_member(p_restaurant_id uuid, p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare owners int; target_role text;
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'not_allowed'; end if;
  select role into target_role from public.restaurant_members
   where restaurant_id = p_restaurant_id and user_id = p_user_id;
  select count(*) into owners from public.restaurant_members
   where restaurant_id = p_restaurant_id and role = 'owner';
  if target_role = 'owner' and owners <= 1 then raise exception 'last_owner'; end if;
  delete from public.restaurant_members where restaurant_id = p_restaurant_id and user_id = p_user_id;
end $$;

create or replace function public.remove_invite(p_restaurant_id uuid, p_email text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_owner(p_restaurant_id) then raise exception 'not_allowed'; end if;
  delete from public.restaurant_invites where restaurant_id = p_restaurant_id and email = lower(p_email);
end $$;

-- ---------------------------------------------------------------------
-- Farol master admin
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'slug', r.slug, 'name', r.name, 'active', r.active, 'created_at', r.created_at,
      'owners', coalesce((select jsonb_agg(u.email) from public.restaurant_members m
                          join auth.users u on u.id = m.user_id
                          where m.restaurant_id = r.id and m.role = 'owner'), '[]'::jsonb),
      'pending_invites', coalesce((select jsonb_agg(i.email) from public.restaurant_invites i
                          where i.restaurant_id = r.id), '[]'::jsonb),
      'orders_30d', (select count(*) from public.orders o where o.restaurant_id = r.id
                     and o.created_at > now() - interval '30 days' and o.status <> 'declined'),
      'revenue_30d_cents', (select coalesce(sum(total_cents), 0) from public.orders o
                     where o.restaurant_id = r.id and o.created_at > now() - interval '30 days'
                     and o.status in ('accepted','ready','completed')),
      'last_order_at', (select max(created_at) from public.orders o where o.restaurant_id = r.id)
    ) order by r.created_at desc)
    from public.restaurants r), '[]'::jsonb);
end $$;

create or replace function public.admin_create_restaurant(
  p_name text, p_slug text, p_owner_email text default null, p_sample_menu boolean default true)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  insert into public.restaurants (name, slug) values (btrim(p_name), lower(btrim(p_slug)))
  returning id into v_id;
  if coalesce(btrim(p_owner_email), '') <> '' then
    perform public.invite_member(v_id, p_owner_email, 'owner');
  end if;
  if p_sample_menu then
    perform public.seed_sample_menu(v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Cloud printer functions — only the server (edge functions) may call these
-- ---------------------------------------------------------------------
create or replace function public.printer_poll(p_key text, p_kind text, p_limit int default 1)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.printers;
begin
  select * into p from public.printers where key = p_key and kind = p_kind and active;
  if not found then return null; end if;
  update public.printers set last_seen_at = now()
   where id = p.id and (last_seen_at is null or last_seen_at < now() - interval '15 seconds');
  -- a ticket that was sent but never confirmed goes back in the queue after 2 minutes
  update public.print_jobs set status = 'queued'
   where printer_id = p.id and status = 'sent' and sent_at < now() - interval '2 minutes';
  return jsonb_build_object(
    'printer', jsonb_build_object('id', p.id, 'name', p.name, 'paper_mm', p.paper_mm),
    'jobs', coalesce((select jsonb_agg(j order by j.created_at) from (
              select id, ticket, created_at from public.print_jobs
              where printer_id = p.id and status = 'queued'
                and created_at > now() - interval '6 hours'
              order by created_at limit greatest(p_limit, 1)) j), '[]'::jsonb));
end $$;

create or replace function public.printer_take_job(p_key text, p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare j public.print_jobs;
begin
  update public.print_jobs pj set status = 'sent', sent_at = now(), attempts = attempts + 1
    from public.printers p
   where pj.printer_id = p.id and p.key = p_key
     and (p_job_id is null and pj.id = (select id from public.print_jobs
                                         where printer_id = p.id and status = 'queued'
                                         order by created_at limit 1)
          or pj.id = p_job_id and pj.status in ('queued','sent'))
  returning pj.* into j;
  if j.id is null then return null; end if;
  return jsonb_build_object('id', j.id, 'ticket', j.ticket);
end $$;

create or replace function public.printer_job_result(p_key text, p_job_id uuid, p_ok boolean, p_error text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_printer uuid; v_job uuid;
begin
  select id into v_printer from public.printers where key = p_key;
  if v_printer is null then return; end if;
  v_job := p_job_id;
  if v_job is null then  -- older firmware without job tokens: the last ticket sent
    select id into v_job from public.print_jobs
     where printer_id = v_printer and status = 'sent' order by sent_at desc limit 1;
  end if;
  if p_ok then
    update public.print_jobs set status = 'printed', printed_at = now(), error = null
     where id = v_job and printer_id = v_printer;
  else
    update public.print_jobs
       set status = case when attempts >= 4 then 'failed' else 'queued' end,
           error = left(coalesce(p_error, 'error'), 200)
     where id = v_job and printer_id = v_printer;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.restaurants        enable row level security;
alter table public.platform_admins    enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.restaurant_invites enable row level security;
alter table public.categories         enable row level security;
alter table public.items              enable row level security;
alter table public.dining_tables      enable row level security;
alter table public.orders             enable row level security;
alter table public.service_requests   enable row level security;
alter table public.printers           enable row level security;
alter table public.print_jobs         enable row level security;

create policy "restaurants: members read"   on public.restaurants for select to authenticated using (public.is_member(id));
create policy "restaurants: owners update"  on public.restaurants for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy "restaurants: admins insert"  on public.restaurants for insert to authenticated with check (public.is_platform_admin());
create policy "restaurants: admins delete"  on public.restaurants for delete to authenticated using (public.is_platform_admin());

create policy "admins: read self" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy "members: read" on public.restaurant_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(restaurant_id));

create policy "categories: members read"  on public.categories for select to authenticated using (public.is_member(restaurant_id));
create policy "categories: owners insert" on public.categories for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "categories: owners update" on public.categories for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "categories: owners delete" on public.categories for delete to authenticated using (public.is_owner(restaurant_id));

create policy "items: members read"  on public.items for select to authenticated using (public.is_member(restaurant_id));
create policy "items: owners insert" on public.items for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "items: owners update" on public.items for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "items: owners delete" on public.items for delete to authenticated using (public.is_owner(restaurant_id));

create policy "tables: members read"  on public.dining_tables for select to authenticated using (public.is_member(restaurant_id));
create policy "tables: owners insert" on public.dining_tables for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "tables: owners update" on public.dining_tables for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "tables: owners delete" on public.dining_tables for delete to authenticated using (public.is_owner(restaurant_id));

create policy "orders: members read" on public.orders for select to authenticated using (public.is_member(restaurant_id));

create policy "requests: members read"   on public.service_requests for select to authenticated using (public.is_member(restaurant_id));
create policy "requests: members update" on public.service_requests for update to authenticated using (public.is_member(restaurant_id)) with check (public.is_member(restaurant_id));

create policy "printers: members read"  on public.printers for select to authenticated using (public.is_member(restaurant_id));
create policy "printers: owners insert" on public.printers for insert to authenticated with check (public.is_owner(restaurant_id));
create policy "printers: owners update" on public.printers for update to authenticated using (public.is_owner(restaurant_id)) with check (public.is_owner(restaurant_id));
create policy "printers: owners delete" on public.printers for delete to authenticated using (public.is_owner(restaurant_id));

create policy "jobs: members read"   on public.print_jobs for select to authenticated using (public.is_member(restaurant_id));
create policy "jobs: members update" on public.print_jobs for update to authenticated using (public.is_member(restaurant_id)) with check (public.is_member(restaurant_id));

-- ---------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------
revoke execute on function public.create_print_jobs(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.printer_poll(text, text, int)           from public, anon, authenticated;
revoke execute on function public.printer_take_job(text, uuid)            from public, anon, authenticated;
revoke execute on function public.printer_job_result(text, uuid, boolean, text) from public, anon, authenticated;
grant  execute on function public.printer_poll(text, text, int)           to service_role;
grant  execute on function public.printer_take_job(text, uuid)            to service_role;
grant  execute on function public.printer_job_result(text, uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------
-- Live updates for the hub
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.orders, public.service_requests, public.print_jobs, public.printers;

-- ---------------------------------------------------------------------
-- Menu photos (public bucket, owners upload into their restaurant's folder)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "menu images: owners upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy "menu images: owners update" on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_owner(((storage.foldername(name))[1])::uuid));
create policy "menu images: owners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_owner(((storage.foldername(name))[1])::uuid));

-- >>> 0002_sample_menu.sql
-- Generated by tools/build-seed.mjs from assets/js/core/sample-menu.js — do not edit by hand.
-- Adds the sample menu (and tables) to a restaurant. Farol admin can tick "sample menu" when creating one.
create or replace function public.seed_sample_menu(p_restaurant_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_cat uuid;
begin
  if exists (select 1 from public.categories where restaurant_id = p_restaurant_id) then return; end if;
  insert into public.categories (restaurant_id, name_es, name_en, station, sort)
  values (p_restaurant_id, 'Para picar', 'To share', 'kitchen', 0) returning id into v_cat;
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Croquetas de jamón ibérico', 'Iberian ham croquettes', 'Cremosas, hechas en casa cada mañana.', 'Creamy, made in house every morning.', 600, array['gluten','milk','eggs']::text[], '[{"id":"size","name_es":"Tamaño","name_en":"Size","required":true,"multi":false,"choices":[{"id":"half","name_es":"Media ración (4 uds)","name_en":"Half portion (4 pcs)","price_cents":0},{"id":"full","name_es":"Ración (8 uds)","name_en":"Full portion (8 pcs)","price_cents":450}]}]'::jsonb, 0);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Patatas bravas', 'Patatas bravas', 'Patata frita con nuestra salsa brava.', 'Fried potatoes with our spicy brava sauce.', 550, array['eggs']::text[], '[{"id":"sauce","name_es":"Salsa","name_en":"Sauce","required":true,"multi":false,"choices":[{"id":"brava","name_es":"Brava picante","name_en":"Spicy brava","price_cents":0},{"id":"alioli","name_es":"Alioli","name_en":"Garlic alioli","price_cents":0},{"id":"mix","name_es":"Mitad y mitad","name_en":"Half and half","price_cents":0}]}]'::jsonb, 1);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Pimientos de Padrón', 'Padrón peppers', 'Unos pican y otros no.', 'Some are hot, some are not.', 600, array[]::text[], '[]'::jsonb, 2);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Pan con tomate', 'Bread with tomato', 'Pan tostado, tomate rallado y aceite de oliva virgen extra.', 'Toasted bread, grated tomato and extra virgin olive oil.', 350, array['gluten']::text[], '[{"id":"extras","name_es":"Extras","name_en":"Extras","required":false,"multi":true,"choices":[{"id":"ham","name_es":"Jamón ibérico","name_en":"Iberian ham","price_cents":300},{"id":"anchovy","name_es":"Anchoas","name_en":"Anchovies","price_cents":250}]}]'::jsonb, 3);
  insert into public.categories (restaurant_id, name_es, name_en, station, sort)
  values (p_restaurant_id, 'Platos', 'Mains', 'kitchen', 1) returning id into v_cat;
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Tortilla de patatas', 'Spanish omelette', 'La de toda la vida.', 'Classic potato omelette.', 700, array['eggs']::text[], '[{"id":"style","name_es":"Punto","name_en":"How cooked","required":true,"multi":false,"choices":[{"id":"runny","name_es":"Jugosa","name_en":"Runny","price_cents":0},{"id":"done","name_es":"Hecha","name_en":"Well done","price_cents":0}]},{"id":"onion","name_es":"Cebolla","name_en":"Onion","required":true,"multi":false,"choices":[{"id":"with","name_es":"Con cebolla","name_en":"With onion","price_cents":0},{"id":"without","name_es":"Sin cebolla","name_en":"Without onion","price_cents":0}]}]'::jsonb, 0);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Pulpo a la gallega', 'Galician-style octopus', 'Con patata cocida, pimentón y aceite.', 'With boiled potato, paprika and olive oil.', 1650, array['molluscs']::text[], '[]'::jsonb, 1);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Gambas al ajillo', 'Garlic prawns', 'En cazuela de barro, con guindilla.', 'Sizzling in a clay pot with chilli.', 1200, array['crustaceans']::text[], '[]'::jsonb, 2);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Secreto ibérico', 'Iberian pork secreto', 'A la brasa, con sal en escamas.', 'Chargrilled, with flaky salt.', 1500, array[]::text[], '[{"id":"side","name_es":"Guarnición","name_en":"Side","required":true,"multi":false,"choices":[{"id":"fries","name_es":"Patatas fritas","name_en":"Fries","price_cents":0},{"id":"salad","name_es":"Ensalada","name_en":"Salad","price_cents":0},{"id":"padron","name_es":"Pimientos de Padrón","name_en":"Padrón peppers","price_cents":150}]}]'::jsonb, 3);
  insert into public.categories (restaurant_id, name_es, name_en, station, sort)
  values (p_restaurant_id, 'Postres', 'Desserts', 'kitchen', 2) returning id into v_cat;
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Tarta de queso', 'Baked cheesecake', 'Cremosa por dentro.', 'Soft and creamy in the middle.', 600, array['milk','eggs','gluten']::text[], '[]'::jsonb, 0);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Churros con chocolate', 'Churros with hot chocolate', '', '', 550, array['gluten','milk']::text[], '[]'::jsonb, 1);
  insert into public.categories (restaurant_id, name_es, name_en, station, sort)
  values (p_restaurant_id, 'Bebidas', 'Drinks', 'bar', 3) returning id into v_cat;
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Cerveza de barril', 'Draught beer', '', '', 250, array['gluten']::text[], '[{"id":"size","name_es":"Tamaño","name_en":"Size","required":true,"multi":false,"choices":[{"id":"cana","name_es":"Caña (20 cl)","name_en":"Small (20 cl)","price_cents":0},{"id":"doble","name_es":"Doble (40 cl)","name_en":"Large (40 cl)","price_cents":150}]}]'::jsonb, 0);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Vermut de grifo', 'House vermouth', 'Con hielo y naranja.', 'With ice and orange.', 350, array['sulphites']::text[], '[]'::jsonb, 1);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Vino tinto (copa)', 'Red wine (glass)', '', '', 380, array['sulphites']::text[], '[{"id":"wine","name_es":"Vino","name_en":"Wine","required":true,"multi":false,"choices":[{"id":"rioja","name_es":"Rioja crianza","name_en":"Rioja crianza","price_cents":0},{"id":"ribera","name_es":"Ribera del Duero","name_en":"Ribera del Duero","price_cents":70}]}]'::jsonb, 2);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Tinto de verano', 'Tinto de verano', 'Vino tinto con gaseosa.', 'Red wine with lemon soda.', 350, array['sulphites']::text[], '[]'::jsonb, 3);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Agua mineral', 'Mineral water', '', '', 200, array[]::text[], '[{"id":"type","name_es":"Tipo","name_en":"Type","required":true,"multi":false,"choices":[{"id":"still","name_es":"Sin gas","name_en":"Still","price_cents":0},{"id":"sparkling","name_es":"Con gas","name_en":"Sparkling","price_cents":30}]}]'::jsonb, 4);
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Refresco', 'Soft drink', '', '', 280, array[]::text[], '[{"id":"drink","name_es":"Elige","name_en":"Choose","required":true,"multi":false,"choices":[{"id":"cola","name_es":"Cola","name_en":"Cola","price_cents":0},{"id":"cola-zero","name_es":"Cola zero","name_en":"Cola zero","price_cents":0},{"id":"orange","name_es":"Naranja","name_en":"Orange","price_cents":0},{"id":"lemon","name_es":"Limón","name_en":"Lemon","price_cents":0}]}]'::jsonb, 5);
  insert into public.categories (restaurant_id, name_es, name_en, station, sort)
  values (p_restaurant_id, 'Cafés', 'Coffee', 'bar', 4) returning id into v_cat;
  insert into public.items (restaurant_id, category_id, name_es, name_en, desc_es, desc_en, price_cents, allergens, options, sort)
  values (p_restaurant_id, v_cat, 'Café', 'Coffee', '', '', 180, array['milk']::text[], '[{"id":"type","name_es":"Tipo","name_en":"Type","required":true,"multi":false,"choices":[{"id":"solo","name_es":"Solo","name_en":"Espresso","price_cents":0},{"id":"cortado","name_es":"Cortado","name_en":"Cortado","price_cents":0},{"id":"leche","name_es":"Con leche","name_en":"White coffee","price_cents":30}]},{"id":"milk","name_es":"Leche","name_en":"Milk","required":false,"multi":false,"choices":[{"id":"whole","name_es":"Entera","name_en":"Whole","price_cents":0},{"id":"skimmed","name_es":"Desnatada","name_en":"Skimmed","price_cents":0},{"id":"oat","name_es":"De avena","name_en":"Oat","price_cents":40}]}]'::jsonb, 0);
  if not exists (select 1 from public.dining_tables where restaurant_id = p_restaurant_id) then
    insert into public.dining_tables (restaurant_id, label, sort)
    select p_restaurant_id, t.label, t.ord::int - 1 from unnest(array['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 8', 'Terraza 1', 'Terraza 2', 'Terraza 3', 'Terraza 4', 'Barra']) with ordinality as t(label, ord);
  end if;
end $$;

revoke execute on function public.seed_sample_menu(uuid) from public, anon, authenticated;

-- >>> 0003_farol_admins.sql
-- Farol admins by e-mail: whoever signs up (and confirms) with an e-mail on this list
-- becomes a Farol admin automatically. Change or add e-mails below before running.
create table if not exists public.platform_admin_emails (
  email text primary key check (email = lower(email))
);
alter table public.platform_admin_emails enable row level security;   -- no policies: the app can't read it

insert into public.platform_admin_emails (email) values
  ('james.bernarddxb@gmail.com')
on conflict do nothing;

-- Same as before, plus: grant Farol admin to listed e-mails.
create or replace function public.claim_invites()
returns int language plpgsql volatile security definer set search_path = public as $$
declare v_email text; n int;
begin
  select lower(email) into v_email from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  if exists (select 1 from public.platform_admin_emails where email = v_email) then
    insert into public.platform_admins (user_id) values (auth.uid()) on conflict do nothing;
  end if;
  insert into public.restaurant_members (restaurant_id, user_id, role)
  select restaurant_id, auth.uid(), role from public.restaurant_invites where email = v_email
  on conflict (restaurant_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.restaurant_invites where email = v_email;
  return n;
end $$;

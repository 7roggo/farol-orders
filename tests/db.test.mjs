// Runs the real migrations in an in-memory Postgres (PGlite) with small Supabase stand-ins.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const stub = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
`;
await db.exec(stub);
await db.exec(readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8'));

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ', msg); else { console.log('  FAIL', msg); fails++; } };
const as = async (uid) => db.query(`select set_config('test.uid', $1, false)`, [uid || '']);
const q1 = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const expectErr = async (sql, p, code, msg) => {
  try { await db.query(sql, p); ok(false, msg + ' (no error)'); }
  catch (e) { ok(String(e.message).includes(code), `${msg} → ${e.message}`); }
};

const admin = (await q1(`insert into auth.users(email) values ('james@farol.test') returning id`)).id;
await db.query(`insert into public.platform_admin_emails(email) values ('boss@farol.test')`);
const boss = (await q1(`insert into auth.users(email) values ('Boss@Farol.test') returning id`)).id;
await as(boss);
await db.query(`select public.claim_invites()`);
ok((await q1(`select count(*)::int n from platform_admins where user_id=$1`, [boss])).n === 1, 'listed e-mail becomes Farol admin on first login');
const owner = (await q1(`insert into auth.users(email) values ('lola@casalola.test') returning id`)).id;
const staff = (await q1(`insert into auth.users(email) values ('camarero@casalola.test') returning id`)).id;
const stranger0 = (await q1(`insert into auth.users(email) values ('nobody@else.test') returning id`)).id;
await db.query(`insert into public.platform_admins(user_id) values ($1)`, [admin]);

console.log('Admin creates restaurant');
await as(admin);
const rid = (await q1(`select public.admin_create_restaurant('Casa Lola','casa-lola','Lola@CasaLola.test', true) as id`)).id;
ok(rid, 'restaurant created');
const counts = await q1(`select (select count(*) from categories where restaurant_id=$1) c, (select count(*) from items where restaurant_id=$1) i, (select count(*) from dining_tables where restaurant_id=$1) t`, [rid]);
ok(counts.c == 5 && counts.i == 17 && counts.t == 13, `sample menu seeded ${JSON.stringify(counts)}`);
const look = await q1(`select r.cover_url, r.menu_theme, (select count(*)::int from items where restaurant_id=r.id and image_url is not null) photos,
  (select count(*)::int from items where restaurant_id=r.id and featured) feats from restaurants r where r.id=$1`, [rid]);
ok(look.cover_url && look.menu_theme === 'tasca' && look.photos === 9 && look.feats === 4, `menu look: ${JSON.stringify(look)}`);
await db.exec(readFileSync(new URL('../supabase/updates/update-01-menu-photos.sql', import.meta.url), 'utf8'));
ok((await q1(`select accent_color from restaurants where id=$1`, [rid])).accent_color === '#C8553D', 'update file runs on an existing database (twice) and brands Casa Lola');
ok((await q1(`select role from restaurant_members where user_id=$1`, [owner])).role === 'owner', 'existing user added directly as owner');

console.log('Non-admin cannot create restaurants');
await as(owner);
await expectErr(`select public.admin_create_restaurant('X','x-x')`, [], 'not_allowed', 'owner blocked');
ok((await q1(`select public.invite_member($1,'nuevo@casalola.test','staff') r`, [rid])).r === 'invited', 'invite unknown email');
ok((await q1(`select public.invite_member($1,'camarero@casalola.test','staff') r`, [rid])).r === 'added', 'add existing staff');
const team = (await q1(`select public.list_team($1) t`, [rid])).t;
ok(team.members.length === 2 && team.invites.length === 1, 'team listing');
await expectErr(`select public.remove_member($1,$2)`, [rid, owner], 'last_owner', 'cannot remove last owner');

console.log('Customer menu');
await as(null);
const tok = (await q1(`select token from dining_tables where restaurant_id=$1 and label='Mesa 3'`, [rid])).token;
const menu = (await q1(`select public.get_public_menu($1) m`, [tok])).m;
ok(menu.table.label === 'Mesa 3' && menu.items.length === 17 && menu.restaurant.is_open === true, 'menu by table token');
ok(menu.restaurant.cover_url && menu.items.some((i) => i.featured && i.image_url), 'public menu includes cover and featured photos');
await expectErr(`select public.get_public_menu('nope')`, [], 'table_not_found', 'bad token');

const byName = (n) => menu.items.find((i) => i.name_es === n);
const croq = byName('Croquetas de jamón ibérico'), cana = byName('Cerveza de barril'), pan = byName('Pan con tomate');
console.log('Place order');
const lines = [
  { item_id: croq.id, qty: 2, choices: ['full'], note: 'bien calientes' },
  { item_id: pan.id, qty: 1, choices: ['ham', 'anchovy'] },
  { item_id: cana.id, qty: 3, choices: ['cana'] },
];
const placed = (await q1(`select public.place_order($1,$2::jsonb,'Alergia a frutos secos','en','Ana') r`, [tok, JSON.stringify(lines)])).r;
const expected = 2 * (600 + 450) + (350 + 300 + 250) + 3 * 250;
ok(placed.number === 1 && placed.total_cents === expected, `order #1 total ${placed.total_cents} = ${expected}`);
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: croq.id, qty: 1, choices: [] }])], 'option_required', 'required option enforced');
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: croq.id, qty: 1, choices: ['half', 'full'] }])], 'menu_changed', 'single-choice enforced');
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: croq.id, qty: 1, choices: ['half', 'fake'] }])], 'menu_changed', 'unknown choice rejected');
await expectErr(`select public.place_order($1,'[]'::jsonb)`, [tok], 'empty_order', 'empty order');
const st = (await q1(`select public.get_order_status($1,$2) s`, [placed.order_id, placed.client_token])).s;
ok(st.status === 'pending' && st.lines.length === 3, 'customer can read status with token');
await expectErr(`select public.get_order_status($1, gen_random_uuid())`, [placed.order_id], 'order_not_found', 'wrong token cannot read');

console.log('Sold out + pause + hours');
await as(staff);
await db.query(`select public.set_item_sold_out($1, true)`, [cana.id]);
await as(null);
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: cana.id, qty: 1, choices: ['cana'] }])], 'item_sold_out', 'sold out blocked');
await as(owner);
await db.query(`update restaurants set paused_until = now() + interval '15 minutes' where id=$1`, [rid]);
await as(null);
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: pan.id, qty: 1 }])], 'ordering_paused', 'paused blocks orders');
await as(owner);
await db.query(`update restaurants set paused_until = null, active = false where id=$1`, [rid]);
ok((await q1(`select active from restaurants where id=$1`, [rid])).active === true, 'owner cannot switch restaurant off (guard)');

const open = async (enabled, hours, at) => (await q1(`select public.restaurant_is_open($1,$2::jsonb,'Europe/Madrid',$3::timestamptz) o`, [enabled, JSON.stringify(hours), at])).o;
const H = { '5': [['12:30', '16:30'], ['20:00', '00:30']] }; // Friday
ok(await open(true, H, '2026-10-30T13:00:00+01:00') === true, 'open Fri 13:00');
ok(await open(true, H, '2026-10-30T17:00:00+01:00') === false, 'closed Fri 17:00');
ok(await open(true, H, '2026-10-31T00:15:00+01:00') === true, 'open Sat 00:15 (Fri late shift)');
ok(await open(true, H, '2026-10-31T00:45:00+01:00') === false, 'closed Sat 00:45');
ok(await open(false, H, '2026-10-31T05:00:00+01:00') === true, 'hours off = always open');
await expectErr(`update restaurants set hours = '{"8":[]}' where id=$1`, [rid], 'restaurants_hours_valid', 'invalid hours rejected');

console.log('Pause by staff');
await as(staff);
const pz = (await q1(`select public.set_ordering_pause($1, 15) p`, [rid])).p;
ok(pz.paused_until && pz.ordering_paused === false, 'staff can pause 15 min');
ok((await q1(`select public.set_ordering_pause($1, null) p`, [rid])).p.paused_until === null, 'staff can resume');
await as(stranger0);
await expectErr(`select public.set_ordering_pause($1, 0)`, [rid], 'not_allowed', 'stranger cannot pause');

console.log('Printing');
await as(owner);
const pk = (await q1(`insert into printers(restaurant_id,name,kind,station) values ($1,'Cocina','star','kitchen') returning id,key`, [rid]));
const pb = (await q1(`insert into printers(restaurant_id,name,kind,station) values ($1,'Barra','epson','bar') returning id,key`, [rid]));
await as(staff);
await expectErr(`select public.set_order_status($1,'ready')`, [placed.order_id], 'invalid_status_change', 'cannot skip accept');
await db.query(`select public.set_order_status($1,'accepted')`, [placed.order_id]);
const jobs = (await db.query(`select station, ticket from print_jobs where order_id=$1 order by station`, [placed.order_id])).rows;
ok(jobs.length === 2, '2 tickets created (kitchen + bar)');
const kitchen = jobs.find((j) => j.station === 'kitchen'), bar = jobs.find((j) => j.station === 'bar');
ok(kitchen.ticket.lines.length === 2 && kitchen.ticket.other_station_lines === 1, 'kitchen ticket has only food');
ok(bar.ticket.lines.length === 1 && bar.ticket.table === 'Mesa 3' && bar.ticket.number === 1, 'bar ticket has only drinks');
await db.query(`select public.reprint_order($1,$2)`, [placed.order_id, pk.id]);
ok((await q1(`select count(*)::int n from print_jobs where printer_id=$1`, [pk.id])).n === 2, 'reprint to one printer');

await as(null);
const poll = (await q1(`select public.printer_poll($1,'star',1) p`, [pk.key])).p;
ok(poll && poll.jobs.length === 1, 'cloud printer sees queued job');
ok((await q1(`select public.printer_poll($1,'epson',1) p`, [pk.key])).p === null, 'wrong kind/key ignored');
const taken = (await q1(`select public.printer_take_job($1,$2) j`, [pk.key, poll.jobs[0].id])).j;
ok(taken && taken.ticket.number === 1, 'take job');
await db.query(`select public.printer_job_result($1,null,true)`, [pk.key]);
ok((await q1(`select status from print_jobs where id=$1`, [taken.id])).status === 'printed', 'confirm without token marks last sent job');
const t2 = (await q1(`select public.printer_take_job($1,null) j`, [pk.key])).j;
await db.query(`select public.printer_job_result($1,$2,false,'520 paper out')`, [pk.key, t2.id]);
ok((await q1(`select status from print_jobs where id=$1`, [t2.id])).status === 'queued', 'failed print goes back in queue');

console.log('Service requests + numbering');
const r1 = (await q1(`select public.request_service($1,'bill') r`, [tok])).r;
const r2 = (await q1(`select public.request_service($1,'bill') r`, [tok])).r;
ok(r1.duplicate === false && r2.duplicate === true, 'duplicate bill request merged');
const placed2 = (await q1(`select public.place_order($1,$2::jsonb) r`, [tok, JSON.stringify([{ item_id: pan.id, qty: 1 }])])).r;
ok(placed2.number === 2, 'second order is #2');
await db.query(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: pan.id, qty: 1 }])]);
await expectErr(`select public.place_order($1,$2::jsonb)`, [tok, JSON.stringify([{ item_id: pan.id, qty: 1 }])], 'too_many_orders', 'rate limit per table');

console.log('Row level security');
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated, anon;`);
await as(staff);
await db.exec(`set role authenticated`);
ok((await db.query(`select id from orders`)).rows.length === 3, 'staff sees own restaurant orders');
const upd = await db.query(`update items set price_cents = 1 where restaurant_id=$1`, [rid]);
ok(upd.affectedRows === 0, 'staff cannot edit prices');
await db.exec(`reset role`);
const stranger = (await q1(`insert into auth.users(email) values ('x@y.test') returning id`)).id;
await as(stranger);
await db.exec(`set role authenticated`);
ok((await db.query(`select id from orders`)).rows.length === 0, 'stranger sees nothing');
ok((await db.query(`select id from printers`)).rows.length === 0, 'stranger sees no printer keys');
await db.exec(`reset role`);
await as(null);
await db.exec(`set role anon`);
ok((await db.query(`select id from orders`)).rows.length === 0, 'anonymous sees no orders');
await db.exec(`reset role`);

console.log(fails ? `\n${fails} FAILED` : '\nAll database tests passed');
process.exit(fails ? 1 : 0);

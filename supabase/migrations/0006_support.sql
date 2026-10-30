-- Support: restaurants press "Help from Farol" in their hub; Farol admins see it live, reply and resolve.
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  created_email text not null default '',
  topic         text not null default 'other' check (topic in ('orders','printer','menu','other')),
  urgent        boolean not null default false,
  message       text not null check (length(message) between 1 and 2000),
  context       jsonb not null default '{}'::jsonb,
  status        text not null default 'open' check (status in ('open','resolved')),
  reply         text,
  created_at    timestamptz not null default now(),
  replied_at    timestamptz,
  resolved_at   timestamptz
);
create index if not exists support_tickets_rest on public.support_tickets(restaurant_id, created_at desc);
create index if not exists support_tickets_open on public.support_tickets(status, created_at desc);
alter table public.support_tickets enable row level security;

drop policy if exists "support: members read" on public.support_tickets;
create policy "support: members read" on public.support_tickets for select to authenticated using (public.is_member(restaurant_id));

create or replace function public.create_support_ticket(p_restaurant_id uuid, p_message text, p_topic text default 'other',
  p_urgent boolean default false, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_email text; cnt int;
begin
  if not public.is_member(p_restaurant_id) then raise exception 'not_allowed'; end if;
  if coalesce(btrim(p_message), '') = '' then raise exception 'empty_message'; end if;
  select count(*) into cnt from public.support_tickets
   where restaurant_id = p_restaurant_id and created_at > now() - interval '10 minutes';
  if cnt >= 5 then raise exception 'too_many_requests'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.support_tickets (restaurant_id, created_by, created_email, topic, urgent, message, context)
  values (p_restaurant_id, auth.uid(), coalesce(v_email, ''),
          case when p_topic in ('orders','printer','menu','other') then p_topic else 'other' end,
          coalesce(p_urgent, false), left(btrim(p_message), 2000), coalesce(p_context, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_support_list(p_include_resolved boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'restaurant_id', s.restaurant_id, 'restaurant', r.name, 'slug', r.slug, 'created_email', s.created_email,
      'topic', s.topic, 'urgent', s.urgent, 'message', s.message, 'context', s.context, 'status', s.status,
      'reply', s.reply, 'created_at', s.created_at, 'replied_at', s.replied_at, 'resolved_at', s.resolved_at)
    order by (s.status = 'open') desc, s.urgent desc, s.created_at desc)
    from public.support_tickets s join public.restaurants r on r.id = s.restaurant_id
    where p_include_resolved or s.status = 'open' or s.resolved_at > now() - interval '7 days'), '[]'::jsonb);
end $$;

create or replace function public.admin_support_update(p_ticket_id uuid, p_reply text default null, p_resolve boolean default false)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  update public.support_tickets set
    reply       = case when coalesce(btrim(p_reply), '') <> '' then left(btrim(p_reply), 2000) else reply end,
    replied_at  = case when coalesce(btrim(p_reply), '') <> '' then now() else replied_at end,
    status      = case when p_resolve then 'resolved' else status end,
    resolved_at = case when p_resolve then now() else resolved_at end
  where id = p_ticket_id;
end $$;

grant select on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;
grant execute on function public.create_support_ticket(uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.admin_support_list(boolean) to authenticated;
grant execute on function public.admin_support_update(uuid, text, boolean) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null; end $$;

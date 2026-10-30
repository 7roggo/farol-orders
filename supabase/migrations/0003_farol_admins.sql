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

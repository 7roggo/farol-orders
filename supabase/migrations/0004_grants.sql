-- Explicit permissions for the website's two roles, so setup works even when the project
-- was created with "Automatically expose new tables" switched off.
-- What each signed-in person can actually see or change is still decided by the security rules (RLS) above.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- customers (no login)
grant execute on function public.get_public_menu(text, text)                  to anon, authenticated;
grant execute on function public.place_order(text, jsonb, text, text, text)   to anon, authenticated;
grant execute on function public.get_order_status(uuid, uuid)                 to anon, authenticated;
grant execute on function public.request_service(text, text)                  to anon, authenticated;

-- restaurant staff and Farol admins (logged in)
grant execute on function public.is_platform_admin()                          to authenticated;
grant execute on function public.member_role(uuid)                            to authenticated;
grant execute on function public.is_member(uuid)                              to authenticated;
grant execute on function public.is_owner(uuid)                               to authenticated;
grant execute on function public.my_restaurants()                             to authenticated;
grant execute on function public.claim_invites()                              to authenticated;
grant execute on function public.set_order_status(uuid, text, text)           to authenticated;
grant execute on function public.reprint_order(uuid, uuid)                    to authenticated;
grant execute on function public.test_print(uuid)                             to authenticated;
grant execute on function public.retry_print_job(uuid)                        to authenticated;
grant execute on function public.printer_heartbeat(uuid)                      to authenticated;
grant execute on function public.set_item_sold_out(uuid, boolean)             to authenticated;
grant execute on function public.set_ordering_pause(uuid, int)                to authenticated;
grant execute on function public.invite_member(uuid, text, text)              to authenticated;
grant execute on function public.list_team(uuid)                              to authenticated;
grant execute on function public.remove_member(uuid, uuid)                    to authenticated;
grant execute on function public.remove_invite(uuid, text)                    to authenticated;
grant execute on function public.admin_overview()                             to authenticated;
grant execute on function public.admin_create_restaurant(text, text, text, boolean) to authenticated;

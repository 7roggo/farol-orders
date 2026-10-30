-- Menu look: cover photo, menu style and "recommended" dishes. Also gives Casa Lola its photos.
alter table public.restaurants add column if not exists cover_url text;
alter table public.restaurants add column if not exists menu_theme text not null default 'tasca';
do $$ begin
  alter table public.restaurants add constraint restaurants_menu_theme_check check (menu_theme in ('tasca', 'moderno', 'noche'));
exception when duplicate_object then null; end $$;
alter table public.items add column if not exists featured boolean not null default false;

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
        'sold_out', i.sold_out, 'featured', i.featured) order by c.sort, i.sort, i.created_at)
      from public.items i join public.categories c on c.id = i.category_id
      where i.restaurant_id = r.id and i.active and c.active), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_public_menu(text, text) to anon, authenticated;

-- Casa Lola: brand colours, cover photo and dish photos (only fills photos that are still empty)
update public.restaurants set
  accent_color = '#C8553D', menu_theme = 'tasca',
  cover_url = coalesce(cover_url, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80'),
  welcome_es = case when welcome_es = '' then 'Tapas caseras y la tortilla de la abuela Lola. Pide desde la mesa y te lo llevamos.' else welcome_es end,
  welcome_en = case when welcome_en = '' then 'Homemade tapas and grandma Lola''s tortilla. Order from your table and we''ll bring it over.' else welcome_en end
where slug = 'casa-lola';

update public.items i set image_url = coalesce(i.image_url, p.url), featured = i.featured or p.featured
from public.restaurants r, (values
  ('Croquetas de jamón ibérico', 'https://images.unsplash.com/photo-1767974963436-2208b3553561?auto=format&fit=crop&w=900&q=80', true),
  ('Patatas bravas',             'https://images.unsplash.com/photo-1565599837634-134bc3aadce8?auto=format&fit=crop&w=900&q=80', true),
  ('Pulpo a la gallega',         'https://images.unsplash.com/photo-1531890820402-2a683fbfd30c?auto=format&fit=crop&w=900&q=80', true),
  ('Gambas al ajillo',           'https://images.unsplash.com/photo-1788462613187-b10c1ac2ea60?auto=format&fit=crop&w=900&q=80', false),
  ('Tarta de queso',             'https://images.unsplash.com/photo-1759303380841-55c09244fd2b?auto=format&fit=crop&w=900&q=80', true),
  ('Churros con chocolate',      'https://images.unsplash.com/photo-1515579171902-e0c5f918b32b?auto=format&fit=crop&w=900&q=80', false),
  ('Cerveza de barril',          'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=900&q=80', false),
  ('Vermut de grifo',            'https://images.unsplash.com/photo-1615830783066-26a99bc9d959?auto=format&fit=crop&w=900&q=80', false),
  ('Vino tinto (copa)',          'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80', false)
) as p(name, url, featured)
where i.restaurant_id = r.id and r.slug = 'casa-lola' and i.name_es = p.name;

begin;
create table public.products (
  id text primary key,
  brand text not null,
  name text not null,
  kind text not null check (kind in ('nuggets', 'tenders', 'sauce', 'side'))
);
create table public.places (
  id text primary key,
  name text not null,
  area text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  source text not null
);
create table public.place_products (
  place_id text references public.places on delete cascade,
  product_id text references public.products on delete cascade,
  primary key (place_id, product_id)
);
create index place_products_product on public.place_products (product_id, place_id);
alter table public.products enable row level security;
alter table public.places enable row level security;
alter table public.place_products enable row level security;
create policy products_read on public.products for select using (true);
create policy places_read on public.places for select using (true);
create policy place_products_read on public.place_products for select using (true);
revoke all on public.products, public.places, public.place_products from public, anon, authenticated;
grant select on public.products, public.places, public.place_products to anon, authenticated;
commit;

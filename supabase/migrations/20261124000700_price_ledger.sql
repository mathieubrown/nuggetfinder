begin;
-- These two source tables are curated through SQL pending the owner-claim workflow.
create table public.business_verifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  place_id text references public.places on delete cascade,
  brand text,
  source_url text not null check(source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check(num_nonnulls(place_id,brand)=1)
);
create table public.product_allergen_sources (
  id bigint generated always as identity primary key,
  product_id text not null references public.products on delete cascade,
  allergen text not null check(allergen in ('peanut','peanut_oil','milk','egg','wheat','soy','sesame','tree_nut','fish','shellfish','gluten')),
  state text not null check(state in ('contains','suggested_free','confirmed_free')),
  source_kind text not null check(source_kind in ('package','store','brand','crowd')),
  source_url text check(source_url ~ '^https://'),
  created_at timestamptz not null default now(),
  check(state<>'confirmed_free' or (source_url is not null and source_kind in ('package','store','brand')))
);
create table public.price_entries (
  id bigint generated always as identity primary key,
  place_id text not null,
  product_id text not null,
  user_id uuid not null references public.profiles on delete cascade,
  price numeric(10,2) not null check(price between 0.01 and 10000),
  quantity numeric(12,3) not null check(quantity between 0.001 and 100000),
  unit text not null check(unit in ('piece','g','ml')),
  verification_id bigint references public.business_verifications on delete set null,
  created_at timestamptz not null default now(),
  foreign key(place_id,product_id) references public.place_products on delete cascade,
  check(unit<>'piece' or quantity=trunc(quantity))
);
create index price_entries_product_place_time on public.price_entries(place_id,product_id,unit,created_at desc,id desc);
create index price_entries_user_time on public.price_entries(user_id,created_at desc);
alter table public.business_verifications enable row level security;
alter table public.product_allergen_sources enable row level security;
alter table public.price_entries enable row level security;
revoke all on public.business_verifications,public.product_allergen_sources,public.price_entries from public,anon,authenticated;

create function public.submit_price(p_place text,p_product text,p_price numeric,p_quantity numeric,p_unit text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=public.require_social_user();
  proof bigint;
begin
  if p_price is null or p_quantity is null or p_unit is null
    or p_price not between 0.01 and 10000 or p_quantity not between 0.001 and 100000
    or p_price<>round(p_price,2) or p_quantity<>round(p_quantity,3)
    or p_unit not in ('piece','g','ml') or (p_unit='piece' and p_quantity<>trunc(p_quantity))
    or not exists(select 1 from public.place_products where place_id=p_place and product_id=p_product)
  then raise exception 'invalid_price'; end if;
  if exists(select 1 from public.price_entries where user_id=actor and place_id=p_place and product_id=p_product
    and created_at>now()-interval '10 minutes') then raise exception 'price_cooldown'; end if;
  if (select count(*) from public.price_entries where user_id=actor and created_at>now()-interval '24 hours')>=20
  then raise exception 'price_limit'; end if;
  select id into proof from public.business_verifications
    where user_id=actor and place_id=p_place and revoked_at is null order by created_at desc,id desc limit 1;
  insert into public.price_entries(place_id,product_id,user_id,price,quantity,unit,verification_id)
  values(p_place,p_product,actor,p_price,p_quantity,p_unit,proof);
end $$;

create function public.product_allergen_evidence(p_product text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(a),'[]'::jsonb) from (
    select distinct on(allergen) allergen,state,source_kind,source_url,created_at
    from public.product_allergen_sources where product_id=p_product
    order by allergen,(state='contains') desc,created_at desc,id desc
  ) a
$$;

create function public.price_targets()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'places',(select coalesce(jsonb_agg(p order by name,area,id),'[]'::jsonb) from (
      select id,name,area from public.places where exists(select 1 from public.place_products where place_id=id)) p),
    'products',(select coalesce(jsonb_agg(p order by brand,name,id),'[]'::jsonb)
      from (select id,brand,name,kind,size from public.products) p),
    'links',(select coalesce(jsonb_agg(l),'[]'::jsonb) from (select place_id,product_id from public.place_products) l))
$$;

create function public.price_ledger(p_place text default null,p_unit text default 'piece',p_product text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  with evidence as (
    select e.id,e.place_id,e.product_id,e.price,e.quantity,e.unit,e.created_at,
      p.name as product_name,p.brand,p.kind,
      s.name as place_name,s.area,
      left(u.handle,1) || '****' || right(u.handle,1) as masked_handle,
      (v.id is not null and v.revoked_at is null and v.place_id=e.place_id and v.user_id=e.user_id) as verified_store,
      e.price/e.quantity as unit_cost,
      (select to_jsonb(stock) from public.product_stock(e.product_id) stock where stock.place_id=e.place_id) as stock,
      public.product_allergen_evidence(e.product_id) as allergens
    from public.price_entries e
    join public.products p on p.id=e.product_id
    join public.places s on s.id=e.place_id
    join public.profiles u on u.id=e.user_id and not u.banned
    left join public.business_verifications v on v.id=e.verification_id
    where (p_place is null or e.place_id=p_place) and e.unit=p_unit
      and (p_product is null or e.product_id=p_product)
  ), ranked as (
    select e.*,row_number() over(partition by place_id,product_id,unit
      order by verified_store desc,created_at desc,id desc) as position
    from evidence e
  )
  select coalesce(jsonb_agg(p order by p.position=1 desc,p.unit_cost,p.created_at desc,p.id desc),'[]'::jsonb)
  from (select r.*,r.position>1 as superseded from ranked r
    order by r.position=1 desc,r.unit_cost,r.created_at desc,r.id desc limit 1000) p
$$;

alter function public.export_discovery_data() rename to export_before_prices;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return public.export_before_prices() || jsonb_build_object('price_entries',
    coalesce((select jsonb_agg(p) from public.price_entries p where user_id=auth.uid()),'[]'::jsonb));
end $$;
revoke execute on function public.export_before_prices() from public,anon,authenticated;
revoke execute on function public.submit_price(text,text,numeric,numeric,text),public.price_targets(),
  public.price_ledger(text,text,text),public.product_allergen_evidence(text),public.export_discovery_data() from public,anon,authenticated;
grant execute on function public.submit_price(text,text,numeric,numeric,text),public.export_discovery_data() to authenticated;
grant execute on function public.price_targets(),public.price_ledger(text,text,text),public.product_allergen_evidence(text) to anon,authenticated;
commit;

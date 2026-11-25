begin;
-- Preserve the historical observation if its account is later removed. Existing
-- public visibility still requires a non-banned author, so deletion cannot expose
-- previously hidden evidence. Attribution is erased; retention remains a launch review.
alter table public.price_entries alter column user_id drop not null;
alter table public.price_entries drop constraint price_entries_user_id_fkey;
alter table public.price_entries add foreign key(user_id) references public.profiles on delete set null;
-- LOGIC-START
create function public.price_observation_age(p_observed timestamptz,p_at timestamptz)
returns text language sql immutable set search_path='' as $$
 select case when p_observed is null or p_at is null or p_observed>p_at then 'unavailable'
 when p_at-p_observed<=interval '7 days' then 'recent'
 when p_at-p_observed<=interval '30 days' then 'dated' else 'historical' end
$$;
-- LOGIC-END
revoke execute on function public.price_observation_age(timestamptz,timestamptz) from public,anon,authenticated;
-- Source identity is independent of observation time. Latest evidence wins, and all
-- earlier entries remain preserved. Verification never makes an old price current.
create or replace function public.price_ledger(p_place text default null,p_unit text default 'piece',p_product text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  with evidence as (
    select e.id,e.place_id,e.product_id,e.price,e.quantity,e.unit,e.created_at,
      p.name as product_name,p.brand,p.kind,
      s.name as place_name,s.area,
      left(u.handle,1) || '****' || right(u.handle,1) as masked_handle,
      (v.id is not null and v.revoked_at is null and v.place_id=e.place_id and v.user_id=e.user_id) as verified_store,
      e.price/e.quantity as unit_cost,
      (select stock from jsonb_array_elements(public.product_stock_snapshot(e.product_id)) stock where stock->>'place_id'=e.place_id) as stock,
      public.price_observation_age(e.created_at,now()) as freshness,
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
      order by created_at desc,id desc) as position
    from evidence e
  )
  select coalesce(jsonb_agg(p order by p.position=1 desc,case when p.position=1 then p.unit_cost end,p.created_at desc,p.id desc),'[]'::jsonb)
  from (select r.*,r.position>1 as superseded from ranked r
    order by r.position=1 desc,case when r.position=1 then r.unit_cost end,r.created_at desc,r.id desc limit 1000) p
$$;

commit;

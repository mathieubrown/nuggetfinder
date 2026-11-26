begin;
create table public.catalog_requests (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles on delete cascade,
 request_id uuid not null, payload jsonb not null,
 kind text not null check(kind in ('product','listing','store_claim','brand_claim')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 product_id text references public.products, place_id text references public.places,
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references public.accounts on delete set null,
 verification_id bigint references public.business_verifications on delete set null,
 unique(author_id,request_id)
);
create table public.business_stock_updates (
 id bigint generated always as identity primary key,
 verification_id bigint not null references public.business_verifications on delete cascade,
 place_id text not null, product_id text not null,
 status text not null check(status in ('seen','sold_out')),
 observed_at timestamptz not null default now(),
 request_id uuid not null,
 foreign key(place_id,product_id) references public.place_products on delete cascade,
 unique(verification_id,request_id)
);
alter table public.catalog_requests enable row level security;
alter table public.business_stock_updates enable row level security;
revoke all on public.catalog_requests,public.business_stock_updates from public,anon,authenticated,nugget_broker;

create function public.runtime_catalog_request(p_hash text,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid; actor uuid; item public.catalog_requests; kind text; proof bigint; entry public.business_stock_updates;
begin
 player:=public.runtime_session(p_hash,case when p_operation='mine' then 'discover' else 'report' end);
 select profile_id into actor from public.participant_profiles where participant_id=player;
 if p_operation='mine' then
  return coalesce((select jsonb_agg(to_jsonb(r)-'author_id'-'reviewed_by') from public.catalog_requests r where r.author_id=actor),'[]');
 end if;
 if p_operation='stock' then
  if p_data->>'status' is null or p_data->>'status' not in ('seen','sold_out') then raise exception 'invalid_stock_status';end if;
  select v.id into proof from public.business_verifications v join public.products p on p.id=p_data->>'product'
   join public.place_products pp on pp.product_id=p.id and pp.place_id=p_data->>'place'
   where v.user_id=actor and v.revoked_at is null and (v.place_id=pp.place_id or
   lower(v.brand)=lower(p.brand)) order by (v.place_id is null),v.id limit 1 for update of v;
  if proof is null then raise exception 'business_scope_required';end if;
  select * into entry from public.business_stock_updates where verification_id=proof and request_id=(p_data->>'request')::uuid;
  if found then
   if (entry.place_id,entry.product_id,entry.status) is distinct from (p_data->>'place',p_data->>'product',p_data->>'status') then raise exception 'request_conflict';end if;
   return to_jsonb(entry)-'verification_id'-'request_id';
  end if;
  if exists(select 1 from public.business_stock_updates where verification_id=proof and place_id=p_data->>'place'
    and product_id=p_data->>'product' and observed_at>now()-interval '10 minutes') then raise exception 'business_stock_cooldown';end if;
  if (select count(*) from public.business_stock_updates where verification_id=proof and observed_at>now()-interval '24 hours')>=60 then raise exception 'business_stock_limit';end if;
  insert into public.business_stock_updates(verification_id,place_id,product_id,status,request_id)
  values(proof,p_data->>'place',p_data->>'product',p_data->>'status',(p_data->>'request')::uuid) returning * into entry;
  return to_jsonb(entry)-'verification_id'-'request_id';
 end if;
 if p_operation<>'submit' then raise exception 'invalid_catalog_operation';end if;
 perform pg_advisory_xact_lock(2147483000,21);
 select * into item from public.catalog_requests where author_id=actor and request_id=(p_data->>'request')::uuid;
 if found then
  if item.payload<>p_data then raise exception 'request_conflict';end if;
  return jsonb_build_object('id',item.id,'status',item.status);
 end if;
 kind:=p_data->>'kind';
 if kind is null or kind not in ('product','listing','store_claim','brand_claim') then raise exception 'invalid_catalog_kind';end if;
 if (select count(*) from public.catalog_requests where author_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'catalog_daily_limit';end if;
 if (select count(*) from public.catalog_requests where status='pending')>=100 then raise exception 'review_queue_full';end if;
 if kind='product' and (coalesce(length(btrim(p_data->>'name')),0) not between 2 and 100 or
   coalesce(length(btrim(p_data->>'brand')),0) not between 2 and 80 or
   coalesce(p_data->>'product_kind','') not in ('nuggets','tenders','sauce','side') or
   public.social_text_blocked((p_data->>'name')||' '||(p_data->>'brand'))) then raise exception 'invalid_product_details';end if;
 if p_data->>'place' is not null and not exists(select 1 from public.places where id=p_data->>'place') then raise exception 'place_unavailable';end if;
 if kind in ('listing','store_claim') and p_data->>'place' is null then raise exception 'place_required';end if;
 if kind='listing' and not exists(select 1 from public.products where id=p_data->>'product') then raise exception 'product_unavailable';end if;
 if kind in ('store_claim','brand_claim') then
  if not exists(select 1 from public.participants where id=player and age_band='adult' and not managed) then raise exception 'adult_business_account_required';end if;
  if coalesce(p_data->>'source','') !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#][^[:space:]@]*)?$'
   or length(p_data->>'source')>500 then raise exception 'business_source_required';end if;
  if kind='brand_claim' and not exists(select 1 from public.products where lower(brand)=lower(btrim(p_data->>'brand'))) then raise exception 'brand_unavailable';end if;
 end if;
 -- Store only the fields needed for a review. The browser never supplies roles or verification.
 if (p_data - array['request','kind','name','brand','product_kind','product','place','source']) <> '{}'::jsonb then raise exception 'invalid_catalog_fields';end if;
 insert into public.catalog_requests(author_id,request_id,payload,kind,product_id,place_id)
 values(actor,(p_data->>'request')::uuid,p_data,kind,case when kind='listing' then p_data->>'product' end,p_data->>'place')
 returning * into item;
 return jsonb_build_object('id',item.id,'status',item.status);
end $$;

create function public.runtime_review_catalog(p_account uuid,p_id uuid,p_decision text,p_checked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.catalog_requests; product text; proof bigint; brand text;
begin
 if not exists(select 1 from public.accounts where id=p_account and is_moderator and not banned) then raise exception 'moderator_required';end if;
 if p_id is null then return coalesce((select jsonb_agg(to_jsonb(r)-'author_id'-'reviewed_by') from public.catalog_requests r where r.status='pending' or (r.status='approved' and exists(select 1 from public.business_verifications v where v.id=r.verification_id and v.revoked_at is null))),'[]');end if;
 perform pg_advisory_xact_lock(2147483000,21);
 select * into item from public.catalog_requests where id=p_id for update;
 if not found then raise exception 'catalog_request_unavailable';end if;
 if exists(select 1 from public.participant_profiles l join public.participants p on p.id=l.participant_id where l.profile_id=item.author_id and p.account_id=p_account) then raise exception 'cannot_review_own_submission';end if;
 if p_decision='revoke' and item.status='approved' and item.verification_id is not null then
  update public.business_verifications set revoked_at=coalesce(revoked_at,now()) where id=item.verification_id;
  return jsonb_build_object('status','revoked');
 end if;
 if item.status<>'pending' or coalesce(p_decision,'') not in ('approve','reject') then raise exception 'catalog_review_conflict';end if;
 if p_decision='approve' then
  if p_checked is distinct from true then raise exception 'review_checks_required';end if;
  if not exists(select 1 from public.participant_profiles l where l.profile_id=item.author_id and public.runtime_can(l.participant_id,'report')) then raise exception 'catalog_author_unavailable';end if;
  product:=item.product_id;
  if item.kind='product' then
   select p.id into product from public.products p where lower(p.name)=lower(btrim(item.payload->>'name')) and lower(p.brand)=lower(btrim(item.payload->>'brand')) and p.kind=item.payload->>'product_kind' limit 1;
   if product is null then product:='community-'||item.id;insert into public.products(id,brand,name,kind) values(product,btrim(item.payload->>'brand'),btrim(item.payload->>'name'),item.payload->>'product_kind');end if;
  end if;
  if item.kind in ('product','listing') and item.place_id is not null then
   insert into public.place_products(place_id,product_id,link_kind) values(item.place_id,product,'place_to_check') on conflict do nothing;
  end if;
  if item.kind in ('store_claim','brand_claim') then
   if item.kind='brand_claim' then select p.brand into brand from public.products p where lower(p.brand)=lower(btrim(item.payload->>'brand')) limit 1;end if;
   insert into public.business_verifications(user_id,place_id,brand,source_url) values(item.author_id,case when item.kind='store_claim' then item.place_id end,brand,item.payload->>'source') returning id into proof;
  end if;
 end if;
 update public.catalog_requests set status=case when p_decision='approve' then 'approved' else 'rejected' end,
  product_id=coalesce(product,item.product_id),verification_id=proof,reviewed_at=now(),reviewed_by=p_account where id=p_id returning * into item;
 return jsonb_build_object('status',item.status,'product_id',item.product_id);
end $$;

create function public.business_stock_for(p_product text,p_place text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(r),'[]') from (
 select distinct on (s.place_id,s.product_id,v.place_id is null) s.place_id,s.product_id,s.status,s.observed_at,
 case when v.place_id is null then 'Verified brand report' else 'Verified store report' end as source
 from public.business_stock_updates s join public.business_verifications v on v.id=s.verification_id and v.revoked_at is null
 join public.participant_profiles l on l.profile_id=v.user_id
 where s.product_id=p_product and (p_place is null or s.place_id=p_place) and s.observed_at>now()-interval '24 hours'
 and public.runtime_can(l.participant_id,'report')
 order by s.place_id,s.product_id,v.place_id is null,s.observed_at desc,s.id desc limit 100) r
$$;
-- Include these private contributions in the existing per-player export.
alter function public.runtime_parent(uuid,text,jsonb) rename to runtime_parent_before_catalog;
revoke all on function public.runtime_parent_before_catalog(uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
create function public.runtime_parent(p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;actor uuid;
begin
 result:=public.runtime_parent_before_catalog(p_account,p_operation,p_data);
 if p_operation='export' then
  select l.profile_id into actor from public.participant_profiles l join public.participants p on p.id=l.participant_id
   where p.account_id=p_account and p.id=(p_data->>'participant')::uuid;
  result:=result||jsonb_build_object(
   'catalog_requests',coalesce((select jsonb_agg(to_jsonb(r)-'reviewed_by') from public.catalog_requests r where r.author_id=actor),'[]'),
   'business_stock_updates',coalesce((select jsonb_agg(s) from public.business_stock_updates s join public.business_verifications v on v.id=s.verification_id where v.user_id=actor),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.runtime_parent(uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_parent(uuid,text,jsonb) to nugget_broker;
revoke all on function public.runtime_catalog_request(text,text,jsonb),public.runtime_review_catalog(uuid,uuid,text,boolean),public.business_stock_for(text,text) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_catalog_request(text,text,jsonb),public.runtime_review_catalog(uuid,uuid,text,boolean),public.business_stock_for(text,text) to nugget_broker;
commit;

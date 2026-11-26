begin;
create table public.product_ratings (
 product_id text references public.products on delete cascade,profile_id uuid references public.profiles on delete cascade,
 rating integer not null check(rating between 1 and 5),updated_at timestamptz not null default now(),primary key(product_id,profile_id)
);
create table public.participant_rankings (
 participant_id uuid references public.participants on delete cascade,product_id text references public.products on delete cascade,
 position integer not null check(position between 1 and 50),primary key(participant_id,product_id),unique(participant_id,position)
);
alter table public.product_ratings enable row level security;alter table public.participant_rankings enable row level security;
revoke all on public.product_ratings,public.participant_rankings from public,anon,authenticated,nugget_broker;
create function public.runtime_rating(p_hash text,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; prof uuid; products text[]; p text; position integer:=0;
begin
 pid:=public.runtime_session(p_hash,case when p_operation='rank' then 'rank' else 'rate' end);
 select profile_id into prof from public.participant_profiles where participant_id=pid;
 perform 1 from public.profiles where id=prof for update;
 if p_operation='rate' then
  if exists(select 1 from public.product_ratings where profile_id=prof and product_id=p_data->>'product' and updated_at>now()-interval '10 minutes') then raise exception 'rating_cooldown'; end if;
  if (select count(*) from public.product_ratings where profile_id=prof and updated_at>now()-interval '24 hours')>=20 then raise exception 'rating_limit'; end if;
  insert into public.product_ratings(product_id,profile_id,rating) values(p_data->>'product',prof,(p_data->>'rating')::integer)
  on conflict(product_id,profile_id) do update set rating=excluded.rating,updated_at=now();
 elsif p_operation='rank' then
  select array_agg(value) into products from jsonb_array_elements_text(p_data->'products');
  if cardinality(products)>50 or cardinality(products)<>(select count(distinct x) from unnest(products) x) then raise exception 'invalid_ranking'; end if;
  delete from public.participant_rankings where participant_id=pid;
  foreach p in array coalesce(products,'{}') loop position:=position+1;insert into public.participant_rankings values(pid,p,position);end loop;
 else raise exception 'invalid_rating_operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.runtime_read(p_hash text,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; prof uuid; result jsonb;
begin
 pid:=public.runtime_session(p_hash,'discover');select profile_id into prof from public.participant_profiles where participant_id=pid;
 perform set_config('request.jwt.claim.sub',prof::text,true);
 case p_operation
 when 'stock' then result:=public.product_stock_snapshot(p_data->>'product');
 when 'place' then result:=public.place_screen(p_data->>'place');
 when 'prices' then result:=public.price_ledger(p_data->>'place',coalesce(p_data->>'unit','piece'),p_data->>'product');
 when 'showdowns' then select coalesce(jsonb_agg(m),'[]') into result from public.matchups(p_data->>'id') m;
 when 'court' then result:=public.court_cases();
 when 'trails' then result:=public.list_trails();
 when 'profile' then select coalesce(jsonb_agg(p),'[]') into result from public.my_wave_profile() p;
 when 'lists' then result:=public.my_discoveries();
 when 'ratings' then select jsonb_build_object('count',count(*),'average',case when count(*)>=3 then round(avg(r.rating),1) end,'mine',(select rating from public.product_ratings where product_id=p_data->>'product' and profile_id=prof)) into result from public.product_ratings r join public.profiles p on p.id=r.profile_id and not p.banned where r.product_id=p_data->>'product';
 when 'ranking' then select coalesce(jsonb_agg(product_id order by position),'[]') into result from public.participant_rankings where participant_id=pid;
 when 'public_takes' then result:=public.runtime_public_feed(pid);
 when 'take_responses' then result:=public.runtime_public_responses(pid,(p_data->>'id')::bigint);
 when 'weekly' then select coalesce(jsonb_agg(w),'[]') into result from public.weekly_matchups() w;
 else raise exception 'invalid_read_operation'; end case;
 return result;
end $$;
revoke all on function public.runtime_rating(text,text,jsonb),public.runtime_read(text,text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_rating(text,text,jsonb),public.runtime_read(text,text,jsonb) to nugget_broker;
commit;

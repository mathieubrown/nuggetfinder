begin;
create table public.place_ratings (
  place_id text not null references public.places on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  crunch smallint not null check(crunch between 1 and 5),
  juice smallint not null check(juice between 1 and 5),
  sauce smallint not null check(sauce between 1 and 5),
  value smallint not null check(value between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(place_id,user_id)
);
create index place_ratings_user_time on public.place_ratings(user_id,updated_at desc);
create table public.place_matchups (
  place_id text not null references public.places on delete cascade,
  matchup_id text not null references public.matchups on delete cascade,
  primary key(place_id,matchup_id)
);
alter table public.place_ratings enable row level security;
alter table public.place_matchups enable row level security;
revoke all on public.place_ratings,public.place_matchups from public,anon,authenticated;
-- Link the existing starter sauce comparison only to its two real restaurant brands.
insert into public.place_matchups(place_id,matchup_id)
select p.id,m.id from public.places p cross join public.matchups m
where p.name in ('Chick-fil-A','Raising Cane''s') and m.id='cane-vs-cfa';

create function public.rate_place(p_place text,p_crunch integer,p_juice integer,p_sauce integer,p_value integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user();
begin
  if not exists(select 1 from public.places where id=p_place) then raise exception 'place_unavailable'; end if;
  if p_crunch is null or p_juice is null or p_sauce is null or p_value is null
    or p_crunch not between 1 and 5 or p_juice not between 1 and 5
    or p_sauce not between 1 and 5 or p_value not between 1 and 5
  then raise exception 'invalid_rating'; end if;
  if exists(select 1 from public.place_ratings where user_id=actor and place_id=p_place and updated_at>now()-interval '10 minutes')
  then raise exception 'rating_cooldown'; end if;
  if (select count(*) from public.place_ratings where user_id=actor and updated_at>now()-interval '24 hours')>=20
  then raise exception 'rating_limit'; end if;
  insert into public.place_ratings(place_id,user_id,crunch,juice,sauce,value)
  values(p_place,actor,p_crunch,p_juice,p_sauce,p_value)
  on conflict(place_id,user_id) do update
    set crunch=excluded.crunch,juice=excluded.juice,sauce=excluded.sauce,value=excluded.value,updated_at=now();
end $$;

create function public.place_screen(p_place text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'ratings',(select jsonb_build_object('count',count(*),
      'crunch',case when count(*)>=3 then round(avg(crunch),1) end,
      'juice',case when count(*)>=3 then round(avg(juice),1) end,
      'sauce',case when count(*)>=3 then round(avg(sauce),1) end,
      'value',case when count(*)>=3 then round(avg(value),1) end)
      from public.place_ratings r join public.profiles p on p.id=r.user_id and not p.banned where place_id=p_place),
    'mine',(select jsonb_build_object('crunch',crunch,'juice',juice,'sauce',sauce,'value',value)
      from public.place_ratings where place_id=p_place and user_id=auth.uid()),
    'matchups',coalesce((select jsonb_agg(m) from public.place_matchups pm
      cross join lateral public.matchups(pm.matchup_id) m where pm.place_id=p_place),'[]'::jsonb),
    'takes',coalesce((select jsonb_agg(t) from (
      select t.id,t.author_id,p.handle,t.body,t.created_at,t.subject_kind,t.subject_ref
      from public.takes t join public.profiles p on p.id=t.author_id
      where t.subject_kind='place' and t.subject_ref=p_place and public.take_visible(t.id)
      order by public.take_heat(t.id) desc,t.created_at desc limit 6
    ) t),'[]'::jsonb)
  ) from public.places where id=p_place
$$;

alter function public.export_discovery_data() rename to export_before_ratings;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return public.export_before_ratings() || jsonb_build_object('place_ratings',
    coalesce((select jsonb_agg(r) from public.place_ratings r where user_id=auth.uid()),'[]'::jsonb));
end $$;
revoke execute on function public.export_before_ratings() from public,anon,authenticated;
revoke execute on function public.rate_place(text,integer,integer,integer,integer),public.place_screen(text),public.export_discovery_data()
  from public,anon,authenticated;
grant execute on function public.place_screen(text) to anon,authenticated;
grant execute on function public.rate_place(text,integer,integer,integer,integer),public.export_discovery_data() to authenticated;
commit;

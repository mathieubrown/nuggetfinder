begin;
-- Public business locations only. No user search history or automatic availability claims.
create table public.place_search_cache (
 osm_id text primary key check(osm_id ~ '^(node|way|relation)/[0-9]+$'),name text not null,address text not null,
 latitude double precision not null,longitude double precision not null,category text not null,refreshed_at timestamptz not null default now(),source_as_of date not null default current_date
);
create table public.place_submissions (
 id uuid primary key default gen_random_uuid(),author_id uuid not null references public.profiles on delete cascade,request_id uuid not null,fingerprint text not null,
 created_at timestamptz not null default now(),kind text not null check(kind in ('add','edit')),place_id text references public.places,
 name text not null check(char_length(name) between 2 and 120),address text not null check(char_length(address) between 3 and 250),
 category text not null check(category in ('restaurant','fast_food','grocery','cafe','food_truck','other')),
 latitude double precision not null check(latitude between 37.62 and 37.812),longitude double precision not null check(longitude between -122.53 and -122.35),
 osm_id text,source_as_of date,opening_hours text not null default '' check(char_length(opening_hours)<=300),menu_url text not null default '' check(char_length(menu_url)<=500),
 base_reviewed_at timestamptz,base_version integer not null default 0,status text not null default 'pending' check(status in ('pending','approved','rejected','duplicate')),version integer not null default 1,
 reviewed_by uuid references public.accounts on delete set null,reviewed_at timestamptz,unique(author_id,request_id)
);
create table public.place_information (
 place_id text primary key references public.places on delete cascade,category text not null,opening_hours text not null default '',menu_url text not null default '',reviewed_at timestamptz not null default now(),version integer not null default 1
);
create table public.place_submission_events (
 id bigint generated always as identity primary key,submission_id uuid not null references public.place_submissions on delete cascade,
 action text not null check(action in ('submitted','approved','rejected','duplicate')),created_at timestamptz not null default now(),reviewer_id uuid references public.accounts on delete set null
);
do $$declare t text;begin foreach t in array array['place_search_cache','place_submissions','place_information','place_submission_events'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,nugget_broker',t);end loop;end $$;
create function public.place_search_text(p_text text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(replace(replace(lower(coalesce(p_text,'')),chr(39),''),'’',''),'[^[:alnum:]]+',' ','g'))
$$;
revoke all on function public.place_search_text(text) from public,anon,authenticated,nugget_broker;
-- LOGIC-START: token matching searches names AND public street addresses, not a chain allowlist.
create function public.search_places(p_query text default '') returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(found)),'[]') from (
 select p.id,p.name,p.area,p.latitude,p.longitude,coalesce(i.category,'other') category,p.source
 from public.places p left join public.place_information i on i.place_id=p.id
 where char_length(p_query)<=120 and not public.social_text_blocked(p.name||' '||p.area) and not exists(select 1 from unnest(regexp_split_to_array(public.place_search_text(p_query),'\s+')) word where word<>'' and strpos(public.place_search_text(p.name||' '||p.area),word)=0)
 order by lower(p.name),p.id limit 30) found
$$;
-- LOGIC-END
create function public.place_information_for(p_place text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('place',to_jsonb(p),'details',coalesce((select to_jsonb(i)-'place_id' from public.place_information i where i.place_id=p.id),'{}'),
 'menus',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'observed_at',date_trunc('day',e.observed_at),'submitted_at',date_trunc('day',e.submitted_at))) from public.photo_evidence e join public.photo_evidence_links l on l.evidence_id=e.id where l.kind='place' and l.content_ref=p.id and e.purpose='menu' and public.runtime_photo_public(e.id,'thumb') is not null),'[]'))
 from public.places p where p.id=p_place
$$;
create function public.runtime_location_cache(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;result jsonb:='[]';begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>30 then raise exception 'invalid_place_results';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 if r->>'id' !~ '^(node|way|relation)/[0-9]+$' or not ((r->>'latitude')::float8 between 37.62 and 37.812 and (r->>'longitude')::float8 between -122.53 and -122.35) or char_length(r->>'name') not between 2 and 120 then raise exception 'invalid_place_result';end if;
 if public.social_text_blocked((r->>'name')||' '||coalesce(r->>'address','')) then continue;end if;
 insert into public.place_search_cache values(r->>'id',r->>'name',coalesce(r->>'address',''),(r->>'latitude')::float8,(r->>'longitude')::float8,r->>'category',now(),coalesce((r->>'source_as_of')::date,current_date))
 on conflict(osm_id) do update set name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,category=excluded.category,refreshed_at=now(),source_as_of=excluded.source_as_of;
 result:=result||jsonb_build_array(r);
 end loop;delete from public.place_search_cache where refreshed_at<now()-interval '7 days';return result;end $$;
create function public.runtime_locations(p_hash text,p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid;prof uuid;s public.place_submissions;cached public.place_search_cache;fp text;duplicate text;nm text;addr text;lat float8;lon float8;category text;target text;
begin
 if p_operation='search' then return public.search_places(coalesce(p_data->>'query',''));end if;
 if p_operation='details' then return public.place_information_for(p_data->>'place');end if;
 pid:=public.runtime_session(p_hash,case when p_operation='submit' then 'report' else 'discover' end);
 select profile_id into prof from public.participant_profiles where participant_id=pid;
 if p_operation='my_menus' then return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'revision',e.revision,'status',e.status,'observed_at',date_trunc('day',e.observed_at))) from public.photo_evidence e join public.photo_evidence_links l on l.evidence_id=e.id where e.participant_id=pid and e.purpose='menu' and l.kind='place' and l.content_ref=p_data->>'place'),'[]');end if;
 if p_operation='mine' then return coalesce((select jsonb_agg(to_jsonb(x)-'author_id'-'fingerprint'-'reviewed_by') from public.place_submissions x where author_id=prof),'[]');end if;
 if p_operation<>'submit' then raise exception 'invalid_location_operation';end if;
 perform pg_advisory_xact_lock(2147483000,20);
 fp:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 select * into s from public.place_submissions where author_id=prof and request_id=(p_data->>'request')::uuid;
 if found then if s.fingerprint<>fp then raise exception 'request_conflict';end if;return jsonb_build_object('id',s.id,'status',s.status,'place_id',s.place_id);end if;
 if (select count(*) from public.place_submissions where author_id=prof and created_at>now()-interval '24 hours')>=10 then raise exception 'location_daily_limit';end if;
 if (select count(*) from public.place_submissions where status='pending')>=100 then raise exception 'review_queue_full';end if;
 if p_data->>'public_business' is distinct from 'true' then raise exception 'public_business_required';end if;
 if p_data->>'kind' not in ('add','edit') or p_data->>'kind' is null then raise exception 'invalid_location_kind';end if;
 nm:=btrim(p_data->>'name');addr:=btrim(p_data->>'address');category:=p_data->>'category';lat:=(p_data->>'latitude')::float8;lon:=(p_data->>'longitude')::float8;
 if nm is null or addr is null or lat is null or lon is null or category is null then raise exception 'location_fields_required';end if;
 if coalesce(p_data->>'menu_url','')<>'' and (p_data->>'menu_url' !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/:?#][^[:space:]@]*)?$' or p_data->>'menu_url' ~* '(localhost|127\.0\.0\.1)') then raise exception 'invalid_menu_url';end if;
 if char_length(nm) not between 2 and 120 or char_length(addr) not between 3 and 250 or category not in ('restaurant','fast_food','grocery','cafe','food_truck','other') then raise exception 'invalid_location_details';end if;
 if not (lat between 37.62 and 37.812 and lon between -122.53 and -122.35) then raise exception 'location_outside_area';end if;
 if public.social_text_blocked(nm||' '||addr||' '||coalesce(p_data->>'opening_hours','')) then raise exception 'location_text_unavailable';end if;
 if nullif(p_data->>'osm_id','') is not null then
 select * into cached from public.place_search_cache where osm_id=p_data->>'osm_id' and refreshed_at>now()-interval '7 days';
 if not found then raise exception 'place_source_expired';end if;
 -- A browser cannot invent an OSM ID or change the source's coordinates/name.
 nm:=cached.name;addr:=coalesce(nullif(cached.address,''),addr);lat:=cached.latitude;lon:=cached.longitude;category:=cached.category;
 end if;
 if public.social_text_blocked(nm||' '||addr) then raise exception 'location_text_unavailable';end if;
 target:=nullif(p_data->>'place','');
 if p_data->>'kind'='edit' then
 if nullif(p_data->>'osm_id','') is not null and p_data->>'osm_id'<>target then raise exception 'location_source_mismatch';end if;
 if not exists(select 1 from public.places where id=target) then raise exception 'place_unavailable';end if;
 if p_data->>'base_version' is null or (p_data->>'base_version')::integer<>coalesce((select version from public.place_information where place_id=target),0) then raise exception 'place_edit_conflict';end if;
 else
 select id into duplicate from public.places p where p.id=p_data->>'osm_id' or
 (nullif(p_data->>'osm_id','') is null and public.place_search_text(p.name)=public.place_search_text(nm) and public.place_search_text(p.area)=public.place_search_text(addr) and abs(p.latitude-lat)<0.00001 and abs(p.longitude-lon)<0.00001);
 if duplicate is not null then return jsonb_build_object('status','duplicate','place_id',duplicate);end if;
 if exists(select 1 from public.place_submissions p where status='pending' and (p.osm_id=p_data->>'osm_id' or (p.osm_id is null and nullif(p_data->>'osm_id','') is null and public.place_search_text(p.name)=public.place_search_text(nm) and public.place_search_text(p.address)=public.place_search_text(addr) and abs(p.latitude-lat)<0.00001 and abs(p.longitude-lon)<0.00001))) then raise exception 'location_already_pending';end if;
 end if;
 insert into public.place_submissions(author_id,request_id,fingerprint,kind,place_id,name,address,category,latitude,longitude,osm_id,opening_hours,menu_url,base_reviewed_at,source_as_of,base_version)
 values(prof,(p_data->>'request')::uuid,fp,p_data->>'kind',target,nm,addr,category,lat,lon,nullif(p_data->>'osm_id',''),coalesce(p_data->>'opening_hours',''),coalesce(p_data->>'menu_url',''),(select reviewed_at from public.place_information where place_id=target),cached.source_as_of,coalesce((select version from public.place_information where place_id=target),0)) returning * into s;
 insert into public.place_submission_events(submission_id,action) values(s.id,'submitted');
 return jsonb_build_object('id',s.id,'status','pending');
end $$;
create function public.runtime_review_locations(p_account uuid,p_id uuid default null,p_decision text default null,p_version integer default null,p_checked boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.place_submissions;canonical text;begin
 if not exists(select 1 from public.accounts where id=p_account and is_moderator and not banned) then raise exception 'moderator_required';end if;
 if p_id is null then return coalesce((select jsonb_agg((to_jsonb(x)-'author_id'-'fingerprint'-'reviewed_by')||jsonb_build_object('nearby',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.area)) from public.places p where p.id is distinct from x.place_id and public.place_search_text(p.name)=public.place_search_text(x.name) and abs(p.latitude-x.latitude)<0.0008 and abs(p.longitude-x.longitude)<0.001),'[]'))) from public.place_submissions x where status='pending'),'[]');end if;
 perform pg_advisory_xact_lock(2147483000,20);select * into s from public.place_submissions where id=p_id for update;
 if not found or s.status<>'pending' or s.version is distinct from p_version then raise exception 'location_review_conflict';end if;
 if exists(select 1 from public.participant_profiles pp join public.participants p on p.id=pp.participant_id where pp.profile_id=s.author_id and p.account_id=p_account) then raise exception 'cannot_review_own_submission';end if;
 if p_decision not in ('approve','reject') or p_decision is null then raise exception 'invalid_review_decision';end if;
 if p_decision='approve' then
 if p_checked is distinct from true then raise exception 'location_review_checks_required';end if;
 if not exists(select 1 from public.participant_profiles pp where pp.profile_id=s.author_id and public.runtime_can(pp.participant_id,'report')) then raise exception 'location_author_unavailable';end if;
 if s.kind='add' then
 select id into canonical from public.places p where p.id=s.osm_id or (s.osm_id is null and public.place_search_text(p.name)=public.place_search_text(s.name) and public.place_search_text(p.area)=public.place_search_text(s.address) and abs(p.latitude-s.latitude)<0.00001 and abs(p.longitude-s.longitude)<0.00001);
 if canonical is null then canonical:=coalesce(s.osm_id,'community/'||s.id::text);
 insert into public.places values(canonical,s.name,s.address,s.latitude,s.longitude,case when s.osm_id is null then 'Community-reviewed public business' else 'OpenStreetMap snapshot '||coalesce(s.source_as_of::text,'date not recorded')||'; community-reviewed: https://www.openstreetmap.org/'||s.osm_id end);
 else update public.place_submissions set status='duplicate' where id=s.id;end if;
 else canonical:=s.place_id;if s.base_version<>coalesce((select version from public.place_information where place_id=canonical),0) then raise exception 'place_edit_conflict';end if;update public.places set name=s.name,area=s.address,latitude=s.latitude,longitude=s.longitude,source=case when strpos(source,'community-reviewed correction')>0 then source else source||'; community-reviewed correction' end where id=canonical;end if;
 if not exists(select 1 from public.place_submissions where id=s.id and status='duplicate') then
 insert into public.place_information(place_id,category,opening_hours,menu_url,reviewed_at) values(canonical,s.category,s.opening_hours,s.menu_url,now()) on conflict(place_id) do update set category=excluded.category,opening_hours=excluded.opening_hours,menu_url=excluded.menu_url,reviewed_at=now(),version=public.place_information.version+1;
 end if;
 update public.place_submissions set place_id=canonical,status=case when status='duplicate' then status else 'approved' end where id=s.id;
 else update public.place_submissions set status='rejected' where id=s.id;end if;
 update public.place_submissions set version=version+1,reviewed_by=p_account,reviewed_at=now() where id=s.id returning * into s;
 insert into public.place_submission_events(submission_id,action,reviewer_id) values(s.id,s.status,p_account);
 return jsonb_build_object('id',s.id,'status',s.status,'place_id',s.place_id,'version',s.version);
end $$;
-- Own submissions are included in the existing verified parent export; deletion cascades from profiles.
alter function public.runtime_parent(uuid,text,jsonb) rename to runtime_parent_before_locations;
revoke all on function public.runtime_parent_before_locations(uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
create function public.runtime_parent(p_account uuid,p_operation text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;prof uuid;begin
 result:=public.runtime_parent_before_locations(p_account,p_operation,p_data);
 if p_operation='export' then select pp.profile_id into prof from public.participants p join public.participant_profiles pp on pp.participant_id=p.id where p.id=(p_data->>'participant')::uuid and p.account_id=p_account;
 result:=result||jsonb_build_object('location_submissions',coalesce((select jsonb_agg(to_jsonb(s)-'fingerprint'-'author_id'-'reviewed_by') from public.place_submissions s where author_id=prof),'[]'));end if;return result;
end $$;
revoke all on function public.search_places(text),public.place_information_for(text),public.runtime_location_cache(jsonb),public.runtime_locations(text,text,jsonb),public.runtime_review_locations(uuid,uuid,text,integer,boolean),public.runtime_parent(uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.search_places(text),public.place_information_for(text) to anon,authenticated;
grant execute on function public.runtime_location_cache(jsonb),public.runtime_locations(text,text,jsonb),public.runtime_review_locations(uuid,uuid,text,integer,boolean),public.runtime_parent(uuid,text,jsonb) to nugget_broker;
commit;

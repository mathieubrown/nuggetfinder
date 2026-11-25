begin;

create table public.court_cases (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles on delete cascade,
  food_name text not null check (char_length(food_name) between 2 and 80),
  argument text not null check (char_length(argument) between 1 and 280),
  name_key text generated always as (public.moderation_words(food_name)) stored unique,
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closes_at timestamptz,
  check ((opened_at is null and closes_at is null) or closes_at > opened_at)
);
create table public.court_votes (
  case_id bigint not null references public.court_cases on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  verdict text not null check (verdict in ('nugget','adjacent','no')),
  updated_at timestamptz not null default now(),
  primary key (case_id, user_id)
);
create index court_votes_user_time on public.court_votes(user_id, updated_at desc);
create table public.court_locations (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.court_cases on delete cascade,
  place_id text not null references public.places on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now(),
  unique (case_id, place_id)
);
alter table public.court_cases enable row level security;
alter table public.court_votes enable row level security;
alter table public.court_locations enable row level security;
revoke all on public.court_cases, public.court_votes, public.court_locations from public, anon, authenticated;

create function public.discovery_author_visible(p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = p_author and not banned)
    and not exists (
      select 1 from public.user_blocks where
        (user_id = auth.uid() and blocked_id = p_author) or
        (blocked_id = auth.uid() and user_id = p_author)
    )
$$;
create function public.court_visible(p_case bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.court_cases
    where id = p_case and status = 'published' and public.discovery_author_visible(author_id))
$$;

-- LOGIC-START
-- Verdict requires a closed seven-day round, 20 different voters and a 60% winner.
create function public.court_verdict(p_nugget bigint, p_adjacent bigint, p_no bigint, p_closed boolean)
returns text language sql immutable set search_path = '' as $$
  select case
    when not p_closed then 'open'
    when p_nugget + p_adjacent + p_no < 20 then 'insufficient'
    when greatest(p_nugget,p_adjacent,p_no)::numeric / (p_nugget+p_adjacent+p_no) < 0.6 then 'divided'
    when p_nugget > p_adjacent and p_nugget > p_no then 'nugget'
    when p_adjacent > p_nugget and p_adjacent > p_no then 'adjacent'
    when p_no > p_nugget and p_no > p_adjacent then 'no'
    else 'divided'
  end
$$;
-- LOGIC-END

create function public.nominate_court_case(p_name text, p_argument text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
  result bigint;
begin
  p_name := btrim(p_name);
  p_argument := btrim(p_argument);
  if p_name is null or p_argument is null or public.moderation_words(p_name) = ''
    or char_length(p_name) not between 2 and 80 or char_length(p_argument) not between 1 and 280
  then raise exception 'invalid_nomination'; end if;
  if (select count(*) from public.court_cases where author_id = actor and created_at > now() - interval '24 hours') >= 3
  then raise exception 'nomination_limit'; end if;
  insert into public.court_cases(author_id, food_name, argument, status)
  values(actor, p_name, p_argument,
    case when public.social_text_blocked(p_name || ' ' || p_argument) then 'hidden' else 'pending' end)
  returning id into result;
  insert into public.moderation_queue(reporter_id, kind, content_ref)
  values(actor, 'court', result::text);
  return result;
exception when unique_violation then raise exception 'food_already_nominated';
end
$$;

create function public.vote_court(p_case bigint, p_verdict text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
begin
  if p_verdict is null or p_verdict not in ('nugget','adjacent','no') then raise exception 'invalid_verdict'; end if;
  perform 1 from public.court_cases where id = p_case for share;
  if not public.court_visible(p_case) or not exists (
    select 1 from public.court_cases where id = p_case and closes_at > clock_timestamp()
  ) then raise exception 'round_unavailable'; end if;
  if (select count(*) from public.court_votes where user_id = actor and updated_at > now() - interval '24 hours') >= 60
  then raise exception 'vote_limit'; end if;
  insert into public.court_votes(case_id, user_id, verdict) values(p_case, actor, p_verdict)
  on conflict(case_id, user_id) do update set verdict = excluded.verdict, updated_at = now()
  where public.court_votes.updated_at <= now() - interval '5 seconds';
  if not found then raise exception 'vote_cooldown'; end if;
end
$$;

create function public.court_cases(p_id bigint default null, p_guide boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  with totals as (
    select c.id, c.author_id, c.food_name, c.argument, c.opened_at, c.closes_at,
      count(v.user_id) filter(where v.verdict = 'nugget' and p.id is not null) as nugget,
      count(v.user_id) filter(where v.verdict = 'adjacent' and p.id is not null) as adjacent,
      count(v.user_id) filter(where v.verdict = 'no' and p.id is not null) as no,
      max(v.verdict) filter(where v.user_id = auth.uid()) as mine
    from public.court_cases c
    left join public.court_votes v on v.case_id = c.id
    left join public.profiles p on p.id = v.user_id and not p.banned
    where public.court_visible(c.id) and (p_id is null or c.id = p_id)
    group by c.id
  ), results as (
    select t.*, public.court_verdict(nugget, adjacent, no, closes_at <= now()) as verdict
    from totals t
  )
  select coalesce(jsonb_agg(r order by r.opened_at desc, r.id desc), '[]'::jsonb)
  from (
    select * from results where not p_guide or verdict in ('nugget','adjacent')
    order by opened_at desc, id desc limit 100
  ) r
$$;

create function public.suggest_court_location(p_case bigint, p_place text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
  location_id bigint;
begin
  if not public.court_visible(p_case) then raise exception 'case_unavailable'; end if;
  if (select count(*) from public.court_locations where author_id = actor and created_at > now() - interval '24 hours') >= 10
  then raise exception 'location_limit'; end if;
  insert into public.court_locations(case_id, place_id, author_id)
  values(p_case, p_place, actor) on conflict(case_id, place_id) do nothing
  returning id into location_id;
  if location_id is null then raise exception 'location_already_suggested'; end if;
  insert into public.moderation_queue(reporter_id, kind, content_ref)
  values(actor, 'court_location', location_id::text);
end
$$;
create function public.court_locations(p_case bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'place_id', l.place_id,
    'name', p.name, 'area', p.area, 'author_id', l.author_id) order by l.id), '[]'::jsonb)
  from public.court_locations l join public.places p on p.id = l.place_id
  where l.case_id = p_case and l.status = 'published' and public.court_visible(p_case)
    and public.discovery_author_visible(l.author_id)
$$;
create function public.discovery_targets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(p order by p.name,p.area,p.id), '[]'::jsonb)
  from (select id,name,area from public.places order by name,area,id limit 1000) p
$$;

-- Extend the moderation desk without altering earlier, applied migrations.
alter function public.moderation_content(text,text) rename to moderation_core_content;
create function public.moderation_content(p_kind text, p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when p_kind in ('court','court_report') then (
      select jsonb_build_object('body', food_name || ': ' || argument, 'subject_id', author_id)
      from public.court_cases where id::text = p_ref
    )
    when p_kind in ('court_location','court_location_report') then (
      select jsonb_build_object('body', c.food_name || ' at ' || p.name || ' ' || p.area, 'subject_id', l.author_id)
      from public.court_locations l join public.court_cases c on c.id = l.case_id
      join public.places p on p.id = l.place_id where l.id::text = p_ref
    )
    else public.moderation_core_content(p_kind, p_ref)
  end
$$;
create function public.sync_court_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('approve','hide') then return new; end if;
  if new.kind = 'court' then
    update public.court_cases
    set status = case new.status when 'approve' then 'published' else 'hidden' end,
      opened_at = case when new.status = 'approve' then coalesce(opened_at,now()) else opened_at end,
      closes_at = case when new.status = 'approve' then coalesce(closes_at,now()+interval '7 days') else closes_at end
    where id::text = new.content_ref;
  elsif new.kind = 'court_location' then
    update public.court_locations set status = case new.status when 'approve' then 'published' else 'hidden' end
    where id::text = new.content_ref;
  elsif new.kind = 'court_report' and new.status = 'hide' then
    update public.court_cases set status = 'hidden' where id::text = new.content_ref;
  elsif new.kind = 'court_location_report' and new.status = 'hide' then
    update public.court_locations set status = 'hidden' where id::text = new.content_ref;
  end if;
  return new;
end
$$;
create trigger court_review after update of status on public.moderation_queue
for each row execute function public.sync_court_review();

create function public.report_discovery(p_kind text, p_ref text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
  report_id bigint;
begin
  if p_kind = 'court' then
    if not exists(select 1 from public.court_cases where id::text = p_ref and public.court_visible(id))
    then raise exception 'invalid_content'; end if;
  elsif p_kind = 'court_location' then
    if not exists(select 1 from public.court_locations where id::text = p_ref and status = 'published' and public.court_visible(case_id))
    then raise exception 'invalid_content'; end if;
  else raise exception 'invalid_content'; end if;
  if p_reason is null or p_reason not in ('abuse','spam','other') then raise exception 'invalid_reason'; end if;
  if (select count(*) from public.content_reports where reporter_id = actor and created_at > now() - interval '24 hours') >= 20
  then raise exception 'report_limit'; end if;
  insert into public.content_reports(reporter_id,kind,content_ref,reason)
  values(actor,p_kind,p_ref,p_reason) on conflict do nothing returning id into report_id;
  if report_id is not null then
    insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,p_kind || '_report',p_ref);
  end if;
end
$$;
alter table public.content_reports drop constraint content_reports_kind_check;
alter table public.content_reports add check(kind in ('username','take','reply','court','court_location'));

alter function public.discovery_subject(text,text) rename to discovery_saved_subject;
create function public.discovery_subject(p_kind text, p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'court' then (
    select jsonb_build_object('name', food_name, 'page', 'court') from public.court_cases
    where id::text = p_ref and public.court_visible(id)
  ) else public.discovery_saved_subject(p_kind,p_ref) end
$$;

alter table public.takes drop constraint takes_subject_kind_check;
alter table public.takes add check(subject_kind in ('place','product','matchup','court'));
create or replace function public.social_subject_exists(p_kind text, p_ref text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.discovery_subject(p_kind,p_ref) is not null
$$;
create or replace function public.take_visible(p_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.takes t where t.id = p_id and t.status = 'published'
    and public.discovery_author_visible(t.author_id)
    and (t.subject_kind <> 'court' or exists (
      select 1 from public.court_cases c where c.id::text = t.subject_ref and public.court_visible(c.id)
    )))
$$;
create or replace function public.community_feed(p_tab text,p_before bigint default null)
returns table(id bigint,author_id uuid,handle text,subject_kind text,subject_ref text,body text,created_at timestamptz,following boolean)
language sql stable security definer set search_path = '' as $$
  select t.id,t.author_id,p.handle,t.subject_kind,t.subject_ref,t.body,t.created_at,f.followed_id is not null
  from public.takes t join public.profiles p on p.id = t.author_id
  left join public.user_follows f on f.user_id = auth.uid() and f.followed_id = t.author_id
  where public.take_visible(t.id) and p_tab in ('hot','recent','following')
    and (p_before is null or t.id < p_before)
    and (p_tab <> 'following' or f.followed_id is not null)
  order by case when p_tab = 'hot' then public.take_heat(t.id)/power(2,extract(epoch from now()-t.created_at)/86400) end desc,
    t.created_at desc,t.id desc limit 50
$$;
create function public.court_takes(p_case bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    select t.id,t.author_id,p.handle,t.subject_kind,t.subject_ref,t.body,t.created_at
    from public.takes t join public.profiles p on p.id=t.author_id
    where t.subject_kind='court' and t.subject_ref=p_case::text and public.take_visible(t.id)
    order by t.created_at desc,t.id desc limit 50
  ) t
$$;

alter function public.export_discovery_data() rename to export_saved_data;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return public.export_saved_data() || jsonb_build_object(
    'court_nominations', coalesce((select jsonb_agg(c) from public.court_cases c where author_id=auth.uid()),'[]'::jsonb),
    'court_votes', coalesce((select jsonb_agg(v) from public.court_votes v where user_id=auth.uid()),'[]'::jsonb),
    'court_locations', coalesce((select jsonb_agg(l) from public.court_locations l where author_id=auth.uid()),'[]'::jsonb)
  );
end
$$;

revoke execute on function public.discovery_author_visible(uuid),public.court_visible(bigint),
  public.court_verdict(bigint,bigint,bigint,boolean),public.moderation_content(text,text),public.sync_court_review(),
  public.discovery_subject(text,text),public.export_saved_data() from public,anon,authenticated;
revoke execute on function public.nominate_court_case(text,text),public.vote_court(bigint,text),
  public.suggest_court_location(bigint,text),public.report_discovery(text,text,text),
  public.export_discovery_data(),public.court_cases(bigint,boolean),public.court_locations(bigint),
  public.discovery_targets(),public.court_takes(bigint) from public,anon,authenticated;
grant execute on function public.nominate_court_case(text,text),public.vote_court(bigint,text),
  public.suggest_court_location(bigint,text),public.report_discovery(text,text,text),public.export_discovery_data() to authenticated;
grant execute on function public.court_cases(bigint,boolean),public.court_locations(bigint),
  public.discovery_targets(),public.court_takes(bigint) to anon,authenticated;

commit;

begin;

create table public.discovery_trails (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles on delete cascade,
  title text not null check(char_length(title) between 2 and 80),
  summary text not null check(char_length(summary) between 1 and 280),
  status text not null default 'pending' check(status in ('pending','published','hidden')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discovery_trails_author_time on public.discovery_trails(author_id,created_at desc);
create table public.trail_stops (
  trail_id bigint not null references public.discovery_trails on delete cascade,
  place_id text not null references public.places on delete cascade,
  position smallint not null check(position between 1 and 20),
  primary key(trail_id,place_id),
  unique(trail_id,position) deferrable initially deferred
);
create table public.trail_progress (
  user_id uuid not null references public.profiles on delete cascade,
  trail_id bigint not null,
  place_id text not null,
  marked_at timestamptz not null default now(),
  primary key(user_id,trail_id,place_id),
  foreign key(trail_id,place_id) references public.trail_stops(trail_id,place_id) on delete cascade
);
alter table public.discovery_trails enable row level security;
alter table public.trail_stops enable row level security;
alter table public.trail_progress enable row level security;
revoke all on public.discovery_trails,public.trail_stops,public.trail_progress from public,anon,authenticated;

create function public.trail_visible(p_trail bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.discovery_trails
    where id=p_trail and status='published' and public.discovery_author_visible(author_id))
$$;

create function public.submit_discovery_trail(p_title text,p_summary text,p_places text[],p_id bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
  target public.discovery_trails;
  result bigint;
  version integer;
  visibility text;
begin
  p_title := btrim(p_title);
  p_summary := btrim(p_summary);
  if p_title is null or p_summary is null or char_length(p_title) not between 2 and 80
    or char_length(p_summary) not between 1 and 280 or public.moderation_words(p_title)=''
    or p_places is null or cardinality(p_places) not between 1 and 20
    or (select count(distinct p.id) from unnest(p_places) selected(id) join public.places p on p.id=selected.id) <> cardinality(p_places)
  then raise exception 'invalid_trail'; end if;
  visibility := case when public.social_text_blocked(p_title || ' ' || p_summary) then 'hidden' else 'pending' end;
  if p_id is null then
    if (select count(*) from public.discovery_trails where author_id=actor and created_at>now()-interval '24 hours') >= 3
    then raise exception 'trail_limit'; end if;
    insert into public.discovery_trails(author_id,title,summary,status)
    values(actor,p_title,p_summary,visibility) returning id,revision into result,version;
  else
    select * into target from public.discovery_trails where id=p_id and author_id=actor for update;
    if not found then raise exception 'trail_unavailable'; end if;
    if target.updated_at>now()-interval '2 minutes' then raise exception 'trail_edit_cooldown'; end if;
    update public.discovery_trails set title=p_title,summary=p_summary,status=visibility,
      revision=revision+1,updated_at=now()
    where id=p_id returning id,revision into result,version;
    -- Removing a stop removes its progress. Reordering retained stops preserves progress.
    delete from public.trail_stops where trail_id=p_id and not (place_id=any(p_places));
    update public.trail_stops s set position=selected.ordinal::smallint
    from unnest(p_places) with ordinality selected(id,ordinal)
    where s.trail_id=p_id and s.place_id=selected.id;
  end if;
  insert into public.trail_stops(trail_id,place_id,position)
  select result,id,ordinal::smallint from unnest(p_places) with ordinality selected(id,ordinal)
  where not exists(select 1 from public.trail_stops where trail_id=result and place_id=selected.id);
  insert into public.moderation_queue(reporter_id,kind,content_ref)
  values(actor,'trail',result::text || ':' || version::text);
  return result;
end
$$;

create function public.list_trails(p_id bigint default null,p_mine boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t order by t.updated_at desc,t.id desc),'[]'::jsonb) from (
    select t.id,t.author_id,p.handle,t.title,t.summary,t.status,t.revision,t.updated_at,
      (select count(*) from public.trail_stops where trail_id=t.id) as stop_count,
      (select count(*) from public.trail_progress where trail_id=t.id and user_id=auth.uid()) as visited,
      coalesce((select jsonb_agg(jsonb_build_object('id',s.place_id,'name',p.name,'area',p.area,
        'position',s.position,'tried',exists(select 1 from public.trail_progress
          where user_id=auth.uid() and trail_id=s.trail_id and place_id=s.place_id)) order by s.position)
        from public.trail_stops s join public.places p on p.id=s.place_id where s.trail_id=t.id),'[]'::jsonb) as stops
    from public.discovery_trails t join public.profiles p on p.id=t.author_id
    where (p_id is null or t.id=p_id)
      and case when p_mine then t.author_id=auth.uid()
        else public.trail_visible(t.id) or (p_id is not null and t.author_id=auth.uid()) end
    order by t.updated_at desc,t.id desc limit 100
  ) t
$$;

create function public.mark_trail_stop(p_trail bigint,p_place text,p_tried boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
begin
  if p_tried is null then raise exception 'invalid_progress'; end if;
  if not p_tried then
    delete from public.trail_progress where user_id=actor and trail_id=p_trail and place_id=p_place;
    return;
  end if;
  perform 1 from public.discovery_trails where id=p_trail for share;
  if not public.trail_visible(p_trail) or not exists(
    select 1 from public.trail_stops where trail_id=p_trail and place_id=p_place
  ) then raise exception 'trail_unavailable'; end if;
  insert into public.trail_progress(user_id,trail_id,place_id)
  values(actor,p_trail,p_place) on conflict do nothing;
end
$$;

alter function public.moderation_content(text,text) rename to moderation_court_content;
create function public.moderation_content(p_kind text,p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_kind in ('trail','trail_report') then coalesce((
    select jsonb_build_object('body',title || ': ' || summary,'subject_id',author_id)
    from public.discovery_trails where id::text || ':' || revision::text=p_ref
  ),jsonb_build_object('body','This trail version has been superseded.'))
  else public.moderation_court_content(p_kind,p_ref) end
$$;
create function public.sync_trail_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind='trail' and new.status in ('approve','hide') then
    update public.discovery_trails set status=case new.status when 'approve' then 'published' else 'hidden' end
    where id::text || ':' || revision::text=new.content_ref;
  elsif new.kind='trail_report' and new.status='hide' then
    update public.discovery_trails set status='hidden'
    where id::text || ':' || revision::text=new.content_ref;
  end if;
  return new;
end
$$;
create trigger trail_review after update of status on public.moderation_queue
for each row execute function public.sync_trail_review();

alter table public.content_reports drop constraint content_reports_kind_check;
alter table public.content_reports add check(kind in ('username','take','reply','court','court_location','trail'));
alter function public.report_discovery(text,text,text) rename to report_court_discovery;
create function public.report_discovery(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
  version_ref text;
  report_id bigint;
begin
  if p_kind is null then raise exception 'invalid_content'; end if;
  if p_kind <> 'trail' then
    perform public.report_court_discovery(p_kind,p_ref,p_reason);
    return;
  end if;
  if p_reason is null or p_reason not in ('abuse','spam','other') then raise exception 'invalid_reason'; end if;
  select id::text || ':' || revision::text into version_ref
  from public.discovery_trails where id::text=p_ref and public.trail_visible(id);
  if version_ref is null then raise exception 'invalid_content'; end if;
  if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=20
  then raise exception 'report_limit'; end if;
  insert into public.content_reports(reporter_id,kind,content_ref,reason)
  values(actor,'trail',version_ref,p_reason) on conflict do nothing returning id into report_id;
  if report_id is not null then
    insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,'trail_report',version_ref);
  end if;
end
$$;

alter function public.discovery_subject(text,text) rename to discovery_court_subject;
create function public.discovery_subject(p_kind text,p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_kind='trail' then (
    select jsonb_build_object('name',title,'page','trail') from public.discovery_trails
    where id::text=p_ref and public.trail_visible(id)
  ) else public.discovery_court_subject(p_kind,p_ref) end
$$;

alter function public.export_discovery_data() rename to export_court_data;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return public.export_court_data() || jsonb_build_object(
    'trails',coalesce((select jsonb_agg(t) from public.discovery_trails t where author_id=auth.uid()),'[]'::jsonb),
    'trail_stops',coalesce((select jsonb_agg(s) from public.trail_stops s join public.discovery_trails t on t.id=s.trail_id
      where t.author_id=auth.uid()),'[]'::jsonb),
    'trail_progress',coalesce((select jsonb_agg(p) from public.trail_progress p where user_id=auth.uid()),'[]'::jsonb)
  );
end
$$;

revoke execute on function public.trail_visible(bigint),public.moderation_content(text,text),public.sync_trail_review(),
  public.report_court_discovery(text,text,text),public.discovery_subject(text,text),public.export_court_data()
  from public,anon,authenticated;
revoke execute on function public.submit_discovery_trail(text,text,text[],bigint),public.list_trails(bigint,boolean),
  public.mark_trail_stop(bigint,text,boolean),public.report_discovery(text,text,text),public.export_discovery_data()
  from public,anon,authenticated;
grant execute on function public.list_trails(bigint,boolean) to anon,authenticated;
grant execute on function public.submit_discovery_trail(text,text,text[],bigint),public.mark_trail_stop(bigint,text,boolean),
  public.report_discovery(text,text,text),public.export_discovery_data() to authenticated;
commit;

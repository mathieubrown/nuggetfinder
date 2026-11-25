begin;
alter table public.takes add column stamp text check(stamp in ('sauce_heretic','certified_tender','nope'));
alter table public.takes add column parent_take_id bigint references public.takes on delete set null;
alter table public.takes add column tagged_user_id uuid references public.profiles on delete set null;
alter table public.takes add column attached_place_id text references public.places on delete set null;
create index takes_parent on public.takes(parent_take_id,created_at desc);
create index takes_subject on public.takes(subject_kind,subject_ref,created_at desc);

-- A hidden or blocked ancestor hides the rebuttal thread too. Maximum thread depth is four.
create or replace function public.take_visible(p_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
  with recursive ancestors as (
    select id,parent_take_id,author_id,status,subject_kind,subject_ref,1 depth
    from public.takes where id=p_id
    union all
    select t.id,t.parent_take_id,t.author_id,t.status,t.subject_kind,t.subject_ref,a.depth+1
    from public.takes t join ancestors a on t.id=a.parent_take_id where a.depth<5
  )
  select exists(select 1 from ancestors)
    and not exists(select 1 from ancestors where depth>4 or status<>'published'
      or not public.discovery_author_visible(author_id)
      or (subject_kind='court' and not exists(
        select 1 from public.court_cases c where c.id::text=subject_ref and public.court_visible(c.id))))
$$;

create function public.submit_context_take(p_kind text,p_ref text,p_body text,p_stamp text default null,
  p_parent bigint default null,p_tagged uuid default null,p_place text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=public.require_social_user();
  parent public.takes;
  ancestor bigint;
  depth integer:=0;
  result bigint;
  visibility text;
begin
  p_body:=btrim(p_body);
  if p_body is null or char_length(p_body) not between 1 and 280
    or not public.social_subject_exists(p_kind,p_ref)
    or (p_stamp is not null and p_stamp not in ('sauce_heretic','certified_tender','nope'))
  then raise exception 'invalid_take'; end if;
  if p_parent is not null then
    select * into parent from public.takes where id=p_parent;
    if not found or not public.take_visible(p_parent) or parent.subject_kind<>p_kind or parent.subject_ref<>p_ref
    then raise exception 'rebuttal_unavailable'; end if;
    ancestor:=p_parent;
    while ancestor is not null loop
      depth:=depth+1;
      if depth>=4 then raise exception 'thread_depth_limit'; end if;
      select parent_take_id into ancestor from public.takes where id=ancestor;
    end loop;
  end if;
  if p_tagged is not null and not public.discovery_author_visible(p_tagged) then raise exception 'tag_unavailable'; end if;
  if p_place is not null and not exists(select 1 from public.places where id=p_place) then raise exception 'place_unavailable'; end if;
  if p_kind='place' then
    if p_place is not null and p_place<>p_ref then raise exception 'place_mismatch'; end if;
    p_place:=p_ref;
  end if;
  if (select count(*) from public.takes where author_id=actor and created_at>now()-interval '24 hours')>=10
  then raise exception 'take_limit'; end if;
  visibility:=case when public.social_text_blocked(p_body) then 'hidden'
    when exists(select 1 from public.takes where author_id=actor and status='published') then 'published'
    else 'pending' end;
  insert into public.takes(author_id,subject_kind,subject_ref,body,status,stamp,parent_take_id,tagged_user_id,attached_place_id)
  values(actor,p_kind,p_ref,p_body,visibility,p_stamp,p_parent,p_tagged,p_place) returning id into result;
  if visibility<>'published' then
    insert into public.moderation_queue(reporter_id,kind,content_ref,ai_label)
    values(actor,'take',result::text,case when visibility='hidden' then 'blocked_term' end);
  end if;
  return jsonb_build_object('id',result,'status',visibility);
end $$;

-- Preserve the normal entry point used by the currently deployed app.
create or replace function public.submit_take(p_kind text,p_ref text,p_body text)
returns text language sql security definer set search_path='' as $$
  select public.submit_context_take(p_kind,p_ref,p_body)->>'status'
$$;

create function public.take_cards(p_kind text default null,p_ref text default null,p_sort text default 'hot',
  p_parent bigint default null,p_take bigint default null,p_following boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(card),'[]'::jsonb) from (
    select t.id,t.author_id,p.handle,t.body,t.created_at,t.subject_kind,t.subject_ref,t.stamp,t.parent_take_id,
      case when public.discovery_author_visible(t.tagged_user_id)
        then (select handle from public.profiles where id=t.tagged_user_id) end as tagged_handle,
      case when public.discovery_author_visible(t.tagged_user_id) then t.tagged_user_id end as tagged_user_id,
      case when t.parent_take_id is not null then
        (select p.handle from public.takes parent join public.profiles p on p.id=parent.author_id where parent.id=t.parent_take_id)
      end as parent_handle,
      t.attached_place_id,
      (select name from public.places where id=t.attached_place_id) as place_name,
      (select side from public.matchup_votes where matchup_id=t.subject_ref and user_id=t.author_id
        and t.subject_kind='matchup') as team,
      (select case v.side when 'left' then m.left_label else m.right_label end
        from public.matchup_votes v join public.matchups m on m.id=v.matchup_id
        where v.matchup_id=t.subject_ref and v.user_id=t.author_id and t.subject_kind='matchup') as team_label,
      (select count(*) from public.take_reactions r join public.profiles p on p.id=r.user_id and not p.banned
        where r.take_id=t.id and r.reaction='against') as clowned,
      (select count(*) from public.takes child where child.parent_take_id=t.id and public.take_visible(child.id)) as rebuttals,
      (select reaction from public.take_reactions where take_id=t.id and user_id=auth.uid()) as reaction,
      public.discovery_subject(t.subject_kind,t.subject_ref) as subject
    from public.takes t join public.profiles p on p.id=t.author_id
    where public.take_visible(t.id) and p_sort in ('hot','new')
      and (p_kind is null or t.subject_kind=p_kind) and (p_ref is null or t.subject_ref=p_ref)
      and case when p_take is not null then t.id=p_take
        when p_parent is not null then t.parent_take_id=p_parent else t.parent_take_id is null end
      and (not p_following or exists(select 1 from public.user_follows where user_id=auth.uid() and followed_id=t.author_id))
    order by case when p_sort='hot' then public.take_heat(t.id)/power(2,extract(epoch from now()-t.created_at)/86400) end desc,
      t.created_at desc,t.id desc limit 50
  ) card
$$;

create or replace function public.place_screen(p_place text)
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
      select t.id,t.author_id,p.handle,t.body,t.created_at,t.subject_kind,t.subject_ref,t.stamp,t.parent_take_id,
        (select side from public.matchup_votes where matchup_id=t.subject_ref and user_id=t.author_id
          and t.subject_kind='matchup') as team
      from public.takes t join public.profiles p on p.id=t.author_id
      where (t.subject_kind='place' and t.subject_ref=p_place or t.attached_place_id=p_place)
        and public.take_visible(t.id)
      order by public.take_heat(t.id) desc,t.created_at desc limit 6
    ) t),'[]'::jsonb)
  ) from public.places where id=p_place
$$;

revoke execute on function public.submit_context_take(text,text,text,text,bigint,uuid,text),
  public.take_cards(text,text,text,bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.submit_context_take(text,text,text,text,bigint,uuid,text) to authenticated;
grant execute on function public.take_cards(text,text,text,bigint,bigint,boolean) to anon,authenticated;
-- Existing own-data exports serialize takes with to_jsonb and include the new columns.
commit;

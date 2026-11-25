begin;
-- Posting restrictions never remove the ability to report or block. Bans, age checks,
-- structured targets/reasons and existing safety rate limits remain enforced.
create function public.require_safety_user()
returns uuid language plpgsql security definer set search_path='' as $$
declare profile public.profiles;
begin
 select * into profile from public.profiles where id=auth.uid() for update;
 if not found then raise exception 'sign_in_required'; end if;
 if profile.banned or not profile.age_confirmed then raise exception 'posting_unavailable'; end if;
 return profile.id;
end $$;
revoke execute on function public.require_safety_user() from public,anon,authenticated;
create or replace function public.set_user_block(p_user uuid, p_block boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_safety_user();
begin
  if p_user is null or p_user = actor or p_block is null then raise exception 'invalid_block'; end if;
  if not p_block then
    delete from public.user_blocks where user_id = actor and blocked_id = p_user;
    return;
  end if;
  if (select count(*) from public.user_blocks where user_id = actor) >= 500
    and not exists(select 1 from public.user_blocks where user_id = actor and blocked_id = p_user)
  then raise exception 'block_limit'; end if;
  insert into public.user_blocks(user_id,blocked_id) values(actor,p_user) on conflict do nothing;
  delete from public.user_follows
  where (user_id = actor and followed_id = p_user) or (user_id = p_user and followed_id = actor);
end
$$;

create or replace function public.report_content(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_safety_user(); report_id bigint;
begin
 if not coalesce((p_kind='username' and exists(select 1 from public.profiles where id::text=p_ref))
 or (p_kind='take' and exists(select 1 from public.takes where id::text=p_ref and public.take_visible(id)))
 or (p_kind='reply' and exists(select 1 from public.take_replies where id::text=p_ref and status='published' and public.take_visible(take_id))),false)
 then raise exception 'invalid_content'; end if;
 if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=20
 then raise exception 'report_limit'; end if;
 insert into public.content_reports(reporter_id,kind,content_ref,reason) values(actor,p_kind,p_ref,p_reason)
 on conflict do nothing returning id into report_id;
 if report_id is not null then insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,p_kind,p_ref); end if;
end $$;
create or replace function public.report_court_discovery(p_kind text, p_ref text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_safety_user();
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
create or replace function public.report_discovery(p_kind text,p_ref text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_safety_user();
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


-- A syntactically plausible OSM ID is not evidence that a store exists.
-- The reviewed places table is the authoritative reporting target catalog.
create function public.require_catalog_report_place()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.places where id=new.place_id) then raise exception 'invalid_place'; end if;
 return new;
end $$;
revoke execute on function public.require_catalog_report_place() from public,anon,authenticated;
create trigger report_catalog_target before insert on public.reports
for each row execute function public.require_catalog_report_place();
commit;

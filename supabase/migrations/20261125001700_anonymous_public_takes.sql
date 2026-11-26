begin;
-- Public authorship is its own verified capability for every age. Minor identities stay private.
alter table public.participation_readiness drop constraint participation_readiness_capability_check;
alter table public.participation_readiness add check(capability in ('discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social','public_take'));
alter table public.participant_permissions drop constraint participant_permissions_capability_check;
alter table public.participant_permissions add check(capability in ('discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social','public_take'));
insert into public.participation_readiness(age_band,capability) values('under13','public_take'),('teen','public_take'),('adult','public_take');
create function public.runtime_public_author(p_profile uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_profile and not p.banned
 and case when exists(select 1 from public.participant_profiles where profile_id=p.id)
 then exists(select 1 from public.participant_profiles l where l.profile_id=p.id and public.runtime_can(l.participant_id,'public_take'))
 else p.public_identity and not (select cutover from public.runtime_controls) end)
$$;
create function public.runtime_public_take(p_take bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.takes where id=p_take and status='published' and parent_take_id is null and public.runtime_public_author(author_id) and not public.social_text_blocked(body))
$$;
create function public.runtime_public_feed(p_participant uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(t),'[]') from (select t.id,t.subject_kind,t.subject_ref,t.body,case when p.public_identity then t.created_at else date_trunc('day',t.created_at) end as created_at,
 case when p.public_identity then p.handle else 'Anonymous nugget fan' end as handle,
 coalesce((select jsonb_agg(e.id) from public.photo_evidence e join public.photo_evidence_links l on l.evidence_id=e.id and l.kind='take' and l.content_ref=t.id::text where public.runtime_photo_public(e.id,'thumb') is not null),'[]') as photos,
 t.author_id=(select profile_id from public.participant_profiles where participant_id=p_participant) as mine
 from public.takes t join public.profiles p on p.id=t.author_id where public.runtime_public_take(t.id)
 and not exists(select 1 from public.user_blocks b where (b.user_id=(select profile_id from public.participant_profiles where participant_id=p_participant) and b.blocked_id=t.author_id) or (b.blocked_id=(select profile_id from public.participant_profiles where participant_id=p_participant) and b.user_id=t.author_id))
 order by t.created_at desc,t.id desc limit 100) t
$$;
create function public.runtime_public_respond(p_participant uuid,p_take bigint,p_reaction text,p_body text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid; target uuid; visibility text; reply bigint;
begin
 actor:=public.require_social_user();
 if not public.runtime_public_take(p_take) then raise exception 'take_unavailable';end if;
 select author_id into target from public.takes where id=p_take;
 if exists(select 1 from public.user_blocks where (user_id=actor and blocked_id=target) or (user_id=target and blocked_id=actor)) then raise exception 'take_unavailable';end if;
 if p_reaction in ('with','against') and p_body is null then
  if target=actor then raise exception 'cannot_react_to_own_take';end if;
  if (select count(*) from public.take_reactions where user_id=actor and updated_at>now()-interval '24 hours')>=60 then raise exception 'reaction_limit';end if;
  insert into public.take_reactions(take_id,user_id,reaction) values(p_take,actor,p_reaction) on conflict(take_id,user_id) do update set reaction=excluded.reaction,updated_at=now() where public.take_reactions.updated_at<=now()-interval '5 seconds';
  if not found then raise exception 'reaction_cooldown';end if;return 'saved';
 end if;
 -- No unsolicited free-text contact to or from a private identity. Private crews handle replies.
 if not exists(select 1 from public.profiles where id=actor and public_identity) or not exists(select 1 from public.profiles where id=target and public_identity) then raise exception 'use_private_crew_social';end if;
 perform public.runtime_review_capacity('text');
 if p_reaction is not null or p_body is null or char_length(btrim(p_body)) not between 1 and 180 then raise exception 'invalid_reply';end if;
 if (select count(*) from public.take_replies where author_id=actor and created_at>now()-interval '24 hours')>=15 then raise exception 'reply_limit';end if;
 visibility:=case when public.social_text_blocked(p_body) then 'hidden' else 'pending' end;
 insert into public.take_replies(take_id,author_id,body,status) values(p_take,actor,btrim(p_body),visibility) returning id into reply;
 insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,'reply',reply::text);return visibility;
end $$;
create function public.runtime_public_report(p_take bigint,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_safety_user();report bigint;
begin
 if not public.runtime_public_take(p_take) or p_reason not in ('abuse','spam','other') then raise exception 'invalid_content';end if;
 if (select count(*) from public.content_reports where reporter_id=actor and created_at>now()-interval '24 hours')>=20 then raise exception 'report_limit';end if;
 insert into public.content_reports(reporter_id,kind,content_ref,reason) values(actor,'take',p_take::text,p_reason) on conflict do nothing returning id into report;
 if report is not null then insert into public.moderation_queue(reporter_id,kind,content_ref) values(actor,'take',p_take::text);end if;
end $$;
create function public.runtime_public_responses(p_participant uuid,p_take bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when public.runtime_public_take(p_take) then jsonb_build_object(
 'with',(select count(*) from public.take_reactions r join public.profiles p on p.id=r.user_id and not p.banned where r.take_id=p_take and r.reaction='with'),
 'against',(select count(*) from public.take_reactions r join public.profiles p on p.id=r.user_id and not p.banned where r.take_id=p_take and r.reaction='against'),
 'mine',(select reaction from public.take_reactions where take_id=p_take and user_id=(select profile_id from public.participant_profiles where participant_id=p_participant)),
 'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'handle',p.handle)) from public.take_replies r join public.profiles p on p.id=r.author_id and p.public_identity and not p.banned where r.take_id=p_take and r.status='published' and public.runtime_public_author(r.author_id) and not public.social_text_blocked(r.body)),'[]')) end
$$;
-- Legacy readers do not emit private author IDs. The new projection above emits no author IDs.
create or replace function public.discovery_author_visible(p_author uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_author and public_identity and not banned)
 and (not exists(select 1 from public.participant_profiles where profile_id=p_author) or public.runtime_public_author(p_author))
 and not exists(select 1 from public.user_blocks where (user_id=auth.uid() and blocked_id=p_author) or (blocked_id=auth.uid() and user_id=p_author))
$$;
create function public.runtime_guard_private_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema='auth' then
  if exists(select 1 from public.participants where id=new.id and managed) then raise exception 'managed_profiles_are_not_auth_accounts';end if;
 elsif new.public_identity and exists(select 1 from public.participant_profiles l join public.participants p on p.id=l.participant_id where l.profile_id=new.id and p.age_band<>'adult') then raise exception 'private_participant_identity_required';
 end if;return new;
end $$;
create trigger no_child_auth_accounts before insert on auth.users for each row execute function public.runtime_guard_private_identity();
create trigger no_public_minor_identities before update of public_identity on public.profiles for each row execute function public.runtime_guard_private_identity();
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('runtime_public_author','runtime_public_take','runtime_public_feed','runtime_public_respond','runtime_public_report','runtime_public_responses','runtime_guard_private_identity') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated,nugget_broker,nugget_consent_verifier';end loop;end $$;
commit;

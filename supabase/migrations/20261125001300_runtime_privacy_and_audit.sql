begin;
create table public.crew_reports (
 take_id uuid references public.crew_takes on delete cascade,reporter_id uuid references public.participants on delete cascade,
 created_at timestamptz not null default now(),primary key(take_id,reporter_id)
);
create table public.crew_blocks (
 participant_id uuid references public.participants on delete cascade,blocked_id uuid references public.participants on delete cascade,
 created_at timestamptz not null default now(),primary key(participant_id,blocked_id),check(participant_id<>blocked_id)
);
create table public.erasure_photo_refs (
 job_id uuid references public.account_erasure_jobs on delete cascade,evidence_id uuid references public.photo_evidence on delete cascade,
 primary key(job_id,evidence_id)
);
alter table public.crew_reports enable row level security;alter table public.crew_blocks enable row level security;alter table public.erasure_photo_refs enable row level security;
revoke all on public.crew_reports,public.crew_blocks,public.erasure_photo_refs from public,anon,authenticated,nugget_broker;
alter table public.photo_evidence_events add column reviewer_id uuid references public.profiles on delete set null;
alter table public.photo_evidence_events add column checks jsonb check(checks is null or jsonb_typeof(checks)='object' and octet_length(checks::text)<=512);
create function public.runtime_export_participant(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'product_ratings',coalesce((select jsonb_agg(to_jsonb(r)) from public.product_ratings r where profile_id=(select profile_id from public.participant_profiles where participant_id=p_id)),'[]'),
 'rankings',coalesce((select jsonb_agg(to_jsonb(r)) from public.participant_rankings r where participant_id=p_id),'[]'),
 'crews_created',coalesce((select jsonb_agg(to_jsonb(r)) from public.private_crews r where owner_id=p_id),'[]'),
 'crew_memberships',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_members r where participant_id=p_id),'[]'),
 'crew_takes',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_takes r where participant_id=p_id),'[]'),
 'crew_reactions',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_reactions r where participant_id=p_id),'[]'),
 'crew_challenges',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_challenges r where creator_id=p_id),'[]'),
 'crew_votes',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_votes r where participant_id=p_id),'[]'),
 'crew_reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_reports r where reporter_id=p_id),'[]'),
 'crew_blocks',coalesce((select jsonb_agg(to_jsonb(r)) from public.crew_blocks r where participant_id=p_id),'[]'),
 'permission_events',coalesce((select jsonb_agg(to_jsonb(r)) from public.participant_permission_events r where participant_id=p_id),'[]'),
 'photo_links',coalesce((select jsonb_agg(to_jsonb(r)) from public.photo_evidence_links r join public.photo_evidence e on e.id=r.evidence_id where e.participant_id=p_id),'[]'),
 'photo_events',coalesce((select jsonb_agg(to_jsonb(r)-'reviewer_id') from public.photo_evidence_events r join public.photo_evidence e on e.id=r.evidence_id where e.participant_id=p_id),'[]'))
$$;
-- Idempotent private-crew writes use the same receipt domain as ordinary actions.
create function public.runtime_group_request(p_hash text,p_account uuid,p_request uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; fingerprint text; previous public.runtime_receipts; result jsonb;
begin
 if p_operation in ('list','view','code') then return public.runtime_group(p_hash,p_account,p_operation,p_data); end if;
 if p_request is null then raise exception 'request_required'; end if;
 if p_operation='join' then perform pg_advisory_xact_lock(hashtextextended('participation-account:'||p_account::text,0));select id into pid from public.participants where account_id=p_account and id=(p_data->>'participant')::uuid;
 else pid:=public.runtime_session(p_hash,'compete',p_operation in ('leave','report','block')); end if;
 if pid is null then raise exception 'participant_unavailable'; end if;
 perform 1 from public.participants where id=pid for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('crew',p_operation,p_data)::text,'UTF8')),'hex');
 select * into previous from public.runtime_receipts where participant_id=pid and request_id=p_request;
 if found then if previous.fingerprint<>fingerprint then raise exception 'request_conflict';end if;return previous.result;end if;
 if (select count(*) from public.runtime_receipts where participant_id=pid and created_at>now()-interval '24 hours')>=1000 then raise exception 'action_limit';end if;
 result:=public.runtime_group(p_hash,p_account,p_operation,p_data);
 insert into public.runtime_receipts values(pid,p_request,'crew:'||p_operation,fingerprint,result,now());
 return result;
end $$;
revoke all on function public.runtime_export_participant(uuid),public.runtime_group_request(text,uuid,uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_group_request(text,uuid,uuid,text,jsonb) to nugget_broker;
create function public.runtime_cutover_privacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cutover then update public.profiles p set public_identity=false where not exists(select 1 from public.participant_profiles l join public.participants person on person.id=l.participant_id where l.profile_id=p.id and person.age_band='adult' and not person.managed);end if;return new;
end $$;
create trigger runtime_cutover_privacy after update of cutover on public.runtime_controls for each row execute function public.runtime_cutover_privacy();
create function public.runtime_new_account_privacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select cutover from public.runtime_controls) and new.public_identity then update public.profiles set public_identity=false where id=new.id;end if;return new;
end $$;
create trigger runtime_new_account_privacy after insert on public.profiles for each row execute function public.runtime_new_account_privacy();
alter function public.set_handle(text) rename to set_handle_before_participants;
create function public.set_handle(p_handle text) returns text language plpgsql security definer set search_path='' as $$
begin
 if (select cutover from public.runtime_controls) or exists(select 1 from public.accounts where id=auth.uid() and requires_participant) or exists(select 1 from public.participant_profiles where profile_id=auth.uid()) then raise exception 'participant_session_required';end if;
 return public.set_handle_before_participants(p_handle);
end $$;
revoke all on function public.runtime_cutover_privacy(),public.runtime_new_account_privacy(),public.set_handle_before_participants(text),public.set_handle(text) from public,anon,authenticated,nugget_broker;
grant execute on function public.set_handle(text) to authenticated;
create function public.runtime_preserve_crew_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='crew_takes' then update public.crew_takes set status='hidden',orphaned=true where parent_id=old.id;return old;end if;
 if new.owner_id is null and old.owner_id is not null then new.name:='Crunch Council';end if;return new;
end $$;
create trigger hide_orphan_crew_replies before delete on public.crew_takes for each row execute function public.runtime_preserve_crew_context();
create trigger minimize_ownerless_crew before update of owner_id on public.private_crews for each row execute function public.runtime_preserve_crew_context();
revoke all on function public.runtime_preserve_crew_context() from public,anon,authenticated,nugget_broker;
commit;

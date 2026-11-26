begin;
alter table public.photo_evidence add column attested_at timestamptz;
alter table public.photo_evidence add column attestation_version text;
alter table public.photo_evidence_events drop constraint photo_evidence_events_action_check;
alter table public.photo_evidence_events add check(action in ('reserved','processed','approved','rejected','removed','deletion_requested','purged','reported','corrected','attested'));
create table public.photo_upload_leases (
 evidence_id uuid primary key references public.photo_evidence on delete cascade,
 lease uuid not null unique default gen_random_uuid(),expires_at timestamptz not null default now()+interval '5 minutes',
 thumb uuid not null default gen_random_uuid(),display uuid not null default gen_random_uuid()
);
create table public.blob_purge_queue (
 object_key uuid primary key,evidence_id uuid not null references public.photo_evidence on delete restrict,created_at timestamptz not null default now(),attempts integer not null default 0
);
alter table public.photo_upload_leases enable row level security;
alter table public.blob_purge_queue enable row level security;
revoke all on public.photo_upload_leases,public.blob_purge_queue from public,anon,authenticated,nugget_broker;
alter table public.photo_evidence_links drop constraint photo_evidence_links_kind_check;
alter table public.photo_evidence_links add check(kind in ('product','place','take','showdown','court','trail','stock_report','price_entry','rating','reply'));

create function public.runtime_photo_target(p_participant uuid,p_kind text,p_ref text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_kind
 when 'product' then exists(select 1 from public.products where id=p_ref)
 when 'place' then exists(select 1 from public.places where id=p_ref)
 when 'showdown' then exists(select 1 from public.matchups where id=p_ref)
 when 'court' then exists(select 1 from public.court_cases where id::text=p_ref and public.court_visible(id))
 when 'trail' then exists(select 1 from public.discovery_trails where id::text=p_ref and status='published' and public.discovery_author_visible(author_id))
 when 'take' then exists(select 1 from public.takes where id::text=p_ref and author_id=(select profile_id from public.participant_profiles where participant_id=p_participant) and status<>'hidden')
 when 'reply' then exists(select 1 from public.take_replies where id::text=p_ref and author_id=(select profile_id from public.participant_profiles where participant_id=p_participant) and status<>'hidden')
 when 'stock_report' then exists(select 1 from public.stock_reports where id::text=p_ref and user_id=(select profile_id from public.participant_profiles where participant_id=p_participant))
 when 'price_entry' then exists(select 1 from public.price_entries where id::text=p_ref and user_id=(select profile_id from public.participant_profiles where participant_id=p_participant))
 when 'rating' then exists(select 1 from public.place_ratings where place_id=p_ref and user_id=(select profile_id from public.participant_profiles where participant_id=p_participant))
 else false end
$$;
create function public.runtime_photo(p_hash text,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; evidence public.photo_evidence; lease public.photo_upload_leases; eid uuid; oldsub text:=current_setting('request.jwt.claim.sub',true); result jsonb;
begin
 pid:=public.runtime_session(p_hash,'photo',p_operation in ('list','delete','report','read','export'));
 if p_operation='list' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'status',status,'revision',revision,'submitted_at',submitted_at,'observed_at',observed_at)) from public.photo_evidence where participant_id=pid),'[]'); end if;
 if p_operation='reserve' then
  if p_data->>'attested' is distinct from 'true' then raise exception 'own_food_photo_attestation_required';end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text,818));
  select * into evidence from public.photo_evidence where request_id=(p_data->>'request')::uuid;
  if found then
   if evidence.participant_id is distinct from pid or evidence.purpose is distinct from p_data->>'purpose'
    or evidence.observed_at is distinct from (p_data->>'observed_at')::timestamptz or not exists(select 1 from public.photo_evidence_links where evidence_id=evidence.id and kind=p_data->>'kind' and content_ref=p_data->>'ref') then raise exception 'request_conflict'; end if;
   update public.photo_evidence set attested_at=coalesce(attested_at,now()),attestation_version='food-photo-draft-1' where id=evidence.id;
   return jsonb_build_object('id',evidence.id,'status',evidence.status,'revision',evidence.revision);
  end if;
  perform public.runtime_review_capacity('photo');
  if not public.runtime_photo_target(pid,p_data->>'kind',p_data->>'ref') then raise exception 'photo_target_unavailable'; end if;
  if (select count(*) from public.photo_evidence where participant_id=pid and submitted_at>now()-interval '24 hours')>=10 then raise exception 'photo_daily_limit'; end if;
  insert into public.photo_evidence(participant_id,request_id,purpose,observed_at) values(pid,(p_data->>'request')::uuid,p_data->>'purpose',(p_data->>'observed_at')::timestamptz) returning * into evidence;
  update public.photo_evidence set attested_at=now(),attestation_version='food-photo-draft-1' where id=evidence.id;
  insert into public.photo_evidence_links values(evidence.id,p_data->>'kind',p_data->>'ref');
  insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,1,'reserved');
  return jsonb_build_object('id',evidence.id,'status',evidence.status,'revision',evidence.revision);
 end if;
 select * into evidence from public.photo_evidence where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'photo_unavailable'; end if;
 if p_operation='report' then
  if evidence.status<>'approved' or not (evidence.participant_id=pid or public.runtime_photo_shared(pid,evidence.id) or public.runtime_photo_public(evidence.id,'thumb') is not null) then raise exception 'photo_unavailable'; end if;
  insert into public.photo_reports(evidence_id,reporter_id,reason) values(evidence.id,(select profile_id from public.participant_profiles where participant_id=pid),p_data->>'reason') on conflict do nothing;
  if found then insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,evidence.revision,'reported'); end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_operation='read' and public.runtime_photo_shared(pid,evidence.id) then return (select jsonb_build_object('key',object_key,'mime','image/jpeg') from public.photo_variants where evidence_id=evidence.id and variant=p_data->>'variant');end if;
 if evidence.participant_id is distinct from pid then raise exception 'photo_unavailable'; end if;
 if p_operation='attest' then
  if evidence.revision<>(p_data->>'revision')::int or evidence.status<>'reserved' or p_data->>'attested' is distinct from 'true' then raise exception 'photo_attestation_required';end if;
  update public.photo_evidence set attested_at=now(),attestation_version='food-photo-draft-1' where id=evidence.id and attested_at is null;
  if found then insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,evidence.revision,'attested');end if;return jsonb_build_object('ok',true);
 elsif p_operation='delete' then
  if evidence.status not in ('deleting','deleted') then
   update public.photo_evidence set status='deleting',cleanup_due_at=now(),revision=revision+1 where id=evidence.id;
   insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,evidence.revision+1,'deletion_requested');
  end if;return jsonb_build_object('ok',true);
 elsif p_operation in ('read','export') then
  if evidence.status not in ('pending','approved') then raise exception 'photo_unavailable'; end if;
  return (select jsonb_build_object('key',object_key,'mime','image/jpeg') from public.photo_variants where evidence_id=evidence.id and variant=p_data->>'variant');
 elsif p_operation='begin' then
  if evidence.status in ('pending','approved') and evidence.revision=(p_data->>'revision')::int then return jsonb_build_object('already',true,'status',evidence.status,'revision',evidence.revision); end if;
  if evidence.status<>'reserved' or evidence.attested_at is null or evidence.cleanup_due_at<=now() then raise exception 'photo_not_reserved'; end if;
  if evidence.revision<>(p_data->>'revision')::int then raise exception 'photo_revision_conflict'; end if;
  if exists(select 1 from public.photo_upload_leases where evidence_id=evidence.id) then raise exception 'photo_upload_busy'; end if;
  insert into public.photo_upload_leases(evidence_id) values(evidence.id) returning * into lease;
  return to_jsonb(lease);
 elsif p_operation='complete' then
  select * into lease from public.photo_upload_leases l where l.evidence_id=evidence.id and l.lease=(p_data->>'lease')::uuid and l.expires_at>now() for update;
  if not found or evidence.status<>'reserved' or evidence.revision<>(p_data->>'revision')::int then raise exception 'photo_revision_conflict'; end if;
  if p_data->>'processor'<>'nugget-photo-1' or coalesce(p_data->>'digest','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_processing_result'; end if;
  insert into public.photo_variants values(evidence.id,'thumb',lease.thumb,(p_data#>>'{thumb,width}')::int,(p_data#>>'{thumb,height}')::int,(p_data#>>'{thumb,bytes}')::int),
   (evidence.id,'display',lease.display,(p_data#>>'{display,width}')::int,(p_data#>>'{display,height}')::int,(p_data#>>'{display,bytes}')::int);
  update public.photo_evidence set status='pending',processed_at=now(),processor_version=p_data->>'processor',content_digest=p_data->>'digest',cleanup_due_at=now()+interval '7 days' where id=evidence.id;
  delete from public.photo_upload_leases where evidence_id=evidence.id;
  insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,evidence.revision,'processed');
  return jsonb_build_object('id',evidence.id,'status','pending','revision',evidence.revision);
 elsif p_operation='correct' then
  if evidence.status not in ('pending','approved','rejected') or evidence.revision<>(p_data->>'revision')::int then raise exception 'photo_revision_conflict'; end if;
  insert into public.blob_purge_queue(object_key,evidence_id) select object_key,evidence_id from public.photo_variants where evidence_id=evidence.id on conflict do nothing;
  delete from public.photo_variants where evidence_id=evidence.id;
  update public.photo_evidence set status='reserved',revision=revision+1,attested_at=null,reviewed_at=null,reviewed_by=null,processed_at=null,content_digest=null,cleanup_due_at=now()+interval '24 hours' where id=evidence.id;
  insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence.id,evidence.revision+1,'corrected');
  return jsonb_build_object('id',evidence.id,'revision',evidence.revision+1,'status','reserved');
 end if;
 raise exception 'invalid_photo_operation';
end $$;
create function public.runtime_review_photos(p_moderator uuid,p_id uuid default null,p_revision integer default null,p_decision text default null,p_checks jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare evidence public.photo_evidence;
begin
 if not exists(select 1 from public.profiles where id=p_moderator and is_moderator and not banned) or not exists(select 1 from auth.users where id=p_moderator) then raise exception 'moderator_required'; end if;
 if p_id is null then return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'revision',e.revision,'purpose',e.purpose,'status',e.status,'reports',(select count(*) from public.photo_reports where evidence_id=e.id))) from public.photo_evidence e where e.status='pending' or e.status='approved' and exists(select 1 from public.photo_reports where evidence_id=e.id)),'[]'); end if;
 select * into evidence from public.photo_evidence where id=p_id for update;
 if not found or evidence.status not in ('pending','approved') then raise exception 'photo_unavailable'; end if;
 if exists(select 1 from public.participants where id=evidence.participant_id and account_id=p_moderator) then raise exception 'cannot_review_own_photo'; end if;
 if p_decision='preview' then return (select jsonb_build_object('key',object_key,'mime','image/jpeg') from public.photo_variants where evidence_id=evidence.id and variant='display'); end if;
 if p_revision is null or p_revision<>evidence.revision then raise exception 'photo_revision_conflict'; end if;
 if p_decision not in ('approve','reject','remove') then raise exception 'invalid_review_decision'; end if;
 if p_decision='approve' and (evidence.status<>'pending' or not public.runtime_can(evidence.participant_id,'photo')
 or p_checks is distinct from '{"food_only":true,"no_people":true,"no_private_information":true,"rights_checked":true}'::jsonb) then raise exception 'photo_checks_required'; end if;
 update public.photo_evidence set status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'removed' end,
 reviewed_by=p_moderator,reviewed_at=now(),cleanup_due_at=case p_decision when 'approve' then now()+interval '365 days' else now()+interval '24 hours' end where id=evidence.id;
 insert into public.photo_evidence_events(evidence_id,revision,action,reviewer_id,checks) values(evidence.id,evidence.revision,case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'removed' end,p_moderator,p_checks);
 return jsonb_build_object('ok',true);
end $$;
create function public.runtime_public_photo_context(p_owner uuid,p_kind text,p_ref text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if p_kind='take' then return public.runtime_public_take(p_ref::bigint);end if;
 return public.runtime_photo_target(p_owner,p_kind,p_ref);
end $$;
create function public.runtime_photo_public(p_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
 -- Anonymous display has no author, guardian, age, exact observation time or visit history.
 -- Public disclosure requires a separately reviewed permission, not photo submission alone.
 select jsonb_build_object('key',v.object_key,'mime','image/jpeg') from public.photo_evidence e join public.photo_variants v on v.evidence_id=e.id
 where (select photo_publication_ready from public.runtime_controls) and e.id=p_id and e.status='approved' and v.variant=p_variant and public.runtime_can(e.participant_id,'photo')
 and exists(select 1 from public.participant_permissions c where c.participant_id=e.participant_id and c.capability='photo' and c.public_disclosure and c.revoked_at is null and c.expires_at>now())
 and not exists(select 1 from public.photo_evidence_links l where l.evidence_id=e.id and (l.kind not in ('product','place','showdown','court','trail','take') or not public.runtime_public_photo_context(e.participant_id,l.kind,l.content_ref)))
$$;
create function public.runtime_cleanup(p_operation text,p_key uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_operation='scan' then
  insert into public.blob_purge_queue(object_key,evidence_id) select thumb,evidence_id from public.photo_upload_leases where expires_at<=now() union select display,evidence_id from public.photo_upload_leases where expires_at<=now() on conflict do nothing;
  delete from public.photo_upload_leases where expires_at<=now();
  update public.photo_evidence e set status='deleting',cleanup_due_at=now() where status not in ('deleted','deleting') and (cleanup_due_at<=now() or participant_id is null or not exists(select 1 from public.participant_permissions c where c.participant_id=e.participant_id and capability='photo' and revoked_at is null and expires_at>now()));
  insert into public.blob_purge_queue(object_key,evidence_id) select v.object_key,v.evidence_id from public.photo_variants v join public.photo_evidence e on e.id=v.evidence_id where e.status='deleting' on conflict do nothing;
  return coalesce((select jsonb_agg(object_key) from (select object_key from public.blob_purge_queue order by created_at limit 100) q),'[]');
 elsif p_operation='ack' then
  delete from public.photo_variants where object_key=p_key;
  delete from public.blob_purge_queue where object_key=p_key;
  with erased as (update public.photo_evidence e set status='deleted',deleted_at=now(),content_digest=null,processor_version=null,reviewed_by=null,observed_at=null where status='deleting' and not exists(select 1 from public.photo_variants where evidence_id=e.id) and not exists(select 1 from public.photo_upload_leases where evidence_id=e.id) and not exists(select 1 from public.blob_purge_queue where evidence_id=e.id) returning id,revision) insert into public.photo_evidence_events(evidence_id,revision,action) select id,revision,'purged' from erased;
  delete from public.photo_evidence_links where evidence_id in(select id from public.photo_evidence where status='deleted');
 elsif p_operation='fail' then update public.blob_purge_queue set attempts=attempts+1 where object_key=p_key;
 elsif p_operation='finish' then
  with erased as (update public.photo_evidence e set status='deleted',deleted_at=now(),observed_at=null where status='deleting' and not exists(select 1 from public.photo_variants where evidence_id=e.id) and not exists(select 1 from public.photo_upload_leases where evidence_id=e.id) and not exists(select 1 from public.blob_purge_queue where evidence_id=e.id) returning id,revision) insert into public.photo_evidence_events(evidence_id,revision,action) select id,revision,'purged' from erased;
  delete from public.photo_evidence_links where evidence_id in(select id from public.photo_evidence where status='deleted');
  delete from public.photo_evidence where status='deleted' and deleted_at<now()-interval '30 days';
  delete from public.participant_sessions where expires_at<now()-interval '1 day' or revoked_at<now()-interval '1 day';
  delete from public.runtime_receipts where created_at<now()-interval '30 days';
 else raise exception 'invalid_cleanup_operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
-- Public display requires independently verified disclosure permission and a closed readiness switch.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('runtime_photo_target','runtime_public_photo_context','runtime_photo','runtime_review_photos','runtime_photo_public','runtime_cleanup') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated,nugget_broker'; end loop; end $$;
grant execute on function public.runtime_photo(text,text,jsonb),public.runtime_review_photos(uuid,uuid,integer,text,jsonb),public.runtime_photo_public(uuid,text),public.runtime_cleanup(text,uuid) to nugget_broker;
commit;

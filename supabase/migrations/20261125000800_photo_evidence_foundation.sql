begin;
create table public.photo_evidence (
 id uuid primary key default gen_random_uuid(),
 participant_id uuid references public.participants on delete set null,
 request_id uuid not null unique,
 purpose text not null check(purpose in ('review','cross_section','stock','packaging','price','menu','receipt','showdown','court','trail','take','reply')),
 source text not null default 'own_photo' check(source='own_photo'),
 observed_at timestamptz,
 submitted_at timestamptz not null default now(),
 status text not null default 'reserved' check(status in ('reserved','pending','approved','rejected','removed','deleting','deleted')),
 revision integer not null default 1,
 processed_at timestamptz, reviewed_at timestamptz,
 reviewed_by uuid references public.profiles on delete set null,
 -- No original filename, EXIF, GPS, network address, or child age in this record.
 processor_version text, content_digest text,
 cleanup_due_at timestamptz not null default now()+interval '24 hours',
 deleted_at timestamptz,
 check(observed_at is null or observed_at<=submitted_at+interval '5 minutes')
);
create table public.photo_evidence_links (
 evidence_id uuid references public.photo_evidence on delete cascade,
 kind text not null check(kind in ('product','place','take','showdown','court','trail')),
 content_ref text not null, primary key(evidence_id,kind,content_ref)
);
create table public.photo_variants (
 evidence_id uuid references public.photo_evidence on delete cascade,
 variant text not null check(variant in ('thumb','display')),
 object_key uuid not null unique default gen_random_uuid(),
 width integer not null check(width between 1 and 1600),height integer not null check(height between 1 and 1600),
 bytes integer not null check(bytes between 1 and 1500000),
 primary key(evidence_id,variant)
);
create table public.photo_evidence_events (
 id bigint generated always as identity primary key,
 evidence_id uuid references public.photo_evidence on delete cascade,
 revision integer not null, action text not null check(action in ('reserved','processed','approved','rejected','removed','deletion_requested','purged','reported')),
 created_at timestamptz not null default now()
);
create table public.photo_reports (
 evidence_id uuid references public.photo_evidence on delete cascade,
 reporter_id uuid references public.profiles on delete cascade,
 reason text not null check(reason in ('person','private_information','not_food','rights','other')),
 created_at timestamptz not null default now(), primary key(evidence_id,reporter_id)
);
alter table public.photo_evidence enable row level security;
alter table public.photo_evidence_links enable row level security;
alter table public.photo_variants enable row level security;
alter table public.photo_evidence_events enable row level security;
alter table public.photo_reports enable row level security;
revoke all on public.photo_evidence,public.photo_evidence_links,public.photo_variants,public.photo_evidence_events,public.photo_reports from public,anon,authenticated;
create index photo_cleanup_due on public.photo_evidence(cleanup_due_at) where status<>'deleted';
create index photo_participant_time on public.photo_evidence(participant_id,submitted_at desc);
create function public.reserve_photo_evidence(p_participant uuid,p_request uuid,p_purpose text,p_kind text,p_ref text,p_observed timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare evidence uuid; previous public.photo_evidence;
begin
 if not public.participant_can(p_participant,'photo') then raise exception 'photo_permission_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_participant::text,818));
 select * into previous from public.photo_evidence where request_id=p_request;
 if found then
  if previous.participant_id is distinct from p_participant or previous.purpose is distinct from p_purpose or previous.observed_at is distinct from p_observed
   or not exists(select 1 from public.photo_evidence_links where evidence_id=previous.id and kind=p_kind and content_ref=p_ref)
   then raise exception 'request_conflict'; end if;
  return previous.id;
 end if;
 if (select count(*) from public.photo_evidence where participant_id=p_participant and submitted_at>now()-interval '24 hours')>=10 then raise exception 'photo_daily_limit'; end if;
 if not (case p_kind
  when 'product' then exists(select 1 from public.products where id=p_ref)
  when 'place' then exists(select 1 from public.places where id=p_ref)
  -- Social and exhibit targets need content visibility/ownership and participant cutover adapters first.
  else false end) then raise exception 'photo_target_unavailable'; end if;
 insert into public.photo_evidence(participant_id,request_id,purpose,observed_at) values(p_participant,p_request,p_purpose,p_observed) returning id into evidence;
 insert into public.photo_evidence_links values(evidence,p_kind,p_ref);
 insert into public.photo_evidence_events(evidence_id,revision,action) values(evidence,1,'reserved');
 return evidence;
end $$;
create function public.my_photo_evidence(p_participant uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'purpose',e.purpose,'status',e.status,'revision',e.revision,
 'submitted_at',e.submitted_at,'observed_at',e.observed_at,'cleanup_due_at',e.cleanup_due_at) order by e.submitted_at desc),'[]'::jsonb)
 from public.photo_evidence e join public.participants p on p.id=e.participant_id where p.id=p_participant and p.account_id=auth.uid()
$$;
-- Removing evidence is a safety action, independent of consent, bans or posting restrictions.
create function public.delete_photo_evidence(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.photo_evidence e set status='deleting',cleanup_due_at=now(),revision=revision+1
 where e.id=p_id and e.status not in ('deleting','deleted') and exists(select 1 from public.participants p where p.id=e.participant_id and p.account_id=auth.uid());
 if found then insert into public.photo_evidence_events(evidence_id,revision,action) select id,revision,'deletion_requested' from public.photo_evidence where id=p_id; end if;
end $$;
-- Account/participant removal queues blobs even though ownership is erased by the FK.
create function public.queue_participant_photo_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.photo_evidence set status='deleting',cleanup_due_at=now(),revision=revision+1 where participant_id=old.id and status<>'deleted';
 return old;
end $$;
create trigger participant_photo_erasure before delete on public.participants for each row execute function public.queue_participant_photo_erasure();
revoke all on function public.reserve_photo_evidence(uuid,uuid,text,text,text,timestamptz),public.my_photo_evidence(uuid),public.delete_photo_evidence(uuid),public.queue_participant_photo_erasure() from public,anon,authenticated;
grant execute on function public.reserve_photo_evidence(uuid,uuid,text,text,text,timestamptz),public.my_photo_evidence(uuid),public.delete_photo_evidence(uuid) to authenticated;
-- Deliberately no browser processing-complete or approval function, no public read policy,
-- no Storage buckets or settings. Trusted processor/moderation/serving adapters remain gated.
create function public.export_participation_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'participants',coalesce((select jsonb_agg(to_jsonb(p)) from public.participants p where p.account_id=auth.uid()),'[]'::jsonb),
 'permissions',coalesce((select jsonb_agg(jsonb_build_object('participant_id',c.participant_id,'capability',c.capability,'notice_version',c.notice_version,'verified_at',c.verified_at,'expires_at',c.expires_at,'revoked_at',c.revoked_at)) from public.participant_permissions c join public.participants p on p.id=c.participant_id where p.account_id=auth.uid()),'[]'::jsonb),
 'permission_events',coalesce((select jsonb_agg(to_jsonb(e)) from public.participant_permission_events e join public.participants p on p.id=e.participant_id where p.account_id=auth.uid()),'[]'::jsonb),
 'photo_evidence',coalesce((select jsonb_agg(to_jsonb(e)) from public.photo_evidence e join public.participants p on p.id=e.participant_id where p.account_id=auth.uid()),'[]'::jsonb),
 'photo_links',coalesce((select jsonb_agg(to_jsonb(l)) from public.photo_evidence_links l join public.photo_evidence e on e.id=l.evidence_id join public.participants p on p.id=e.participant_id where p.account_id=auth.uid()),'[]'::jsonb),
 'photo_events',coalesce((select jsonb_agg(to_jsonb(ev)) from public.photo_evidence_events ev join public.photo_evidence e on e.id=ev.evidence_id join public.participants p on p.id=e.participant_id where p.account_id=auth.uid()),'[]'::jsonb)
 )
$$;
revoke all on function public.export_participation_data() from public,anon,authenticated;
grant execute on function public.export_participation_data() to authenticated;
commit;

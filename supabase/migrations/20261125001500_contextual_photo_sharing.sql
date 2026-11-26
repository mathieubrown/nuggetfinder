begin;
alter table public.consent_requests add column group_disclosure boolean not null default false;
alter table public.consent_requests add column group_disclosure_ref text;
alter table public.participant_permission_events add column details jsonb check(details is null or jsonb_typeof(details)='object' and octet_length(details::text)<=512);
alter table public.participant_permissions add column group_disclosure boolean not null default false;
alter table public.photo_evidence_links drop constraint photo_evidence_links_kind_check;
alter table public.photo_evidence_links add check(kind in ('product','place','take','showdown','court','trail','stock_report','price_entry','rating','reply','crew_take','crew_challenge'));
alter function public.runtime_photo_target(uuid,text,text) rename to runtime_photo_target_before_crews;
create function public.runtime_photo_target(p_participant uuid,p_kind text,p_ref text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_kind
 when 'crew_take' then exists(select 1 from public.crew_takes t join public.crew_members m on m.crew_id=t.crew_id and m.participant_id=p_participant where t.id::text=p_ref and t.participant_id=p_participant and t.status<>'hidden')
 when 'crew_challenge' then exists(select 1 from public.crew_challenges c join public.crew_members m on m.crew_id=c.crew_id and m.participant_id=p_participant where c.id::text=p_ref and c.creator_id=p_participant)
 else public.runtime_photo_target_before_crews(p_participant,p_kind,p_ref) end
$$;
create function public.runtime_photo_shared(p_participant uuid,p_evidence uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photo_evidence e
 join public.participant_permissions c on c.participant_id=e.participant_id and c.capability='photo' and c.group_disclosure and c.revoked_at is null and c.expires_at>now()
 join public.photo_evidence_links l on l.evidence_id=e.id
 where public.runtime_can(p_participant,'discover') and e.id=p_evidence and e.status='approved' and public.runtime_can(e.participant_id,'photo')
 and exists(select 1 from public.crew_members a join public.crew_members b on b.crew_id=a.crew_id and b.participant_id=e.participant_id
 where a.participant_id=p_participant and ((l.kind='crew_take' and exists(select 1 from public.crew_takes t where t.id::text=l.content_ref and t.crew_id=a.crew_id and t.status='published'))
 or (l.kind='crew_challenge' and exists(select 1 from public.crew_challenges ch where ch.id::text=l.content_ref and ch.crew_id=a.crew_id))))
 and not exists(select 1 from public.crew_reports r where r.reporter_id=p_participant and r.take_id::text=l.content_ref and l.kind='crew_take')
 and not exists(select 1 from public.crew_blocks b where (b.participant_id=p_participant and b.blocked_id=e.participant_id) or (b.blocked_id=p_participant and b.participant_id=e.participant_id)))
$$;
-- Disclosure is verified by the consent role. It cannot be toggled by a guardian checkbox or broker.
create function public.runtime_verify_group_disclosure(p_receipt uuid,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_reference is null or length(btrim(p_reference)) not between 1 and 200 then raise exception 'verified_disclosure_required';end if;
 update public.consent_requests set group_disclosure=true,group_disclosure_ref=p_reference where id=p_receipt and status='verified' and expires_at>now() and consumed_by is null;
 if not found then raise exception 'consent_request_unavailable';end if;
end $$;
revoke all on function public.runtime_photo_target_before_crews(uuid,text,text),public.runtime_photo_target(uuid,text,text),public.runtime_photo_shared(uuid,uuid),public.runtime_verify_group_disclosure(uuid,text) from public,anon,authenticated,nugget_broker,nugget_consent_verifier;
grant execute on function public.runtime_verify_group_disclosure(uuid,text) to nugget_consent_verifier;
commit;

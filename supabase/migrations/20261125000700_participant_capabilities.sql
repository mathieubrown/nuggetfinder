begin;
-- Private identity foundation. No age group or new operation is enabled by this migration.
create table public.participants (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.profiles(id) on delete cascade,
 pseudonym text not null check(pseudonym ~ '^[a-z][a-z0-9_]{2,19}$'),
 age_band text not null check(age_band in ('under13','teen','adult')),
 managed boolean not null default false,
 invited_at timestamptz,
 paused_at timestamptz,
 created_at timestamptz not null default now(),
 check(age_band <> 'under13' or managed), unique(account_id,pseudonym)
);
create table public.participation_readiness (
 age_band text not null check(age_band in ('under13','teen','adult')),
 capability text not null check(capability in ('discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social')),
 enabled boolean not null default false,
 review_ref text, reviewed_at timestamptz,
 primary key(age_band,capability),
 check(not enabled or (review_ref is not null and length(btrim(review_ref))>0 and reviewed_at is not null))
);
insert into public.participation_readiness(age_band,capability)
 select a,c from unnest(array['under13','teen','adult']) a cross join
 unnest(array['discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social']) c;
create table public.participant_permissions (
 participant_id uuid references public.participants on delete cascade,
 capability text not null check(capability in ('discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social')),
 -- References a separately verified, minimal consent receipt, never ID images or card details.
 verification_ref text not null check(length(btrim(verification_ref)) between 1 and 200),
 notice_version text not null,
 verified_at timestamptz not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 primary key(participant_id,capability), check(expires_at>verified_at)
);
create table public.participant_permission_events (
 id bigint generated always as identity primary key,
 participant_id uuid references public.participants on delete cascade,
 capability text not null, event text not null check(event in ('verified','revoked','expired','paused')),
 created_at timestamptz not null default now(), notice_version text not null
);
alter table public.participants enable row level security;
alter table public.participation_readiness enable row level security;
alter table public.participant_permissions enable row level security;
alter table public.participant_permission_events enable row level security;
revoke all on public.participants,public.participation_readiness,public.participant_permissions,public.participant_permission_events from public,anon,authenticated;

-- LOGIC-START: capability checks never trust client metadata, age checkboxes or selected profile IDs.
create function public.participant_can(p_participant uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.participants p
 join public.profiles a on a.id=p.account_id
 join public.participation_readiness r on r.age_band=p.age_band and r.capability=p_capability and r.enabled
 join public.participant_permissions c on c.participant_id=p.id and c.capability=r.capability
 where p.id=p_participant and p.account_id=auth.uid() and not a.banned
 and p.invited_at is not null and p.paused_at is null
 and (a.posting_locked_until is null or a.posting_locked_until<=now())
 and c.verified_at<=now() and c.expires_at>now() and c.revoked_at is null)
$$;
-- LOGIC-END
create function public.my_participants()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'pseudonym',p.pseudonym,'managed',p.managed,
 'paused',p.paused_at is not null,'capabilities',(select jsonb_object_agg(r.capability,public.participant_can(p.id,r.capability))
 from public.participation_readiness r where r.age_band=p.age_band)) order by p.created_at),'[]'::jsonb)
 from public.participants p join public.profiles a on a.id=p.account_id where p.account_id=auth.uid() and not a.banned
$$;
-- Revocation and pause remain available during a posting lock. Cannot grant consent here.
create function public.pause_participant(p_participant uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sign_in_required'; end if;
 update public.participants set paused_at=coalesce(paused_at,now()) where id=p_participant and account_id=auth.uid();
 if not found then raise exception 'participant_unavailable'; end if;
end $$;
create function public.revoke_participant_permission(p_participant uuid,p_capability text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.participants where id=p_participant and account_id=auth.uid()) then raise exception 'participant_unavailable'; end if;
 update public.participant_permissions set revoked_at=coalesce(revoked_at,now()) where participant_id=p_participant and capability=p_capability and revoked_at is null;
 if found then
 insert into public.participant_permission_events(participant_id,capability,event,notice_version)
 select p_participant,p_capability,'revoked',notice_version from public.participant_permissions where participant_id=p_participant and capability=p_capability;
 end if;
end $$;
revoke all on function public.participant_can(uuid,text),public.my_participants(),public.pause_participant(uuid),public.revoke_participant_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.participant_can(uuid,text),public.my_participants(),public.pause_participant(uuid),public.revoke_participant_permission(uuid,text) to authenticated;
-- Provisioning, consent verification and readiness activation are administrator-only.
-- Legacy auth.uid()-owned contribution APIs are NOT migrated or opened to child identities here.
commit;

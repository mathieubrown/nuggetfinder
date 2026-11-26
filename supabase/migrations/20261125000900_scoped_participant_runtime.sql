begin;
-- Separate contributor profiles from login accounts without inventing Auth users.
do $$ begin create role nugget_broker nologin noinherit; exception when duplicate_object or unique_violation then null; end $$;
do $$ begin create role nugget_consent_verifier nologin noinherit; exception when duplicate_object or unique_violation then null; end $$;
do $$begin
 if exists(select 1 from pg_roles where rolname in ('nugget_broker','nugget_consent_verifier') and (rolsuper or rolbypassrls or rolcanlogin or rolinherit)) or exists(select 1 from pg_auth_members where member in(select oid from pg_roles where rolname in ('nugget_broker','nugget_consent_verifier'))) then raise exception 'runtime_role_configuration_conflict';end if;
end $$;
grant usage on schema public to nugget_broker,nugget_consent_verifier;
alter table public.profiles add column public_identity boolean not null default true;
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.reports drop constraint reports_user_id_fkey;
alter table public.reports add foreign key(user_id) references public.profiles on delete cascade;
alter table public.participant_permissions add column public_disclosure boolean not null default false;
create table public.accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 banned boolean not null default false,posting_locked_until timestamptz,is_moderator boolean not null default false,
 requires_participant boolean not null default false,created_at timestamptz not null default now()
);
insert into public.accounts(id,banned,posting_locked_until,is_moderator,created_at)
 select u.id,coalesce(p.banned,false),p.posting_locked_until,coalesce(p.is_moderator,false),coalesce(p.created_at,now()) from auth.users u left join public.profiles p on p.id=u.id;
alter table public.participants drop constraint participants_account_id_fkey;
alter table public.participants add foreign key(account_id) references public.accounts on delete cascade;
create table public.account_invitations (
 account_id uuid primary key references public.accounts on delete cascade,granted_at timestamptz not null default now(),revoked_at timestamptz
);
create table public.participant_profiles (
 participant_id uuid primary key references public.participants on delete cascade,
 profile_id uuid not null unique references public.profiles on delete cascade
);
create unique index participant_self_account on public.participants(account_id) where not managed;
create table public.consent_requests (
 id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts on delete cascade,
 requested_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','verified','rejected','revoked')),
 verified_band text check(verified_band in ('under13','teen','adult')),verified_managed boolean,
 notice_version text not null check(length(notice_version) between 1 and 100),
 verification_ref text,verified_at timestamptz,expires_at timestamptz,
 public_disclosure boolean not null default false,capabilities text[] not null default '{}',consumed_by uuid references public.participants on delete set null
);
create table public.participant_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),participant_id uuid not null references public.participants on delete cascade,
 created_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '30 minutes')
);
create table public.runtime_receipts (
 participant_id uuid references public.participants on delete cascade,request_id uuid,
 operation text not null,fingerprint text not null,result jsonb,created_at timestamptz not null default now(),
 primary key(participant_id,request_id)
);
create table public.runtime_controls (id boolean primary key default true check(id),cutover boolean not null default false,photo_publication_ready boolean not null default false);
insert into public.runtime_controls values(true,false,false);
create table public.account_erasure_jobs (
 id uuid primary key default gen_random_uuid(),account_id uuid unique, -- survives identity deletion, erased after completion
 created_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','sql_deleted','complete')),
 completed_at timestamptz
);
-- All new relations remain private even under broad inherited Supabase grants.
do $$ declare t text; begin foreach t in array array['accounts','account_invitations','participant_profiles','consent_requests','participant_sessions','runtime_receipts','runtime_controls','account_erasure_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,nugget_broker,nugget_consent_verifier',t);
end loop; end $$;
drop policy "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using(public_identity);

create function public.guard_profile_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=new.id) and not exists(select 1 from public.participants where id=new.id and managed)
 then raise exception 'profile_identity_required'; end if; return new;
end $$;
create trigger profile_identity_guard before insert on public.profiles for each row execute function public.guard_profile_identity();
create function public.erase_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.profiles where id=old.id; return old; end $$;
create trigger erase_auth_profile after delete on auth.users for each row execute function public.erase_auth_profile();

-- LOGIC-START: every scoped operation rechecks live gates, consent and account state.
create function public.runtime_can(p_id uuid,p_cap text,p_safety boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.participants p join public.accounts a on a.id=p.account_id
 join public.participant_profiles link on link.participant_id=p.id join public.profiles actor on actor.id=link.profile_id
 where p.id=p_id and (p_safety or (p.invited_at is not null and exists(select 1 from public.account_invitations i where i.account_id=p.account_id and i.revoked_at is null) and p.paused_at is null and not a.banned and not actor.banned
 and (p_cap='discover' or ((a.posting_locked_until is null or a.posting_locked_until<=now()) and (actor.posting_locked_until is null or actor.posting_locked_until<=now())))
 and exists(select 1 from public.participation_readiness r where r.age_band=p.age_band and r.capability=p_cap and r.enabled)
 and exists(select 1 from public.participant_permissions c where c.participant_id=p.id and c.capability=p_cap
 and c.verified_at<=now() and c.expires_at>now() and c.revoked_at is null))))
$$;
create function public.runtime_session(p_hash text,p_cap text default null,p_safety boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid; account uuid;
begin
 select s.participant_id into pid from public.participant_sessions s where s.token_hash=p_hash and s.revoked_at is null and s.expires_at>clock_timestamp();
 select account_id into account from public.participants where id=pid;
 if account is not null then perform pg_advisory_xact_lock(hashtextextended('participation-account:'||account::text,0));end if;
 if not exists(select 1 from public.participant_sessions where token_hash=p_hash and participant_id=pid and revoked_at is null and expires_at>clock_timestamp()) or pid is null or not public.runtime_can(pid,coalesce(p_cap,'discover'),p_safety) then raise exception 'participant_session_unavailable'; end if;
 return pid;
end $$;
-- LOGIC-END
create or replace function public.participant_can(p_participant uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.runtime_can(p_participant,p_capability) and exists(select 1 from public.participants where id=p_participant and account_id=auth.uid())
$$;
alter function public.require_social_user() rename to require_before_participant_social;
create function public.require_social_user() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('nugget.participant',true),'')<>'' then return public.require_before_participant_social(); end if;
 if (select cutover from public.runtime_controls) or exists(select 1 from public.accounts where id=auth.uid() and requires_participant) or exists(select 1 from public.participant_profiles where profile_id=auth.uid()) then raise exception 'participant_session_required'; end if;
 return public.require_before_participant_social();
end $$;
create function public.guard_legacy_reports() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('nugget.participant',true),'')='' and ((select cutover from public.runtime_controls)
 or exists(select 1 from public.accounts where id=new.user_id and requires_participant) or exists(select 1 from public.participant_profiles where profile_id=new.user_id)) then raise exception 'participant_session_required'; end if;
 return new;
end $$;
create trigger a_participant_report_guard before insert on public.reports for each row execute function public.guard_legacy_reports();
create trigger a_participant_stock_guard before insert on public.stock_reports for each row execute function public.guard_legacy_reports();
create or replace function public.discovery_author_visible(p_author uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_author and public_identity and not banned)
 and not exists(select 1 from public.user_blocks where (user_id=auth.uid() and blocked_id=p_author) or (blocked_id=auth.uid() and user_id=p_author))
$$;

-- A separate role, NOT the upload broker or any browser/moderator, verifies consent receipts.
create function public.runtime_verify_consent(p_request uuid,p_band text,p_managed boolean,p_reference text,p_expires timestamptz,p_capabilities text[],p_public boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_band is null or p_managed is null or p_expires is null or p_band not in ('under13','teen','adult') or p_band='under13' and not p_managed or p_band='adult' and p_managed
 or p_reference is null or length(btrim(p_reference)) not between 1 and 200 or p_expires<=now() or p_expires>now()+interval '1 year'
 or p_capabilities is null or not p_capabilities<@array['discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social','public_take']::text[]
 then raise exception 'invalid_verified_receipt'; end if;
 update public.consent_requests set status='verified',verified_band=p_band,verified_managed=p_managed,verification_ref=p_reference,
 verified_at=now(),expires_at=p_expires,capabilities=p_capabilities,public_disclosure=p_public where id=p_request and status='pending';
 if not found then raise exception 'consent_request_unavailable'; end if;
end $$;
create function public.runtime_parent(p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; prof uuid; receipt public.consent_requests; target public.participants; result jsonb; cap text; job uuid;
begin
 -- p_account is supplied only by the trusted broker after JWT verification and recent reauthentication.
 perform pg_advisory_xact_lock(hashtextextended('participation-account:'||p_account::text,0));
 perform 1 from public.accounts where id=p_account for update;
 if not found or not exists(select 1 from auth.users where id=p_account) then raise exception 'account_unavailable'; end if;
 if p_operation in ('request_consent','create','session','renew','resume') and not exists(select 1 from public.account_invitations where account_id=p_account and revoked_at is null) then raise exception 'invitation_required';end if;
 if p_operation in ('request_consent','create','session','renew','resume') and exists(select 1 from public.accounts where id=p_account and banned) then raise exception 'account_unavailable';end if;
 if p_operation='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'pseudonym',p.pseudonym,'managed',p.managed,'paused',p.paused_at is not null,
  'capabilities',(select jsonb_object_agg(r.capability,public.runtime_can(p.id,r.capability)) from public.participation_readiness r where r.age_band=p.age_band)))
  from public.participants p where p.account_id=p_account),'[]');
 elsif p_operation='requests' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'requested_at',requested_at,'can_create',status='verified' and expires_at>now() and consumed_by is null,'managed',verified_managed,'notice_version',notice_version,'public_disclosure',public_disclosure,'group_disclosure',group_disclosure)) from public.consent_requests where account_id=p_account),'[]');
 elsif p_operation='export_account' then
  perform set_config('request.jwt.claim.sub',p_account::text,true);
  result:=public.export_my_data()||public.export_discovery_data()||public.export_matchup_data()||public.export_wave2_take_data();
  return result||jsonb_build_object('managed_profiles',coalesce((select jsonb_agg(public.runtime_parent(p_account,'export',jsonb_build_object('participant',id))) from public.participants where account_id=p_account),'[]'),'consent_requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'requested_at',requested_at,'notice_version',notice_version,'verified_at',verified_at,'expires_at',expires_at,'capabilities',capabilities,'public_disclosure',public_disclosure,'group_disclosure',group_disclosure)) from public.consent_requests where account_id=p_account),'[]'));
 elsif p_operation='request_consent' then
  if (select count(*) from public.consent_requests where account_id=p_account and requested_at>now()-interval '24 hours')>=5 then raise exception 'consent_request_limit'; end if;
  insert into public.consent_requests(account_id,notice_version) values(p_account,'participation-draft-1') returning id into pid;
  return jsonb_build_object('id',pid,'status','pending_verification');
 elsif p_operation='create' then
  select * into receipt from public.consent_requests where id=(p_data->>'receipt')::uuid and account_id=p_account for update;
  if receipt.status is distinct from 'verified' or receipt.expires_at<=now() then raise exception 'verified_consent_required'; end if;
  if receipt.consumed_by is not null then return jsonb_build_object('id',receipt.consumed_by); end if;
  if (select count(*) from public.participants where account_id=p_account)>=8 then raise exception 'participant_limit'; end if;
  if coalesce(p_data->>'pseudonym','') !~ '^[a-z][a-z0-9_]{2,19}$' or exists(select 1 from public.blocked_handle_terms where public.contains_moderation_term(p_data->>'pseudonym',term)) then raise exception 'invalid_pseudonym'; end if;
  if exists(select 1 from public.accounts where id=p_account and banned) then raise exception 'account_unavailable'; end if;
  insert into public.participants(account_id,pseudonym,age_band,managed,invited_at) values(p_account,p_data->>'pseudonym',receipt.verified_band,receipt.verified_managed,now()) returning id into pid;
  prof:=case when receipt.verified_managed then pid else p_account end;
  if receipt.verified_managed then
   insert into public.profiles(id,handle,age_confirmed,public_identity) values(prof,'p_'||substr(replace(pid::text,'-',''),1,18),true,false);
  else
   if not exists(select 1 from public.profiles where id=prof) then insert into public.profiles(id,handle,age_confirmed,public_identity,banned,posting_locked_until,is_moderator) select prof,'p_'||substr(replace(prof::text,'-',''),1,18),true,false,banned,posting_locked_until,is_moderator from public.accounts where id=p_account;end if;
   if exists(select 1 from public.profiles where id=prof and handle<>p_data->>'pseudonym' and handle_set and handle_changed_at>now()-interval '30 days') then raise exception 'username_cooldown';end if;
   if exists(select 1 from public.profiles where handle=p_data->>'pseudonym' and id<>prof) then raise exception 'pseudonym_unavailable';end if;
   update public.profiles set age_confirmed=true,handle_changed_at=case when handle<>p_data->>'pseudonym' then now() else handle_changed_at end,handle=p_data->>'pseudonym',handle_set=true,public_identity=(receipt.verified_band='adult' and 'public_take'=any(receipt.capabilities)) where id=prof;
  end if;
  insert into public.participant_profiles values(pid,prof);update public.accounts set requires_participant=true where id=p_account;
  foreach cap in array receipt.capabilities loop
   insert into public.participant_permissions(participant_id,capability,verification_ref,notice_version,verified_at,expires_at,public_disclosure,group_disclosure) values(pid,cap,receipt.verification_ref,receipt.notice_version,receipt.verified_at,receipt.expires_at,receipt.public_disclosure and cap='photo',receipt.group_disclosure and cap='photo');
   insert into public.participant_permission_events(participant_id,capability,event,notice_version,details) values(pid,cap,'verified',receipt.notice_version,jsonb_build_object('public_disclosure',receipt.public_disclosure and cap='photo','group_disclosure',receipt.group_disclosure and cap='photo'));
  end loop;
  update public.consent_requests set consumed_by=pid where id=receipt.id;
  return jsonb_build_object('id',pid);
 elsif p_operation='delete_account' then
  update public.accounts set banned=true where id=p_account;update public.profiles set banned=true where id=p_account;
  insert into public.erasure_tombstones(subject_hash,kind) values(encode(sha256(convert_to(p_account::text,'UTF8')),'hex'),'account') on conflict do nothing;
  insert into public.account_erasure_jobs(account_id) values(p_account) on conflict(account_id) do update set account_id=excluded.account_id returning id into job;
  update public.participants set paused_at=coalesce(paused_at,now()) where account_id=p_account;
  update public.participant_sessions set revoked_at=coalesce(revoked_at,now()) where participant_id in(select id from public.participants where account_id=p_account);
  update public.photo_evidence set status='deleting',cleanup_due_at=now(),revision=revision+1 where participant_id in(select id from public.participants where account_id=p_account) and status not in ('deleting','deleted');
  return jsonb_build_object('job',job,'status','pending');
 end if;
 select * into target from public.participants where id=(p_data->>'participant')::uuid and account_id=p_account for update;
 if not found then raise exception 'participant_unavailable'; end if;
 if p_operation='session' then
  if not public.runtime_can(target.id,'discover') then raise exception 'participant_unavailable'; end if;
  if (select count(*) from public.participant_sessions where participant_id=target.id and revoked_at is null and expires_at>now())>=8 then raise exception 'device_session_limit';end if;
  insert into public.participant_sessions(token_hash,participant_id,expires_at) values(p_data->>'token_hash',target.id,now()+interval '30 minutes');
  return jsonb_build_object('participant',target.id,'pseudonym',target.pseudonym,'expires_in',1800);
 elsif p_operation='pause' then
  update public.participants set paused_at=coalesce(paused_at,now()) where id=target.id;
  update public.participant_sessions set revoked_at=coalesce(revoked_at,now()) where participant_id=target.id;
 elsif p_operation='resume' then update public.participants set paused_at=null where id=target.id;if not public.runtime_can(target.id,'discover') then raise exception 'participant_requirements_pending';end if;
 elsif p_operation='revoke' then
  update public.participant_permissions set revoked_at=now() where participant_id=target.id and capability=p_data->>'capability' and revoked_at is null;
  if found then insert into public.participant_permission_events(participant_id,capability,event,notice_version) values(target.id,p_data->>'capability','revoked','participation-draft-1'); end if;
 elsif p_operation='delete' then
  select profile_id into prof from public.participant_profiles where participant_id=target.id;
  insert into public.erasure_tombstones(subject_hash,kind) values(encode(sha256(convert_to(target.id::text,'UTF8')),'hex'),'participant') on conflict do nothing;
  update public.consent_requests set status='revoked' where consumed_by=target.id;
  delete from public.participants where id=target.id;
  if prof is not null and prof<>p_account then delete from public.profiles where id=prof; end if;
 elsif p_operation='renew' then
  select * into receipt from public.consent_requests where id=(p_data->>'receipt')::uuid and account_id=p_account for update;
  if receipt.status is distinct from 'verified' or receipt.expires_at<=now() or receipt.consumed_by is not null or receipt.verified_band<>target.age_band or receipt.verified_managed<>target.managed then raise exception 'verified_consent_required';end if;
  foreach cap in array receipt.capabilities loop
   insert into public.participant_permissions(participant_id,capability,verification_ref,notice_version,verified_at,expires_at,public_disclosure,group_disclosure)
    values(target.id,cap,receipt.verification_ref,receipt.notice_version,receipt.verified_at,receipt.expires_at,receipt.public_disclosure and cap='photo',receipt.group_disclosure and cap='photo')
    on conflict(participant_id,capability) do update set verification_ref=excluded.verification_ref,notice_version=excluded.notice_version,verified_at=excluded.verified_at,expires_at=excluded.expires_at,public_disclosure=excluded.public_disclosure,group_disclosure=excluded.group_disclosure,revoked_at=null;
   insert into public.participant_permission_events(participant_id,capability,event,notice_version,details) values(target.id,cap,'verified',receipt.notice_version,jsonb_build_object('renewal',true,'public_disclosure',receipt.public_disclosure and cap='photo','group_disclosure',receipt.group_disclosure and cap='photo'));
  end loop;
  update public.consent_requests set consumed_by=target.id where id=receipt.id;
  update public.participants set paused_at=null where id=target.id;
 elsif p_operation='photo_read' then
  return (select jsonb_build_object('key',v.object_key,'mime','image/jpeg') from public.photo_evidence e join public.photo_variants v on v.evidence_id=e.id where e.id=(p_data->>'id')::uuid and e.participant_id=target.id and e.status in ('pending','approved') and v.variant=p_data->>'variant');
 elsif p_operation='export' then
  perform set_config('request.jwt.claim.sub',(select profile_id::text from public.participant_profiles where participant_id=target.id),true);
  return public.runtime_export_participant(target.id)||public.export_my_data()||public.export_discovery_data()||public.export_matchup_data()||public.export_wave2_take_data()||
   jsonb_build_object('participant',to_jsonb(target),'permissions',coalesce((select jsonb_agg(jsonb_build_object('capability',capability,'verified_at',verified_at,'expires_at',expires_at,'revoked_at',revoked_at,'public_disclosure',public_disclosure)) from public.participant_permissions where participant_id=target.id),'[]'),
   'photos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'status',status,'submitted_at',submitted_at,'observed_at',observed_at)) from public.photo_evidence where participant_id=target.id),'[]'));
 else raise exception 'invalid_parent_operation'; end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.runtime_action(p_hash text,p_request uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; profile uuid; cap text; result jsonb; previous public.runtime_receipts; oldsub text:=current_setting('request.jwt.claim.sub',true); oldclaims text:=current_setting('request.jwt.claims',true); fingerprint text;
begin
 cap:=case p_operation when 'vote_matchup' then 'vote' when 'vote_court' then 'vote' when 'rate_place' then 'rate'
 when 'submit_report' then 'report' when 'submit_stock_report' then 'report' when 'submit_price' then 'report'
 when 'save_discovery' then 'rank' when 'mark_trail_stop' then 'trail' when 'submit_context_take' then 'public_take'
 when 'respond_take' then 'social' else 'discover' end;
 pid:=public.runtime_session(p_hash,cap,p_operation in ('set_user_block','report_content','report_discovery','appeal_strike','my_strikes','logout'));
 select profile_id into profile from public.participant_profiles where participant_id=pid;
 if p_operation='submit_stock_report' then perform pg_advisory_xact_lock(94172,1);end if;
 perform 1 from public.profiles where id=profile for update;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_operation,p_data)::text,'UTF8')),'hex');
 select * into previous from public.runtime_receipts where participant_id=pid and request_id=p_request;
 if found then
  if previous.fingerprint<>fingerprint then raise exception 'request_conflict'; end if; return previous.result;
 end if;
 if (select count(*) from public.runtime_receipts where participant_id=pid and created_at>now()-interval '24 hours')>=1000 then raise exception 'action_limit'; end if;
 perform set_config('request.jwt.claim.sub',profile::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',profile,'role','authenticated')::text,true);
 perform set_config('nugget.participant',pid::text,true);
 case p_operation
 when 'vote_matchup' then perform public.vote_matchup(p_data->>'p_matchup',p_data->>'p_side');
 when 'vote_court' then perform public.vote_court((p_data->>'p_case')::bigint,p_data->>'p_verdict');
 when 'rate_place' then perform public.rate_place(p_data->>'p_place',(p_data->>'p_crunch')::int,(p_data->>'p_juice')::int,(p_data->>'p_sauce')::int,(p_data->>'p_value')::int);
 when 'submit_report' then perform public.submit_report(p_data->>'p_place',p_data->>'p_status',false);
 when 'submit_stock_report' then perform public.submit_stock_report(p_data->>'p_product',p_data->>'p_place',p_data->>'p_status');select jsonb_build_object('id',id,'kind','stock_report') into result from public.stock_reports where user_id=profile order by id desc limit 1;
 when 'submit_price' then perform public.submit_price(p_data->>'p_place',p_data->>'p_product',(p_data->>'p_price')::numeric,(p_data->>'p_quantity')::numeric,p_data->>'p_unit');select jsonb_build_object('id',id,'kind','price_entry') into result from public.price_entries where user_id=profile order by id desc limit 1;
 when 'save_discovery' then perform public.save_discovery(p_data->>'p_kind',p_data->>'p_ref',p_data->>'p_state');
 when 'mark_trail_stop' then perform public.mark_trail_stop((p_data->>'p_trail')::bigint,p_data->>'p_place',(p_data->>'p_tried')::boolean);
 when 'my_wave_profile' then select coalesce(jsonb_agg(t),'[]') into result from public.my_wave_profile() t;
 when 'my_discoveries' then result:=public.my_discoveries();
 when 'my_strikes' then select coalesce(jsonb_agg(t),'[]') into result from public.my_strikes() t;
 when 'set_user_block' then perform public.set_user_block((p_data->>'p_user')::uuid,(p_data->>'p_block')::boolean);
 when 'report_content' then if p_data->>'p_kind'='take' and public.runtime_public_take((p_data->>'p_ref')::bigint) then perform public.runtime_public_report((p_data->>'p_ref')::bigint,p_data->>'p_reason');else perform public.report_content(p_data->>'p_kind',p_data->>'p_ref',p_data->>'p_reason');end if;
 when 'report_discovery' then perform public.report_discovery(p_data->>'p_kind',p_data->>'p_ref',p_data->>'p_reason');
 when 'appeal_strike' then perform public.appeal_strike((p_data->>'p_id')::bigint,p_data->>'p_reason');
 when 'submit_context_take' then
  perform public.runtime_review_capacity('text');
  if not public.runtime_can(pid,'public_take') then raise exception 'public_take_requirements_pending';end if;
  result:=to_jsonb(public.submit_context_take(p_data->>'p_kind',p_data->>'p_ref',p_data->>'p_body',p_data->>'p_stamp',null,null,null));
  if not exists(select 1 from public.profiles where id=profile and public_identity) and result->>'status'<>'hidden' then
   update public.takes set status='pending' where id=(result->>'id')::bigint;
   if not exists(select 1 from public.moderation_queue where kind='take' and content_ref=result->>'id' and status='pending') then insert into public.moderation_queue(reporter_id,kind,content_ref) values(profile,'take',result->>'id');end if;
   result:=jsonb_set(result,'{status}','"pending"'::jsonb);
  end if;
 when 'respond_take' then
  result:=to_jsonb(public.runtime_public_respond(pid,(p_data->>'p_take')::bigint,p_data->>'p_reaction',p_data->>'p_body'));
 when 'logout' then update public.participant_sessions set revoked_at=now() where token_hash=p_hash;
 else raise exception 'unsupported_participant_operation'; end case;
 result:=coalesce(result,'null'::jsonb);
 insert into public.runtime_receipts values(pid,p_request,p_operation,fingerprint,result,now());
 perform set_config('request.jwt.claim.sub',coalesce(oldsub,''),true);perform set_config('request.jwt.claims',coalesce(oldclaims,''),true);perform set_config('nugget.participant','',true);
 return result;
end $$;
create function public.erase_managed_contributor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.managed then delete from public.profiles where id=old.id; end if; return old;
end $$;
create trigger erase_managed_contributor after delete on public.participants for each row execute function public.erase_managed_contributor();
create function public.runtime_create_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.accounts(id,banned,posting_locked_until,is_moderator) select new.id,coalesce(p.banned,false),p.posting_locked_until,coalesce(p.is_moderator,false) from (select 1) seed left join public.profiles p on p.id=new.id on conflict do nothing;return new;
end $$;
create trigger runtime_create_account after insert on auth.users for each row execute function public.runtime_create_account();
create function public.runtime_mirror_account_flags() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.accounts set banned=new.banned,posting_locked_until=new.posting_locked_until,is_moderator=new.is_moderator where id=new.id;return new;
end $$;
create trigger runtime_mirror_account_flags after update of banned,posting_locked_until,is_moderator on public.profiles for each row execute function public.runtime_mirror_account_flags();
create function public.runtime_erase_contributor() returns trigger language plpgsql security definer set search_path='' as $$
declare prof uuid;
begin
 select profile_id into prof from public.participant_profiles where participant_id=old.id;
 if prof is not null then delete from public.profiles where id=prof;end if;return old;
end $$;
create trigger erase_participant_contributor before delete on public.participants for each row execute function public.runtime_erase_contributor();
-- Account controls must survive deletion of the account owner's own contributor profile.
create or replace function public.my_participants()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'pseudonym',p.pseudonym,'managed',p.managed,
 'paused',p.paused_at is not null,'capabilities',(select jsonb_object_agg(r.capability,public.participant_can(p.id,r.capability))
 from public.participation_readiness r where r.age_band=p.age_band)) order by p.created_at),'[]'::jsonb)
 from public.participants p join public.accounts a on a.id=p.account_id where p.account_id=auth.uid() and not a.banned
$$;
-- No browser access to broker functions. A dedicated login may be granted membership only at deployment review.
do $$ declare f record; begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('guard_profile_identity','erase_auth_profile','runtime_can','runtime_session','require_before_participant_social','require_social_user','guard_legacy_reports','runtime_verify_consent','runtime_parent','runtime_action','erase_managed_contributor','runtime_create_account','runtime_mirror_account_flags','runtime_erase_contributor') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated,nugget_broker,nugget_consent_verifier'; end loop; end $$;
grant execute on function public.runtime_verify_consent(uuid,text,boolean,text,timestamptz,text[],boolean) to nugget_consent_verifier;
grant execute on function public.runtime_parent(uuid,text,jsonb),public.runtime_action(text,uuid,text,jsonb) to nugget_broker;
commit;

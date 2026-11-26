begin;
create table public.participant_pairing (
 code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),participant_id uuid not null references public.participants on delete cascade,
 expires_at timestamptz not null default now()+interval '10 minutes',used_at timestamptz
);
create table public.private_crews (
 id uuid primary key default gen_random_uuid(),owner_id uuid references public.participants on delete set null,
 name text not null check(char_length(name) between 2 and 40),created_at timestamptz not null default now()
);
create table public.crew_members (
 crew_id uuid references public.private_crews on delete cascade,participant_id uuid references public.participants on delete cascade,
 joined_at timestamptz not null default now(),primary key(crew_id,participant_id)
);
create table public.crew_codes (
 code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),crew_id uuid references public.private_crews on delete cascade,
 expires_at timestamptz not null default now()+interval '24 hours',revoked_at timestamptz,created_at timestamptz not null default now()
);
create table public.crew_join_attempts (account_id uuid references public.accounts on delete cascade,created_at timestamptz not null default now());
create table public.crew_takes (
 id uuid primary key default gen_random_uuid(),crew_id uuid references public.private_crews on delete cascade,
 participant_id uuid references public.participants on delete cascade,body text not null check(char_length(body) between 1 and 280),
 status text not null check(status in ('pending','published','hidden')),created_at timestamptz not null default now(),
 parent_id uuid references public.crew_takes on delete set null,orphaned boolean not null default false
);
create table public.crew_reactions (
 take_id uuid references public.crew_takes on delete cascade,participant_id uuid references public.participants on delete cascade,
 reaction text not null check(reaction in ('with','against','crunch_counsel','sauce_objection')),updated_at timestamptz not null default now(),
 primary key(take_id,participant_id)
);
create table public.crew_challenges (
 id uuid primary key default gen_random_uuid(),crew_id uuid references public.private_crews on delete cascade,
 creator_id uuid references public.participants on delete set null,left_product text references public.products,right_product text references public.products,
 created_at timestamptz not null default now(),closes_at timestamptz not null default now()+interval '7 days',check(left_product<>right_product)
);
create table public.crew_votes (
 challenge_id uuid references public.crew_challenges on delete cascade,participant_id uuid references public.participants on delete cascade,
 side text not null check(side in ('left','right')),updated_at timestamptz not null default now(),primary key(challenge_id,participant_id)
);
do $$ declare t text;begin foreach t in array array['participant_pairing','private_crews','crew_members','crew_codes','crew_join_attempts','crew_takes','crew_reactions','crew_challenges','crew_votes'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,nugget_broker',t);end loop;end $$;
create function public.runtime_pair(p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 if p_operation='issue' then
  perform pg_advisory_xact_lock(hashtextextended('participation-account:'||p_account::text,0));
  select id into pid from public.participants where id=(p_data->>'participant')::uuid and account_id=p_account;
  if pid is null or not public.runtime_can(pid,'discover') then raise exception 'participant_unavailable'; end if;
  delete from public.participant_pairing where participant_id=pid;
  insert into public.participant_pairing(code_hash,participant_id) values(p_data->>'code_hash',pid);
  return jsonb_build_object('expires_in',600);
 elsif p_operation='redeem' then
  select participant_id into pid from public.participant_pairing where code_hash=p_data->>'code_hash';
  perform pg_advisory_xact_lock(hashtextextended('participation-account:'||(select account_id::text from public.participants where id=pid),0));
  update public.participant_pairing set used_at=now() where code_hash=p_data->>'code_hash' and used_at is null and expires_at>now() returning participant_id into pid;
  if pid is null or not public.runtime_can(pid,'discover') then raise exception 'pairing_unavailable'; end if;
  if (select count(*) from public.participant_sessions where participant_id=pid and revoked_at is null and expires_at>now())>=8 then raise exception 'device_session_limit';end if;
  insert into public.participant_sessions(token_hash,participant_id,expires_at) values(p_data->>'token_hash',pid,now()+interval '30 minutes');
  return (select jsonb_build_object('participant',pid,'pseudonym',pseudonym,'expires_in',1800) from public.participants where id=pid);
 end if;raise exception 'invalid_pairing_operation';
end $$;
create function public.runtime_group(p_hash text,p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; crew uuid; item uuid; previous record; visibility text; profile uuid; oldsub text:=current_setting('request.jwt.claim.sub',true);
begin
 if p_operation='join' then
  -- Only a freshly authenticated guardian/self account can approve joining. Child sessions cannot.
  if p_account is null then raise exception 'guardian_approval_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('participation-account:'||p_account::text,0));
  select id into pid from public.participants where id=(p_data->>'participant')::uuid and account_id=p_account;
  if pid is null or not public.runtime_can(pid,'compete') then raise exception 'participant_unavailable'; end if;
  perform 1 from public.accounts where id=p_account for update;
  if (select count(*) from public.crew_join_attempts where account_id=p_account and created_at>now()-interval '24 hours')>=10 then raise exception 'join_limit'; end if;
  insert into public.crew_join_attempts values(p_account,now());
  select crew_id into crew from public.crew_codes where code_hash=p_data->>'code_hash' and revoked_at is null and expires_at>now();
  -- Return an ordinary failure result so failed attempts commit rather than roll back the rate limit.
  if crew is null then return jsonb_build_object('error','code_unavailable'); end if;
  perform 1 from public.private_crews where id=crew for update;
  if (select count(*) from public.crew_members where crew_id=crew)>=20 and not exists(select 1 from public.crew_members where crew_id=crew and participant_id=pid) then raise exception 'crew_full'; end if;
  insert into public.crew_members(crew_id,participant_id) values(crew,pid) on conflict do nothing;
  return jsonb_build_object('id',crew);
 end if;
 pid:=public.runtime_session(p_hash,case when p_operation in ('list','view') then 'discover' when p_operation in ('take','react') then 'social' when p_operation='challenge' then 'challenge' else 'compete' end,p_operation in ('leave','report','block'));
 if p_operation='list' then return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'ownerless',g.owner_id is null)) from public.private_crews g join public.crew_members m on m.crew_id=g.id where m.participant_id=pid),'[]'); end if;
 if p_operation='create' then
  if (select count(*) from public.private_crews where owner_id=pid)>=10 then raise exception 'crew_limit'; end if;
  if public.social_text_blocked(p_data->>'name') then raise exception 'invalid_crew_name'; end if;
  insert into public.private_crews(owner_id,name) values(pid,p_data->>'name') returning id into crew;
  insert into public.crew_members(crew_id,participant_id) values(crew,pid);
  return jsonb_build_object('id',crew);
 end if;
 crew:=(p_data->>'crew')::uuid;
 perform 1 from public.private_crews where id=crew for update;
 if not exists(select 1 from public.crew_members where crew_id=crew and participant_id=pid) then raise exception 'crew_unavailable'; end if;
 if p_operation='code' then
  if not exists(select 1 from public.private_crews where id=crew and owner_id=pid) then raise exception 'crew_owner_required'; end if;
  update public.crew_codes set revoked_at=now() where crew_id=crew and revoked_at is null;
  insert into public.crew_codes(code_hash,crew_id) values(p_data->>'code_hash',crew);return jsonb_build_object('expires_in',86400);
 elsif p_operation='adopt' then
  update public.private_crews set owner_id=pid where id=crew and owner_id is null;if not found then raise exception 'crew_has_owner';end if;
 elsif p_operation='leave' then update public.private_crews set owner_id=null,name='Crunch Council' where id=crew and owner_id=pid;delete from public.crew_members where crew_id=crew and participant_id=pid;
 elsif p_operation='view' then
  return jsonb_build_object('takes',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body,'parent',t.parent_id,'status',t.status,'mine',t.participant_id=pid,'photos',(select coalesce(jsonb_agg(e.id),'[]') from public.photo_evidence e join public.photo_evidence_links l on l.evidence_id=e.id and l.kind='crew_take' and l.content_ref=t.id::text where public.runtime_photo_shared(pid,e.id)),
  'with',(select count(*) from public.crew_reactions where take_id=t.id and reaction='with'),'against',(select count(*) from public.crew_reactions where take_id=t.id and reaction='against')))
   from public.crew_takes t where t.crew_id=crew and (t.status='published' or t.participant_id=pid) and not exists(select 1 from public.crew_blocks b where (b.participant_id=pid and b.blocked_id=t.participant_id) or (b.blocked_id=pid and b.participant_id=t.participant_id)) and not exists(select 1 from public.crew_reports r where r.take_id=t.id and r.reporter_id=pid)),'[]'),
   'challenges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'mine',c.creator_id=pid,'left',c.left_product,'right',c.right_product,'closes_at',c.closes_at,
   'left_votes',(select count(*) from public.crew_votes where challenge_id=c.id and side='left'),'right_votes',(select count(*) from public.crew_votes where challenge_id=c.id and side='right')))
   from public.crew_challenges c where c.crew_id=crew),'[]'));
 elsif p_operation='take' then
  perform public.runtime_review_capacity('text');
  if (select count(*) from public.crew_takes where participant_id=pid and created_at>now()-interval '24 hours')>=15 then raise exception 'take_limit'; end if;
  if p_data->>'parent' is not null and not exists(select 1 from public.crew_takes where id=(p_data->>'parent')::uuid and crew_id=crew and status='published') then raise exception 'parent_unavailable'; end if;
  if p_data->>'parent' is not null and char_length(p_data->>'body')>180 then raise exception 'reply_too_long';end if;
  visibility:=case when public.social_text_blocked(p_data->>'body') then 'hidden' else 'pending' end;
  insert into public.crew_takes(crew_id,participant_id,body,status,parent_id) values(crew,pid,btrim(p_data->>'body'),visibility,(p_data->>'parent')::uuid) returning id into item;
  return jsonb_build_object('id',item,'status',visibility);
 elsif p_operation='react' then
  select * into previous from public.crew_takes where id=(p_data->>'take')::uuid and crew_id=crew and status='published';
  if not found then raise exception 'take_unavailable'; end if;
  if previous.participant_id=pid then raise exception 'cannot_react_to_own_take'; end if;
  if exists(select 1 from public.crew_reactions where participant_id=pid and take_id=previous.id and updated_at>now()-interval '5 seconds') then raise exception 'reaction_cooldown'; end if;
  if (select count(*) from public.crew_reactions where participant_id=pid and updated_at>now()-interval '24 hours')>=60 then raise exception 'reaction_limit'; end if;
  insert into public.crew_reactions(take_id,participant_id,reaction) values(previous.id,pid,p_data->>'reaction') on conflict(take_id,participant_id) do update set reaction=excluded.reaction,updated_at=now();
 elsif p_operation='challenge' then
  if (select count(*) from public.crew_challenges where creator_id=pid and created_at>now()-interval '24 hours')>=5 then raise exception 'challenge_limit'; end if;
  insert into public.crew_challenges(crew_id,creator_id,left_product,right_product) values(crew,pid,p_data->>'left',p_data->>'right') returning id into item;return jsonb_build_object('id',item);
 elsif p_operation='vote' then
  if not public.runtime_can(pid,'vote') then raise exception 'vote_permission_required'; end if;
  if not exists(select 1 from public.crew_challenges where id=(p_data->>'challenge')::uuid and crew_id=crew and closes_at>now()) then raise exception 'challenge_unavailable'; end if;
  select * into previous from public.crew_votes where challenge_id=(p_data->>'challenge')::uuid and participant_id=pid;
  if found and previous.updated_at>now()-interval '5 seconds' then raise exception 'vote_cooldown'; end if;
  if found and previous.side=p_data->>'side' then return jsonb_build_object('ok',true); end if;
  select profile_id into profile from public.participant_profiles where participant_id=pid;
  perform 1 from public.profiles where id=profile for update;
  perform set_config('request.jwt.claim.sub',profile::text,true);perform set_config('nugget.participant',pid::text,true);
  perform public.record_vote_action('matchup','private:'||(p_data->>'challenge'),case when previous is null then null else previous.side end,p_data->>'side');
  insert into public.crew_votes(challenge_id,participant_id,side) values((p_data->>'challenge')::uuid,pid,p_data->>'side') on conflict(challenge_id,participant_id) do update set side=excluded.side,updated_at=now();
  perform set_config('request.jwt.claim.sub',coalesce(oldsub,''),true);perform set_config('nugget.participant','',true);
 elsif p_operation in ('report','block') then
  select participant_id into item from public.crew_takes where id=(p_data->>'take')::uuid and crew_id=crew;
  if item is null then raise exception 'take_unavailable';end if;
  if p_operation='block' then
   if (select count(*) from public.crew_blocks where participant_id=pid)>=500 then raise exception 'block_limit';end if;
   insert into public.crew_blocks(participant_id,blocked_id) values(pid,item) on conflict do nothing;
  else
   if (select count(*) from public.crew_reports where reporter_id=pid and created_at>now()-interval '24 hours')>=20 then raise exception 'report_limit';end if;
   insert into public.crew_reports(take_id,reporter_id) values((p_data->>'take')::uuid,pid) on conflict do nothing;
   if (select count(*) from public.crew_reports where take_id=(p_data->>'take')::uuid)>=3 then update public.crew_takes set status='hidden' where id=(p_data->>'take')::uuid;end if;
  end if;
 else raise exception 'invalid_crew_operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.runtime_review_crew(p_moderator uuid,p_id uuid default null,p_decision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_moderator and is_moderator and not banned) then raise exception 'moderator_required'; end if;
 if p_id is null then return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body,'status',t.status)) from public.crew_takes t where t.status='pending' or exists(select 1 from public.crew_reports r where r.take_id=t.id)),'[]'); end if;
 if p_decision='approve' and exists(select 1 from public.crew_takes where id=p_id and orphaned) then raise exception 'parent_removed';end if;
 if p_decision not in ('approve','hide') then raise exception 'invalid_review_decision'; end if;
 if exists(select 1 from public.crew_takes t join public.participants p on p.id=t.participant_id where t.id=p_id and p.account_id=p_moderator) then raise exception 'cannot_review_own_take'; end if;
 update public.crew_takes set status=case when p_decision='approve' then 'published' else 'hidden' end where id=p_id and not public.social_text_blocked(body);
 return jsonb_build_object('ok',true);
end $$;
create function public.runtime_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('products',(select jsonb_agg(p) from public.products p),'places',(select jsonb_agg(p) from public.places p),
 'links',(select jsonb_agg(p) from public.place_products p),'showdowns',(select jsonb_agg(p) from public.matchups p),
 'court',public.court_cases(),'trails',public.list_trails())
$$;
create function public.runtime_erasure(p_operation text,p_job uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 if p_operation='list' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'account',account_id,'status',status)) from public.account_erasure_jobs where status<>'complete'),'[]'); end if;
 select account_id into account from public.account_erasure_jobs where id=p_job and status<>'complete' for update;
 if account is null then return jsonb_build_object('ok',true); end if;
 if p_operation='ready' then return jsonb_build_object('ready',not exists(select 1 from public.erasure_photo_refs r join public.photo_evidence e on e.id=r.evidence_id where r.job_id=p_job and e.status<>'deleted'));
 elsif p_operation='sql_delete' then
  insert into public.erasure_photo_refs select p_job,e.id from public.photo_evidence e join public.participants p on p.id=e.participant_id where p.account_id=account on conflict do nothing;
  delete from public.participants where account_id=account;
  delete from public.profiles where id=account;
  update public.account_erasure_jobs set status='sql_deleted' where id=p_job;
 elsif p_operation='complete' then
  if exists(select 1 from auth.users where id=account) or exists(select 1 from public.profiles where id=account) then raise exception 'erasure_incomplete'; end if;
  if exists(select 1 from public.erasure_photo_refs r join public.photo_evidence e on e.id=r.evidence_id where r.job_id=p_job and e.status<>'deleted') then raise exception 'blob_erasure_pending'; end if;
  delete from public.erasure_photo_refs where job_id=p_job;
  update public.account_erasure_jobs set status='complete',completed_at=now(),account_id=null where id=p_job;
 else raise exception 'invalid_erasure_operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
do $$ declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('runtime_pair','runtime_group','runtime_review_crew','runtime_catalog','runtime_erasure') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated,nugget_broker';execute 'grant execute on function '||f.signature||' to nugget_broker';end loop;end $$;
commit;

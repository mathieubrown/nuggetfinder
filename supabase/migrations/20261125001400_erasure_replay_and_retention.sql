begin;
create table public.erasure_tombstones (
 subject_hash text not null check(subject_hash ~ '^[a-f0-9]{64}$'),kind text not null check(kind in ('account','participant')),
 created_at timestamptz not null default now(),primary key(subject_hash,kind)
);
alter table public.erasure_tombstones enable row level security;
revoke all on public.erasure_tombstones from public,anon,authenticated,nugget_broker;
-- Keep the confirmed-action award after removing its old location-bearing report.
-- The detached award retains only owner, UTC award day and points for the daily cap.
alter table public.stock_point_awards drop constraint stock_point_awards_pkey;
alter table public.stock_point_awards add column id bigint generated always as identity primary key;
alter table public.stock_point_awards alter column report_id drop not null;
alter table public.stock_point_awards drop constraint stock_point_awards_report_id_fkey;
alter table public.stock_point_awards add foreign key(report_id) references public.stock_reports on delete set null;
alter table public.stock_point_awards add unique(report_id);
create function public.runtime_retention()
returns jsonb language plpgsql security definer set search_path='' as $$
declare person record; total integer:=0;
begin
 -- Minimize exact store observations for minors after the 24h trust window.
 -- Preserve earned points as totals without place IDs or visit dates.
 for person in select l.profile_id from public.participant_profiles l join public.participants p on p.id=l.participant_id where p.age_band<>'adult' loop
  perform 1 from public.profiles where id=person.profile_id for update;
  delete from public.stock_reports where user_id=person.profile_id and created_at<now()-interval '24 hours';
  delete from public.reports where user_id=person.profile_id and created_at<now()-interval '24 hours';
  -- Price records retain private ownership for history, moderation and deletion rights.
  -- The public ledger below removes linkable handles for private identities.
  total:=total+1;
 end loop;
 delete from public.crew_join_attempts where created_at<now()-interval '24 hours';
 delete from public.participant_pairing where expires_at<now() or used_at is not null;
 delete from public.crew_codes where expires_at<now() or revoked_at is not null;
 delete from public.consent_requests where status='pending' and requested_at<now()-interval '7 days';
 delete from public.erasure_tombstones where created_at<now()-interval '30 days';
 delete from public.account_erasure_jobs where status='complete' and completed_at<now()-interval '30 days';
 return jsonb_build_object('participants_minimized',total);
end $$;
create function public.runtime_replay_erasure()
returns jsonb language plpgsql security definer set search_path='' as $$
declare person record; account record; total integer:=0;
begin
 -- Invoke in maintenance mode before serving a restored snapshot. Ledger overlay must
 -- come from the independently preserved post-backup deletion journal.
 update public.runtime_controls set cutover=true,photo_publication_ready=false;
 update public.participation_readiness set enabled=false;
 for person in select p.id from public.participants p join public.erasure_tombstones t on t.kind='participant' and t.subject_hash=encode(sha256(convert_to(p.id::text,'UTF8')),'hex') loop
  delete from public.participants where id=person.id;total:=total+1;
 end loop;
 for account in select u.id from auth.users u join public.erasure_tombstones t on t.kind='account' and t.subject_hash=encode(sha256(convert_to(u.id::text,'UTF8')),'hex') loop
  insert into public.account_erasure_jobs(account_id) values(account.id) on conflict(account_id) do nothing;
 end loop;
 return jsonb_build_object('participants_erased',total,'capabilities_disabled',true);
end $$;
revoke all on function public.runtime_retention(),public.runtime_replay_erasure() from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_retention(),public.runtime_replay_erasure() to nugget_broker;
create or replace function public.price_ledger(p_place text default null,p_unit text default 'piece',p_product text default null)
returns jsonb language sql stable security definer set search_path='' as $$
  with evidence as (
    select e.id,e.place_id,e.product_id,e.price,e.quantity,e.unit,e.created_at,
      p.name as product_name,p.brand,p.kind,
      s.name as place_name,s.area,
      case when u.public_identity then left(u.handle,1) || '****' || right(u.handle,1) else 'Community observation' end as masked_handle,
      (v.id is not null and v.revoked_at is null and v.place_id=e.place_id and v.user_id=e.user_id) as verified_store,
      e.price/e.quantity as unit_cost,
      (select stock from jsonb_array_elements(public.product_stock_snapshot(e.product_id)) stock where stock->>'place_id'=e.place_id) as stock,
      public.price_observation_age(e.created_at,now()) as freshness,
      public.product_allergen_evidence(e.product_id) as allergens
    from public.price_entries e
    join public.products p on p.id=e.product_id
    join public.places s on s.id=e.place_id
    join public.profiles u on u.id=e.user_id and not u.banned
    left join public.business_verifications v on v.id=e.verification_id
    where (p_place is null or e.place_id=p_place) and e.unit=p_unit
      and (p_product is null or e.product_id=p_product)
  ), ranked as (
    select e.*,row_number() over(partition by place_id,product_id,unit
      order by created_at desc,id desc) as position
    from evidence e
  )
  select coalesce(jsonb_agg(p order by p.position=1 desc,case when p.position=1 then p.unit_cost end,p.created_at desc,p.id desc),'[]'::jsonb)
  from (select r.*,r.position>1 as superseded from ranked r
    order by r.position=1 desc,case when r.position=1 then r.unit_cost end,r.created_at desc,r.id desc limit 1000) p
$$;

commit;

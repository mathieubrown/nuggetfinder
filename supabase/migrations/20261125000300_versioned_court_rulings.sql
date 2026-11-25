begin;
-- Preserve a published case and its ruling record when its nominator deletes an account.
alter table public.court_cases alter column author_id drop not null;
alter table public.court_cases drop constraint court_cases_author_id_fkey;
alter table public.court_cases add foreign key(author_id) references public.profiles on delete set null;
create table public.court_ruling_ballots (
 id bigint generated always as identity primary key,
 case_id bigint not null references public.court_cases on delete restrict,
 user_id uuid references public.profiles on delete set null,
 verdict text not null check(verdict in ('nugget','adjacent','no')),
 eligible_at_record boolean not null,
 unique(case_id,user_id)
);
create table public.court_rulings (
 case_id bigint not null references public.court_cases on delete restrict,
 version integer not null check(version>0),
 previous_version integer,
 nugget bigint not null check(nugget>=0),adjacent bigint not null check(adjacent>=0),no bigint not null check(no>=0),
 verdict text not null check(verdict in ('insufficient','divided','nugget','adjacent','no')),
 excluded_ballots bigint[] not null default '{}',
 reason text not null check(reason in ('round_closed','eligibility_review','vote_abuse','account_deletion','clerical_correction')),
 note text not null check(char_length(btrim(note)) between 1 and 280),
 recorded_by uuid references public.profiles on delete set null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(case_id,version),
 foreign key(case_id,previous_version) references public.court_rulings(case_id,version),
 check((version=1 and previous_version is null) or previous_version=version-1)
);
alter table public.court_ruling_ballots enable row level security;
alter table public.court_rulings enable row level security;
revoke all on public.court_ruling_ballots,public.court_rulings from public,anon,authenticated;

-- Audit facts are append-only, even through ordinary SQL updates. The sole allowed
-- update is an FK-driven identity erasure after the referenced account is deleted.
create function public.guard_court_audit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'court_audit_immutable'; end if;
 if tg_table_name='court_ruling_ballots' then
  if old.user_id is not null and new.user_id is null
   and not exists(select 1 from public.profiles where id=old.user_id)
   and (to_jsonb(new)-'user_id')=(to_jsonb(old)-'user_id') then return new; end if;
 else
  if old.recorded_by is not null and new.recorded_by is null
   and not exists(select 1 from public.profiles where id=old.recorded_by)
   and (to_jsonb(new)-'recorded_by')=(to_jsonb(old)-'recorded_by') then return new; end if;
 end if;
 raise exception 'court_audit_immutable';
end $$;
revoke execute on function public.guard_court_audit() from public,anon,authenticated;
create trigger immutable_court_rulings before update or delete on public.court_rulings
for each row execute function public.guard_court_audit();
create trigger immutable_court_ballots before update or delete on public.court_ruling_ballots
for each row execute function public.guard_court_audit();

create or replace function public.court_visible(p_case bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.court_cases where id=p_case and status='published'
 and (author_id is null or public.discovery_author_visible(author_id)))
$$;

-- LOGIC-START
-- Moderator records the closed ballot, never chooses an outcome or changes the deadline.
-- Corrections append a new derived version; earlier counts/reasons are never rewritten.
create function public.record_court_ruling(p_case bigint,p_expected_version integer default 0,
 p_excluded bigint[] default '{}',p_reason text default 'round_closed',p_note text default 'Seven-day voting round closed.')
returns integer language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=public.require_nugget_moderator(); target public.court_cases;
 current_version integer; counts record; exclusions bigint[];
begin
 select * into target from public.court_cases where id=p_case for update;
 if not found or target.status<>'published' or target.closes_at is null or target.closes_at>clock_timestamp()
 then raise exception 'round_not_closed'; end if;
 select coalesce(max(version),0) into current_version from public.court_rulings where case_id=p_case;
 if p_expected_version is null or p_expected_version<>current_version then raise exception 'ruling_version_conflict'; end if;
 if p_excluded is null or array_position(p_excluded,null) is not null or cardinality(p_excluded)>10000
 or p_note is null or char_length(btrim(p_note)) not between 1 and 280
 then raise exception 'invalid_ruling'; end if;
 select coalesce(array_agg(distinct id order by id),'{}') into exclusions from unnest(p_excluded) e(id);
 if current_version=0 then
  if cardinality(exclusions)>0 or p_reason is distinct from 'round_closed' then raise exception 'initial_ruling_required'; end if;
  insert into public.court_ruling_ballots(case_id,user_id,verdict,eligible_at_record)
  select v.case_id,v.user_id,v.verdict,not p.banned from public.court_votes v
  join public.profiles p on p.id=v.user_id where v.case_id=p_case and v.updated_at<=target.closes_at;
 else
  if p_reason is null or p_reason not in ('eligibility_review','vote_abuse','account_deletion','clerical_correction')
  then raise exception 'correction_reason_required'; end if;
  if exists(select 1 from unnest(exclusions) e(id) where not exists(
    select 1 from public.court_ruling_ballots b where b.id=e.id and b.case_id=p_case and b.eligible_at_record))
  then raise exception 'invalid_ballot_exclusion'; end if;
 end if;
 select count(*) filter(where verdict='nugget') nugget,count(*) filter(where verdict='adjacent') adjacent,
 count(*) filter(where verdict='no') no into counts from public.court_ruling_ballots
 where case_id=p_case and eligible_at_record and not(id=any(exclusions));
 insert into public.court_rulings(case_id,version,previous_version,nugget,adjacent,no,verdict,excluded_ballots,reason,note,recorded_by)
 values(p_case,current_version+1,nullif(current_version,0),counts.nugget,counts.adjacent,counts.no,
 public.court_verdict(counts.nugget,counts.adjacent,counts.no,true),exclusions,p_reason,btrim(p_note),actor);
 return current_version+1;
end $$;
-- LOGIC-END

create or replace function public.court_cases(p_id bigint default null,p_guide boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
 with live as (
 select c.id,c.author_id,c.food_name,c.argument,c.opened_at,c.closes_at,
 count(p.id) filter(where v.verdict='nugget') nugget,count(p.id) filter(where v.verdict='adjacent') adjacent,
 count(p.id) filter(where v.verdict='no') no,max(v.verdict) filter(where v.user_id=auth.uid()) mine
 from public.court_cases c left join public.court_votes v on v.case_id=c.id
 left join public.profiles p on p.id=v.user_id and not p.banned
 where public.court_visible(c.id) and (p_id is null or c.id=p_id) group by c.id
 ), results as (
 select t.id,t.author_id,t.food_name,t.argument,t.opened_at,t.closes_at,t.mine,
 coalesce(r.nugget,t.nugget) nugget,coalesce(r.adjacent,t.adjacent) adjacent,coalesce(r.no,t.no) no,
 case when r.version is not null then r.verdict when t.closes_at<=now() then 'awaiting' else 'open' end verdict,
 r.version ruling_version,r.recorded_at ruling_recorded_at,r.reason ruling_reason,r.note ruling_note
 from live t left join lateral(select * from public.court_rulings where case_id=t.id order by version desc limit 1) r on true
 ) select coalesce(jsonb_agg(r order by opened_at desc,id desc),'[]'::jsonb)
 from(select * from results where not p_guide or verdict in ('nugget','adjacent') order by opened_at desc,id desc limit 100) r
$$;
create function public.court_ruling_history(p_case bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('version',version,'previous_version',previous_version,
 'nugget',nugget,'adjacent',adjacent,'no',no,'verdict',verdict,'reason',reason,'note',note,'recorded_at',recorded_at)
 order by version desc),'[]'::jsonb) from public.court_rulings where case_id=p_case and public.court_visible(p_case)
$$;
create function public.court_rounds_for_review()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_nugget_moderator();
 return coalesce((select jsonb_agg(c) from (
 select c.id,c.food_name,c.closes_at,coalesce((select max(version) from public.court_rulings where case_id=c.id),0) current_version
 from public.court_cases c where status='published' and closes_at<=now() order by closes_at desc,id desc limit 100)c),'[]'::jsonb);
end $$;
create function public.court_review_state(p_case bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_nugget_moderator();
 return(select jsonb_build_object('id',c.id,'food_name',c.food_name,'closes_at',c.closes_at,
 'current_version',coalesce(r.version,0),'excluded_ballots',coalesce(to_jsonb(r.excluded_ballots),'[]'::jsonb),
 'ballots',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'handle',p.handle,'account_deleted',b.user_id is null,
 'verdict',b.verdict,'eligible_at_record',b.eligible_at_record,'currently_banned',coalesce(p.banned,false)) order by b.id)
 from public.court_ruling_ballots b left join public.profiles p on p.id=b.user_id where b.case_id=c.id),'[]'::jsonb))
 from public.court_cases c left join lateral(select * from public.court_rulings where case_id=c.id order by version desc limit 1)r on true
 where c.id=p_case);
end $$;
revoke execute on function public.record_court_ruling(bigint,integer,bigint[],text,text),public.court_ruling_history(bigint),
 public.court_rounds_for_review(),public.court_review_state(bigint) from public,anon,authenticated;
grant execute on function public.record_court_ruling(bigint,integer,bigint[],text,text),public.court_rounds_for_review(),public.court_review_state(bigint) to authenticated;
grant execute on function public.court_ruling_history(bigint) to anon,authenticated;
alter function public.export_discovery_data() rename to export_before_court_rulings;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sign_in_required'; end if;
 return public.export_before_court_rulings() || jsonb_build_object(
 'court_recorded_ballots',coalesce((select jsonb_agg(b) from public.court_ruling_ballots b where user_id=auth.uid()),'[]'::jsonb),
 'court_ruling_records',coalesce((select jsonb_agg(r) from public.court_rulings r where recorded_by=auth.uid()),'[]'::jsonb));
end $$;
revoke execute on function public.export_before_court_rulings(),public.export_discovery_data() from public,anon,authenticated;
grant execute on function public.export_discovery_data() to authenticated;
commit;

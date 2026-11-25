begin;
-- Every first vote and actual change consumes one shared Court/Showdown action.
create table public.vote_actions (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles on delete cascade,
 kind text not null check(kind in ('court','matchup')),
 content_ref text not null,
 previous_vote text,
 vote text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index vote_actions_user_time on public.vote_actions(user_id,created_at desc);
alter table public.vote_actions enable row level security;
revoke all on public.vote_actions from public,anon,authenticated;
-- Existing Showdown event history is exact. Legacy Court only retained the latest
-- answer; count each recent stored Court vote once rather than inventing history.
insert into public.vote_actions(user_id,kind,content_ref,vote,created_at)
select user_id,'matchup',matchup_id,side,voted_at from public.matchup_vote_history
where voted_at>clock_timestamp()-interval '24 hours';
insert into public.vote_actions(user_id,kind,content_ref,vote,created_at)
select user_id,'court',case_id::text,verdict,updated_at from public.court_votes
where updated_at>clock_timestamp()-interval '24 hours';

-- LOGIC-START
create function public.record_vote_action(p_kind text,p_ref text,p_previous text,p_vote text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user();
begin
 if (select count(*) from public.vote_actions where user_id=actor
  and created_at>clock_timestamp()-interval '24 hours')>=60 then raise exception 'vote_limit'; end if;
 insert into public.vote_actions(user_id,kind,content_ref,previous_vote,vote)
 values(actor,p_kind,p_ref,p_previous,p_vote);
end $$;
-- LOGIC-END
revoke execute on function public.record_vote_action(text,text,text,text) from public,anon,authenticated;

create or replace function public.vote_matchup(p_matchup text,p_side text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user(); previous public.matchup_votes;
begin
 if p_side is null or p_side not in ('left','right') or not exists(select 1 from public.matchups where id=p_matchup)
 then raise exception 'invalid_vote'; end if;
 select * into previous from public.matchup_votes where matchup_id=p_matchup and user_id=actor;
 if found then
  if previous.updated_at>clock_timestamp()-interval '5 seconds' then raise exception 'vote_cooldown'; end if;
  if previous.side=p_side then return; end if;
 end if;
 perform public.record_vote_action('matchup',p_matchup,previous.side,p_side);
 insert into public.matchup_votes(matchup_id,user_id,side,updated_at) values(p_matchup,actor,p_side,clock_timestamp())
 on conflict(matchup_id,user_id) do update set side=excluded.side,updated_at=excluded.updated_at;
end $$;
create or replace function public.vote_court(p_case bigint,p_verdict text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user(); previous public.court_votes;
begin
 if p_verdict is null or p_verdict not in ('nugget','adjacent','no') then raise exception 'invalid_verdict'; end if;
 perform 1 from public.court_cases where id=p_case for update;
 if not public.court_visible(p_case) or not exists(select 1 from public.court_cases where id=p_case and closes_at>clock_timestamp())
 then raise exception 'round_unavailable'; end if;
 select * into previous from public.court_votes where case_id=p_case and user_id=actor;
 if found then
  if previous.updated_at>clock_timestamp()-interval '5 seconds' then raise exception 'vote_cooldown'; end if;
  if previous.verdict=p_verdict then return; end if;
 end if;
 perform public.record_vote_action('court',p_case::text,previous.verdict,p_verdict);
 insert into public.court_votes(case_id,user_id,verdict,updated_at) values(p_case,actor,p_verdict,clock_timestamp())
 on conflict(case_id,user_id) do update set verdict=excluded.verdict,updated_at=excluded.updated_at;
end $$;

alter function public.export_discovery_data() rename to export_before_vote_actions;
create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'sign_in_required'; end if;
 return public.export_before_vote_actions() || jsonb_build_object('vote_actions',coalesce(
 (select jsonb_agg(v) from public.vote_actions v where user_id=auth.uid()),'[]'::jsonb));
end $$;
revoke execute on function public.export_before_vote_actions() from public,anon,authenticated;
revoke execute on function public.export_discovery_data() from public,anon,authenticated;
grant execute on function public.export_discovery_data() to authenticated;
commit;

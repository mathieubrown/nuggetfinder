begin;
create table public.beef_vote_history (
 id bigint generated always as identity primary key,
 matchup_id text not null references public.beef_matchups on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 side text not null check(side in ('left','right')),
 voted_at timestamptz not null
);
create index beef_vote_history_time on public.beef_vote_history(voted_at desc,matchup_id);
alter table public.beef_vote_history enable row level security;
revoke all on public.beef_vote_history from public,anon,authenticated;
insert into public.beef_vote_history(matchup_id,user_id,side,voted_at)
 select matchup_id,user_id,side,updated_at from public.beef_votes;
create function public.record_beef_vote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.beef_vote_history(matchup_id,user_id,side,voted_at)
 values(new.matchup_id,new.user_id,new.side,new.updated_at);
 return new;
end $$;
create trigger record_beef_vote after insert or update on public.beef_votes
for each row execute function public.record_beef_vote();
create function public.weekly_beef()
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,week_of date)
language sql stable security definer set search_path='' as $$
 with bounds as (select date_trunc('week',now() at time zone 'UTC') as end_at),
 latest as (
 select distinct on(v.matchup_id,v.user_id) v.matchup_id,v.user_id,v.side
 from public.beef_vote_history v join public.profiles p on p.id=v.user_id and not p.banned
 cross join bounds b where v.voted_at >= ((b.end_at-interval '7 days') at time zone 'UTC')
 and v.voted_at < (b.end_at at time zone 'UTC')
 order by v.matchup_id,v.user_id,v.voted_at desc,v.id desc
 )
 select m.id,m.left_label,m.right_label,count(*) filter(where l.side='left'),
 count(*) filter(where l.side='right'),(b.end_at-interval '7 days')::date
 from latest l join public.beef_matchups m on m.id=l.matchup_id cross join bounds b
 group by m.id,b.end_at order by count(*) desc,m.id
$$;
create or replace function public.export_beef_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'beef_votes',coalesce((select jsonb_agg(v) from public.beef_votes v where user_id=auth.uid()),'[]'),
 'beef_vote_history',coalesce((select jsonb_agg(v) from public.beef_vote_history v where user_id=auth.uid()),'[]'))
$$;
revoke execute on function public.record_beef_vote(),public.weekly_beef() from public,anon,authenticated;
grant execute on function public.weekly_beef() to anon,authenticated;
commit;

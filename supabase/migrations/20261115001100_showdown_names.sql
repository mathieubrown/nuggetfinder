begin;
alter table public.beef_matchups rename to matchups;
alter table public.beef_votes rename to matchup_votes;
alter table public.beef_vote_history rename to matchup_vote_history;
create function public.vote_matchup(p_matchup text,p_side text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user();
begin
 if (select count(*) from public.matchup_votes where user_id=actor and updated_at>now()-interval '24 hours')>=60
 then raise exception 'vote_limit'; end if;
 insert into public.matchup_votes(matchup_id,user_id,side) values(p_matchup,actor,p_side)
 on conflict(matchup_id,user_id) do update set side=excluded.side,updated_at=now()
 where public.matchup_votes.updated_at<=now()-interval '5 seconds';
 if not found then raise exception 'vote_cooldown'; end if;
end $$;
create function public.matchups(p_id text default null)
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,mine text)
language sql stable security definer set search_path='' as $$
 select m.id,m.left_label,m.right_label,
 count(p.id) filter(where v.side='left'),count(p.id) filter(where v.side='right'),
 max(v.side) filter(where p.id=auth.uid())
 from public.matchups m left join public.matchup_votes v on v.matchup_id=m.id
 left join public.profiles p on p.id=v.user_id and not p.banned
 where p_id is null or m.id=p_id
 group by m.id order by m.created_at desc,m.id limit 100
$$;
create or replace function public.social_subject_exists(p_kind text,p_ref text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_kind when 'place' then exists(select 1 from public.places where id=p_ref)
 when 'product' then exists(select 1 from public.products where id=p_ref)
 when 'matchup' then exists(select 1 from public.matchups where id=p_ref) else false end
$$;
create function public.record_matchup_vote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.matchup_vote_history(matchup_id,user_id,side,voted_at)
 values(new.matchup_id,new.user_id,new.side,new.updated_at);
 return new;
end $$;
create function public.weekly_matchups()
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,week_of date)
language sql stable security definer set search_path='' as $$
 with bounds as (select date_trunc('week',now() at time zone 'UTC') as end_at),
 latest as (
 select distinct on(v.matchup_id,v.user_id) v.matchup_id,v.user_id,v.side
 from public.matchup_vote_history v join public.profiles p on p.id=v.user_id and not p.banned
 cross join bounds b where v.voted_at >= ((b.end_at-interval '7 days') at time zone 'UTC')
 and v.voted_at < (b.end_at at time zone 'UTC')
 order by v.matchup_id,v.user_id,v.voted_at desc,v.id desc
 )
 select m.id,m.left_label,m.right_label,count(*) filter(where l.side='left'),
 count(*) filter(where l.side='right'),(b.end_at-interval '7 days')::date
 from latest l join public.matchups m on m.id=l.matchup_id cross join bounds b
 group by m.id,b.end_at order by count(*) desc,m.id
$$;
create function public.export_matchup_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'matchup_votes',coalesce((select jsonb_agg(v) from public.matchup_votes v where user_id=auth.uid()),'[]'),
 'matchup_vote_history',coalesce((select jsonb_agg(v) from public.matchup_vote_history v where user_id=auth.uid()),'[]'))
$$;

drop trigger record_beef_vote on public.matchup_votes;
create trigger record_matchup_vote after insert or update on public.matchup_votes
for each row execute function public.record_matchup_vote();
revoke execute on function public.record_matchup_vote(),public.vote_matchup(text,text),public.matchups(text),public.weekly_matchups(),public.export_matchup_data() from public,anon,authenticated;
grant execute on function public.vote_matchup(text,text),public.export_matchup_data() to authenticated;
grant execute on function public.matchups(text),public.weekly_matchups() to anon,authenticated;

-- Keep the currently published app working until the new screens ship.
create or replace function public.vote_beef(p_matchup text,p_side text)
returns void language sql security definer set search_path='' as $$ select public.vote_matchup(p_matchup,p_side) $$;
create or replace function public.beef_matchups(p_id text default null)
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,mine text)
language sql stable security definer set search_path='' as $$ select * from public.matchups(p_id) $$;
create or replace function public.weekly_beef()
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,week_of date)
language sql stable security definer set search_path='' as $$ select * from public.weekly_matchups() $$;
create or replace function public.export_beef_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('beef_votes',v->'matchup_votes','beef_vote_history',v->'matchup_vote_history') from public.export_matchup_data() v
$$;
commit;

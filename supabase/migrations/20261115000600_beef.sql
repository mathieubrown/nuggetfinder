begin;
create table public.beef_matchups (
 id text primary key,
 left_label text not null,
 right_label text not null,
 created_at timestamptz not null default now()
);
create table public.beef_votes (
 matchup_id text references public.beef_matchups on delete cascade,
 user_id uuid references public.profiles on delete cascade,
 side text not null check(side in ('left','right')),
 updated_at timestamptz not null default now(),
 primary key(matchup_id,user_id)
);
alter table public.beef_matchups enable row level security;
alter table public.beef_votes enable row level security;
revoke all on public.beef_matchups,public.beef_votes from public,anon,authenticated;

insert into public.beef_matchups(id,left_label,right_label) values
 ('cane-vs-cfa','Cane’s Sauce','Chick-fil-A Sauce'),
 ('bbq-vs-ranch','Barbecue','Ranch'),
 ('buffalo-vs-honey','Buffalo','Honey mustard'),
 ('nugs-vs-strips','Nuggets','Tenders'),
 ('crinkle-vs-waffle','Crinkle fries','Waffle fries'),
 ('pickle-vs-no-pickle','With pickles','Without pickles'),
 ('classic-vs-spicy','Classic','Spicy'),
 ('crunch-vs-juicy','Extra crispy','Extra juicy'),
 ('dipped-vs-tossed','Dip on the side','Tossed in sauce'),
 ('air-vs-oven','Air fryer','Oven baked');

create function public.vote_beef(p_matchup text,p_side text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user();
begin
 if (select count(*) from public.beef_votes where user_id=actor and updated_at>now()-interval '24 hours')>=60
 then raise exception 'vote_limit'; end if;
 insert into public.beef_votes(matchup_id,user_id,side) values(p_matchup,actor,p_side)
 on conflict(matchup_id,user_id) do update set side=excluded.side,updated_at=now()
 where public.beef_votes.updated_at<=now()-interval '5 seconds';
 if not found then raise exception 'vote_cooldown'; end if;
end $$;
create function public.beef_matchups(p_id text default null)
returns table(id text,left_label text,right_label text,left_votes bigint,right_votes bigint,mine text)
language sql stable security definer set search_path='' as $$
 select m.id,m.left_label,m.right_label,
 count(p.id) filter(where v.side='left'),count(p.id) filter(where v.side='right'),
 max(v.side) filter(where p.id=auth.uid())
 from public.beef_matchups m left join public.beef_votes v on v.matchup_id=m.id
 left join public.profiles p on p.id=v.user_id and not p.banned
 where p_id is null or m.id=p_id
 group by m.id order by m.created_at desc,m.id limit 100
$$;
create or replace function public.social_subject_exists(p_kind text,p_ref text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_kind when 'place' then exists(select 1 from public.places where id=p_ref)
 when 'product' then exists(select 1 from public.products where id=p_ref)
 when 'matchup' then exists(select 1 from public.beef_matchups where id=p_ref) else false end
$$;
create function public.export_beef_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('beef_votes',coalesce((select jsonb_agg(v) from public.beef_votes v where user_id=auth.uid()),'[]'))
$$;
revoke execute on function public.vote_beef(text,text),public.beef_matchups(text),public.export_beef_data() from public,anon,authenticated;
grant execute on function public.vote_beef(text,text),public.export_beef_data() to authenticated;
grant execute on function public.beef_matchups(text) to anon,authenticated;
commit;

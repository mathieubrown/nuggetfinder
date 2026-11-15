begin;
create table public.user_follows (
 user_id uuid references public.profiles on delete cascade,
 followed_id uuid references public.profiles on delete cascade,
 primary key(user_id,followed_id), check(user_id<>followed_id)
);
alter table public.user_follows enable row level security;
revoke all on public.user_follows from public,anon,authenticated;

create function public.set_follow(p_user uuid,p_follow boolean)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.require_social_user();
begin
 if p_follow then
  if (select count(*) from public.user_follows where user_id=actor)>=500 then raise exception 'follow_limit'; end if;
  insert into public.user_follows values(actor,p_user) on conflict do nothing;
 else delete from public.user_follows where user_id=actor and followed_id=p_user;
 end if;
end $$;

create function public.take_heat(p_take bigint)
returns integer language sql stable set search_path='' as $$ select 0 $$;
create function public.community_feed(p_tab text,p_before bigint default null)
returns table(id bigint,author_id uuid,handle text,subject_kind text,subject_ref text,body text,created_at timestamptz,following boolean)
language sql stable security definer set search_path='' as $$
 select t.id,t.author_id,p.handle,t.subject_kind,t.subject_ref,t.body,t.created_at,f.followed_id is not null
 from public.takes t join public.profiles p on p.id=t.author_id and not p.banned
 left join public.user_follows f on f.user_id=auth.uid() and f.followed_id=t.author_id
 where t.status='published' and p_tab in ('hot','recent','following')
 and (p_before is null or t.id<p_before)
 and (p_tab<>'following' or f.followed_id is not null)
 and not exists(select 1 from public.user_blocks b where
  (b.user_id=auth.uid() and b.blocked_id=t.author_id) or (b.blocked_id=auth.uid() and b.user_id=t.author_id))
 order by case when p_tab='hot' then public.take_heat(t.id)/power(2,extract(epoch from now()-t.created_at)/86400) end desc,
 t.created_at desc,t.id desc limit 50
$$;
create or replace function public.export_wave2_take_data()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'takes',coalesce((select jsonb_agg(t) from public.takes t where author_id=auth.uid()),'[]'),
 'following',coalesce((select jsonb_agg(f.followed_id) from public.user_follows f where user_id=auth.uid()),'[]'))
$$;
revoke execute on function public.set_follow(uuid,boolean) from public,anon;
grant execute on function public.set_follow(uuid,boolean) to authenticated;
revoke execute on function public.take_heat(bigint),public.community_feed(text,bigint) from public,anon,authenticated;
grant execute on function public.community_feed(text,bigint) to anon,authenticated;
commit;

begin;

-- Reuse the existing follow graph. Private saves are never included in public profiles.
create or replace function public.set_follow(p_user uuid, p_follow boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
begin
  if p_follow is null or p_user is null or p_user = actor then raise exception 'invalid_follow'; end if;
  if not p_follow then
    delete from public.user_follows where user_id = actor and followed_id = p_user;
    return;
  end if;
  if not public.discovery_author_visible(p_user) then raise exception 'profile_unavailable'; end if;
  if (select count(*) from public.user_follows where user_id = actor) >= 500
    and not exists(select 1 from public.user_follows where user_id = actor and followed_id = p_user)
  then raise exception 'follow_limit'; end if;
  insert into public.user_follows(user_id, followed_id) values(actor,p_user) on conflict do nothing;
end
$$;

create or replace function public.set_user_block(p_user uuid, p_block boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
begin
  if p_user is null or p_user = actor or p_block is null then raise exception 'invalid_block'; end if;
  if not p_block then
    delete from public.user_blocks where user_id = actor and blocked_id = p_user;
    return;
  end if;
  if (select count(*) from public.user_blocks where user_id = actor) >= 500
    and not exists(select 1 from public.user_blocks where user_id = actor and blocked_id = p_user)
  then raise exception 'block_limit'; end if;
  insert into public.user_blocks(user_id,blocked_id) values(actor,p_user) on conflict do nothing;
  delete from public.user_follows
  where (user_id = actor and followed_id = p_user) or (user_id = p_user and followed_id = actor);
end
$$;

create function public.taste_profile(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',p.id,
    'handle',p.handle,
    'following',exists(select 1 from public.user_follows where user_id = auth.uid() and followed_id = p.id),
    'take_count',(select count(*) from public.takes where author_id = p.id and public.take_visible(id)),
    'takes',coalesce((
      select jsonb_agg(t order by t.created_at desc,t.id desc) from (
        select t.id,t.author_id,p.handle,t.subject_kind,t.subject_ref,t.body,t.created_at,
          public.discovery_subject(t.subject_kind,t.subject_ref) as subject
        from public.takes t where t.author_id = p.id and public.take_visible(t.id)
        order by t.created_at desc,t.id desc limit 50
      ) t
    ),'[]'::jsonb)
  )
  from public.profiles p where p.id = p_user and public.discovery_author_visible(p.id)
$$;

create function public.find_tastes(p_query text default '')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(p order by p.handle,p.id), '[]'::jsonb) from (
    select id,handle from public.profiles
    where char_length(btrim(p_query)) between 2 and 20
      and starts_with(lower(handle),lower(btrim(p_query)))
      and public.discovery_author_visible(id)
    order by handle,id limit 24
  ) p
$$;
create function public.my_taste_follows()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle) order by p.handle,p.id)
    from public.user_follows f join public.profiles p on p.id = f.followed_id
    where f.user_id = auth.uid() and public.discovery_author_visible(p.id)
  ),'[]'::jsonb);
end
$$;

revoke execute on function public.taste_profile(uuid),public.find_tastes(text),public.my_taste_follows()
  from public,anon,authenticated;
grant execute on function public.taste_profile(uuid),public.find_tastes(text) to anon,authenticated;
grant execute on function public.my_taste_follows() to authenticated;
-- Existing role grants on set_follow and set_user_block are retained.
commit;

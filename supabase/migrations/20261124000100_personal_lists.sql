begin;

-- Saves are private. A tried item is a personal note, never a stock report or rating.
create table public.saved_items (
  user_id uuid not null references public.profiles on delete cascade,
  subject_kind text not null,
  subject_ref text not null,
  list_state text not null check (list_state in ('want', 'tried')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_ref)
);
alter table public.saved_items enable row level security;
revoke all on public.saved_items from public, anon, authenticated;

create function public.discovery_subject(p_kind text, p_ref text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'product' then (
      select jsonb_build_object('name', brand || ' · ' || name, 'page', 'product')
      from public.products where id = p_ref
    )
    when 'place' then (
      select jsonb_build_object('name', name, 'detail', area, 'page', 'spot')
      from public.places where id = p_ref
    )
    when 'matchup' then (
      select jsonb_build_object('name', left_label || ' vs ' || right_label, 'page', 'showdown')
      from public.matchups where id = p_ref
    )
  end
$$;

create function public.save_discovery(p_kind text, p_ref text, p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := public.require_social_user();
begin
  if p_state is null then
    delete from public.saved_items
    where user_id = actor and subject_kind = p_kind and subject_ref = p_ref;
    return;
  end if;
  if p_state not in ('want', 'tried') or public.discovery_subject(p_kind, p_ref) is null then
    raise exception 'invalid_saved_item';
  end if;
  if exists (
    select 1 from public.saved_items where user_id = actor
      and subject_kind = p_kind and subject_ref = p_ref and updated_at > now() - interval '2 seconds'
  ) then
    raise exception 'save_cooldown';
  end if;
  if (select count(*) from public.saved_items where user_id = actor) >= 1000
    and not exists (
      select 1 from public.saved_items where user_id = actor and subject_kind = p_kind and subject_ref = p_ref
    )
  then raise exception 'saved_list_full'; end if;

  insert into public.saved_items(user_id, subject_kind, subject_ref, list_state)
  values (actor, p_kind, p_ref, p_state)
  on conflict (user_id, subject_kind, subject_ref)
  do update set list_state = excluded.list_state, updated_at = now();
end
$$;

create function public.my_discoveries()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) - 'user_id' || jsonb_build_object('subject',
      public.discovery_subject(s.subject_kind, s.subject_ref)) order by s.updated_at desc)
    from public.saved_items s where s.user_id = auth.uid()
  ), '[]'::jsonb);
end
$$;

create function public.export_discovery_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  return jsonb_build_object('saved_items', coalesce((
    select jsonb_agg(s) from public.saved_items s where s.user_id = auth.uid()
  ), '[]'::jsonb));
end
$$;

revoke execute on function public.discovery_subject(text,text) from public, anon, authenticated;
revoke execute on function public.save_discovery(text,text,text), public.my_discoveries(),
  public.export_discovery_data() from public, anon, authenticated;
grant execute on function public.save_discovery(text,text,text), public.my_discoveries(),
  public.export_discovery_data() to authenticated;

commit;

begin;
create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h text := lower(btrim(coalesce(p_handle, '')));
  squashed text := replace(public.moderation_words(h), ' ', '');
  prof public.profiles;
begin
  if uid is null then raise exception 'sign_in_required'; end if;
  select * into prof from public.profiles where id = uid;
  if not found then raise exception 'sign_in_required'; end if;
  if prof.banned then raise exception 'banned'; end if;

  if h !~ '^[a-z0-9_]{3,20}$' then raise exception 'handle_invalid'; end if;

  -- Keeping the same name is always fine.
  if h = lower(prof.handle) then
    update public.profiles set handle_set = true where id = uid;
    return h;
  end if;

  -- After choosing once, a change is allowed every 30 days.
  if prof.handle_set and prof.handle_changed_at is not null
     and prof.handle_changed_at > now() - interval '30 days' then
    raise exception 'handle_cooldown';
  end if;

  -- Reserved words, and the auto-generated pattern so nobody squats on it.
  if exists (select 1 from unnest(array['admin','moderator','nuggetfinder','support','staff','official','verified']) word
          where strpos(squashed, word) > 0)
     or h ~ '^nugget([0-9a-f]{6}|[0-9a-f]{14})$' then
    raise exception 'handle_reserved';
  end if;

  if exists (
    select 1 from public.blocked_handle_terms t
    cross join lateral (select replace(public.moderation_words(t.term), ' ', '') as term) normalized
    where case when char_length(normalized.term) >= 4
      then strpos(squashed, normalized.term) > 0
      else public.moderation_words(t.term) = any(
        array(select public.moderation_words(part) from unnest(string_to_array(h, '_')) parts(part))
      ) and normalized.term <> ''
    end
  ) then
    raise exception 'handle_blocked';
  end if;

  begin
    update public.profiles
       set handle = h, handle_set = true, handle_changed_at = now()
     where id = uid;
  exception when unique_violation then
    raise exception 'handle_taken';
  end;
  return h;
end;
$$;

revoke all on function public.set_handle(text) from public;
grant execute on function public.set_handle(text) to authenticated;
commit;

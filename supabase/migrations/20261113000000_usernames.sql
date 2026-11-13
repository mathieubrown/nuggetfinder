-- Nuggetfinder: let people pick their own username.
-- Paste into Supabase > SQL Editor > New query > Run. Safe to run once.

alter table public.profiles add column if not exists handle_set boolean not null default false;
alter table public.profiles add column if not exists handle_changed_at timestamptz;

-- Names are unique ignoring capital letters.
create unique index if not exists profiles_handle_lower_key on public.profiles (lower(handle));

-- Words that cannot appear inside a username. Starts empty on purpose:
-- add terms from the SQL editor (insert into public.blocked_handle_terms values ('term');).
create table if not exists public.blocked_handle_terms (term text primary key);
alter table public.blocked_handle_terms enable row level security;   -- no policies: browser cannot read or write it

create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h text := lower(btrim(coalesce(p_handle, '')));
  squashed text;
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
  if h ~ '(admin|moderator|nuggetfinder|support|staff|official|verified)'
     or h ~ '^nugget[0-9a-f]{6}$' then
    raise exception 'handle_reserved';
  end if;

  -- Blocked terms, checked with underscores removed and common number swaps undone (0 o, 1 i, 3 e, 4 a, 5 s).
  squashed := translate(replace(h, '_', ''), '01345', 'oieas');
  if exists (select 1 from public.blocked_handle_terms t where position(t.term in squashed) > 0) then
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

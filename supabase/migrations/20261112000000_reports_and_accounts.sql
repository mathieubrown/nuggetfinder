-- Nuggetfinder step 2: accounts, shared reports, agreement rule.
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run once on a fresh project.

-- 1. Profiles: one row per signed-in person.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null,
  age_confirmed boolean not null default false,
  banned boolean not null default false,
  strikes int not null default 0,
  trust int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone can read handles (shown on reports later). Nobody can edit a profile from the browser.
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, age_confirmed)
  values (
    new.id,
    'nugget' || substr(md5(new.id::text), 1, 6),
    coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Reports: the nuggets / nope log. Only the server functions below can write to it.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  place_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('yes', 'nope')),
  was_near boolean not null default false,   -- yes or no only. Coordinates are never stored.
  created_at timestamptz not null default now()
);

create index if not exists reports_place_time on public.reports (place_id, created_at desc);
create index if not exists reports_user_time on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;
-- No policies on purpose: the browser cannot read or write this table directly.

-- 3. Submit a report. Enforces sign-in, age box, ban, cooldown and a daily limit.
create or replace function public.submit_report(p_place text, p_status text, p_near boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then
    raise exception 'sign_in_required';
  end if;

  if p_status not in ('yes', 'nope') or p_place is null or length(p_place) > 64 then
    raise exception 'bad_request';
  end if;

  select * into prof from public.profiles where id = uid;
  if not found then
    raise exception 'sign_in_required';
  end if;
  if prof.banned then
    raise exception 'banned';
  end if;
  if not prof.age_confirmed then
    raise exception 'age_required';
  end if;

  if exists (
    select 1 from public.reports
    where user_id = uid and place_id = p_place and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'cooldown';
  end if;

  if (
    select count(*) from public.reports
    where user_id = uid and created_at > now() - interval '24 hours'
  ) >= 60 then
    raise exception 'daily_limit';
  end if;

  insert into public.reports (place_id, user_id, status, was_near)
  values (p_place, uid, p_status, coalesce(p_near, false));
end;
$$;

revoke all on function public.submit_report(text, text, boolean) from public, anon;
grant execute on function public.submit_report(text, text, boolean) to authenticated;

-- 4. Status for every place. Each person counts once per place (their latest report).
--    A report counts for 2 hours. The browser applies the "two different people must agree" rule.
create or replace function public.place_statuses()
returns table (place_id text, yes_count int, nope_count int, latest_at timestamptz, last_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  with latest as (
    select distinct on (r.place_id, r.user_id)
           r.place_id, r.user_id, r.status, r.created_at
    from public.reports r
    join public.profiles p on p.id = r.user_id and not p.banned
    where r.created_at > now() - interval '24 hours'
    order by r.place_id, r.user_id, r.created_at desc
  )
  select l.place_id,
         (count(*) filter (where l.status = 'yes' and l.created_at > now() - interval '2 hours'))::int,
         (count(*) filter (where l.status = 'nope' and l.created_at > now() - interval '2 hours'))::int,
         max(l.created_at) filter (where l.created_at > now() - interval '2 hours'),
         max(l.created_at)
  from latest l
  group by l.place_id;
$$;

grant execute on function public.place_statuses() to anon, authenticated;

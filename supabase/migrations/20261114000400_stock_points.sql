begin;
-- The ledger records a single award per report, including awards withheld by the cap.
create table public.stock_point_awards (
  report_id bigint primary key references public.stock_reports on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  awarded_on date not null,
  points smallint not null check (points in (0, 1))
);
create index stock_point_awards_user_day on public.stock_point_awards (user_id, awarded_on);
alter table public.stock_point_awards enable row level security;
revoke all on public.stock_point_awards from public, anon, authenticated;

-- Serialize stock inserts before any reports are read or awards calculated.
create function public.lock_stock_awards()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(94172, 1);
  return null;
end;
$$;
revoke all on function public.lock_stock_awards() from public, anon, authenticated;
create trigger stock_award_lock before insert on public.stock_reports
for each statement execute function public.lock_stock_awards();

-- LOGIC-START
create function public.award_confirmed_stock_points()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  award_day date := (new.created_at at time zone 'UTC')::date;
begin
  with latest as (
    select distinct on (r.user_id) r.id, r.user_id, r.status
    from public.stock_reports r join public.profiles p on p.id = r.user_id and not p.banned
    where r.product_id = new.product_id and r.place_id = new.place_id
      and r.created_at > new.created_at - interval '2 hours'
    order by r.user_id, r.created_at desc, r.id desc
  ), matching as (
    select id, user_id from latest where status = new.status
  )
  insert into public.stock_point_awards (report_id, user_id, awarded_on, points)
  select m.id, m.user_id, award_day,
    case when (
      select coalesce(sum(a.points), 0) from public.stock_point_awards a
      where a.user_id = m.user_id and a.awarded_on = award_day
    ) < 10 then 1 else 0 end
  from matching m where (select count(*) from matching) >= 2
  on conflict (report_id) do nothing;
  return null;
end;
$$;
-- LOGIC-END
revoke all on function public.award_confirmed_stock_points() from public, anon, authenticated;
create trigger stock_report_points after insert on public.stock_reports
for each row execute function public.award_confirmed_stock_points();

create function public.my_wave_profile()
returns table (handle text, points bigint)
language sql stable security definer set search_path = '' as $$
  select p.handle, coalesce((select sum(a.points) from public.stock_point_awards a where a.user_id = p.id), 0)
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_wave_profile() from public, anon;
grant execute on function public.my_wave_profile() to authenticated;
commit;

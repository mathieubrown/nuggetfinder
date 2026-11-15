begin;
create table public.stock_reports (
  id bigint generated always as identity primary key,
  place_id text not null,
  product_id text not null,
  user_id uuid not null references public.profiles on delete cascade,
  status text not null check (status in ('seen', 'sold_out')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (place_id, product_id) references public.place_products on delete cascade
);
create index stock_reports_user_time on public.stock_reports (user_id, created_at desc);
create index stock_reports_product_place_time on public.stock_reports (product_id, place_id, created_at desc);
alter table public.stock_reports enable row level security;
revoke all on public.stock_reports from public, anon, authenticated;

-- Both reporting flows share a rolling limit and a per-place cooldown.
-- Lock the profile before checking so concurrent requests cannot bypass either limit.
create function public.enforce_report_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  profile public.profiles;
begin
  select * into profile from public.profiles where id = new.user_id for update;
  if not found then raise exception 'sign_in_required'; end if;
  if profile.banned then raise exception 'banned'; end if;
  if not profile.age_confirmed then raise exception 'age_required'; end if;
  new.created_at := clock_timestamp();

  if exists (
    select 1 from public.reports where user_id = new.user_id and place_id = new.place_id
      and created_at > new.created_at - interval '10 minutes'
    union all
    select 1 from public.stock_reports where user_id = new.user_id and place_id = new.place_id
      and created_at > new.created_at - interval '10 minutes'
  ) then raise exception 'cooldown'; end if;

  if (
    (select count(*) from public.reports where user_id = new.user_id and created_at > new.created_at - interval '24 hours')
    + (select count(*) from public.stock_reports where user_id = new.user_id and created_at > new.created_at - interval '24 hours')
  ) >= 60 then raise exception 'daily_limit'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_report_limits() from public, anon, authenticated;

create trigger stock_report_limits before insert on public.stock_reports
for each row execute function public.enforce_report_limits();
create trigger place_report_limits before insert on public.reports
for each row execute function public.enforce_report_limits();

create function public.submit_stock_report(p_product text, p_place text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_status is null or p_status not in ('seen', 'sold_out') or not exists (
    select 1 from public.place_products where product_id = p_product and place_id = p_place
  ) then raise exception 'bad_request'; end if;
  insert into public.stock_reports (product_id, place_id, user_id, status)
    values (p_product, p_place, auth.uid(), p_status);
end;
$$;
revoke all on function public.submit_stock_report(text, text, text) from public, anon;
grant execute on function public.submit_stock_report(text, text, text) to authenticated;

create function public.product_stock(p_product text)
returns table (place_id text, seen_count int, sold_out_count int, last_report_at timestamptz, last_seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with recent as (
    select r.place_id, r.user_id, r.status, r.created_at, r.id
    from public.stock_reports r join public.profiles p on p.id = r.user_id and not p.banned
    where r.product_id = p_product and r.created_at > now() - interval '24 hours'
  ), latest as (
    select distinct on (r.place_id, r.user_id) r.place_id, r.status, r.created_at
    from recent r order by r.place_id, r.user_id, r.created_at desc, r.id desc
  ), sightings as (
    select r.place_id, max(r.created_at) as seen_at from recent r where r.status = 'seen' group by r.place_id
  )
  select l.place_id,
    (count(*) filter (where l.status = 'seen' and l.created_at > now() - interval '2 hours'))::int,
    (count(*) filter (where l.status = 'sold_out' and l.created_at > now() - interval '2 hours'))::int,
    max(l.created_at), s.seen_at
  from latest l left join sightings s using (place_id)
  group by l.place_id, s.seen_at;
$$;
revoke all on function public.product_stock(text) from public;
grant execute on function public.product_stock(text) to anon, authenticated;
commit;

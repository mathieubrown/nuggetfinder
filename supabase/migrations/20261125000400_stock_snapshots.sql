begin;
-- A count snapshot expires at the first contributing vote expiry, never merely
-- two hours after the newest vote. A short lease also bounds unknown new reports.
create function public.product_stock_snapshot(p_product text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('checked_at',now(),'valid_until',
 least(now()+interval '60 seconds',coalesce(bounds.first_expiry,now()+interval '60 seconds')))),'[]'::jsonb)
 from public.product_stock(p_product) s
 left join lateral(
  select min(created_at+interval '2 hours') first_expiry from (
   select distinct on(r.user_id) r.user_id,r.created_at from public.stock_reports r
   join public.profiles p on p.id=r.user_id and not p.banned
   where r.product_id=p_product and r.place_id=s.place_id and r.created_at>now()-interval '24 hours'
   order by r.user_id,r.created_at desc,r.id desc
  ) latest where created_at>now()-interval '2 hours'
 ) bounds on true
$$;
create function public.place_status_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('checked_at',now(),'valid_until',
 least(now()+interval '60 seconds',coalesce(bounds.first_expiry,now()+interval '60 seconds')))),'[]'::jsonb)
 from public.place_statuses() s join public.places place on place.id=s.place_id
 left join lateral(
  select min(created_at+interval '2 hours') first_expiry from (
   select distinct on(r.user_id) r.user_id,r.created_at from public.reports r
   join public.profiles p on p.id=r.user_id and not p.banned
   where r.place_id=s.place_id and r.created_at>now()-interval '24 hours'
   order by r.user_id,r.created_at desc,r.id desc
  )latest where created_at>now()-interval '2 hours'
 )bounds on true
$$;
revoke execute on function public.product_stock_snapshot(text),public.place_status_snapshot() from public,anon,authenticated;
grant execute on function public.product_stock_snapshot(text),public.place_status_snapshot() to anon,authenticated;
commit;

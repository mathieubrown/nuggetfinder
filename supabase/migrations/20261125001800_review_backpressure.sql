begin;
alter table public.runtime_controls add column photo_pending_limit integer not null default 100 check(photo_pending_limit between 1 and 10000);
alter table public.runtime_controls add column text_pending_limit integer not null default 200 check(text_pending_limit between 1 and 10000);
create function public.runtime_review_capacity(p_kind text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(2147483000,18);
 if p_kind='photo' then
  if (select count(*) from public.photo_evidence where status in ('reserved','pending'))>=(select photo_pending_limit from public.runtime_controls) then raise exception 'review_queue_full';end if;
 elsif p_kind='text' then
  if (select count(*) from public.crew_takes where status='pending')+(select count(*) from public.takes where status='pending')+(select count(*) from public.take_replies where status='pending')>=(select text_pending_limit from public.runtime_controls) then raise exception 'review_queue_full';end if;
 else raise exception 'invalid_review_kind';end if;
end $$;
revoke all on function public.runtime_review_capacity(text) from public,anon,authenticated,nugget_broker;
-- Remove inherited PUBLIC execution while preserving the browser roles' existing surface.
-- Broker/verifier execution stays limited to their explicitly granted entry points.
do $$declare f record;anon_allowed boolean;member_allowed boolean;begin
 for f in select oid,oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and prosecdef loop
  anon_allowed:=has_function_privilege('anon',f.oid,'execute');member_allowed:=has_function_privilege('authenticated',f.oid,'execute');
  execute 'revoke execute on function '||f.signature||' from public';
  if anon_allowed then execute 'grant execute on function '||f.signature||' to anon';end if;
  if member_allowed then execute 'grant execute on function '||f.signature||' to authenticated';end if;
 end loop;
end $$;
commit;

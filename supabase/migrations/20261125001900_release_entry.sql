begin;
-- Review-approved HTTPS entry is configured only during an explicitly approved release.
alter table public.runtime_controls add column entry_url text check(entry_url is null or entry_url ~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?(/[a-zA-Z0-9._~/-]*)?$');
create function public.participation_runtime_entry()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('active',cutover,'url',entry_url) from public.runtime_controls
$$;
revoke all on function public.participation_runtime_entry() from public,anon,authenticated,nugget_broker;
grant execute on function public.participation_runtime_entry() to anon,authenticated;
commit;

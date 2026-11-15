revoke select on public.profiles from anon, authenticated;
grant select (id, handle, handle_set, created_at) on public.profiles to anon, authenticated;

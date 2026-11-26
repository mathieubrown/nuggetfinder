begin;
-- Keep the existing public moderation path usable after legacy writes are disabled.
create function public.runtime_legacy_review(p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_account) then raise exception 'moderator_required';end if;
 perform set_config('request.jwt.claim.sub',p_account::text,true);
 perform public.require_nugget_moderator();
 if p_operation='list' then return public.moderation_inbox();
 elsif p_operation='review' then
  if p_data->>'decision' not in ('approve','hide') then raise exception 'invalid_review_decision';end if;
  perform public.review_content((p_data->>'id')::bigint,p_data->>'decision');return jsonb_build_object('ok',true);
 end if;raise exception 'invalid_review_operation';
end $$;
revoke all on function public.runtime_legacy_review(uuid,text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_legacy_review(uuid,text,jsonb) to nugget_broker;
-- Private individuals can still read their own four non-sensitive account columns.
drop policy "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using(public_identity or id=auth.uid());
commit;

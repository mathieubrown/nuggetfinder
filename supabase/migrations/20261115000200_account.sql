begin;
create function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'sign_in_required'; end if;
 return jsonb_build_object(
  'account',(select jsonb_build_object('id',id,'email',email) from auth.users where id=actor),
  'profile',(select to_jsonb(p) from public.profiles p where id=actor),
  'reports',coalesce((select jsonb_agg(r) from public.reports r where user_id=actor),'[]'),
  'stock_reports',coalesce((select jsonb_agg(r) from public.stock_reports r where user_id=actor),'[]'),
  'stock_points',coalesce((select jsonb_agg(r) from public.stock_point_awards r where user_id=actor),'[]'),
  'blocks',coalesce((select jsonb_agg(r) from public.user_blocks r where user_id=actor),'[]'),
  'content_reports',coalesce((select jsonb_agg(r) from public.content_reports r where reporter_id=actor),'[]'),
  'strikes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'action',s.action,'created_at',s.created_at,
    'reversed_at',s.reversed_at,'appeal_reason',a.reason,'appeal_decision',a.decision))
    from public.moderation_strikes s left join public.strike_appeals a on a.strike_id=s.id where s.subject_id=actor),'[]'));
end $$;
revoke execute on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
commit;

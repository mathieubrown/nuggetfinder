begin;
-- The same-origin browser uses this fixed read-only projection without a database key.
create function public.runtime_browse(p_operation text,p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb;
begin
 case p_operation
 when 'products' then select coalesce(jsonb_agg(p order by p.name),'[]') into data from public.products p;
 when 'places' then select coalesce(jsonb_agg(p order by p.name),'[]') into data from public.places p;
 when 'place_products' then
  select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('places',to_jsonb(p))),'[]') into data
  from public.place_products l join public.places p on p.id=l.place_id;
 when 'place_status_snapshot' then data:=public.place_status_snapshot();
 when 'product_stock_snapshot' then data:=public.product_stock_snapshot(p_data->>'p_product');
 when 'product_allergen_evidence' then data:=public.product_allergen_evidence(p_data->>'p_product');
 when 'place_screen' then data:=public.place_screen(p_data->>'p_place');
 when 'price_ledger' then data:=public.price_ledger(p_data->>'p_place',coalesce(p_data->>'p_unit','piece'),p_data->>'p_product');
 when 'price_targets' then data:=public.price_targets();
 when 'discovery_targets' then data:=public.discovery_targets();
 when 'matchups' then select coalesce(jsonb_agg(m),'[]') into data from public.matchups(p_data->>'p_id') m;
 when 'weekly_matchups' then select coalesce(jsonb_agg(m),'[]') into data from public.weekly_matchups() m;
 when 'court_cases' then data:=public.court_cases((p_data->>'p_id')::bigint,coalesce((p_data->>'p_guide')::boolean,false));
 when 'court_locations' then data:=public.court_locations((p_data->>'p_case')::bigint);
 when 'court_takes' then data:=public.court_takes((p_data->>'p_case')::bigint);
 when 'court_ruling_history' then data:=public.court_ruling_history((p_data->>'p_case')::bigint);
 when 'find_tastes' then data:=public.find_tastes(coalesce(p_data->>'p_query',''));
 when 'taste_profile' then data:=public.taste_profile((p_data->>'p_user')::uuid);
 when 'search_places' then data:=public.search_places(p_data->>'p_query');
 when 'place_information_for' then data:=public.place_information_for(p_data->>'p_place');
 when 'list_trails' then data:=public.list_trails((p_data->>'p_id')::bigint,false);
 else raise exception 'public_read_unavailable';
 end case;
 return data;
end $$;
revoke all on function public.runtime_browse(text,jsonb) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_browse(text,jsonb) to nugget_broker;
-- Keep Court decisions and strike moderation in the same verified account desk.
create or replace function public.runtime_legacy_review(p_account uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_account) then raise exception 'moderator_required';end if;
 perform set_config('request.jwt.claim.sub',p_account::text,true);
 perform public.require_nugget_moderator();
 case p_operation
 when 'list' then return public.moderation_inbox();
 when 'review' then
  if coalesce(p_data->>'decision','') not in ('approve','hide') then raise exception 'invalid_review_decision';end if;
  perform public.review_content((p_data->>'id')::bigint,p_data->>'decision');
 when 'court_rounds_for_review' then return public.court_rounds_for_review();
 when 'court_review_state' then return public.court_review_state((p_data->>'p_case')::bigint);
 when 'record_court_ruling' then return to_jsonb(public.record_court_ruling((p_data->>'p_case')::bigint,
   (p_data->>'p_expected_version')::integer,array(select jsonb_array_elements_text(p_data->'p_excluded')::bigint),
   p_data->>'p_reason',p_data->>'p_note'));
 when 'issue_strike' then perform public.issue_strike((p_data->>'p_user')::uuid);
 when 'review_appeal' then perform public.review_appeal((p_data->>'p_id')::bigint,p_data->>'p_decision');
 when 'reset_reported_username' then perform public.reset_reported_username((p_data->>'p_user')::uuid);
 else raise exception 'invalid_review_operation';
 end case;
 return jsonb_build_object('ok',true);
end $$;
-- The random erasure job ID acts as a receipt. The lookup discloses status only.
create function public.runtime_erasure_status(p_receipt uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',case when status='complete' then 'complete' else 'pending' end)
 from public.account_erasure_jobs where id=p_receipt
$$;
revoke all on function public.runtime_erasure_status(uuid) from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_erasure_status(uuid) to nugget_broker;
commit;

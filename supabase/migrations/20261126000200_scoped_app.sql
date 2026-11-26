begin;
-- Keep the current stored session revocable and validate it after refresh.
create function public.runtime_identity(p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid:=public.runtime_session(p_hash,'discover',true);
begin
 return (select jsonb_build_object('participant',p.id,'pseudonym',p.pseudonym,
   'expires_in',greatest(0,floor(extract(epoch from s.expires_at-clock_timestamp()))),
   'available',public.runtime_can(p.id,'discover'))
 from public.participants p join public.participant_sessions s on s.participant_id=p.id
 where p.id=player and s.token_hash=p_hash);
end $$;

-- Fixed dispatcher for original screens that need scoped identity. Existing trust rules still run.
create function public.runtime_screen(p_hash text,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid; actor uuid; capability text; result jsonb; safety boolean;
begin
 safety:=p_operation in ('block_take','my_strikes','activity','export');
 capability:=case
  when p_operation in ('nominate_court_case','suggest_court_location','submit_discovery_trail') then 'trail'
  when p_operation='set_follow' then 'social' else 'discover' end;
 player:=public.runtime_session(p_hash,capability,safety);
 select profile_id into actor from public.participant_profiles where participant_id=player;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('nugget.participant',player::text,true);
 case p_operation
 when 'my_taste_follows' then select coalesce(jsonb_agg(t),'[]') into result from public.my_taste_follows() t;
 when 'set_follow' then perform public.set_follow((p_data->>'p_user')::uuid,(p_data->>'p_follow')::boolean);
 when 'nominate_court_case' then result:=to_jsonb(public.nominate_court_case(p_data->>'p_name',p_data->>'p_argument'));
 when 'suggest_court_location' then
  perform public.suggest_court_location((p_data->>'p_case')::bigint,p_data->>'p_place');
 when 'submit_discovery_trail' then
  result:=to_jsonb(public.submit_discovery_trail(p_data->>'p_title',p_data->>'p_summary',
   array(select jsonb_array_elements_text(p_data->'p_places')),(p_data->>'p_id')::bigint));
 when 'trail_list' then result:=public.list_trails((p_data->>'p_id')::bigint,coalesce((p_data->>'p_mine')::boolean,false));
 when 'block_take' then
  if not public.runtime_public_take((p_data->>'id')::bigint) then raise exception 'take_unavailable';end if;
  perform public.set_user_block((select author_id from public.takes where id=(p_data->>'id')::bigint),true);
 when 'activity' then
  select jsonb_build_object(
    'takes',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body,'status',t.status)) from
      (select id,body,status from public.takes where author_id=actor order by id desc limit 30) t),'[]'),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'purpose',e.purpose,'status',e.status,
      'context',(select jsonb_build_object('kind',l.kind,'ref',l.content_ref) from public.photo_evidence_links l where l.evidence_id=e.id limit 1))) from
      (select * from public.photo_evidence where participant_id=player order by submitted_at desc limit 30) e),'[]'),
    'places',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'status',p.status,'place_id',p.place_id)) from
      (select * from public.place_submissions where author_id=actor order by created_at desc limit 30) p),'[]'))
  into result;
 when 'export' then
  result:=public.export_my_data()||public.export_wave2_take_data()||public.export_matchup_data()||public.export_discovery_data();
 else raise exception 'unsupported_scoped_screen';
 end case;
 return coalesce(result,'null');
end $$;

create function public.runtime_feed_screen(p_hash text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid; actor uuid;
begin
 if p_hash is not null then
  player:=public.runtime_session(p_hash,'discover');
  select profile_id into actor from public.participant_profiles where participant_id=player;
 end if;
 return coalesce((select jsonb_agg(row) from (
  select t.id,t.body,t.subject_kind,t.subject_ref,t.stamp,
   case when p.public_identity then p.handle else 'Anonymous nugget fan' end as handle,
   case when p.public_identity then p.id end as author_id,
   case when p.public_identity then t.created_at else date_trunc('day',t.created_at) end as created_at,
   coalesce(actor=t.author_id,false) as mine,
   public.discovery_subject(t.subject_kind,t.subject_ref) as subject,
   (select reaction from public.take_reactions r where r.take_id=t.id and r.user_id=actor) as reaction,
   (select count(*) from public.take_reactions r join public.profiles v on v.id=r.user_id and not v.banned where r.take_id=t.id and r.reaction='against') as clowned,
   0 as rebuttals
  from public.takes t join public.profiles p on p.id=t.author_id
  where public.runtime_public_take(t.id) and p_data->>'p_parent' is null
   and (p_data->>'p_take' is null or t.id=(p_data->>'p_take')::bigint)
   and (p_data->>'p_kind' is null or t.subject_kind=p_data->>'p_kind')
   and (p_data->>'p_ref' is null or t.subject_ref=p_data->>'p_ref')
   and (not coalesce((p_data->>'p_following')::boolean,false) or
    (p.public_identity and exists(select 1 from public.user_follows f where f.user_id=actor and f.followed_id=t.author_id)))
   and not exists(select 1 from public.user_blocks b where (b.user_id=actor and b.blocked_id=t.author_id) or (b.blocked_id=actor and b.user_id=t.author_id))
  order by case when coalesce(p_data->>'p_sort','hot')='hot' then public.take_heat(t.id)/power(2,extract(epoch from now()-t.created_at)/86400) end desc nulls last,
   t.created_at desc,t.id desc limit 50) row),'[]');
end $$;
create function public.runtime_response_screen(p_hash text,p_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid;
begin
 if p_hash is not null then player:=public.runtime_session(p_hash,'discover');end if;
 if jsonb_array_length(public.runtime_feed_screen(p_hash,jsonb_build_object('p_take',p_id)))=0 then return null;end if;
 return public.runtime_public_responses(player,p_id);
end $$;

create or replace function public.runtime_public_photo_context(p_owner uuid,p_kind text,p_ref text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if p_kind='take' then return public.runtime_public_take(p_ref::bigint);end if;
 if p_kind='reply' then return exists(select 1 from public.take_replies r join public.profiles p on p.id=r.author_id
   where r.id::text=p_ref and r.status='published' and p.public_identity and public.runtime_public_take(r.take_id)
   and public.runtime_public_author(r.author_id) and not public.social_text_blocked(r.body)
   and public.runtime_photo_target(p_owner,p_kind,p_ref));end if;
 return public.runtime_photo_target(p_owner,p_kind,p_ref);
end $$;

create or replace function public.runtime_photo_public(p_id uuid,p_variant text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key',v.object_key,'mime','image/jpeg') from public.photo_evidence e
 join public.photo_variants v on v.evidence_id=e.id
 where (select photo_publication_ready from public.runtime_controls) and e.id=p_id and e.status='approved'
 and v.variant=p_variant and public.runtime_can(e.participant_id,'photo')
 and exists(select 1 from public.participant_permissions c where c.participant_id=e.participant_id and c.capability='photo'
   and c.public_disclosure and c.revoked_at is null and c.expires_at>now())
 and exists(select 1 from public.photo_evidence_links l where l.evidence_id=e.id)
 and not exists(select 1 from public.photo_evidence_links l where l.evidence_id=e.id and
  (l.kind not in ('product','place','showdown','court','trail','take','stock_report','price_entry','reply')
   or not public.runtime_public_photo_context(e.participant_id,l.kind,l.content_ref)))
$$;

create function public.public_context_photos(p_kind text,p_ref text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(found),'[]') from (
 select e.id,e.purpose,date_trunc('day',e.observed_at) as observed_on,date_trunc('day',e.submitted_at) as submitted_on
 from public.photo_evidence e join public.photo_evidence_links l on l.evidence_id=e.id
 where public.runtime_photo_public(e.id,'display') is not null and (
 (l.kind=p_kind and l.content_ref=p_ref)
 or (p_kind='product' and l.kind='stock_report' and exists(select 1 from public.stock_reports r where r.id::text=l.content_ref and r.product_id=p_ref))
 or (p_kind='place' and l.kind='stock_report' and exists(select 1 from public.stock_reports r where r.id::text=l.content_ref and r.place_id=p_ref))
 or (p_kind='place' and l.kind='price_entry' and exists(select 1 from public.price_entries r where r.id::text=l.content_ref and r.place_id=p_ref)))
 order by e.submitted_at desc limit 24) found
$$;

revoke all on function public.runtime_identity(text),public.runtime_screen(text,text,jsonb),public.public_context_photos(text,text),public.runtime_feed_screen(text,jsonb),public.runtime_response_screen(text,bigint)
 from public,anon,authenticated,nugget_broker;
grant execute on function public.runtime_identity(text),public.runtime_screen(text,text,jsonb),public.public_context_photos(text,text),public.runtime_feed_screen(text,jsonb),public.runtime_response_screen(text,bigint) to nugget_broker;
commit;

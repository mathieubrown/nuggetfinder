begin;
-- Table-level REVOKE does not remove separately granted column privileges.
-- Remove inherited legacy column writes/reads, then restore only approved profile fields.
do $$
declare target record; columns text;
begin
 for target in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
 and c.relname in ('blocked_handle_terms','blocked_terms','business_verifications','content_reports','court_cases','court_locations','court_ruling_ballots','court_rulings','court_votes','discovery_trails','matchup_vote_history','matchup_votes','matchups','moderation_queue','moderation_strikes','place_matchups','place_products','place_ratings','places','price_entries','product_allergen_sources','products','profiles','reports','saved_items','stock_point_awards','stock_reports','strike_appeals','submission_receipts','take_reactions','take_replies','takes','trail_progress','trail_stops','user_blocks','user_follows','vote_actions','vote_history_holds') loop
  select string_agg(quote_ident(attname),',') into columns from pg_attribute where attrelid=target.oid and attnum>0 and not attisdropped;
  if columns is not null then
   execute format('revoke all privileges (%s) on table %I.%I from public,anon,authenticated',columns,target.nspname,target.relname);
  end if;
 end loop;
end $$;
grant select(id,handle,handle_set,created_at) on public.profiles to anon,authenticated;
commit;

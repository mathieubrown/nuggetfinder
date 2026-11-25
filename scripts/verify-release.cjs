// Read-only verifier. Does not apply SQL or repair migration history.
const assert=require('node:assert/strict');
const {Client}=require(process.env.NUGGETFINDER_PG || 'pg');
async function verify(client){
 await client.query('begin read only');
 try{
  const catalog=(await client.query('select (select count(*)::int from public.products) products,(select count(*)::int from public.places) places,(select count(*)::int from public.place_products) links')).rows[0];
  assert.deepEqual(catalog,{products:25,places:83,links:189},'Unreviewed catalog counts');
  const tables=(await client.query("select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename")).rows;
  const required=['profiles','reports','products','places','place_products','stock_reports','stock_point_awards','takes','price_entries','submission_receipts','vote_actions','vote_history_holds','court_rulings','court_ruling_ballots','participants','participation_readiness','participant_permissions','participant_permission_events','photo_evidence','photo_evidence_links','photo_variants','photo_evidence_events','photo_reports'];
  for(const name of required)assert.ok(tables.some(t=>t.tablename===name),'Missing table '+name);
  for(const table of tables){
   assert.equal(table.rowsecurity,true,'RLS: '+table.tablename);
   for(const role of ['anon','authenticated']){
    const privileges=(await client.query("select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') writes,has_table_privilege($1,$2,'SELECT') reads",[role,'public.'+table.tablename])).rows[0];
    assert.equal(privileges.writes,false,role+' direct write '+table.tablename);
    assert.equal(privileges.reads,['products','places','place_products'].includes(table.tablename),role+' table read '+table.tablename);
    const columns=(await client.query("select attname,has_column_privilege($1,attrelid,attnum,'SELECT') reads,has_column_privilege($1,attrelid,attnum,'INSERT,UPDATE,REFERENCES') writes from pg_attribute where attrelid=$2::regclass and attnum>0 and not attisdropped",[role,'public.'+table.tablename])).rows;
    for(const column of columns){assert.equal(column.writes,false,role+' column write '+table.tablename+'.'+column.attname);
     assert.equal(column.reads,['products','places','place_products'].includes(table.tablename)||(table.tablename==='profiles'&&['id','handle','handle_set','created_at'].includes(column.attname)),role+' column read '+table.tablename+'.'+column.attname);}
   }
  }
  const policies=(await client.query("select tablename,cmd from pg_policies where schemaname='public'")).rows;
  for(const policy of policies){assert.ok(['profiles','products','places','place_products'].includes(policy.tablename),'Unexpected private policy '+policy.tablename);assert.equal(policy.cmd,'SELECT');}
  const publicReads=new Set(['beef_matchups','community_feed','court_cases','court_locations','court_takes','discovery_targets','find_tastes','list_trails','matchups','place_screen','place_statuses','price_ledger','price_targets','product_allergen_evidence','product_stock','take_cards','take_responses','taste_profile','weekly_beef','weekly_matchups','product_stock_snapshot','place_status_snapshot','court_ruling_history']);
  const memberCalls=new Set([...publicReads,'appeal_strike','export_beef_data','export_discovery_data','export_matchup_data','export_my_data','export_wave2_take_data','is_nugget_moderator','issue_strike','mark_trail_stop','moderation_inbox','my_discoveries','my_strikes','my_taste_follows','my_wave_profile','nominate_court_case','rate_place','report_content','report_discovery','reset_reported_username','respond_take','review_appeal','review_content','save_discovery','set_follow','set_handle','set_user_block','submit_context_take','submit_discovery_trail','submit_price','submit_price_request','submit_report','submit_stock_report','submit_take','submit_take_request','suggest_court_location','vote_beef','vote_court','vote_matchup','record_court_ruling','court_review_state','court_rounds_for_review','participant_can','my_participants','pause_participant','revoke_participant_permission','reserve_photo_evidence','my_photo_evidence','delete_photo_evidence','export_participation_data']);
  const protectedNames=['require_social_user','require_safety_user','require_nugget_moderator','record_vote_action','guard_court_audit','require_catalog_report_place','handle_new_user'];
  const functions=(await client.query("select p.proname,p.oid::regprocedure::text signature,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') member from pg_proc p where pronamespace='public'::regnamespace and prosecdef order by proname")).rows;
  for(const fn of functions){assert.equal(fn.anon,publicReads.has(fn.proname),'Unexpected anon RPC '+fn.signature);assert.equal(fn.member,memberCalls.has(fn.proname),'Unexpected member RPC '+fn.signature);
   if(protectedNames.includes(fn.proname)||fn.proname.startsWith('export_before_'))assert.equal(fn.member,false,'Internal helper callable '+fn.signature);}
  for(const name of ['submit_take_request','submit_price_request','vote_court','vote_matchup','record_court_ruling','court_review_state','court_rounds_for_review','export_discovery_data'])assert.ok(functions.some(f=>f.proname===name&&!f.anon&&f.member),'Missing protected RPC '+name);
  for(const role of ['anon','authenticated'])assert.equal((await client.query("select has_schema_privilege($1,'public','CREATE') allowed",[role])).rows[0].allowed,false);
  return {status:'PASS',catalog,publicTables:tables.length,functionsChecked:functions.length,readOnly:true};
 }finally{await client.query('rollback');}
}
module.exports={verify};
if(require.main===module){
 const connectionString=process.env.NUGGETFINDER_VERIFY_DATABASE_URL;
 if(!connectionString){console.error('Set NUGGETFINDER_VERIFY_DATABASE_URL for a read-only verification.');process.exitCode=1;}
 else(async()=>{const client=new Client({connectionString});try{await client.connect();console.log(JSON.stringify(await verify(client)));}finally{await client.end();}})().catch(error=>{console.error('Release verification failed: '+error.message);process.exitCode=1;});
}

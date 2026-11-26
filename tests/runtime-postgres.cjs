const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {fixture}=require('./support/local-postgres.cjs');const {Database,hash}=require('../services/participation/runtime.cjs');
const {provision}=require('./support/participant-fixture.cjs');
test('scoped contributor sessions retain legacy rules, isolate siblings and preserve safety controls',async()=>{
 const db=await fixture();const api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");
  const a=await provision(db,db.users[1]),b=await provision(db,db.users[1]),c=await provision(db,db.users[2],'teen',false);
  assert.equal((await db.pool.query('select count(*)::int n from auth.users')).rows[0].n,4,'No fake child Auth accounts');
  assert.equal((await db.actor(null,'select count(*)::int n from profiles where id=$1',[a.id])).rows[0].n,0);
  assert.equal((await db.actor(null,'select taste_profile($1) data',[a.id])).rows[0].data,null);
  for(const name of ['runtime_parent','runtime_action','runtime_photo','runtime_cleanup','runtime_verify_consent'])assert.equal((await db.pool.query("select bool_or(has_function_privilege('authenticated',oid,'execute')) allowed from pg_proc where proname=$1",[name])).rows[0].allowed,false);
  const action=(p,name,data,request=randomUUID())=>api.call('runtime_action',[p.hash,request,name,data]);
  const request=randomUUID(),vote={p_matchup:'cane-vs-cfa',p_side:'left'};
  await action(a,'vote_matchup',vote,request);await action(a,'vote_matchup',vote,request);await action(b,'vote_matchup',vote);
  assert.equal((await db.pool.query('select count(*)::int n from matchup_votes')).rows[0].n,2);
  await assert.rejects(action(a,'vote_matchup',{...vote,p_side:'right'}),/vote_cooldown/);
  await assert.rejects(action(a,'vote_matchup',{...vote,p_side:'right'},request),/request_conflict/);
  const prof=(await db.pool.query('select profile_id from participant_profiles where participant_id=$1',[c.id])).rows[0].profile_id;
  await assert.rejects(db.actor(2,"select vote_matchup('cane-vs-cfa','left')"),/participant_session_required/);
  const stock={p_product:'mcnuggets',p_place:'node/1229920544',p_status:'seen'};
  await Promise.all([action(a,'submit_stock_report',stock),action(b,'submit_stock_report',stock)]);
  assert.equal((await db.actor(null,"select seen_count from product_stock('mcnuggets') where place_id='node/1229920544'")).rows[0].seen_count,2);
  assert.equal((await action(a,'my_wave_profile',{}))[0].points,1);
  await assert.rejects(action(a,'submit_report',{p_place:'seed/1',p_status:'yes'}),/invalid_place/);
  await api.call('runtime_parent',[db.users[1],'pause',{participant:a.id}]);
  await assert.rejects(action(a,'vote_matchup',vote),/participant_session_unavailable/);
  assert.equal((await action(b,'my_wave_profile',{}))[0].points,1);
 }finally{await db.close();}
});
test('retention removes old minor store associations, preserves points and historical price rows, and cutover rejects legacy bypasses',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");const a=await provision(db,db.users[1]),b=await provision(db,db.users[2]);
  const act=(who,op,data)=>api.call('runtime_action',[who.hash,randomUUID(),op,data]);
  for(const p of [a,b])await act(p,'submit_stock_report',{p_product:'mcnuggets',p_place:'node/1229920544',p_status:'seen'});
  await act(a,'submit_price',{p_place:'node/1229920544',p_product:'mcnuggets',p_price:9,p_quantity:6,p_unit:'piece'});
  await db.pool.query("update stock_reports set created_at=now()-interval '25 hours';update price_entries set created_at=now()-interval '25 hours'");
  await api.call('runtime_retention',[]);await api.call('runtime_retention',[]);
  assert.equal((await db.pool.query('select count(*)::int n from stock_reports')).rows[0].n,0);
  assert.equal((await api.call('runtime_read',[a.hash,'profile',{}]))[0].points,1);
  assert.equal((await db.pool.query('select count(*)::int n from stock_point_awards where report_id is null')).rows[0].n,2);
  assert.equal((await db.pool.query('select count(*)::int n from price_entries where user_id is not null and price=9')).rows[0].n,1);
  const price=(await api.call('runtime_read',[a.hash,'prices',{place:'node/1229920544',product:'mcnuggets'}]))[0];assert.equal(price.masked_handle,'Community observation');
  await db.pool.query('update runtime_controls set cutover=true');
  await assert.rejects(db.actor(3,"select vote_beef('cane-vs-cfa','left')"),/participant_session_required/);
  await assert.rejects(db.actor(3,"select submit_stock_report('mcnuggets','node/1229920544','seen')"),/participant_session_required/);
  await assert.rejects(db.actor(3,"select set_handle('another_alias')"),/participant_session_required/);
  assert.equal((await db.actor(null,'select count(*)::int n from profiles')).rows[0].n,0,'Unverified profiles are hidden at cutover');
 }finally{await db.close();}
});

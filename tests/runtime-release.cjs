const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {fixture}=require('./support/local-postgres.cjs');const {provision}=require('./support/participant-fixture.cjs');const {Database}=require('../services/participation/runtime.cjs');const {verify}=require('../scripts/verify-release.cjs');
test('public takes use independent permission, anonymous minor authorship, safe reactions and a real moderation queue',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");
  const child=await provision(db,db.users[1],'under13',true,{publicTake:true}),adult=await provision(db,db.users[2],'adult',false,{publicTake:true});
  const act=(who,op,data)=>api.call('runtime_action',[who.hash,randomUUID(),op,data]);
  const take=await act(child,'submit_context_take',{p_kind:'product',p_ref:'mcnuggets',p_body:'The crunch has entered evidence.'});assert.equal(take.status,'pending');
  const queue=(await db.pool.query("select id from moderation_queue where kind='take' and content_ref=$1",[String(take.id)])).rows[0].id;
  await api.call('runtime_legacy_review',[db.users[0],'review',{id:queue,decision:'approve'}]);
  const feed=await api.call('runtime_read',[adult.hash,'public_takes',{}]);assert.equal(feed[0].handle,'Anonymous nugget fan');assert.ok(!JSON.stringify(feed).includes(child.id));assert.equal((await db.actor(null,"select * from community_feed('recent')")).rowCount,0);
  const another=await act(child,'submit_context_take',{p_kind:'product',p_ref:'mcnuggets',p_body:'Another food opinion still needs a human review.'});assert.equal(another.status,'pending');
  await assert.rejects(act(child,'respond_take',{p_take:take.id,p_reaction:'with'}),/cannot_react_to_own_take/);
  await act(adult,'respond_take',{p_take:take.id,p_reaction:'with'});assert.equal((await api.call('runtime_read',[child.hash,'take_responses',{id:take.id}])).with,1);
  await assert.rejects(act(adult,'respond_take',{p_take:take.id,p_body:'Hello there'}),/use_private_crew_social/);
  await act(adult,'report_content',{p_kind:'take',p_ref:String(take.id),p_reason:'other'});
  await api.call('runtime_parent',[db.users[1],'revoke',{participant:child.id,capability:'public_take'}]);assert.equal((await api.call('runtime_read',[adult.hash,'public_takes',{}])).length,0);
  await assert.rejects(db.pool.query("insert into auth.users(id,email) values($1,'not-a-child-account@example.invalid')",[child.id]),/managed_profiles_are_not_auth_accounts/);
  await db.pool.query('update runtime_controls set photo_pending_limit=1');await api.call('runtime_photo',[child.hash,'reserve',{request:randomUUID(),attested:true,purpose:'packaging',kind:'product',ref:'mcnuggets'}]);
  await assert.rejects(api.call('runtime_photo',[adult.hash,'reserve',{request:randomUUID(),attested:true,purpose:'packaging',kind:'product',ref:'mcnuggets'}]),/review_queue_full/);
 }finally{await db.close();}
});
test('creator erasure preserves other crew members contributions and hides replies whose context was removed',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");const a=await provision(db,db.users[1]),b=await provision(db,db.users[2]);
  const call=(who,op,data)=>api.call('runtime_group',[who.hash,null,op,data]);const group=await call(a,'create',{name:'Original private name'});await db.pool.query('insert into crew_members(crew_id,participant_id) values($1,$2)',[group.id,b.id]);
  const original=await call(a,'take',{crew:group.id,body:'Original crunchy thought'});await api.call('runtime_review_crew',[db.users[0],original.id,'approve']);const reply=await call(b,'take',{crew:group.id,parent:original.id,body:'A considered reply'});await api.call('runtime_review_crew',[db.users[0],reply.id,'approve']);
  const products=(await db.pool.query('select id from products limit 2')).rows;const challenge=await call(a,'challenge',{crew:group.id,left:products[0].id,right:products[1].id});await call(b,'vote',{crew:group.id,challenge:challenge.id,side:'left'});
  await api.call('runtime_parent',[db.users[1],'delete',{participant:a.id}]);const remaining=(await db.pool.query('select owner_id,name from private_crews where id=$1',[group.id])).rows[0];assert.equal(remaining.owner_id,null);assert.equal(remaining.name,'Crunch Council');
  const preserved=(await db.pool.query('select status,orphaned,parent_id from crew_takes where id=$1',[reply.id])).rows[0];assert.deepEqual(preserved,{status:'hidden',orphaned:true,parent_id:null});assert.equal((await db.pool.query('select count(*)::int n from crew_votes where challenge_id=$1',[challenge.id])).rows[0].n,1);
  await assert.rejects(api.call('runtime_review_crew',[db.users[0],reply.id,'approve']),/parent_removed/);await call(b,'adopt',{crew:group.id});
 }finally{await db.close();}
});
test('broker and independent verifier have exact function permissions and no direct table, login or RLS bypass rights',async()=>{
 const db=await fixture();
 try{
  const broker=new Set(['runtime_parent','runtime_action','runtime_photo','runtime_review_photos','runtime_photo_public','runtime_cleanup','runtime_pair','runtime_group','runtime_review_crew','runtime_catalog','runtime_erasure','runtime_rating','runtime_read','runtime_group_request','runtime_retention','runtime_replay_erasure','runtime_legacy_review']);
  for(const role of ['nugget_broker','nugget_consent_verifier']){
   assert.deepEqual((await db.pool.query('select rolsuper,rolbypassrls,rolcanlogin,rolinherit from pg_roles where rolname=$1',[role])).rows[0],{rolsuper:false,rolbypassrls:false,rolcanlogin:false,rolinherit:false});
   const allowed=role==='nugget_broker'?broker:new Set(['runtime_verify_consent','runtime_verify_group_disclosure']);const funcs=(await db.pool.query("select proname,has_function_privilege($1,oid,'execute') allowed from pg_proc where pronamespace='public'::regnamespace and prosecdef",[role])).rows;
   for(const fn of funcs)assert.equal(fn.allowed,allowed.has(fn.proname),role+' '+fn.proname);
   for(const row of (await db.pool.query("select tablename from pg_tables where schemaname='public'")).rows)assert.equal((await db.pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,row.tablename])).rows[0].allowed,false,role+' table '+row.tablename);
  }
  const client=await db.pool.connect();try{assert.equal((await verify(client)).status,'PASS');}finally{client.release();}
 }finally{await db.close();}
});
test('erasing a parent’s own player keeps their login and children but retires consumed consent and blocks legacy re-entry',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");const self=await provision(db,db.users[1],'adult',false),child=await provision(db,db.users[1]);
  const receipt=(await db.pool.query('select id from consent_requests where consumed_by=$1',[self.id])).rows[0].id;
  await api.call('runtime_parent',[db.users[1],'delete',{participant:self.id}]);
  assert.equal((await db.pool.query('select count(*)::int n from auth.users where id=$1',[db.users[1]])).rows[0].n,1);
  assert.equal((await api.call('runtime_parent',[db.users[1],'list',{}])).length,1);
  assert.equal((await api.call('runtime_parent',[db.users[1],'list',{}]))[0].id,child.id);
  assert.equal((await db.actor(1,'select my_participants()')).rows[0].my_participants[0].id,child.id);
  assert.equal((await db.pool.query('select status from consent_requests where id=$1',[receipt])).rows[0].status,'revoked');
  await assert.rejects(api.call('runtime_parent',[db.users[1],'create',{receipt,pseudonym:'cannot_replay'}]),/verified_consent_required/);
  await assert.rejects(db.actor(1,"select vote_matchup('cane-vs-cfa','left')"),/participant_session_required/);
  const account=await api.call('runtime_parent',[db.users[1],'export_account',{}]);assert.equal(account.account.id,db.users[1]);assert.equal(account.managed_profiles.length,1);
 }finally{await db.close();}
});

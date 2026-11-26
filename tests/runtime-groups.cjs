const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {fixture}=require('./support/local-postgres.cjs');const {provision}=require('./support/participant-fixture.cjs');const {Database,hash}=require('../services/participation/runtime.cjs');
test('private crews require guardian joins, moderate text, isolate contact and share the vote action budget',async()=>{
 const db=await fixture();const api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");const a=await provision(db,db.users[1]),b=await provision(db,db.users[2]);
  const call=(person,operation,data,request=randomUUID())=>api.call('runtime_group_request',[person.hash,null,request,operation,data]);
  const request=randomUUID(),group=await call(a,'create',{name:'Crunch Council'},request);assert.deepEqual(await call(a,'create',{name:'Crunch Council'},request),group);
  await assert.rejects(call(b,'view',{crew:group.id}),/crew_unavailable/);
  const code=randomUUID();await call(a,'code',{crew:group.id,code_hash:hash(code)});
  await assert.rejects(call(b,'join',{participant:b.id,code_hash:hash(code)}),/guardian_approval_required|participant_unavailable/);
  assert.equal((await api.call('runtime_group_request',[b.hash,db.users[2],randomUUID(),'join',{participant:b.id,code_hash:hash(code)}])).id,group.id);
  const draft=await call(a,'take',{crew:group.id,body:'Crunch carries the sauce.'});
  assert.equal((await call(b,'view',{crew:group.id})).takes.length,0);
  await api.call('runtime_review_crew',[db.users[0],draft.id,'approve']);assert.equal((await call(b,'view',{crew:group.id})).takes.length,1);
  await assert.rejects(call(a,'react',{crew:group.id,take:draft.id,reaction:'with'}),/cannot_react_to_own_take/);
  const products=(await db.pool.query('select id from products order by id limit 2')).rows;const contest=await call(a,'challenge',{crew:group.id,left:products[0].id,right:products[1].id});
  await call(b,'vote',{crew:group.id,challenge:contest.id,side:'left'});
  await assert.rejects(call(b,'vote',{crew:group.id,challenge:contest.id,side:'right'}),/vote_cooldown/);
  const prof=(await db.pool.query('select profile_id from participant_profiles where participant_id=$1',[b.id])).rows[0].profile_id;
  assert.equal((await db.pool.query('select count(*)::int n from vote_actions where user_id=$1',[prof])).rows[0].n,1);
  await db.pool.query("update profiles set posting_locked_until=now()+interval '1 day' where id=$1",[prof]);
  assert.equal((await call(b,'view',{crew:group.id})).takes.length,1,'Posting locks keep read and safety controls available');
  await call(b,'report',{crew:group.id,take:draft.id});assert.equal((await call(a,'view',{crew:group.id})).takes.length,1,'One report hides only for the reporter');
  await call(b,'block',{crew:group.id,take:draft.id});assert.equal((await db.pool.query('select count(*)::int n from crew_blocks')).rows[0].n,1);
  await db.pool.query('update profiles set posting_locked_until=null where id=$1',[prof]);
  for(let i=0;i<9;i++)await api.call('runtime_group_request',[b.hash,db.users[2],randomUUID(),'join',{participant:b.id,code_hash:hash('wrong'+i)}]);
  await assert.rejects(api.call('runtime_group_request',[b.hash,db.users[2],randomUUID(),'join',{participant:b.id,code_hash:hash('wrong')}]),/participant_unavailable|join_limit/);
 }finally{await db.close();}
});
test('group image disclosure is independent, member-only and withdrawn by blocks or membership removal',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");
  const a=await provision(db,db.users[1],'under13',true,{group:true}),b=await provision(db,db.users[2]);
  const group=await api.call('runtime_group',[a.hash,null,'create',{name:'Food Court'}]);
  await db.pool.query('insert into crew_members(crew_id,participant_id) values($1,$2)',[group.id,b.id]);
  const take=await api.call('runtime_group',[a.hash,null,'take',{crew:group.id,body:'A crunch worth investigating.'}]);await api.call('runtime_review_crew',[db.users[0],take.id,'approve']);
  const photo=await api.call('runtime_photo',[a.hash,'reserve',{request:randomUUID(),attested:true,purpose:'take',kind:'crew_take',ref:take.id}]);
  // Trusted processing fixture; byte pipeline is exercised separately through the real sandbox.
  await db.pool.query("update photo_evidence set status='approved',processed_at=now(),reviewed_at=now() where id=$1",[photo.id]);await db.pool.query("insert into photo_variants(evidence_id,variant,width,height,bytes) values($1,'thumb',100,100,200)",[photo.id]);
  assert.ok((await api.call('runtime_photo',[b.hash,'read',{id:photo.id,variant:'thumb'}])).key);
  assert.equal(await api.call('runtime_photo_public',[photo.id,'thumb']),null);
  await db.pool.query('insert into crew_blocks(participant_id,blocked_id) values($1,$2)',[b.id,a.id]);
  await assert.rejects(api.call('runtime_photo',[b.hash,'read',{id:photo.id,variant:'thumb'}]),/photo_unavailable/);
  await db.pool.query('delete from crew_blocks');await db.pool.query('delete from crew_members where crew_id=$1 and participant_id=$2',[group.id,b.id]);
  await assert.rejects(api.call('runtime_photo',[b.hash,'read',{id:photo.id,variant:'thumb'}]),/photo_unavailable/);
 }finally{await db.close();}
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./support/local-postgres.cjs');
test('participant permissions and private evidence fail closed without cross-account leaks',async()=>{
 const db=await fixture();
 try {
  const ids=[];
  for(const [index,band] of [[1,'under13'],[2,'teen'],[3,'adult']]){
   const row=await db.pool.query(`insert into participants(account_id,pseudonym,age_band,managed,invited_at) values($1,$2,$3,$4,now()) returning id`,[db.users[index],'nugget_'+index,band,band==='under13']);ids.push(row.rows[0].id);
  }
  for(let i=0;i<ids.length;i++)assert.equal((await db.actor(i+1,'select participant_can($1,\'photo\') ok',[ids[i]])).rows[0].ok,false);
  await assert.rejects(db.actor(1,`update participation_readiness set enabled=true`),/permission denied/);
  await assert.rejects(db.actor(1,`select * from participants`),/permission denied/);
  assert.equal((await db.actor(1,'select my_participants() data')).rows[0].data.length,1);
  await db.pool.query(`update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now() where capability='photo';
   insert into participant_permissions(participant_id,capability,verification_ref,notice_version,verified_at,expires_at)
   select id,'photo','isolated_verified_fixture','draft1',now(),now()+interval '1 day' from participants;`);
  for(let i=0;i<ids.length;i++)assert.equal((await db.actor(i+1,'select participant_can($1,\'photo\') ok',[ids[i]])).rows[0].ok,true);
  assert.equal((await db.actor(2,'select participant_can($1,\'photo\') ok',[ids[0]])).rows[0].ok,false);
  const product=(await db.pool.query('select id from products limit 1')).rows[0].id;
  const request='10000000-0000-0000-0000-000000000001';
  const params=[ids[0],request,'stock','product',product];
  const reserve=()=>db.actor(1,'select reserve_photo_evidence($1,$2,$3,$4,$5) id',params);
  const results=await Promise.all([reserve(),reserve()]);
  const evidence=results[0].rows[0].id;
  assert.equal(evidence,results[1].rows[0].id);
  await assert.rejects(db.actor(2,'select reserve_photo_evidence($1,$2,$3,$4,$5) id',params),/photo_permission_required/);
  await assert.rejects(db.actor(1,'select reserve_photo_evidence($1,$2,$3,$4,$5) id',[...params.slice(0,2),'price','product',product]),/request_conflict/);
  await assert.rejects(db.actor(null,'select my_photo_evidence($1)',[ids[0]]),/permission denied/);
  assert.deepEqual((await db.actor(2,'select my_photo_evidence($1) data',[ids[0]])).rows[0].data,[]);
  await assert.rejects(db.actor(1,'select * from photo_variants'),/permission denied/);
  await assert.rejects(db.actor(3,'select reserve_photo_evidence($1,$2,$3,$4,$5)',[ids[2],'10000000-0000-0000-0000-000000000002','stock','place','seed/1']),/photo_target_unavailable/);
  await db.pool.query("update participant_permissions set expires_at=now()-interval '1 minute',verified_at=now()-interval '1 day' where participant_id=$1",[ids[1]]);
  assert.equal((await db.actor(2,'select participant_can($1,\'photo\') ok',[ids[1]])).rows[0].ok,false);
  const exported=(await db.actor(1,'select export_participation_data() data')).rows[0].data;
  assert.equal(exported.participants.length,1);assert.equal(exported.photo_evidence.length,1);assert.equal('verification_ref' in exported.permissions[0],false);
  const attempts=await Promise.allSettled(Array.from({length:12},(_,i)=>db.actor(3,'select reserve_photo_evidence($1,$2,$3,$4,$5)',[ids[2],'20000000-0000-0000-0000-'+String(i).padStart(12,'0'),'packaging','product',product])));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,10);
  assert.ok(attempts.filter(r=>r.status==='rejected').every(r=>/photo_daily_limit/.test(r.reason.message)));
  await db.actor(1,'select revoke_participant_permission($1,\'photo\')',[ids[0]]);
  assert.equal((await db.actor(1,'select participant_can($1,\'photo\') ok',[ids[0]])).rows[0].ok,false);
  await db.pool.query(`update profiles set posting_locked_until=now()+interval '1 day' where id=$1`,[db.users[1]]);
  await db.actor(1,'select delete_photo_evidence($1)',[evidence]);
  assert.equal((await db.pool.query('select status from photo_evidence where id=$1',[evidence])).rows[0].status,'deleting');
  await db.actor(1,'select pause_participant($1)',[ids[0]]);
  await db.pool.query('delete from participants where id=$1',[ids[0]]);
  assert.equal((await db.pool.query('select participant_id from photo_evidence where id=$1',[evidence])).rows[0].participant_id,null);
  const tables=['participants','participation_readiness','participant_permissions','participant_permission_events','photo_evidence','photo_evidence_links','photo_variants','photo_evidence_events','photo_reports'];
  for(const name of tables){
   assert.equal((await db.pool.query('select relrowsecurity from pg_class where oid=$1::regclass',[name])).rows[0].relrowsecurity,true);
   for(const role of ['anon','authenticated'])assert.equal((await db.pool.query(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`,[role,name])).rows[0].allowed,false);
  }
 }finally{await db.close();}
});

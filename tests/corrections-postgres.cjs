const {test}=require('node:test');const assert=require('node:assert/strict');
const enabled=!!process.env.NUGGETFINDER_LOCAL_PG_URL;
test('release correction regressions on native PostgreSQL',{skip:!enabled},async t=>{
 const {fixture}=require('./support/local-postgres.cjs');const db=await fixture();const {pool,actor,users}=db;
 try{
 await t.test('posting restrictions retain report/block but never posting or moderator powers',async()=>{
  await pool.query("update public.profiles set posting_locked_until=now()+interval '1 day' where id=$1",[users[1]]);
  await actor(1,"select public.report_content('username',$1,'abuse')",[users[2]]);
  await actor(1,'select public.set_user_block($1,true)',[users[2]]);
  await actor(1,'select public.set_user_block($1,false)',[users[2]]);
  await assert.rejects(actor(1,"select public.submit_context_take('product','mcnuggets','Locked post')"),/posting_locked/);
  await assert.rejects(actor(1,"select public.submit_report('node/1229920544','yes',false)"),/posting_locked/);
  await assert.rejects(actor(1,'select public.moderation_inbox()'),/moderator_required/);
  await pool.query('update public.profiles set banned=true where id=$1',[users[1]]);
  await assert.rejects(actor(1,'select public.set_user_block($1,true)',[users[2]]),/posting_unavailable/);
  await pool.query('update public.profiles set banned=false,posting_locked_until=null where id=$1',[users[1]]);
 });
 await t.test('map and product reports reject invented, malformed and unregistered OSM targets',async()=>{
  for(const place of ['invented','seed/1','node/999999999999999','way/NaN',''])await assert.rejects(actor(2,"select public.submit_report($1,'yes',false)",[place]),/invalid_place|bad_request/);
  await actor(2,"select public.submit_report('node/1229920544','yes',false)");
  await assert.rejects(actor(2,"select public.submit_stock_report('mcnuggets','node/999999999999999','seen')"),/bad_request/);
  assert.equal((await pool.query('select count(*)::int n from public.reports')).rows[0].n,1);
 });
 }finally{await db.close();}
});

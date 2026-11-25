// Native PostgreSQL concurrency suite. Runs only against a disposable local database.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const enabled=!!process.env.NUGGETFINDER_LOCAL_PG_URL;
test('native PostgreSQL adversarial permissions and concurrency',{skip:!enabled},async t=>{
 const {fixture}=require('./support/local-postgres.cjs');const db=await fixture();const {pool,actor,users}=db;
 const place='node/1229920544';
 try {
 await t.test('legacy grants cannot expose private columns or truncate accounts',async()=>{
  for(const who of [null,1]) {
   await assert.rejects(actor(who,'select banned from public.profiles'),/permission denied/);
   await assert.rejects(actor(who,'truncate public.profiles cascade'),/permission denied/);
   await assert.rejects(actor(who,'truncate public.reports'),/permission denied/);
   await assert.rejects(actor(who,'select * from public.reports'),/permission denied/);
   const handles=await actor(who,'select id,handle,handle_set,created_at from public.profiles');assert.equal(handles.rowCount,4);
  }
 });
 await t.test('all private tables deny reads and writes and every table has row security',async()=>{
  const tables=(await pool.query("select tablename,rowsecurity from pg_tables where schemaname='public'")).rows;
  for(const table of tables) {
   assert.equal(table.rowsecurity,true,table.tablename);
   if(['profiles','products','places','place_products'].includes(table.tablename))continue;
   for(const role of ['anon','authenticated']) {
    const grants=(await pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[role,'public.'+table.tablename])).rows[0];
    assert.equal(grants.allowed,false,role+' '+table.tablename);
   }
  }
 });
 await t.test('member cannot moderate, self-promote or impersonate another author',async()=>{
  await assert.rejects(actor(1,'select public.moderation_inbox()'),/moderator_required/);
  await assert.rejects(actor(1,'select public.issue_strike($1)',[users[2]]),/moderator_required/);
  await assert.rejects(actor(1,'update public.profiles set is_moderator=true where id=$1',[users[1]]),/permission denied/);
  await assert.rejects(actor(1,"insert into public.price_entries(place_id,product_id,user_id,price,quantity,unit) values($1,'mcnuggets',$2,1,1,'piece')",[place,users[2]]),/permission denied/);
 });
 await t.test('posting lock stops map and product reports without granting points',async()=>{
  await pool.query("update public.profiles set posting_locked_until=now()+interval '1 day' where id=$1",[users[3]]);
  await assert.rejects(actor(3,"select public.submit_stock_report('mcnuggets',$1,'seen')",[place]),/posting_locked/);
  await assert.rejects(actor(3,"select public.submit_report($1,'yes',false)",[place]),/posting_locked/);
  assert.equal((await pool.query('select count(*)::int n from public.stock_point_awards')).rows[0].n,0);
 });
 await t.test('request retries are atomic, private and reject changed payloads',async()=>{
  const key='00000000-0000-0000-0000-000000000099';
  const attempts=await Promise.all(Array.from({length:6},()=>actor(0,"select public.submit_take_request($1,'product','mcnuggets','Local retry') data",[key])));
  assert.equal(new Set(attempts.map(r=>r.rows[0].data.id)).size,1);
  await assert.rejects(actor(0,"select public.submit_take_request($1,'product','mcnuggets','Changed retry')",[key]),/request_mismatch/);
  assert.equal((await actor(1,'select public.export_discovery_data() data')).rows[0].data.submission_receipts.length,0);
 });
 await t.test('simultaneous username changes cannot bypass the cooldown',async()=>{
  const results=await Promise.allSettled(['first_local_name','second_local_name'].map(name=>actor(1,'select public.set_handle($1)',[name])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/handle_cooldown/);
 });
 await t.test('simultaneous prices share one cooldown and one successful insert',async()=>{
  const results=await Promise.allSettled(Array.from({length:8},()=>actor(1,"select public.submit_price($1,'mcnuggets',9.99,20,'piece')",[place])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const r of results.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/price_cooldown/);
 });
 await t.test('simultaneous takes cannot exceed the daily limit',async()=>{
  const results=await Promise.allSettled(Array.from({length:14},(_,n)=>actor(2,"select public.submit_context_take('product','mcnuggets',$1)",['Local concurrency '+n])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,10);
  for(const r of results.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/take_limit/);
  assert.equal((await actor(null,'select public.take_cards() data')).rows[0].data.length,0);
 });
 await t.test('daily price cap counts simultaneous distinct store products',async()=>{
  const pairs=(await pool.query('select place_id,product_id from public.place_products order by place_id,product_id limit 24')).rows;
  const results=await Promise.allSettled(pairs.map(pair=>actor(0,"select public.submit_price($1,$2,5,10,'piece')",[pair.place_id,pair.product_id])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,20);
  for(const r of results.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/price_limit/);
 });
 await t.test('banned accounts cannot write through any public reporting or social entry point',async()=>{
  await pool.query('update public.profiles set banned=true where id=$1',[users[3]]);
  for(const sql of ["select public.submit_price('node/1229920544','mcnuggets',5,10,'piece')",
   "select public.submit_context_take('product','mcnuggets','Local banned take')",
   "select public.vote_matchup('cane-vs-cfa','left')",
   "select public.submit_stock_report('mcnuggets','node/1229920544','seen')",
   "select public.submit_report('node/1229920544','yes',false)",
   "select public.rate_place('node/1229920544',5,5,5,5)"])await assert.rejects(actor(3,sql),/banned|posting_unavailable/);
 });
 await t.test('duplicate stock submissions cannot manufacture confirmation or points',async()=>{
  const results=await Promise.allSettled(Array.from({length:6},()=>actor(1,"select public.submit_stock_report('mcnuggets',$1,'seen')",[place])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('select count(*)::int n from public.stock_point_awards')).rows[0].n,0);
  const status=(await actor(null,"select * from public.product_stock('mcnuggets') where place_id=$1",[place])).rows[0];assert.equal(status.seen_count,1);
 });
 await t.test('different people confirm once, exports remain private, verified badges cannot be forged',async()=>{
  await actor(0,"select public.submit_stock_report('mcnuggets',$1,'seen')",[place]);
  assert.equal((await pool.query('select sum(points)::int n from public.stock_point_awards')).rows[0].n,2);
  const own=(await actor(2,'select public.export_discovery_data() data')).rows[0].data;assert.equal(own.price_entries.length,0);
  await assert.rejects(actor(1,'insert into public.business_verifications(user_id,place_id,source_url) values($1,$2,$3)',[users[1],place,'https://example.test/proof']),/permission denied/);
 });
 }finally{await db.close();}
});


test('upgrade preserves pre-existing Wave 2 content and grants',{skip:!enabled},async()=>{
 const {fixture,users}=require('./support/local-postgres.cjs');
 const old='10000000-0000-0000-0000-000000000001';
 const db=await fixture({async seedLegacy(pool){
  await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','legacy@example.test')`,[old]);
  await pool.query("insert into public.takes(author_id,subject_kind,subject_ref,body,status) values($1,'product','mcnuggets','Local legacy take','published')",[old]);
  await pool.query("insert into public.beef_votes(matchup_id,user_id,side) values('cane-vs-cfa',$1,'left')",[old]);
 }});
 try{
  const cards=(await db.actor(null,'select public.take_cards() cards')).rows[0].cards;
  assert.equal(cards[0].body,'Local legacy take');assert.equal(cards[0].stamp,null);
  const votes=(await db.actor(null,"select * from public.matchups('cane-vs-cfa')")).rows[0];assert.equal(Number(votes.left_votes),1);
  const counts=(await db.pool.query('select (select count(*) from products)::int products,(select count(*) from places)::int places,(select count(*) from place_products)::int links')).rows[0];
  assert.deepEqual(counts,{products:25,places:83,links:189});
 }finally{await db.close();}
});

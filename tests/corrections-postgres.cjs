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
 await t.test('all individual changes count, failed/no-op votes do not, and the window rolls',async()=>{
  for(let i=0;i<60;i++){
   await pool.query("update public.matchup_votes set updated_at=clock_timestamp()-interval '6 seconds' where user_id=$1",[users[1]]);
   await actor(1,"select public.vote_matchup('cane-vs-cfa',$1)",[i%2?'right':'left']);
  }
  assert.equal((await pool.query('select count(*)::int n from public.vote_actions where user_id=$1',[users[1]])).rows[0].n,60);
  await pool.query("update public.matchup_votes set updated_at=clock_timestamp()-interval '6 seconds' where user_id=$1",[users[1]]);
  await assert.rejects(actor(1,"select public.vote_matchup('cane-vs-cfa','left')"),/vote_limit/);
  await actor(1,"select public.vote_matchup('cane-vs-cfa','right')");
  await pool.query("update public.vote_actions set created_at=clock_timestamp()-interval '24 hours 1 second' where user_id=$1",[users[1]]);
  await actor(1,"select public.vote_matchup('cane-vs-cfa','left')");
  await assert.rejects(actor(1,"select public.vote_matchup('cane-vs-cfa','right')"),/vote_cooldown/);
 });
 await t.test('concurrent actions cannot exceed 60 and old Beef entry points share the ledger',async()=>{
  await pool.query("insert into public.vote_actions(user_id,kind,content_ref,vote) select $1,'matchup','local-seed','left' from generate_series(1,59)",[users[2]]);
  const ids=(await pool.query("select id from public.matchups where id<>'cane-vs-cfa' limit 2")).rows;
  const outcomes=await Promise.allSettled(ids.map(row=>actor(2,"select public.vote_beef($1,'left')",[row.id])));
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  assert.match(outcomes.find(row=>row.status==='rejected').reason.message,/vote_limit/);
  assert.equal((await pool.query("select count(*)::int n from public.vote_actions where user_id=$1",[users[2]])).rows[0].n,60);
 });
 await t.test('closed rulings are recorded, corrected by version and never silently changed by bans or deletions',async()=>{
  const caseId=(await actor(0,"select public.nominate_court_case('Local correction katsu','A flat nugget?') id")).rows[0].id;
  const queue=(await pool.query("select id from public.moderation_queue where kind='court' and content_ref=$1",[String(caseId)])).rows[0].id;
  await actor(0,"select public.review_content($1,'approve')",[queue]);
  await assert.rejects(actor(0,'select public.record_court_ruling($1)',[caseId]),/round_not_closed/);
  for(let i=1;i<=20;i++){
   const id='30000000-0000-0000-0000-'+String(i).padStart(12,'0');
   await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','court-local@example.test')`,[id]);
   await pool.query('insert into public.court_votes(case_id,user_id,verdict) values($1,$2,$3)',[caseId,id,i<=12?'nugget':i<=17?'adjacent':'no']);
  }
  await pool.query("update public.court_cases set opened_at=now()-interval '8 days',closes_at=now()-interval '1 day' where id=$1",[caseId]);
  await pool.query("update public.court_votes set updated_at=now()-interval '2 days' where case_id=$1",[caseId]);
  assert.equal((await actor(null,'select public.court_cases($1) data',[caseId])).rows[0].data[0].verdict,'awaiting');
  await assert.rejects(actor(2,'select public.record_court_ruling($1)',[caseId]),/moderator_required/);
  await actor(0,'select public.record_court_ruling($1)',[caseId]);
  let row=(await actor(null,'select public.court_cases($1) data',[caseId])).rows[0].data[0];assert.equal(row.verdict,'nugget');assert.equal(row.ruling_version,1);
  const ballot=(await pool.query("select id from public.court_ruling_ballots where case_id=$1 and user_id='30000000-0000-0000-0000-000000000001'",[caseId])).rows[0].id;
  await pool.query("update public.profiles set banned=true where id='30000000-0000-0000-0000-000000000001'");
  await pool.query("delete from auth.users where id='30000000-0000-0000-0000-000000000002'");
  row=(await actor(null,'select public.court_cases($1) data',[caseId])).rows[0].data[0];assert.equal(row.verdict,'nugget');assert.equal(Number(row.nugget),12);
  const corrections=await Promise.allSettled([1,2].map(()=>actor(0,"select public.record_court_ruling($1,1,$2,'eligibility_review','Excluded a reviewed abusive vote.')",[caseId,[ballot]])));
  assert.equal(corrections.filter(r=>r.status==='fulfilled').length,1);assert.match(corrections.find(r=>r.status==='rejected').reason.message,/version_conflict/);
  const history=(await actor(null,'select public.court_ruling_history($1) data',[caseId])).rows[0].data;
  assert.equal(history.length,2);assert.equal(history[0].verdict,'insufficient');assert.equal(history[1].verdict,'nugget');assert.equal('excluded_ballots' in history[0],false);
  await assert.rejects(actor(2,'select * from public.court_ruling_ballots'),/permission denied/);
  await assert.rejects(actor(2,'update public.court_rulings set nugget=99'),/permission denied/);
  await assert.rejects(actor(2,'select public.court_review_state($1)',[caseId]),/moderator_required/);
  await assert.rejects(actor(2,"select public.vote_court($1,'nugget')",[caseId]),/round_unavailable/);
 });
 await t.test('a shared action limit also protects Court and safety reports remain available there',async()=>{
  const id=(await pool.query("insert into public.court_cases(author_id,food_name,argument,status,opened_at,closes_at) values($1,'Local shared limit','Test fixture','published',now(),now()+interval '7 days') returning id",[users[0]])).rows[0].id;
  await assert.rejects(actor(2,"select public.vote_court($1,'nugget')",[id]),/vote_limit/);
  await pool.query("update public.profiles set posting_locked_until=now()+interval '1 day' where id=$1",[users[1]]);
  await actor(1,"select public.report_discovery('court',$1,'other')",[String(id)]);
  await pool.query('update public.profiles set posting_locked_until=null where id=$1',[users[1]]);
 });
 await t.test('stock leases expire at the earliest contributing vote, not the newest report',async()=>{
  const place=(await pool.query("select place_id from public.place_products where product_id='mcnuggets' and place_id<>'node/1229920544' limit 1")).rows[0].place_id;
  await actor(1,"select public.submit_stock_report('mcnuggets',$1,'seen')",[place]);
  await actor(2,"select public.submit_stock_report('mcnuggets',$1,'seen')",[place]);
  await pool.query("update public.stock_reports set created_at=now()-interval '1 hour 59 minutes 59 seconds' where user_id=$1 and place_id=$2",[users[1],place]);
  let rows=(await actor(null,"select public.product_stock_snapshot('mcnuggets') data")).rows[0].data;let row=rows.find(r=>r.place_id===place);
  assert.equal(row.seen_count,2);assert.ok(Date.parse(row.valid_until)-Date.parse(row.checked_at)<=1500);
  const {normalizeSnapshot,stockStatus}=require('../js/wave-logic.js');const normalized=normalizeSnapshot(row,1000);
  assert.equal(stockStatus(normalized,1000),'yes');assert.equal(stockStatus(normalized,3000),'stale');
  await pool.query("update public.stock_reports set created_at=now()-interval '2 hours 1 second' where user_id=$1 and place_id=$2",[users[1],place]);
  rows=(await actor(null,"select public.product_stock_snapshot('mcnuggets') data")).rows[0].data;row=rows.find(r=>r.place_id===place);assert.equal(row.seen_count,1);
  assert.equal(stockStatus(normalizeSnapshot(row,1000),1000),'pending');
 });
 await t.test('price source verification cannot override newer evidence and all approved age bands are exact',async()=>{
  const place='node/1229920544';
  await pool.query("insert into public.business_verifications(user_id,place_id,source_url) values($1,$2,'https://example.test/reviewed')",[users[1],place]);
  await actor(1,"select public.submit_price($1,'mcnuggets',10,20,'piece')",[place]);
  await pool.query("update public.price_entries set created_at=now()-interval '365 days' where user_id=$1",[users[1]]);
  await actor(2,"select public.submit_price($1,'mcnuggets',8,20,'piece')",[place]);
  const rows=(await actor(null,"select public.price_ledger($1,'piece') data",[place])).rows[0].data;
  assert.equal(rows.length,2);assert.equal(rows[0].price,8);assert.equal(rows[0].verified_store,false);assert.equal(rows[0].freshness,'recent');
  assert.equal(rows[1].verified_store,true);assert.equal(rows[1].freshness,'historical');assert.equal(rows[1].superseded,true);
  for(const [days,result] of [[0,'recent'],[7,'recent'],[7.001,'dated'],[30,'dated'],[30.001,'historical']]){
   const actual=(await pool.query("select public.price_observation_age('2026-11-01'::timestamptz,'2026-11-01'::timestamptz+$1*interval '1 day') label",[days])).rows[0].label;assert.equal(actual,result);
  }
 });
 await t.test('read-only verifier fails closed on bad grants and legacy column privileges are removed',async()=>{
  const {verify}=require('../scripts/verify-release.cjs');const client=await pool.connect();
  try{const result=await verify(client);assert.equal(result.status,'PASS');
   await pool.query('grant select(banned) on public.profiles to authenticated');
   await assert.rejects(verify(client),/column read/);
   await pool.query('revoke select(banned) on public.profiles from authenticated');
  }finally{client.release();}
 });
 await t.test('ruling audit facts are immutable and survive deletion of the nominator',async()=>{
  const owner='50000000-0000-0000-0000-000000000001';
  await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','deleted-local@example.test')`,[owner]);
  const id=(await pool.query("insert into public.court_cases(author_id,food_name,argument,status,opened_at,closes_at) values($1,'Local low-turnout case','No forced winner','published',now()-interval '8 days',now()-interval '1 day') returning id",[owner])).rows[0].id;
  await actor(0,'select public.record_court_ruling($1)',[id]);
  await assert.rejects(pool.query("update public.court_rulings set verdict='nugget' where case_id=$1",[id]),/court_audit_immutable/);
  await assert.rejects(pool.query('delete from public.court_rulings where case_id=$1',[id]),/court_audit_immutable/);
  await pool.query('delete from auth.users where id=$1',[owner]);
  const row=(await actor(null,'select public.court_cases($1) data',[id])).rows[0].data[0];
  assert.equal(row.author_id,null);assert.equal(row.verdict,'insufficient');assert.equal(row.ruling_version,1);
 });
 await t.test('removing a price author preserves the private observation without resurrecting public evidence',async()=>{
  const author='70000000-0000-0000-0000-000000000001';await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','local-price@example.test')`,[author]);
  await actor(author,"select public.submit_price('node/1229920544','mcnuggets',7.77,20,'piece')");
  await pool.query('delete from auth.users where id=$1',[author]);
  const record=(await pool.query('select user_id from public.price_entries where price=7.77')).rows[0];assert.equal(record.user_id,null);
  const publicRows=(await actor(null,"select public.price_ledger('node/1229920544','piece') data")).rows[0].data;assert.ok(!publicRows.some(row=>row.price===7.77));
 });
 }finally{await db.close();}
});

test('upgrade removes explicit legacy column privileges as well as broad table grants',{skip:!enabled},async()=>{
 const {fixture}=require('./support/local-postgres.cjs');const db=await fixture({async seedLegacy(pool){
  await pool.query('grant select(banned),update(is_moderator) on public.profiles to authenticated');
  await pool.query('grant update(name) on public.products to anon');
 }});
 try{
  await assert.rejects(db.actor(1,'select banned from public.profiles'),/permission denied/);
  await assert.rejects(db.actor(1,'update public.profiles set is_moderator=true'),/permission denied/);
  await assert.rejects(db.actor(null,"update public.products set name='forged'"),/permission denied/);
 }finally{await db.close();}
});

test('legacy Court voters have an explicit bounded hold rather than fabricated change history',{skip:!enabled},async()=>{
 const {fixture}=require('./support/local-postgres.cjs');const legacy='60000000-0000-0000-0000-000000000001';let caseId;
 const db=await fixture({async beforeMigration(file,pool){
  if(file!=='20261125000200_vote_actions.sql')return;
  await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','legacy-court@example.test')`,[legacy]);
  caseId=(await pool.query("insert into public.court_cases(author_id,food_name,argument,status,opened_at,closes_at) values($1,'Legacy activity gap','Test fixture','published',now(),now()+interval '7 days') returning id",[legacy])).rows[0].id;
  await pool.query("insert into public.court_votes(case_id,user_id,verdict,updated_at) values($1,$2,'nugget',now()-interval '6 seconds')",[caseId,legacy]);
 }});
 try{
  assert.equal((await db.pool.query('select count(*)::int n from public.vote_actions where user_id=$1',[legacy])).rows[0].n,1);
  await assert.rejects(db.actor(legacy,"select public.vote_court($1,'no')",[caseId]),/vote_history_hold/);
  await db.pool.query("update public.vote_history_holds set expires_at=now()-interval '1 second' where user_id=$1",[legacy]);
  await db.pool.query("update public.vote_actions set created_at=now()-interval '25 hours' where user_id=$1",[legacy]);
  await db.actor(legacy,"select public.vote_court($1,'no')",[caseId]);
  assert.equal((await db.pool.query("select count(*)::int n from public.vote_actions where user_id=$1 and created_at>now()-interval '24 hours'",[legacy])).rows[0].n,1);
 }finally{await db.close();}
});

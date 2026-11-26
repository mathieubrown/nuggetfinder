const {test}=require('node:test'),assert=require('node:assert/strict');
const {startReview}=require('../scripts/review-server.cjs');
test('complete local review cannot expose private files, internal SQL helpers, arbitrary actors or cross-origin writes',async()=>{
 const prior=process.env.NUGGETFINDER_REVIEW_ONLY;delete process.env.NUGGETFINDER_REVIEW_ONLY;
 await assert.rejects(startReview({port:0}),/disposable local review/);
 process.env.NUGGETFINDER_REVIEW_ONLY='1';const review=await startReview({port:0,assets:process.env.NUGGETFINDER_BROWSER_ASSETS||require('node:path').resolve(__dirname,'../..')});
 try{
  const post=(name,data,headers={})=>fetch(review.url+'/__review/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Review-Role':'a',...headers},body:JSON.stringify(data)});
  const main=await fetch(review.url+'/');assert.equal(main.status,200);const html=await main.text();assert.ok(html.includes('REVIEW BUILD'));assert.ok(!html.includes('cdn.jsdelivr.net'));assert.ok(!html.includes('fonts.googleapis.com'));
  for(const file of ['/AGENTS.md','/supabase/migrations/20261125000900_scoped_participant_runtime.sql','/services/participation/runtime.cjs','/.git/config'])assert.equal((await fetch(review.url+file)).status,400);
  assert.equal((await post('rpc',{name:'vote_matchup',parameters:{p_matchup:'cane-vs-cfa',p_side:'left'}},{Origin:'https://outside.example'})).status,403);
  assert.equal((await post('session',{}, {'X-Review-Role':'arbitrary-uuid'})).status,403);
  for(const name of ['runtime_parent','runtime_verify_consent','require_social_user','runtime_action','guard_profile_identity'])assert.equal((await(await post('rpc',{name,parameters:{}})).json()).error.message,'review_rpc_denied');
  assert.equal((await(await post('rpc',{name:'my_wave_profile);drop table profiles;--',parameters:{}})).json()).error.message,'review_rpc_denied');
  assert.equal((await(await post('table',{table:'accounts'})).json()).error.message,'review_table_denied');
  const profiles=await(await post('table',{table:'profiles'})).json();assert.ok(profiles.data.length);assert.deepEqual(Object.keys(profiles.data[0]).sort(),['created_at','handle','handle_set','id']);
  const before=(await review.db.pool.query('select count(*)::int n from stock_reports')).rows[0].n;assert.equal(before,0,'No fake seeded stock');
  const report={name:'submit_stock_report',parameters:{p_product:'mcnuggets',p_place:'node/1229920544',p_status:'seen'}};assert.equal((await(await post('rpc',report)).json()).error,null);
  const mine=await(await post('rpc',{name:'product_stock_snapshot',parameters:{p_product:'mcnuggets'}})).json();assert.ok(JSON.stringify(mine.data).includes('node/1229920544'));
  assert.equal((await review.db.pool.query('select count(*)::int n from stock_reports')).rows[0].n,1);
  assert.equal((await review.db.pool.query('select count(*)::int n from stock_point_awards')).rows[0].n,0,'One report earns no confirmed-action points');
 }finally{await review.close();if(prior===undefined)delete process.env.NUGGETFINDER_REVIEW_ONLY;else process.env.NUGGETFINDER_REVIEW_ONLY=prior;}
});

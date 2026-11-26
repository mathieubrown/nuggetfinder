const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./support/local-postgres.cjs');
const {provision}=require('./support/participant-fixture.cjs');
const {Database}=require('../services/participation/runtime.cjs');

test('catalog review opens stock reporting, scopes business claims and keeps business stock out of quorum',async()=>{
 const db=await fixture();
 const api=new Database(db.pool);
 try {
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_functional',reviewed_at=now()");
  const first=await provision(db,db.users[1],'adult',false,{publicTake:true});
  const second=await provision(db,db.users[2]);
  const place='node/1229920544';
  const suggestion={request:randomUUID(),kind:'product',name:'Fixture Frozen Nuggets',brand:'Fixture Brand',product_kind:'nuggets',place};
  const item=await api.call('runtime_catalog_request',[first.hash,'submit',suggestion]);
  assert.equal((await api.call('runtime_catalog_request',[first.hash,'submit',suggestion])).id,item.id);
  assert.equal((await api.call('runtime_browse',['products',{}])).some(p=>p.name===suggestion.name),false);
  await assert.rejects(api.call('runtime_review_catalog',[db.users[1],item.id,'approve',true]),/moderator_required/);
  await assert.rejects(api.call('runtime_review_catalog',[db.users[0],item.id,'approve',false]),/review_checks_required/);
  const approved=await api.call('runtime_review_catalog',[db.users[0],item.id,'approve',true]);
  const product=approved.product_id;
  assert.ok((await api.call('runtime_browse',['place_products',{}])).some(l=>l.product_id===product&&l.place_id===place&&l.link_kind==='place_to_check'));
  const stock={request:randomUUID(),product,place,status:'seen'};
  await assert.rejects(api.call('runtime_catalog_request',[first.hash,'stock',stock]),/business_scope_required/);
  await assert.rejects(api.call('runtime_catalog_request',[second.hash,'submit',{kind:'store_claim',request:randomUUID(),place,source:'https://example.org/shop'}]),/adult_business_account_required/);
  const claim=await api.call('runtime_catalog_request',[first.hash,'submit',{kind:'store_claim',request:randomUUID(),place,source:'https://example.org/shop'}]);
  await api.call('runtime_review_catalog',[db.users[0],claim.id,'approve',true]);
  const business=await api.call('runtime_catalog_request',[first.hash,'stock',stock]);
  assert.equal((await api.call('runtime_catalog_request',[first.hash,'stock',stock])).id,business.id);
  assert.equal((await api.call('business_stock_for',[product,place]))[0].source,'Verified store report');
  const report=await api.call('runtime_action',[first.hash,randomUUID(),'submit_stock_report',{p_product:product,p_place:place,p_status:'seen'}]);
  assert.ok(report.id);
  assert.equal((await db.pool.query('select count(*)::int n from stock_point_awards')).rows[0].n,0);
  await api.call('runtime_action',[second.hash,randomUUID(),'submit_stock_report',{p_product:product,p_place:place,p_status:'seen'}]);
  assert.equal((await db.pool.query('select count(*)::int n from stock_point_awards')).rows[0].n,2);
  await api.call('runtime_review_catalog',[db.users[0],claim.id,'revoke',false]);
  assert.deepEqual(await api.call('business_stock_for',[product,place]),[]);
  assert.equal((await api.call('runtime_parent',[db.users[1],'export',{participant:first.id}])).catalog_requests.length,2);
 }finally{await db.close();}
});

test('scoped feed protects private authors and status stays available only to the right player',async()=>{
 const db=await fixture(),api=new Database(db.pool);
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_functional',reviewed_at=now()");
  const first=await provision(db,db.users[1],'under13',true,{publicTake:true});
  const second=await provision(db,db.users[2],'adult',false,{publicTake:true});
  const draft=await api.call('runtime_action',[first.hash,randomUUID(),'submit_context_take',{p_kind:'product',p_ref:'mcnuggets',p_body:'Test crunch.'}]);
  assert.deepEqual(await api.call('runtime_feed_screen',[null,{}]),[]);
  assert.equal((await api.call('runtime_screen',[first.hash,'activity',{}])).takes[0].id,draft.id);
  assert.deepEqual((await api.call('runtime_screen',[second.hash,'activity',{}])).takes,[]);
  const review=(await db.pool.query("select id from moderation_queue where kind='take' and content_ref=$1",[String(draft.id)])).rows[0].id;
  await api.call('runtime_legacy_review',[db.users[0],'review',{id:review,decision:'approve'}]);
  const [row]=await api.call('runtime_feed_screen',[second.hash,{}]);
  assert.equal(row.author_id,null);
  assert.equal(row.handle,'Anonymous nugget fan');
  assert.equal((await api.call('runtime_feed_screen',[first.hash,{}]))[0].mine,true);
  await api.call('runtime_screen',[second.hash,'block_take',{id:draft.id}]);
  assert.deepEqual(await api.call('runtime_feed_screen',[second.hash,{}]),[]);
  assert.equal(await api.call('runtime_response_screen',[second.hash,draft.id]),null);
  assert.equal((await api.call('runtime_identity',[first.hash])).participant,first.id);
  await api.call('runtime_action',[first.hash,randomUUID(),'logout',{}]);
  await assert.rejects(api.call('runtime_identity',[first.hash]),/participant_session_unavailable/);
 }finally{await db.close();}
});

test('same-origin hosted entry has fixed public reads, verified permissions and status-only deletion receipts',async()=>{
 const {createServer}=require('../services/participation/server.cjs');
 const {Runtime}=require('../services/participation/runtime.cjs');
 const path=require('node:path');
 const db=await fixture(),database=new Database(db.pool);
 const server=createServer({runtime:new Runtime({database,auth:{async verify(){throw Error('sign_in_required');}}}),
  root:path.resolve(__dirname,'..'),scopedApp:true});
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const index=await fetch(base).then(r=>r.text());
  assert.match(index,/name="nugget-scoped-app" content="enabled"/);
  assert.doesNotMatch(index,/cdn\.jsdelivr|fonts\.googleapis|__review/);
  assert.equal((await fetch(base+'/api/health').then(r=>r.json())).status,'ready');
  const post=(route,data)=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.equal((await post('browse',{operation:'products'}).then(r=>r.json())).length,25);
  assert.equal((await post('browse',{operation:'profiles'})).status,400);
  assert.equal((await post('mod-catalog',{})).status,400);
  const queued=await database.call('runtime_parent',[db.users[1],'delete_account',{}]);
  assert.deepEqual(await post('deletion-status',{receipt:queued.job}).then(r=>r.json()),{status:'pending'});
  await database.call('runtime_erasure',['sql_delete',queued.job]);
  await db.pool.query('delete from auth.users where id=$1',[db.users[1]]);
  await database.call('runtime_erasure',['complete',queued.job]);
  assert.deepEqual(await post('deletion-status',{receipt:queued.job}).then(r=>r.json()),{status:'complete'});
  assert.equal((await post('deletion-status',{receipt:randomUUID()})).status,400);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close();}
});

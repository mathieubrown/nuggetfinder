const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {mkdtemp,rm,readdir}=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {fixture}=require('./support/local-postgres.cjs');const {provision}=require('./support/participant-fixture.cjs');
const {Database,LocalBlobs,Runtime,processor,containerProcessor,hash}=require('../services/participation/runtime.cjs');const {createServer}=require('../services/participation/server.cjs');const {workerServer,remoteProcessor}=require('../services/participation/image-worker.cjs');
const python=process.env.NUGGETFINDER_PYTHON||path.resolve(__dirname,'../../photo-python/bin/python');
test('real HTTP broker and image worker enforce consent, private review, revision, export and retried erasure',async()=>{
 const db=await fixture();const dir=await mkdtemp(path.join(os.tmpdir(),'nugget-private-'));let server,worker;
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");
  const a=await provision(db,db.users[1]),b=await provision(db,db.users[2]);
  const identities=new Map([['parent',{id:db.users[1],authenticatedAt:Date.now()}],['other',{id:db.users[2],authenticatedAt:Date.now()}],['mod',{id:db.users[0],authenticatedAt:Date.now()}],['stale',{id:db.users[1],authenticatedAt:Date.now()-700000}]]);
  const store=new LocalBlobs(dir);const workerSecret=randomUUID()+randomUUID(),socket=path.join(dir,'worker.sock');worker=workerServer({token:workerSecret});await new Promise(r=>worker.listen(socket,r));const runtime=new Runtime({database:new Database(db.pool),blobs:store,processImage:remoteProcessor({socketPath:socket,token:workerSecret}),auth:{async verify(token){if(!identities.has(token))throw Error('sign_in_required');return identities.get(token);},async removeUser(id){await db.pool.query('delete from auth.users where id=$1',[id]);}}});
  server=createServer({runtime,root:path.resolve(__dirname,'..'),origins:['http://nugget.test']});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  async function post(route,token,data){const response=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'http://nugget.test'},body:JSON.stringify(data)});return {status:response.status,data:await response.json()};}
  assert.equal((await post('/api/parent','stale',{operation:'list'})).data.error,'recent_sign_in_required');
  assert.equal((await post('/api/parent','parent',{operation:'export',data:{participant:b.id}})).data.error,'participant_unavailable');
  const catalog=await fetch(base+'/api/catalog').then(r=>r.json());assert.equal(catalog.products.length,25);assert.equal(catalog.showdowns.length,10);
  assert.equal((await post('/api/photo',a.token,{operation:'complete',data:{}})).data.error,'photo_operation_not_public');assert.equal((await post('/api/photo',a.token,{operation:'begin',data:{}})).data.error,'photo_operation_not_public');
  const reserved=await runtime.photo(a.token,'reserve',{request:randomUUID(),attested:true,purpose:'stock',kind:'product',ref:'mcnuggets'});
  const raw=execFileSync(python,['-c',"from PIL import Image;from io import BytesIO;import sys;o=BytesIO();e=Image.Exif();e[270]='PRIVATE METADATA';e[34853]={1:'N',2:(37,1,1),3:'W',4:(122,1,1)};Image.new('RGB',(300,200),'orange').save(o,'JPEG',exif=e);sys.stdout.buffer.write(o.getvalue())"]);
  let response=await fetch(base+'/api/upload/'+reserved.id,{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/octet-stream','X-Revision':'1'},body:raw});
  const uploaded=await response.json();assert.equal(response.status,200,JSON.stringify(uploaded));assert.equal(uploaded.status,'pending');assert.equal((await readdir(dir)).filter(f=>f.endsWith('.jpg')).length,2);
  assert.equal((await post('/api/photo-read',b.token,{id:reserved.id,variant:'display'})).data.error,'photo_unavailable');
  assert.equal((await fetch(base+'/api/public-photo/'+reserved.id+'/display')).status,400);
  assert.equal((await post('/api/mod','parent',{id:reserved.id,revision:1,decision:'approve'})).data.error,'moderator_required');
  const checks={food_only:true,no_people:true,no_private_information:true,rights_checked:true};
  assert.equal((await post('/api/mod','mod',{id:reserved.id,revision:1,decision:'approve',checks:{}})).data.error,'photo_checks_required');
  assert.equal((await post('/api/mod','mod',{id:reserved.id,revision:1,decision:'approve',checks})).status,200);
  assert.equal((await fetch(base+'/api/public-photo/'+reserved.id+'/display')).status,400,'Separate public disclosure is closed');
  await db.pool.query("update participant_permissions set public_disclosure=true where participant_id=$1 and capability='photo'",[a.id]);await db.pool.query('update runtime_controls set photo_publication_ready=true');
  response=await fetch(base+'/api/public-photo/'+reserved.id+'/display');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const sanitized=Buffer.from(await response.arrayBuffer());assert.equal(sanitized.includes(Buffer.from('PRIVATE METADATA')),false);
  const exported=await runtime.exportParent('parent',{participant:a.id});assert.equal(exported.images.length,1);assert.equal(exported.images[0].id,reserved.id);assert.ok(!JSON.stringify(exported).includes('token_hash'));
  await runtime.photo(a.token,'correct',{id:reserved.id,revision:1});assert.equal((await fetch(base+'/api/public-photo/'+reserved.id+'/display')).status,400);
  await assert.rejects(runtime.review('mod',{id:reserved.id,revision:1,decision:'approve',checks}),/photo_unavailable|photo_revision_conflict/);
  await runtime.cleanup();assert.equal((await readdir(dir)).filter(f=>f.endsWith('.jpg')).length,0);
  // A response lost after SQL commit must not delete the committed image blobs.
  await runtime.photo(a.token,'attest',{id:reserved.id,revision:2,attested:true});const originalCall=runtime.db.call.bind(runtime.db);let lose=true;runtime.db.call=async(name,args)=>{const result=await originalCall(name,args);if(name==='runtime_photo'&&args[1]==='complete'&&lose){lose=false;throw Error('simulated_response_loss');}return result;};await assert.rejects(runtime.upload(a.token,reserved.id,2,raw),/simulated_response_loss/);await runtime.upload(a.token,reserved.id,2,raw);runtime.db.call=originalCall;assert.equal((await readdir(dir)).filter(f=>f.endsWith('.jpg')).length,2);
  const originalRemove=store.remove.bind(store);let fail=true;store.remove=async key=>{if(fail)throw Error('simulated_storage_outage');return originalRemove(key);};
  await runtime.photo(a.token,'delete',{id:reserved.id});assert.equal((await runtime.cleanup()).failed,2);
  await assert.rejects(runtime.read(a.token,reserved.id),/photo_unavailable/);fail=false;await runtime.cleanup();assert.equal((await readdir(dir)).filter(f=>f.endsWith('.jpg')).length,0);
  const orphan=await runtime.photo(a.token,'reserve',{request:randomUUID(),attested:true,purpose:'packaging',kind:'product',ref:'mcnuggets'});const lostLease=await runtime.photo(a.token,'begin',{id:orphan.id,revision:1});
  await store.put(lostLease.thumb,sanitized);await store.put(lostLease.display,sanitized);await db.pool.query("update photo_upload_leases set expires_at=now()-interval '1 second' where evidence_id=$1",[orphan.id]);await runtime.photo(a.token,'delete',{id:orphan.id});fail=true;assert.equal((await runtime.cleanup()).failed,2);assert.equal((await db.pool.query('select status from photo_evidence where id=$1',[orphan.id])).rows[0].status,'deleting','Unfinalized upload bytes must be purged before erasure completes');fail=false;await runtime.cleanup();assert.equal((await readdir(dir)).filter(f=>f.endsWith('.jpg')).length,0);
  const pairing=await post('/api/pair','parent',{operation:'issue',participant:a.id});const redeemed=await post('/api/pair','',{operation:'redeem',code:pairing.data.code});assert.ok(redeemed.data.token);assert.equal((await post('/api/pair','',{operation:'redeem',code:pairing.data.code})).data.error,'pairing_unavailable');
  const job=await runtime.parent('parent','delete_account',{});assert.ok(job.job);await assert.rejects(runtime.action(a.token,randomUUID(),'my_wave_profile',{}),/participant_session_unavailable/);
  assert.deepEqual(await runtime.eraseAccounts(),{complete:1,failed:0});assert.equal((await db.pool.query('select count(*)::int n from auth.users where id=$1',[db.users[1]])).rows[0].n,0);
  assert.equal((await db.pool.query('select count(*)::int n from profiles where id=$1',[a.id])).rows[0].n,0);
 }finally{if(server)await new Promise(r=>server.close(r));if(worker)await new Promise(r=>worker.close(r));await rm(dir,{recursive:true,force:true});await db.close();}
});

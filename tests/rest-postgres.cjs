// Optional real PostgREST boundary test using cached Docker image and disposable local DB.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {promisify}=require('node:util');const {execFile}=require('node:child_process');
const {randomBytes,createHmac}=require('node:crypto');const exec=promisify(execFile);
test('real PostgREST checks JWT roles, profile columns, receipts and private table access',{
 skip:process.env.NUGGETFINDER_TEST_REST!=='1',timeout:30000
},async()=>{
 const {fixture}=require('./support/local-postgres.cjs');const db=await fixture();
 const name='nugget-rest-'+randomBytes(5).toString('hex');
 const secret=randomBytes(32).toString('hex');let started=false;
 try{
  const connection=new URL(db.url);connection.hostname='host.docker.internal';
  await exec('docker',['run','--detach','--rm','--name',name,'--publish','127.0.0.1::3000',
   '--env','PGRST_DB_URI','--env','PGRST_JWT_SECRET','--env','PGRST_DB_SCHEMAS=public','--env','PGRST_DB_ANON_ROLE=anon',
   'public.ecr.aws/supabase/postgrest:v16.3'],{env:{...process.env,PGRST_DB_URI:connection.href,PGRST_JWT_SECRET:secret}});started=true;
  const port=(await exec('docker',['port',name,'3000'])).stdout.trim().split(':').pop();const base='http://127.0.0.1:'+port;
  let ready=false;for(let i=0;i<70;i++){try{const response=await fetch(base);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true,'local PostgREST readiness');
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body=Buffer.from(JSON.stringify({role:'authenticated',sub:db.users[1],exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
  const token=header+'.'+body+'.'+createHmac('sha256',secret).update(header+'.'+body).digest('base64url');
  async function request(path,payload,authenticated=true){return fetch(base+path,{method:payload?'POST':'GET',headers:{...(authenticated?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});}
  assert.equal((await request('/profiles?select=id,handle',null,false)).status,200);
  assert.equal((await request('/profiles?select=banned',null,false)).status,401);
  assert.equal((await request('/profiles?select=banned')).status,403);
  assert.equal((await request('/price_entries?select=*')).status,403);
  assert.equal((await request('/rpc/moderation_inbox',{})).status,400);
  const payload={p_request:'00000000-0000-0000-0000-000000000099',p_kind:'product',p_ref:'mcnuggets',p_body:'Local REST test'};
  const first=await request('/rpc/submit_take_request',payload);assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.status,'pending');
  const repeated=await request('/rpc/submit_take_request',payload);assert.equal(repeated.status,200);assert.deepEqual(await repeated.json(),saved);
  const feed=await request('/rpc/take_cards',{},false);assert.deepEqual(await feed.json(),[]);
  assert.equal((await request('/rpc/submit_take_request',payload,false)).status,401);
  const mismatched=await request('/rpc/submit_take_request',{...payload,p_body:'Changed'});assert.equal(mismatched.status,400);
  const foreign=await request('/rpc/export_discovery_data',{p_user:db.users[2]});assert.equal(foreign.status,404);
 }finally{if(started)await exec('docker',['stop',name]);await db.close();}
});

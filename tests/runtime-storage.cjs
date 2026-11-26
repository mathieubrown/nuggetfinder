const {test}=require('node:test');const assert=require('node:assert/strict');const {promisify}=require('node:util');const {execFile}=require('node:child_process');const exec=promisify(execFile);const {createHmac,randomBytes,randomUUID}=require('node:crypto');const fs=require('node:fs');const {fixture}=require('./support/local-postgres.cjs');const {SupabaseBlobs}=require('../services/participation/runtime.cjs');
test('real isolated Supabase Storage denies browser access and accepts only server-side private JPEG variants',async()=>{
 const db=await fixture();const name='nf-storage-'+randomBytes(5).toString('hex');let running=false;
 const secret=randomBytes(48).toString('hex');const jwt=role=>{const head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),body=Buffer.from(JSON.stringify({role,iss:'supabase',exp:Math.floor(Date.now()/1000)+600,sub:db.users[1]})).toString('base64url');return head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
 try{
  await db.pool.query("do $$begin create role service_role nologin bypassrls;exception when duplicate_object then null;end$$;grant usage on schema public to service_role;");
  const dburl=new URL(db.url);dburl.hostname='host.docker.internal';
  await exec('docker',['run','--rm','--detach','--name',name,'--publish','127.0.0.1::5000','--tmpfs','/var/lib/storage:mode=1777','-e','DATABASE_URL='+dburl.href,'-e','AUTH_JWT_SECRET='+secret,'-e','PGRST_JWT_SECRET='+secret,'-e','ANON_KEY='+jwt('anon'),'-e','SERVICE_KEY='+jwt('service_role'),'-e','POSTGREST_URL=http://127.0.0.1:3000','-e','STORAGE_BACKEND=file','-e','FILE_STORAGE_BACKEND_PATH=/var/lib/storage','-e','GLOBAL_S3_BUCKET=local','-e','TENANT_ID=local','-e','REGION=local','-e','FILE_SIZE_LIMIT=1500000','-e','ENABLE_IMAGE_TRANSFORMATION=false','public.ecr.aws/supabase/storage-api:v1.98.6']);running=true;
  const port=(await exec('docker',['port',name,'5000'])).stdout.trim().split(':').pop();const base='http://127.0.0.1:'+port;let ready=false;
  for(let i=0;i<100;i++){try{const r=await fetch(base+'/status');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert.equal(ready,true,'Storage API readiness');
  await db.pool.query('grant usage on schema storage,auth to service_role;grant usage on schema storage to anon,authenticated;grant all on all tables in schema storage to service_role;grant all on all sequences in schema storage to service_role;grant select,insert,update,delete on storage.objects,storage.buckets to anon,authenticated;');
  await db.pool.query(fs.readFileSync('supabase/storage/private_evidence.sql','utf8'));
  // The adapter normally prefixes /storage/v1. Proxy fetch locally to the real service path.
  const native=global.fetch;global.fetch=(url,options)=>native(String(url).replace(base+'/storage/v1',base),options);
  try{
   const storage=new SupabaseBlobs({url:base,key:jwt('service_role'),bucket:'nugget-evidence-private'});const key=randomUUID();const bytes=Buffer.from('/9j/2Q==','base64');
   await storage.put(key,bytes);assert.deepEqual(await storage.get(key),bytes);
   for(const role of ['anon','authenticated']){
    const headers={Authorization:'Bearer '+jwt(role),'Content-Type':'image/jpeg'};
    assert.notEqual((await native(base+'/object/authenticated/nugget-evidence-private/'+key+'.jpg',{headers})).status,200);
    assert.notEqual((await native(base+'/object/nugget-evidence-private/'+randomUUID()+'.jpg',{method:'POST',headers,body:bytes})).status,200);
    const listing=await native(base+'/object/list/nugget-evidence-private',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"prefix":""}'});if(listing.ok)assert.deepEqual(await listing.json(),[]);
   }
   assert.notEqual((await native(base+'/object/public/nugget-evidence-private/'+key+'.jpg')).status,200);
   await storage.remove(key);await storage.remove(key);await assert.rejects(storage.get(key),/private_storage_unavailable/);
  }finally{global.fetch=native;}
 }finally{if(running)await exec('docker',['stop',name]);await db.close();}
});

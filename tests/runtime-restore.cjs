const {test}=require('node:test');const assert=require('node:assert/strict');const {randomBytes,randomUUID}=require('node:crypto');const {promisify}=require('node:util');const {spawn,execFile,execFileSync}=require('node:child_process');const exec=promisify(execFile);const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {Pool}=require(process.env.NUGGETFINDER_PG||'pg');const {fixture}=require('./support/local-postgres.cjs');const {provision}=require('./support/participant-fixture.cjs');const {Database,Runtime,LocalBlobs,containerProcessor}=require('../services/participation/runtime.cjs');const {verify}=require('../scripts/verify-release.cjs');
test('SQL and image backup restore replays independent deletion journal before reopening any capability',async()=>{
 const container=process.env.NUGGETFINDER_LOCAL_PG_CONTAINER;if(!container)throw Error('Set the isolated local PostgreSQL container name for restore testing');
 const db=await fixture(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'nf-restore-'));let restored,admin;const name='nf_restore_'+randomBytes(6).toString('hex');
 try{
  await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test_only',reviewed_at=now()");const a=await provision(db,db.users[1]),b=await provision(db,db.users[1]);
  const api=new Database(db.pool),blobs=new LocalBlobs(path.join(directory,'source'));
  const runtime=new Runtime({database:api,blobs,processImage:containerProcessor('nuggetfinder-photo:review'),auth:{async verify(){return {id:db.users[1],authenticatedAt:Date.now()};}}});
  const photo=await runtime.photo(a.token,'reserve',{request:randomUUID(),attested:true,purpose:'packaging',kind:'product',ref:'mcnuggets'});
  const python=process.env.NUGGETFINDER_PYTHON||path.resolve(__dirname,'../../photo-python/bin/python');const jpeg=execFileSync(python,['-c',"from PIL import Image;from io import BytesIO;import sys;b=BytesIO();Image.new('RGB',(100,100),'orange').save(b,'JPEG');sys.stdout.buffer.write(b.getvalue())"]);
  await runtime.upload(a.token,photo.id,1,jpeg);
  const dump=(await exec('docker',['exec',container,'pg_dump','--no-owner','--dbname',new URL(db.url).pathname.slice(1)],{maxBuffer:25*1024*1024})).stdout;
  await fs.cp(path.join(directory,'source'),path.join(directory,'backup'),{recursive:true});
  await runtime.parent('local','delete',{participant:a.id});await runtime.cleanup();assert.equal((await fs.readdir(path.join(directory,'source'))).length,0);
  const journal=(await db.pool.query('select subject_hash,kind,created_at from erasure_tombstones')).rows;
  const url=new URL(db.url);url.pathname='/postgres';admin=new Pool({connectionString:url.href});await admin.query('create database '+name);url.pathname='/'+name;restored=new Pool({connectionString:url.href});
  await new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','--dbname',name,'-v','ON_ERROR_STOP=1'],{stdio:['pipe','ignore','pipe']});let error='';p.stderr.on('data',c=>error+=c);p.on('error',reject);p.on('close',code=>code?reject(Error(error)):resolve());p.stdin.end(dump);});
  assert.equal((await restored.query('select count(*)::int n from participants where id=$1',[a.id])).rows[0].n,1,'Old snapshot contains deleted identity');
  for(const record of journal)await restored.query('insert into erasure_tombstones values($1,$2,$3) on conflict do nothing',[record.subject_hash,record.kind,record.created_at]);
  const recovered=new Runtime({database:new Database(restored),blobs:new LocalBlobs(path.join(directory,'backup')),auth:{},processImage:null});
  const replay=await recovered.db.call('runtime_replay_erasure',[]);assert.equal(replay.participants_erased,1);await recovered.cleanup();
  assert.equal((await restored.query('select count(*)::int n from participants where id=$1',[a.id])).rows[0].n,0);assert.equal((await restored.query('select count(*)::int n from participants where id=$1',[b.id])).rows[0].n,1);
  assert.equal((await fs.readdir(path.join(directory,'backup'))).length,0);assert.equal((await restored.query('select count(*)::int n from participation_readiness where enabled')).rows[0].n,0);
  const client=await restored.connect();try{assert.equal((await verify(client)).status,'PASS');}finally{client.release();}
 }finally{if(restored)await restored.end();if(admin){await admin.query('drop database '+name);await admin.end();}await db.close();await fs.rm(directory,{recursive:true,force:true});}
});

'use strict';
const {createHash,randomBytes,randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {mkdir,writeFile,readFile,unlink}=require('node:fs/promises');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error(code);};
class Database {
 constructor(pool){this.pool=pool;}
 async call(name,args){
  if(!['runtime_parent','runtime_action','runtime_photo','runtime_review_photos','runtime_photo_public','runtime_cleanup','runtime_erasure','runtime_group','runtime_catalog','runtime_pair','runtime_review_crew','runtime_read','runtime_rating','runtime_group_request','runtime_retention','runtime_replay_erasure','runtime_legacy_review','runtime_locations','runtime_review_locations','runtime_location_cache'].includes(name))fail('invalid_broker_call');
  for(let attempt=0;attempt<3;attempt++){
   const client=await this.pool.connect();let retry;
   try{await client.query('begin');await client.query('set local role nugget_broker');const result=await client.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') data',args);await client.query('commit');return result.rows[0].data;}
   catch(error){await client.query('rollback');if(!['40P01','40001'].includes(error.code)||attempt===2)throw error;retry=true;}
   finally{client.release();}
   if(retry)await new Promise(resolveRetry=>setTimeout(resolveRetry,25+Math.random()*75));
  }
 }
}
class LocalBlobs {
 constructor(directory){this.directory=resolve(directory);}
 key(key){if(!/^[a-f0-9-]{36}$/.test(key))fail('invalid_object_key');return resolve(this.directory,key+'.jpg');}
 async put(key,bytes){await mkdir(this.directory,{recursive:true,mode:0o700});await writeFile(this.key(key),bytes,{mode:0o600,flag:'wx'});}
 async get(key){return readFile(this.key(key));}
 async remove(key){try{await unlink(this.key(key));}catch(e){if(e.code!=='ENOENT')throw e;}}
}
// Uses private Supabase Storage over server-side HTTP. Never included in browser scripts.
class SupabaseBlobs {
 constructor({url,key,bucket}){
  const parsed=new URL(url);if((parsed.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(parsed.hostname))||!bucket||!key)fail('private_storage_configuration_required');
  this.url=parsed.origin;this.secret=key;this.bucket=bucket;
 }
 path(key){if(!/^[a-f0-9-]{36}$/.test(key))fail('invalid_object_key');return this.url+'/storage/v1/object/'+encodeURIComponent(this.bucket)+'/'+key+'.jpg';}
 async request(key,method,body){const url=method==='GET'?this.path(key).replace('/object/','/object/authenticated/'):this.path(key);const response=await fetch(url,{method,headers:{Authorization:'Bearer '+this.secret,apikey:this.secret,'Content-Type':'image/jpeg','x-upsert':'false'},body,signal:AbortSignal.timeout(15000)});if(!response.ok&&!(method==='DELETE'&&response.status===404))fail('private_storage_unavailable');return response;}
 async put(key,bytes){await this.request(key,'POST',bytes);}
 async get(key){const response=await this.request(key,'GET');return Buffer.from(await response.arrayBuffer());}
 async remove(key){this.path(key);const response=await fetch(this.url+'/storage/v1/object/'+encodeURIComponent(this.bucket),{method:'DELETE',headers:{Authorization:'Bearer '+this.secret,apikey:this.secret,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key+'.jpg']}),signal:AbortSignal.timeout(15000)});if(!response.ok)fail('private_storage_unavailable');}
}
function imageRunner(command,args){return async bytes=>{
 if(bytes.length>8*1024*1024)fail('file_size_limit');
 return new Promise((resolveResult,reject)=>{
  const child=spawn(command,args,{env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe'],cwd:resolve(__dirname,'../photo')});
  let output=[],size=0,done=false;const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('image_processing_timeout'));},10000);
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolveResult(result);}
  child.on('error',()=>finish(Error('image_processor_unavailable')));
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>5*1024*1024){child.kill('SIGKILL');finish(Error('image_output_limit'));}else output.push(chunk);});
  child.stderr.resume(); // Decoder details and user metadata never enter application logs.
  child.on('close',code=>{if(code!==0)return finish(Error('invalid_or_unsafe_image'));try{
   const result=JSON.parse(Buffer.concat(output));for(const v of Object.values(result.variants))v.bytes=Buffer.from(v.bytes,'base64');finish(null,result);
  }catch{finish(Error('invalid_processing_result'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({bytes:bytes.toString('base64')}));
 });
};}
function processor(python){return imageRunner(python,[resolve(__dirname,'../photo/worker.py')]);}
function containerProcessor(image){
 if(!/^[a-z0-9][a-z0-9/_.:@-]+$/.test(image))fail('invalid_worker_image');
 return async bytes=>{
  const name='nf-photo-'+randomUUID();
  try{return await imageRunner('docker',['run','--name',name,'--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','1','--pids-limit','32',image])(bytes);}
  finally{await new Promise(resolveCleanup=>{const cleanup=spawn('docker',['rm','-f',name],{stdio:'ignore'});cleanup.once('error',resolveCleanup);cleanup.once('close',resolveCleanup);});}
 };
}
// LOGIC-START: verified authentication is necessary but is not parental consent.
function requireRecentAuthentication(identity,now=Date.now()){
 if(!identity?.id||!Number.isFinite(identity.authenticatedAt)||now-identity.authenticatedAt>600000||identity.authenticatedAt>now+30000)fail('recent_sign_in_required');
 return identity.id;
}
// LOGIC-END
class SupabaseAuth {
 constructor({url,publishableKey,adminKey}){const parsed=new URL(url);if(parsed.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(parsed.hostname))fail('secure_auth_endpoint_required');this.url=parsed.origin;this.publishableKey=publishableKey;this.adminKey=adminKey;}
 async verify(token){
  const response=await fetch(this.url+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,apikey:this.publishableKey},signal:AbortSignal.timeout(10000)});
  if(!response.ok)fail('sign_in_required');const user=await response.json();let claims;
  try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{fail('sign_in_required');}
  // getUser validated this exact bearer token; reject a mismatched subject.
  if(claims.sub!==user.id)fail('sign_in_required');
  const at=Math.max(0,...(claims.amr||[]).filter(a=>['otp','magiclink','password','totp','mfa/totp','mfa/webauthn','mfa/recovery_code'].includes(a.method)).map(a=>Number(a.timestamp)||0));
  return {id:user.id,authenticatedAt:at*1000};
 }
 async removeUser(id){if(!this.adminKey)fail('server_auth_deletion_not_configured');const response=await fetch(this.url+'/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:'Bearer '+this.adminKey,apikey:this.adminKey},signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==404)fail('auth_deletion_unavailable');}
}
class Runtime {
 constructor({database,blobs,auth,processImage}){Object.assign(this,{db:database,blobs,auth,processImage});this.inflight=0;}
 async parent(token,operation,data={}){
  const account=requireRecentAuthentication(await this.auth.verify(token));
  const allowed=['list','request_consent','create','session','pause','revoke','delete','export','delete_account','photo_read','renew','requests','export_account','resume'];if(!allowed.includes(operation))fail('invalid_parent_operation');
  const secret=operation==='session'?randomBytes(32).toString('base64url'):null;
  const result=await this.db.call('runtime_parent',[account,operation,{...data,...(secret?{token_hash:hash(secret)}:{})}]);
  return secret?{...result,token:secret}:result;
 }
 async action(token,request,operation,data){return this.db.call('runtime_action',[hash(token),request,operation,data]);}
 async photo(token,operation,data){return this.db.call('runtime_photo',[hash(token),operation,data]);}
 async upload(token,id,revision,bytes,preclaimedLease=null){
  if(this.inflight>=2)fail('processor_busy');this.inflight++;
  let lease,completed=false;
  try{
   lease=preclaimedLease||await this.photo(token,'begin',{id,revision});
   if(lease.already)return {id,status:lease.status,revision:lease.revision};
   const result=await this.processImage(bytes);
   for(const name of ['thumb','display']){
    const variant=result.variants[name];if(!variant||variant.mime!=='image/jpeg'||variant.bytes.length>1500000||!variant.bytes.length)fail('invalid_processing_result');
    await this.blobs.put(lease[name],variant.bytes);
   }
   const metadata=name=>({width:result.variants[name].width,height:result.variants[name].height,bytes:result.variants[name].bytes.length});
   const response=await this.photo(token,'complete',{id,revision,lease:lease.lease,processor:result.processor_version,digest:hash(result.variants.display.bytes),thumb:metadata('thumb'),display:metadata('display')});
   completed=true;return response;
  }finally{
   this.inflight--;
   // On an uncertain completion response leave lease objects for SQL-guided cleanup.
   // Deleting here could erase a committed image after a network response was lost.
   if(lease&&!completed){/* Cleanup scan will inspect the durable lease after expiry. */}
  }
 }
 async read(token,id,variant='display'){const data=await this.photo(token,'read',{id,variant});if(!data?.key)fail('photo_unavailable');const bytes=await this.blobs.get(data.key);const current=await this.photo(token,'read',{id,variant});if(current?.key!==data.key)fail('photo_unavailable');return bytes;}
 async publicPhoto(id,variant){const data=await this.db.call('runtime_photo_public',[id,variant]);if(!data?.key)fail('photo_unavailable');const bytes=await this.blobs.get(data.key);const current=await this.db.call('runtime_photo_public',[id,variant]);if(current?.key!==data.key)fail('photo_unavailable');return bytes;}
 async review(token,{id=null,revision=null,decision=null,checks={}}={}){const account=requireRecentAuthentication(await this.auth.verify(token));return this.db.call('runtime_review_photos',[account,id,revision,decision,checks]);}
 async preview(token,id){const data=await this.review(token,{id,decision:'preview'});if(!data?.key)fail('photo_unavailable');return this.blobs.get(data.key);}
 async cleanup(){
  await this.db.call('runtime_retention',[]);
  const keys=await this.db.call('runtime_cleanup',['scan',null]);let purged=0,failed=0;
  for(const key of keys){try{await this.blobs.remove(key);await this.db.call('runtime_cleanup',['ack',key]);purged++;}catch{failed++;try{await this.db.call('runtime_cleanup',['fail',key]);}catch{}}}
  await this.db.call('runtime_cleanup',['finish',null]);return {purged,failed};
 }
 async eraseAccounts(){
  if(typeof this.auth?.removeUser!=='function'||this.auth instanceof SupabaseAuth&&!this.auth.adminKey)fail('server_auth_deletion_not_configured');
  const jobs=await this.db.call('runtime_erasure',['list',null]);let complete=0,failed=0;
  for(const job of jobs){try{
   await this.db.call('runtime_erasure',['sql_delete',job.id]);
   await this.cleanup();if(!(await this.db.call('runtime_erasure',['ready',job.id])).ready)throw Error('blob_erasure_pending');
   await this.auth.removeUser(job.account);
   await this.db.call('runtime_erasure',['complete',job.id]);complete++;
  }catch{failed++;}}
  return {complete,failed};
 }
 async exportParent(token,data){
  const result=await this.parent(token,'export',data);const images=[];
  const photos=(result.photos||[]).filter(p=>['pending','approved'].includes(p.status));const offset=Number(data.image_offset||0);if(!Number.isInteger(offset)||offset<0)fail('invalid_export_offset');
  for(const photo of photos.slice(offset,offset+10)){
   const descriptor=await this.parent(token,'photo_read',{participant:data.participant,id:photo.id,variant:'display'});
   if(descriptor?.key)images.push({id:photo.id,mime:'image/jpeg',bytes:(await this.blobs.get(descriptor.key)).toString('base64')});
  }return {...result,images,next_image_offset:offset+10<photos.length?offset+10:null};
 }
}
module.exports={Database,LocalBlobs,SupabaseBlobs,SupabaseAuth,Runtime,processor,containerProcessor,hash,requireRecentAuthentication};

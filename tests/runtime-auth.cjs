const {test}=require('node:test');const assert=require('node:assert/strict');const {promisify}=require('node:util');const {execFile}=require('node:child_process');const exec=promisify(execFile);const {createHmac,randomBytes}=require('node:crypto');const {fixture}=require('./support/local-postgres.cjs');const {Database,SupabaseAuth,requireRecentAuthentication}=require('../services/participation/runtime.cjs');
test('real isolated Supabase Auth validates parent sessions, rejects forgery and deletes accounts through the admin API',async()=>{
 const name='nf-auth-'+randomBytes(5).toString('hex'),secret=randomBytes(48).toString('hex');let running=false,base;
 const jwt=role=>{const a=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),b=Buffer.from(JSON.stringify({role,iss:'supabase',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');return a+'.'+b+'.'+createHmac('sha256',secret).update(a+'.'+b).digest('base64url');};
 const closeEnvironment=async()=>{if(running){running=false;await exec('docker',['rm','-f',name]);}};
 const db=await fixture({closeEnvironment,async authBootstrap(pool,url){
  await pool.query('create schema auth');
  const database=new URL(url);database.hostname='host.docker.internal';database.searchParams.set('search_path','auth,public');
  await exec('docker',['run','--detach','--name',name,'--publish','127.0.0.1::9999','-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999','-e','API_EXTERNAL_URL=http://localhost:9999','-e','GOTRUE_SITE_URL=http://nugget.test','-e','GOTRUE_DB_DRIVER=postgres','-e','GOTRUE_DB_DATABASE_URL='+database.href,'-e','GOTRUE_JWT_SECRET='+secret,'-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_AUD=authenticated','-e','GOTRUE_JWT_EXP=3600','-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','-e','GOTRUE_MAILER_AUTOCONFIRM=true','-e','GOTRUE_DISABLE_SIGNUP=true','public.ecr.aws/supabase/gotrue:v2.198.0']);running=true;
  const port=(await exec('docker',['port',name,'9999'])).stdout.trim().split(':').pop();base='http://127.0.0.1:'+port;
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}if(!ready){const logs=await exec('docker',['logs','--tail','10',name]);throw Error((logs.stdout+logs.stderr).replaceAll(secret,'[local secret]'));}
 }});
 try{
  const password=randomBytes(24).toString('base64url'),email='isolated-parent@example.invalid';const admin=jwt('service_role');
  let response=await fetch(base+'/admin/users',{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(response.status,200);const user=await response.json();
  response=await fetch(base+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);const session=await response.json();
  const native=global.fetch;global.fetch=(url,options)=>native(String(url).replace(base+'/auth/v1',base),options);
  try{
   const auth=new SupabaseAuth({url:base,publishableKey:jwt('anon'),adminKey:admin});const identity=await auth.verify(session.access_token);assert.equal(requireRecentAuthentication(identity),user.id);
   const pieces=session.access_token.split('.');pieces[2]=(pieces[2][0]==='A'?'B':'A')+pieces[2].slice(1);await assert.rejects(auth.verify(pieces.join('.')),/sign_in_required/);
   const api=new Database(db.pool);await db.pool.query('insert into account_invitations(account_id) values($1)',[identity.id]);const receipt=await api.call('runtime_parent',[identity.id,'request_consent',{}]);assert.equal((await db.pool.query('select status from consent_requests where id=$1',[receipt.id])).rows[0].status,'pending');
   await assert.rejects(api.call('runtime_parent',[identity.id,'create',{receipt:receipt.id,pseudonym:'local_parent'}]),/verified_consent_required/);
   const linkResponse=await native(base+'/admin/generate_link',{method:'POST',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email,redirect_to:'http://nugget.test/crew.html'})});assert.equal(linkResponse.status,200);const link=await linkResponse.json();assert.equal(typeof link.hashed_token,'string');
   const verified=await native(base+'/verify?type=magiclink&token='+encodeURIComponent(link.hashed_token)+'&redirect_to='+encodeURIComponent('http://nugget.test/crew.html'),{redirect:'manual'});assert.equal(verified.status,303);const location=new URL(verified.headers.get('location'));const magicToken=new URLSearchParams(location.hash.slice(1)).get('access_token');assert.equal(requireRecentAuthentication(await auth.verify(magicToken)),user.id);
   await auth.removeUser(user.id);assert.equal((await db.pool.query('select count(*)::int n from profiles where id=$1',[user.id])).rows[0].n,0);await assert.rejects(auth.verify(session.access_token),/sign_in_required/);
  }finally{global.fetch=native;}
 }finally{await db.close();}
});

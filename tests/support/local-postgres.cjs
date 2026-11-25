const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {Pool}=require(process.env.NUGGETFINDER_PG || 'pg');
const users=[1,2,3,4].map(n=>'00000000-0000-0000-0000-00000000000'+n);
async function fixture(options={}) {
 const url=new URL(process.env.NUGGETFINDER_LOCAL_PG_URL || '');
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Only an isolated local PostgreSQL server is allowed');
 const admin=new Pool({connectionString:url.href});
 const name='nugget_test_'+randomBytes(6).toString('hex');
 await admin.query('create database '+name);
 url.pathname='/'+name;
 const pool=new Pool({connectionString:url.href,max:20});
 try {
 // Simulate the broad legacy grants that can exist in Supabase projects.
 await pool.query(`do $$ begin create role anon; exception when duplicate_object then null; end $$;
 do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
 grant usage on schema public to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated;
 create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
 create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
 const dir=path.join(__dirname,'../../supabase/migrations');
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
  if(options.beforeMigration)await options.beforeMigration(file,pool);
  await pool.query(fs.readFileSync(path.join(dir,file),'utf8'));
  if(file==='20261115000900_profile_read_grants.sql' && options.seedLegacy)await options.seedLegacy(pool);
 }
 for(let i=0;i<users.length;i++)await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}',$2)`,[users[i],'local'+i+'@example.test']);
 await pool.query('update public.profiles set is_moderator=true where id=$1',[users[0]]);
 }catch(error){await pool.end();await admin.query('drop database '+name);await admin.end();throw error;}
 async function actor(index,sql,params=[]) {
  const client=await pool.connect();
  try {
   await client.query('begin');
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[index===null?'':typeof index==='string'?index:users[index]]);
   await client.query('set local role '+(index===null?'anon':'authenticated'));
   const result=await client.query(sql,params);await client.query('commit');return result;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
 return {pool,actor,users,url:url.href,async close(){await pool.end();await admin.query('drop database '+name);await admin.end();}};
}
module.exports={fixture,users};

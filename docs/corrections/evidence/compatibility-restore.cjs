// Local synthetic upgrade/restore rehearsal only. No production connections or data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {promisify}=require('node:util'),{execFile,spawn}=require('node:child_process'),exec=promisify(execFile);
const {fixture}=require('../../../tests/support/local-postgres.cjs');
(async()=>{const db=await fixture();const {pool,actor,users}=db;const result={};let target;
try{
 result.oldApi={};
 await actor(1,"select public.submit_report('node/1229920544','yes',false)");
 result.oldApi.submit_report='PASS';
 await actor(2,"select public.submit_stock_report('mcnuggets','node/1229920544','seen')");result.oldApi.submit_stock_report='PASS';
 const status=(await actor(1,"select public.submit_take('product','mcnuggets','Local old client take') status")).rows[0].status;assert.equal(status,'pending');result.oldApi.submit_take=status;
 const id=(await pool.query('select id from public.moderation_queue limit 1')).rows[0].id;await actor(0,"select public.review_content($1,'approve')",[id]);
 result.oldApi.community_feed=(await actor(null,"select * from public.community_feed('hot')")).rowCount;
 await actor(1,"select public.respond_take(1,'with')").then(()=>{throw Error('Own reaction unexpectedly allowed');},error=>assert.match(error.message,/cannot_react/));
 await actor(2,"select public.vote_beef('cane-vs-cfa','left')");result.oldApi.beef_matchups=(await actor(null,"select * from public.beef_matchups('cane-vs-cfa')")).rows;
 for(const name of ['export_my_data','export_wave2_take_data','export_beef_data']){await actor(1,'select public.'+name+'()');result.oldApi[name]='PASS';}
 result.oldApi.profiles=(await actor(1,'select handle,handle_set from public.profiles where id=$1',[users[1]])).rowCount;
 result.oldApi.product_stock=(await actor(null,"select * from public.product_stock('mcnuggets')")).rows;
 // Include the corrected feature data, not only empty added tables.
 const caseId=(await pool.query("insert into public.court_cases(author_id,food_name,argument,status,opened_at,closes_at) values($1,'Local restore Court','Synthetic restore fixture','published',now()-interval '8 days',now()-interval '1 day') returning id",[users[0]])).rows[0].id;
 await pool.query("insert into public.court_votes(case_id,user_id,verdict,updated_at) values($1,$2,'nugget',now()-interval '2 days')",[caseId,users[1]]);
 await actor(0,'select public.record_court_ruling($1)',[caseId]);
 await actor(0,"select public.record_court_ruling($1,1,'{}','clerical_correction','Local restored audit note.')",[caseId]);
 await actor(1,"select public.submit_price('node/1229920544','mcnuggets',9.99,20,'piece')");
 await actor(2,"select public.submit_price('node/1229920544','mcnuggets',8.99,20,'piece')");
 await actor(1,"select public.submit_take_request('00000000-0000-0000-0000-000000000099','product','mcnuggets','Local restored receipt')");
 await pool.query("insert into public.vote_history_holds(user_id,expires_at) values($1,now()+interval '1 hour')",[users[3]]);
 const tables=(await pool.query("select tablename from pg_tables where schemaname in ('public','auth') order by schemaname,tablename")).rows;
 async function digest(client){const output={};for(const {tablename} of tables){const schema=tablename==='users'?'auth':'public';output[schema+'.'+tablename]=(await client.query('select count(*)::int n,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,\'[]\')) digest from '+schema+'."'+tablename+'" t')).rows[0];}return output;}
 const before=await digest(pool);const source=new URL(db.url).pathname.slice(1);
 const dump=(await exec('docker',['exec','nuggetfinder-corrections-20261125','pg_dump','-U','postgres','-d',source,'--format=custom'],{encoding:'buffer',maxBuffer:20*1024*1024})).stdout;
 target='nugget_restore_'+Date.now();await pool.query('create database '+target);
 await new Promise((resolve,reject)=>{const child=spawn('docker',['exec','-i','nuggetfinder-corrections-20261125','pg_restore','-U','postgres','--dbname',target,'--no-owner','--exit-on-error']);let errors='';child.stderr.on('data',d=>errors+=d);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(errors)));child.stdin.end(dump);});
 const {Pool}=require(process.env.NUGGETFINDER_PG);const connection=new URL(db.url);connection.pathname='/'+target;const restored=new Pool({connectionString:connection.href});
 try{assert.deepEqual(await digest(restored),before);
 const aclSQL="select tablename,rowsecurity,has_table_privilege('anon','public.'||quote_ident(tablename),'SELECT') anon_select,has_table_privilege('authenticated','public.'||quote_ident(tablename),'INSERT,UPDATE,DELETE,TRUNCATE') member_write from pg_tables where schemaname='public' order by tablename";
 assert.deepEqual((await restored.query(aclSQL)).rows,(await pool.query(aclSQL)).rows);
 const sequenceSQL="select schemaname,sequencename,last_value from pg_sequences where schemaname='public' order by sequencename";assert.deepEqual((await restored.query(sequenceSQL)).rows,(await pool.query(sequenceSQL)).rows);
 result.restore={status:'PASS',source:'synthetic local PostgreSQL fixture',tablesCompared:tables.length,archiveBytes:dump.length,rowCountsAndLogicalDigestsMatch:true,tableGrantsAndRLSMatch:true,sequenceValuesMatch:true,note:'Not a production backup/restore. Managed Auth, external storage and production roles/configuration are not reproduced.'};}finally{await restored.end();}
 result.catalog=(await pool.query('select (select count(*)::int from products) products,(select count(*)::int from places) places,(select count(*)::int from place_products) links')).rows[0];
 fs.writeFileSync(path.join(__dirname,'compatibility-restore.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{if(target)await pool.query('drop database '+target);await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

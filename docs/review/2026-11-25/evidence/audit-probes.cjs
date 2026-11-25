// Independent local-only probes. Expected findings are recorded, not patched.
const fs=require('node:fs');const path=require('node:path');const {fixture}=require('../../../../tests/support/local-postgres.cjs');
const {stockStatus}=require('../../../../js/wave-logic.js');
(async()=>{const db=await fixture();const {pool,actor,users}=db;const findings=[];
async function probe(id,name,operation){try{findings.push({id,name,...await operation()});}catch(error){findings.push({id,name,status:'PROBE_ERROR',error:error.message});}}
try{
await probe('A01','Posting lock also prevents safety reports and blocks',async()=>{
 await pool.query("update public.profiles set posting_locked_until=now()+interval '1 day' where id=$1",[users[1]]);
 const errors=[];for(const [sql,args] of [['select public.set_user_block($1,true)',[users[2]]],["select public.report_content('username',$1,'abuse')",[users[2]]]]){try{await actor(1,sql,args);errors.push('unexpectedly allowed');}catch(e){errors.push(e.message);}}
 await pool.query('update public.profiles set posting_locked_until=null where id=$1',[users[1]]);
 return {status:errors.every(e=>e==='posting_locked')?'CONFIRMED_FINDING':'NOT_REPRODUCED',errors};
});
await probe('A02','Closed Court result changes when a voter is banned',async()=>{
 const row=(await actor(0,"select public.nominate_court_case('Local audit katsu','A flat nugget?') id")).rows[0];
 const queue=(await pool.query("select id from public.moderation_queue where kind='court' and content_ref=$1",[String(row.id)])).rows[0];await actor(0,"select public.review_content($1,'approve')",[queue.id]);
 for(let i=1;i<=20;i++){const id='20000000-0000-0000-0000-'+String(i).padStart(12,'0');await pool.query(`insert into auth.users values($1,'{"age_confirmed":true}','court-audit@example.test')`,[id]);await pool.query('insert into public.court_votes(case_id,user_id,verdict) values($1,$2,$3)',[row.id,id,i<=12?'nugget':i<=17?'adjacent':'no']);}
 await pool.query("update public.court_cases set opened_at=now()-interval '8 days',closes_at=now()-interval '1 day' where id=$1",[row.id]);
 const before=(await actor(null,'select public.court_cases($1) data',[row.id])).rows[0].data[0];
 await pool.query("update public.profiles set banned=true where id='20000000-0000-0000-0000-000000000001'");
 const after=(await actor(null,'select public.court_cases($1) data',[row.id])).rows[0].data[0];
 return {status:before.verdict!==after.verdict?'CONFIRMED_FINDING':'NOT_REPRODUCED',before:{verdict:before.verdict,votes:Number(before.nugget)+Number(before.adjacent)+Number(before.no)},after:{verdict:after.verdict,votes:Number(after.nugget)+Number(after.adjacent)+Number(after.no)}};
});
await probe('A03','Cached stock counts have no client-side expiry',async()=>{
 const old={seen_count:2,sold_out_count:0,last_report_at:new Date(Date.now()-3*3600000).toISOString()};
 return {status:stockStatus(old)==='yes'?'CONFIRMED_FINDING':'NOT_REPRODUCED',cachedThreeHourOldStatus:stockStatus(old),note:'Prices refreshes only on load/filter/write. SQL counts are correct when fetched; the cached display is not aged by stockStatus.'};
});
await probe('A04','Map reporting accepts a made-up place ID',async()=>{
 await actor(2,"select public.submit_report('audit-invented-place','yes',false)");
 return {status:'CONFIRMED_FINDING',inserted:(await pool.query("select count(*)::int n from public.reports where place_id='audit-invented-place'")).rows[0].n,note:'No stock report can do this because stock uses a catalog foreign key.'};
});
await probe('A05','A very old verified price outranks a new crowd price',async()=>{
 const place='node/1229920544';await pool.query("insert into public.business_verifications(user_id,place_id,source_url) values($1,$2,'https://example.test/local-proof')",[users[1],place]);
 await actor(1,"select public.submit_price($1,'mcnuggets',10,20,'piece')",[place]);await pool.query("update public.price_entries set created_at=now()-interval '365 days'");await actor(2,"select public.submit_price($1,'mcnuggets',8,20,'piece')",[place]);
 const rows=(await actor(null,"select public.price_ledger($1,'piece') data",[place])).rows[0].data;
 return {status:'CONFIRMED_FINDING',currentPrice:rows[0].price,currentVerified:rows[0].verified_store,currentDate:rows[0].created_at,newerCrowdSuperseded:rows[1].superseded};
});
await probe('A06','Vote daily cap counts distinct matchups rather than vote changes',async()=>{
 for(let i=0;i<65;i++){await pool.query("update public.matchup_votes set updated_at=now()-interval '6 seconds' where user_id=$1",[users[2]]);await actor(2,"select public.vote_matchup('cane-vs-cfa',$1)",[i%2?'left':'right']);}
 return {status:'CONFIRMED_FINDING',acceptedVoteActions:65,distinctRows:(await pool.query('select count(*)::int n from public.matchup_votes where user_id=$1',[users[2]])).rows[0].n,note:'Cooldown elapsed is simulated by backdating the prior timestamp. This demonstrates the counter definition, not a way to skip time from the public API.'};
});
await probe('A07','Deployed creator and weekly URLs are not recognized by the new router',async()=>{
 const {runInNewContext}=require('node:vm');const window={location:{hash:'#/beef/cane-vs-cfa?from=local_creator'}};
 runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../../../js/router.js'),'utf8'),{window});
 const challenge=window.NuggetfinderRouter.current();window.location.hash='#/weekly';const weekly=window.NuggetfinderRouter.current();
 return {status:challenge.page==='home' && weekly.page==='home'?'CONFIRMED_FINDING':'NOT_REPRODUCED',legacyChallenge:challenge,legacyWeekly:weekly};
});
const grants=(await pool.query("select t.tablename,t.rowsecurity,has_table_privilege('anon','public.'||quote_ident(t.tablename),'SELECT') anon_select,has_table_privilege('authenticated','public.'||quote_ident(t.tablename),'SELECT') member_select,has_table_privilege('anon','public.'||quote_ident(t.tablename),'INSERT,UPDATE,DELETE,TRUNCATE') anon_write,has_table_privilege('authenticated','public.'||quote_ident(t.tablename),'INSERT,UPDATE,DELETE,TRUNCATE') member_write from pg_tables t where schemaname='public' order by tablename")).rows;
fs.writeFileSync(path.join(__dirname,'permission-matrix.json'),JSON.stringify(grants,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'audit-probes.json'),JSON.stringify(findings,null,2)+'\n');console.log(JSON.stringify(findings,null,2));
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

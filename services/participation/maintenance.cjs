// Isolated local maintenance rehearsal. Production wiring needs separate release approval.
const {Pool}=require(process.env.NUGGETFINDER_PG||'pg');const {Database,LocalBlobs,Runtime,SupabaseAuth}=require('./runtime.cjs');
async function main(){
 const url=new URL(process.env.NUGGETFINDER_LOCAL_PG_URL||'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('local_database_required');
 const authUrl=process.env.NUGGETFINDER_LOCAL_AUTH_URL;
 if(authUrl&&!['localhost','127.0.0.1','[::1]'].includes(new URL(authUrl).hostname))throw Error('local_auth_required');
 const pool=new Pool({connectionString:url.href});
 const runtime=new Runtime({database:new Database(pool),blobs:new LocalBlobs(process.env.NUGGETFINDER_LOCAL_BLOBS||'/tmp/nuggetfinder-private-blobs'),auth:authUrl?new SupabaseAuth({url:authUrl,publishableKey:process.env.NUGGETFINDER_LOCAL_PUBLISHABLE_KEY,adminKey:process.env.NUGGETFINDER_LOCAL_ADMIN_KEY}):{},processImage:null});
 try{const cleanup=await runtime.cleanup();let erasure={status:'auth_not_configured'};if(authUrl&&process.env.NUGGETFINDER_LOCAL_ADMIN_KEY)erasure=await runtime.eraseAccounts();console.log(JSON.stringify({cleanup,erasure}));if(cleanup.failed||erasure.failed)process.exitCode=1;}finally{await pool.end();}
}
main().catch(()=>{console.error('maintenance_failed');process.exitCode=1;});

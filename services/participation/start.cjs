// Isolated development entry point. Never contacts production Supabase.
const path=require('node:path');const {Pool}=require(process.env.NUGGETFINDER_PG||'pg');
const {Database,LocalBlobs,Runtime,processor}=require('./runtime.cjs');const {createServer}=require('./server.cjs');
const url=new URL(process.env.NUGGETFINDER_LOCAL_PG_URL||'');if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local database required');
const {remoteProcessor}=require('./image-worker.cjs');
const pool=new Pool({connectionString:url.href});
const runtime=new Runtime({database:new Database(pool),blobs:new LocalBlobs(process.env.NUGGETFINDER_LOCAL_BLOBS||'/tmp/nuggetfinder-private-blobs'),processImage:process.env.NUGGETFINDER_WORKER_SOCKET?remoteProcessor({socketPath:process.env.NUGGETFINDER_WORKER_SOCKET,token:process.env.NUGGETFINDER_WORKER_SECRET}):async()=>{throw Error('isolated_worker_not_configured');},auth:{async verify(){throw Error('parent_auth_not_configured');}}});
const port=Number(process.env.PORT||4174);const server=createServer({runtime,root:path.resolve(__dirname,'../..'),origins:['http://127.0.0.1:'+port,'http://localhost:'+port]});
server.listen(port,'127.0.0.1',()=>console.log('Isolated participation preview on http://127.0.0.1:'+port));
async function close(){server.close();await pool.end();}process.on('SIGINT',close);process.on('SIGTERM',close);

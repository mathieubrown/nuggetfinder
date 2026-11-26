'use strict';
const path = require('node:path');
const {Pool} = require(process.env.NUGGETFINDER_PG || 'pg');
const {Database, LocalBlobs, SupabaseBlobs, SupabaseAuth, Runtime} = require('./runtime.cjs');
const {createServer} = require('./server.cjs');
const {remoteProcessor} = require('./image-worker.cjs');
const {MapTiles} = require('./map-tiles.cjs');

function config(env) {
  const pg = new URL(env.NUGGETFINDER_LOCAL_PG_URL || '');
  if (!['127.0.0.1','localhost','[::1]'].includes(pg.hostname)) throw Error('isolated_database_required');
  const auth = env.NUGGETFINDER_LOCAL_AUTH_URL ? new URL(env.NUGGETFINDER_LOCAL_AUTH_URL) : null;
  if (auth && !['127.0.0.1','localhost','[::1]'].includes(auth.hostname)) throw Error('isolated_auth_required');
  if (auth && !env.NUGGETFINDER_LOCAL_PUBLISHABLE_KEY) throw Error('auth_publishable_key_required');
  if (!env.NUGGETFINDER_BROWSER_ASSETS) throw Error('local_map_assets_required');
  if (!env.NUGGETFINDER_LOCAL_BLOBS) throw Error('isolated_blob_directory_required');
  const port = Number(env.PORT || 4176);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('invalid_port');
  return {pg,auth,port,env};
}

function start({pg,auth,port,env}) {
  const pool = new Pool({connectionString:pg.href,max:10});
  const database = new Database(pool);
  const authConfig = auth ? {url:auth.origin,publishableKey:env.NUGGETFINDER_LOCAL_PUBLISHABLE_KEY} : null;
  const identity = auth ? new SupabaseAuth({...authConfig,adminKey:env.NUGGETFINDER_LOCAL_ADMIN_KEY}) :
    {async verify(){throw Error('parent_auth_not_configured');}};
  const blobs = auth && env.NUGGETFINDER_LOCAL_STORAGE_KEY
    ? new SupabaseBlobs({url:auth.origin,key:env.NUGGETFINDER_LOCAL_STORAGE_KEY,bucket:'nugget-evidence-private'})
    : new LocalBlobs(env.NUGGETFINDER_LOCAL_BLOBS);
  const processImage = env.NUGGETFINDER_WORKER_SOCKET
    ? remoteProcessor({socketPath:env.NUGGETFINDER_WORKER_SOCKET,token:env.NUGGETFINDER_WORKER_SECRET})
    : async()=>{throw Error('isolated_worker_not_configured');};
  const runtime = new Runtime({database,auth:identity,blobs,processImage});
  const root = path.resolve(__dirname,'../..');
  const server = createServer({runtime,root,scopedApp:true,assets:env.NUGGETFINDER_BROWSER_ASSETS,authConfig,
    origins:['http://127.0.0.1:'+port,'http://localhost:'+port],
    mapTiles:new MapTiles({directory:path.join(env.NUGGETFINDER_LOCAL_BLOBS,'map-cache'),enabled:env.NUGGETFINDER_LOCAL_MAP_TILES==='1'})});
  let maintenance = null;
  async function runMaintenance() {
    const lock = await pool.connect();
    try {
      const {rows:[{acquired}]} = await lock.query('select pg_try_advisory_lock(2147483000,42) as acquired');
      if (!acquired) return;
      try {
        const result = await runtime.cleanup();
        const erasure = auth && env.NUGGETFINDER_LOCAL_ADMIN_KEY ? await runtime.eraseAccounts() : {complete:0,failed:0};
        console.log(JSON.stringify({event:'isolated_maintenance',purged:result.purged,blob_failures:result.failed,accounts_erased:erasure.complete,account_failures:erasure.failed}));
      } finally { await lock.query('select pg_advisory_unlock(2147483000,42)'); }
    } finally { lock.release(); }
  }
  const timer = setInterval(() => {
    if(!maintenance) maintenance=runMaintenance().catch(()=>console.error('isolated_maintenance_failed')).finally(()=>{maintenance=null;});
  },60_000);
  server.listen(port,'127.0.0.1',()=>console.log('Isolated service at http://127.0.0.1:'+port));
  async function close() {
    clearInterval(timer);
    await new Promise(resolve=>server.close(resolve));
    await maintenance;
    await pool.end();
  }
  return {server,close,runMaintenance};
}

if(require.main===module){
  try {
    const service=start(config(process.env));
    for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>service.close().catch(()=>{process.exitCode=1;}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={config,start};

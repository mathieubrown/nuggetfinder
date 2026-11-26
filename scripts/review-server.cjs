'use strict';
// Disposable, loopback-only product review. NEVER a production server or consent verifier.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {fixture}=require('../tests/support/local-postgres.cjs');
const {provision}=require('../tests/support/participant-fixture.cjs');
const {Database,LocalBlobs,Runtime,containerProcessor}=require('../services/participation/runtime.cjs');
const {MapTiles}=require('../services/participation/map-tiles.cjs');
const {PlaceSearch}=require('../services/participation/place-search.cjs');
const {createServer}=require('../services/participation/server.cjs');
const root=path.resolve(__dirname,'..');
const features=[['/index.html#/activity','Submission status'],['/index.html#/suggest-product','Suggest product or listing'],['/index.html#/business','Business access'],['/index.html#/map-search','Search public places'],['/index.html#/add-place','Add a place'],['/index.html#/','Map & stores'],['/index.html#/products','Products & where to buy'],['/index.html#/feed','Feed & swipe'],['/index.html#/take','Take composer'],['/index.html#/showdown','Showdowns'],['/index.html#/court','Nugget Court'],['/index.html#/prices','Prices'],['/index.html#/me','Profile & stickers'],['/index.html#/badges','Badges'],['/index.html#/lists','Saved lists'],['/index.html#/field-guide','Field Guide'],['/index.html#/trails','Trails'],['/index.html#/trail-builder','Build a trail'],['/index.html#/nominate','Nominate a Court case'],['/index.html#/taste','Taste profiles'],['/index.html#/weekly-winners','Weekly results'],['/crew.html#parents','Family & parent controls'],['/crew.html#photos','Food photo upload'],['/crew.html#crew','Private crews & challenges'],['/crew.html#takes','Protected public takes'],['/index.html#/mod','Text & Court moderation'],['/crew.html#mod','Photo & crew moderation'],['/index.html#/account','Account & exports'],['/index.html#/strikes','Strikes & appeals'],['/index.html#/terms','Draft terms'],['/index.html#/privacy','Draft privacy'],['/index.html#/dmca','Draft DMCA'],['/review','Build inventory & gaps']];
const toolbar='<details id="reviewControls"><summary>REVIEW BUILD · All screens &amp; test players</summary><div class="review-options"><label>Open a screen<select data-feature><option value="">Choose a screen</option>'+features.map(([url,label])=>'<option value="'+url+'">'+label+'</option>').join('')+'</select></label><label>Test identity<select data-role><option value="a">Player A / family controls</option><option value="b">Player B / family controls</option><option value="mod">Moderator</option><option data-unified-role value="business">Adult business tester</option></select></label><button data-signin>Reconnect test identity</button><button data-controls hidden>Open role controls</button><a href="/review">What works &amp; what is unfinished</a></div><p>Local review only. Synthetic sign-ins, consent and contributions. Use a test player to try the app. Nothing here changes production.</p></details>';
function html(bytes,crew=false,unified=false){let source=bytes.toString();source=source.replace(/<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g,'');source=source.replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css','/review-assets/leaflet.css').replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js','/review-assets/leaflet.js').replace('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js','/review-assets/markercluster.js');source=source.replace(/<script src="https:\/\/cdn\.jsdelivr[^>]*><\/script>/g,'');source=source.replace('</head>','<link rel="stylesheet" href="/review/review.css"><script src="/review/client.js"></script></head>').replace('<body>','<body>'+toolbar);if(crew)source=source.replace('name="nugget-runtime" content="held"','name="nugget-runtime" content="enabled"');if(!unified)source=source.replace(/<option data-unified-role[^>]*>[^<]*<\/option>/g,'');if(unified)source=source.replace('</head>','<meta name="nugget-scoped-app" content="enabled"></head>');return source;}
const quote=name=>'"'+name+'"';
async function body(req){let length=0,parts=[];for await(const part of req){length+=part.length;if(length>65536)throw Error('review_request_too_large');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
async function startReview({port=4175,assets=process.env.NUGGETFINDER_BROWSER_ASSETS,placeSearchFactory=null,unified=process.env.NUGGETFINDER_REVIEW_UNIFIED==='1'}={}){
 if(process.env.NUGGETFINDER_REVIEW_ONLY!=='1')throw Error('Set NUGGETFINDER_REVIEW_ONLY=1 for a disposable local review');
 if(!assets)throw Error('Set NUGGETFINDER_BROWSER_ASSETS to the local Leaflet directory');
 const publishPhotos=process.env.NUGGETFINDER_REVIEW_PUBLISH_PHOTOS==='1';
 const db=await fixture();const started=Date.now();let server,directory;
 try{
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'nf-full-review-'));
 await db.pool.query("update participation_readiness set enabled=true,review_ref='disposable_manual_review',reviewed_at=now()");
 await db.actor(2,"select set_handle('crunch_case_a')");await db.actor(3,"select set_handle('crunch_case_b')");await db.actor(0,"select set_handle('queue_captain')");
 const first=await provision(db,db.users[1],'under13',true,{publicTake:true,group:true,publicPhoto:publishPhotos}),second=await provision(db,db.users[1],'teen',true,{publicTake:true,group:true,publicPhoto:publishPhotos});
 await db.pool.query("update participants set pseudonym='crunch_captain' where id=$1",[first.id]);await db.pool.query("update participants set pseudonym='sauce_counsel' where id=$1",[second.id]);
 if(publishPhotos)await db.pool.query('update runtime_controls set photo_publication_ready=true');
 const api=new Database(db.pool),crew=await api.call('runtime_group',[first.hash,null,'create',{name:'The Crunch Council'}]);
 const privateTake=await api.call('runtime_group',[first.hash,null,'take',{crew:crew.id,body:'[Review sample] A boneless wing is a nugget wearing a business suit.'}]);await api.call('runtime_review_crew',[db.users[0],privateTake.id,'approve']);
 for(const [actor,text] of [[2,'[Review sample] The sauce deserves its own trophy.'],[3,'[Review sample] A crunch you can hear across the table.']])await db.actor(actor,"select submit_context_take('product','mcnuggets',$1,'sauce_heretic',null,null,null)",[text]);
 const queue=(await db.actor(0,'select moderation_inbox()')).rows[0].moderation_inbox;for(const entry of queue.queue)await db.actor(0,"select review_content($1,'approve')",[entry.id]);
 let business=null;
 if(unified){
  const account=require('node:crypto').randomUUID();
  await db.pool.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,'business-review@example.invalid','{}')",[account]);
  business={...await provision(db,account,'adult',false,{publicTake:true,publicPhoto:publishPhotos}),account};
  await db.pool.query('update runtime_controls set cutover=true');
  const demo=await api.call('runtime_action',[first.hash,require('node:crypto').randomUUID(),'submit_context_take',{p_kind:'product',p_ref:'mcnuggets',p_body:'[Review sample] The sauce deserves its own trophy.'}]);
  const {rows:[pending]}=await db.pool.query("select id from moderation_queue where kind='take' and content_ref=$1 and status='pending'",[String(demo.id)]);
  if(pending)await api.call('runtime_legacy_review',[db.users[0],'review',{id:pending.id,decision:'approve'}]);
 }
 const runtime=new Runtime({database:api,blobs:new LocalBlobs(path.join(directory,'blobs')),processImage:containerProcessor('nuggetfinder-photo:review'),auth:{async verify(token){if(!['local-parent','local-moderator'].includes(token))throw Error('sign_in_required');return {id:db.users[token==='local-parent'?1:0],authenticatedAt:Date.now()};},async removeUser(id){await db.pool.query('delete from auth.users where id=$1',[id]);}}});
 const mapTiles=new MapTiles({directory:process.env.NUGGETFINDER_REVIEW_TILE_CACHE||path.join(os.tmpdir(),'nuggetfinder-public-tile-cache-v1'),enabled:true});
 const origins=[];server=createServer({runtime,root,origins,mapTiles,placeSearch:placeSearchFactory?placeSearchFactory(api):new PlaceSearch({database:api,endpoint:process.env.NUGGETFINDER_REVIEW_OVERPASS||null,snapshot:require('../data/place_search_snapshot.json').places})});const delegate=server.listeners('request')[0];server.removeAllListeners('request');
 server.on('request',async(req,res)=>{
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send({error:'loopback_only'},403);
   if(req.headers.origin&&!origins.includes(req.headers.origin))return send({error:'review_origin_denied'},403);
   if(!origins.some(origin=>new URL(origin).host===req.headers.host))return send({error:'review_host_denied'},403);
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/'))return delegate(req,res);
   if(url.pathname.startsWith('/__review/')){
    if(req.method!=='POST'||req.headers['content-type']!=='application/json'||!(unified?['a','b','mod','business']:['a','b','mod']).includes(req.headers['x-review-role']))return send({error:'review_request_denied'},403);
    const input=await body(req),role=req.headers['x-review-role'],actor=input.anonymous?null:({a:2,b:3,mod:0,business:2})[role];
    if(url.pathname==='/__review/participant-session'){if(role==='mod')return send({error:'Choose Player A or B to contribute.'},403);const person=role==='business'?business:role==='b'?second:first;
      if(unified){const token=require('node:crypto').randomBytes(32).toString('base64url');const session=await api.call('runtime_parent',[person.account||db.users[1],'session',{participant:person.id,token_hash:require('../services/participation/runtime.cjs').hash(token)}]);return send({...session,token});}
      return send({token:person.token,participant:person.id,pseudonym:role==='b'?'sauce_counsel':'crunch_captain',expires_in:Math.max(0,1800-Math.floor((Date.now()-started)/1000))});}
    if(url.pathname==='/__review/session')return send({user:{id:db.users[({a:2,b:3,mod:0,business:2})[role]]}});
    if(url.pathname==='/__review/rpc'){
     const {name,parameters={}}=input;if(!/^[a-z_]+$/.test(name)||!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw Error('review_rpc_denied');
     const keys=Object.keys(parameters);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('review_parameter_denied');
     const candidates=(await db.pool.query("select p.proretset,p.pronargs,p.pronargdefaults,p.proargnames from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1 and p.prosecdef and has_function_privilege($2,p.oid,'execute')",[name,actor===null?'anon':'authenticated'])).rows;
     const fn=candidates.find(f=>{const names=(f.proargnames||[]).slice(0,f.pronargs);return keys.every(k=>names.includes(k))&&names.slice(0,f.pronargs-f.pronargdefaults).every(k=>keys.includes(k));});if(!fn)throw Error('review_rpc_denied');
     const result=await db.actor(actor,'select * from public.'+quote(name)+'('+keys.map((k,i)=>quote(k)+'=> $'+(i+1)).join(',')+')',keys.map(k=>parameters[k]));
     return send({data:fn.proretset?result.rows:result.rows[0]?.[name]??null,error:null});
    }
    if(url.pathname==='/__review/table'){
     const {table,filter,sort}=input;if(!['products','places','place_products','profiles'].includes(table))throw Error('review_table_denied');
     let sql=table==='profiles'?'select id,handle,handle_set,created_at from public.profiles':table==='place_products'?'select pp.*,to_jsonb(p) places from public.place_products pp join public.places p on p.id=pp.place_id':'select * from public.'+quote(table),params=[];
     if(filter){if(!['id','handle'].includes(filter.key))throw Error('review_filter_denied');params.push(filter.value);sql+=' where '+quote(filter.key)+'=$1';}
     if(sort){if(!['name','brand','created_at'].includes(sort))throw Error('review_order_denied');sql+=' order by '+quote(sort);}
     return send({data:(await db.actor(actor,sql,params)).rows,error:null});
    }
    throw Error('review_endpoint_denied');
   }
   if(req.method==='POST'&&url.pathname==='/review/overpass')return send({elements:[]});
   if(req.method!=='GET')return send({error:'review_method_denied'},405);
   if(/^\/review\/tiles\/\d+\/\d+\/\d+\.png$/.test(url.pathname)){
    const [z,x,y]=url.pathname.slice('/review/tiles/'.length,-4).split('/').map(Number);const tile=await mapTiles.get(z,x,y,req.headers.referer);res.writeHead(200,{'Content-Type':tile.contentType,'Cache-Control':tile.cacheControl});return res.end(tile.body);
   }
   let file=url.pathname==='/'?'index.html':url.pathname==='/review'?'review/inventory.html':decodeURIComponent(url.pathname).slice(1);
   if(file.startsWith('review-assets/')){const name=file.slice(14);if(!['leaflet.js','leaflet.css','markercluster.js'].includes(name))throw Error('review_asset_denied');res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':'text/css'});return res.end(await fs.readFile(path.join(assets,name)));}
   if(!/^(index\.html|crew\.html|(?:css|js|vendor|review)\/[a-zA-Z0-9_./-]+)$/.test(file)||file.includes('..'))throw Error('review_file_denied');
   const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)];if(!type)throw Error('review_file_denied');
   let bytes=await fs.readFile(path.join(root,file));if(file.endsWith('.html'))bytes=html(bytes,file==='crew.html',unified);
   if(file==='js/app.js')bytes=bytes.toString().replace('https://overpass-api.de/api/interpreter','/review/overpass').replace('https://tile.openstreetmap.org/','/review/tiles/');
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'strict-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});res.end(bytes);
  }catch(error){const message=/^[a-z][a-z0-9_]{2,79}$/.test(error.message)?error.message:'review_request_unavailable';if(res.headersSent)return res.destroy();send({data:null,error:{message}},urlPath(req).startsWith('/__review/')?200:400);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});const actual=server.address().port;origins.push('http://127.0.0.1:'+actual,'http://localhost:'+actual);
 return {url:'http://127.0.0.1:'+actual,db,runtime,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();await fs.rm(directory,{recursive:true,force:true});}};
 }catch(error){if(server)server.close();await db.close();if(directory)await fs.rm(directory,{recursive:true,force:true});throw error;}
}
function urlPath(req){return (req.url||'').split('?')[0];}
module.exports={startReview,html};
if(require.main===module)startReview({port:Number(process.env.PORT||4175)}).then(review=>{console.log('Full app review: '+review.url);let closing=false;const close=async()=>{if(closing)return;closing=true;await review.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);}).catch(error=>{console.error('Review startup failed: '+error.message);process.exitCode=1;});

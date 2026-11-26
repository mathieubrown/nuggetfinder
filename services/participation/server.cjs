'use strict';
const http=require('node:http');const {readFile}=require('node:fs/promises');const path=require('node:path');
const {randomBytes}=require('node:crypto');const {hash,requireRecentAuthentication}=require('./runtime.cjs');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function body(request,max){let chunks=[],size=0;for await(const part of request){size+=part.length;if(size>max)throw Error('request_size_limit');chunks.push(part);}return Buffer.concat(chunks);}
function createServer({runtime,root,origins=[],authConfig=null,placeSearch=null,mapTiles=null}){
 if(!placeSearch){const {PlaceSearch}=require('./place-search.cjs');placeSearch=new PlaceSearch({database:runtime.db,snapshot:require('../../data/place_search_snapshot.json').places});}
 const buckets=new Map();let inflight=0,uploadInFlight=0;
 return http.createServer({requestTimeout:15000,headersTimeout:5000,maxHeaderSize:8192},async(request,response)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cross-Origin-Resource-Policy','same-origin');
  const origin=request.headers.origin;
  if(origin&&!origins.includes(origin)){response.writeHead(403);return response.end();}
  if(origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');}
  if(request.method==='OPTIONS'){response.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,X-Revision');response.setHeader('Access-Control-Allow-Methods','GET,POST');response.writeHead(204);return response.end();}
  const key=request.socket.remoteAddress;const now=Date.now();for(const [id,b] of buckets)if(now-b.start>60000)buckets.delete(id);
  const bucket=buckets.get(key)||{start:now,count:0};bucket.count++;buckets.set(key,bucket);
  if(bucket.count>180||inflight>=32||buckets.size>1000){response.writeHead(429);return response.end('{"error":"busy_try_later"}');}
  inflight++;
  const send=data=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(data));};
  const image=bytes=>{response.setHeader('Content-Type','image/jpeg');response.setHeader('Content-Disposition','inline');response.end(bytes);};
  try{
   const url=new URL(request.url,'http://localhost');if(url.search)throw Error('query_parameters_not_supported');
   const token=(request.headers.authorization||'').replace(/^Bearer /,'');
   if(request.method==='GET'&&url.pathname==='/api/config')return send({auth:authConfig,productionEnabled:false});
   if(request.method==='GET'&&url.pathname==='/api/catalog')return send(await runtime.db.call('runtime_catalog',[]));
   if(request.method==='GET'&&url.pathname.startsWith('/api/public-photo/')){
    const [,id,variant]=url.pathname.match(/^\/api\/public-photo\/([^/]+)\/(thumb|display)$/)||[];if(!uuid(id))throw Error('invalid_photo');return image(await runtime.publicPhoto(id,variant));
   }
   if(request.method==='GET'&&/^\/api\/map-tiles\/\d+\/\d+\/\d+\.png$/.test(url.pathname)){
    const {fallback}=require('./map-tiles.cjs');const [z,x,y]=url.pathname.slice('/api/map-tiles/'.length,-4).split('/').map(Number);const tile=mapTiles?await mapTiles.get(z,x,y,request.headers.referer):fallback();response.setHeader('Content-Type',tile.contentType);response.setHeader('Cache-Control',tile.cacheControl);return response.end(tile.body);
   }
   if(request.method==='POST'){
    if(url.pathname.startsWith('/api/upload/')){
     const id=url.pathname.slice('/api/upload/'.length),revision=Number(request.headers['x-revision']);
     if(!uuid(id)||!Number.isInteger(revision)||revision<1||request.headers['content-type']!=='application/octet-stream')throw Error('invalid_upload');
     if(uploadInFlight>=2)throw Error('processor_busy');uploadInFlight++;
     try{const lease=await runtime.photo(token,'begin',{id,revision});if(lease.already){request.resume();return send({id,status:lease.status,revision:lease.revision});}return send(await runtime.upload(token,id,revision,await body(request,8*1024*1024),lease));}finally{uploadInFlight--;}
    }
    if(!request.headers['content-type']?.startsWith('application/json'))throw Error('json_required');
    const data=JSON.parse(await body(request,65536));if(!data||Array.isArray(data)||typeof data!=='object')throw Error('invalid_request');
    if(url.pathname==='/api/parent'){
     if(data.operation==='photo_read')throw Error('use_parent_photo_read_endpoint');
     if(data.operation==='export')return send(await runtime.exportParent(token,data.data||{}));
     return send(await runtime.parent(token,data.operation,data.data||{}));
    }
    if(url.pathname==='/api/action'){if(!uuid(data.request))throw Error('request_required');return send(await runtime.action(token,data.request,data.operation,data.data||{}));}
    if(url.pathname==='/api/place-search')return send(placeSearch?await placeSearch.search(data.query):{catalog:await runtime.db.call('runtime_locations',[null,'search',{query:data.query}]),external:[],provider:'not_configured'});
    if(url.pathname==='/api/place-details')return send(await runtime.db.call('runtime_locations',[null,'details',{place:data.place}]));
    if(url.pathname==='/api/locations')return send(await runtime.db.call('runtime_locations',[hash(token),data.operation,data.data||{}]));
    if(url.pathname==='/api/mod-locations'){const account=requireRecentAuthentication(await runtime.auth.verify(token));return send(await runtime.db.call('runtime_review_locations',[account,data.id||null,data.decision||null,data.version||null,data.checked===true]));}
    if(url.pathname==='/api/read')return send(await runtime.db.call('runtime_read',[hash(token),data.operation,data.data||{}]));
    if(url.pathname==='/api/rating')return send(await runtime.db.call('runtime_rating',[hash(token),data.operation,data.data||{}]));
    if(url.pathname==='/api/photo'){if(!['reserve','list','delete','correct','report','attest'].includes(data.operation))throw Error('photo_operation_not_public');return send(await runtime.photo(token,data.operation,data.data||{}));}
    if(url.pathname==='/api/parent-photo-read'){const descriptor=await runtime.parent(token,'photo_read',data);if(!descriptor?.key)throw Error('photo_unavailable');const bytes=await runtime.blobs.get(descriptor.key);const current=await runtime.parent(token,'photo_read',data);if(current?.key!==descriptor.key)throw Error('photo_unavailable');return image(bytes);}
    if(url.pathname==='/api/photo-read')return image(await runtime.read(token,data.id,data.variant));
    if(url.pathname==='/api/mod'){if(data.decision&&!['approve','reject','remove'].includes(data.decision))throw Error('invalid_review_decision');return send(await runtime.review(token,data));}
    if(url.pathname==='/api/mod-preview')return image(await runtime.preview(token,data.id));
    if(url.pathname==='/api/mod-legacy'){const account=requireRecentAuthentication(await runtime.auth.verify(token));return send(await runtime.db.call('runtime_legacy_review',[account,data.operation||'list',data.data||{}]));}
    if(url.pathname==='/api/mod-crew'){const account=requireRecentAuthentication(await runtime.auth.verify(token));return send(await runtime.db.call('runtime_review_crew',[account,data.id||null,data.decision||null]));}
    if(url.pathname==='/api/pair'){
     const secret=randomBytes(32).toString('base64url');
     if(data.operation==='issue'){
      const account=requireRecentAuthentication(await runtime.auth.verify(token));const code=randomBytes(20).toString('hex');
      const result=await runtime.db.call('runtime_pair',[account,'issue',{participant:data.participant,code_hash:hash(code)}]);return send({...result,code});
     }
     if(data.operation!=='redeem'||!/^[a-f0-9]{40}$/.test(data.code||''))throw Error('pairing_unavailable');
     const result=await runtime.db.call('runtime_pair',[null,'redeem',{code_hash:hash(data.code),token_hash:hash(secret)}]);return send({...result,token:secret});
    }
    if(url.pathname==='/api/group'){
     let account=null;const payload={...(data.data||{})};
     if(data.operation==='join'){account=requireRecentAuthentication(await runtime.auth.verify(token));payload.code_hash=hash(payload.code||'');delete payload.code;}
     let code;if(data.operation==='code'){code=randomBytes(20).toString('hex');payload.code_hash=hash(code);}
     const result=await runtime.db.call('runtime_group_request',[hash(token),account,data.request||null,data.operation,payload]);return send(code?{...result,code}:result);
    }
    throw Error('endpoint_unavailable');
   }
   if(request.method==='GET'&&root){
    const file=url.pathname==='/'?'crew.html':decodeURIComponent(url.pathname).slice(1);
    if(!/^(crew\.html|(?:js|css|vendor)\/[a-zA-Z0-9_./-]+)$/.test(file)||file.includes('..'))throw Error('file_unavailable');
    const extension=path.extname(file);const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
    if(!types[extension])throw Error('file_unavailable');response.setHeader('Content-Type',types[extension]);
    response.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; connect-src 'self' "+(authConfig?new URL(authConfig.url).origin:'')+"; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    let bytes=await readFile(path.join(root,file));if(file==='crew.html')bytes=bytes.toString().replace('name="nugget-runtime" content="held"','name="nugget-runtime" content="enabled"');return response.end(bytes);
   }
   throw Error('endpoint_unavailable');
  }catch(error){
   request.resume();if(response.headersSent){response.destroy();return;}
   // Return only known application codes, never SQL detail, tokens, URLs or decoder traces.
   const code=/^[a-z][a-z0-9_]{2,79}$/.test(error.message)?error.message:'request_unavailable';
   response.writeHead(code==='request_size_limit'?413:400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:code}));
  }finally{inflight--;}
 });
}
module.exports={createServer};

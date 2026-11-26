// Private worker launcher. Give only this process Docker access, never the web broker.
const http=require('node:http');const {unlink,chmod}=require('node:fs/promises');const {timingSafeEqual}=require('node:crypto');const {containerProcessor}=require('./runtime.cjs');
function workerServer({token,image='nuggetfinder-photo:review'}){
 if(typeof token!=='string'||token.length<32)throw Error('worker_secret_required');const processImage=containerProcessor(image);let active=0;
 return http.createServer({requestTimeout:15000,headersTimeout:5000,maxHeaderSize:4096},async(req,res)=>{
  const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'')),expected=Buffer.from(token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(403);return res.end();}
  if(req.url!=='/process'||req.method!=='POST'||req.headers['content-type']!=='application/octet-stream'){res.writeHead(400);return res.end();}
  if(active>=2){res.writeHead(429);return res.end();}active++;
  try{let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Error('file_size_limit');parts.push(chunk);}const result=await processImage(Buffer.concat(parts));for(const variant of Object.values(result.variants))variant.bytes=variant.bytes.toString('base64');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));}
  catch{res.writeHead(400);res.end('{"error":"image_processing_failed"}');}finally{active--;}
 });
}
function remoteProcessor({socketPath,token}){
 if(!socketPath?.startsWith('/')||typeof token!=='string'||token.length<32)throw Error('isolated_worker_configuration_required');
 return bytes=>new Promise((resolve,reject)=>{
  if(bytes.length>8*1024*1024)return reject(Error('file_size_limit'));
  const request=http.request({socketPath,path:'/process',method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream','Content-Length':bytes.length},timeout:15000},response=>{
   const chunks=[];let length=0;response.on('data',part=>{length+=part.length;if(length>5*1024*1024){request.destroy();reject(Error('image_output_limit'));}else chunks.push(part);});response.on('end',()=>{if(response.statusCode!==200)return reject(Error('image_processing_failed'));try{const result=JSON.parse(Buffer.concat(chunks));for(const v of Object.values(result.variants))v.bytes=Buffer.from(v.bytes,'base64');resolve(result);}catch{reject(Error('invalid_processing_result'));}});
  });request.on('timeout',()=>request.destroy(Error('image_processing_timeout')));request.on('error',()=>reject(Error('isolated_worker_unavailable')));request.end(bytes);
 });
}
module.exports={workerServer,remoteProcessor};
if(require.main===module){
 const socketPath=process.env.NUGGETFINDER_WORKER_SOCKET,token=process.env.NUGGETFINDER_WORKER_SECRET;
 if(!socketPath?.startsWith('/'))throw Error('Private Unix socket path required');
 const server=workerServer({token,image:process.env.NUGGETFINDER_WORKER_IMAGE||'nuggetfinder-photo:review'});
 server.listen(socketPath,async()=>{await chmod(socketPath,0o600);console.log('Private image worker ready');});
 const close=()=>server.close(async()=>{await unlink(socketPath);});process.on('SIGINT',close);process.on('SIGTERM',close);
}

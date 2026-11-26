'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const fallback=()=>({body:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#eee9dc"/><path d="M0 64h256M0 192h256M64 0v256M192 0v256" stroke="#cbc5b4"/><text x="12" y="128" font-size="12">Map imagery unavailable</text></svg>'),contentType:'image/svg+xml',cacheControl:'private,max-age=60'});
function lifetime(headers,now){const age=headers.get('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/i);if(age)return Math.max(0,Number(age[1])*1000);const expires=Date.parse(headers.get('expires'));return Number.isFinite(expires)?Math.max(0,expires-now):7*86400000;}
class MapTiles{
 constructor({directory,enabled=false,fetcher=fetch,now=Date.now}){this.directory=directory;this.enabled=enabled;this.fetcher=fetcher;this.now=now;this.pending=new Map();}
 async get(z,x,y,referer){if(![z,x,y].every(Number.isInteger)||z<0||z>19||x<0||y<0||x>=2**z||y>=2**z)return fallback();if(!this.enabled||!referer)return fallback();let origin;try{origin=new URL(referer).origin+'/';}catch{return fallback();}const key=z+'-'+x+'-'+y;if(this.pending.has(key))return this.pending.get(key);const promise=this.load(key,z,x,y,origin);this.pending.set(key,promise);try{return await promise;}finally{this.pending.delete(key);}}
 async load(key,z,x,y,origin){let old;const now=this.now(),meta=path.join(this.directory,key+'.json'),png=path.join(this.directory,key+'.png');
 try{old=JSON.parse(await fs.readFile(meta));if(old.expires>now)return {body:await fs.readFile(png),contentType:'image/png',cacheControl:'private,max-age='+Math.floor((old.expires-now)/1000)};}catch{old=null;}
 try{await fs.mkdir(this.directory,{recursive:true,mode:0o700});const files=await fs.readdir(this.directory);if(!old&&files.length>=1024)return fallback();const headers={'User-Agent':'NuggetFinder map review (+https://github.com/mathieubrown/nuggetfinder)',Referer:origin};if(old?.etag)headers['If-None-Match']=old.etag;if(old?.modified)headers['If-Modified-Since']=old.modified;
 const response=await this.fetcher('https://tile.openstreetmap.org/'+z+'/'+x+'/'+y+'.png',{headers,signal:AbortSignal.timeout(4000)});let body;if(response.status===304&&old)body=await fs.readFile(png);else{if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))return fallback();let count=0,parts=[];for await(const part of response.body){count+=part.length;if(count>262144)throw Error('map_tile_too_large');parts.push(part);}body=Buffer.concat(parts);if(!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return fallback();await fs.writeFile(png,body,{mode:0o600});}
 const duration=lifetime(response.headers,now);await fs.writeFile(meta,JSON.stringify({expires:now+duration,etag:response.headers.get('etag')||old?.etag,modified:response.headers.get('last-modified')||old?.modified}),{mode:0o600});return {body,contentType:'image/png',cacheControl:'private,max-age='+Math.floor(duration/1000)};
 }catch{return fallback();}
 }
}
module.exports={MapTiles,lifetime,fallback};

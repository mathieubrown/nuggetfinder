const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./support/local-postgres.cjs'),{provision}=require('./support/participant-fixture.cjs'),{Database}=require('../services/participation/runtime.cjs');
const {PlaceSearch,queryText,inside,overpassQuery,results}=require('../services/participation/place-search.cjs');
const manual=()=>({request:randomUUID(),kind:'add',name:'Review Test Kitchen',address:'100 Public Street, San Francisco',category:'restaurant',latitude:37.75,longitude:-122.44,public_business:true,opening_hours:'Mon–Fri 11am–8pm',menu_url:'https://example.org/menu'});
test('place search normalizes input, bounds food businesses, escapes query syntax and preserves OSM IDs',()=>{
 assert.equal(queryText('  Test   Kitchen  '),'Test Kitchen');assert.throws(()=>queryText('a'),/length/);assert.equal(inside(37.75,-122.44),true);assert.equal(inside(0,0),false);assert.equal(inside(NaN,-122.44),false);
 const query=overpassQuery('3950 24th Street');assert.ok(query.includes('["addr:housenumber"="3950"]'));assert.ok(query.includes('37.62,-122.53,37.812,-122.35'));assert.ok(overpassQuery('a";out;').includes('a\\";out;'));
 const rows=results({elements:[{type:'node',id:123,tags:{name:'Food Place',amenity:'restaurant','addr:housenumber':'10','addr:street':'Main St'},lat:37.7,lon:-122.4},{type:'node',id:456,tags:{name:'Outside'},lat:0,lon:0}]});assert.equal(rows.length,1);assert.equal(rows[0].id,'node/123');assert.equal(rows[0].address,'10 Main St');
});
test('provider caching, single-flight and error fallback retain catalog search without logging user history',async()=>{
 const calls=[],db={async call(name,args){calls.push(name);return name==='runtime_locations'?[{id:'node/1',name:'Known'}]:JSON.parse(args[0]);}};let hits=0,now=100000;
 const search=new PlaceSearch({database:db,endpoint:'https://example.test/interpreter',now:()=>now,fetcher:async()=>{hits++;return new Response(JSON.stringify({elements:[{type:'way',id:2,tags:{name:'Kitchen'},center:{lat:37.75,lon:-122.44}}]}));}});
 assert.equal((await search.search('Kitchen')).provider,'available');assert.equal((await search.search('Kitchen')).provider,'cached');assert.equal(hits,1);assert.equal((await search.search('Different')).provider,'busy');
 now+=1101;search.fetcher=async()=>new Response('unavailable',{status:503});const failure=await search.search('Different');assert.equal(failure.provider,'unavailable');assert.equal(failure.catalog.length,1);
 assert.ok(calls.includes('runtime_location_cache'));const off=new PlaceSearch({database:db});assert.equal((await off.search('Kitchen')).provider,'not_configured');
});
test('new locations stay private until checked human approval, deduplicate and remain valid report/menu targets',async()=>{
 const db=await fixture(),api=new Database(db.pool);try{
 await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test',reviewed_at=now()");const child=await provision(db,db.users[1]);
 const payload=manual();const result=await api.call('runtime_locations',[child.hash,'submit',payload]);assert.equal(result.status,'pending');assert.equal((await api.call('runtime_locations',[child.hash,'submit',payload])).id,result.id);
 assert.equal((await db.actor(null,"select search_places('Review Test Kitchen')")).rows[0].search_places.length,0);
 await assert.rejects(api.call('runtime_locations',[child.hash,'submit',{...payload,address:'Different'}]),/request_conflict/);
 await assert.rejects(api.call('runtime_review_locations',[db.users[1],result.id,'approve',1,true]),/moderator_required/);
 await assert.rejects(api.call('runtime_review_locations',[db.users[0],result.id,'approve',1,false]),/checks_required/);
 const approval=await api.call('runtime_review_locations',[db.users[0],result.id,'approve',1,true]);assert.match(approval.place_id,/^community\//);
 await assert.rejects(api.call('runtime_review_locations',[db.users[0],result.id,'approve',1,true]),/review_conflict/);
 const found=(await db.actor(null,"select search_places('Public Kitchen')")).rows[0].search_places;assert.equal(found[0].id,approval.place_id);
 assert.equal((await db.pool.query('select count(*)::int n from reports where place_id=$1',[approval.place_id])).rows[0].n,0);assert.equal((await db.pool.query('select count(*)::int n from stock_reports')).rows[0].n,0);
 const dupe=await api.call('runtime_locations',[child.hash,'submit',{...manual(),request:randomUUID()}]);assert.equal(dupe.status,'duplicate');assert.equal(dupe.place_id,approval.place_id);
 const photo=await api.call('runtime_photo',[child.hash,'reserve',{request:randomUUID(),attested:true,purpose:'menu',kind:'place',ref:approval.place_id}]);assert.equal(photo.status,'reserved');
 const menus=await api.call('runtime_locations',[child.hash,'my_menus',{place:approval.place_id}]);assert.equal(menus[0].id,photo.id);
 const info=(await db.actor(null,'select place_information_for($1)',[approval.place_id])).rows[0].place_information_for;assert.equal(info.details.menu_url,'https://example.org/menu');assert.equal(info.menus.length,0);assert.ok(!JSON.stringify(info).includes(child.id));
 const data=await api.call('runtime_parent',[db.users[1],'export',{participant:child.id}]);assert.equal(data.location_submissions[0].id,result.id);
 await api.call('runtime_parent',[db.users[1],'delete',{participant:child.id}]);assert.equal((await db.pool.query('select count(*)::int n from place_submissions')).rows[0].n,0);assert.equal((await db.pool.query('select count(*)::int n from places where id=$1',[approval.place_id])).rows[0].n,1);
 }finally{await db.close();}
});
test('source IDs cannot be forged; expired sources, bans, revocation and out-of-area pins fail closed',async()=>{
 const db=await fixture(),api=new Database(db.pool);try{
 await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test',reviewed_at=now()");const p=await provision(db,db.users[1]);
 await assert.rejects(api.call('runtime_locations',[p.hash,'submit',{...manual(),osm_id:'node/987654321'}]),/source_expired/);
 await assert.rejects(api.call('runtime_locations',[p.hash,'submit',{...manual(),latitude:0}]),/location_outside_area/);
 await assert.rejects(api.call('runtime_locations',[p.hash,'submit',{...manual(),menu_url:'javascript:alert(1)'}]),/invalid_menu_url/);
 await api.call('runtime_location_cache',[JSON.stringify([{
id:'node/987654321',name:'Cached Food Place',address:'100 Public Street',latitude:37.75,longitude:-122.44,category:'restaurant'}])]);
 const record=await api.call('runtime_locations',[p.hash,'submit',{...manual(),osm_id:'node/987654321',name:'Forged name',latitude:37.7}]);const row=(await db.pool.query('select name,latitude from place_submissions where id=$1',[record.id])).rows[0];assert.equal(row.name,'Cached Food Place');assert.equal(row.latitude,37.75);
 await api.call('runtime_parent',[db.users[1],'revoke',{participant:p.id,capability:'report'}]);await assert.rejects(api.call('runtime_review_locations',[db.users[0],record.id,'approve',1,true]),/author_unavailable/);
 const rejected=await api.call('runtime_review_locations',[db.users[0],record.id,'reject',1,false]);assert.equal(rejected.status,'rejected');
 await assert.rejects(api.call('runtime_locations',[p.hash,'submit',manual()]),/participant_session_unavailable/);
 }finally{await db.close();}
});
test('edit review detects stale detail versions instead of silently replacing newer approved evidence',async()=>{
 const db=await fixture(),api=new Database(db.pool);try{
 await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_test',reviewed_at=now()");const a=await provision(db,db.users[1]),b=await provision(db,db.users[2]);
 const edit={...manual(),kind:'edit',place:'node/1229920544',base_version:0};const x=await api.call('runtime_locations',[a.hash,'submit',edit]),y=await api.call('runtime_locations',[b.hash,'submit',{...edit,request:randomUUID(),opening_hours:'Daily noon–6pm'}]);await api.call('runtime_review_locations',[db.users[0],x.id,'approve',1,true]);await assert.rejects(api.call('runtime_review_locations',[db.users[0],y.id,'approve',1,true]),/place_edit_conflict/);await assert.rejects(api.call('runtime_locations',[b.hash,'submit',{...edit,request:randomUUID()}]),/place_edit_conflict/);
 }finally{await db.close();}
});
test('tile caching respects provider headers, revalidates expired images and sends only the request origin',async()=>{
 const {MapTiles,lifetime}=require('../services/participation/map-tiles.cjs'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nf-tile-test-'));let now=100000,hits=0;
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA9sAAAAASUVORK5CYII=','base64');
 const tiles=new MapTiles({directory,enabled:true,now:()=>now,fetcher:async(url,options)=>{hits++;assert.equal(options.headers.Referer,'http://127.0.0.1:4175/');assert.ok(!options.headers['Cache-Control']);if(hits===2){assert.equal(options.headers['If-None-Match'],'test-etag');return new Response(null,{status:304,headers:{'Cache-Control':'max-age=100'}});}return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'max-age=100',ETag:'test-etag'}});}});
 try{assert.equal((await tiles.get(1,1,1,null)).contentType,'image/svg+xml');assert.equal(hits,0);assert.equal((await tiles.get(1,1,1,'http://127.0.0.1:4175/index.html?private=not-forwarded')).contentType,'image/png');await tiles.get(1,1,1,'http://127.0.0.1:4175/');assert.equal(hits,1);now+=100001;await tiles.get(1,1,1,'http://127.0.0.1:4175/');assert.equal(hits,2);assert.equal(lifetime(new Headers(),now),7*86400000);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('dated public business snapshot supplies real OSM candidates offline and common punctuation does not hide brands',async()=>{
 const snapshot=require('../data/place_search_snapshot.json');assert.equal(snapshot.as_of,'2026-11-07');assert.equal(snapshot.places.length,4609);assert.ok(snapshot.places.every(r=>/^(node|way|relation)\/[0-9]+$/.test(r.id)&&inside(r.latitude,r.longitude)));let saved;
 const database={async call(name,args){if(name==='runtime_location_cache'){saved=JSON.parse(args[0]);return saved;}return [];}};
 const search=new PlaceSearch({database,snapshot:snapshot.places});const result=await search.search('mcdonalds');assert.equal(result.provider,'snapshot');assert.ok(result.external.length>0);assert.ok(saved.every(r=>r.source_as_of==='2026-11-07'));assert.ok((await search.search('3950 24th Street')).external.length>0);
 const db=await fixture();try{const rows=(await db.actor(null,"select search_places('mcdonalds')")).rows[0].search_places;assert.ok(rows.length>0);}finally{await db.close();}
});
test('unreviewed source names are filtered through the same blocked-term rules before reaching search clients',async()=>{
 const db=await fixture(),api=new Database(db.pool);try{
 await db.pool.query("insert into blocked_terms values('zorbax')");const rows=await api.call('runtime_location_cache',[JSON.stringify([{id:'node/99999',name:'Zorbax Kitchen',address:'100 Main Street',latitude:37.75,longitude:-122.44,category:'restaurant'}])]);assert.deepEqual(rows,[]);assert.equal((await db.pool.query("select count(*)::int n from place_search_cache where osm_id='node/99999'")).rows[0].n,0);
 }finally{await db.close();}
});
test('optional photo publication is restricted to an explicit disposable review fixture, never migration defaults',async()=>{
 const {startReview}=require('../scripts/review-server.cjs');const mode=process.env.NUGGETFINDER_REVIEW_ONLY,publish=process.env.NUGGETFINDER_REVIEW_PUBLISH_PHOTOS;process.env.NUGGETFINDER_REVIEW_ONLY='1';process.env.NUGGETFINDER_REVIEW_PUBLISH_PHOTOS='1';let review;
 try{review=await startReview({port:0,assets:require('node:path').resolve(__dirname,'../..')});assert.equal((await review.db.pool.query('select photo_publication_ready from runtime_controls')).rows[0].photo_publication_ready,true);assert.equal((await review.db.pool.query("select count(*)::int n from participant_permissions where capability='photo' and public_disclosure")).rows[0].n,2);}finally{if(review)await review.close();if(mode===undefined)delete process.env.NUGGETFINDER_REVIEW_ONLY;else process.env.NUGGETFINDER_REVIEW_ONLY=mode;if(publish===undefined)delete process.env.NUGGETFINDER_REVIEW_PUBLISH_PHOTOS;else process.env.NUGGETFINDER_REVIEW_PUBLISH_PHOTOS=publish;}
 const fresh=await fixture();try{assert.equal((await fresh.pool.query('select photo_publication_ready from runtime_controls')).rows[0].photo_publication_ready,false);}finally{await fresh.close();}
});
test('place status never turns business approval into a stock claim, and UI pin bounds fail closed',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const context={window:{},NuggetfinderCommunity:{pages:{},rpc(){}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../js/place-tools.js'),'utf8'),context);const logic=context.window.NuggetfinderPlacesLogic;assert.match(logic.placeStatus('approved'),/PLACE/);assert.doesNotMatch(logic.placeStatus('approved'),/IN STOCK|CONFIRMED/);assert.match(logic.placeStatus('<img src=x>'),/UNAVAILABLE/);assert.equal(logic.within(Infinity,-122.44),false);assert.equal(logic.within(37.75,-122.44),true);
});
test('migration preserves a warmed existing participant runtime and adds own location rows to nested account exports',async()=>{
 const account=randomUUID();let prior;
 const db=await fixture({beforeMigration:async(file,pool)=>{if(file!=='20261126000100_places_and_menus.sql')return;await pool.query("insert into auth.users(id,raw_user_meta_data,email) values($1,'{}','warm-migration@example.invalid')",[account]);await pool.query("update participation_readiness set enabled=true,review_ref='isolated_warm_migration',reviewed_at=now()");prior=await provision({pool},account);await new Database(pool).call('runtime_parent',[account,'export_account',{}]);}});
 try{const api=new Database(db.pool);const entry=await api.call('runtime_locations',[prior.hash,'submit',manual()]);const exported=await api.call('runtime_parent',[account,'export_account',{}]);assert.equal(exported.managed_profiles[0].location_submissions[0].id,entry.id);}finally{await db.close();}
});
test('nearby same-brand stores with different verified OSM IDs remain separate report targets',async()=>{
 const db=await fixture(),api=new Database(db.pool);try{
 await db.pool.query("update participation_readiness set enabled=true,review_ref='isolated_nearby_stores',reviewed_at=now()");const p=await provision(db,db.users[1]);
 const sources=[{id:'node/99991',name:'Nearby Test Kitchen',address:'100 Public Street',latitude:37.75,longitude:-122.44,category:'restaurant'},{id:'node/99992',name:'Nearby Test Kitchen',address:'102 Public Street',latitude:37.7501,longitude:-122.44,category:'restaurant'}];await api.call('runtime_location_cache',[JSON.stringify(sources)]);
 for(const source of sources){const s=await api.call('runtime_locations',[p.hash,'submit',{...manual(),osm_id:source.id}]);assert.equal(s.status,'pending');const reviewed=await api.call('runtime_review_locations',[db.users[0],s.id,'approve',1,true]);assert.equal(reviewed.place_id,source.id);}
 assert.equal((await db.pool.query("select count(*)::int n from places where id in ('node/99991','node/99992')")).rows[0].n,2);
 }finally{await db.close();}
});

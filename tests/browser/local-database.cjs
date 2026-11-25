// Browser -> transport shim -> real local PostgreSQL functions. Auth sessions are simulated.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {fixture}=require('../support/local-postgres.cjs');
const {chromium}=require(process.env.NUGGETFINDER_PLAYWRIGHT || 'playwright');
const root=path.resolve(__dirname,'../..');
const assets=process.env.NUGGETFINDER_BROWSER_ASSETS;
if(!assets)throw Error('Set NUGGETFINDER_BROWSER_ASSETS to local Leaflet asset directory');
const escId=s=>'"'+s.replaceAll('"','""')+'"';
const shim=String.raw`
window.supabase={createClient(){
 const transport=async(path,body)=>{const response=await fetch('/__local/'+path,{method:'POST',body:JSON.stringify(body)});return response.json();};
 return {auth:{getSession:async()=>({data:{session:{user:{id:window.__localUser}}}}),onAuthStateChange(){}},
 rpc(name,params={}){const promise=transport('rpc',{name,params});promise.single=async()=>{const result=await promise;return {...result,data:result.data?.[0] || null};};return promise;},
 from(table){let columns,filter,order;const chain={select(value){columns=value;return chain;},eq(key,value){filter={key,value};return chain;},order(key){order=key;return chain;},
 then(resolve,reject){return transport('table',{table,columns,filter,order}).then(resolve,reject);},async maybeSingle(){const result=await transport('table',{table,columns,filter,order});return {...result,data:result.data?.[0] || null};}};return chain;}
 };
}};`;
(async()=>{
 for(const width of [390,1280]){
 const db=await fixture();let browser;const errors=[];let loseNextTake=true;let loseNextPrice=true;
 try{
 for(let i=0;i<3;i++)await db.actor(i,'select public.set_handle($1)',['local_member_'+i]);
 browser=await chromium.launch({args:['--single-process','--disable-gpu','--disable-crash-reporter']});
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
 async function pageFor(actor){
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.addInitScript({content:'window.__localUser='+JSON.stringify(db.users[actor])});
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/__local/')){
    const input=route.request().postDataJSON();let data;
    try{
     if(url.pathname.endsWith('/rpc')){
      const {name,params={}}=input;if(!/^[a-z_]+$/.test(name))throw Error('Invalid RPC');
      const fn=(await db.pool.query("select proretset from pg_proc where pronamespace='public'::regnamespace and proname=$1",[name])).rows[0];if(!fn)throw Error('Unknown RPC '+name);
      const keys=Object.keys(params);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid parameter');
      const result=await db.actor(actor,'select * from public.'+escId(name)+'('+keys.map((key,i)=>escId(key)+'=> $'+(i+1)).join(',')+')',Object.values(params));
      data=fn.proretset?result.rows:result.rows[0]?.[name];
      if(['submit_take_request','submit_price_request'].includes(name))await new Promise(resolve=>setTimeout(resolve,250));
      if((name==='submit_take_request' && loseNextTake)||(name==='submit_price_request' && loseNextPrice)){
       if(name==='submit_take_request')loseNextTake=false;else loseNextPrice=false;
       return route.fulfill({json:{error:{message:'Local test: response lost after commit'}}});
      }
     }else{
      const {table,filter}=input;
      if(!['products','places','place_products','profiles'].includes(table))throw Error('Table not allowed');
      let sql=table==='profiles'?'select id,handle,handle_set,created_at from public.profiles':table==='place_products'?"select pp.*,to_jsonb(p) places from public.place_products pp join public.places p on p.id=pp.place_id":'select * from public.'+escId(table);
      const params=[];
      if(filter){if(!['id','handle'].includes(filter.key))throw Error('Invalid filter');sql+=' where '+escId(filter.key)+'=$1';params.push(filter.value);}
      data=(await db.actor(actor,sql,params)).rows;
     }
     return route.fulfill({json:{data:data??null,error:null}});
    }catch(e){console.log('RPC error',input.name,e.message);return route.fulfill({json:{data:null,error:{message:e.message,code:e.code}}});}
   }
   if(url.hostname==='nugget.test')return route.fulfill({path:path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname))});
   if(url.pathname.endsWith('/supabase.min.js'))return route.fulfill({body:shim,contentType:'application/javascript'});
   if(url.pathname.endsWith('/leaflet.js'))return route.fulfill({path:path.join(assets,'leaflet.js'),contentType:'application/javascript'});
   if(url.pathname.endsWith('/leaflet.css'))return route.fulfill({path:path.join(assets,'leaflet.css'),contentType:'text/css'});
   if(url.pathname.endsWith('/leaflet.markercluster.js'))return route.fulfill({path:path.join(assets,'markercluster.js'),contentType:'application/javascript'});
   if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')return route.fetch().then(response=>route.fulfill({response}));
   if(url.hostname==='tile.openstreetmap.org')return route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA9sAAAAASUVORK5CYII=','base64'),contentType:'image/png'});
   if(url.hostname.includes('overpass'))return route.fulfill({json:{elements:[]}});
   return route.fulfill({body:'',contentType:'text/css'});
  });
  return page;
 }
 const member=await pageFor(1),other=await pageFor(2),moderator=await pageFor(0);
 async function go(page,hash){console.log(width+': '+hash);const destination='https://nugget.test/'+hash;if(page.url()===destination)await page.reload();else await page.goto(destination);await page.waitForFunction(()=>document.getElementById('who').textContent.length>0);await page.evaluate(()=>document.fonts.ready);}
 async function shot(name,hash){await go(member,hash);await member.waitForTimeout(250);assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth),width);const short=await member.locator('button,select,input:not([type=checkbox]),textarea').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length && getComputedStyle(n).visibility!=='hidden' && n.getBoundingClientRect().height<43).map(n=>n.outerHTML.slice(0,120)));assert.deepEqual(short,[],name+' touch targets');const dir=path.join(root,'docs/screenshots/hardening/'+name);fs.mkdirSync(dir,{recursive:true});await member.screenshot({path:path.join(dir,width+'.png')});}
 await go(member,'#/take');await member.locator('#takeTarget option[value=mcnuggets]').waitFor({state:'attached'});
 await member.locator('#takeTarget').selectOption('mcnuggets');await member.locator('#takeText').fill('Local test: <img src=x onerror=alert(1)> crunchy nuggets.');
 await member.getByRole('button',{name:'Post',exact:true}).click();await member.locator('.composer form').evaluate(form=>form.requestSubmit());await member.getByRole('status').filter({hasText:'Could not confirm'}).waitFor();
 await member.getByRole('button',{name:'Post',exact:true}).click();await member.getByRole('status').filter({hasText:'sent for review'}).waitFor();
 assert.equal((await db.pool.query('select count(*)::int n from public.takes')).rows[0].n,1);
 const take=(await db.pool.query('select id from public.takes')).rows[0].id;
 await go(other,'#/feed');await other.waitForTimeout(200);assert.equal(await other.locator('.take-thread').count(),0);
 await go(moderator,'#/mod');await moderator.getByRole('button',{name:'Approve',exact:true}).first().click();
 await moderator.waitForFunction(()=>!document.querySelector('[data-review]'));
 await go(other,'#/take-view?id='+take);await other.locator('.take-thread').waitFor();assert.equal(await other.locator('.take-thread img').count(),0);
 await other.getByRole('button',{name:'I’m with them',exact:true}).click();await other.locator('.reaction-button[aria-pressed=true]').waitFor();
 assert.equal((await db.pool.query('select count(*)::int n from public.take_reactions')).rows[0].n,1);
 await other.locator('.rebut-button').click();await other.locator('#takeText').fill('Local test rebuttal: sauce matters too.');await other.getByRole('button',{name:'Post',exact:true}).click();await other.getByRole('status').filter({hasText:'sent for review'}).waitFor();
 await go(moderator,'#/mod');await moderator.getByRole('button',{name:'Approve',exact:true}).first().click();
 await moderator.waitForFunction(()=>!document.querySelector('[data-review]'));
 await go(other,'#/take-view?id='+take);await other.getByRole('button',{name:'Block author',exact:true}).click();await other.getByRole('status').filter({hasText:'Author blocked'}).waitFor();
 await go(other,'#/take-view?id='+take);await other.getByText('This take is unavailable.').waitFor();
 await shot('main','#/');await shot('spot','#/spot/node%2F1229920544');
 await go(member,'#/product/mcnuggets');const stock=member.locator('[data-place="node/1229920544"]');await stock.getByRole('button',{name:'Seen it',exact:true}).click();await stock.getByText('⋯ UNCONFIRMED',{exact:true}).waitFor();
 await go(other,'#/product/mcnuggets');await other.locator('[data-place="node/1229920544"]').getByRole('button',{name:'Seen it',exact:true}).click();await other.locator('[data-place="node/1229920544"]').getByText('✓ IN STOCK',{exact:true}).waitFor();
 await go(member,'#/prices?place=node%2F1229920544');await member.getByText('Add a price',{exact:true}).click();await member.locator('#priceProduct').selectOption('mcnuggets');await member.locator('#priceAmount').fill('9.99');await member.locator('#priceQuantity').fill('20');
 await member.getByRole('button',{name:'Add price entry',exact:true}).click();await member.getByRole('status').filter({hasText:'Could not confirm'}).waitFor();await member.getByRole('button',{name:'Add price entry',exact:true}).click();await member.locator('#priceQuantity').fill('21');await member.getByRole('status').filter({hasText:'Price entry saved.'}).waitFor();assert.equal(await member.locator('#priceQuantity').inputValue(),'21');
 assert.equal((await db.pool.query('select count(*)::int n from public.price_entries')).rows[0].n,1);
 await shot('prices','#/prices?place=node%2F1229920544');
 await go(member,'#/showdown/cane-vs-cfa');await member.locator('[data-side=left]').click();await member.locator('[data-side=left][aria-pressed=true]').waitFor();await member.locator('[data-side=right]').click();await member.getByRole('status').filter({hasText:'vote_cooldown'}).waitFor();assert.equal((await db.pool.query('select count(*)::int n from public.matchup_votes')).rows[0].n,1);
 await shot('showdown','#/showdown/cane-vs-cfa');await shot('composer','#/take');await shot('badges','#/badges');
 await member.locator('.primary-nav a[data-page=take]').click();await member.waitForFunction(()=>document.activeElement?.tagName==='H1');
 await member.keyboard.press('Tab');assert.equal(await member.evaluate(()=>document.activeElement.matches('[data-reset]')),true);
 await member.keyboard.press('Tab');assert.equal(await member.evaluate(()=>document.activeElement.id),'takeKind');
 await member.locator('#skipContent').focus();await member.keyboard.press('Enter');assert.equal(await member.evaluate(()=>document.activeElement.id),'wavePage');
 await db.pool.query("update public.products set name=$1 where id='mcnuggets'",['Local test long name '+ 'X'.repeat(180)]);
 await member.setViewportSize({width:320,height:844});await go(member,'#/product/mcnuggets');await member.locator('[data-place]').first().waitFor();assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth),320);
 assert.deepEqual(errors,[]);console.log(width+': real database browser flows passed, including lost responses, moderation, blocking, stock, votes and prices');
 }finally{if(browser)await browser.close();await db.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

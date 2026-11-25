const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runInNewContext}=require('node:vm');
const fs=require('node:fs');
test('uncertain submissions reuse their request ID, acknowledged or edited drafts get new IDs',async()=>{
 let seq=0;const window={};runInNewContext(fs.readFileSync(__dirname+'/../js/community.js','utf8'),{window,crypto:{randomUUID:()=>String(++seq)}});
 let fail=true;const calls=[];const client={async rpc(name,args){calls.push(args);return fail?{error:Error('lost response')}:{data:{id:1}};}};
 const post=window.NuggetfinderCommunity.submission(client,'submit_take_request');
 await assert.rejects(post({p_body:'hello'}));fail=false;await post({p_body:'hello'});assert.equal(calls[0].p_request,calls[1].p_request);
 await post({p_body:'hello'});assert.notEqual(calls[1].p_request,calls[2].p_request);
 fail=true;await assert.rejects(post({p_body:'hello'}));await assert.rejects(post({p_body:'edited'}));assert.notEqual(calls[3].p_request,calls[4].p_request);
});

test('same-account retries survive reload and edited drafts without saving draft text',async()=>{
 const {webcrypto}=require('node:crypto');const storage=new Map();const calls=[];let fail=true;
 function app(){const window={};runInNewContext(fs.readFileSync(__dirname+'/../js/community.js','utf8'),{window,crypto:webcrypto,TextEncoder,
 sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});return window.NuggetfinderCommunity;}
 const client={async rpc(name,args){calls.push(args);return fail?{error:Error('lost')}:{data:'saved'};}};
 let post=app().submission(client,'submit_take_request','account-one');await assert.rejects(post({p_body:'Private original draft'}));
 await assert.rejects(post({p_body:'Different draft'}));post=app().submission(client,'submit_take_request','account-one');fail=false;
 await post({p_body:'Private original draft'});assert.equal(calls[0].p_request,calls[2].p_request);
 assert.ok(!JSON.stringify([...storage]).includes('draft'));
 await app().submission(client,'submit_take_request','account-two')({p_body:'Private original draft'});assert.notEqual(calls[0].p_request,calls[3].p_request);
});

test('an account switch prevents a pending draft from being sent as a different account',async()=>{
 const window={};runInNewContext(fs.readFileSync(__dirname+'/../js/community.js','utf8'),{window,crypto:{randomUUID:()=> 'local'}});
 let sent=false;const client={auth:{async getSession(){return{data:{session:{user:{id:'other-account'}}}};}},async rpc(){sent=true;return{data:'saved'};}};
 await assert.rejects(window.NuggetfinderCommunity.submission(client,'submit_take_request','original-account')({p_body:'Private draft'}),/account_changed/);assert.equal(sent,false);
});

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

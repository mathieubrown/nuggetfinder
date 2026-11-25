const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runInNewContext}=require('node:vm');
const fs=require('node:fs');
const context={NuggetfinderCommunity:{pages:{},shell(){}}};
runInNewContext(fs.readFileSync(__dirname+'/../js/badges.js','utf8'),context);
const badges=context.NuggetfinderCommunity.badges;

test('allergen claims need a recognized state and confirmed claims need an HTTPS source',()=>{
  assert.equal(badges.allergen({allergen:'gluten',state:'confirmed_free'}),'');
  assert.equal(badges.allergen({allergen:'gluten',state:'confirmed_free',source_url:'javascript:alert(1)'}),'');
  assert.match(badges.allergen({allergen:'gluten',state:'confirmed_free',source_url:'https://example.test/label'}),/href="https:/);
  assert.match(badges.allergen({allergen:'gluten',state:'suggested_free'}),/FREE\?/);
  assert.match(badges.allergen({allergen:'peanut',state:'contains'}),/contains/);
});
test('sponsored and verified components cannot imply organic voting or grant verification',()=>{
  assert.equal(badges.verified('store',false),'');
  assert.equal(badges.sponsored(null),'');
  const html=badges.sponsored({paid_by:'<brand>',title:'An offer',votes:100,url:'javascript:alert(1)'});
  assert.match(html,/Paid by &lt;brand&gt;/);
  assert.doesNotMatch(html,/100|javascript|organic/);
});

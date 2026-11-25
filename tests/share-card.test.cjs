const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const fs = require('node:fs');

test('one stock report prints UNCONFIRMED on the PNG after Archivo Black loads', async () => {
  const window = {};
  const drawn = [];
  const context = new Proxy({
    fillText(text) { drawn.push(text); },
    measureText() { return { width: 10 }; }
  }, { get(target, key) { return target[key] ?? (() => {}); } });
  let loadFont;
  const fonts = {
    load(font) { assert.match(font, /Archivo Black/); return new Promise(resolve => { loadFont = resolve; }); },
    ready: Promise.resolve()
  };
  const document = {
    fonts,
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === 'a') return { click() {}, remove() {} };
      return { getContext: () => context, toBlob(callback) { callback({}); } };
    }
  };
  const sandbox = { window, document, URL: { createObjectURL: () => 'blob:test' },
    Path2D: class {}, setTimeout() {} };
  for (const name of ['wave-logic', 'catalog', 'share-card']) {
    runInNewContext(fs.readFileSync('js/' + name + '.js', 'utf8'), sandbox);
  }
  const status = window.NuggetfinderWave.stockStatus({
    seen_count: 1, sold_out_count: 0, last_report_at: new Date().toISOString(),valid_until:new Date(Date.now()+60000).toISOString()
  });
  const label = window.NuggetfinderCatalog.statusLabel(status);
  assert.equal(label, '⋯ UNCONFIRMED');
  const download = window.NuggetfinderShare.download({
    status, label, product: 'Chicken McNuggets', productId: 'mcnuggets',
    brand: "McDonald's", place: "McDonald's", area: 'Union Square', username: '@scout'
  });
  assert.deepEqual(drawn, []);
  loadFont();
  await download;
  assert.ok(drawn.includes('⋯ UNCONFIRMED'));
  assert.ok(drawn.includes('@scout'));
  assert.ok(drawn.includes('mathieubrown.github.io/nuggetfinder'));
  assert.ok(!drawn.some(text => /IN STOCK|SAMPLE MAP PIN/.test(text)));
});

test('stock is checked again after delayed font loading before the PNG is drawn',async()=>{
 const window={},drawn=[];let now=1000,release;
 const context=new Proxy({fillText(text){drawn.push(text);},measureText(){return{width:10};}},{get:(target,key)=>target[key]??(()=>{})});
 const sandbox={window,Date:class extends Date{static now(){return now;}},document:{fonts:{load(){return new Promise(resolve=>release=resolve);},ready:Promise.resolve()},
 body:{appendChild(){}},createElement(tag){return tag==='a'?{click(){},remove(){}}:{getContext:()=>context,toBlob(callback){callback({});}};}},URL:{createObjectURL:()=> 'blob:test'},Path2D:class{},setTimeout(){}};
 for(const name of ['wave-logic','catalog','share-card'])runInNewContext(fs.readFileSync('js/'+name+'.js','utf8'),sandbox);
 sandbox.NuggetfinderWave=window.NuggetfinderWave;sandbox.NuggetfinderCatalog=window.NuggetfinderCatalog;
 const stockRow={seen_count:2,sold_out_count:0,last_report_at:new Date(now).toISOString(),local_expires_at:1500};
 const pending=window.NuggetfinderShare.download({stockRow,status:'yes',label:'✓ IN STOCK',product:'Local test',place:'Local store',brand:'Local',area:'',productId:'local'});
 now=2000;release();await pending;
 assert.ok(drawn.includes('◷ STALE'));assert.ok(!drawn.includes('✓ IN STOCK'));
});

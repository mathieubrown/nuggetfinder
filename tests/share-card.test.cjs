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
    seen_count: 1, sold_out_count: 0, last_report_at: '2026-11-14T10:00:00Z'
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

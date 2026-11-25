const {test} = require('node:test');
const assert = require('node:assert/strict');
const {runInNewContext} = require('node:vm');
const fs = require('node:fs');

test('deep links resolve to the same pages used when sign-in restores', () => {
  const window = {location: {hash: '#/trail/12'}, history: {}, addEventListener() {}};
  runInNewContext(fs.readFileSync(__dirname + '/../js/router.js', 'utf8'), {window});
  const current = window.NuggetfinderRouter.current;
  assert.equal(current().page, 'trails');
  assert.equal(current().id, '12');
  window.location.hash = '#/court/34';
  assert.equal(current().page, 'court');
  assert.equal(current().id, '34');
  window.location.hash = '#/taste?user=example';
  assert.equal(current().page, 'taste');
  window.location.hash = '#/trail/invalid';
  assert.equal(current().page, 'trails');
  assert.equal(current().id, undefined);
});

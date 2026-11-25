const {test} = require('node:test');
const assert = require('node:assert/strict');
const {verdict} = require('../js/court-logic.js');

test('Court waits for the round and quorum, then requires 60 percent', () => {
  assert.equal(verdict(100, 0, 0, false), 'open');
  assert.equal(verdict(19, 0, 0, true), 'insufficient');
  assert.equal(verdict(12, 5, 3, true), 'nugget');
  assert.equal(verdict(5, 12, 3, true), 'adjacent');
  assert.equal(verdict(3, 5, 12, true), 'no');
  assert.equal(verdict(11, 5, 4, true), 'divided');
  assert.equal(verdict(10, 10, 0, true), 'divided');
});

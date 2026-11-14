const assert = require('node:assert/strict');
const { test } = require('node:test');
const { stockStatus } = require('../js/wave-logic.js');

test('stock uses votes from distinct reporters counted by the database', () => {
  assert.equal(stockStatus(null), 'none');
  function reportCounts(seen, soldOut) {
    return stockStatus({ seen_count: seen, sold_out_count: soldOut, last_report_at: '2026-11-14T12:00:00Z' });
  }
  assert.equal(reportCounts(0, 0), 'stale');
  assert.equal(reportCounts(1, 0), 'pending');
  assert.equal(reportCounts(0, 1), 'pending');
  assert.equal(reportCounts(1, 1), 'mixed');
  assert.equal(reportCounts(2, 2), 'mixed');
  assert.equal(reportCounts(2, 1), 'yes');
  assert.equal(reportCounts(0, 2), 'nope');
});

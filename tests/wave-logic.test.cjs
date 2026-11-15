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

test('levels and stickers unlock at the published thresholds', () => {
  const { profileProgress } = require('../js/wave-logic.js');
  assert.deepEqual(profileProgress(0), { level: 'Newcomer', stickers: [] });
  assert.equal(profileProgress(1).level, 'Spotter');
  assert.equal(profileProgress(9).stickers.length, 1);
  assert.equal(profileProgress(10).level, 'Regular');
  assert.equal(profileProgress(29).stickers.length, 2);
  assert.deepEqual(profileProgress(30), {
    level: 'Nugget Scout', stickers: ['First stamp', 'On the trail', 'Golden nugget']
  });
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { stockStatus } = require('../js/wave-logic.js');

test('stock uses votes from distinct reporters counted by the database', () => {
  assert.equal(stockStatus(null), 'none');
  function reportCounts(seen, soldOut) {
    return stockStatus({ seen_count: seen, sold_out_count: soldOut, last_report_at: new Date().toISOString(),valid_until:new Date(Date.now()+60000).toISOString() });
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

test('stock snapshots expire conservatively, including delayed responses and missing metadata',()=>{
 const {normalizeSnapshot}=require('../js/wave-logic.js');const start=1000000;
 const row={seen_count:2,sold_out_count:0,last_report_at:new Date(start).toISOString(),checked_at:new Date(start).toISOString(),valid_until:new Date(start+5000).toISOString()};
 const local=normalizeSnapshot(row,start);assert.equal(stockStatus(local,start+4999),'yes');assert.equal(stockStatus(local,start+5000),'stale');
 assert.equal(stockStatus(local,start+10000),'stale');
 assert.equal(stockStatus({...row,valid_until:undefined},start),'stale');
 assert.equal(stockStatus({...row,last_report_at:new Date(start-3*3600000).toISOString(),valid_until:undefined},start),'stale');
 const capped=normalizeSnapshot({...row,valid_until:new Date(start+3600000).toISOString()},start);assert.equal(stockStatus(capped,start+60000),'stale');
});

test('price observation bands use exact elapsed seven and thirty day boundaries',()=>{
 const {priceFreshness}=require('../js/wave-logic.js');const now=Date.now(),day=86400000;
 for(const [age,result] of [[0,'recent'],[7*day,'recent'],[7*day+1,'dated'],[30*day,'dated'],[30*day+1,'historical']])assert.equal(priceFreshness(new Date(now-age).toISOString(),now),result);
 assert.equal(priceFreshness('invalid',now),'unavailable');
});

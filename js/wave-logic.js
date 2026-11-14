(function (root) {
  'use strict';

  // LOGIC-START
  function stockStatus(row) {
    if (!row || !row.last_report_at) return 'none';
    var seen = row.seen_count;
    var soldOut = row.sold_out_count;
    if (seen === 0 && soldOut === 0) return 'stale';
    if (seen === soldOut) return 'mixed';
    if (Math.max(seen, soldOut) < 2) return 'pending';
    return seen > soldOut ? 'yes' : 'nope';
  }
  function profileProgress(points) {
    var levels = [
      { minimum: 0, name: 'Newcomer', sticker: null },
      { minimum: 1, name: 'Spotter', sticker: 'First stamp' },
      { minimum: 10, name: 'Regular', sticker: 'On the trail' },
      { minimum: 30, name: 'Nugget Scout', sticker: 'Golden nugget' }
    ];
    var unlocked = levels.filter(function (level) { return points >= level.minimum; });
    return {
      level: unlocked[unlocked.length - 1].name,
      stickers: unlocked.slice(1).map(function (level) { return level.sticker; })
    };
  }
  // LOGIC-END

  var logic = { stockStatus: stockStatus, profileProgress: profileProgress };
  if (typeof module === 'object' && module.exports) module.exports = logic;
  else root.NuggetfinderWave = logic;
})(typeof window === 'undefined' ? null : window);

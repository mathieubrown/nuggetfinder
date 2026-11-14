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
  // LOGIC-END

  var logic = { stockStatus: stockStatus };
  if (typeof module === 'object' && module.exports) module.exports = logic;
  else root.NuggetfinderWave = logic;
})(typeof window === 'undefined' ? null : window);

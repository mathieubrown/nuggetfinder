(function (root) {
  'use strict';
  // LOGIC-START
  function verdict(nugget, adjacent, no, closed) {
    const total = nugget + adjacent + no;
    if (!closed) return 'open';
    if (total < 20) return 'insufficient';
    const maximum = Math.max(nugget, adjacent, no);
    if (maximum / total < 0.6) return 'divided';
    if (nugget > adjacent && nugget > no) return 'nugget';
    if (adjacent > nugget && adjacent > no) return 'adjacent';
    if (no > nugget && no > adjacent) return 'no';
    return 'divided';
  }
  // LOGIC-END
  const labels = {
    open: '⋯ IN SESSION',
    awaiting: '◷ AWAITING RECORDED RULING',
    insufficient: '◷ NOT ENOUGH VOTES',
    divided: '= COURT DIVIDED',
    nugget: '✓ NUGGET',
    adjacent: '≈ NUGGET-ADJACENT',
    no: '× ABSOLUTELY NOT'
  };
  const colors = {nugget: 'yes', adjacent: 'mixed', no: 'nope'};
  const api = {verdict, labels, colors};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NuggetfinderCourt = api;
})(typeof window === 'undefined' ? null : window);

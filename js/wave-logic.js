(function (root) {
  'use strict';

  // LOGIC-START
  function stockStatus(row, now) {
    if (!row || !row.last_report_at) return 'none';
    now=now==null?Date.now():now;
    var expires=row.local_expires_at==null?Date.parse(row.valid_until):row.local_expires_at;
    if(!Number.isFinite(expires) || now>=expires)return 'stale';
    var seen = row.seen_count;
    var soldOut = row.sold_out_count;
    if (seen === 0 && soldOut === 0) return 'stale';
    if (seen === soldOut) return 'mixed';
    if (Math.max(seen, soldOut) < 2) return 'pending';
    return seen > soldOut ? 'yes' : 'nope';
  }
  function normalizeSnapshot(row, requestStarted) {
    if(!row)return null;
    var ttl=Math.min(60000,Math.max(0,Date.parse(row.valid_until)-Date.parse(row.checked_at)));
    return Object.assign({},row,{local_expires_at:requestStarted+(Number.isFinite(ttl)?ttl:0)});
  }
  function priceFreshness(observedAt, now) {
    var age=(now==null?Date.now():now)-Date.parse(observedAt);
    if(!Number.isFinite(age) || age<0)return 'unavailable';
    if(age<=7*86400000)return 'recent';
    if(age<=30*86400000)return 'dated';
    return 'historical';
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

  var logic = { stockStatus: stockStatus, normalizeSnapshot: normalizeSnapshot, priceFreshness: priceFreshness, profileProgress: profileProgress };
  logic.watchConfidence=function(element,draw,refresh){
    var last=Date.now(),busy=false;
    function tick(force){
      if(!element.isConnected){clearInterval(timer);document.removeEventListener('visibilitychange',visible);return;}
      draw();
      if((force || Date.now()-last>=30000) && !busy && document.visibilityState!=='hidden'){
        last=Date.now();busy=true;Promise.resolve(refresh()).catch(function(){}).finally(function(){busy=false;});
      }
    }
    function visible(){if(document.visibilityState!=='hidden')tick(true);}
    var timer=setInterval(function(){tick(false);},1000);document.addEventListener('visibilitychange',visible);
  };
  if (typeof module === 'object'  && module.exports) module.exports = logic;
  else root.NuggetfinderWave = logic;
})(typeof window === 'undefined' ? null : window);

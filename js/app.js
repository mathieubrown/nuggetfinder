(function () {
'use strict';

// LOGIC-START
var WINDOW_MS = 2 * 60 * 60 * 1000;      // a report counts for 2 hours
var STALE_MS = 24 * 60 * 60 * 1000;      // then shows as stale until 24 hours, then is dropped
var COOLDOWN_MS = 10 * 60 * 1000;        // one report per spot per 10 minutes on this device
var SERVER_QUORUM = 2;                   // shared mode: two different people must agree before a status flips

var MENU_NOTE = 'Typical for this chain. Not verified at this location.';
var CHAINS = [
  { id: 'mcdonalds', label: "McDonald's", re: /mcdonald/i, kind: 'fast', menu: ['nuggets', 'sauce', 'sides'] },
  { id: 'cfa', label: 'Chick-fil-A', re: /chick-?fil-?a/i, kind: 'fast', menu: ['nuggets', 'tenders', 'sauce', 'sides'] },
  { id: 'popeyes', label: 'Popeyes', re: /popeyes/i, kind: 'fast', menu: ['tenders', 'sauce', 'sides'] },
  { id: 'kfc', label: 'KFC', re: /\bkfc\b|kentucky fried/i, kind: 'fast', menu: ['nuggets', 'tenders', 'sauce', 'sides'] },
  { id: 'canes', label: "Raising Cane's", re: /raising cane/i, kind: 'fast', menu: ['tenders', 'sauce', 'sides'] },
  { id: 'wendys', label: "Wendy's", re: /wendy/i, kind: 'fast', menu: ['nuggets', 'sauce', 'sides'] },
  { id: 'jitb', label: 'Jack in the Box', re: /jack in the box/i, kind: 'fast', menu: ['nuggets', 'tenders', 'sauce', 'sides'] },
  { id: 'safeway', label: 'Safeway', re: /safeway/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'target', label: 'Target', re: /target/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'walmart', label: 'Walmart', re: /walmart/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'wholefoods', label: 'Whole Foods', re: /whole foods/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'traderjoes', label: "Trader Joe's", re: /trader joe/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'costco', label: 'Costco', re: /costco/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'luckys', label: 'Lucky', re: /\blucky\b/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'foodsco', label: 'Foods Co', re: /foods co/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] },
  { id: 'groceryoutlet', label: 'Grocery Outlet', re: /grocery outlet/i, kind: 'grocery', menu: ['nuggets', 'tenders', 'sauce'] }
];

function matchChain(text) {
  for (var i = 0; i < CHAINS.length; i++) {
    if (CHAINS[i].re.test(text || '')) return CHAINS[i];
  }
  return null;
}

// state: yes | nope | mixed | pending (not enough agreement yet) | stale | none
function classify(y, n, old, quorum) {
  if (y + n > 0) {
    if (Math.max(y, n) >= quorum) return y > n ? 'yes' : (n > y ? 'nope' : 'mixed');
    return 'pending';
  }
  return old > 0 ? 'stale' : 'none';
}

// Local mode: works from this device's own reports. Returns {state, y, n, latest, fadesInMs}.
function statusFor(reports, pid, now, quorum) {
  var y = 0, n = 0, old = 0, latestActive = 0, latestOld = 0;
  for (var i = 0; i < reports.length; i++) {
    var r = reports[i];
    if (r.pid !== pid) continue;
    var age = now - r.t;
    if (age <= WINDOW_MS) {
      if (r.s === 'yes') y++; else n++;
      if (r.t > latestActive) latestActive = r.t;
    } else if (age <= STALE_MS) {
      old++;
      if (r.t > latestOld) latestOld = r.t;
    }
  }
  var state = classify(y, n, old, quorum || 1);
  var latest = latestActive || latestOld;
  var fadesInMs = latestActive ? Math.max(0, latestActive + WINDOW_MS - now) : 0;
  return { state: state, y: y, n: n, latest: latest, fadesInMs: fadesInMs };
}

// Shared mode: c = {y, n, latest, lastAny} from the server (counts of different people, ms timestamps).
function statusFromCounts(c, now, quorum) {
  if (!c) return { state: 'none', y: 0, n: 0, latest: 0, fadesInMs: 0 };
  var state = classify(c.y, c.n, c.lastAny ? 1 : 0, quorum);
  var latest = c.latest || c.lastAny || 0;
  var fadesInMs = c.latest ? Math.max(0, c.latest + WINDOW_MS - now) : 0;
  return { state: state, y: c.y, n: c.n, latest: latest, fadesInMs: fadesInMs };
}

// Returns milliseconds left on the cooldown for this spot, or 0 if a report is allowed.
function cooldownLeft(reports, pid, now) {
  var last = 0;
  for (var i = 0; i < reports.length; i++) {
    if (reports[i].pid === pid && reports[i].t > last) last = reports[i].t;
  }
  var left = last + COOLDOWN_MS - now;
  return left > 0 ? left : 0;
}

function pruneReports(reports, now) {
  return reports.filter(function (r) { return now - r.t <= STALE_MS; });
}

function miles(aLat, aLng, bLat, bLng) {
  var R = 3958.8, toRad = Math.PI / 180;
  var dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function agoText(ms) {
  var m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.floor(m / 60);
  return h + ' hr ago';
}

function spanText(ms) {
  var m = Math.max(1, Math.ceil(ms / 60000));
  if (m < 60) return m + ' min';
  var h = Math.floor(m / 60), r = m % 60;
  return h + ' hr' + (r ? ' ' + r + ' min' : '');
}
// LOGIC-END

var BBOX = '37.62,-122.53,37.812,-122.35';   // SF, South San Francisco, Daly City
var CACHE_KEY = 'nf.places.v1';
var REPORT_KEY = 'nf.reports.v1';
var CACHE_TTL = 24 * 60 * 60 * 1000;

// The publishable key is meant to be public. Row level security in the database is what protects the data.
var SUPABASE_URL = 'https://jytfarejfcqexxbtnlqu.supabase.co';
var SUPABASE_KEY = 'sb_publishable_kGEH96ESdQ2xhebZFr5A5A_tQ9BWJqn';

function withCatalogPlaces(mapPlaces) {
  var places = new Map(mapPlaces.map(function (place) { return [place.id, place]; }));
  NuggetfinderSeed.places.forEach(function (place) {
    places.set(place.id, {
      id: place.id, name: place.name, chain: place.chain,
      lat: place.latitude, lng: place.longitude, place: place.area
    });
  });
  return Array.from(places.values());
}

var ICONS = {
  yes: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M3 8.5l3.2 3.2L13 5"/></svg>',
  nope: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  mixed: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M3 6h10M3 10h10"/></svg>',
  stale: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
  none: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M4 8h8"/></svg>',
  pending: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.8"/><circle cx="8" cy="8" r="1.8"/><circle cx="12.5" cy="8" r="1.8"/></svg>'
};
var WORDS = { yes: 'NUGGETS', nope: 'NOPE', mixed: 'MIXED', pending: 'UNCONFIRMED', stale: 'STALE', none: 'NO REPORTS' };

var state = {
  places: [],
  usingSeed: false,
  reports: [],
  query: '',
  menu: 'all',
  nowOnly: false,
  selected: null,
  userLoc: null,
  server: false,
  serverCounts: {},
  user: null,
  ref: { lat: 37.7599, lng: -122.435 }
};

var panel = document.getElementById('panel');
var toastEl = document.getElementById('toast');
var toastTimer = null;
var markers = null;
var map = null;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3500);
}

function loadJSON(key, fallback) {
  try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode or blocked storage */ }
}

function chainById(id) {
  for (var i = 0; i < CHAINS.length; i++) if (CHAINS[i].id === id) return CHAINS[i];
  return null;
}

function placeLabel(p) {
  return p.place ? p.name + ' · ' + p.place : p.name;
}

function parseOverpass(json) {
  var seen = {}, out = [];
  (json.elements || []).forEach(function (el) {
    var tags = el.tags || {};
    var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    var lng = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (lat == null || lng == null) return;
    var ch = matchChain((tags.name || '') + ' ' + (tags.brand || ''));
    if (!ch) return;
    var id = el.type + '/' + el.id;
    if (seen[id]) return;
    seen[id] = true;
    var street = tags['addr:street'] ? ((tags['addr:housenumber'] ? tags['addr:housenumber'] + ' ' : '') + tags['addr:street']) : '';
    out.push({ id: id, name: ch.label, chain: ch.id, lat: lat, lng: lng, place: street || tags['addr:suburb'] || tags['addr:city'] || '' });
  });
  return out;
}

async function readCatalogMapPlaces() {
  if (!sb) return [];
  try {
    var result = await sb.from('places').select('id,name,area,latitude,longitude');
    if (result.error) return [];
    return result.data.flatMap(function (place) {
      var chain = matchChain(place.name);
      return chain ? [{id:place.id,name:place.name,chain:chain.id,lat:place.latitude,
        lng:place.longitude,place:place.area}] : [];
    });
  } catch (error) { return []; }
}

function fetchPlaces() {
  var cached = loadJSON(CACHE_KEY, null);
  if (cached && cached.places && cached.places.length && Date.now() - cached.ts < CACHE_TTL) {
    return Promise.resolve({ places: withCatalogPlaces(cached.places.filter(function (place) { return /^(node|way|relation)\/[0-9]+$/.test(place.id); })), seed: false });
  }
  var q = '[out:json][timeout:40];(' +
    'nwr["amenity"="fast_food"]["name"~"McDonald|Chick-fil-A|Popeyes|KFC|Kentucky Fried|Raising Cane|Wendy|Jack in the Box",i](' + BBOX + ');' +
    'nwr["shop"~"supermarket|department_store"]["name"~"Safeway|Target|Walmart|Whole Foods|Trader Joe|Costco|Lucky|Foods Co|Grocery Outlet",i](' + BBOX + ');' +
    ');out center tags;';
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, 30000);
  return fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
    signal: ctl.signal
  }).then(function (r) {
    clearTimeout(timer);
    if (!r.ok) throw new Error('Overpass ' + r.status);
    return r.json();
  }).then(function (json) {
    var places = parseOverpass(json);
    if (!places.length) throw new Error('No places returned');
    saveJSON(CACHE_KEY, { ts: Date.now(), places: places });
    return { places: withCatalogPlaces(places), seed: false };
  }).catch(function () {
    clearTimeout(timer);
    return { places: withCatalogPlaces([]), seed: true };
  });
}

function refPoint() { return state.userLoc || state.ref; }

function statusOf(pid, now) {
  if (state.server) return statusFromCounts(state.serverCounts[pid], now, SERVER_QUORUM);
  return statusFor(state.reports, pid, now, 1);
}

function visiblePlaces(now) {
  var q = state.query.trim().toLowerCase();
  return state.places.filter(function (p) {
    var ch = chainById(p.chain);
    if (state.menu !== 'all' && (!ch || ch.menu.indexOf(state.menu) === -1)) return false;
    if (q && placeLabel(p).toLowerCase().indexOf(q) === -1) return false;
    if (state.nowOnly && statusOf(p.id, now).state !== 'yes') return false;
    return true;
  });
}

function statHTML(st, key) {
  return '<span class="stat s-' + st + '" data-stamp-key="' + esc(key) + '" data-stamp-status="' + st + '">' + ICONS[st].replace('width="18" height="18"', 'width="14" height="14"') + esc(WORDS[st]) + '</span>';
}

function metaText(p, s, now) {
  var ref = refPoint();
  var d = miles(ref.lat, ref.lng, p.lat, p.lng);
  var dist = d < 10 ? d.toFixed(1) + ' mi' : Math.round(d) + ' mi';
  var rep;
  if (s.state === 'none') rep = 'No reports yet';
  else if (s.state === 'pending') rep = (s.y + s.n === 1) ? 'Needs a second report' : 'Split so far';
  else if (s.state === 'stale') rep = 'Last report ' + agoText(now - s.latest);
  else rep = (s.y + s.n) + (s.y + s.n === 1 ? ' report' : ' reports') + ' · ' + agoText(now - s.latest);
  return s.state === 'none' ? dist : dist + ' · ' + rep;
}

function pinIcon(st, selected) {
  return L.divIcon({
    className: '',
    html: '<div class="pin p-' + st + (selected ? ' sel' : '') + '">' + ICONS[st] + '</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function renderMarkers() {
  if (!map) return;
  var now = Date.now();
  markers.clearLayers();
  visiblePlaces(now).forEach(function (p) {
    var st = statusOf(p.id, now).state;
    var m = L.marker([p.lat, p.lng], {
      icon: pinIcon(st, state.selected === p.id),
      title: placeLabel(p),
      keyboard: true
    });
    m.on('click', function () { select(p.id, false); });
    markers.addLayer(m);
  });
}

var stampsByPlace = new Map();
function updatePlaceStamps() {
  var changed = NuggetfinderStamp.update(panel.querySelectorAll('[data-stamp-key]'), stampsByPlace);
  changed.forEach(function (status, key) { stampsByPlace.set(key, status); });
}

function renderPanel() {
  var now = Date.now();
  var html = '';
  var sel = state.selected && state.places.filter(function (p) { return p.id === state.selected; })[0];
  document.body.classList.toggle('map-home', !sel && !mapApp.hidden);
  if (sel) { panel.innerHTML = detailHTML(sel, now); updatePlaceStamps();
    if (NuggetfinderSeed.places.some(function (place) { return place.id === sel.id; })) {
      NuggetfinderCommunity.addSaveButtons(panel, sb, state.user, 'place', sel.id, openAuth);
    }
    return; }

  var menus = ['nuggets', 'tenders', 'sauce', 'sides'];
  html += '<div class="search"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#161514" stroke-width="2.5" stroke-linecap="square"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l5 5"/></svg>' +
    '<label class="visually-hidden" for="q">Search spots</label>' +
    '<input id="q" type="search" placeholder="Search spots or streets" autocomplete="off" value="' + esc(state.query) + '"></div>';
  html += '<div class="chips" role="group" aria-label="Filter by menu">';
  menus.forEach(function (m) {
    html += '<button class="chip" data-menu="' + m + '" aria-pressed="' + (state.menu === m) + '">' + (m === 'all' ? 'ALL' : m.toUpperCase()) + '</button>';
  });
  html += '<button class="chip" data-action="now" aria-pressed="' + state.nowOnly + '">NUGGETS NOW</button></div>';

  var list = visiblePlaces(now);
  var ref = refPoint();
  list.sort(function (a, b) { return miles(ref.lat, ref.lng, a.lat, a.lng) - miles(ref.lat, ref.lng, b.lat, b.lng); });

  if (state.usingSeed) {
    html += '<div class="note">Showing saved OpenStreetMap locations. Reload to retry the live map search.</div>';
  }
  html += '<div class="sheet-handle" aria-hidden="true"></div><div class="tools"><span class="heading">' + (state.userLoc ? 'NEAR YOU' : 'NEAR YOU') + '</span>' +
    '<button class="link-btn" data-action="locate">USE MY LOCATION</button></div>';
  html += '<div class="small">' + list.length + (list.length === 1 ? ' spot' : ' spots') + ' · ' +
    (state.server ? 'reports fade after 2 hours' : 'reports saved on this device only') + '</div>';
  html += '<details class="legend"><summary>What the icons mean</summary><p>Check: nuggets. X: nope. Bars: mixed. Dots: unconfirmed, a second person has to agree. Clock: stale. Dash: no reports.</p></details>';

  html += '<div class="list">';
  list.slice(0, 40).forEach(function (p) {
    var s = statusOf(p.id, now);
    html += '<button class="row" data-id="' + esc(p.id) + '"><span class="rowmain"><span class="rname">' + esc(p.name) + '</span><span class="rmeta">' + esc((p.place ? p.place + ' · ' : '') + metaText(p, s, now)) + '</span></span>' + statHTML(s.state, p.id) + '</button>';
  });
  if (!list.length) html += '<p class="small">Nothing matches. Try clearing a filter.</p>';
  if (list.length > 40) html += '<p class="small">Showing the nearest 40. Search or filter to narrow it down.</p>';
  html += '</div>';
  panel.innerHTML = html;
  updatePlaceStamps();
}

function detailHTML(p, now) {
  var s = statusOf(p.id, now);
  var ch = chainById(p.chain);
  var sub;
  if (s.state === 'yes' || s.state === 'nope' || s.state === 'mixed') {
    sub = (s.y + s.n) + (s.y + s.n === 1 ? ' report' : ' reports') + '. Last one ' + agoText(now - s.latest) + '. Fades in ' + spanText(s.fadesInMs) + '.';
  } else if (s.state === 'pending') {
    sub = (s.y + s.n === 1) ? 'One person has reported. A second person has to agree before this flips.' : 'Reports are split. More people have to agree before this flips.';
  } else if (s.state === 'stale') {
    sub = 'No recent reports. Last one ' + agoText(now - s.latest) + '. Be the first to check.';
  } else {
    sub = 'Nobody has reported here yet. Be the first.';
  }
  var cls = 's-' + s.state;
  var h = '<button class="back" data-action="back"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="M11 3L5 9l6 6"/></svg>ALL SPOTS</button>';
  h += '<div><div class="dname">' + esc(p.name.toUpperCase()) + '</div><div class="small">' + esc(p.place || '') + (p.place ? ' · ' : '') + esc(metaText(p, s, now).split(' · ')[0]) + ' away</div></div>';
  h += '<div class="block ' + cls + '" data-stamp-key="' + esc(p.id) + '" data-stamp-status="' + s.state + '"><div class="word' + (WORDS[s.state].length > 8 ? ' long' : '') + '">' + ICONS[s.state].replace('width="18" height="18"', 'width="34" height="34"') + esc(WORDS[s.state]) + '</div><div>' + esc(sub) + '</div>' +
    '<div class="btns"><button class="big yes" data-report="yes">NUGGETS HERE</button><button class="big no" data-report="nope">NOPE</button></div></div>';
  if (ch) {
    h += '<div><div class="heading">TYPICAL MENU</div><div class="tags" style="margin-top:8px">';
    ch.menu.forEach(function (m) { h += '<span class="tag">' + m.toUpperCase() + '</span>'; });
    h += '</div><div class="small" style="margin-top:6px">' + MENU_NOTE + '</div></div>';
  }
  h += '<div class="soon"><span class="heading">' + NuggetfinderShowdown.active + '</span><span><a class="wave-link" href="#/showdown">' + NuggetfinderShowdown.pick + '</a></span></div>';
  h += '<div class="soon alt"><span class="heading">PRICES</span><span>Store listings and the price ledger are coming next.</span></div>';
  h += '<a class="maps-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.lat + ',' + p.lng) + '">Get directions</a>';
  if (NuggetfinderSeed.places.some(function (place) { return place.id === p.id; })) {
    h += '<a class="wave-link" href="#/take?kind=place&ref=' + encodeURIComponent(p.id) +
      '&label=' + encodeURIComponent(p.name) + '">Drop a take</a>';
  }
  return h;
}

function select(id, pan) {
  NuggetfinderRouter.openSpot(id);
  showSpot(id, pan);
}

function showSpot(id, pan) {
  state.selected = id;
  var p = state.places.filter(function (x) { return x.id === id; })[0];
  renderMarkers();
  renderPanel();
  panel.scrollTop = 0;
  if (p && pan !== false) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
}

function report(id, s) {
  if (state.server) return serverReport(id, s);
  var now = Date.now();
  var left = cooldownLeft(state.reports, id, now);
  if (left > 0) {
    toast('You already reported here. You can report again in ' + spanText(left) + '.');
    return;
  }
  state.reports.push({ pid: id, s: s, t: now });
  state.reports = pruneReports(state.reports, now);
  saveJSON(REPORT_KEY, state.reports);
  renderMarkers();
  renderPanel();
  toast(s === 'yes' ? 'Thanks. Marked as nuggets. This fades in 2 hours.' : 'Thanks. Marked as nope. This fades in 2 hours.');
}

// ---- Shared mode (Supabase) ----
var sb = null;
var authDlg = document.getElementById('auth');
var authBtn = document.getElementById('authBtn');
var whoEl = document.getElementById('who');

function errorText(msg) {
  msg = String(msg || '');
  if (msg.indexOf('cooldown') !== -1) return 'You already reported here. Try again in about 10 minutes.';
  if (msg.indexOf('daily_limit') !== -1) return 'You hit today\'s report limit. Try again tomorrow.';
  if (msg.indexOf('banned') !== -1) return 'This account is paused.';
  if (msg.indexOf('age_required') !== -1) return 'Confirm you are 13 or older to report. Sign in again and tick the box.';
  if (msg.indexOf('sign_in_required') !== -1) return 'Sign in to report.';
  return 'Could not send your report. Try again in a moment.';
}

function nearPlace(id) {
  if (!state.userLoc) return false;
  var p = state.places.filter(function (x) { return x.id === id; })[0];
  return !!p && miles(state.userLoc.lat, state.userLoc.lng, p.lat, p.lng) < 0.3;   // only a yes/no is stored, never the coordinates
}

function refreshStatuses() {
  if (!sb) return Promise.resolve(false);
  return sb.rpc('place_statuses').then(function (res) {
    if (res.error) { state.server = false; return false; }
    var m = {};
    (res.data || []).forEach(function (r) {
      m[r.place_id] = {
        y: r.yes_count || 0,
        n: r.nope_count || 0,
        latest: r.latest_at ? Date.parse(r.latest_at) : 0,
        lastAny: r.last_at ? Date.parse(r.last_at) : 0
      };
    });
    state.serverCounts = m;
    state.server = true;
    return true;
  }).catch(function () { state.server = false; return false; });
}

function serverReport(id, s) {
  if (!state.user) { openAuth('Sign in to report. Browsing stays open to everyone.'); return; }
  sb.rpc('submit_report', { p_place: id, p_status: s, p_near: nearPlace(id) }).then(function (res) {
    if (res.error) { toast(errorText(res.error.message)); return; }
    return refreshStatuses().then(function () {
      renderMarkers();
      renderPanel();
      toast('Thanks. Your report counts for 2 hours.');
    });
  }).catch(function () { toast(errorText('')); });
}

function openAuth(msg) {
  document.getElementById('authMsg').textContent = msg || 'We email you a sign-in link. No password.';
  document.getElementById('authSend').disabled = false;
  if (authDlg.showModal) authDlg.showModal(); else authDlg.setAttribute('open', '');
  document.getElementById('email').focus();
}

function closeAuth() {
  if (authDlg.close) authDlg.close(); else authDlg.removeAttribute('open');
}

function setUser(u) {
  state.user = u;
  var page = location.hash.slice(2).split(/[/?]/)[0];
  if (NuggetfinderCommunity.pages[page] && !wavePage.hidden) {
    setTimeout(function () { window.dispatchEvent(new Event('hashchange')); }, 0);
  }
  if (location.hash === '#/me' && !wavePage.hidden) showProfile();
  authBtn.textContent = u ? 'SIGN OUT' : 'SIGN IN';
  whoEl.textContent = '';
  whoEl.hidden = true;
  if (u && sb) {
    sb.from('profiles').select('handle,handle_set').eq('id', u.id).maybeSingle().then(function (res) {
      if (!res.data || !res.data.handle) return;
      whoEl.textContent = '@' + res.data.handle;
      whoEl.hidden = false;
      state.handleSet = !!res.data.handle_set;
      if (!res.data.handle_set && state.nameAsked !== u.id) { state.nameAsked = u.id; openName(); }
    });
  }
}

// ---- Username picker ----
var nameDlg = document.getElementById('nameDlg');
var nameInput = document.getElementById('nameInput');
var nameMsg = document.getElementById('nameMsg');
var nameSave = document.getElementById('nameSave');
var NAME_HELP = nameMsg.textContent;

function nameErrorText(msg) {
  msg = String(msg || '');
  if (msg.indexOf('handle_taken') !== -1) return 'That name is taken. Try another.';
  if (msg.indexOf('handle_blocked') !== -1 || msg.indexOf('handle_reserved') !== -1) return 'That name is not allowed. Try another.';
  if (msg.indexOf('handle_cooldown') !== -1) return 'You can change your username once every 30 days.';
  if (msg.indexOf('handle_invalid') !== -1) return 'Use 3 to 20 letters, numbers or underscores.';
  if (msg.indexOf('banned') !== -1) return 'This account is paused.';
  return 'Could not save that. Try again in a moment.';
}

function openName() {
  nameMsg.textContent = NAME_HELP;
  nameSave.disabled = false;
  nameInput.value = state.handleSet ? whoEl.textContent.replace(/^@/, '') : '';
  if (nameDlg.showModal) nameDlg.showModal(); else nameDlg.setAttribute('open', '');
  nameInput.focus();
}

function closeName() {
  if (nameDlg.close) nameDlg.close(); else nameDlg.removeAttribute('open');
}

whoEl.addEventListener('click', openName);
document.getElementById('nameCancel').addEventListener('click', closeName);
document.getElementById('nameForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var v = nameInput.value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(v)) { nameMsg.textContent = 'Use 3 to 20 letters, numbers or underscores.'; return; }
  nameSave.disabled = true;
  sb.rpc('set_handle', { p_handle: v }).then(function (res) {
    if (res.error) { nameMsg.textContent = nameErrorText(res.error.message); nameSave.disabled = false; return; }
    whoEl.textContent = '@' + v;
    state.handleSet = true;
    closeName();
    if (location.hash === '#/me') showProfile();
    toast('Welcome, @' + v + '.');
  }).catch(function () { nameMsg.textContent = nameErrorText(''); nameSave.disabled = false; });
});

function initSupabase() {
  if (!window.supabase || !SUPABASE_URL) return;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  sb.auth.getSession().then(function (r) { setUser(r.data && r.data.session ? r.data.session.user : null); });
  sb.auth.onAuthStateChange(function (event, session) { setUser(session ? session.user : null); });
}

authBtn.addEventListener('click', function () {
  if (!sb) { toast('Sign-in is not available right now.'); return; }
  if (state.user) { sb.auth.signOut(); toast('Signed out.'); return; }
  openAuth();
});
document.getElementById('authCancel').addEventListener('click', closeAuth);
document.getElementById('authForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var email = document.getElementById('email').value.trim();
  var msg = document.getElementById('authMsg');
  var send = document.getElementById('authSend');
  if (!email || !document.getElementById('age').checked) return;
  send.disabled = true;
  sb.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: location.href.split('#')[0], data: { age_confirmed: true } }
  }).then(function (res) {
    if (res.error) { msg.textContent = 'Could not send the link. Check the address and try again.'; send.disabled = false; return; }
    msg.textContent = 'Check your email for the sign-in link. You can close this window.';
  }).catch(function () { msg.textContent = 'Could not send the link. Try again in a moment.'; send.disabled = false; });
});

function locate() {
  if (!navigator.geolocation) { toast('Location is not available in this browser.'); return; }
  navigator.geolocation.getCurrentPosition(function (pos) {
    state.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };   // kept in memory only
    map.flyTo([state.userLoc.lat, state.userLoc.lng], 14);
    renderPanel();
  }, function () {
    toast('Could not get your location. Showing spots near the map center.');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}

panel.addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.id) return select(t.dataset.id);
  if (t.dataset.menu) { state.menu = state.menu === t.dataset.menu ? 'all' : t.dataset.menu; renderMarkers(); return renderPanel(); }
  if (t.dataset.report) return report(state.selected, t.dataset.report);
  var a = t.dataset.action;
  if (a === 'back') { NuggetfinderRouter.openHome(); return showSpot(null, false); }
  if (a === 'now') { state.nowOnly = !state.nowOnly; renderMarkers(); return renderPanel(); }
  if (a === 'locate') return locate();
});

panel.addEventListener('input', function (e) {
  if (e.target.id !== 'q') return;
  state.query = e.target.value;
  var pos = e.target.selectionStart;
  renderMarkers();
  renderPanel();
  var input = document.getElementById('q');
  if (input) { input.focus(); try { input.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
});

function initMap() {
  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  map.fitBounds([[37.62, -122.53], [37.812, -122.35]]);
  markers = (L.markerClusterGroup ? L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 44,
    disableClusteringAtZoom: 15,
    animate: false,
    iconCreateFunction: function (c) {
      return L.divIcon({ className: '', html: '<div class="cl">' + c.getChildCount() + '</div>', iconSize: [40, 40], iconAnchor: [20, 20] });
    }
  }) : L.layerGroup()).addTo(map);
  var t = null;
  map.on('moveend', function () {
    var c = map.getCenter();
    state.ref = { lat: c.lat, lng: c.lng };
    clearTimeout(t);
    t = setTimeout(function () { if (!state.selected && !state.userLoc && document.activeElement && document.activeElement.id !== 'q') renderPanel(); }, 400);
  });
  window.addEventListener('resize', function () { map.invalidateSize(); });
}

var wavePage = document.getElementById('wavePage');
var mapApp = document.getElementById('mapApp');

function showProfile() {
  NuggetfinderProfile.show(wavePage, sb, state.user, esc, openAuth, openName);
}

function showRoute(route) {
  var catalog = route.page === 'products' || route.page === 'product';
  var profile = route.page === 'me';
  var community = NuggetfinderCommunity.pages[route.page];
  wavePage.hidden = !(catalog || profile || community);
  mapApp.hidden = catalog || profile || !!community;
  document.body.classList.toggle('map-home', !mapApp.hidden && route.page === 'home');
  if (community) return community(wavePage, route, sb, state.user, esc, openAuth, state.places);
  if (profile) return showProfile();
  if (catalog) return NuggetfinderCatalog.show(wavePage, route, sb, esc, {
    user: function () { return state.user; }, username: function () {
      return state.user && !whoEl.hidden ? whoEl.textContent : '';
    }, signIn: openAuth, reportError: errorText
  });
  map.invalidateSize();
  var id = route.spotId;
  var found = id && state.places.some(function (place) { return place.id === id; });
  showSpot(found ? id : null, !!found);
}

function start() {
  state.reports = pruneReports(loadJSON(REPORT_KEY, []), Date.now());
  initMap();
  initSupabase();
  panel.innerHTML = '<p class="small">Loading spots from OpenStreetMap...</p>';
  var currentRoute;
  NuggetfinderRouter.listen(function (route) {
    currentRoute = route;
    if (state.places.length || route.page !== 'spot') showRoute(route);
  });
  Promise.all([fetchPlaces(), readCatalogMapPlaces()]).then(function (results) {
    var res = results[0];
    var places = new Map(res.places.map(function (place) { return [place.id, place]; }));
    results[1].forEach(function (place) { places.set(place.id, place); });
    state.places = Array.from(places.values());
    state.usingSeed = res.seed;
    return refreshStatuses();
  }).then(function () {
    if (!mapApp.hidden) showRoute(currentRoute);
  });
  setInterval(function () {
    var a = document.activeElement;
    if (a && a.id === 'q') return;
    if (!wavePage.hidden && location.hash.startsWith('#/product/')) NuggetfinderCatalog.refresh();
    refreshStatuses().then(function () {
      renderMarkers();
      renderPanel();
    });
  }, 60000);
}

start();
})();

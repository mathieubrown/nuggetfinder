window.NuggetfinderCatalog = (function () {
  'use strict';

  async function readCatalog(client) {
    if (!client) return NuggetfinderSeed;
    var [products, links] = await Promise.all([
      client.from('products').select('id,brand,name,kind').order('name'),
      client.from('place_products').select('product_id,place_id,places(id,name,area,source)')
    ]);
    if (products.error || links.error) throw new Error('Catalog unavailable');
    return { products: products.data, links: links.data };
  }

  var labels = {
    yes: '✓ IN STOCK', nope: '× SOLD OUT', mixed: '= MIXED',
    pending: '⋯ UNCONFIRMED', stale: '◷ STALE', none: '− NO REPORTS'
  };

  function statusLabel(status) { return labels[status]; }

  function dateLabel(value) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function showStock(root, product, links, client, options, id) {
    var cards = Array.from(root.querySelectorAll('[data-place]'));
    if (!cards.length) return;
    var stampHistory = new Map();
    var available = false;
    var submitting = false;
    var stockRows = new Map();
    var feedback = root.querySelector('.stock-feedback');
    function enableButtons() {
      cards.forEach(function (card) {
        card.querySelectorAll('button[data-stock]').forEach(function (button) {
          button.disabled = !available || submitting;
        });
      });
    }

    function placeIsRare(card) {
      var place = links.find(function (link) { return link.place_id === card.dataset.place; }).places;
      return place.source === 'community' || place.source === 'community_discovery';
    }


    async function checkFirstConfirmation() {
      var user = options.user();
      if (!user || !client) return;
      try {
        var response = await client.rpc('my_wave_profile').single();
        if (response.error || options.user()?.id !== user.id || !root.contains(feedback)) return;
        var points = Number(response.data.points);
        if (pointsByUser.get(user.id) === 0 && points > 0) NuggetfinderSparkle.celebrate(root);
        pointsByUser.set(user.id, points);
      } catch (error) {
        // Reporting still works if profile points cannot be fetched.
      }
    }

    var stockRequest = 0;
    async function refresh() {
      var request = ++stockRequest;
      try {
        if (!client) throw new Error('Offline');
        var response = await client.rpc('product_stock', { p_product: product.id });
        if (response.error) throw response.error;
        if (request !== stockRequest || id !== renderId || !root.contains(feedback)) return;
        stockRows = new Map(response.data.map(function (row) { return [row.place_id, row]; }));
        cards.forEach(function (card) {
          var row = stockRows.get(card.dataset.place);
          var status = NuggetfinderWave.stockStatus(row);
          var stamp = card.querySelector('.stat');
          stamp.className = 'stat stock-stamp s-' + status;
          stamp.dataset.stampKey = card.dataset.place;
          stamp.dataset.stampStatus = status;
          stamp.textContent = statusLabel(status);

          card.querySelector('.last-seen').textContent = row && row.last_seen_at
            ? 'Last seen: ' + dateLabel(row.last_seen_at) : 'Last seen: no recent sightings';
          card.querySelector('.last-report').textContent = row
            ? 'Latest report: ' + dateLabel(row.last_report_at) : '';
        });
        stampHistory = NuggetfinderStamp.update(root.querySelectorAll('[data-stamp-key]'), stampHistory);
        available = true;
        checkFirstConfirmation();
      } catch (error) {
        if (request !== stockRequest || id !== renderId || !root.contains(feedback)) return;
        available = false;
        feedback.textContent = 'Live stock reports are unavailable right now.';
      }
      enableButtons();
    }

    cards.forEach(function (card) {
      card.classList.toggle('spot-foil', placeIsRare(card));
      var share = card.querySelector('[data-share]');
      var place = links.find(function (link) { return link.place_id === card.dataset.place; }).places;
      share.addEventListener('click', async function () {
        share.disabled = true;
        var row = stockRows.get(card.dataset.place);
        var status = NuggetfinderWave.stockStatus(row);
        try {
          await NuggetfinderShare.download({
            brand: product.brand, product: product.name, productId: product.id,
            place: place.name, area: place.area, status: status, label: available ? statusLabel(status) : '− STOCK UNAVAILABLE',
            username: options.username(),
            lastSeen: row && row.last_seen_at ? 'Last seen: ' + dateLabel(row.last_seen_at) : ''
          });
        } catch (error) {
          feedback.textContent = 'Could not make the share card. Try again.';
        } finally {
          share.disabled = false;
        }
      });
      card.addEventListener('click', async function (event) {
        var button = event.target.closest('button[data-stock]');
        if (!button || !available || submitting) return;
        if (!options.user()) return options.signIn('Sign in to report product stock.');
        submitting = true;
        enableButtons();
        try {
          var response = await client.rpc('submit_stock_report', {
            p_product: product.id, p_place: card.dataset.place, p_status: button.dataset.stock
          });
          if (response.error) throw response.error;
          if (id !== renderId || root.hidden) return;
          feedback.textContent = 'Report saved. It takes two people to confirm a stock status.';
          await refresh();
        } catch (error) {
          feedback.textContent = options.reportError(error.message);
        } finally {
          submitting = false;
          enableButtons();
        }
      });
    });
    refresh();
    return refresh;
  }

  var pointsByUser = new Map();
  var renderId = 0;
  var refreshStock;
  async function show(root, route, client, esc, options) {
    refreshStock = null;
    var id = ++renderId;
    root.innerHTML = '<p role="status">Loading products…</p>';
    var catalog;
    try {
      catalog = await readCatalog(client);
    } catch (error) {
      catalog = NuggetfinderSeed;
    }
    if (id !== renderId || root.hidden) return;

    if (route.page === 'product') {
      var product = catalog.products.find(function (entry) { return entry.id === route.productId; });
      if (!product) {
        root.innerHTML = '<a href="#/products">All products</a>' + NuggetfinderSparkle.empty('Product not found.');
        return;
      }
      var links = catalog.links.filter(function (link) {
        return link.product_id === product.id && link.places;
      });
      root.innerHTML = '<a class="wave-link" href="#/products">← All products</a>' +
        '<header class="wave-hero"><p class="tag">' + esc(product.kind.toUpperCase()) + '</p>' +
        '<h1>' + esc(product.name) + '</h1><p>' + esc(product.brand) + '</p><a class="wave-link" href="#/take?kind=product&ref=' + encodeURIComponent(product.id) + '&label=' + encodeURIComponent(product.name) + '">Drop a take</a></header><h2>Where to buy</h2><p class="stock-feedback" role="status"></p>' +
        '<div class="wave-grid">' + links.map(function (link) {
          var place = link.places;
          return '<article class="wave-card spot-trading-card" data-place="' + esc(link.place_id) + '"><h3>' + esc(place.name) + '</h3><p>' + esc(place.area) +
            '</p><a class="wave-link" href="#/spot/' + encodeURIComponent(place.id) + '">View on map</a><span class="stat stock-stamp s-none" aria-live="polite">− NO REPORTS</span>' +
            '<p class="small last-seen"></p><p class="small last-report"></p>' +
            '<div class="btns"><button class="big pink" type="button" data-stock="seen" disabled>Seen it</button>' +
            '<button class="big ghost" type="button" data-stock="sold_out" disabled>Sold out</button></div><button class="big ghost" type="button" data-share>Download share card</button></article>';
        }).join('') + '</div>';
      if (!links.length) root.querySelector('.wave-grid').innerHTML = NuggetfinderSparkle.empty('No places listed yet.');
      refreshStock = showStock(root, product, links, client, options, id);
      return;
    }

    root.innerHTML = '<h1>Where to buy</h1><label for="productSearch">Search products, brands or stores</label>' +
      '<input type="search" id="productSearch" placeholder="Try nuggets or Chick-fil-A">' +
      '<div class="wave-grid" id="productResults" aria-live="polite"></div>';
    var input = root.querySelector('input');
    var results = root.querySelector('#productResults');
    function search() {
      var query = input.value.trim().toLowerCase();
      results.innerHTML = catalog.products.filter(function (product) {
        var terms = [product.name, product.brand, product.kind];
        catalog.links.forEach(function (link) {
          if (link.product_id === product.id && link.places) terms.push(link.places.name, link.places.area);
        });
        return terms.join(' ').toLowerCase().includes(query);
      }).map(function (product) {
        return '<a class="wave-card" href="#/product/' + encodeURIComponent(product.id) + '"><strong>' +
          esc(product.name) + '</strong><span>' + esc(product.brand) + ' · ' + esc(product.kind) + '</span></a>';
      }).join('') || NuggetfinderSparkle.empty('No matching products.');
    }
    input.addEventListener('input', search);
    search();
  }

  return { show: show, statusLabel: statusLabel, refresh: function () { if (refreshStock) refreshStock(); } };
})();

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

  function dateLabel(value) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function showStock(root, product, client, options, id) {
    var cards = Array.from(root.querySelectorAll('[data-place]'));
    if (!cards.length) return;
    var stampHistory = new Map();
    var available = false;
    var submitting = false;
    var feedback = root.querySelector('.stock-feedback');
    function enableButtons() {
      cards.forEach(function (card) {
        card.querySelectorAll('button[data-stock]').forEach(function (button) {
          button.disabled = !available || submitting;
        });
      });
    }

    async function refresh() {
      try {
        if (!client) throw new Error('Offline');
        var response = await client.rpc('product_stock', { p_product: product.id });
        if (response.error) throw response.error;
        if (id !== renderId || root.hidden) return;
        var counts = new Map(response.data.map(function (row) { return [row.place_id, row]; }));
        cards.forEach(function (card) {
          var row = counts.get(card.dataset.place);
          var status = NuggetfinderWave.stockStatus(row);
          var stamp = card.querySelector('.stat');
          stamp.className = 'stat s-' + status;
          stamp.dataset.stampKey = card.dataset.place;
          stamp.dataset.stampStatus = status;
          stamp.textContent = labels[status];
          card.querySelector('.last-seen').textContent = row && row.last_seen_at
            ? 'Last seen: ' + dateLabel(row.last_seen_at) : 'Last seen: no recent sightings';
          card.querySelector('.last-report').textContent = row
            ? 'Latest report: ' + dateLabel(row.last_report_at) : '';
        });
        stampHistory = NuggetfinderStamp.update(root.querySelectorAll('[data-stamp-key]'), stampHistory);
        available = true;
      } catch (error) {
        if (id !== renderId || root.hidden) return;
        available = false;
        feedback.textContent = 'Live stock reports are unavailable right now.';
      }
      enableButtons();
    }

    cards.forEach(function (card) {
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
        root.innerHTML = '<a href="#/products">All products</a><p>Product not found.</p>';
        return;
      }
      root.innerHTML = '<a class="wave-link" href="#/products">← All products</a>' +
        '<p class="tag">' + esc(product.kind.toUpperCase()) + '</p>' +
        '<h1>' + esc(product.name) + '</h1><p>' + esc(product.brand) + '</p><h2>Where to buy</h2><p class="stock-feedback" role="status"></p>' +
        '<div class="wave-grid">' + catalog.links.filter(function (link) {
          return link.product_id === product.id && link.places;
        }).map(function (link) {
          var place = link.places;
          return '<article class="wave-card" data-place="' + esc(link.place_id) + '"><h3>' + esc(place.name) + '</h3><p>' + esc(place.area) +
            (place.source === 'map_sample' ? ' · Sample map pin' : '') +
            '</p><span class="stat s-none" aria-live="polite">− NO REPORTS</span>' +
            '<p class="small last-seen"></p><p class="small last-report"></p>' +
            '<div class="btns"><button class="big pink" type="button" data-stock="seen" disabled>Seen it</button>' +
            '<button class="big ghost" type="button" data-stock="sold_out" disabled>Sold out</button></div></article>';
        }).join('') + '</div>';
      if (!root.querySelector('article')) root.querySelector('.wave-grid').textContent = 'No places listed yet.';
      refreshStock = showStock(root, product, client, options, id);
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
      }).join('') || '<p>No matching products.</p>';
    }
    input.addEventListener('input', search);
    search();
  }

  return { show: show, refresh: function () { if (refreshStock) refreshStock(); } };
})();

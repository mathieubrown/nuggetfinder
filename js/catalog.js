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

  var renderId = 0;
  async function show(root, route, client, esc) {
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
        '<h1>' + esc(product.name) + '</h1><p>' + esc(product.brand) + '</p><h2>Where to buy</h2>' +
        '<div class="wave-grid">' + catalog.links.filter(function (link) {
          return link.product_id === product.id && link.places;
        }).map(function (link) {
          var place = link.places;
          return '<article class="wave-card"><h3>' + esc(place.name) + '</h3><p>' + esc(place.area) +
            (place.source === 'map_sample' ? ' · Sample map pin' : '') +
            '</p><span class="stat s-none">− NO REPORTS</span></article>';
        }).join('') + '</div>';
      if (!root.querySelector('article')) root.querySelector('.wave-grid').textContent = 'No places listed yet.';
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

  return { show: show };
})();

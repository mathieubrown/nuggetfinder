window.NuggetfinderRouter = (function () {
  'use strict';

  function read() {
    var hash = window.location.hash;
    // Preserve links issued by the currently deployed frontend, including creators.
    if(hash === '#/beef' || hash.startsWith('#/beef?') || hash.startsWith('#/beef/')) hash=hash.replace('#/beef','#/showdown');
    if(hash === '#/weekly' || hash.startsWith('#/weekly?')) hash=hash.replace('#/weekly','#/weekly-winners');
    var spotPrefix = '#/spot/';
    if (hash.indexOf(spotPrefix) === 0) {
      try {
        var id = decodeURIComponent(hash.slice(spotPrefix.length));
        if (id) return { page: 'spot', spotId: id };
      } catch (error) {
        return { page: 'home' };
      }
    }

    if (hash.indexOf('#/product/') === 0) {
      try { return { page: 'product', productId: decodeURIComponent(hash.slice(10)) }; }
      catch (error) { return { page: 'products' }; }
    }
    if (hash.startsWith('#/showdown/')) {
      const [id, query] = hash.slice(11).split('?', 2);
      try { return {page:'showdown', id:decodeURIComponent(id), query}; }
      catch (error) { return {page:'showdown'}; }
    }
    if (hash.startsWith('#/court/')) {
      const id = hash.slice(8);
      if (/^[1-9][0-9]*$/.test(id)) return {page:'court', id};
      return {page:'court'};
    }
    if (hash.startsWith('#/trail/')) {
      const id = hash.slice(8);
      if (/^[1-9][0-9]*$/.test(id)) return {page:'trails', id};
      return {page:'trails'};
    }
    var [page, query] = hash.slice(2).split("?", 2);
    if (hash.indexOf('#/') === 0 && ['feed', 'showdown', 'me', 'products', 'mod', 'strikes', 'account', 'terms', 'privacy', 'dmca', 'take', 'weekly-winners', 'lists', 'court', 'field-guide', 'nominate', 'taste', 'trails', 'trail-builder', 'take-view', 'badges', 'prices', 'photo', 'participation'].indexOf(page) !== -1) {
      return { page: page, query: query };
    }
    return { page: 'home' };
  }

  function navigate(hash) {
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }

  return {
    current: read,
    listen: function (render) {
      window.addEventListener('hashchange', function () { render(read()); });
      render(read());
    },
    openSpot: function (id) { navigate('#/spot/' + encodeURIComponent(id)); },
    openHome: function () { navigate('#/'); }
  };
})();

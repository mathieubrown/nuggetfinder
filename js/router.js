window.NuggetfinderRouter = (function () {
  'use strict';

  function read() {
    var hash = window.location.hash;
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
    var page = hash.slice(2);
    if (hash.indexOf('#/') === 0 && ['feed', 'beef', 'me', 'products', 'mod', 'strikes'].indexOf(page) !== -1) {
      return { page: page };
    }
    return { page: 'home' };
  }

  function navigate(hash) {
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  }

  return {
    listen: function (render) {
      window.addEventListener('hashchange', function () { render(read()); });
      render(read());
    },
    openSpot: function (id) { navigate('#/spot/' + encodeURIComponent(id)); },
    openHome: function () { navigate('#/'); }
  };
})();

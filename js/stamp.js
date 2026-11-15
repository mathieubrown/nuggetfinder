window.NuggetfinderStamp = (function () {
  'use strict';

  function update(elements, history) {
    var next = new Map();
    elements.forEach(function (element) {
      var key = element.dataset.stampKey;
      var status = element.dataset.stampStatus;
      next.set(key, status);
      if (!history.has(key) || history.get(key) === status) return;
      element.classList.remove('stamp-drop');
      void element.offsetWidth;
      element.classList.add('stamp-drop');
    });
    return next;
  }

  return { update: update };
})();

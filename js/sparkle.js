window.NuggetfinderSparkle = (function () {
  'use strict';

  function empty(message) {
    return '<div class="wave-empty"><svg aria-hidden="true" viewBox="0 0 100 90">' +
      '<path d="M18 49 10 31 31 34 47 11 57 34 81 20 79 43Q98 65 75 79H27Q7 74 18 49Z" fill="#F4B223" stroke="#161514" stroke-width="5"/>' +
      '<path d="M33 52h6m21 0h6m-25 13q8 8 16 0" stroke="#161514" stroke-width="5" stroke-linecap="round" fill="none"/></svg><p>' + message + '</p></div>';
  }

  function celebrate(root, message) {
    root.querySelector('.nugget-party')?.remove();
    var party = document.createElement('div');
    party.className = 'nugget-party';
    party.innerHTML = '<strong></strong><button type="button" class="link-btn">Dismiss</button>';
    party.querySelector('strong').textContent = message || '★ First confirmed report!';
    for (var index = 0; index < 12; index++) {
      var piece = document.createElement('i');
      piece.style.setProperty('--angle', index * 30 + 'deg');
      party.appendChild(piece);
    }
    root.prepend(party);
    party.querySelector('button').onclick = function () { party.remove(); };
  }

  return { empty: empty, celebrate: celebrate };
})();

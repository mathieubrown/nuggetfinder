window.NuggetfinderProfile = (function () {
  'use strict';

  var request = 0;
  async function show(root, client, user, esc, signIn, rename) {
    var id = ++request;
    root.innerHTML = '<h1>My profile</h1><div class="wave-card" id="profileSummary"></div>' +
      '<h2>Sticker shelf</h2><div class="sticker-shelf" id="stickerShelf"></div>' +
      '<h2>How points work</h2><p>Earn one point when another person reports the same stock status for the same product and place within two hours. Seen it and Sold out are worth the same.</p>' +
      '<p>Each report can earn one point. You can earn up to 10 points per day. The cap resets at midnight UTC.</p>' +
      '<p>Earn stickers at 1, 10 and 30 points.</p>';
    var summary = root.querySelector('#profileSummary');
    var shelf = root.querySelector('#stickerShelf');
    if (!user) {
      summary.innerHTML = '<p>Sign in to see your username, level and points.</p><button class="big pink" type="button">Sign in</button>';
      summary.querySelector('button').addEventListener('click', function () { signIn('Sign in to see your profile.'); });
      shelf.textContent = 'Sign in to see your stickers.';
      return;
    }
    summary.textContent = 'Loading your profile…';
    try {
      var response = await client.rpc('my_wave_profile').single();
      if (response.error) throw response.error;
      if (id !== request || !summary.isConnected) return;
      var points = Number(response.data.points);
      var progress = NuggetfinderWave.profileProgress(points);
      summary.innerHTML = '<strong>@' + esc(response.data.handle) + '</strong><span class="tag">' + esc(progress.level) +
        '</span><p>' + points + (points === 1 ? ' point' : ' points') + '</p>' +
        '<button class="big ghost" type="button">Change username</button>';
      summary.querySelector('button').addEventListener('click', rename);
      shelf.innerHTML = progress.stickers.map(function (sticker) {
        return '<span class="sticker">★ ' + esc(sticker) + '</span>';
      }).join('') || 'Your first confirmed report unlocks a sticker.';
    } catch (error) {
      summary.textContent = 'Your profile is unavailable right now.';
    }
  }
  return { show: show };
})();

(function (community) {
  'use strict';
  const {pages, rpc, shell, action} = community;

  pages.taste = async function (root, route, client, user, esc, signIn) {
    const id = new URLSearchParams(route.query).get('user');
    if (!id) return showDirectory(root, route, client, user, esc, signIn);
    shell(root, 'Follow a taste', '<a class="wave-link" href="#/taste">Find people</a>' +
      '<p role="status">Loading this taste…</p><div data-taste></div>');
    const feedback = root.querySelector('[role=status]');
    const content = root.querySelector('[data-taste]');
    try {
      const profile = await rpc(client, 'taste_profile', {p_user: id});
      if (!content.isConnected) return;
      feedback.textContent = '';
      if (!profile) {
        content.innerHTML = NuggetfinderSparkle.empty('This profile is unavailable.');
        return;
      }
      const header = document.createElement('article');
      header.className = 'wave-card taste-header';
      header.innerHTML = '<span class="tag">FOLLOW A TASTE</span><h2>@' + esc(profile.handle) + '</h2>' +
        '<p>' + Number(profile.take_count) + (Number(profile.take_count) === 1 ? ' reviewed take' : ' reviewed takes') + '</p>';
      content.append(header);
      if (!user || user.id !== profile.id) {
        const follow = document.createElement('button');
        follow.className = 'big pink';
        follow.textContent = profile.following ? 'Following · Unfollow' : 'Follow this taste';
        follow.setAttribute('aria-pressed', String(profile.following));
        header.append(follow);
        action(follow, async () => {
          if (!user) return signIn('Sign in to follow this taste.');
          await rpc(client, 'set_follow', {p_user: profile.id, p_follow: !profile.following});
          profile.following = !profile.following;
          follow.textContent = profile.following ? 'Following · Unfollow' : 'Follow this taste';
          follow.setAttribute('aria-pressed', String(profile.following));
          feedback.textContent = profile.following ? 'Their takes appear in your Following feed.' : 'Unfollowed.';
        }, feedback);
        if (user) community.addSafetyButtons(header, client, {kind: 'username', ref: profile.id, author: profile.id}, feedback);
      }
      const grid = document.createElement('div');
      grid.className = 'wave-grid discovery-section';
      content.append(grid);
      if (!profile.takes.length) grid.innerHTML = NuggetfinderSparkle.empty('No published takes yet.');
      profile.takes.forEach(take => {
        const card = document.createElement('article');
        card.className = 'wave-card take-tile';
        card.innerHTML = '<span class="tag">' + esc(take.subject_kind) + '</span><p>' + esc(take.body) + '</p>' +
          (take.subject ? '<a class="wave-link" href="#/' + esc(take.subject.page) + '/' + encodeURIComponent(take.subject_ref) +
            '">' + esc(take.subject.name) + '</a>' : '');
        grid.append(card);
        if (user && user.id !== take.author_id) community.addSafetyButtons(card, client,
          {kind: 'take', ref: take.id, author: take.author_id}, feedback);
        community.addRespond(card, client, user, take, esc, signIn, feedback);
      });
    } catch (error) {
      if (content.isConnected) feedback.textContent = 'Could not load this taste. Please try again.';
    }
  };

  async function showDirectory(root, route, client, user, esc, signIn) {
    shell(root, 'Find your food people', '<p>Find a handle, read their takes, and follow the tastes you trust.</p>' +
      '<form class="discovery-search"><label for="tasteSearch">Search by the start of a username</label>' +
      '<div class="btns"><input id="tasteSearch" minlength="2" maxlength="20" required placeholder="At least two letters">' +
      '<button type="submit" class="big pink">Find people</button></div></form>' +
      '<a class="wave-link" href="#/feed?tab=following">Open Following feed</a>' +
      '<p role="status"></p><div class="wave-grid" data-tastes></div>');
    const form = root.querySelector('form');
    const grid = root.querySelector('[data-tastes]');
    const feedback = root.querySelector('[role=status]');
    let request = 0;

    function render(rows, emptyMessage) {
      grid.innerHTML = rows.length ? rows.map(person =>
        '<a class="wave-card wave-link" href="#/taste?user=' + encodeURIComponent(person.id) + '">@' +
        esc(person.handle) + '</a>').join('') : NuggetfinderSparkle.empty(emptyMessage);
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const current = ++request;
      form.querySelector('button').disabled = true;
      try {
        const rows = await rpc(client, 'find_tastes', {p_query: form.querySelector('input').value});
        if (!grid.isConnected || current !== request) return;
        feedback.textContent = 'Matching people';
        render(rows, 'No matching handles. Try a different beginning.');
      } catch (error) {
        if (grid.isConnected) feedback.textContent = 'Search is unavailable. Please try again.';
      } finally {
        form.querySelector('button').disabled = false;
      }
    });
    if (user) {
      const current = request;
      try {
        const follows = await rpc(client, 'my_taste_follows');
        if (grid.isConnected && current === request) {
          feedback.textContent = 'People you follow';
          render(follows, 'Find a handle above or follow someone from a take.');
        }
      } catch (error) {
        if (grid.isConnected && current === request) feedback.textContent = 'Could not load your follows.';
      }
    } else {
      render([], 'Find a handle above. Sign in when you’re ready to follow.');
    }
  }
})(NuggetfinderCommunity);

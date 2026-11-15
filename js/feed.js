(function (community) {
  const {pages, rpc, shell, action} = community;
  pages.feed = async function (root, route, client, user, esc, signIn) {
    const query = new URLSearchParams(route.query);
    const tab = ['hot','recent','following'].includes(query.get('tab')) ? query.get('tab') : 'hot';
    const swipe = query.get('view') === 'swipe';
    const feedUrl = (name, view) => '#/feed?tab=' + name + (view ? '&view=swipe' : '');
    shell(root, 'Takes feed', '<nav class="wave-nav" aria-label="Feed tabs">' +
      ['hot','recent','following'].map(name => '<a href="' + feedUrl(name,swipe) + '"' +
        (name === tab ? ' aria-current="page"' : '') + '>' + name + '</a>').join('') +
      '<a href="' + feedUrl(tab,!swipe) + '">' + (swipe ? 'Grid view' : 'Swipe view') + '</a>' +
      '<a href="#/take">Drop a take</a></nav><p role="status">Loading takes…</p><div id="takesFeed" class="' +
      (swipe ? 'swipe-feed' : 'wave-grid') + '"></div>');
    const feedback = root.querySelector('[role=status]');
    const feed = root.querySelector('#takesFeed');
    if (tab === 'following' && !user) { feedback.textContent = 'Sign in to see people you follow.'; return; }
    try {
      const rows = await rpc(client, 'community_feed', {p_tab:tab});
      if (!feed.isConnected) return;
      feedback.textContent = '';
      if (!rows.length) { feed.innerHTML = NuggetfinderSparkle.empty('No takes here yet.'); return; }
      rows.forEach(row => {
        const card = document.createElement('article');
        card.className = 'wave-card take-tile';
        card.innerHTML = '<span class="tag">' + esc(row.subject_kind) + '</span><p>' + esc(row.body) +
          '</p><strong>@' + esc(row.handle) + '</strong><time>' + esc(new Date(row.created_at).toLocaleDateString()) + '</time>';
        feed.append(card);
        if (user && user.id !== row.author_id) {
          const follow = document.createElement('button');
          follow.className = 'big ghost';
          follow.textContent = row.following ? 'Unfollow' : 'Follow';
          card.append(follow);
          action(follow, async () => {
            await rpc(client,'set_follow',{p_user:row.author_id,p_follow:!row.following});
            row.following = !row.following;
            follow.textContent = row.following ? 'Unfollow' : 'Follow';
            if (tab === 'following' && !row.following) card.remove();
          },feedback);
          community.addSafetyButtons(card,client,{kind:'take',ref:row.id,author:row.author_id},feedback);
        }
        if (community.addRespond) community.addRespond(card,client,user,row,esc,signIn,feedback);
        if (community.addTakeShare) community.addTakeShare(card,row,feedback);
      });
      if (swipe) {
        const next = document.createElement('button');
        next.className = 'big ghost';
        next.textContent = 'Next take';
        let index = 0;
        next.onclick = () => { index = (index+1)%rows.length; feed.children[index].scrollIntoView({block:'nearest',inline:'start'}); };
        feed.before(next);
      }
    } catch (error) { feedback.textContent = 'Could not load takes. ' + error.message; }
  };
})(NuggetfinderCommunity);

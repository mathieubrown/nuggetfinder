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
      '<a href="#/take">Drop a take</a><a href="#/taste">Find people</a></nav><p role="status">Loading takes…</p><div id="takesFeed" class="' +
      (swipe ? 'swipe-feed' : 'wave-grid') + '"></div>');
    const feedback = root.querySelector('[role=status]');
    const feed = root.querySelector('#takesFeed');
    if (tab === 'following' && !user) { feedback.textContent = 'Sign in to see people you follow.'; return; }
    try {
      const rows = await rpc(client, 'take_cards', {p_sort:tab==='hot'?'hot':'new',p_following:tab==='following'});
      if (!feed.isConnected) return;
      feedback.textContent = '';
      if (!rows.length) { feed.innerHTML = NuggetfinderSparkle.empty('No takes here yet.'); return; }
      rows.forEach(row => {
        const card=community.takeCard(row,client,user,esc,signIn,feedback);
        if(!swipe)card.classList.add('feed-take-card');
        feed.append(card);
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

window.NuggetfinderSpot = (function (community) {
  'use strict';
  const {rpc} = community;
  const metrics = {crunch:'Crunch',juice:'Juice',sauce:'Sauce',value:'Value'};

  async function mount(root, place, client, user, esc, signIn) {
    const section = document.createElement('div');
    section.className = 'spot-extras';
    section.innerHTML = '<section><div class="section-heading"><h2>The Score</h2><span class="small" data-rating-count>Loading…</span></div>' +
      '<div data-score></div><details><summary class="wave-link">Rate this spot</summary><form class="rating-form">' +
      Object.entries(metrics).map(([key,label]) => '<label>' + label + '<select name="' + key + '" required>' +
        '<option value="">Choose</option>' + [1,2,3,4,5].map(value => '<option value="' + value + '">' + value +
          '</option>').join('') + '</select></label>').join('') +
      '<button type="submit" class="big pink">Save my rating</button><p class="small">One rating per person. Change it after 10 minutes, up to 20 places per rolling day.</p></form></details></section>' +
      '<section><h2>Menus &amp; field notes</h2><a class="big pink" href="#/menus?place='+encodeURIComponent(place.id)+'">View or upload a menu</a><a class="wave-link" href="#/add-place?place='+encodeURIComponent(place.id)+'">Suggest hours, address or menu-link changes</a></section><section data-spot-showdown></section><section><div class="section-heading"><h2>Top Takes Here</h2>' +
      '<a class="wave-link" href="#/take?kind=place&ref=' + encodeURIComponent(place.id) + '&label=' +
      encodeURIComponent(place.name) + '">Drop a take</a></div><div class="spot-takes" data-spot-takes></div></section><p role="status"></p>';
    root.querySelector('.block').after(section);
    if(window.NuggetfinderParticipant?.enabled){
      const listing=document.createElement('a');listing.className='wave-link';listing.href='#/suggest-product?place='+encodeURIComponent(place.id);listing.textContent='Suggest a product sold here';section.append(listing);
      section.append(window.NuggetfinderFunctional.photoLink('place',place.id,'review'));
      window.NuggetfinderFunctional.gallery(section,'place',place.id);
    }
    const feedback = section.querySelector('[role=status]');
    const form = section.querySelector('form');

    async function refresh() {
      const data = await rpc(client,'place_screen',{p_place:place.id});
      if (!section.isConnected) return;
      if (!data) throw new Error('place_unavailable');
      const count = Number(data.ratings.count);
      section.querySelector('[data-rating-count]').textContent = count + (count === 1 ? ' rating' : ' ratings');
      section.querySelector('[data-score]').innerHTML = Object.entries(metrics).map(([key,label]) =>
        '<div class="score-row"><span>' + label + '</span><meter min="0" max="5" value="' +
        (count >= 3 ? Number(data.ratings[key]) : 0) + '" aria-label="' + label + ' score"></meter><strong>' +
        (count >= 3 ? Number(data.ratings[key]).toFixed(1) : '—') + '</strong></div>').join('') +
        (count < 3 ? '<p class="small">Scores appear after three people rate this spot.</p>' : '');
      if (data.mine && !form.contains(document.activeElement)) {
        Object.keys(metrics).forEach(key => { form.elements[key].value = data.mine[key]; });
      }
      const active = section.querySelector('[data-spot-showdown]');
      active.replaceChildren();
      if (data.matchups.length) {
        const match = data.matchups[0];
        const votes = Number(match.left_votes) + Number(match.right_votes);
        active.className = 'active-showdown';
        active.innerHTML = '<div><h2>' + NuggetfinderShowdown.active + '</h2><p>' +
          esc(match.left_label + ' vs ' + match.right_label) + '</p><p>' +
          (votes ? Math.round(100*Number(match.left_votes)/votes) + '% to ' +
            Math.round(100*Number(match.right_votes)/votes) + '% · ' + votes + ' votes' : 'No votes yet') +
          '</p></div><a href="#/showdown/' + encodeURIComponent(match.id) + '">' + NuggetfinderShowdown.pick + '</a>';
      } else {
        active.className = '';
        active.innerHTML = '<a class="wave-link" href="#/showdown">Explore Showdowns</a>';
      }
      const takes = section.querySelector('[data-spot-takes]');
      takes.replaceChildren();
      if (!data.takes.length) takes.innerHTML = '<p class="small">No published takes here yet.</p>';
      data.takes.forEach(take => {
        if (community.takeTile) takes.append(community.takeTile(take,esc));
        else {
          const card = document.createElement('article');
          card.className = 'take-thumbnail';
          card.innerHTML = '<span class="take-stamp">TAKE</span><p>' + esc(take.body) +
            '</p><a href="#/taste?user=' + encodeURIComponent(take.author_id) + '">@' + esc(take.handle) + '</a>';
          takes.append(card);
        }
      });
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user) return signIn('Sign in to rate this spot.');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        const values = Object.fromEntries(Object.keys(metrics).map(key => ['p_'+key,Number(form.elements[key].value)]));
        await rpc(client,'rate_place',{p_place:place.id,...values});
        feedback.textContent = 'Your rating is saved.';
        await refresh();
      } catch (error) {
        feedback.textContent = error.message.includes('cooldown') ? 'Wait 10 minutes between ratings for this spot.' :
          'Could not save your rating. Please try again.';
      } finally { button.disabled = false; }
    });
    try { await refresh(); }
    catch (error) { if (section.isConnected) feedback.textContent = 'Scores and takes are unavailable right now.'; }
  }
  return {mount};
})(NuggetfinderCommunity);

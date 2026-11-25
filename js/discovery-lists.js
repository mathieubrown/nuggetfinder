(function (community) {
  'use strict';
  const {pages, rpc, shell} = community;
  const states = {want: '♡ Want to try', tried: '✓ Tried it'};

  community.addSaveButtons = function (root, client, user, kind, ref, signIn, initialState) {
    const group = document.createElement('div');
    group.className = 'save-controls';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Your personal list');
    group.innerHTML = '<div class="btns">' + Object.entries(states).map(([value, label]) =>
      '<button class="big ghost" type="button" data-save="' + value + '" aria-pressed="false">' +
      label + '</button>').join('') + '</div><p class="small" role="status"></p>';
    root.append(group);
    const feedback = group.querySelector('[role=status]');
    const buttons = Array.from(group.querySelectorAll('button'));
    let current = initialState || null;
    let busy = false;

    function display() {
      buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.save === current));
        button.disabled = busy;
      });
    }
    function fail() {
      feedback.textContent = 'Your list is unavailable. Please try again.';
    }
    async function load() {
      if (!user) return;
      busy = true;
      display();
      try {
        const rows = await rpc(client, 'my_discoveries');
        if (!group.isConnected) return;
        const match = rows.find(item => item.subject_kind === kind && item.subject_ref === ref);
        current = match ? match.list_state : null;
        if (current) feedback.textContent = 'Saved privately to your list.';
      } catch (error) {
        fail();
      } finally {
        busy = false;
        display();
      }
    }
    buttons.forEach(button => button.addEventListener('click', async () => {
      if (!user) return signIn('Sign in to keep your own discovery list.');
      if (busy) return;
      busy = true;
      display();
      const next = current === button.dataset.save ? null : button.dataset.save;
      try {
        await rpc(client, 'save_discovery', {p_kind: kind, p_ref: ref, p_state: next});
        current = next;
        feedback.textContent = next ? 'Saved privately to your list.' : 'Removed from your list.';
        group.dispatchEvent(new CustomEvent('discoverychange', {detail: {state: next}}));
      } catch (error) {
        feedback.textContent = error.message.includes('cooldown')
          ? 'Give it a moment before changing your list again.' : 'Could not save. Please try again.';
      } finally {
        busy = false;
        display();
      }
    }));
    if (initialState === undefined) load();
    else {
      display();
      if (current) feedback.textContent = 'Saved privately to your list.';
    }
    return group;
  };

  pages.lists = async function (root, route, client, user, esc, signIn) {
    const tab = new URLSearchParams(route.query).get('tab') === 'tried' ? 'tried' : 'want';
    shell(root, 'My discoveries', '<a class="wave-link" href="#/trails">Explore discovery trails</a><p>Keep a private list of what you want to try and what you’ve tried.</p>' +
      '<nav class="discovery-tabs" aria-label="Your lists">' + Object.entries(states).map(([key, label]) =>
        '<a class="wave-link" href="#/lists?tab=' + key + '"' +
        (key === tab ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') +
      '</nav><p role="status">Loading your list…</p><div class="wave-grid" data-discoveries></div>');
    const feedback = root.querySelector('[role=status]');
    const grid = root.querySelector('[data-discoveries]');
    if (!user) {
      feedback.textContent = 'Sign in to keep and view your lists.';
      const button = document.createElement('button');
      button.className = 'big pink';
      button.textContent = 'Sign in';
      button.onclick = () => signIn('Sign in to see your discoveries.');
      grid.append(button);
      return;
    }
    try {
      const rows = await rpc(client, 'my_discoveries');
      if (!grid.isConnected) return;
      feedback.textContent = '';
      const items = rows.filter(item => item.list_state === tab);
      if (!items.length) grid.innerHTML = NuggetfinderSparkle.empty(
        tab === 'want' ? 'Save a product or spot to plan your next discovery.' : 'Your next taste adventure starts here.');
      items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'wave-card';
        const subject = item.subject;
        card.innerHTML = '<span class="tag">' + esc(item.subject_kind) + '</span>' +
          (subject ? '<a class="wave-link" href="#/' + esc(subject.page) + '/' +
            encodeURIComponent(item.subject_ref) + '">' + esc(subject.name) + '</a>' :
            '<p>This item is no longer available.</p>');
        grid.append(card);
        const controls = community.addSaveButtons(card, client, user, item.subject_kind, item.subject_ref, signIn, item.list_state);
        controls.addEventListener('discoverychange', event => {
          if (event.detail.state !== tab) {
            card.remove();
            if (!grid.children.length) grid.innerHTML = NuggetfinderSparkle.empty('Your list is clear. Explore your next discovery.');
          }
        });
      });
    } catch (error) {
      feedback.textContent = 'Could not load your list. Please try again.';
    }
  };
})(NuggetfinderCommunity);

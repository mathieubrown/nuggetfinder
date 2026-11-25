(function (community) {
  'use strict';
  const {pages, rpc, shell, action} = community;
  const choices = {nugget: 'Nugget', adjacent: 'Nugget-adjacent', no: 'Absolutely not'};

  function headerLinks(guide) {
    return '<nav class="discovery-tabs" aria-label="Nugget Court">' +
      '<a class="wave-link" href="#/court"' + (!guide ? ' aria-current="page"' : '') + '>Nugget Court</a>' +
      '<a class="wave-link" href="#/field-guide"' + (guide ? ' aria-current="page"' : '') + '>Field Guide</a>' +
      '<a class="wave-link" href="#/nominate">Nominate a food</a></nav>';
  }

  function date(value) {
    return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
  }

  async function renderCase(root, row, client, user, esc, signIn, feedback) {
    const {labels, colors} = NuggetfinderCourt;
    const total = Number(row.nugget) + Number(row.adjacent) + Number(row.no);
    const card = document.createElement('article');
    card.className = 'wave-card court-case';
    card.innerHTML = '<span class="tag">IS IT A NUGGET?</span><h2>' + esc(row.food_name) + '</h2>' +
      '<p class="court-argument">' + esc(row.argument) + '</p><span class="stat s-' +
      (colors[row.verdict] || 'none') + '">' + labels[row.verdict] + '</span>' +
      '<p class="small">Community classification · ' + total + (total === 1 ? ' vote' : ' votes') + '</p>' +
      '<p class="small">' + (row.verdict === 'open' ? 'Round closes ' : 'Round closed ') + date(row.closes_at) + '</p>' +
      '<div class="court-ballot" role="group" aria-label="Is ' + esc(row.food_name) + ' a nugget?">' +
      Object.entries(choices).map(([key, text]) => '<button class="big ghost" type="button" data-verdict="' +
        key + '" aria-pressed="' + (row.mine === key) + '"' + (row.verdict !== 'open' ? ' disabled' : '') +
        '>' + text + '</button>').join('') + '</div><div class="court-totals">' +
      Object.entries(choices).map(([key, text]) => '<p>' + text + ' <strong>' + Number(row[key]) +
        '</strong><meter min="0" max="' + Math.max(total, 1) + '" value="' + Number(row[key]) +
        '" aria-label="' + text + ' votes"></meter></p>').join('') + '</div>' +
      '<a class="wave-link" href="#/take?kind=court&ref=' + row.id + '&label=' + encodeURIComponent(row.food_name) +
      '">Make your case</a>';
    root.append(card);
    card.querySelectorAll('[data-verdict]').forEach(button => action(button, async () => {
      if (!user) return signIn('Sign in to vote in Nugget Court.');
      await rpc(client, 'vote_court', {p_case: row.id, p_verdict: button.dataset.verdict});
      if (card.isConnected) window.dispatchEvent(new Event('hashchange'));
    }, feedback));
    community.addSaveButtons(card, client, user, 'court', String(row.id), signIn);
    const share = document.createElement('button');
    share.className = 'big ghost';
    share.textContent = 'Share the ruling';
    card.append(share);
    action(share, () => NuggetfinderShare.download({
      brand: 'NUGGET COURT', product: row.food_name, productId: 'court-' + row.id,
      place: total + (total === 1 ? ' community vote' : ' community votes'), area: row.argument,
      status: colors[row.verdict] || 'none', label: labels[row.verdict],
      lastSeen: 'Round ' + (row.verdict === 'open' ? 'closes ' : 'closed ') + date(row.closes_at)
    }), feedback);
    if (user && user.id !== row.author_id) {
      community.addSafetyButtons(card, client, {kind: 'court', ref: row.id, author: row.author_id}, feedback);
    }

    const locations = document.createElement('section');
    locations.className = 'discovery-section';
    locations.innerHTML = '<h2>Find ' + esc(row.food_name) + '</h2><p>Suggested places to check. Availability needs a fresh report.</p>' +
      '<div class="wave-grid" data-locations></div><details><summary class="wave-link">Suggest a place</summary>' +
      '<form class="wave-card"><label for="courtPlace">Choose an existing store or restaurant</label>' +
      '<select id="courtPlace" required><option value="">Loading places…</option></select>' +
      '<button class="big pink" type="submit">Send for review</button></form></details>';
    root.append(locations);
    const form = locations.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user) return signIn('Sign in to suggest a location.');
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await rpc(client, 'suggest_court_location', {p_case: row.id, p_place: form.querySelector('select').value});
        feedback.textContent = 'Location sent for review.';
      } catch (error) {
        feedback.textContent = error.message.includes('already') ? 'That location has already been suggested.' :
          'Could not send the location. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
    try {
      const [places, suggestions, takes] = await Promise.all([
        rpc(client, 'discovery_targets'), rpc(client, 'court_locations', {p_case: row.id}),
        rpc(client, 'court_takes', {p_case: row.id})
      ]);
      if (!locations.isConnected) return;
      form.querySelector('select').innerHTML = '<option value="">Choose a place</option>' + places.map(place =>
        '<option value="' + esc(place.id) + '">' + esc(place.name + (place.area ? ' · ' + place.area : '')) +
        '</option>').join('');
      const grid = locations.querySelector('[data-locations]');
      if (!suggestions.length) grid.innerHTML = NuggetfinderSparkle.empty('Know a place that serves it? Send it to the court.');
      suggestions.forEach(place => {
        const entry = document.createElement('article');
        entry.className = 'wave-card';
        entry.innerHTML = '<a class="wave-link" href="#/spot/' + encodeURIComponent(place.place_id) + '">' +
          esc(place.name) + '</a>' + (place.area ? '<p>' + esc(place.area) + '</p>' : '') +
          '<span class="tag">? PLACE TO CHECK</span>';
        grid.append(entry);
        if (user && user.id !== place.author_id) community.addSafetyButtons(entry, client,
          {kind: 'court_location', ref: place.id, author: place.author_id}, feedback);
      });
      const argumentsSection = document.createElement('section');
      argumentsSection.className = 'discovery-section';
      argumentsSection.innerHTML = '<h2>The arguments</h2><div class="wave-grid"></div>';
      root.append(argumentsSection);
      const argumentsGrid = argumentsSection.querySelector('.wave-grid');
      if (!takes.length) argumentsGrid.innerHTML = NuggetfinderSparkle.empty('The floor is open. Make your case.');
      takes.forEach(take => {
        const entry = document.createElement('article');
        entry.className = 'wave-card';
        entry.innerHTML = '<p>' + esc(take.body) + '</p><a class="wave-link" href="#/taste?user=' + encodeURIComponent(take.author_id) + '">@' +
          esc(take.handle) + '</a>';
        argumentsGrid.append(entry);
        if (user && user.id !== take.author_id) community.addSafetyButtons(entry, client,
          {kind: 'take', ref: take.id, author: take.author_id}, feedback);
        community.addRespond(entry, client, user, take, esc, signIn, feedback);
      });
    } catch (error) {
      if (locations.isConnected) {
        form.querySelector('select').innerHTML = '<option value="">Places unavailable</option>';
        feedback.textContent = 'Some court details could not load. Please try again.';
      }
    }
  }

  pages.court = async function (root, route, client, user, esc, signIn) {
    const guide = route.page === 'field-guide';
    shell(root, guide ? 'Nugget Field Guide' : 'Nugget Court', headerLinks(guide) +
      '<p>' + (guide ? 'Explore the foods the community welcomed into the nugget family.' :
        'Boneless wing? Katsu? A very flat nugget? Make the case and let the community decide.') +
      '</p><details class="court-rules"><summary class="wave-link">How the court works</summary>' +
      '<p>Every nomination is reviewed first. Voting lasts seven days. A verdict needs at least 20 different people and 60% of the votes for one answer. You can change your vote while the round is open.</p>' +
      '<p>The food keeps its proper name. Court votes classify the food. Store availability comes from separate stock reports.</p></details>' +
      '<p role="status">Opening court…</p><div data-cases class="wave-grid"></div>');
    const feedback = root.querySelector('[role=status]');
    const grid = root.querySelector('[data-cases]');
    try {
      const rows = await rpc(client, 'court_cases', {p_id: route.id ? Number(route.id) : null, p_guide: guide});
      if (!grid.isConnected) return;
      feedback.textContent = '';
      if (route.id) {
        if (!rows.length) { grid.innerHTML = NuggetfinderSparkle.empty('This case is unavailable.'); return; }
        grid.classList.remove('wave-grid');
        await renderCase(grid, rows[0], client, user, esc, signIn, feedback);
        return;
      }
      if (!rows.length) grid.innerHTML = NuggetfinderSparkle.empty(
        guide ? 'The first community ruling has yet to be made.' : 'Court is ready for its first case.');
      rows.forEach(row => {
        const card = document.createElement('article');
        card.className = 'wave-card court-preview';
        card.innerHTML = '<span class="tag">IS IT A NUGGET?</span><a class="wave-link" href="#/court/' + row.id +
          '">' + esc(row.food_name) + '</a><p>' + esc(row.argument) +
          '</p><span class="stat s-' + (NuggetfinderCourt.colors[row.verdict] || 'none') + '">' +
          NuggetfinderCourt.labels[row.verdict] + '</span>';
        grid.append(card);
      });
    } catch (error) {
      if (grid.isConnected) feedback.textContent = 'Court is unavailable right now. Please try again.';
    }
  };
  pages['field-guide'] = pages.court;

  pages.nominate = function (root, route, client, user, esc, signIn) {
    shell(root, 'Make your case', headerLinks(false) + '<form class="wave-card court-nomination">' +
      '<label for="courtFood">What is the food’s proper name?</label><input id="courtFood" minlength="2" maxlength="80" required placeholder="Chicken katsu">' +
      '<label for="courtArgument">Why should it enter Nugget Court?</label><textarea id="courtArgument" rows="4" maxlength="280" required placeholder="Present your finest nugget reasoning."></textarea>' +
      '<p class="small">Photo nominations are coming after photo upload and moderation are ready.</p>' +
      '<button class="big pink" type="submit">Nominate for review</button><p role="status"></p></form>');
    const form = root.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user) return signIn('Sign in to nominate a food.');
      const button = form.querySelector('button');
      const feedback = form.querySelector('[role=status]');
      button.disabled = true;
      try {
        await rpc(client, 'nominate_court_case', {p_name: form.querySelector('input').value,
          p_argument: form.querySelector('textarea').value});
        feedback.textContent = 'Case submitted. A moderator reviews it before voting opens.';
        form.reset();
      } catch (error) {
        feedback.textContent = error.message.includes('already_nominated') ? 'That food already has a nomination.' :
          'Could not submit. Check your nomination and try again.';
      } finally {
        button.disabled = false;
      }
    });
  };
})(NuggetfinderCommunity);

(function (community) {
  'use strict';
  const {pages, rpc, shell, action} = community;

  function reviewStamp(status) {
    if (status === 'published') return '';
    return status === 'pending' ? '<span class="stat s-pending">⋯ AWAITING REVIEW</span>' :
      '<span class="stat s-nope">× NOT PUBLISHED</span>';
  }

  function trailHref(id) { return '#/trail/' + id; }
  function navigation() {
    return '<nav class="discovery-tabs" aria-label="Discovery trails">' +
      '<a class="wave-link" href="#/trails">Explore trails</a>' +
      '<a class="wave-link" href="#/trails?mine=1">My trails</a>' +
      '<a class="wave-link" href="#/trail-builder">Create a trail</a></nav>';
  }

  pages.trails = async function (root, route, client, user, esc, signIn) {
    const mine = new URLSearchParams(route.query).get('mine') === '1';
    shell(root, 'Discovery trails', navigation() +
      '<p>Follow a collection of places, find a new favorite, and stamp your own progress.</p>' +
      '<p role="status">Loading trails…</p><div class="wave-grid" data-trails></div>');
    const feedback = root.querySelector('[role=status]');
    const grid = root.querySelector('[data-trails]');
    if (mine && !user) {
      feedback.textContent = 'Sign in to see the trails you created.';
      return;
    }
    try {
      const rows = await rpc(client, 'list_trails', {p_id: route.id ? Number(route.id) : null, p_mine: mine});
      if (!grid.isConnected) return;
      feedback.textContent = '';
      if (!rows.length) {
        grid.innerHTML = NuggetfinderSparkle.empty(route.id ? 'This trail is unavailable.' :
          mine ? 'Your first trail starts with a favorite place.' : 'No published trails yet. Curate the first one.');
        return;
      }
      if (route.id) {
        grid.classList.remove('wave-grid');
        renderTrail(grid, rows[0], client, user, esc, signIn, feedback);
        return;
      }
      rows.forEach(row => {
        const card = document.createElement('article');
        card.className = 'wave-card trail-preview';
        card.innerHTML = '<span class="tag">DISCOVERY TRAIL</span><a class="wave-link" href="' + trailHref(row.id) +
          '">' + esc(row.title) + '</a><p>' + esc(row.summary) + '</p><p>' + Number(row.stop_count) +
          (Number(row.stop_count) === 1 ? ' stop' : ' stops') + '</p>' +
          reviewStamp(row.status);
        grid.append(card);
      });
    } catch (error) {
      if (grid.isConnected) feedback.textContent = 'Trails are unavailable right now. Please try again.';
    }
  };

  function renderTrail(root, row, client, user, esc, signIn, feedback) {
    const header = document.createElement('article');
    header.className = 'wave-card trail-header';
    header.innerHTML = '<span class="tag">DISCOVERY TRAIL</span><h2>' + esc(row.title) + '</h2>' +
      '<p>' + esc(row.summary) + '</p><a class="wave-link" href="#/taste?user=' + encodeURIComponent(row.author_id) +
      '">Curated by @' + esc(row.handle) + '</a>' +
      reviewStamp(row.status) +
      '<p class="trail-progress" aria-live="polite"></p><p class="small">Progress is private. A stamp records your visit and does not confirm current stock.</p>';
    root.append(header);
    if (row.status === 'published') community.addSaveButtons(header, client, user, 'trail', String(row.id), signIn);
    if (user && user.id === row.author_id) {
      const edit = document.createElement('a');
      edit.className = 'wave-link';
      edit.href = '#/trail-builder?edit=' + row.id;
      edit.textContent = 'Edit trail';
      header.append(edit);
    } else if (user && row.status === 'published') {
      community.addSafetyButtons(header, client, {kind: 'trail', ref: row.id, author: row.author_id}, feedback);
    }

    const list = document.createElement('ol');
    list.className = 'trail-stop-list';
    root.append(list);
    function updateProgress() {
      const visited = row.stops.filter(stop => stop.tried).length;
      header.querySelector('.trail-progress').textContent = '★ ' + visited + ' of ' + row.stops.length +
        ' stops stamped' + (visited === row.stops.length ? ' · Trail complete!' : '');
    }
    row.stops.forEach((stop, index) => {
      const entry = document.createElement('li');
      entry.className = 'wave-card trail-stop';
      entry.innerHTML = '<span class="tag">STOP ' + (index + 1) + '</span><a class="wave-link" href="#/spot/' +
        encodeURIComponent(stop.id) + '">' + esc(stop.name) + '</a>' +
        (stop.area ? '<p>' + esc(stop.area) + '</p>' : '') +
        '<button class="big ghost" type="button" aria-pressed="' + stop.tried + '"' +
        (row.status !== 'published' ? ' disabled' : '') + '>' +
        (stop.tried ? '✓ Stamped · Undo' : 'Stamp my visit') + '</button>';
      list.append(entry);
      const button = entry.querySelector('button');
      action(button, async () => {
        if (!user) return signIn('Sign in to stamp your trail progress.');
        await rpc(client, 'mark_trail_stop', {p_trail: row.id, p_place: stop.id, p_tried: !stop.tried});
        stop.tried = !stop.tried;
        button.textContent = stop.tried ? '✓ Stamped · Undo' : 'Stamp my visit';
        button.setAttribute('aria-pressed', String(stop.tried));
        if (stop.tried) {
          button.classList.remove('stamp-drop');
          void button.offsetWidth;
          button.classList.add('stamp-drop');
        }
        updateProgress();
        if (stop.tried && row.stops.every(item => item.tried)) {
          NuggetfinderSparkle.celebrate(root, '★ Trail complete!');
        }
      }, feedback);
    });
    updateProgress();
  }

  pages['trail-builder'] = async function (root, route, client, user, esc, signIn) {
    const edit = new URLSearchParams(route.query).get('edit');
    if (edit && !/^[1-9][0-9]*$/.test(edit)) {
      shell(root, 'Edit discovery trail', '<p>This trail link is invalid.</p><a class="wave-link" href="#/trails">Explore trails</a>');
      return;
    }
    shell(root, edit ? 'Edit discovery trail' : 'Curate a discovery trail', navigation() +
      '<p>Pick up to 20 real places in the order you want to explore. A moderator reviews new and edited trails.</p>' +
      '<form class="wave-card trail-builder"><label for="trailTitle">Trail name</label>' +
      '<input id="trailTitle" minlength="2" maxlength="80" required placeholder="Your next nugget expedition">' +
      '<label for="trailSummary">What connects these places?</label><textarea id="trailSummary" maxlength="280" required rows="3"></textarea>' +
      '<label for="trailPlaceSearch">Find a place</label><input id="trailPlaceSearch" type="search" placeholder="Store, restaurant or street">' +
      '<div class="trail-place-picker" data-picker></div><h2>Your ordered stops</h2><ol class="selected-stops" data-selected></ol>' +
      '<p role="status">Loading real places…</p><button type="submit" class="big pink" disabled>Send trail for review</button></form>');
    const form = root.querySelector('form');
    const feedback = form.querySelector('[role=status]');
    const button = form.querySelector('[type=submit]');
    const picker = form.querySelector('[data-picker]');
    const selected = form.querySelector('[data-selected]');
    const search = form.querySelector('[type=search]');
    let places;
    let stops = [];

    function renderSelection() {
      selected.innerHTML = '';
      stops.forEach((id, index) => {
        const place = places.find(place => place.id === id);
        const entry = document.createElement('li');
        entry.innerHTML = '<span>' + esc(place.name + (place.area ? ' · ' + place.area : '')) + '</span>' +
          '<div class="trail-order-buttons"><button type="button" aria-label="Move stop ' + (index + 1) +
          ' up"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" aria-label="Move stop ' + (index + 1) + ' down"' +
          (index === stops.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" aria-label="Remove stop ' + (index + 1) + '">×</button></div>';
        selected.append(entry);
        const [up, down, remove] = entry.querySelectorAll('button');
        function move(offset) {
          const target = index + offset;
          [stops[index], stops[target]] = [stops[target], stops[index]];
          renderSelection();
        }
        up.onclick = () => move(-1);
        down.onclick = () => move(1);
        remove.onclick = () => {
          stops = stops.filter(stop => stop !== id);
          renderSelection();
          renderPicker();
        };
      });
      button.disabled = stops.length === 0;
    }

    function renderPicker() {
      const query = search.value.trim().toLowerCase();
      picker.innerHTML = '';
      places.filter(place => (place.name + ' ' + (place.area || '')).toLowerCase().includes(query))
        .slice(0, 50).forEach(place => {
          const choice = document.createElement('button');
          choice.type = 'button';
          choice.className = 'trail-place-choice';
          choice.textContent = (stops.includes(place.id) ? '✓ ' : '+ ') +
            place.name + (place.area ? ' · ' + place.area : '');
          choice.disabled = stops.includes(place.id) || stops.length >= 20;
          choice.onclick = () => {
            if (stops.length >= 20 || stops.includes(place.id)) return;
            stops.push(place.id);
            renderSelection();
            renderPicker();
          };
          picker.append(choice);
        });
      if (!picker.children.length) picker.textContent = 'No matching places.';
    }

    try {
      places = await rpc(client, 'discovery_targets');
      if (!form.isConnected) return;
      if (edit) {
        const rows = await rpc(client, 'list_trails', {p_id: Number(edit), p_mine: true});
        if (!form.isConnected) return;
        if (!rows.length) { feedback.textContent = 'This trail is unavailable for editing.'; return; }
        const row = rows[0];
        form.querySelector('#trailTitle').value = row.title;
        form.querySelector('#trailSummary').value = row.summary;
        stops = row.stops.map(stop => stop.id);
      }
      feedback.textContent = '';
      renderPicker();
      renderSelection();
      search.addEventListener('input', renderPicker);
    } catch (error) {
      if (form.isConnected) feedback.textContent = 'Could not load the place picker. Please try again.';
      return;
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user) return signIn('Sign in to create a discovery trail.');
      if (!stops.length) return;
      button.disabled = true;
      try {
        const id = await rpc(client, 'submit_discovery_trail', {
          p_title: form.querySelector('#trailTitle').value,
          p_summary: form.querySelector('#trailSummary').value,
          p_places: stops, p_id: edit ? Number(edit) : null
        });
        feedback.textContent = 'Trail sent for review.';
        const link = document.createElement('a');
        link.className = 'wave-link';
        link.href = trailHref(id);
        link.textContent = 'Preview your trail';
        feedback.append(' ', link);
      } catch (error) {
        feedback.textContent = error.message.includes('cooldown')
          ? 'Wait two minutes between trail edits.' : 'Could not send your trail. Please try again.';
      } finally {
        button.disabled = false;
      }
    });
  };
})(NuggetfinderCommunity);

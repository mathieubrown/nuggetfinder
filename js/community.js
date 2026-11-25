window.NuggetfinderCommunity = (function () {
  'use strict';
  const pages = {};
  async function rpc(client, name, parameters) {
    const result = await client.rpc(name, parameters);
    if (result.error) throw result.error;
    return result.data;
  }
  // Keep a request ID after an uncertain response, so retrying cannot duplicate a write.
  function submission(client, name) {
    let draft, request;
    return async function (payload) {
      const fingerprint=JSON.stringify(payload);
      if(fingerprint!==draft){draft=fingerprint;request=crypto.randomUUID();}
      const result=await rpc(client,name,{...payload,p_request:request});
      draft=null;request=null;
      return result;
    };
  }
  function shell(root, title, body) {
    root.innerHTML = '<header class="wave-hero"><h1>' + title + '</h1></header>' + body;
  }
  function action(button, operation, feedback) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await operation(); }
      catch (error) { feedback.textContent = 'Unable to complete that action. ' + error.message; }
      finally { button.disabled = false; }
    });
  }
  pages.mod = async function (root, route, client, user, esc) {
    shell(root, 'Moderator desk', '<p role="status">Checking access…</p>');
    try {
      if (!user) throw new Error('Sign in as a moderator.');
      const inbox = await rpc(client, 'moderation_inbox');
      if (location.hash !== '#/mod') return;
      shell(root, 'Moderator desk', '<p role="status"></p><h2>Review queue</h2><div class="wave-grid">' +
        inbox.queue.map(row => '<article class="wave-card"><strong>' + esc(row.kind) + '</strong><p>' +
          esc(row.body || row.content_ref) + '</p><button class="big ghost" data-review="' + row.id +
          '" value="approve">Approve</button><button class="big ghost" data-review="' + row.id + '" value="hide">Hide</button>' +
          (row.kind === 'username' ? '<button class="big ghost" data-reset="' + esc(row.content_ref) + '">Reset username</button>' : '') +
          (row.subject_id || row.kind === 'username' ? '<button class="big ghost" data-strike="' + esc(row.subject_id || row.content_ref) + '">Issue next strike</button>' : '') + '</article>').join('') +
        '</div><h2>Strike appeals</h2><div class="wave-grid">' + inbox.appeals.map(row =>
          '<article class="wave-card"><p>' + esc(row.reason) + '</p><button class="big ghost" data-appeal="' + row.strike_id +
          '" value="uphold">Uphold</button><button class="big ghost" data-appeal="' + row.strike_id +
          '" value="reverse">Reverse</button></article>').join('') + '</div>');
      root.querySelectorAll('button').forEach(button => action(button, async () => {
        const { review, appeal, reset, strike } = button.dataset;
        if (review) await rpc(client, 'review_content', { p_id: Number(review), p_decision: button.value });
        if (appeal) await rpc(client, 'review_appeal', { p_id: Number(appeal), p_decision: button.value });
        if (reset) await rpc(client, 'reset_reported_username', { p_user: reset });
        if (strike) await rpc(client, 'issue_strike', { p_user: strike });
        await pages.mod(root, route, client, user, esc);
      }, root.querySelector('[role=status]')));
    } catch (error) {
      if (location.hash === '#/mod') shell(root, 'Moderator desk', '<p>Moderator access required.</p>');
    }
  };
  pages.strikes = async function (root, route, client, user, esc) {
    shell(root, 'My strikes', '<p role="status">Loading…</p>');
    const feedback = root.querySelector('[role=status]');
    try {
      if (!user) { feedback.textContent = 'Sign in to see your strikes.'; return; }
      const strikes = await rpc(client, 'my_strikes');
      if (!feedback.isConnected) return;
      feedback.textContent = strikes.length ? '' : 'No strikes.';
      strikes.forEach(strike => {
        const card = document.createElement('article');
        card.className = 'wave-card';
        card.innerHTML = '<strong>' + esc(strike.action) + '</strong>' + (strike.decision ? '<p>' + esc(strike.decision) +
          '</p>' : '<label>Appeal reason <textarea maxlength="500"></textarea></label><button class="big ghost">Send appeal</button>');
        root.append(card);
        const button = card.querySelector('button');
        if (button) action(button, async () => {
          await rpc(client, 'appeal_strike', { p_id: Number(strike.id), p_reason: card.querySelector('textarea').value });
          card.querySelector('label').remove();
          button.remove();
          card.append('Appeal sent.');
        }, feedback);
      });
    } catch (error) { feedback.textContent = error.message; }
  };
  return { pages, rpc, shell, action, submission };
})();

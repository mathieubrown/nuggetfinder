window.NuggetfinderCommunity = (function () {
  'use strict';
  const pages = {};
  async function rpc(client, name, parameters) {
    const result = await client.rpc(name, parameters);
    if (result.error) {
      if(result.error.message==='participant_session_required')throw new Error('Open Your crew to participate with your individual profile.');
      if(result.error.message==='vote_history_hold')throw new Error('Voting is paused until previous activity is outside the 24-hour window.');
      throw result.error;
    }
    return result.data;
  }
  // Keep a request ID after an uncertain response, so retrying cannot duplicate a write.
  function submission(client, name, owner) {
    const requests=new Map();
    return async function(payload){
      if(owner && client.auth?.getSession){const session=await client.auth.getSession();if(session.error || session.data?.session?.user?.id!==owner)throw new Error('account_changed');}
      const serialized=JSON.stringify(payload);
      let fingerprint=serialized;
      if(crypto.subtle){
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
        fingerprint=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
      }
      const key='nuggetfinder_request_v1:'+name+':'+(owner || 'local')+':'+fingerprint;
      let request=requests.get(key);
      // Session storage contains only hashed payloads and random request IDs,
      // never draft text. Separate accounts and entry points have separate keys.
      if(!request && crypto.subtle){try{request=sessionStorage.getItem(key);}catch(error){/* Storage may be disabled. */}}
      if(!request){request=crypto.randomUUID();requests.set(key,request);}
      if(crypto.subtle){try{sessionStorage.setItem(key,request);}catch(error){/* Open-draft retries still work in memory. */}}
      const result=await rpc(client,name,{...payload,p_request:request});
      requests.delete(key);
      if(crypto.subtle){try{sessionStorage.removeItem(key);}catch(error){/* No draft content was stored. */}}
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
      if(window.NuggetfinderCommunity.mountCourtReview)await window.NuggetfinderCommunity.mountCourtReview(root,client,esc);
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

(function (community) {
  const {rpc, action} = community;
  community.addRespond = (card, client, user, row, esc, signIn, feedback) => {
    const details = document.createElement('details');
    details.innerHTML = '<summary class="wave-link">Respond</summary><div class="response-box">' +
      '<p data-counts></p><div class="btns"><button class="big pink" value="with">I’m with them</button>' +
      '<button class="big ghost" value="against">I’m against</button></div>' +
      '<label>Short reply <textarea maxlength="180" rows="2"></textarea></label>' +
      '<button class="big ghost" value="reply">Send reply</button><div data-replies></div></div>';
    card.append(details);
    if (user && user.id === row.author_id) {
      details.querySelector('.btns').remove();
    }
    async function refresh() {
      const result = await rpc(client,'take_responses',{p_take:row.id});
      if (!result) return;
      details.querySelector('[data-counts]').textContent = result.with + ' with · ' + result.against + ' against';
      details.querySelectorAll('button[value="with"],button[value="against"]').forEach(button => {
        button.setAttribute('aria-pressed',String(button.value===result.mine));
      });
      const replies = details.querySelector('[data-replies]');
      replies.replaceChildren();
      result.replies.forEach(reply => {
        const entry = document.createElement('article');
        entry.innerHTML = '<p>' + esc(reply.body) + '</p><strong>@' + esc(reply.handle) + '</strong>';
        replies.append(entry);
        if(user && user.id!==reply.author_id)community.addSafetyButtons(entry,client,{kind:'reply',ref:reply.id,author:reply.author_id},feedback);
      });
    }
    details.addEventListener('toggle', () => {
      if (details.open) refresh().catch(error => { feedback.textContent = error.message; });
    });
    details.querySelectorAll('button').forEach(button => action(button, async () => {
      if (!user) return signIn('Sign in to respond.');
      const field = details.querySelector('textarea');
      if (button.value==='reply') {
        await rpc(client,'respond_take',{p_take:row.id,p_body:field.value});
        field.value='';
        feedback.textContent='Reply sent for review.';
      } else {
        await rpc(client,'respond_take',{p_take:row.id,p_reaction:button.value});
        feedback.textContent='Response saved.';
      }
      await refresh();
    },feedback));
  };
})(NuggetfinderCommunity);

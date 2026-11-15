(function ({pages, rpc, shell}) {
  pages.take = function (root, route, client, user, esc, signIn) {
    const query = new URLSearchParams(route.query);
    const kind = query.get('kind') || 'product';
    const ref = query.get('ref') || '';
    const products = NuggetfinderSeed.products;
    shell(root, 'Drop a take', '<form class="wave-card"><label for="takeProduct">What is it about?</label>' +
      (ref ? '<p>' + esc(query.get('label') || ref) + '</p>' : '<select id="takeProduct">' +
      products.map(product => '<option value="' + esc(product.id) + '">' + esc(product.name) + '</option>').join('') + '</select>') +
      '<label for="takeText">Your take</label><textarea id="takeText" maxlength="280" required rows="5" placeholder="What did you think?"></textarea>' +
      '<button class="big pink" type="submit">Post take</button><p role="status"></p></form>');
    const form = root.querySelector('form');
    if (ref) form.querySelector('label').textContent = 'About this ' + kind;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!user) return signIn('Sign in to post a take.');
      const button = form.querySelector('button');
      const feedback = form.querySelector('[role=status]');
      button.disabled = true;
      try {
        const result = await rpc(client, 'submit_take', {
          p_kind: kind, p_ref: ref || form.querySelector('select').value,
          p_body: form.querySelector('textarea').value
        });
        feedback.textContent = result === 'published' ? 'Take posted.' : 'Take sent for review.';
        form.querySelector('textarea').value = '';
      } catch (error) { feedback.textContent = 'Could not post your take. ' + error.message; }
      finally { button.disabled = false; }
    });
  };
})(NuggetfinderCommunity);

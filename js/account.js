(function ({pages, rpc, shell, action}) {
  function download(data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nuggetfinder-data.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  pages.account = (root, route, client, user, esc, signIn) => {
    shell(root, 'Account', '<div class="wave-card"><h2>My data</h2><button class="big pink" id="exportData">Download my data</button>' +
      '<p role="status"></p><h2>Delete my account</h2><p>Account deletion is pending review and setup.</p></div>' +
      '<nav class="wave-nav" aria-label="Policies"><a href="#/terms">Terms</a><a href="#/privacy">Privacy</a><a href="#/dmca">DMCA contact</a></nav>');
    action(root.querySelector('#exportData'), async () => {
      if (!user) return signIn('Sign in to export your data.');
      const data = await rpc(client, 'export_my_data');
      Object.assign(data, await rpc(client, 'export_wave2_take_data'));
      Object.assign(data, await rpc(client, 'export_beef_data'));
      download(data);
    }, root.querySelector('[role=status]'));
  };
  const drafts = {
    terms: ['Terms', 'Browse the map and post reports about what you saw. Follow the community rules and avoid spam, harassment and misleading reports. Reports reflect user observations. Availability can change. Moderators may hide content or restrict accounts. You can appeal a strike.'],
    privacy: ['Privacy', 'We use email for sign-in and show your username on public posts. We store reports, votes, blocks and moderation decisions. A map report may include a yes or no flag for whether you were nearby. The account page lets you export your data. Retention periods, contact details and deletion terms are pending review.'],
    dmca: ['DMCA contact', 'Copyright contact and designated agent details are pending review. A notice will need to identify the work, the material and its location, and explain how to reach the sender.']
  };
  Object.entries(drafts).forEach(([key, [title, content]]) => {
    pages[key] = root => shell(root, title, '<article class="wave-card"><strong>DRAFT, NEEDS LAWYER REVIEW</strong><p>' + content + '</p></article>');
  });
  window.NuggetfinderCommunity.addSafetyButtons = (card, client, {kind, ref, author}, feedback) => {
    const report = document.createElement('button');
    report.className = 'big ghost';
    report.textContent = 'Report';
    const block = document.createElement('button');
    block.className = 'big ghost';
    block.textContent = 'Block author';
    card.append(report, block);
    action(report, async () => {
      await rpc(client, 'report_content', {p_kind:kind,p_ref:String(ref),p_reason:'other'});
      feedback.textContent = 'Report sent.';
    }, feedback);
    action(block, async () => {
      await rpc(client, 'set_user_block', {p_user:author,p_block:true});
      card.remove();
      feedback.textContent = 'Author blocked.';
    }, feedback);
  };
})(NuggetfinderCommunity);

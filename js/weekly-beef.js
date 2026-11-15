(function(community){
  const {pages,rpc,shell}=community;
  pages.weekly=async function(root,route,client,user,esc){
    shell(root,'Weekly Beef results','<p>Last completed Monday through Sunday, UTC</p><p role="status">Loading results…</p><div class="wave-grid"></div>');
    const feedback=root.querySelector('[role=status]');
    const grid=root.querySelector('.wave-grid');
    try{
      const rows=await rpc(client,'weekly_beef');
      if(!grid.isConnected)return;
      feedback.textContent=rows.length && rows[0].week_of?'Week of '+rows[0].week_of:'';
      if(!rows.length)grid.innerHTML=NuggetfinderSparkle.empty('No votes last week.');
      rows.forEach(row=>{
        const left=Number(row.left_votes),right=Number(row.right_votes);
        const card=document.createElement('article');
        card.className='wave-card beef-card';
        card.innerHTML='<div class="beef-vs"><strong>'+esc(row.left_label)+' · '+left+
          '</strong><b>VS</b><strong>'+esc(row.right_label)+' · '+right+'</strong></div><p class="tag">'+
          (left===right?'= TIE':'★ '+esc(left>right?row.left_label:row.right_label)+' WINS')+
          '</p><a class="wave-link" href="#/beef/'+encodeURIComponent(row.id)+'">Open matchup</a>';
        grid.append(card);
        community.addBeefShare(card,row,feedback);
      });
    }catch(error){feedback.textContent='Could not load weekly results. '+error.message;}
  };
})(NuggetfinderCommunity);

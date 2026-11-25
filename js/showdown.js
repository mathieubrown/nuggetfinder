(function (community) {
  const {pages,rpc,shell,action} = community;
  pages.showdown = async function(root,route,client,user,esc,signIn) {
    shell(root,NuggetfinderShowdown.title,'<p role="status">Loading matchups…</p><a class="wave-link" href="#/weekly-winners">'+NuggetfinderShowdown.weekly+'</a><div id="showdownResults" class="wave-grid"></div>');
    const feedback=root.querySelector('[role=status]');
    const results=root.querySelector('#showdownResults');
    try {
      const rows=await rpc(client,'matchups',route.id ? {p_id:route.id} : {});
      if (!results.isConnected) return;
      feedback.textContent=rows.length?'':'No matchup found.';
      rows.forEach(row=>{
        const title=row.left_label+' vs '+row.right_label;
        const card=document.createElement('article');
        card.className='wave-card showdown-card';
        if(!route.id){
          card.innerHTML='<a class="wave-link" href="#/showdown/'+encodeURIComponent(row.id)+'">'+esc(title)+'</a>';
        } else {
          const from=new URLSearchParams(route.query).get('from');
          const handle=document.getElementById('who').textContent.replace(/^@/,'');
          const total=Number(row.left_votes)+Number(row.right_votes);
          const percent=total?Math.round(100*Number(row.left_votes)/total):50;
          card.innerHTML='<div class="showdown-vs"><strong>'+esc(row.left_label)+'</strong><b>VS</b><strong>'+esc(row.right_label)+'</strong></div>'+
            (from && /^[a-z0-9_]{3,20}$/i.test(from)?'<p>Challenge shared by @'+esc(from)+'</p>':'')+
            '<meter min="0" max="100" value="'+percent+'" aria-label="Left side share of votes"></meter>'+
            '<p>'+Number(row.left_votes)+' left · '+Number(row.right_votes)+' right</p>'+
            '<div class="btns"><button class="big pink" data-vote="left" aria-pressed="'+(row.mine==='left')+'">Vote left</button>'+
            '<button class="big ghost" data-vote="right" aria-pressed="'+(row.mine==='right')+'">Vote right</button></div>'+
            '<a class="wave-link" href="#/take?kind=matchup&ref='+encodeURIComponent(row.id)+'&label='+encodeURIComponent(title)+'">Drop a take</a>'+
            (handle?'<button class="big ghost" data-copy>Copy challenge link</button>':'');
          card.querySelectorAll('[data-vote]').forEach(button=>action(button,async()=>{
            if(!user)return signIn('Sign in to vote.');
            await rpc(client,'vote_matchup',{p_matchup:row.id,p_side:button.dataset.vote});
            if(results.isConnected)await pages.showdown(root,route,client,user,esc,signIn);
          },feedback));
          const copy=card.querySelector('[data-copy]');
          if(copy)action(copy,async()=>{
            const url=new URL(location.href);
            url.hash='/showdown/'+encodeURIComponent(row.id)+'?from='+encodeURIComponent(handle);
            await navigator.clipboard.writeText(url.href);
            feedback.textContent='Challenge link copied.';
          },feedback);
          if(community.addShowdownShare)community.addShowdownShare(card,row,feedback);
        }
        results.append(card);
        if (route.id) community.addSaveButtons(card, client, user, 'matchup', row.id, signIn);
      });
    }catch(error){feedback.textContent='Could not load Showdown. '+error.message;}
  };
})(NuggetfinderCommunity);

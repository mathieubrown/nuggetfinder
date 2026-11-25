(function (community) {
  'use strict';
  const {pages,rpc,shell,action}=community;
  pages.showdown=async function(root,route,client,user,esc,signIn) {
    shell(root,NuggetfinderShowdown.title,'<nav class="showdown-links"><a href="#/court">Nugget Court</a>'+
      '<a href="#/weekly-winners">'+NuggetfinderShowdown.weekly+'</a></nav>'+
      '<p role="status">Loading matchups…</p><div data-showdowns></div>');
    const feedback=root.querySelector('[role=status]');
    const target=root.querySelector('[data-showdowns]');
    try {
      const rows=await rpc(client,'matchups',route.id?{p_id:route.id}:{});
      if(!target.isConnected)return;
      feedback.textContent='';
      if(!rows.length){target.innerHTML=NuggetfinderSparkle.empty('No Showdown found.');return;}
      if(!route.id) {
        target.className='wave-grid';
        rows.forEach(row=>{
          const link=document.createElement('a');
          link.className='wave-card wave-link';
          link.href='#/showdown/'+encodeURIComponent(row.id);
          link.textContent=row.left_label+' vs '+row.right_label;
          target.append(link);
        });
        return;
      }
      const row=rows[0];
      const total=Number(row.left_votes)+Number(row.right_votes);
      const left=total?Math.round(100*Number(row.left_votes)/total):0;
      const right=total?100-left:0;
      const from=new URLSearchParams(route.query).get('from');
      const sort=new URLSearchParams(route.query).get('sort')==='new'?'new':'hot';
      root.querySelector('.wave-hero').innerHTML='<p class="showdown-kicker">SHOWDOWN · SAUCE WAR</p>'+
        '<h1>'+esc(row.left_label)+'<br>VS '+esc(row.right_label)+'</h1>';
      target.innerHTML=(from && /^[a-z0-9_]{3,20}$/i.test(from)?'<p>Challenge from @'+esc(from)+'</p>':'')+
        '<div class="percent-blocks"><section class="percent-side side-left"><h2>'+esc(row.left_label)+'</h2><strong>'+
        (total?left+'%':'—')+'</strong><span>'+Number(row.left_votes)+' votes</span></section>'+
        '<section class="percent-side side-right"><h2>'+esc(row.right_label)+'</h2><strong>'+
        (total?right+'%':'—')+'</strong><span>'+Number(row.right_votes)+' votes</span></section></div>'+
        '<div class="showdown-meter" role="meter" aria-label="Left side vote percentage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+left+'">'+
        '<span style="width:'+left+'%"></span></div><p class="showdown-vote-meta">'+total+' votes total'+(!total?' · Voting is open':'')+'</p>'+
        '<div class="showdown-vote-buttons"><button class="big ghost" data-side="left" aria-pressed="'+(row.mine==='left')+'">Vote '+esc(row.left_label)+
        '</button><button class="big ghost" data-side="right" aria-pressed="'+(row.mine==='right')+'">Vote '+esc(row.right_label)+'</button></div>'+
        '<section class="showdown-takes"><div class="section-heading"><h2>The Takes</h2><nav aria-label="Take order">'+
        ['hot','new'].map(tab=>'<a href="#/showdown/'+encodeURIComponent(row.id)+'?sort='+tab+
          (from?'&from='+encodeURIComponent(from):'')+'"'+(tab===sort?' aria-current="page"':'')+'>'+tab+'</a>').join('')+
        '</nav></div><div data-showdown-takes></div></section>'+
        '<a class="drop-take-bar" href="#/take?kind=matchup&ref='+encodeURIComponent(row.id)+'">Drop a take</a>'+
        '<div class="showdown-extras"></div>';
      target.querySelectorAll('[data-side]').forEach(button=>action(button,async()=>{
        if(!user)return signIn('Sign in to pick a side.');
        await rpc(client,'vote_matchup',{p_matchup:row.id,p_side:button.dataset.side});
        if(target.isConnected)await pages.showdown(root,route,client,user,esc,signIn);
      },feedback));
      const extra=target.querySelector('.showdown-extras');
      const copy=document.createElement('button');
      copy.className='big ghost';copy.textContent='Copy challenge link';extra.append(copy);
      action(copy,async()=>{
        const url=new URL(location.href);
        const handle=user?document.getElementById('who').textContent.replace(/^@/,''):'';
        url.hash='/showdown/'+encodeURIComponent(row.id)+(handle?'?from='+encodeURIComponent(handle):'');
        await navigator.clipboard.writeText(url.href);
        feedback.textContent='Challenge link copied.';
      },feedback);
      community.addShowdownShare(extra,row,feedback);
      community.addSaveButtons(extra,client,user,'matchup',row.id,signIn);
      const takes=await rpc(client,'take_cards',{p_kind:'matchup',p_ref:row.id,p_sort:sort});
      if(!target.isConnected)return;
      const list=target.querySelector('[data-showdown-takes]');
      if(!takes.length)list.innerHTML=NuggetfinderSparkle.empty('No published takes yet. Pick a side and make your case.');
      takes.forEach(take=>list.append(community.takeCard(take,client,user,esc,signIn,feedback)));
    }catch(error){if(target.isConnected)feedback.textContent='Showdown is unavailable right now.';}
  };
})(NuggetfinderCommunity);

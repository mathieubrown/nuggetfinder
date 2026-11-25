(function (community) {
  'use strict';
  const {rpc,action,pages,shell}=community;
  const stamps={sauce_heretic:'Sauce Heretic',certified_tender:'Certified Tender',nope:'Nope'};
  community.stamps=stamps;

  community.takeTile=function(row,esc) {
    const tile=document.createElement('article');
    tile.className='take-thumbnail stamp-'+(row.stamp || 'plain');
    tile.innerHTML=(row.stamp?'<span class="take-stamp">'+stamps[row.stamp]+'</span>':'')+
      (row.team?'<span class="team-badge">TEAM '+esc(row.team_label || (row.team==='left'?'LEFT':'RIGHT'))+'</span>':'')+
      '<p>'+esc(row.body)+'</p><a href="#/take-view?id='+row.id+'">Read take · @'+esc(row.handle)+'</a>';
    return tile;
  };

  community.takeCard=function(row,client,user,esc,signIn,feedback,depth=0) {
    const card=document.createElement('article');
    card.className='take-thread';
    const tile=community.takeTile(row,esc);
    card.append(tile);
    const content=document.createElement('div');
    content.className='take-thread-content';
    content.innerHTML='<a class="take-author" href="#/taste?user='+encodeURIComponent(row.author_id)+'">@'+esc(row.handle)+'</a>'+
      (row.stamp?'<span class="take-stamp stamp-'+row.stamp+'">'+stamps[row.stamp]+'</span>':'')+
      (row.parent_handle?'<p class="small">Rebuttal to @'+esc(row.parent_handle)+'</p>':'')+
      '<p>'+esc(row.body)+'</p>'+
      (row.tagged_handle?'<a class="wave-link" href="#/taste?user='+encodeURIComponent(row.tagged_user_id)+'">Tagged @'+esc(row.tagged_handle)+'</a>':'')+
      (row.place_name?'<a class="wave-link" href="#/spot/'+encodeURIComponent(row.attached_place_id)+'">'+esc(row.place_name)+'</a>':'')+
      '<div class="take-response-line"><a class="rebut-button" href="#/take?kind='+encodeURIComponent(row.subject_kind)+
      '&ref='+encodeURIComponent(row.subject_ref)+'&parent='+row.id+'">Rebut</a><span data-counts>'+
      Number(row.clowned || 0)+' clowned · '+Number(row.rebuttals || 0)+' rebuttals</span></div>'+
      '<div class="reaction-buttons"></div>';
    card.append(content);
    const reactions=content.querySelector('.reaction-buttons');
    if (!user || user.id!==row.author_id) {
      for (const [value,label] of [['with','I’m with them'],['against','I’m against']]) {
        const button=document.createElement('button');
        button.className='reaction-button';
        button.textContent=label;
        button.setAttribute('aria-pressed',String(row.reaction===value));
        reactions.append(button);
        action(button,async()=>{
          if (!user) return signIn('Sign in to respond.');
          await rpc(client,'respond_take',{p_take:row.id,p_reaction:value});
          const [updated]=await rpc(client,'take_cards',{p_take:row.id});
          if (updated && card.isConnected) card.replaceWith(community.takeCard(updated,client,user,esc,signIn,feedback,depth));
        },feedback);
      }
    }
    const thread=document.createElement('details');
    thread.className='rebuttal-thread';
    thread.innerHTML='<summary class="wave-link">Read responses</summary><div data-children></div>';
    content.append(thread);
    let loaded=false;
    thread.addEventListener('toggle',async()=>{
      if (!thread.open || loaded) return;
      try {
        const [children,responses]=await Promise.all([
          depth<3?rpc(client,'take_cards',{p_parent:row.id,p_sort:'new'}):Promise.resolve([]),
          rpc(client,'take_responses',{p_take:row.id})
        ]);
        if (!thread.isConnected) return;
        const target=thread.querySelector('[data-children]');
        if (!children.length && !responses?.replies?.length) target.textContent='No published responses yet.';
        children.forEach(child=>target.append(community.takeCard(child,client,user,esc,signIn,feedback,depth+1)));
        (responses?.replies || []).forEach(reply=>{
          const entry=document.createElement('article');
          entry.className='legacy-reply';
          entry.innerHTML='<strong>@'+esc(reply.handle)+'</strong><p>'+esc(reply.body)+'</p>';
          target.append(entry);
          if(user && user.id!==reply.author_id) community.addSafetyButtons(entry,client,{kind:'reply',ref:reply.id,author:reply.author_id},feedback);
        });
        loaded=true;
      } catch(error) { feedback.textContent='Could not load responses. Please try again.'; }
    });
    if(user && user.id!==row.author_id) community.addSafetyButtons(content,client,{kind:'take',ref:row.id,author:row.author_id},feedback);
    if(community.addTakeShare) community.addTakeShare(content,row,feedback);
    return card;
  };

  pages['take-view']=async(root,route,client,user,esc,signIn)=>{
    shell(root,'The take','<p role="status">Loading…</p><div data-take></div>');
    const feedback=root.querySelector('[role=status]');
    const target=root.querySelector('[data-take]');
    try{
      const [row]=await rpc(client,'take_cards',{p_take:Number(new URLSearchParams(route.query).get('id'))});
      if(!target.isConnected)return;
      feedback.textContent='';
      if(row)target.append(community.takeCard(row,client,user,esc,signIn,feedback));
      else target.innerHTML=NuggetfinderSparkle.empty('This take is unavailable.');
    }catch(error){feedback.textContent='Could not load the take.';}
  };
})(NuggetfinderCommunity);

(function (community) {
  'use strict';
  const {pages,rpc}=community;
  pages.take=async function(root,route,client,user,esc,signIn) {
    const query=new URLSearchParams(route.query);
    const parent=query.get('parent');
    let kind=query.get('kind') || 'product';
    let ref=query.get('ref') || '';
    let selectedStamp='sauce_heretic';
    let tagged=null;
    let place=null;
    root.innerHTML='<div class="composer"><header class="composer-header"><a href="#/feed" aria-label="Close composer">×</a>'+
      '<h1>Drop a take</h1><button type="button" data-reset aria-label="Reset your draft">↻</button></header>'+
      '<form><div class="composer-context"><label for="takeKind">About</label><select id="takeKind">'+
      '<option value="product">Product</option><option value="place">Place</option><option value="matchup">Showdown</option>'+
      '<option value="court">Nugget Court</option></select><select id="takeTarget" aria-label="Choose the subject" required><option value="">Loading…</option></select></div>'+
      '<div class="composer-preview"><span class="composer-stamp">SAUCE HERETIC</span>'+
      '<label class="visually-hidden" for="takeText">Your take</label><textarea id="takeText" maxlength="280" required rows="7" placeholder="Roast the nugget. Make your case."></textarea>'+
      '<span class="composer-character-count">0 / 280</span></div>'+
      '<div class="composer-media"><button type="button" data-soon="Video">Record · soon</button><button type="button" data-soon="Photo">Photo · soon</button>'+
      '<span>Text take</span></div>'+
      '<div class="composer-tag-options"><details><summary>@ Tag a friend</summary><label for="friendSearch">Find a handle</label>'+
      '<input id="friendSearch" minlength="2" maxlength="20" placeholder="At least two letters"><button type="button" data-find>Find</button>'+
      '<select id="tagFriend" aria-label="Tag an account"><option value="">No tag</option></select></details>'+
      '<details><summary># Add a spot</summary><label for="attachPlace">Choose a real place</label>'+
      '<select id="attachPlace"><option value="">No extra spot</option></select></details></div>'+
      '<fieldset class="composer-stamps"><legend class="visually-hidden">Choose a stamp</legend>'+
      Object.entries(community.stamps).map(([key,label])=>'<button type="button" data-stamp="'+key+'" aria-pressed="'+(key===selectedStamp)+'">'+label+'</button>').join('')+
      '</fieldset><div class="composer-actions"><button type="button" data-soon="Video">Upload · soon</button>'+
      '<button type="submit" class="post-take" disabled>Post</button><button type="button" data-tips>Tips</button></div>'+
      '<p role="status"></p><p class="composer-guidance">Stamps express opinions. Roast the nugget, not the person. Reports can pull a take down.</p></form></div>';
    const form=root.querySelector('form');
    const feedback=form.querySelector('[role=status]');
    const submit=form.querySelector('[type=submit]');
    const target=form.querySelector('#takeTarget');
    const kindInput=form.querySelector('#takeKind');
    const body=form.querySelector('textarea');
    const counter=form.querySelector('.composer-character-count');
    let targets={};
    let parentRow=null;

    function renderTargets() {
      const rows=targets[kind] || [];
      target.innerHTML='<option value="">Choose one</option>'+rows.map(row=>'<option value="'+esc(String(row.id))+'">'+
        esc(row.name)+'</option>').join('');
      target.value=rows.some(row=>String(row.id)===ref)?ref:'';
      submit.disabled=!rows.length;
    }
    body.addEventListener('input',()=>{counter.textContent=Array.from(body.value).length+' / 280';});
    kindInput.addEventListener('change',()=>{kind=kindInput.value;ref='';renderTargets();});
    target.addEventListener('change',()=>{ref=target.value;});
    form.querySelectorAll('[data-soon]').forEach(button=>button.onclick=()=>{
      feedback.textContent=button.dataset.soon==='Photo'?'Photo uploads are coming soon.':'Video is coming soon.';
    });
    form.querySelector('[data-tips]').onclick=()=>{
      feedback.textContent='Tell us what you tried, choose a stamp and keep it under 280 characters. Your first take is reviewed.';
    };
    root.querySelector('[data-reset]').onclick=()=>{
      if(body.value && !confirm('Clear your take draft?'))return;
      body.value='';counter.textContent='0 / 280';feedback.textContent='';
    };
    form.querySelectorAll('[data-stamp]').forEach(button=>button.onclick=()=>{
      selectedStamp=button.dataset.stamp;
      form.querySelectorAll('[data-stamp]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      const stamp=form.querySelector('.composer-stamp');
      stamp.textContent=community.stamps[selectedStamp];
      stamp.className='composer-stamp stamp-'+selectedStamp;
    });
    form.querySelector('[data-find]').onclick=async()=>{
      const input=form.querySelector('#friendSearch');
      if(input.value.trim().length<2){feedback.textContent='Enter at least two letters of a handle.';return;}
      const button=form.querySelector('[data-find]');
      button.disabled=true;
      try {
        const rows=await rpc(client,'find_tastes',{p_query:input.value.trim()});
        if(!form.isConnected)return;
        form.querySelector('#tagFriend').innerHTML='<option value="">No tag</option>'+rows.map(row=>
          '<option value="'+esc(row.id)+'">@'+esc(row.handle)+'</option>').join('');
        feedback.textContent=rows.length?'Choose the account you mean.':'No matching handle found.';
      }catch(error){feedback.textContent='Could not search handles.';}
      finally{button.disabled=false;}
    };
    form.querySelector('#tagFriend').onchange=event=>{tagged=event.target.value || null;};
    form.querySelector('#attachPlace').onchange=event=>{place=event.target.value || null;};

    try {
      const [products,places,matchups,cases]=await Promise.all([
        client.from('products').select('id,brand,name').order('name'),
        rpc(client,'discovery_targets'),rpc(client,'matchups',{}),rpc(client,'court_cases',{})
      ]);
      if(!form.isConnected)return;
      if(products.error)throw products.error;
      targets={
        product:products.data.map(row=>({id:row.id,name:row.brand+' · '+row.name})),
        place:places.map(row=>({id:row.id,name:row.name+(row.area?' · '+row.area:'')})),
        matchup:matchups.map(row=>({id:row.id,name:row.left_label+' vs '+row.right_label})),
        court:cases.map(row=>({id:row.id,name:row.food_name}))
      };
      if(parent) {
        const [row]=await rpc(client,'take_cards',{p_take:Number(parent)});
        if(!row)throw new Error('rebuttal_unavailable');
        if(!form.isConnected)return;
        parentRow=row;kind=row.subject_kind;ref=String(row.subject_ref);
        if(targets[kind] && !targets[kind].some(item=>String(item.id)===ref)) {
          targets[kind].push({id:ref,name:row.subject?.title || row.subject?.name || "Original subject"});
        }
        root.querySelector('h1').textContent='Rebuttal to @'+row.handle;
        kindInput.disabled=true;target.disabled=true;
      }
      kindInput.value=kind;
      if(!kindInput.value){kind='product';kindInput.value=kind;}
      renderTargets();
      form.querySelector('#attachPlace').innerHTML='<option value="">No extra spot</option>'+places.map(row=>
        '<option value="'+esc(row.id)+'">'+esc(row.name+(row.area?' · '+row.area:''))+'</option>').join('');
      if(kind==='place' && ref){place=ref;form.querySelector('#attachPlace').value=ref;}
    } catch(error) {
      if(form.isConnected)feedback.textContent=parent?'This rebuttal target is unavailable.':'Could not load subjects. Please try again.';
      submit.disabled=true;
      return;
    }

    let posting=false;
    const post=community.submission(client,'submit_take_request',user?.id);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(posting)return;
      if(!user)return signIn('Sign in to post a take.');
      posting=true;
      const submittedBody=body.value;
      form.setAttribute('aria-busy','true');
      submit.disabled=true;
      try {
        const result=await post({p_kind:kind,p_ref:target.value,p_body:body.value,
          p_stamp:selectedStamp,p_parent:parentRow?parentRow.id:null,p_tagged:tagged,
          p_place:kind==='place'?target.value:place});
        feedback.textContent=result.status==='published'?'Take posted.':'Take sent for review.';
        if(result.status==='published'){
          const link=document.createElement('a');link.className='wave-link';link.href='#/take-view?id='+result.id;link.textContent='Read your take';
          feedback.append(' ',link);
        }
        if(body.value===submittedBody){body.value='';counter.textContent='0 / 280';}
      }catch(error){feedback.textContent='Could not confirm your post. Retry this draft safely without creating a duplicate.';}
      finally{posting=false;submit.disabled=false;form.removeAttribute('aria-busy');}
    });
  };
})(NuggetfinderCommunity);

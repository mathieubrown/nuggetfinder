(function (community, player) {
  'use strict';
  const api = (operation, data, token) => player.request(operation, data, token);

  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function link(path, text) {
    const node = element('a', text, 'wave-link');
    node.href = path;
    return node;
  }

  function errorText(error) {
    const messages = {
      invalid_product_details:'Check the product name, brand and category.',
      business_scope_required:'This product and store are outside your verified business permissions.',
      adult_business_account_required:'Business claims require a verified individual adult profile.',
      business_source_required:'Use a public official business website.',
      participant_session_unavailable:'Reconnect your player or check account permissions.',
      review_checks_required:'Check the source before approving.',
      review_queue_full:'The review queue is full. Try again later.',
      unsupported_scoped_screen:'This action is currently unavailable.'
    };
    return messages[error.message] || error.message.replaceAll('_',' ');
  }

  function photoLink(kind, ref, purpose, label = 'Add a photo') {
    const query = new URLSearchParams({kind,ref:String(ref),purpose});
    return link('#/photo?' + query, label);
  }

  async function gallery(root, kind, ref) {
    if (!player.enabled) return;
    const container = element('div', '', 'evidence-gallery');
    root.append(container);
    try {
      const photos = await api('context-photos',{kind,ref:String(ref)});
      if (!container.isConnected || !photos.length) return;
      container.append(element('h3','Reviewed food photos'));
      for (const photo of photos) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = '/api/public-photo/' + encodeURIComponent(photo.id) + '/display';
        image.alt = 'Reviewed ' + photo.purpose.replaceAll('_',' ') + ' photo';
        image.loading = 'lazy';
        image.addEventListener('error', () => figure.remove());
        const caption = element('figcaption', photo.observed_on
          ? 'Observed '+photo.observed_on.slice(0,10)
          : 'Submitted '+photo.submitted_on.slice(0,10));
        const report = element('button','Report photo','big ghost');
        report.onclick = async () => {
          report.disabled = true;
          try {
            await player.api('photo',{operation:'report',data:{id:photo.id,reason:'other'}});
            report.textContent = 'Sent for review';
          } catch (error) {
            report.disabled = false;
            caption.textContent = errorText(error);
          }
        };
        figure.append(image,caption,report);
        container.append(figure);
      }
    } catch { container.remove(); }
  }

  async function sendEvidence({person, kind, ref, purpose, observed, draft}) {
    const object = await player.api('photo',{operation:'reserve',data:{
      request:draft.request,attested:true,purpose:purpose||'review',kind,ref:String(ref),observed_at:observed||null
    }},true,person.participant);
    if(player.current()?.participant!==person.participant)throw Error('account_changed');
    const response=await fetch('/api/upload/'+object.id,{method:'POST',credentials:'omit',headers:{
      Authorization:'Bearer '+person.token,'Content-Type':'application/octet-stream','X-Revision':String(object.revision)
    },body:draft.blob});
    const result=await response.json();
    if(!response.ok)throw Error(result.error);
    return result;
  }

  function uploadScreen(root, route, client, user, esc) {
    const {kind,ref,purpose} = Object.fromEntries(new URLSearchParams(route.query));
    if (!kind || !ref) {
      community.shell(root,'Food evidence','<p>Open a product, place, report or take to attach a photo.</p>');
      return;
    }
    community.shell(root,'Food evidence','<p>Crop or cover private details before sending your photo for review.</p>' +
      '<label>Observation date and time <input type="datetime-local" data-observed></label>' +
      '<div data-editor></div><button class="big pink" data-upload disabled>Send for human review</button>' +
      '<p role="status"></p><a class="wave-link" href="#/activity">Your submissions</a>');
    const editorRoot = root.querySelector('[data-editor]');
    const observed = root.querySelector('[data-observed]');
    const button = root.querySelector('[data-upload]');
    const status = root.querySelector('[role=status]');
    let prepared, busy = false;
    function reset() {
      prepared = null;
      button.disabled = true;
    }
    const editor = community.mountPhotoEvidence(editorRoot, {
      onChange:reset,
      onPrepared({blob}) {
        prepared = {blob,request:crypto.randomUUID(),owner:player.current()?.participant};
        button.disabled = busy;
      }
    });
    observed.oninput = () => { if(prepared) prepared.request = crypto.randomUUID(); };
    const observer = new MutationObserver(() => {
      if (!editorRoot.isConnected) { editor.dispose(); observer.disconnect(); }
    });
    observer.observe(root,{childList:true});
    button.onclick = async () => {
      if (!prepared || busy) return;
      const draft = prepared;
      busy = true;
      button.disabled = true;
      try {
        const person = await player.connect();
        if (!editorRoot.isConnected || prepared !== draft || (draft.owner && person.participant !== draft.owner)) throw Error('account_changed');
        await sendEvidence({person,kind,ref,purpose,draft,observed:observed.value?new Date(observed.value).toISOString():null});
        status.textContent = '◷ PENDING REVIEW · Food photo saved privately.';
        if (prepared === draft) reset();
      } catch (error) { status.textContent = errorText(error); }
      finally { busy = false; button.disabled = !prepared; }
    };
  }

  function catalogForm(root, route, client, user, esc, business = false) {
    const query = new URLSearchParams(route.query);
    const place = query.get('place') || '';
    const product = query.get('product') || '';
    community.shell(root,business?'Business access':'Suggest a product or listing',
      '<form class="wave-card catalog-request"><label>Request <select name="kind">' +
      (business?'<option value="store_claim">Claim a store</option><option value="brand_claim">Claim a brand</option><option value="stock">Report business stock</option>':
        '<option value="product">Suggest a new product</option><option value="listing">Link an existing product to a store</option>') +
      '</select></label><div data-fields></div><button class="big pink" disabled>Send</button><p role="status"></p></form><a class="wave-link" href="#/activity">View your submissions</a>');
    const form = root.querySelector('form');
    let priorKey, priorRequest;
    player.request('catalog-data',{}).then(catalog => {
      if (!form.isConnected) return;
      const fields = form.querySelector('[data-fields]');
      const options = (rows, label) => rows.map(row => '<option value="'+esc(row.id)+'">'+esc(label(row))+'</option>').join('');
      const placePicker = '<label>Store <select name="place"><option value="">Choose a place</option>'+options(catalog.places,row=>row.name+(row.area?' · '+row.area:''))+'</select></label>';
      const productPicker = '<label>Product <select name="product" required><option value="">Choose a product</option>'+options(catalog.products,row=>row.brand+' · '+row.name)+'</select></label>';
      const render = () => {
        const kind = form.elements.kind.value;
        if (kind === 'product') fields.innerHTML = '<label>Product name <input name="name" required maxlength="100"></label><label>Brand <input name="brand" required maxlength="80"></label><label>Category <select name="product_kind"><option value="nuggets">Nuggets</option><option value="tenders">Tenders</option><option value="sauce">Sauce</option><option value="side">Side</option></select></label>'+placePicker;
        if (kind === 'listing') fields.innerHTML = productPicker+placePicker;
        if (kind === 'stock') fields.innerHTML = productPicker+placePicker+'<label>Stock <select name="status"><option value="seen">Seen it</option><option value="sold_out">Sold out</option></select></label><p>Business reports appear separately from community confirmation.</p>';
        if (kind === 'store_claim' || kind === 'brand_claim') fields.innerHTML = (kind==='store_claim'?placePicker:'<label>Brand <input name="brand" required maxlength="80"></label>')+
          '<label>Public official business website <input type="url" name="source" placeholder="https://" required maxlength="500"></label><p>A reviewer verifies your authority before business access is granted.</p>';
        if(form.elements.place){form.elements.place.value=place;form.elements.place.required=kind!=='product';}
        if(form.elements.product)form.elements.product.value=product;
      };
      if (product && !business) form.elements.kind.value='listing';
      form.elements.kind.onchange=render;
      render();
      form.querySelector('button').disabled=false;
    }).catch(error=>{form.querySelector('[role=status]').textContent=errorText(error);});
    form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button'),status=form.querySelector('[role=status]');
      const data=Object.fromEntries([...new FormData(form)].filter(([,value])=>value!==''));
      const operation=data.kind==='stock'?'stock':'submit';
      const key=JSON.stringify(data);
      if(key!==priorKey){priorRequest=crypto.randomUUID();priorKey=key;}
      button.disabled=true;
      try{
        const result=await player.api('catalog-request',{operation,data:{...data,request:priorRequest}});
        status.textContent=operation==='stock'?'✓ Verified business report saved.':'◷ PENDING REVIEW · Suggestion saved.';
        if(result.status==='approved')status.textContent='✓ Approved';
      }catch(error){status.textContent=errorText(error);}
      finally{button.disabled=false;}
    };
  }

  async function activity(root) {
    community.shell(root,'Your submissions','<div data-activity aria-live="polite"><p>Loading submissions…</p></div>');
    const panel=root.querySelector('[data-activity]');
    try {
      const person=await player.connect();
      const data=await player.api('screen',{operation:'activity',data:{}},true,person.participant);
      const catalog=await player.api('catalog-request',{operation:'mine',data:{}},true,person.participant);
      if(!panel.isConnected)return;
      panel.replaceChildren();
      for(const [heading,rows] of Object.entries({Takes:data.takes,Photos:data.photos,Places:data.places,'Products and business requests':catalog})){
        panel.append(element('h2',heading));
        if(!rows.length)panel.append(element('p','No submissions yet.'));
        for(const row of rows){
          const card=element('article','', 'wave-card');
          card.append(element('strong',row.name || row.body || row.payload?.name || row.payload?.brand || row.purpose || row.kind));
          const labels={pending:'◷ PENDING REVIEW',published:'✓ PUBLISHED',approved:'✓ APPROVED',hidden:'× HIDDEN',rejected:'× REJECTED',deleted:'− DELETED',deleting:'◷ DELETING',reserved:'○ RESERVED',removed:'× REMOVED',duplicate:'↗ ALREADY ON MAP'};
          card.append(element('p',labels[row.status]||row.status,'location-status'));
          if(row.place_id)card.append(link('#/spot/'+encodeURIComponent(row.place_id),'Open place'));
          if(row.product_id)card.append(link('#/product/'+encodeURIComponent(row.product_id),'Open product'));
          if(heading==='Takes'&&['pending','published'].includes(row.status))card.append(photoLink('take',row.id,'take','Attach food photo'));
          panel.append(card);
        }
      }
    } catch(error){panel.textContent=errorText(error);}
  }

  async function mountCatalogReview(root, token, esc) {
    const panel=element('section','','place-review');
    root.append(panel);
    const rows=await api('mod-catalog',{},token);
    if(!panel.isConnected)return;
    panel.append(element('h2','Products, listings and business claims'));
    if(!rows.length)panel.append(element('p','No pending catalog requests.'));
    for(const row of rows){
      const card=element('article','','wave-card');
      card.append(element('h3',row.kind.replaceAll('_',' ')+(row.status==='approved'?' · Verified':' · Pending')));
      for(const [label,value] of Object.entries(row.payload).filter(([key])=>!['request','kind'].includes(key)))card.append(element('p',label.replaceAll('_',' ')+': '+value));
      const check=document.createElement('input');check.type='checkbox';
      const label=element('label','','location-attest');label.append(check,document.createTextNode('I checked the source, product or store. For a claim, I independently confirmed authority through the business.'));
      if(row.status!=='approved')card.append(label);
      const feedback=element('p','');feedback.setAttribute('role','status');
      for(const [decision,caption] of (row.status==='approved'?[['revoke','Revoke business access']]:[['approve','Approve'],['reject','Reject']])){
        const button=element('button',caption,'big ghost');
        button.onclick=async()=>{
          button.disabled=true;
          try{
            await api('mod-catalog',{id:row.id,decision,checked:check.checked},token);
            panel.remove();await mountCatalogReview(root,token,esc);
          }catch(error){feedback.textContent=errorText(error);button.disabled=false;}
        };
        card.append(button);
      }
      card.append(feedback);
      panel.append(card);
    }
  }

  async function businessStock(root, product, place) {
    if (!player.enabled) return;
    try {
      const reports=await api('business-stock',{product,place});
      if(!root.isConnected)return;
      for(const report of reports){
        const words=report.status==='seen'?'✓ SEEN':'× SOLD OUT';
        root.append(element('p',words+' · '+report.source+' · '+new Date(report.observed_at).toLocaleString(),'location-status'));
      }
    } catch { /* Community confidence remains available independently. */ }
  }

  if(player.enabled && community.pages){
    community.pages.photo=uploadScreen;
    community.pages['suggest-product']=(root,route,client,user,esc)=>catalogForm(root,route,client,user,esc,false);
    community.pages.business=(root,route,client,user,esc)=>catalogForm(root,route,client,user,esc,true);
    community.pages.activity=activity;
  }
  window.NuggetfinderFunctional={gallery,photoLink,mountCatalogReview,businessStock,sendEvidence};
})(NuggetfinderCommunity,NuggetfinderParticipant);

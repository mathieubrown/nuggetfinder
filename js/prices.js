(function (community) {
  'use strict';
  const {pages,rpc,shell}=community;
  const money=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(value));
  const units={piece:'piece',g:'gram',ml:'mL'};

  pages.prices=async function(root,route,client,user,esc,signIn) {
    const query=new URLSearchParams(route.query);
    let place=query.get('place') || '';
    let product=query.get('product') || '';
    let unit=['piece','g','ml'].includes(query.get('unit'))?query.get('unit'):'piece';
    let brand='';
    let allergenFilter=false;
    shell(root,'Prices','<p class="price-subtitle">Shelf prices in USD, sorted by cost per unit</p>'+
      '<div class="price-store"><label for="priceStore">Choose a store</label><select id="priceStore"><option value="">Loading stores…</option></select><p data-store-area></p></div>'+
      '<div data-sponsored></div><div class="price-filters"><label>Compare<select id="priceUnit">'+
      Object.entries(units).map(([key,label])=>'<option value="'+key+'">Per '+label+'</option>').join('')+'</select></label>'+
      '<label>Brand<select id="priceBrand"><option value="">All brands</option></select></label>'+
      '<button class="big ghost" type="button" data-allergens aria-pressed="false">Allergens</button></div>'+
      '<p class="small" data-filter-info></p><p role="status"></p><div data-ledger></div>'+
      '<details class="price-entry-form"><summary class="wave-link">Add a price</summary><form class="wave-card">'+
      '<label for="priceProduct">Product</label><select id="priceProduct" required></select>'+
      '<label for="priceAmount">Pack price in USD</label><input id="priceAmount" type="number" min="0.01" max="10000" step="0.01" required>'+
      '<label for="priceQuantity">Quantity in pack</label><input id="priceQuantity" type="number" min="1" max="100000" step="1" required>'+
      '<p class="small" data-quantity-unit>Count the pieces in this pack.</p>'+
      '<button class="big pink" type="submit">Add price entry</button>'+
      '<p class="small">Entries are saved in history. One entry per product and store every 10 minutes, up to 20 per rolling day.</p></form></details>');
    const store=root.querySelector('#priceStore');
    const products=root.querySelector('#priceProduct');
    const brandInput=root.querySelector('#priceBrand');
    const unitInput=root.querySelector('#priceUnit');
    const feedback=root.querySelector('[role=status]');
    const ledger=root.querySelector('[data-ledger]');
    const form=root.querySelector('form');
    let targets;
    let request=0;

    function renderProducts() {
      const allowed=new Set(targets.links.filter(link=>link.place_id===place).map(link=>link.product_id));
      const choices=targets.products.filter(item=>allowed.has(item.id));
      products.innerHTML='<option value="">Choose a product</option>'+choices.map(item=>'<option value="'+esc(item.id)+'">'+
        esc(item.brand+' · '+item.name+(item.size?' · '+item.size:''))+'</option>').join('');
      if(!allowed.has(product))product='';
      products.value=product;
      form.querySelector('button').disabled=!choices.length;
      const names=[...new Set(choices.map(item=>item.brand))].sort();
      brandInput.innerHTML='<option value="">All brands</option>'+names.map(name=>'<option>'+esc(name)+'</option>').join('');
      if(!names.includes(brand))brand='';
      brandInput.value=brand;
      const current=targets.places.find(item=>item.id===place);
      const address=root.querySelector('[data-store-area]');
      address.textContent=current?.area || '';
      address.hidden=!current?.area;
    }
    async function refresh() {
      const id=++request;
      feedback.textContent='Loading price history…';
      try {
        const rows=await rpc(client,'price_ledger',{p_place:place || null,p_unit:unit,p_product:product || null});
        if(!ledger.isConnected || id!==request)return;
        feedback.textContent='';
        root.querySelector('[data-filter-info]').textContent=allergenFilter?'Showing entries with sourced allergen information. Check the packaging.':'';
        const filtered=rows.filter(row=>(!brand || row.brand===brand) && (!allergenFilter || row.allergens.length));
        const current=filtered.filter(row=>!row.superseded);
        const cheapest=current.length?Math.min(...current.map(row=>Number(row.unit_cost))):null;
        ledger.innerHTML='<div class="price-table-heading"><span>Item</span><span>Pack</span><span>Price</span><span>Per '+units[unit]+'</span></div>';
        if(!filtered.length){ledger.innerHTML+=NuggetfinderSparkle.empty('No price entries for this selection yet.');return;}
        filtered.forEach(row=>{
          const entry=document.createElement('article');
          entry.className='price-row'+(row.superseded?' price-superseded':'')+
            (!row.superseded && Number(row.unit_cost)===cheapest?' best-deal-row':'');
          const per=Number(row.unit_cost)<1?(100*Number(row.unit_cost)).toFixed(1)+'¢':money(row.unit_cost);
          entry.innerHTML='<div class="price-item"><strong>'+esc(row.product_name)+'</strong><span class="small">'+esc(row.brand)+'</span>'+
            '<span class="price-stock stat s-'+NuggetfinderWave.stockStatus(row.stock)+'">'+
            NuggetfinderCatalog.statusLabel(NuggetfinderWave.stockStatus(row.stock))+'</span>'+
            '<div>'+community.badges.verified('store',row.verified_store)+(row.verified_store?'':community.badges.crowd())+'</div>'+
            '<div class="allergen-chips">'+row.allergens.map(community.badges.allergen).join('')+'</div>'+
            (!row.allergens.length?'<span class="small">No allergen information reported.</span>':'')+'</div>'+
            '<span>'+Number(row.quantity)+' '+esc(row.unit==='piece'?'ct':row.unit)+'</span>'+
            '<span'+(row.superseded?' class="old-price"':'')+'>'+money(row.price)+'</span>'+
            '<span class="unit-price">'+per+(!row.superseded && Number(row.unit_cost)===cheapest?'<b>Best Deal</b>':'')+'</span>'+
            '<div class="price-attribution"><span>'+esc(row.masked_handle)+' · '+esc(new Date(row.created_at).toLocaleString())+'</span>'+
            '<span class="ledger-state'+(row.superseded?' superseded':'')+'">'+(row.superseded?'SUPERSEDED':'CURRENT')+'</span></div>';
          ledger.append(entry);
        });
      } catch(error) {if(ledger.isConnected && id===request)feedback.textContent='Could not load prices. Please try again.';}
    }
    try {
      targets=await rpc(client,'price_targets');
      if(!ledger.isConnected)return;
      store.innerHTML=targets.places.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name+(item.area?' · '+item.area:''))+'</option>').join('');
      if(!targets.places.some(item=>item.id===place))place=targets.places[0]?.id || '';
      store.value=place;
      unitInput.value=unit;
      const quantity=form.querySelector('#priceQuantity');
      quantity.min=unit==='piece'?'1':'0.001';
      quantity.step=unit==='piece'?'1':'0.001';
      root.querySelector('[data-quantity-unit]').textContent=unit==='piece'?'Count the pieces in this pack.':'Enter the pack size in '+units[unit]+'s.';
      renderProducts();
      await refresh();
    }catch(error){feedback.textContent='Store and product choices are unavailable.';return;}

    store.onchange=()=>{place=store.value;product='';renderProducts();refresh();};
    brandInput.onchange=()=>{brand=brandInput.value;refresh();};
    unitInput.onchange=()=>{
      unit=unitInput.value;
      const field=form.querySelector('#priceQuantity');
      field.min=unit==='piece'?'1':'0.001';field.step=unit==='piece'?'1':'0.001';
      root.querySelector('[data-quantity-unit]').textContent=unit==='piece'?'Count the pieces in this pack.':'Enter the pack size in '+units[unit]+'s.';
      refresh();
    };
    root.querySelector('[data-allergens]').onclick=event=>{
      allergenFilter=!allergenFilter;
      event.currentTarget.setAttribute('aria-pressed',String(allergenFilter));refresh();
    };
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!user)return signIn('Sign in to add a price.');
      const button=form.querySelector('button');
      button.disabled=true;
      try {
        await rpc(client,'submit_price',{p_place:place,p_product:products.value,
          p_price:Number(form.querySelector('#priceAmount').value),
          p_quantity:Number(form.querySelector('#priceQuantity').value),p_unit:unit});
        await refresh();
        feedback.textContent='Price entry saved.';
        form.querySelector('#priceAmount').value='';form.querySelector('#priceQuantity').value='';
      }catch(error){feedback.textContent=error.message.includes('cooldown')?'Wait 10 minutes before adding another price for this product here.':'Could not save the price. Please check the numbers.';}
      finally{button.disabled=false;}
    });
  };
})(NuggetfinderCommunity);

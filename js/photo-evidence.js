(function (community) {
 'use strict';
 // One editor for every evidence context. No originals, drafts or coordinates go to a network.
 function mount(root, {onPrepared=()=>{}}={}) {
  root.innerHTML='<section class="photo-lab"><div class="photo-sticker" aria-hidden="true">EXHIBIT A</div><h2>Let the nugget testify.</h2>'+
   '<p>Food, packaging and shelf details only. Keep people, payment details and personal information out.</p>'+
   '<div class="photo-pickers"><label class="photo-button">Take a photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-camera></label>'+
   '<label class="photo-button">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" data-library></label></div>'+
   '<p class="small">JPEG, PNG or WebP. Up to 8 MB and 12 million pixels. Video stays off the menu.</p>'+
   '<div class="photo-work" hidden><canvas aria-label="Food photo preview with permanent black redactions"></canvas>'+
   '<fieldset><legend>Frame it</legend><button type="button" data-crop="full" aria-pressed="true">Full photo</button><button type="button" data-crop="square" aria-pressed="false">Center square</button></fieldset>'+
   '<fieldset><legend>Cover private details</legend><p>Choose a rectangle. Black it out, then inspect the whole image.</p>'+
   ['Left','Top','Width','Height'].map((label,i)=>'<label>'+label+' (%)<input data-coordinate="'+i+'" type="number" min="'+(i<2?'0':'1')+'" max="100" value="'+[10,10,25,25][i]+'"></label>').join('')+
   '<button type="button" data-redact>Black out rectangle</button><button type="button" data-clear>Undo all redactions</button></fieldset>'+
   '<label class="photo-attest"><input type="checkbox" data-attest> I checked: food or products only, no people or private details.</label>'+
   '<button class="photo-button" type="button" data-prepare>Prepare private draft</button><button type="button" data-discard>Discard photo</button></div>'+
   '<p role="status" aria-live="polite">Private on this device. Nothing has been uploaded.</p></section>';
  const work=root.querySelector('.photo-work'), canvas=root.querySelector('canvas'), status=root.querySelector('[role=status]');
  let image=null, redactions=[], crop='full', revision=0, disposed=false;
  function draw(){
   if(!image)return;
   const size=crop==='square'?Math.min(image.width,image.height):null;
   const sx=size?(image.width-size)/2:0,sy=size?(image.height-size)/2:0;
   const width=size||image.width,height=size||image.height,scale=Math.min(1,1600/Math.max(width,height));
   canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,sx,sy,width,height,0,0,canvas.width,canvas.height);
   ctx.fillStyle='#000';redactions.forEach(([x,y,w,h])=>ctx.fillRect((x*image.width-sx)*scale,(y*image.height-sy)*scale,w*image.width*scale,h*image.height*scale));
  }
  function changed(){revision++;root.querySelector('[data-attest]').checked=false;status.textContent='Private draft changed. Inspect it again before preparing.';draw();}
  root.querySelectorAll('input[type=file]').forEach(input=>input.onchange=async()=>{
   const file=input.files[0];input.value='';if(!file)return;
   const attempt=++revision;
   try{
    if(!file.size||file.size>8*1024*1024)throw Error('Choose a photo smaller than 8 MB.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use JPEG, PNG or WebP.');
    const next=await createImageBitmap(file,{imageOrientation:'from-image'});
    if(next.width*next.height>12000000){next.close();throw Error('Choose a photo under 12 million pixels.');}
    if(disposed||attempt!==revision){next.close();return;}
    image?.close();image=next;redactions=[];crop='full';work.hidden=false;
    root.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crop===crop)));
    changed();
   }catch(error){if(attempt===revision&&!disposed)status.textContent=error.message;}
  });
  root.querySelectorAll('[data-crop]').forEach(button=>button.onclick=()=>{crop=button.dataset.crop;root.querySelectorAll('[data-crop]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));changed();});
  root.querySelector('[data-redact]').onclick=()=>{
   const [x,y,w,h]=Array.from(root.querySelectorAll('[data-coordinate]'),input=>Number(input.value)/100);
   if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>1||y+h>1){status.textContent='Keep the rectangle inside the image: position plus size must be 100% or less.';return;}
   if(redactions.length>=30){status.textContent='Maximum 30 redactions.';return;}
   redactions.push([x,y,w,h]);changed();
  };
  root.querySelector('[data-clear]').onclick=()=>{redactions=[];changed();};
  root.querySelector('[data-prepare]').onclick=()=>{
   if(!image||!root.querySelector('[data-attest]').checked){status.textContent='Inspect the image and check the food-only confirmation first.';return;}
   const expected=revision;
   canvas.toBlob(blob=>{
    if(disposed||revision!==expected||!blob)return;
    onPrepared({blob,mime:'image/jpeg',width:canvas.width,height:canvas.height});
    status.textContent='Private draft prepared. Uploads are held pending consent, secure storage and moderation setup. A photo does not confirm stock or price.';
   },'image/jpeg',0.82);
  };
  function discard(){revision++;image?.close();image=null;redactions=[];canvas.width=1;canvas.height=1;work.hidden=true;status.textContent='Photo discarded. Nothing was uploaded.';}
  root.querySelector('[data-discard]').onclick=discard;
  return {dispose(){disposed=true;discard();}};
 }
 community.mountPhotoEvidence=mount;
 community.pages.photo=(root,route,client,user,esc)=>{
  const query=new URLSearchParams(route.query), kind=query.get('kind'), ref=query.get('ref');
  community.shell(root,'Nugget evidence','<p class="photo-hold">DEVELOPMENT PREVIEW · Publication is on hold.</p>'+
   (kind&&ref?'<p>Prepared for '+esc(kind)+': '+esc(ref)+'</p>':'')+'<div data-photo-editor></div><p><a href="#/participation">Family &amp; participation controls</a></p>');
  const editor=mount(root.querySelector('[data-photo-editor]'));
  const observer=new MutationObserver(()=>{if(!root.querySelector('[data-photo-editor]')){editor.dispose();observer.disconnect();}});
  observer.observe(root,{childList:true});
 };
 community.pages.participation=async(root,route,client,user,esc)=>{
  community.shell(root,'Your nugget crew','<div class="photo-sticker">ALL AGES. SAME GAME.</div><p>Individual identities. Equal votes. Private by default.</p>'+
   '<div class="wave-card"><h2>Parent-managed profiles</h2><p>Children get their own pseudonym, stamps and votes after verified parental consent. Teens get private defaults. No public age, friend directory, contact uploads or direct messages.</p><p>Account creation and invitation codes are not enabled in this preview.</p></div>'+
   '<div data-participants><p role="status">'+(user?'Checking your private profiles…':'Sign in to view your private profiles. No information is public here.')+'</p></div>'+
   '<div class="wave-card"><h2>Roast the nugget, not the person.</h2><p>Discovery, Showdowns, Court, trails, ratings and food photos belong in every age group. Consent and safety checks must pass before a capability opens.</p><a href="#/photo">Try the private photo editor</a></div>');
  if(!user)return;
  const panel=root.querySelector('[data-participants]');
  try{
   const rows=await community.rpc(client,'my_participants');if(!panel.isConnected)return;
   panel.innerHTML=rows.length?rows.map(p=>'<article class="wave-card"><h2>'+esc(p.pseudonym)+'</h2><p>'+(p.paused?'Paused':'Private participant')+'</p><ul>'+Object.entries(p.capabilities).map(([key,on])=>'<li>'+esc(key)+': '+(on?'Available':'Awaiting requirements')+'</li>').join('')+'</ul><button type="button" data-pause="'+esc(p.id)+'">Pause participation</button></article>').join(''):'<p>No participant profiles are provisioned. Consent setup is still on hold.</p>';
   panel.querySelectorAll('[data-pause]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await community.rpc(client,'pause_participant',{p_participant:button.dataset.pause});button.textContent='Participation paused';}catch(error){button.disabled=false;button.textContent='Could not pause. Try again.';}});
  }catch(error){if(panel.isConnected)panel.textContent='Participation controls are not connected yet. No permissions have been enabled.';}
 };
})(window.NuggetfinderCommunity);

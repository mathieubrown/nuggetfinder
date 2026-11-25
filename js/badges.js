(function (community) {
  'use strict';
  const names={peanut:'Peanut',peanut_oil:'Peanut oil',milk:'Milk',egg:'Egg',wheat:'Wheat',
    soy:'Soy',sesame:'Sesame',tree_nut:'Tree nuts',fish:'Fish',shellfish:'Shellfish',gluten:'Gluten'};
  function esc(value) {return String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
  function verified(scope,confirmed) {
    if(confirmed!==true || !['store','brand'].includes(scope))return '';
    return '<span class="identity-badge verified">✓ VERIFIED '+scope.toUpperCase()+'</span>';
  }
  function crowd() {return '<span class="identity-badge crowd">CROWD REPORT</span>';}
  function allergen(evidence) {
    if(!evidence || !names[evidence.allergen])return '';
    const name=names[evidence.allergen];
    if(evidence.state==='contains')return '<span class="allergen-badge contains">⚠ '+esc(name.toUpperCase())+'</span>';
    if(evidence.state==='suggested_free')return '<span class="allergen-badge suggested">'+esc(name.toUpperCase())+' FREE?</span>';
    if(evidence.state==='confirmed_free' && /^https:\/\//i.test(evidence.source_url || ''))return '<a class="allergen-badge confirmed" href="'+
      esc(evidence.source_url)+'" target="_blank" rel="noopener noreferrer">✓ '+esc(name.toUpperCase())+' FREE</a>';
    return '';
  }
  function sponsored(campaign) {
    if(!campaign || !campaign.paid_by || !campaign.title)return '';
    return '<aside class="sponsored-unit" aria-label="Sponsored placement"><span class="sponsored-label">SPONSORED</span>'+
      '<strong>'+esc(campaign.title)+'</strong><p>Paid by '+esc(campaign.paid_by)+'</p>'+
      (campaign.url && /^https:\/\//i.test(campaign.url)?'<a href="'+esc(campaign.url)+'" rel="sponsored noopener noreferrer" target="_blank">See offer</a>':'')+'</aside>';
  }
  community.badges={verified,crowd,allergen,sponsored};
  community.pages.badges=function(root) {
    community.shell(root,'Badges','<p>How the app shows who said what.</p><section class="badge-section"><h2>Sponsored</h2>'+
      '<div class="sponsored-unit"><span class="sponsored-label">SPONSORED</span>'+
      '<p>This blue is reserved for paid placements. Every paid item names its advertiser as “Paid by &lt;brand&gt;”.</p>'+
      '<p class="small">Style guide preview</p></div></section>'+
      '<section class="badge-section"><h2>Who said it</h2><div class="identity-examples">'+verified('store',true)+
      verified('brand',true)+crowd()+'</div><p class="small">Store and brand badges require account verification.</p></section>'+
      '<section class="badge-section"><h2>Allergens</h2><div class="badge-explanation"><span class="allergen-badge confirmed">✓ ALLERGEN FREE</span>'+
      '<p>Confirmed with a linked source. Check the product label before eating.</p></div>'+
      '<div class="badge-explanation"><span class="allergen-badge suggested">ALLERGEN FREE?</span><p>Suggested, awaiting confirmation.</p></div>'+
      '<div class="badge-explanation"><span class="allergen-badge contains">⚠ CONTAINS</span><p>A caution reported by a shopper. Check the source and packaging.</p></div>'+
      '<p class="small">These are badge styles, not claims about any product.</p></section>'+
      '<section class="badge-section"><h2>Price ledger</h2><div class="badge-explanation"><span class="ledger-state">CURRENT</span>'+
      '<p>The current store entry, or the latest crowd entry when no verified store price is available.</p></div>'+
      '<div class="badge-explanation"><span class="ledger-state superseded">SUPERSEDED</span><p>An older entry preserved in the price history.</p></div>'+
      '<a class="wave-link" href="#/prices">Open prices</a></section>');
  };
})(NuggetfinderCommunity);

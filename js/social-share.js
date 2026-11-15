(function (community) {
  const {action}=community;
  function addShare(card,details,feedback) {
    const button=document.createElement('button');
    button.className='big ghost';
    button.textContent='Download share card';
    card.append(button);
    action(button,()=>NuggetfinderShare.download(details),feedback);
  }
  community.addTakeShare=(card,row,feedback)=>addShare(card,{
    brand:'NUGGETFINDER TAKES',product:row.body,productId:'take-'+row.id,
    place:row.subject_kind.toUpperCase(),area:row.subject_ref,
    username:'@'+row.handle,status:'pending',label:'★ COMMUNITY TAKE'
  },feedback);

  community.addBeefShare=(card,row,feedback)=>{
    const left=Number(row.left_votes),right=Number(row.right_votes);
    addShare(card,{
      brand:'NUGGETFINDER BEEF',product:row.left_label+' vs '+row.right_label,
      productId:'beef-'+row.id,place:left+' votes · '+right+' votes',area:'Beef results',
      status:left===right?'mixed':'yes',
      label:!left&&!right?'− NO VOTES':left===right?'= TIE':'★ '+(left>right?row.left_label:row.right_label),
      lastSeen:row.week_of?'Week of '+row.week_of:'Results at '+new Date().toLocaleDateString()
    },feedback);
  };
})(NuggetfinderCommunity);

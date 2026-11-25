(function(community){
 'use strict';
 community.mountCourtReview=async function(root,client,esc){
  const section=document.createElement('section');section.className='court-moderation';
  section.innerHTML='<h2>Closed Court rounds</h2><p>Voting ends after seven days. Record the closed ballot here. Corrections create a new public version; they never replace the history or choose a winner.</p><p role="status">Loading rounds…</p><div data-rounds></div><div data-ruling-form></div>';
  root.append(section);const feedback=section.querySelector('[role=status]');
  const rounds=await community.rpc(client,'court_rounds_for_review');if(!section.isConnected)return;
  feedback.textContent=rounds.length?'':'No closed rounds to record.';
  const list=section.querySelector('[data-rounds]');
  rounds.forEach(row=>{
   const button=document.createElement('button');button.className='big ghost';button.textContent=row.food_name+' · '+(row.current_version?'v'+row.current_version:'not recorded');list.append(button);
   community.action(button,()=>open(row.id),feedback);
  });
  async function open(id){
   const row=await community.rpc(client,'court_review_state',{p_case:id});if(!section.isConnected || !row)return;
   const target=section.querySelector('[data-ruling-form]');const current=Number(row.current_version);
   target.innerHTML='<form class="wave-card"><h3>'+esc(row.food_name)+' · '+(current?'correct v'+current:'record initial ruling')+'</h3>'+
    '<p class="small">Seven days · at least 20 voters · 60% · no forced winner. Decisions are derived from the recorded ballot.</p>'+
    (current?'<fieldset><legend>Exclude recorded ballots after review</legend>'+row.ballots.filter(b=>b.eligible_at_record).map(ballot=>
     '<label class="check"><input type="checkbox" name="ballot" value="'+Number(ballot.id)+'" '+(row.excluded_ballots.includes(ballot.id)?'checked':'')+'>Ballot '+Number(ballot.id)+' · '+esc(ballot.verdict)+
     ' · '+esc(ballot.handle || 'deleted account')+(ballot.currently_banned?' · account banned':'')+'</label>').join('')+'</fieldset>':'<p>The first version preserves the eligible recorded votes. Later bans or deletions cannot silently recalculate it.</p>')+
    '<label for="courtCorrectionReason">Reason</label><select id="courtCorrectionReason">'+
    (current?[['eligibility_review','Eligibility review'],['vote_abuse','Vote abuse'],['account_deletion','Account deletion'],['clerical_correction','Clerical correction']]:[['round_closed','Round closed']]).map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+'</select>'+
    '<label for="courtCorrectionNote">Public audit note</label><textarea id="courtCorrectionNote" required maxlength="280">'+(current?'':'Seven-day voting round closed.')+'</textarea>'+
    '<button type="submit" class="big pink">'+(current?'Record corrected version':'Record closed ruling')+'</button></form>';
   const form=target.querySelector('form');let busy=false;
   form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
     const version=await community.rpc(client,'record_court_ruling',{p_case:id,p_expected_version:current,
      p_excluded:[...form.querySelectorAll('[name=ballot]:checked')].map(input=>Number(input.value)),
      p_reason:form.querySelector('select').value,p_note:form.querySelector('textarea').value});
     await open(id);feedback.textContent='Recorded ruling v'+version+'. Earlier versions are preserved.';
    }catch(error){feedback.textContent=error.message.includes('version_conflict')?'Another moderator recorded a version. Reopen this round before trying again.':'Could not record the ruling. Check the note and ballot selection.';}
    finally{busy=false;button.disabled=false;}
   };
  }
 };
})(NuggetfinderCommunity);

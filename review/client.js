/* Only injected by the loopback review server. Contains no production authentication. */
(function(){
 'use strict';
 const role=()=>['a','b','mod'].includes(sessionStorage.getItem('nugget-review-role'))?sessionStorage.getItem('nugget-review-role'):'a';
 const request=async(operation,input)=>{const response=await fetch('/__review/'+operation,{method:'POST',headers:{'Content-Type':'application/json','X-Review-Role':role()},body:JSON.stringify(input)});return response.json();};
 const signedIn=()=>sessionStorage.getItem('nugget-review-signed-out')!=='yes';
 let callbacks=[];
 window.supabase={createClient(){return {
  auth:{async getSession(){const result=await request('session',{});return {data:{session:signedIn()?{user:result.user,...(role()==='mod'?{access_token:'local-moderator'}:{})}:null}};},onAuthStateChange(callback){callbacks.push(callback);return {data:{subscription:{unsubscribe(){callbacks=callbacks.filter(c=>c!==callback);}}}};},async signOut(){sessionStorage.setItem('nugget-review-signed-out','yes');callbacks.forEach(c=>c('SIGNED_OUT',null));return {error:null};},async signInWithOtp(){return {error:{message:'Use the review player selector. Email delivery is not simulated.'}};}},
  rpc(name,parameters={}){const promise=request('rpc',{name,parameters,anonymous:!signedIn()});promise.single=async()=>{const result=await promise;return {...result,data:Array.isArray(result.data)?result.data[0]||null:result.data};};return promise;},
  from(table){let filter=null,sort=null,columns='';const chain={select(value){columns=value;return chain;},eq(key,value){filter={key,value};return chain;},order(key){sort=key;return chain;},then(resolve,reject){return request('table',{table,columns,filter,sort,anonymous:!signedIn()}).then(resolve,reject);},async maybeSingle(){const result=await request('table',{table,columns,filter,sort,anonymous:!signedIn()});return {...result,data:result.data?.[0]||null};}};return chain;}
 };}};
 document.addEventListener('DOMContentLoaded',async()=>{
  const bar=document.querySelector('#reviewControls');if(!bar)return;
  let previousHeight=0;new ResizeObserver(()=>{const height=bar.getBoundingClientRect().height;if(height!==previousHeight){previousHeight=height;document.documentElement.style.setProperty('--review-bar-height',height+'px');window.dispatchEvent(new Event('resize'));}}).observe(bar);
  const feature=bar.querySelector('select[data-feature]');feature.onchange=()=>{if(feature.value)location.href=feature.value;};
  const picker=bar.querySelector('select[data-role]');picker.value=role();picker.onchange=()=>{sessionStorage.setItem('nugget-review-role',picker.value);sessionStorage.removeItem('nugget-review-signed-out');if(window.NuggetfinderCrew){location.href='/crew.html?role='+picker.value+'#'+(picker.value==='mod'?'mod':'parents');}else location.reload();};
  bar.querySelector('[data-signin]').onclick=()=>{sessionStorage.removeItem('nugget-review-signed-out');location.reload();};
  if(window.NuggetfinderParticipant&&role()!=='mod'){const result=await request('participant-session',{});if(result.token)NuggetfinderParticipant.setSession(result);}
  if(window.NuggetfinderCrew){
   const token=role()==='mod'?'local-moderator':'local-parent';
   const controls=bar.querySelector('[data-controls]');controls.onclick=()=>{history.replaceState(null,'','#'+(role()==='mod'?'mod':'parents'));NuggetfinderCrew.setParentToken(token);};
   controls.hidden=false;
   NuggetfinderCrew.setParentToken(token);
  }
 });
})();

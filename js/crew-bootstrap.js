// Standalone private participation surface.
window.NuggetfinderCommunity={
  pages:{},
  shell(root,title,body){root.innerHTML='<h1>'+title+'</h1>'+body;},
  async rpc(client,name,parameters){const result=await client.rpc(name,parameters);if(result.error)throw result.error;return result.data;},
  action(button,work,feedback){button.onclick=async()=>{button.disabled=true;try{await work();}catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}};}
};

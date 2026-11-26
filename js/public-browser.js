// Same-origin public reads for the hosted app. Scoped writes use the separate player API.
(function () {
  'use strict';
  async function read(operation, data) {
    try {
      const response=await fetch('/api/browse',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,data})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error);
      return {data:result,error:null};
    }catch(error){return {data:null,error:{message:error.message}};}
  }
  window.supabase={createClient(){return {
    rpc:read,
    from(table){
      let column, value, order;
      const chain={
        select(){return chain;},
        eq(key,next){column=key;value=next;return chain;},
        order(key){order=key;return chain;},
        then(resolve,reject){
          return read(table,{}).then(result=>{
            if(result.error)return result;
            if(column)result.data=result.data.filter(row=>row[column]===value);
            if(order)result.data.sort((a,b)=>String(a[order]).localeCompare(String(b[order])));
            return result;
          }).then(resolve,reject);
        }
      };
      return chain;
    }
  };}};
})();

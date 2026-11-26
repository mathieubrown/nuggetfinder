const {randomUUID}=require('node:crypto');const {Database,hash}=require('../../services/participation/runtime.cjs');
async function provision(db,account,band='under13',managed=true,options={}){
 await db.pool.query('insert into account_invitations(account_id) values($1) on conflict do nothing',[account]);
 const api=new Database(db.pool);const receipt=await api.call('runtime_parent',[account,'request_consent',{}]);
 await db.pool.query(`select runtime_verify_consent($1,$2,$3,'local-test-only',now()+interval '1 day',array['discover','rate','vote','challenge','compete','stamp','trail','rank','report','photo','social']||case when $4 then array['public_take'] else '{}'::text[] end,$5)`,[receipt.id,band,managed,!!options.publicTake,!!options.publicPhoto]);
 if(options.group)await db.pool.query('select runtime_verify_group_disclosure($1,$2)',[receipt.id,'isolated-group-disclosure']);
 const person=await api.call('runtime_parent',[account,'create',{receipt:receipt.id,pseudonym:'crunch_'+randomUUID().slice(0,8)}]);
 const token=randomUUID()+randomUUID();await api.call('runtime_parent',[account,'session',{participant:person.id,token_hash:hash(token)}]);return {id:person.id,token,hash:hash(token)};
}
module.exports={provision};

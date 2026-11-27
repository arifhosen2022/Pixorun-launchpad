(()=>{
'use strict';
const URL='https://ljqggnqvtnomzrxpapfo.supabase.co';
const KEY='sb_publishable_2UKZf6rx3rgg04ha0hwBqA_bBOoM5_D';
const headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
const fields='id,chain_id,token_address,curve_address,creator_address,token_name,token_symbol,tx_hash,block_number,created_at,description,image_url,banner_url,website_url,x_url,telegram_url,metadata_updated_at,tx_value_wei,gas_used,effective_gas_price_wei,metadata_json,metadata_signature,metadata_version,logo_sha256,banner_sha256,token_decimals,total_supply_wei,updated_at';
async function listLaunches(creator){
 const q=new URLSearchParams({select:fields,chain_id:'eq.46630',order:'block_number.desc',limit:'500'});
 if(creator)q.set('creator_address','ilike.'+creator);
 const r=await fetch(URL+'/rest/v1/token_launches?'+q.toString(),{headers});
 if(!r.ok)throw Error('Shared launch registry unavailable ('+r.status+').');
 return r.json();
}
async function getLaunch(address){
 if(!/^0x[a-fA-F0-9]{40}$/.test(address||''))throw Error('Invalid token address.');
 const q=new URLSearchParams({select:fields,chain_id:'eq.46630',token_address:'ilike.'+address,limit:'1'});
 const r=await fetch(URL+'/rest/v1/token_launches?'+q.toString(),{headers});
 if(!r.ok)throw Error('Token metadata unavailable ('+r.status+').');
 const rows=await r.json();return rows[0]||null;
}
async function registerLaunch(txHash,payload){
 const r=await fetch(URL+'/functions/v1/register-launch',{method:'POST',headers,body:JSON.stringify({txHash,...(payload||{})})});
 const body=await r.json().catch(()=>({}));
 if(!r.ok||!body.success)throw Error(body.error||'Could not sync this launch to the shared registry.');
 return body.launch;
}
window.PIXORUN_REGISTRY={listLaunches,getLaunch,registerLaunch};
})();
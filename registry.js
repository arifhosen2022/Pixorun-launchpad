(()=>{
'use strict';
const URL='https://ljqggnqvtnomzrxpapfo.supabase.co';
const KEY='sb_publishable_2UKZf6rx3rgg04ha0hwBqA_bBOoM5_D';
const headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'};
async function listLaunches(creator){const q=new URLSearchParams({select:'id,chain_id,token_address,curve_address,creator_address,token_name,token_symbol,tx_hash,block_number,created_at',chain_id:'eq.46630',order:'block_number.desc',limit:'500'});if(creator)q.set('creator_address','ilike.'+creator);const r=await fetch(URL+'/rest/v1/token_launches?'+q.toString(),{headers});if(!r.ok)throw Error('Shared launch registry unavailable ('+r.status+').');return r.json();}
async function registerLaunch(txHash){const r=await fetch(URL+'/functions/v1/register-launch',{method:'POST',headers,body:JSON.stringify({txHash})});const body=await r.json().catch(()=>({}));if(!r.ok||!body.success)throw Error(body.error||'Could not sync this launch to the shared registry.');return body.launch;}
window.PIXORUN_REGISTRY={listLaunches,registerLaunch};
})();
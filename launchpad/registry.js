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
async function syncTrade(address,txHash){
 const r=await fetch(URL+'/functions/v1/sync-trade',{method:'POST',headers,body:JSON.stringify({tokenAddress:address,txHash})});
 const body=await r.json().catch(()=>({}));
 if(!r.ok||!body.success)throw Error(body.error||'Instant market sync failed.');
 return body;
}
async function getMarketData(address){
 if(!/^0x[a-fA-F0-9]{40}$/.test(address||''))throw Error('Invalid token address.');
 const base=URL+'/rest/v1/',token=address.toLowerCase();
 const snapQ=new URLSearchParams({select:'chain_id,token_address,price_native,market_cap_native,liquidity_native,liquidity_token,volume_24h_native,price_change_24h,trades_24h,holder_count,last_trade_at,indexed_block,data_updated_at',chain_id:'eq.46630',token_address:'eq.'+token,limit:'1'});
 const tradesQ=new URLSearchParams({select:'tx_hash,log_index,block_number,block_timestamp,side,token_amount,native_amount,price_native',chain_id:'eq.46630',token_address:'eq.'+token,block_timestamp:'gte.'+new Date(Date.now()-30*86400000).toISOString(),order:'block_timestamp.desc',limit:'1000'});
 const [sr,tr]=await Promise.all([
  fetch(base+'market_snapshots?'+snapQ,{headers,cache:'no-store'}),
  fetch(base+'market_trades?'+tradesQ,{headers,cache:'no-store'}).catch(e=>{console.warn('Supabase trades request failed:',e);return null;})
 ]);
 if(!sr.ok)throw Error('Supabase snapshot request failed ('+sr.status+').');
 const snaps=await sr.json(),snapshot=snaps[0]||null;
 let trades=[];
 if(tr?.ok){const rows=await tr.json();trades=Array.isArray(rows)?rows:[];}
 else if(tr)console.warn('Supabase trades request failed:',tr.status);
 return {snapshot,trades};
}
async function getTopHolders(address,offset=0,limit=50){
 if(!/^0x[a-fA-F0-9]{40}$/.test(address||''))throw Error('Invalid token address.');
 const base=URL+'/rest/v1/',token=address.toLowerCase();
 const sq=new URLSearchParams({select:'holder_count',chain_id:'eq.46630',token_address:'eq.'+token,limit:'1'});
 const stateQ=new URLSearchParams({select:'last_scanned_block,updated_at',chain_id:'eq.46630',token_address:'eq.'+token,limit:'1'});
 const [sr,stateR]=await Promise.all([
  fetch(base+'market_snapshots?'+sq,{headers,cache:'no-store'}),
  fetch(base+'token_holder_indexer_state?'+stateQ,{headers,cache:'no-store'})
 ]);
 if(!sr.ok)throw Error('Holder status request failed ('+sr.status+').');
 if(!stateR.ok)throw Error('Holder index status unavailable ('+stateR.status+').');
 const [snaps,states]=await Promise.all([sr.json(),stateR.json()]);
 const count=snaps[0]?.holder_count;
 if(count===null||count===undefined)return {complete:false,holderCount:null,holders:[],offset,hasMore:false};
 const state=states[0]||null;
 const q=new URLSearchParams({select:'wallet_address,balance_raw,updated_at',chain_id:'eq.46630',token_address:'eq.'+token,balance_raw:'gt.0',order:'balance_raw.desc,wallet_address.asc',limit:String(limit),offset:String(offset)});
 const r=await fetch(base+'token_holder_balances?'+q,{headers,cache:'no-store'});
 if(!r.ok)throw Error('Holder list request failed ('+r.status+').');
 const holders=await r.json();
 return {complete:true,holderCount:Number(count),holders:Array.isArray(holders)?holders:[],offset,hasMore:offset+(holders?.length||0)<Number(count),indexedBlock:state?.last_scanned_block??null,updatedAt:state?.updated_at??null};
}
window.PIXORUN_REGISTRY={listLaunches,getLaunch,registerLaunch,getMarketData,getTopHolders,syncTrade};
})();
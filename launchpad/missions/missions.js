(()=>{
'use strict';
const EXPLORER='https://explorer.testnet.chain.robinhood.com',root=document.getElementById('missionList');if(!root)return;
let records=[],classified=[],activeFilter='new',refreshing=false;
const statusText=document.getElementById('missionStatusText'),retry=document.getElementById('missionRetry');
const say=s=>{if(statusText)statusText.textContent=s;};
const short=a=>a.slice(0,6)+'…'+a.slice(-4);
const RPC='https://rpc.testnet.chain.robinhood.com';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc';
const SWAP_FACTORY='0xCC423d983E12f044F9F930463ADe7Ce150a8A644';
const provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
const factory=new ethers.Contract(FACTORY,['function curveOf(address) view returns(address)','function liftoffCompleted(address) view returns(bool)'],provider);
const swapFactory=new ethers.Contract(SWAP_FACTORY,['function getPair(address) view returns(address)'],provider);
const curveAbi=['function graduated() view returns(bool)'];
const ZERO=ethers.ZeroAddress;
async function classify(x){
 try{
  const ca=x.curve_address&&ethers.isAddress(x.curve_address)?x.curve_address:await factory.curveOf(x.token_address);
  if(ca===ZERO)return {...x,state:'unknown'};
  const curve=new ethers.Contract(ca,curveAbi,provider);
  const [done,pair]=await Promise.all([curve.graduated(),swapFactory.getPair(x.token_address)]);
  return {...x,state:done&&pair!==ZERO?'graduated':'curve'};
 }catch(e){console.warn('Launch status check failed',x.token_address,e);return {...x,state:'unknown'};}
}
function card(x){const el=document.createElement('article');el.className='app-card';el.style.margin='0';const row=document.createElement('div');row.className='app-row';if(x.image_url){const img=document.createElement('img');img.src=x.image_url;img.alt=x.token_name+' logo';img.loading='lazy';img.style.cssText='width:58px;height:58px;object-fit:cover;border-radius:13px';row.append(img);}const info=document.createElement('div');info.style.flex='1';const title=document.createElement('h2');title.textContent=x.token_name;title.style.margin='0 0 5px';const ticker=document.createElement('div');ticker.className='app-label';ticker.textContent='$'+x.token_symbol;const meta=document.createElement('p');meta.className='app-status';meta.textContent='Creator '+short(x.creator_address)+' · '+(x.state==='graduated'?'Graduated to swap pool':x.state==='curve'?'Trading on bonding curve':'On-chain status pending');info.append(title,ticker,meta);row.append(info);const state=document.createElement('span');state.className='network-pill';state.textContent=x.state==='graduated'?'GRADUATED':x.state==='curve'?'IN CURVE':'STATUS PENDING';row.append(state);el.append(row);if(x.banner_url){const b=document.createElement('img');b.src=x.banner_url;b.alt=x.token_name+' banner';b.loading='lazy';b.style.cssText='width:100%;max-height:120px;object-fit:cover;border-radius:10px;margin:10px 0';el.append(b);}if(x.description){const d=document.createElement('p');d.className='app-status';d.textContent=x.description;el.append(d);}const socials=document.createElement('div');socials.className='app-row';for(const [label,url] of [['Website',x.website_url],['X',x.x_url],['Telegram',x.telegram_url]])if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='app-btn secondary';a.textContent=label+' ↗';socials.append(a);}if(socials.childElementCount)el.append(socials);const addresses=document.createElement('div');addresses.className='app-status';addresses.textContent='Token '+short(x.token_address)+' · Curve '+short(x.curve_address);const links=document.createElement('div');links.className='app-row';links.style.marginTop='14px';const trade=document.createElement('a');trade.className='app-btn';trade.href='../token/?address='+encodeURIComponent(x.token_address);trade.textContent='Trade token ↗';const token=document.createElement('a');token.className='app-btn secondary';token.href=EXPLORER+'/address/'+x.token_address;token.target='_blank';token.rel='noopener noreferrer';token.textContent='Token explorer ↗';links.append(trade,token);el.append(addresses,links);return el;}
function render(){
 const filtered=activeFilter==='new'?classified.filter(x=>Date.now()-new Date(x.created_at||0).getTime()<=7*86400000):classified.filter(x=>x.state===(activeFilter==='curve'?'curve':'graduated'));
 root.replaceChildren();
 if(!filtered.length){const p=document.createElement('p');p.className='lead';p.textContent=activeFilter==='new'?'No new launches in the last 7 days.':activeFilter==='curve'?'No tokens are currently trading on the bonding curve.':'No tokens have graduated to a swap pool yet.';root.append(p);}
 else{const grid=document.createElement('div');grid.className='app-grid';filtered.forEach(x=>grid.append(card(x)));root.append(grid);}
 const count=document.getElementById('missionCount');if(count)count.textContent=filtered.length+' token'+(filtered.length===1?'':'s');
 const heading=document.getElementById('missionHeading');if(heading)heading.textContent=activeFilter==='new'?'New Launch':activeFilter==='curve'?'In Curve':'Graduated';
 document.getElementById('countNew').textContent=classified.filter(x=>Date.now()-new Date(x.created_at||0).getTime()<=7*86400000).length;
 document.getElementById('countCurve').textContent=classified.filter(x=>x.state==='curve').length;
 document.getElementById('countGraduated').textContent=classified.filter(x=>x.state==='graduated').length;
 document.querySelectorAll('[data-filter]').forEach(b=>{const on=b.dataset.filter===activeFilter;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
}
async function load(){if(refreshing)return;refreshing=true;if(retry)retry.disabled=true;try{say('Loading verified launches and checking on-chain status…');records=await window.PIXORUN_REGISTRY.listLaunches();classified=await Promise.all(records.map(classify));render();say('Launch categories verified against Robinhood Chain Testnet.');}catch(e){say((e.message||'Could not load shared launches')+' · Tap Retry.');}finally{refreshing=false;if(retry)retry.disabled=false;}}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.filter;render();}));
retry?.addEventListener('click',load);render();load();
})();
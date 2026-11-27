(()=>{
'use strict';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const RPC='https://rpc.testnet.chain.robinhood.com';
const root=document.getElementById('missionList');
if(!root)return;
let records=[],refreshing=false,activeFilter='top';
const statusText=document.getElementById('missionStatusText');
const retry=document.getElementById('missionRetry');
const count=document.getElementById('missionCount');
const say=s=>{if(statusText)statusText.textContent=s;};
const short=a=>typeof a==='string'&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):(a||'—');
const validAddress=a=>/^0x[a-fA-F0-9]{40}$/.test(a||'');
const allocation=793100000n*10n**18n;
let provider=null;
function getProvider(){
 if(!window.ethers)throw Error('On-chain status library is unavailable. Reload the page.');
 if(!provider)provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
 return provider;
}
async function readCurve(x){
 if(!validAddress(x.curve_address))return {...x,curveState:'unknown',curveProgress:null,totalSold:0n};
 const c=new ethers.Contract(x.curve_address,[
  'function graduated() view returns(bool)',
  'function totalSold() view returns(uint256)',
  'function realToken() view returns(uint256)'
 ],getProvider());
 const [graduated,sold,remaining]=await Promise.all([c.graduated(),c.totalSold(),c.realToken()]);
 const pct=Number(sold*10000n/allocation)/100;
 return {...x,curveState:graduated?'curved':'curving',curveProgress:Math.max(0,Math.min(100,pct)),totalSold:sold,remaining};
}
async function enrich(rows){
 let cursor=0;const out=new Array(rows.length);
 const workers=Array.from({length:Math.min(8,rows.length)},async()=>{
  while(true){const i=cursor++;if(i>=rows.length)return;try{out[i]=await readCurve(rows[i]);}catch(e){out[i]={...rows[i],curveState:'unknown',curveProgress:null,totalSold:0n};}}
 });
 await Promise.all(workers);return out;
}
function card(x){
 const el=document.createElement('article');el.className='app-card mission-token-card';el.style.margin='0';
 const row=document.createElement('div');row.className='app-row mission-token-head';
 if(x.image_url){const img=document.createElement('img');img.src=x.image_url;img.alt=(x.token_name||'Token')+' logo';img.loading='lazy';img.style.cssText='width:58px;height:58px;object-fit:cover;border-radius:13px';row.append(img);}
 const info=document.createElement('div');info.style.flex='1';
 const title=document.createElement('h2');title.textContent=x.token_name||'Unnamed token';title.style.margin='0 0 5px';
 const ticker=document.createElement('div');ticker.className='app-label';ticker.textContent='$'+(x.token_symbol||'—');
 const meta=document.createElement('p');meta.className='app-status';meta.textContent='Creator '+short(x.creator_address)+' · Verified on-chain';
 info.append(title,ticker,meta);row.append(info);
 const state=document.createElement('span');state.className='mission-state '+(x.curveState||'unknown');
 state.textContent=x.curveState==='curving'?'CURVING':x.curveState==='curved'?'CURVED':'STATUS N/A';row.append(state);el.append(row);
 if(x.banner_url){const b=document.createElement('img');b.src=x.banner_url;b.alt=(x.token_name||'Token')+' banner';b.loading='lazy';b.style.cssText='width:100%;max-height:120px;object-fit:cover;border-radius:10px;margin:10px 0';el.append(b);}
 if(x.description){const d=document.createElement('p');d.className='app-status';d.textContent=x.description;el.append(d);}
 if(x.curveProgress!==null&&x.curveProgress!==undefined){
  const prog=document.createElement('div');prog.className='mission-progress';
  const label=document.createElement('div');label.className='mission-progress-label';const left=document.createElement('span');left.textContent='Curve progress';const right=document.createElement('strong');right.textContent=x.curveState==='curved'?'100% · Liftoff':x.curveProgress.toFixed(2)+'%';label.append(left,right);
  const track=document.createElement('div');track.className='mission-progress-track';const fill=document.createElement('div');fill.className='mission-progress-fill';fill.style.width=(x.curveState==='curved'?100:x.curveProgress)+'%';track.append(fill);prog.append(label,track);el.append(prog);
 }
 const socials=document.createElement('div');socials.className='app-row mission-socials';
 for(const [label,url] of [['Website',x.website_url],['X',x.x_url],['Telegram',x.telegram_url]])if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='app-btn secondary';a.textContent=label+' ↗';socials.append(a);}
 if(socials.childElementCount)el.append(socials);
 const addresses=document.createElement('div');addresses.className='app-status';addresses.textContent='Token '+short(x.token_address)+' · Curve '+short(x.curve_address);
 const links=document.createElement('div');links.className='app-row mission-actions';
 const trade=document.createElement('a');trade.className='app-btn';trade.href='../token/?address='+encodeURIComponent(x.token_address);trade.textContent='Trade token ↗';
 const token=document.createElement('a');token.className='app-btn secondary';token.href=EXPLORER+'/address/'+x.token_address;token.target='_blank';token.rel='noopener noreferrer';token.textContent='Token explorer ↗';
 links.append(trade,token);el.append(addresses,links);return el;
}
function filtered(){
 const list=[...records];
 if(activeFilter==='curving')return list.filter(x=>x.curveState==='curving');
 if(activeFilter==='curved')return list.filter(x=>x.curveState==='curved');
 if(activeFilter==='top')return list.sort((a,b)=>(b.curveProgress??-1)-(a.curveProgress??-1));
 return list;
}
function render(){
 root.replaceChildren();const list=filtered();
 if(!list.length){const p=document.createElement('p');p.className='lead';p.textContent=activeFilter==='curving'?'No tokens are currently trading on their bonding curves.':activeFilter==='curved'?'No tokens have completed Liftoff yet.':'No PIXORUN launches have been registered yet.';root.append(p);}
 else{const grid=document.createElement('div');grid.className='app-grid';list.forEach(x=>grid.append(card(x)));root.append(grid);}
 if(count)count.textContent=activeFilter==='top'?records.length+' verified launches':list.length+' '+(activeFilter==='curving'?'curving':activeFilter==='curved'?'curved':'')+' token'+(list.length===1?'':'s');
 document.querySelectorAll('[data-launch-filter]').forEach(b=>{const on=b.dataset.launchFilter===activeFilter;b.setAttribute('aria-pressed',String(on));b.classList.toggle('active',on);});
}
async function load(){
 if(refreshing)return;refreshing=true;if(retry)retry.disabled=true;
 try{say('Loading shared launches and checking live curve status…');const rows=await window.PIXORUN_REGISTRY.listLaunches();records=await enrich(rows);render();const unknown=records.filter(x=>x.curveState==='unknown').length;say(unknown?'Launches synced. '+unknown+' curve status reading(s) unavailable.':'All launches synced. Curve states verified from Robinhood Chain Testnet.');}
 catch(e){say((e.message||'Could not load shared launches')+' · Tap Retry.');}
 finally{refreshing=false;if(retry)retry.disabled=false;}
}
document.querySelectorAll('[data-launch-filter]').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.launchFilter;render();}));
retry?.addEventListener('click',load);render();load();
})();
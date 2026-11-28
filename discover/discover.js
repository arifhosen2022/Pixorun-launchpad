(()=>{
'use strict';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const RPC='https://rpc.testnet.chain.robinhood.com';
const root=document.getElementById('missionList');
if(!root)return;
let records=[],refreshing=false,activeFilter='top',searchTerm='';
const NEW_LAUNCH_WINDOW_MS=30*60*1000,REFRESH_INTERVAL_MS=60000,CURVE_ENRICH_LIMIT=40,CURVE_CACHE_MS=55000;
const curveCache=new Map();
const validAddress=a=>/^0x[a-fA-F0-9]{40}$/.test(a||'');
const launchedAt=x=>{const t=Date.parse(x.created_at||'');return Number.isFinite(t)?t:0;};
const isNew=x=>{const t=launchedAt(x),age=Date.now()-t;return t>0&&age>=0&&age<=NEW_LAUNCH_WINDOW_MS;};
const ageLabel=x=>{const age=Math.max(0,Date.now()-launchedAt(x)),mins=Math.floor(age/60000);return mins<1?'Just launched':mins<60?mins+'m ago':Math.floor(mins/60)+'h ago';};
const short=a=>typeof a==='string'&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):(a||'—');
const allocation=793100000n*10n**18n;let provider=null;
function getProvider(){if(!window.ethers)throw Error('On-chain status library is unavailable. Reload the page.');if(!provider)provider=window.PIXORUN_RPC.createProvider();return provider;}
async function readCurve(x){
 if(!validAddress(x.curve_address))return {...x,curveState:'unknown',curveProgress:null,totalSold:0n};
 const key=x.curve_address.toLowerCase(),cached=curveCache.get(key);
 if(cached&&Date.now()-cached.time<CURVE_CACHE_MS)return {...x,...cached.value};
 const c=new ethers.Contract(x.curve_address,['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realToken() view returns(uint256)'],getProvider());
 let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Curve status request timed out')),10000);});
 try{
  const [graduated,sold,remaining]=await Promise.race([Promise.all([c.graduated(),c.totalSold(),c.realToken()]),timeout]);
  const pct=Number(sold*10000n/allocation)/100;
  const value={curveState:graduated?'curved':'curving',curveProgress:Math.max(0,Math.min(100,pct)),totalSold:sold,remaining};
  curveCache.set(key,{time:Date.now(),value});return {...x,...value};
 }finally{clearTimeout(timer);}
}
async function enrich(rows){
 const out=rows.map(x=>({...x,curveState:'unknown',curveProgress:null,totalSold:0n}));
 let cursor=0;const count=Math.min(CURVE_ENRICH_LIMIT,rows.length);
 await Promise.all(Array.from({length:Math.min(4,count)},async()=>{while(true){const i=cursor++;if(i>=count)return;try{out[i]=await readCurve(rows[i]);}catch(e){console.warn('Discover curve status unavailable:',rows[i].token_address,e);}}}));
 return out;
}
function renderStats(){
 const set=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=String(n);};
 set('statTotal',records.length);set('statBonding',records.filter(x=>x.curveState==='curving').length);set('statGraduated',records.filter(x=>x.curveState==='curved').length);set('statNew',records.filter(isNew).length);
 const ticker=document.getElementById('discoverTicker');if(ticker){ticker.replaceChildren();const seen=new Set();const latest=[...records].sort((a,b)=>launchedAt(b)-launchedAt(a)).filter(x=>{const key=String(x.token_address||x.id||'').toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,5);if(!latest.length){const item=document.createElement('span');item.className='discover-ticker-item';item.textContent='No recent launches yet';ticker.append(item);}else latest.forEach(x=>{const item=document.createElement('span');item.className='discover-ticker-item';const name=document.createElement('span');name.textContent=(x.token_symbol?'$'+x.token_symbol:(x.token_name||'New token'));const state=document.createElement('small');state.textContent=ageLabel(x);item.append(name,state);ticker.append(item);});}
}
function card(x){
 const href='../token/?address='+encodeURIComponent(x.token_address||'');
 const el=document.createElement('a');el.className='app-card mission-token-card';el.href=href;el.style.margin='0';el.setAttribute('aria-label','Open '+(x.token_name||x.token_symbol||'token')+' details');
 const head=document.createElement('div');head.className='compact-token-head';
 if(x.image_url){const img=document.createElement('img');img.src=x.image_url;img.alt='';img.loading='lazy';img.className='compact-token-logo';head.append(img);}
 else{const fallback=document.createElement('span');fallback.className='compact-token-fallback';fallback.textContent=(x.token_symbol||x.token_name||'T').slice(0,1).toUpperCase();head.append(fallback);}
 const info=document.createElement('div');info.className='compact-token-info';
 const name=document.createElement('strong');name.className='compact-token-name';name.textContent=x.token_name||'Unnamed token';
 const symbol=document.createElement('span');symbol.className='compact-token-symbol';symbol.textContent='$'+(x.token_symbol||'—');
 info.append(name,symbol);head.append(info);
 const pct=x.curveState==='curved'?100:(x.curveProgress??null);
 const curve=document.createElement('div');curve.className='compact-token-curve';
 const curveLabel=document.createElement('span');curveLabel.textContent='CURVE';
 const curveValue=document.createElement('strong');curveValue.textContent=pct===null?'—':pct.toFixed(2)+'%';
 curve.append(curveLabel,curveValue);
 const track=document.createElement('div');track.className='compact-token-track';const fill=document.createElement('span');fill.style.width=(pct===null?0:pct)+'%';track.append(fill);
 const foot=document.createElement('div');foot.className='compact-token-foot';
 const state=document.createElement('span');state.className='compact-token-state '+(x.curveState||'unknown');state.textContent=x.curveState==='curving'?'BONDING':x.curveState==='curved'?'GRADUATED':'PENDING';
 const time=document.createElement('span');time.textContent=ageLabel(x);
 foot.append(state,time);el.append(head,curve,track,foot);return el;
}
function filtered(){
 let list=[...records];if(activeFilter==='curving')list=list.filter(x=>x.curveState==='curving');else if(activeFilter==='curved')list=list.filter(x=>x.curveState==='curved');else if(activeFilter==='new')list=list.filter(isNew);
 if(searchTerm){const q=searchTerm.toLowerCase();list=list.filter(x=>[x.token_name,x.token_symbol,x.token_address,x.creator_address].some(v=>String(v||'').toLowerCase().includes(q)));}
 // Always rank by bonding-curve progress: highest percentage first; unknown values last.
 list.sort((a,b)=>{const ap=a.curveProgress??-1,bp=b.curveProgress??-1;return bp-ap||launchedAt(b)-launchedAt(a);});
 return list;
}
function render(){
 root.replaceChildren();const list=filtered(),label=document.getElementById('discoverResultLabel');if(label)label.textContent=list.length+' token'+(list.length===1?'':'s')+' found';
 if(!list.length){const p=document.createElement('div');p.className='discover-empty';p.textContent=searchTerm?'No tokens match your search. Try another name, symbol or address.':activeFilter==='curving'?'No tokens are currently bonding.':activeFilter==='curved'?'No tokens have graduated yet.':activeFilter==='new'?'No tokens were launched in the last 30 minutes.':'No PIXORUN launches have been registered yet.';root.append(p);}
 else{const grid=document.createElement('div');grid.className='app-grid';list.forEach(x=>grid.append(card(x)));root.append(grid);}
 const totals={top:records.length,curving:records.filter(x=>x.curveState==='curving').length,curved:records.filter(x=>x.curveState==='curved').length,new:records.filter(isNew).length};
 document.querySelectorAll('[data-count-for]').forEach(el=>{el.textContent=String(totals[el.dataset.countFor]??0);});
 document.querySelectorAll('[data-launch-filter]').forEach(b=>{const on=b.dataset.launchFilter===activeFilter;b.setAttribute('aria-pressed',String(on));b.classList.toggle('active',on);});
}
async function load(){if(refreshing)return;refreshing=true;try{const rows=await window.PIXORUN_REGISTRY.listLaunches();records=await enrich(rows);renderStats();render();}catch(e){const label=document.getElementById('discoverResultLabel');if(label)label.textContent='Unable to load launches · '+(e.message||'Please retry');if(!records.length){const p=document.createElement('div');p.className='discover-empty';p.textContent='Could not load token launches. Please refresh the page to try again.';root.replaceChildren(p);}}finally{refreshing=false;}}
document.querySelectorAll('[data-launch-filter]').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.launchFilter;render();}));
const search=document.getElementById('discoverSearch');search?.addEventListener('input',()=>{searchTerm=search.value.trim();render();});
render();load();setInterval(()=>{if(!document.hidden)load();},REFRESH_INTERVAL_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
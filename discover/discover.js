(()=>{
'use strict';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const RPC='https://rpc.testnet.chain.robinhood.com';
const root=document.getElementById('missionList');
if(!root)return;
let records=[],refreshing=false,activeFilter='top',searchTerm='';
const NEW_LAUNCH_WINDOW_MS=30*60*1000,REFRESH_INTERVAL_MS=30000;
const validAddress=a=>/^0x[a-fA-F0-9]{40}$/.test(a||'');
const launchedAt=x=>{const t=Date.parse(x.created_at||'');return Number.isFinite(t)?t:0;};
const isNew=x=>{const t=launchedAt(x),age=Date.now()-t;return t>0&&age>=0&&age<=NEW_LAUNCH_WINDOW_MS;};
const ageLabel=x=>{const age=Math.max(0,Date.now()-launchedAt(x)),mins=Math.floor(age/60000);return mins<1?'Just launched':mins<60?mins+'m ago':Math.floor(mins/60)+'h ago';};
const short=a=>typeof a==='string'&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):(a||'—');
const allocation=793100000n*10n**18n;let provider=null;
function getProvider(){if(!window.ethers)throw Error('On-chain status library is unavailable. Reload the page.');if(!provider)provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});return provider;}
async function readCurve(x){
 if(!validAddress(x.curve_address))return {...x,curveState:'unknown',curveProgress:null,totalSold:0n};
 const c=new ethers.Contract(x.curve_address,['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realToken() view returns(uint256)'],getProvider());
 const [graduated,sold,remaining]=await Promise.all([c.graduated(),c.totalSold(),c.realToken()]);
 const pct=Number(sold*10000n/allocation)/100;
 return {...x,curveState:graduated?'curved':'curving',curveProgress:Math.max(0,Math.min(100,pct)),totalSold:sold,remaining};
}
async function enrich(rows){let cursor=0;const out=new Array(rows.length);await Promise.all(Array.from({length:Math.min(8,rows.length)},async()=>{while(true){const i=cursor++;if(i>=rows.length)return;try{out[i]=await readCurve(rows[i]);}catch(e){out[i]={...rows[i],curveState:'unknown',curveProgress:null,totalSold:0n};}}}));return out;}
function renderStats(){
 const set=(id,n)=>{const el=document.getElementById(id);if(el)el.textContent=String(n);};
 set('statTotal',records.length);set('statBonding',records.filter(x=>x.curveState==='curving').length);set('statGraduated',records.filter(x=>x.curveState==='curved').length);set('statNew',records.filter(isNew).length);
 const ticker=document.getElementById('discoverTicker');if(ticker){ticker.replaceChildren();const latest=[...records].sort((a,b)=>launchedAt(b)-launchedAt(a)).slice(0,12);if(!latest.length){const item=document.createElement('span');item.className='discover-ticker-item';item.textContent='No launches yet';ticker.append(item);}else latest.forEach(x=>{const item=document.createElement('span');item.className='discover-ticker-item';const name=document.createElement('span');name.textContent='$'+(x.token_symbol||'TOKEN');const state=document.createElement('small');state.textContent=x.curveState==='curved'?'Graduated':x.curveState==='curving'?'Bonding':'Checking';item.append(name,state);ticker.append(item);});}
}
function card(x){
 const el=document.createElement('article');el.className='app-card mission-token-card';el.style.margin='0';
 const row=document.createElement('div');row.className='app-row mission-token-head';
 if(x.image_url){const img=document.createElement('img');img.src=x.image_url;img.alt=(x.token_name||'Token')+' logo';img.loading='lazy';img.style.cssText='width:54px;height:54px;object-fit:cover;border-radius:13px;border:1px solid #eee8f5';row.append(img);}
 const info=document.createElement('div');info.style.flex='1';info.style.minWidth='120px';
 const title=document.createElement('h2');title.textContent=x.token_name||'Unnamed token';title.style.margin='0 0 5px';
 const ticker=document.createElement('div');ticker.className='app-label';ticker.textContent='$'+(x.token_symbol||'—');
 const meta=document.createElement('p');meta.className='app-status';meta.textContent='Creator '+short(x.creator_address)+' · Verified on-chain';
 info.append(title,ticker,meta);row.append(info);
 const state=document.createElement('span');state.className='mission-state '+(x.curveState||'unknown');state.textContent=x.curveState==='curving'?'BONDING':x.curveState==='curved'?'GRADUATED':'STATUS N/A';row.append(state);el.append(row);
 const launched=document.createElement('p');launched.className='mission-launched';launched.textContent=(isNew(x)?'✦ New launch · ':'Launched · ')+ageLabel(x);el.append(launched);
 if(x.description){const d=document.createElement('p');d.className='app-status';d.textContent=x.description;el.append(d);}
 if(x.curveProgress!==null&&x.curveProgress!==undefined){const prog=document.createElement('div');prog.className='mission-progress';const label=document.createElement('div');label.className='mission-progress-label';const left=document.createElement('span');left.textContent='Bonding progress';const right=document.createElement('strong');right.textContent=x.curveState==='curved'?'100% · Graduated':x.curveProgress.toFixed(2)+'%';label.append(left,right);const track=document.createElement('div');track.className='mission-progress-track';const fill=document.createElement('div');fill.className='mission-progress-fill';fill.style.width=(x.curveState==='curved'?100:x.curveProgress)+'%';track.append(fill);prog.append(label,track);el.append(prog);}
 const socials=document.createElement('div');socials.className='app-row mission-socials';for(const [label,url] of [['Website',x.website_url],['X',x.x_url],['Telegram',x.telegram_url]])if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='app-btn secondary';a.textContent=label+' ↗';socials.append(a);}if(socials.childElementCount)el.append(socials);
 const addresses=document.createElement('div');addresses.className='app-status';addresses.textContent='Token '+short(x.token_address);
 const links=document.createElement('div');links.className='app-row mission-actions';const trade=document.createElement('a');trade.className='app-btn';trade.href='../token/?address='+encodeURIComponent(x.token_address);trade.textContent='View token ↗';const token=document.createElement('a');token.className='app-btn secondary';token.href=EXPLORER+'/address/'+x.token_address;token.target='_blank';token.rel='noopener noreferrer';token.textContent='Explorer ↗';links.append(trade,token);el.append(addresses,links);return el;
}
function filtered(){
 let list=[...records];if(activeFilter==='curving')list=list.filter(x=>x.curveState==='curving');else if(activeFilter==='curved')list=list.filter(x=>x.curveState==='curved');else if(activeFilter==='new')list=list.filter(isNew).sort((a,b)=>launchedAt(b)-launchedAt(a));else if(activeFilter==='top')list.sort((a,b)=>(b.curveProgress??-1)-(a.curveProgress??-1));
 if(searchTerm){const q=searchTerm.toLowerCase();list=list.filter(x=>[x.token_name,x.token_symbol,x.token_address,x.creator_address].some(v=>String(v||'').toLowerCase().includes(q)));}return list;
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
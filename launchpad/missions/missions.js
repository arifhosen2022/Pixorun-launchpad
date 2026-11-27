(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const factoryAbi=['event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)'];
const curveAbi=['function graduated() view returns(bool)','function totalSold() view returns(uint256)'];
const root=document.getElementById('missionList');if(!root)return;
const iface=new ethers.Interface(factoryAbi),provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
let records=[],active='all',lastBlock=0,refreshing=false;
try{const cache=JSON.parse(localStorage.getItem('pixorun:missions:v4')||'null');if(cache&&Array.isArray(cache.records)){records=cache.records.map(x=>({...x,sold:BigInt(x.sold||0)}));lastBlock=Number(cache.lastBlock)||0;}}catch(_){}
const status=document.getElementById('missionStatus'),statusText=document.getElementById('missionStatusText'),retry=document.getElementById('missionRetry');
const short=a=>a.slice(0,6)+'…'+a.slice(-4);
function say(s){const target=statusText||status;if(target)target.textContent=s;}
const timed=(p,label)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' timed out. Robinhood Testnet RPC did not respond.')),18000))]);
function card(x){
 const el=document.createElement('article');el.className='app-card';el.style.margin='0';
 const row=document.createElement('div');row.className='app-row';const info=document.createElement('div');
 const title=document.createElement('h2');title.textContent=x.name;title.style.margin='0 0 5px';
 const ticker=document.createElement('div');ticker.className='app-label';ticker.textContent='$'+x.symbol;
 const meta=document.createElement('p');meta.className='app-status';meta.textContent='Creator '+short(x.creator)+' · '+(x.graduated?'Liftoff complete':'Bonding curve live');info.append(title,ticker,meta);
 const state=document.createElement('span');state.className='network-pill';state.textContent=x.graduated?'LIFTOFF':'IGNITION';row.append(info,state);
 const addresses=document.createElement('div');addresses.className='app-status';addresses.textContent='Token '+short(x.token)+' · Curve '+short(x.curve);
 const links=document.createElement('div');links.className='app-row';links.style.marginTop='14px';
 const trade=document.createElement('a');trade.className='app-btn';trade.href='../token/?address='+encodeURIComponent(x.token);trade.textContent='Trade token ↗';
 const token=document.createElement('a');token.className='app-btn secondary';token.href=EXPLORER+'/address/'+x.token;token.target='_blank';token.rel='noopener noreferrer';token.textContent='Token explorer ↗';
 const curve=document.createElement('a');curve.className='app-btn secondary';curve.href=EXPLORER+'/address/'+x.curve;curve.target='_blank';curve.rel='noopener noreferrer';curve.textContent='Curve explorer ↗';links.append(trade,token,curve);el.append(row,addresses,links);return el;
}
function render(){root.replaceChildren();const list=records.filter(x=>active==='all'||active==='new'||(active==='liftoff'&&x.graduated)||(active==='ignition'&&!x.graduated)||(active==='trending'&&x.sold>0n));
 if(!list.length){const p=document.createElement('p');p.className='lead';p.textContent=records.length?'No tokens match this filter.':'No PIXORUN launches found in the scanned factory history.';root.append(p);}else{const grid=document.createElement('div');grid.className='app-grid';list.forEach(x=>grid.append(card(x)));root.append(grid);}
 const count=document.getElementById('missionCount');if(count)count.textContent=records.length+' on-chain launch'+(records.length===1?'':'es');}
async function load(){if(refreshing)return;refreshing=true;if(retry)retry.disabled=true;
 try{
  say(records.length?'Showing saved launches · checking for new ones…':'Connecting to Robinhood Testnet…');
  const latest=await timed(provider.getBlockNumber(),'Block number');
  const topic=iface.getEvent('LaunchCreated').topicHash;
  // If there are no saved records, always backfill the recent factory history.
  const from=records.length&&lastBlock?lastBlock+1:Math.max(0,latest-250000);
  let found=[];
  if(from<=latest){
   const step=900,total=Math.ceil((latest-from+1)/step);let done=0;
   for(let start=from;start<=latest;start+=step){
    const end=Math.min(start+step-1,latest);
    const batch=await timed(provider.getLogs({address:FACTORY,topics:[topic],fromBlock:start,toBlock:end}),'Factory event scan');
    found.push(...batch);done++;
    say('Scanning PIXORUN Factory history · '+Math.min(end-from+1,latest-from+1).toLocaleString()+' / '+(latest-from+1).toLocaleString()+' blocks');
   }
  }
  const known=new Set(records.map(x=>x.token.toLowerCase()));
  const fresh=found.filter(log=>{try{return !known.has(iface.parseLog(log).args.token.toLowerCase());}catch(_){return false;}});
  const additions=[];
  for(const log of fresh){
   const p=iface.parseLog(log),c=new ethers.Contract(p.args.curve,curveAbi,provider);
   let graduated=false,sold=0n;
   try{[graduated,sold]=await timed(Promise.all([c.graduated(),c.totalSold()]),'Curve state read');}catch(_){}
   additions.push({creator:p.args.creator,token:p.args.token,curve:p.args.curve,name:p.args.name,symbol:p.args.symbol,graduated,sold,blockNumber:log.blockNumber});
  }
  records=[...records,...additions].sort((a,b)=>b.blockNumber-a.blockNumber);lastBlock=latest;
  try{localStorage.setItem('pixorun:missions:v4',JSON.stringify({lastBlock,records:records.map(x=>({...x,sold:String(x.sold)}))}));}catch(_){}
  say(records.length?'Updated just now · verified on Robinhood Chain Testnet.':'Scan complete · no LaunchCreated events found for this factory in the available history.');
  render();
 }catch(e){console.error('PIXORUN missions load failed:',e);say((e.shortMessage||e.message||'RPC error')+' · Tap Retry to try again.');}
 finally{refreshing=false;if(retry)retry.disabled=false;}}
 document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('secondary',x!==b));render();}));
 if(retry)retry.addEventListener('click',load);render();load();
})();
(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const factoryAbi=['event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)'];
const curveAbi=['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realNative() view returns(uint256)'];
const root=document.getElementById('missionList');if(!root)return;
const iface=new ethers.Interface(factoryAbi),provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true});
let records=[],active='all',lastBlock=0,refreshing=false;try{const cache=JSON.parse(localStorage.getItem('pixorun:missions:v2')||'null');if(cache&&Array.isArray(cache.records)){records=cache.records.map(x=>({...x,sold:BigInt(x.sold||0)}));lastBlock=Number(cache.lastBlock)||0;}}catch(_){}
const status=document.getElementById('missionStatus');
const esc=s=>String(s??'');
const short=a=>a.slice(0,6)+'…'+a.slice(-4);
function card(x){
 const el=document.createElement('article');el.className='app-card';el.style.margin='0';
 const row=document.createElement('div');row.className='app-row';
 const info=document.createElement('div');
 const title=document.createElement('h2');title.textContent=x.name;title.style.margin='0 0 5px';
 const ticker=document.createElement('div');ticker.className='app-label';ticker.textContent='$'+x.symbol;
 const meta=document.createElement('p');meta.className='app-status';meta.textContent='Creator '+short(x.creator)+' · '+(x.graduated?'Liftoff complete':'Bonding curve live');
 info.append(title,ticker,meta);
 const state=document.createElement('span');state.className='network-pill';state.textContent=x.graduated?'LIFTOFF':'IGNITION';
 row.append(info,state);
 const addresses=document.createElement('div');addresses.className='app-status';addresses.textContent='Token '+short(x.token)+' · Curve '+short(x.curve);
 const links=document.createElement('div');links.className='app-row';links.style.marginTop='14px';
 const trade=document.createElement('a');trade.className='app-btn';trade.href='../token/?address='+encodeURIComponent(x.token);trade.textContent='Trade token ↗';const token=document.createElement('a');token.className='app-btn secondary';token.href=EXPLORER+'/address/'+x.token;token.target='_blank';token.rel='noopener noreferrer';token.textContent='Token explorer ↗';
 const curve=document.createElement('a');curve.className='app-btn secondary';curve.href=EXPLORER+'/address/'+x.curve;curve.target='_blank';curve.rel='noopener noreferrer';curve.textContent='Curve explorer ↗';
 links.append(trade,token,curve);el.append(row,addresses,links);return el;
}
function render(){
 root.replaceChildren();
 const list=records.filter(x=>active==='all'||active==='new'||(active==='liftoff'&&x.graduated)||(active==='ignition'&&!x.graduated)||(active==='trending'&&x.sold>0n));
 if(!list.length){const p=document.createElement('p');p.className='lead';p.textContent=records.length?'No tokens match this filter.':'No PIXORUN launches have been found on Robinhood Chain Testnet yet.';root.append(p);}
 else {const grid=document.createElement('div');grid.className='app-grid';list.forEach(x=>grid.append(card(x)));root.append(grid);}
 const count=document.getElementById('missionCount');if(count)count.textContent=records.length+' on-chain launch'+(records.length===1?'':'es');
}
async function load(){
 if(refreshing)return;refreshing=true;
 try{
  status.textContent=records.length?'Saved launches shown · checking for updates…':'Checking latest launches…';
  const latest=await provider.getBlockNumber(),logs=[],topic=iface.getEvent('LaunchCreated').topicHash,fromStart=lastBlock?lastBlock+1:0,ranges=[];
  for(let from=fromStart;from<=latest;from+=10000)ranges.push({fromBlock:from,toBlock:Math.min(from+9999,latest)});
  const batches=await Promise.all(ranges.map(r=>provider.getLogs({address:FACTORY,topics:[topic],...r})));logs.push(...batches.flat());
  const known=new Set(records.map(x=>x.token.toLowerCase())),fresh=logs.filter(log=>!known.has(iface.parseLog(log).args.token.toLowerCase()));
  const additions=await Promise.all(fresh.map(async log=>{
   const p=iface.parseLog(log),creator=p.args.creator,token=p.args.token,curve=p.args.curve;
   const c=new ethers.Contract(curve,curveAbi,provider);
   let graduated=false,sold=0n;
   try{[graduated,sold]=await Promise.all([c.graduated(),c.totalSold()]);}catch(_){}
   return {creator,token,curve,name:p.args.name,symbol:p.args.symbol,graduated,sold,blockNumber:log.blockNumber};
  }));
  records=[...records,...additions].sort((a,b)=>b.blockNumber-a.blockNumber);lastBlock=latest;
  try{localStorage.setItem('pixorun:missions:v2',JSON.stringify({lastBlock,records:records.map(x=>({...x,sold:String(x.sold)}))}));}catch(_){}
  status.textContent=records.length?'Updated just now · verified on Robinhood Chain Testnet.':'No PIXORUN tokens found yet. Create the first token to see it here.';render();
 }catch(e){status.textContent=records.length?'Saved launches shown · refresh failed.':'Could not load launches. Please retry.';}finally{refreshing=false;}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('secondary',x!==b));render();}));
render();load();
})();
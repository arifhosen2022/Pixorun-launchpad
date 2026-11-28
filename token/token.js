(()=>{
'use strict';
const FACTORY_DEFAULTS=[{launchpadFactory:'0x81C1E1703C35e158912245288684609339A41B37',swapFactory:'0xc23b06BD92C98AE57b72160b17ACfa53e7302104'}],RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com',CHAIN='0xb626';
const factoryAbi=['function curveOf(address) view returns(address)','function creatorOf(address) view returns(address)','function liftoffCompleted(address) view returns(bool)','function swapFactory() view returns(address)'];
const tokenAbi=['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
const curveAbi=['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realNative() view returns(uint256)','function realToken() view returns(uint256)','function virtualNative() view returns(uint256)','function virtualToken() view returns(uint256)','function quoteBuy(uint256) view returns(uint256,uint256,uint256)','function quoteSell(uint256) view returns(uint256,uint256,uint256)','function buy(uint256) payable returns(uint256)','function sell(uint256,uint256) returns(uint256)'];
const swapFactoryAbi=['function getPair(address) view returns(address)'];
const pairAbi=['function reserveNative() view returns(uint112)','function reserveToken() view returns(uint112)','function swapNativeForToken(uint256) payable returns(uint256)','function swapTokenForNative(uint256,uint256) returns(uint256)'];
const $=id=>document.getElementById(id);let provider=window.PIXORUN_RPC.createProvider();
const tokenAddress=new URLSearchParams(location.search).get('address');
const cacheKey=tokenAddress&&ethers.isAddress(tokenAddress)?'pixorun:token:v2:'+tokenAddress.toLowerCase():null;
let cached=null;try{cached=cacheKey?JSON.parse(localStorage.getItem(cacheKey)||'null'):null;}catch(_){}
if(cached){$('tokenName').textContent=cached.name||'Token';$('tokenSymbol').textContent=cached.symbol||'—';$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;if(cached.curveAddress){$('curveAddress').textContent=cached.curveAddress;$('curveAddress').href=EXPLORER+'/address/'+cached.curveAddress;}if(cached.creator){$('creatorAddress').textContent=cached.creator;$('creatorAddress').href=EXPLORER+'/address/'+cached.creator;}$('totalSupply').textContent=cached.totalSupply||'—';$('tradeMode').textContent=cached.tradeMode||'Refreshing market…';}
let token,curve,pair,curveAddress,pairAddress,decimals=18,graduated=false,mode='curve',busy=false,account=null,canTrade=false,tokenBalance=0n,ethBalance=0n,marketLoading=false,launchBlock=Number(cached?.launchBlock)||null,marketCache=null;
const withTimeout=(promise,label,ms=16000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(label+' timed out. Robinhood RPC did not respond.')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const compactNumber=(value,max=3)=>{const n=Number(value);if(!Number.isFinite(n))return '—';const a=Math.abs(n),sign=n<0?'-':'';for(const [limit,suffix] of [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']])if(a>=limit){const scaled=a/limit;return sign+scaled.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:0})+suffix;}if(a>0&&a<0.001)return sign+Number(a.toPrecision(4)).toString();return n.toLocaleString('en-US',{maximumFractionDigits:max});};
const fmt=(v,d=18)=>compactNumber(ethers.formatUnits(v,d),3);
const setStatus=m=>{const el=$('tradeStatus'),wrap=el?.closest('.app-status'),retry=$('tokenRetry');if(el)el.textContent=m||'';if(wrap)wrap.hidden=!m;if(retry)retry.hidden=!(m&&/could not|failed|unavailable|error|paused|tap retry/i.test(m));};
function showTradeModal(state,title,message,hash){
 const modal=$('tradeModal');if(!modal){setStatus(message);return;}
 modal.dataset.state=state;$('tradeModalTitle').textContent=title;$('tradeModalMessage').textContent=message;
 $('tradeModalIcon').innerHTML=state==='pending'?'<div class="trade-modal-spinner"></div>':state==='success'?'✓':'!';
 const link=$('tradeModalLink');if(hash){link.href=EXPLORER+'/tx/'+hash;link.hidden=false;}else{link.removeAttribute('href');link.hidden=true;}
 modal.hidden=false;
}
function closeTradeModal(){const modal=$('tradeModal');if(modal)modal.hidden=true;}
$('tradeModalClose')?.addEventListener('click',closeTradeModal);
$('tradeModal')?.addEventListener('click',e=>{if(e.target===$('tradeModal'))closeTradeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTradeModal();});

function wallet(){return window.PIXORUN_WALLET?.getProvider()||null;}
function slippage(){return Math.max(0,Math.min(50,Number($('slippage')?.value||1)));}
function minAfterSlippage(value){return value*BigInt(Math.floor((100-slippage())*100))/10000n;}
async function ensureNetwork(){const p=wallet();if(!p)throw Error('No compatible EVM wallet found. Open PIXORUN in your wallet browser.');let chain=(await p.request({method:'eth_chainId'})).toLowerCase();if(chain!==CHAIN){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}chain=(await p.request({method:'eth_chainId'})).toLowerCase();}if(chain!==CHAIN)throw Error('Switch to Robinhood Chain Testnet and try again.');}
async function refreshBalances(){
 if(!account||!token){$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';return;}
 try{const [eth,tok]=await Promise.all([withTimeout(provider.getBalance(account),'ETH balance'),withTimeout(token.balanceOf(account),'Token balance')]);ethBalance=eth;tokenBalance=tok;$('walletEthBalance').textContent=fmt(eth)+' ETH';$('walletTokenBalance').textContent=fmt(tok,decimals)+' '+$('tokenSymbol').textContent;$('walletNetworkNote').textContent='Live balances from Robinhood Chain Testnet. Gas is paid in ETH.';}catch(e){$('walletEthBalance').textContent='Balance unavailable';$('walletTokenBalance').textContent='Balance unavailable';$('walletNetworkNote').textContent=e.message||'Could not read wallet balances.';}
}
async function connect(){
 const chosen=await window.PIXORUN_WALLET.connect(),p=chosen.provider,a=[chosen.account];
 account=ethers.getAddress(a[0]);const chain=(await p.request({method:'eth_chainId'})).toLowerCase();
 p.on?.('accountsChanged',async a=>{account=a?.[0]?ethers.getAddress(a[0]):null;await readConnectedWallet();});p.on?.('chainChanged',readConnectedWallet);
 
 $('walletNetworkNote').textContent=chain===CHAIN?'Wallet connected to Robinhood Chain Testnet.':'Wallet connected on another network. Switch to Robinhood Chain Testnet when trading.';
 await refreshBalances();return account;
}
async function readConnectedWallet(event){
 const detail=event?.detail||{};
 const p=detail.provider||wallet();
 try{
  let accounts=detail.account?[detail.account]:null,chain=detail.chainId||null;
  if(p){const state=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);accounts=state[0];chain=state[1];}
  if(!accounts){account=null;$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';$('walletNetworkNote').textContent='Connect your wallet to view live balances and trade.';return;}
  account=accounts[0]?ethers.getAddress(accounts[0]):null;
  if(!account){$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';return;}
  const network=String(chain||'').toLowerCase();
  $('walletNetworkNote').textContent=network===CHAIN?'Connected · Robinhood Chain Testnet':'Connected · wrong network; switch only when you trade.';
  if(token)await refreshBalances();
 }catch(e){console.warn('Wallet state unavailable',e);$('walletNetworkNote').textContent='Wallet detected, but account state could not be read. Reopen the wallet connection.';}
}
function showMetadata(m){
 if(!m)return;const about=$('tokenAbout');let has=false;
 if(m.image_url){$('tokenLogo').src=m.image_url;$('tokenLogo').hidden=false;has=true;}
 if(m.banner_url){$('tokenBanner').src=m.banner_url;$('tokenBanner').hidden=false;has=true;}
 if(m.description){$('tokenDescription').textContent=m.description;has=true;}
 const links=$('tokenSocials');links.replaceChildren();
 for(const [label,url] of [['Website',m.website_url],['X / Twitter',m.x_url],['Telegram',m.telegram_url]])if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label+' ↗';links.append(a);has=true;}
 about.hidden=!has;
}
async function loadFactoryCandidates(){
 const found=[];
 try{
  const response=await withTimeout(fetch('../contracts/deployments/robinhood-testnet.json?v=1',{cache:'no-store'}),'Deployment registry',8000);
  if(response.ok){
   const data=await response.json();
   if(Number(data.chainId)===46630){
    if(data.launchpadFactory)found.push({launchpadFactory:data.launchpadFactory,swapFactory:data.swapFactory||null});
    
   }
  }
 }catch(error){console.warn('Could not refresh deployment registry; using known factory addresses.',error);}
 for(const item of FACTORY_DEFAULTS)if(!found.some(x=>x.launchpadFactory.toLowerCase()===item.launchpadFactory.toLowerCase()))found.push(item);
 return found;
}
async function loadMetadata(){try{if(window.PIXORUN_REGISTRY){const row=await withTimeout(window.PIXORUN_REGISTRY.getLaunch(tokenAddress),'Token metadata',12000);if(row?.block_number!==undefined&&row?.block_number!==null){launchBlock=Number(row.block_number);try{const old=JSON.parse(localStorage.getItem(cacheKey)||'{}');localStorage.setItem(cacheKey,JSON.stringify({...old,launchBlock}));}catch(_){}}showMetadata(row);}}catch(e){console.warn('Token metadata could not be loaded',e);}}
async function getBuyQuote(amount){
 if(mode==='swap'){const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const fee=amount*100n/10000n,net=amount-fee;return {out:net*rt/(rn+net),fee,net,acceptedGross:amount,refund:0n};}
 try{const q=await curve.quoteBuy(amount);return {out:q[0],fee:q[1],net:q[2],acceptedGross:amount,refund:0n};}
 catch(original){
  const [remaining,vn,vt]=await Promise.all([curve.realToken(),curve.virtualNative(),curve.virtualToken()]);
  if(remaining===0n||vt<=remaining)throw original;
  const numerator=vn*remaining,denominator=vt-remaining;
  const requiredNet=(numerator+denominator-1n)/denominator;
  let gross=(requiredNet*10000n+9899n)/9900n;
  while(gross-gross*100n/10000n<requiredNet)gross++;
  if(amount<gross)throw original;
  const fee=gross*100n/10000n,net=gross-fee;
  return {out:remaining,fee,net,acceptedGross:gross,refund:amount-gross};
 }
}
async function quoteBuy(){
 const value=$('buyAmount')?.value||'';if(!value||!Number.isFinite(Number(value))||Number(value)<=0){$('buyQuote').textContent='Enter an ETH amount to get a live quote.';$('buyFee').textContent='';return;}
 try{const amount=ethers.parseEther(value);const q=await getBuyQuote(amount);
 $('buyQuote').textContent='Estimated receive: '+fmt(q.out,decimals)+' '+$('tokenSymbol').textContent+(q.refund?' · Estimated refund: '+fmt(q.refund)+' ETH':'');
 $('buyFee').textContent='Trade fee: '+fmt(q.fee)+' ETH (1%) · Net ETH to market: '+fmt(q.net)+' ETH · Network gas is separate.';
 }catch(e){$('buyQuote').textContent=e.shortMessage||e.reason||e.message||'Quote unavailable';$('buyFee').textContent='';}
}
async function quoteSell(){
 const value=$('sellAmount')?.value||'';if(!value||!Number.isFinite(Number(value))||Number(value)<=0){$('sellQuote').textContent='Enter a token amount to get a live quote.';$('sellFee').textContent='';return;}
 try{const amount=ethers.parseUnits(value,decimals);let gross,fee,net;
 if(mode==='curve'){const q=await curve.quoteSell(amount);gross=q[0];fee=q[1];net=q[2];}
 else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);gross=amount*rn/(rt+amount);fee=gross*100n/10000n;net=gross-fee;}
 $('sellQuote').textContent='You receive: '+fmt(net)+' ETH (after fee)';
 $('sellFee').textContent='Gross ETH: '+fmt(gross)+' ETH · Trading fee: '+fmt(fee)+' ETH (1%) · Gas paid separately.';
 }catch(e){$('sellQuote').textContent=e.shortMessage||e.reason||e.message||'Quote unavailable';$('sellFee').textContent='';}
}

const curveEvents=new ethers.Interface(['event Bought(address indexed buyer,uint256 grossNative,uint256 fee,uint256 tokensOut)','event Sold(address indexed seller,uint256 tokensIn,uint256 grossNative,uint256 fee,uint256 netNative)']);
const pairEvents=new ethers.Interface(['event Swap(address indexed sender,bool nativeToToken,uint256 amountIn,uint256 amountOut,uint256 fee)']);
const marketFmt=(n,max=6)=>compactNumber(n,Math.min(max,4));
function marketText(id,value){const el=$(id);if(el)el.textContent=value;}
let chartInterval='5m',chartMode='area';
function paintMarketCache(){
 const keys=['pixorun:market:v4:','pixorun:market:v3:','pixorun:market:v2:','pixorun:market:v1:'];
 for(const prefix of keys){try{const raw=localStorage.getItem(prefix+tokenAddress.toLowerCase());if(raw){marketCache=JSON.parse(raw);break;}}catch(_){}}
 if(!marketCache)return;const c=marketCache;
 marketText('marketPrice',c.price||'—');marketText('marketCap',c.cap||'—');marketText('marketLiquidity',c.liquidity||'—');marketText('marketVolume',c.volume||'—');marketText('marketChange',c.change||'—');marketText('marketTrades',c.trades||'0');marketText('marketUpdated','Saved data · refreshing');drawMarketChart(c.points||[]);marketText('marketTradeCount',c.tradeCount||'0 trades');const host=$('marketRecentTrades');if(host&&c.rows)host.innerHTML=c.rows;marketText('marketDataNote','Showing the latest saved data while live on-chain data refreshes.');
}
function chartPriceFmt(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return '—';if(n>=1)return marketFmt(n,8);const decimals=Math.min(18,Math.max(8,Math.ceil(-Math.log10(n))+5));return n.toFixed(decimals).replace(/0+$/,'').replace(/\.$/,'');}
function drawMarketChart(points){
 const host=$('marketChart');if(!host)return;
 const cfg={'1s':{seconds:1,window:300},'1m':{seconds:60,window:3600},'5m':{seconds:300,window:21600},'15m':{seconds:900,window:86400}}[chartInterval]||{seconds:300,window:21600};
 const now=Math.floor(Date.now()/1000),end=Math.ceil(now/cfg.seconds)*cfg.seconds,start=end-cfg.window;
 const valid=points.filter(p=>Number.isFinite(Number(p.price))&&Number(p.price)>0&&Number(p.time)>=start&&Number(p.time)<end).sort((a,b)=>Number(a.time)-Number(b.time)||Number(a.block||0)-Number(b.block||0)||Number(a.transactionIndex||0)-Number(b.transactionIndex||0)||Number(a.logIndex||0)-Number(b.logIndex||0));
 if(!valid.length){host.innerHTML='<div class="chart-empty"><strong>No confirmed trades in this period</strong><span>Only confirmed on-chain trades are shown. New price points appear after a trade.</span></div>';marketText('chartLivePrice','No confirmed price');marketText('chartLiveChange','Waiting for trades');return;}
 const buckets=new Map();
 for(const p of valid){const time=Math.floor(Number(p.time)/cfg.seconds)*cfg.seconds,price=Number(p.price);let d=buckets.get(time);if(!d){d={time,open:price,high:price,low:price,close:price,count:0};buckets.set(time,d);}d.close=price;d.high=Math.max(d.high,price);d.low=Math.min(d.low,price);d.count++;}
 const data=[...buckets.values()].sort((a,b)=>a.time-b.time),last=data[data.length-1].close,first=data[0].open,change=first?((last-first)/first*100):0;
 marketText('chartLivePrice',chartPriceFmt(last)+' ETH');marketText('chartLiveChange',(change>=0?'+':'')+change.toFixed(2)+'% in view');
 const W=1000,H=390,L=22,R=116,T=26,priceBottom=268,volTop=296,volBottom=344,PW=W-L-R,PH=priceBottom-T;
 const min0=Math.min(...data.map(d=>d.low)),max0=Math.max(...data.map(d=>d.high)),spread=max0-min0,pad=spread?spread*.16:Math.max(Math.abs(max0)*.025,1e-18),min=Math.max(0,min0-pad),max=max0+pad,range=max-min||1e-18;
 const x=t=>L+Math.max(0,Math.min(1,(t-start)/cfg.window))*PW,y=v=>T+(max-v)/range*PH;
 const maxVol=Math.max(1,...data.map(d=>d.count)),volY=n=>volBottom-(n/maxVol)*(volBottom-volTop);
 const fmtTime=t=>new Date(t*1000).toLocaleTimeString('en-GB',{timeZone:'Asia/Dhaka',hour:'2-digit',minute:'2-digit',hour12:false});
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="PIXORUN on-chain '+(chartMode==='area'?'area':'candlestick')+' price chart"><defs><linearGradient id="pxAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#31d6a4" stop-opacity=".34"/><stop offset="75%" stop-color="#31d6a4" stop-opacity=".07"/><stop offset="100%" stop-color="#31d6a4" stop-opacity="0"/></linearGradient><filter id="pxLineGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="pxPlotClip"><rect x="'+L+'" y="'+T+'" width="'+PW+'" height="'+(PH+1)+'"/></clipPath></defs>';
 for(let i=0;i<=4;i++){const yy=T+i*PH/4,val=max-i*range/4;svg+='<line x1="'+L+'" y1="'+yy.toFixed(1)+'" x2="'+(W-R+4)+'" y2="'+yy.toFixed(1)+'" stroke="#91a4bc" stroke-opacity=".16" stroke-dasharray="3 7"/><text x="'+(W-8)+'" y="'+(yy+4).toFixed(1)+'" text-anchor="end" fill="#9eafc4" font-size="12" font-family="Space Grotesk,Arial">'+esc(chartPriceFmt(val))+'</text>';}
 svg+='<line x1="'+L+'" y1="'+(volTop-12)+'" x2="'+(W-R+4)+'" y2="'+(volTop-12)+'" stroke="#91a4bc" stroke-opacity=".2"/><text x="'+L+'" y="'+(volTop+2)+'" fill="#8295aa" font-size="10" font-weight="700" letter-spacing="1.2">VOLUME · TRADES</text><g clip-path="url(#pxPlotClip)">';
 if(chartMode==='area'){
  const pts=data.map(d=>({x:x(d.time),y:y(d.close)}));
  let line='M '+pts[0].x.toFixed(2)+' '+pts[0].y.toFixed(2);
  for(let i=1;i<pts.length;i++){const mx=(pts[i-1].x+pts[i].x)/2;line+=' Q '+pts[i-1].x.toFixed(2)+' '+pts[i-1].y.toFixed(2)+' '+mx.toFixed(2)+' '+((pts[i-1].y+pts[i].y)/2).toFixed(2);if(i===pts.length-1)line+=' T '+pts[i].x.toFixed(2)+' '+pts[i].y.toFixed(2);}
  const area=line+' L '+pts[pts.length-1].x.toFixed(2)+' '+priceBottom+' L '+pts[0].x.toFixed(2)+' '+priceBottom+' Z';
  svg+='<path d="'+area+'" fill="url(#pxAreaGradient)"/><path d="'+line+'" fill="none" stroke="#31d6a4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#pxLineGlow)"/>';
  data.forEach((d,i)=>{const xx=x(d.time),yy=y(d.close),title=esc(new Date(d.time*1000).toLocaleString('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'})+' · '+chartPriceFmt(d.close)+' ETH · '+d.count+' trades');svg+='<circle cx="'+xx.toFixed(2)+'" cy="'+yy.toFixed(2)+'" r="3.2" fill="#31d6a4" stroke="#0b1725" stroke-width="2"><title>'+title+'</title></circle>';});
 }else{
  const candleW=Math.max(3,Math.min(16,PW/cfg.window*cfg.seconds*.62));
  data.forEach(d=>{const xx=x(d.time),up=d.close>=d.open,color=up?'#31d6a4':'#f06f86',yo=y(d.open),yc=y(d.close);svg+='<line x1="'+xx.toFixed(2)+'" y1="'+y(d.high).toFixed(2)+'" x2="'+xx.toFixed(2)+'" y2="'+y(d.low).toFixed(2)+'" stroke="'+color+'" stroke-width="1.5"/><rect x="'+(xx-candleW/2).toFixed(2)+'" y="'+Math.min(yo,yc).toFixed(2)+'" width="'+candleW.toFixed(2)+'" height="'+Math.max(2,Math.abs(yo-yc)).toFixed(2)+'" rx="1" fill="'+color+'"><title>'+esc(fmtTime(d.time)+' · O '+chartPriceFmt(d.open)+' · H '+chartPriceFmt(d.high)+' · L '+chartPriceFmt(d.low)+' · C '+chartPriceFmt(d.close))+'</title></rect>';});
 }
 data.forEach(d=>{const xx=x(d.time),bw=Math.max(2,Math.min(18,PW/cfg.window*cfg.seconds*.55)),up=d.close>=d.open;svg+='<rect x="'+(xx-bw/2).toFixed(2)+'" y="'+volY(d.count).toFixed(2)+'" width="'+bw.toFixed(2)+'" height="'+Math.max(2,volBottom-volY(d.count)).toFixed(2)+'" rx="2" fill="'+(up?'#31d6a4':'#ef788b')+'" opacity=".62"><title>'+d.count+' confirmed trades</title></rect>';});
 svg+='</g>';
 const lastX=x(data[data.length-1].time),lastY=y(last),pillY=Math.max(T,Math.min(priceBottom-22,lastY-11));
 svg+='<line x1="'+L+'" y1="'+lastY.toFixed(2)+'" x2="'+(W-R+3)+'" y2="'+lastY.toFixed(2)+'" stroke="#31d6a4" stroke-width="1.2" stroke-dasharray="5 5" opacity=".85"/><circle cx="'+lastX.toFixed(2)+'" cy="'+lastY.toFixed(2)+'" r="5" fill="#31d6a4" stroke="#e7fff7" stroke-width="2"/><rect x="'+(W-R+8)+'" y="'+pillY.toFixed(2)+'" width="'+(R-14)+'" height="23" rx="5" fill="#1d8d70"/><text x="'+(W-R+8+(R-14)/2)+'" y="'+(pillY+15).toFixed(2)+'" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">'+esc(chartPriceFmt(last))+'</text>';
 const labels=5;for(let i=0;i<=labels;i++){const t=start+cfg.window*i/labels,xx=x(t),label=fmtTime(t);svg+='<line x1="'+xx.toFixed(2)+'" y1="'+priceBottom+'" x2="'+xx.toFixed(2)+'" y2="'+(priceBottom+4)+'" stroke="#8295aa" opacity=".5"/><text x="'+xx.toFixed(2)+'" y="372" text-anchor="'+(i===0?'start':i===labels?'end':'middle')+'" fill="#93a5ba" font-size="11" font-family="Space Grotesk,Arial">'+label+'</text>';}
 svg+='</svg>';host.innerHTML=svg;
}
document.querySelectorAll('[data-chart-interval]').forEach(btn=>btn.addEventListener('click',()=>{chartInterval=btn.dataset.chartInterval;document.querySelectorAll('[data-chart-interval]').forEach(b=>b.classList.toggle('active',b===btn));try{const saved=marketCache||JSON.parse(localStorage.getItem('pixorun:market:v4:'+tokenAddress.toLowerCase())||'null')||JSON.parse(localStorage.getItem('pixorun:market:v3:'+tokenAddress.toLowerCase())||'null');drawMarketChart(saved?.points||[]);}catch(_){drawMarketChart([]);}}));
document.querySelectorAll('[data-chart-mode]').forEach(btn=>btn.addEventListener('click',()=>{chartMode=btn.dataset.chartMode;document.querySelectorAll('[data-chart-mode]').forEach(b=>b.classList.toggle('active',b===btn));try{const saved=marketCache||JSON.parse(localStorage.getItem('pixorun:market:v4:'+tokenAddress.toLowerCase())||'null')||JSON.parse(localStorage.getItem('pixorun:market:v3:'+tokenAddress.toLowerCase())||'null');drawMarketChart(saved?.points||[]);}catch(_){drawMarketChart([]);}}));

async function updateCurveProgress(){
 const card=$('curveProgressCard');if(!card||!curve)return;
 try{
  const [sold,remaining]=await Promise.all([curve.totalSold(),curve.realToken()]);
  const allocation=793100000n*10n**BigInt(decimals);
  const pct=Number(sold*10000n/allocation)/100;
  const bounded=Math.max(0,Math.min(100,pct));
  $('curveProgressPercent').textContent=graduated?'100% · Liftoff complete':bounded.toFixed(2)+'%';
  $('curveProgressFill').style.width=(graduated?100:bounded)+'%';
  const compactCurveAmount=value=>compactNumber(ethers.formatUnits(value,decimals),2);$('curveTokensSold').textContent=compactCurveAmount(sold);
  $('curveTokensRemaining').textContent=compactCurveAmount(remaining);
  $('curveProgressNote').textContent=graduated?'The bonding curve is complete. This token has moved to its PIXORUN Swap pool.':'Progress = tokens sold ÷ 793,100,000-token curve allocation. Values are read directly from the bonding curve contract.';
 }catch(e){$('curveProgressPercent').textContent='Unavailable';$('curveProgressNote').textContent='Could not read curve progress from Robinhood Chain Testnet. Tap Retry to refresh.';}
}
async function findBlockAtOrAfter(target,latest){
 let lo=0,hi=latest;
 while(lo<hi){const mid=Math.floor((lo+hi)/2),b=await withTimeout(provider.getBlock(mid),'Block timestamp',10000);if(!b)throw Error('Could not read block timestamp.');if(Number(b.timestamp)<target)lo=mid+1;else hi=mid;}
 return lo;
}
async function loadMarketData(){
 if(marketLoading||!token||!curve||!tokenAddress)return;
 marketLoading=true;
 const key='pixorun:market:v4:'+tokenAddress.toLowerCase();
 let saved=marketCache;
 try{saved=JSON.parse(localStorage.getItem(key)||'null')||saved;}catch(_){}
 try{
  const latest=await withTimeout(provider.getBlockNumber(),'Latest block',10000);
  const reserveReads=mode==='curve'
   ?Promise.all([curve.virtualNative(),curve.virtualToken(),curve.realNative(),curve.realToken()])
   :Promise.all([pair.reserveNative(),pair.reserveToken()]);
  const [reserves,supply]=await Promise.all([reserveReads,token.totalSupply()]);
  let reserveEth=0,reserveToken=0,price=0,liquidity='—';
  if(mode==='curve'){
   const [virtualNative,virtualToken,realNative,realToken]=reserves;
   reserveEth=Number(ethers.formatEther(realNative));reserveToken=Number(ethers.formatUnits(realToken,decimals));
   if(virtualNative>0n&&virtualToken>0n)price=Number(ethers.formatEther(virtualNative))/Number(ethers.formatUnits(virtualToken,decimals));
   liquidity=marketFmt(reserveEth,5)+' ETH + '+marketFmt(reserveToken,0)+' tokens';
  }else{
   const [nativeReserve,tokenReserve]=reserves;
   reserveEth=Number(ethers.formatEther(nativeReserve));reserveToken=Number(ethers.formatUnits(tokenReserve,decimals));
   if(nativeReserve>0n&&tokenReserve>0n)price=reserveEth/reserveToken;
   liquidity=marketFmt(reserveEth,5)+' ETH + '+marketFmt(reserveToken,0)+' tokens';
  }
  const supplyNumber=Number(ethers.formatUnits(supply,decimals)),mcap=price*supplyNumber;
  const priceLabel=price>0?chartPriceFmt(price)+' ETH':'—';
  marketText('marketPrice',priceLabel);marketText('marketCap',price>0?marketFmt(mcap,5)+' ETH':'—');
  marketText('marketLiquidity',liquidity);marketText('marketUpdated','On-chain · '+new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Dhaka'}));
  let recent=(saved?.points||[]).filter(t=>Number(t.time)>=Math.floor(Date.now()/1000)-86400);
  let scanError=null,scanSucceeded=false;
  try{
   let fromBlock;
   if(saved?.lastBlock!==null&&saved?.lastBlock!==undefined&&Number.isSafeInteger(Number(saved.lastBlock)))fromBlock=Math.max(0,Number(saved.lastBlock)-2);
   else if(Number.isSafeInteger(Number(launchBlock))&&Number(launchBlock)>0){
    const launch=await withTimeout(provider.getBlock(Number(launchBlock)),'Launch block timestamp',10000);
    fromBlock=launch&&Number(launch.timestamp)>=Math.floor(Date.now()/1000)-86400?Number(launchBlock):await findBlockAtOrAfter(Math.floor(Date.now()/1000)-86400,latest);
   }else fromBlock=await findBlockAtOrAfter(Math.floor(Date.now()/1000)-86400,latest);
   const topics=[curveEvents.getEvent('Bought').topicHash,curveEvents.getEvent('Sold').topicHash,pairEvents.getEvent('Swap').topicHash],logs=[];
   if(fromBlock<=latest){
    const ranges=[];for(let n=fromBlock;n<=latest;n+=1500)ranges.push([n,Math.min(latest,n+1499)]);
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(2,ranges.length)},async()=>{
     while(cursor<ranges.length){
      const [fromBlock,toBlock]=ranges[cursor++];
      const curveLogs=await withTimeout(provider.getLogs({address:curveAddress,fromBlock,toBlock,topics:[[topics[0],topics[1]]]}),'Curve trade history',15000);
      logs.push(...curveLogs);
      if(mode==='swap'){
       const pairLogs=await withTimeout(provider.getLogs({address:pairAddress,fromBlock,toBlock,topics:[topics[2]]}),'Swap trade history',15000);
       logs.push(...pairLogs);
      }
     }
    }));
   }
   const decoded=logs.map(log=>{try{
    if(log.address.toLowerCase()===curveAddress.toLowerCase()){
     const event=curveEvents.parseLog(log);
     return event.name==='Bought'
      ?{type:'Buy',native:Number(ethers.formatEther(event.args.grossNative)),tokens:Number(ethers.formatUnits(event.args.tokensOut,decimals)),block:log.blockNumber,transactionIndex:log.transactionIndex??0,logIndex:log.index??log.logIndex??0,hash:log.transactionHash}
      :{type:'Sell',native:Number(ethers.formatEther(event.args.grossNative)),tokens:Number(ethers.formatUnits(event.args.tokensIn,decimals)),block:log.blockNumber,transactionIndex:log.transactionIndex??0,logIndex:log.index??log.logIndex??0,hash:log.transactionHash};
    }
    const event=pairEvents.parseLog(log),isBuy=event.args.nativeToToken;
    return {type:isBuy?'Buy':'Sell',native:Number(ethers.formatEther(isBuy?event.args.amountIn:event.args.amountOut)),tokens:Number(ethers.formatUnits(isBuy?event.args.amountOut:event.args.amountIn,decimals)),block:log.blockNumber,transactionIndex:log.transactionIndex??0,logIndex:log.index??log.logIndex??0,hash:log.transactionHash};
   }catch(_){return null;}}).filter(Boolean);
   const blockNums=[...new Set(decoded.map(t=>t.block))],times={};let cursor=0;
   await Promise.all(Array.from({length:Math.min(8,blockNums.length)},async()=>{
    while(cursor<blockNums.length){const n=blockNums[cursor++];try{const b=await withTimeout(provider.getBlock(n),'Trade timestamp',10000);if(b)times[n]=Number(b.timestamp);}catch(_){}}
   }));
   const now=Math.floor(Date.now()/1000),added=decoded.map(t=>({...t,time:times[t.block]||0,price:t.tokens>0?t.native/t.tokens:0})).filter(t=>t.time>=now-86400&&t.time>0);
   const map=new Map();[...recent,...added].forEach(t=>map.set(String(t.hash||'')+':'+String(t.logIndex??t.transactionIndex??0),t));
   recent=[...map.values()].filter(t=>Number(t.time)>=now-86400).sort((a,b)=>a.time-b.time||Number(a.block||0)-Number(b.block||0)||Number(a.transactionIndex||0)-Number(b.transactionIndex||0)||Number(a.logIndex||0)-Number(b.logIndex||0));
   scanSucceeded=true;
  }catch(error){scanError=error;console.warn('PIXORUN trade history scan failed:',error);}
  const volume=recent.reduce((sum,t)=>sum+Number(t.native||0),0);
  const first=recent.find(t=>Number(t.price)>0),last=[...recent].reverse().find(t=>Number(t.price)>0);
  const change=first&&last&&first.price>0?(last.price/first.price-1)*100:null;
  marketText('marketVolume',marketFmt(volume,5)+' ETH');
  marketText('marketChange',change===null?'—':(change>=0?'+':'')+marketFmt(change,2)+'%');
  marketText('marketTrades',String(recent.length));
  if(scanSucceeded||!saved){
   drawMarketChart(recent.filter(t=>Number(t.price)>0));
   const rows=recent.slice(-8).reverse(),host=$('marketRecentTrades');
   if(host)host.innerHTML=rows.length?rows.map(t=>'<div class="market-trade-row"><strong class="'+(t.type==='Buy'?'market-buy':'market-sell')+'">'+t.type+'</strong><span>'+marketFmt(t.tokens,3)+' tokens · '+marketFmt(t.native,6)+' ETH</span><time class="market-trade-time" datetime="'+new Date(t.time*1000).toISOString()+'">'+new Date(t.time*1000).toLocaleString('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+'</time><a href="'+EXPLORER+'/tx/'+t.hash+'" target="_blank" rel="noopener noreferrer">View tx ↗</a></div>').join(''):'<p class="trade-help">No confirmed trades in the last 24 hours.</p>';
   marketText('marketTradeCount',recent.length+' trades');
  }
  marketText('marketDataNote',scanError?'Market reserves are live. Trade history is temporarily delayed; saved trades remain visible.':'Live confirmed on-chain trades · rolling 24-hour window.');
  const payload={savedAt:Date.now(),lastBlock:scanSucceeded?latest:(saved?.lastBlock??null),price:priceLabel,cap:price>0?marketFmt(mcap,5)+' ETH':'—',liquidity,volume:marketFmt(volume,5)+' ETH',change:change===null?'—':(change>=0?'+':'')+marketFmt(change,2)+'%',trades:String(recent.length),points:recent,tradeCount:recent.length+' trades',rows:$('marketRecentTrades')?.innerHTML||''};
  marketCache=payload;try{localStorage.setItem(key,JSON.stringify(payload));}catch(_){}
 }catch(error){
  console.warn('PIXORUN market refresh failed:',error);
  marketText('marketUpdated','Temporarily delayed');
  marketText('marketDataNote','Could not refresh live reserves. Last saved market data is kept on screen.');
  if(!saved)drawMarketChart([]);
 }finally{marketLoading=false;}
}

let holdersLoading=false,holdersLoaded=false;
async function loadTokenHolders(){
 const host=$('marketHolders');if(!host||holdersLoading)return;
 if(holdersLoaded)return;
 holdersLoading=true;const tab=$('holdersTab');if(tab)tab.disabled=true;
 host.innerHTML='<p class="trade-help">Loading holder history from Robinhood Chain Testnet…</p>';
 try{
  if(!launchBlock&&window.PIXORUN_REGISTRY){
   const row=await withTimeout(window.PIXORUN_REGISTRY.getLaunch(tokenAddress),'Holder launch metadata',12000);
   if(row?.block_number!==undefined&&row?.block_number!==null)launchBlock=Number(row.block_number);
  }
  if(!Number.isSafeInteger(Number(launchBlock))||Number(launchBlock)<0)throw Error('Token launch block is not available yet. Please try again shortly.');
  const latest=await withTimeout(provider.getBlockNumber(),'Holder latest block',12000);
  const topic=ethers.id('Transfer(address,address,uint256)'),balances=new Map(),chunk=1000,total=Math.max(1,latest-Number(launchBlock)+1);
  for(let from=Number(launchBlock);from<=latest;from+=chunk){
   const to=Math.min(latest,from+chunk-1);
   const logs=await withTimeout(provider.getLogs({address:tokenAddress,fromBlock:from,toBlock:to,topics:[topic]}),'Holder transfer history',18000);
   logs.sort((a,b)=>a.blockNumber-b.blockNumber||(a.index??a.logIndex??0)-(b.index??b.logIndex??0));
   for(const log of logs){
    const fromAddress='0x'+log.topics[1].slice(-40),toAddress='0x'+log.topics[2].slice(-40),amount=BigInt(log.data);
    if(fromAddress.toLowerCase()!==ethers.ZeroAddress.toLowerCase())balances.set(fromAddress.toLowerCase(),(balances.get(fromAddress.toLowerCase())||0n)-amount);
    if(toAddress.toLowerCase()!==ethers.ZeroAddress.toLowerCase())balances.set(toAddress.toLowerCase(),(balances.get(toAddress.toLowerCase())||0n)+amount);
   }
   const scanned=Math.min(total,to+1-Number(launchBlock));
   host.innerHTML='<p class="trade-help">Scanning token transfers… '+Math.floor(scanned/total*100)+'%</p>';
  }
  const rows=[...balances.entries()].filter(([,v])=>v>0n).sort((a,b)=>a[1]===b[1]?0:a[1]>b[1]?-1:1);
  const supply=await token.totalSupply(),top=rows.slice(0,100);
  host.innerHTML=top.length?'<p class="trade-help">'+rows.length.toLocaleString()+' holders · showing top '+top.length+'</p>'+top.map(([address,balance],i)=>{const pct=supply>0n?Number(balance*1000000n/supply)/10000:0;return '<div class="market-holder-row"><span class="market-holder-rank">#'+(i+1)+'</span><a class="market-holder-address" href="'+EXPLORER+'/address/'+address+'" target="_blank" rel="noopener noreferrer">'+address.slice(0,8)+'…'+address.slice(-6)+' ↗</a><strong class="market-holder-balance">'+marketFmt(ethers.formatUnits(balance,decimals),3)+'<small class="market-holder-share">'+pct.toFixed(2)+'% of supply</small></strong></div>';}).join(''):'<p class="trade-help">No token holders found yet.</p>';
  holdersLoaded=true;
 }catch(error){console.warn('Token holders could not be loaded:',error);host.innerHTML='<p class="trade-help">Could not load holders: '+String(error.shortMessage||error.message||'RPC error')+'</p><button type="button" class="market-activity-tab" id="retryHolders">Retry holders</button>';host.querySelector('#retryHolders')?.addEventListener('click',()=>{holdersLoaded=false;loadTokenHolders();});}
 finally{holdersLoading=false;if(tab)tab.disabled=false;}
}
function setMarketActivity(view){
 const recent=view==='recent',recentTab=$('recentTradesTab'),holdersTab=$('holdersTab');
 if(recentTab){recentTab.classList.toggle('active',recent);recentTab.setAttribute('aria-selected',String(recent));}
 if(holdersTab){holdersTab.classList.toggle('active',!recent);holdersTab.setAttribute('aria-selected',String(!recent));}
 $('marketRecentTrades').hidden=!recent;$('marketHolders').hidden=recent;
 marketText('marketTradeCount',recent?(marketCache?.tradeCount||'0 trades'):'Current token balances');
 if(!recent)loadTokenHolders();
}
$('recentTradesTab')?.addEventListener('click',()=>setMarketActivity('recent'));
$('holdersTab')?.addEventListener('click',()=>setMarketActivity('holders'));
async function refresh(){
 if(!tokenAddress||!ethers.isAddress(tokenAddress))throw Error('Token address is missing or invalid. Open this page from Discover.');
 setStatus('Finding this token across PIXORUN launchpad generations…');
 const candidates=await loadFactoryCandidates();
 let matched=null,lookupErrors=[],factoryFound=false;
 const rpcUrls=window.PIXORUN_RPC?.urls?.length?window.PIXORUN_RPC.urls:[RPC];
 for(const item of candidates){
  for(const url of rpcUrls){
   let rpcCandidate;
   try{
    rpcCandidate=new ethers.JsonRpcProvider(url,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
    const candidate=new ethers.Contract(item.launchpadFactory,factoryAbi,rpcCandidate);
    const candidateCurve=await withTimeout(candidate.curveOf(tokenAddress),'Factory lookup',7000);
    if(candidateCurve&&candidateCurve!==ethers.ZeroAddress){
     provider=rpcCandidate;
     matched={...item,contract:candidate,curve:candidateCurve};
     factoryFound=true;
     break;
    }
    factoryFound=true;
    rpcCandidate.destroy?.();
   }catch(error){
    rpcCandidate?.destroy?.();
    lookupErrors.push(url+': '+(error.shortMessage||error.message||'RPC read failed'));
   }
  }
  if(matched)break;
 }
 if(!matched){
  if(!factoryFound)throw Error('Factory lookup RPC unavailable. '+lookupErrors.join(' · '));
  throw Error('This token was not found in the active PIXORUN Factory. Check that the token address belongs to Robinhood Chain Testnet.');
 }
 const factory=matched.contract;curveAddress=matched.curve;
 token=new ethers.Contract(tokenAddress,tokenAbi,provider);curve=new ethers.Contract(curveAddress,curveAbi,provider);
 let associatedSwapFactory=matched.swapFactory;
 try{const configured=await withTimeout(factory.swapFactory(),'Factory Swap configuration',8000);if(configured&&configured!==ethers.ZeroAddress)associatedSwapFactory=configured;}catch(error){console.warn('Could not read the factory-linked Swap Factory; using deployment registry value.',error);}
 if(!associatedSwapFactory)throw Error('The matching PIXORUN Factory was found, but its Swap Factory configuration is unavailable.');
 const swapFactory=new ethers.Contract(associatedSwapFactory,swapFactoryAbi,provider);
 setStatus('Factory found · loading token and market data…');
 const [name,symbol,tokenDecimals,supply,creator,done,graduatedState,pairAddr]=await withTimeout(Promise.all([token.name(),token.symbol(),token.decimals(),token.totalSupply(),factory.creatorOf(tokenAddress),factory.liftoffCompleted(tokenAddress),curve.graduated(),swapFactory.getPair(tokenAddress)]),'Token data read');decimals=Number(tokenDecimals);
 graduated=done||graduatedState;pairAddress=pairAddr;mode=graduated&&pairAddr!==ethers.ZeroAddress?'swap':'curve';
 $('tokenName').textContent=name;$('tokenSymbol').textContent=symbol;$('sellTicker').textContent=symbol;$('walletTokenLabel').textContent=symbol+' balance';$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;
 $('curveAddress').textContent=curveAddress;$('curveAddress').href=EXPLORER+'/address/'+curveAddress;
 $('creatorAddress').textContent=creator;$('creatorAddress').href=EXPLORER+'/address/'+creator;
 $('totalSupply').textContent=fmt(supply,decimals)+' '+symbol;
 $('tradeMode').textContent=mode==='swap'?'PIXORUN Swap pool':'Bonding curve';
 if(mode==='swap'){$('pairAddress').textContent=pairAddress;$('pairAddress').href=EXPLORER+'/address/'+pairAddress;pair=new ethers.Contract(pairAddress,pairAbi,provider);$('graduationNote').textContent='This token completed Liftoff. Trading uses its PIXORUN Swap pool.';}
 else {$('pairAddress').textContent='Not created yet';$('graduationNote').textContent='This token is still on its bonding curve. When the curve sells out, Liftoff seeds the PIXORUN Swap pool atomically.';}
 $('graduationNote').hidden=false;
 try{localStorage.setItem(cacheKey,JSON.stringify({name,symbol,creator,curveAddress,launchBlock:launchBlock||undefined,totalSupply:fmt(supply,decimals)+' '+symbol,tradeMode:mode==='swap'?'PIXORUN Swap pool':'Bonding curve'}));}catch(_){}
 const tradeDisabled=graduated&&mode!=='swap';canTrade=!tradeDisabled;$('buyBtn').disabled=tradeDisabled;$('sellBtn').disabled=tradeDisabled;
 if(tradeDisabled)setStatus('Liftoff completed, but the Swap pair is not available. Trading is paused until a pool is found.');
 else setStatus('');
 const metadataTask=loadMetadata().catch(error=>console.warn('Token metadata refresh delayed:',error));
 await Promise.all([quoteBuy(),quoteSell(),updateCurveProgress()]);
 // Do not block the token page's first render on the 24-hour trade-history scan.
 // Cached market data is painted immediately; live market history refreshes in the background.
 loadMarketData().catch(error=>console.warn('Background market refresh delayed:',error));
 if(account)await refreshBalances();
}

async function setTradePercent(side,percent){
 if(!account){await connect();}
 const p=wallet();if(!p)throw Error('Connect your wallet first.');
 if(side==='buy'){
  const fresh=await withTimeout(provider.getBalance(account),'ETH balance');
  ethBalance=fresh;
  const spendable=fresh*90n/100n;
  const amount=spendable*BigInt(percent)/100n;
  if(amount<=0n)throw Error('Your available ETH balance is too small.');
  $('buyAmount').value=ethers.formatEther(amount);await quoteBuy();
 }else{
  const fresh=await withTimeout(token.balanceOf(account),'Token balance');
  tokenBalance=fresh;
  if(fresh<=0n)throw Error('You do not have any of this token in the connected wallet.');
  const amount=fresh*BigInt(percent)/100n;
  if(amount<=0n)throw Error('Selected token amount is too small.');
  $('sellAmount').value=ethers.formatUnits(amount,decimals);await quoteSell();
 }
 await refreshBalances();
}
async function buy(){
 if(busy)return;busy=true;$('buyBtn').disabled=true;
 try{
  if(!account)await connect();await ensureNetwork();
  const amount=ethers.parseEther($('buyAmount').value||'0');if(amount<=0n)throw Error('Enter an ETH amount greater than zero.');
  const signer=await new ethers.BrowserProvider(wallet()).getSigner();let minOut,contract;
  if(mode==='curve'){const q=await getBuyQuote(amount);minOut=minAfterSlippage(q.out);contract=new ethers.Contract(curveAddress,curveAbi,signer);}
  else{const q=await getBuyQuote(amount);minOut=minAfterSlippage(q.out);contract=new ethers.Contract(pairAddress,pairAbi,signer);}
  const gas=mode==='curve'?await contract.buy.estimateGas(minOut,{value:amount}):await contract.swapNativeForToken.estimateGas(minOut,{value:amount});const feeData=await provider.getFeeData();const gasPrice=feeData.maxFeePerGas??feeData.gasPrice??0n;ethBalance=await provider.getBalance(account);
  if(ethBalance<amount+(gas*gasPrice*12n/10n))throw Error('Insufficient ETH for this buy plus estimated gas. Reduce the buy amount or add testnet ETH.');
  showTradeModal('pending','Confirm your buy','Approve the transaction in your wallet. Waiting for on-chain confirmation…');
  setStatus('Confirm the buy in your wallet. The quote is protected by '+slippage()+'% slippage.');
  const tx=mode==='curve'?await contract.buy(minOut,{value:amount,gasLimit:gas*12n/10n}):await contract.swapNativeForToken(minOut,{value:amount,gasLimit:gas*12n/10n});
  showTradeModal('pending','Buy submitted','Your buy transaction was submitted. Waiting for Robinhood Chain confirmation…',tx.hash);setStatus('Buy submitted: '+tx.hash);await tx.wait();
  showTradeModal('success','Buy successful','Your token purchase is complete. '+$('tokenSymbol').textContent+' balance and market data are refreshing.',tx.hash);
  setStatus('Buy confirmed on Robinhood Chain Testnet.');await refresh();
 }catch(e){const message=e.shortMessage||e.reason||e.message||'Buy failed.';showTradeModal('error','Buy failed',message);setStatus(message);}finally{busy=false;$('buyBtn').disabled=!canTrade;}
}
async function sell(){
 if(busy)return;busy=true;$('sellBtn').disabled=true;
 try{
  if(!account)await connect();await ensureNetwork();
  const amount=ethers.parseUnits($('sellAmount').value||'0',decimals);if(amount<=0n)throw Error('Enter a token amount greater than zero.');
  const currentBalance=await token.balanceOf(account);if(amount>currentBalance)throw Error('You do not have enough '+$('tokenSymbol').textContent+' for this sell.');
  const spender=mode==='curve'?curveAddress:pairAddress;
  const signer=await new ethers.BrowserProvider(wallet()).getSigner(),signedToken=token.connect(signer),allowance=await token.allowance(account,spender);
  if(allowance<amount){
   showTradeModal('pending','Approve token spending','Confirm the token approval in your wallet. The sell will start after approval is confirmed.');
   setStatus('Approve the exact token amount in your wallet…');const approval=await signedToken.approve(spender,amount);
   showTradeModal('pending','Approval submitted','Waiting for your token approval to be confirmed on-chain…',approval.hash);await approval.wait();
   showTradeModal('success','Approval successful','Token spending is approved. Your sell transaction is starting now.',approval.hash);
  }
  let minOut,contract;
  if(mode==='curve'){const q=await curve.quoteSell(amount);minOut=minAfterSlippage(q[2]);contract=new ethers.Contract(curveAddress,curveAbi,signer);}
  else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const gross=amount*rn/(rt+amount),out=gross-gross*100n/10000n;minOut=minAfterSlippage(out);contract=new ethers.Contract(pairAddress,pairAbi,signer);}
  showTradeModal('pending','Confirm your sell','Approve the sell transaction in your wallet. Waiting for on-chain confirmation…');
  setStatus('Confirm the sell in your wallet. The minimum receive amount includes '+slippage()+'% slippage protection.');
  const tx=mode==='curve'?await contract.sell(amount,minOut):await contract.swapTokenForNative(amount,minOut);
  showTradeModal('pending','Sell submitted','Your sell transaction was submitted. Waiting for Robinhood Chain confirmation…',tx.hash);
  setStatus('Sell submitted: '+tx.hash);await tx.wait();
  showTradeModal('success','Sell successful','Your tokens were sold successfully. ETH and token balances are refreshing.',tx.hash);
  setStatus('Sell confirmed on Robinhood Chain Testnet.');await refresh();
 }catch(e){const message=e.shortMessage||e.reason||e.message||'Sell failed.';showTradeModal('error','Transaction failed',message);setStatus(message);}finally{busy=false;$('sellBtn').disabled=!canTrade;}
}
$('buyAmount')?.addEventListener('input',quoteBuy);$('sellAmount')?.addEventListener('input',quoteSell);$('slippage')?.addEventListener('change',()=>{quoteBuy();quoteSell();});
$('buyBtn')?.addEventListener('click',buy);$('sellBtn')?.addEventListener('click',sell);

$('buyMax')?.addEventListener('click',()=>setTradePercent('buy',100).catch(e=>setStatus(e.shortMessage||e.message||'Could not read ETH balance.')));
$('sellMax')?.addEventListener('click',()=>setTradePercent('sell',100).catch(e=>setStatus(e.shortMessage||e.message||'Could not read token balance.')));
document.querySelectorAll('[data-trade-side][data-trade-percent]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await setTradePercent(button.dataset.tradeSide,Number(button.dataset.tradePercent));}catch(e){setStatus(e.shortMessage||e.reason||e.message||'Could not calculate percentage.');}finally{button.disabled=false;}}));
let tokenLoadInProgress=false;
async function loadTokenWithAutoRetry(){
  if(tokenLoadInProgress)return;
  tokenLoadInProgress=true;
  const retry=$('tokenRetry');
  if(retry)retry.disabled=true;
  let attempt=0;
  const delays=[1000,2000,4000,8000,15000,20000];
  try{
   while(true){
    try{
     if(attempt>0)setStatus('Robinhood RPC is responding slowly · automatically reconnecting ('+attempt+')…');
     await refresh();
     await readConnectedWallet();
     if(retry)retry.hidden=true;
     return;
    }catch(error){
     attempt++;
     console.warn('Token details load attempt '+attempt+' failed:',error);
     const message=String(error?.shortMessage||error?.reason||error?.message||'RPC error');
     const transient=/timed out|timeout|network|fetch|rpc|server|429|502|503|504|connection|temporar|unavailable|missing response|failed to detect/i.test(message);
     if(!transient){
      setStatus('Could not load token: '+message);
      return;
     }
     setStatus('Token data connection delayed · retrying automatically. You do not need to tap Retry.');
     await new Promise(resolve=>setTimeout(resolve,delays[Math.min(attempt-1,delays.length-1)]));
    }
   }
  }finally{
   tokenLoadInProgress=false;
   if(retry)retry.disabled=false;
  }
 }
 const retryButton=$('tokenRetry');
if(retryButton)retryButton.addEventListener('click',loadTokenWithAutoRetry);
const initialProvider=wallet();initialProvider?.on?.('accountsChanged',async a=>{account=a?.[0]?ethers.getAddress(a[0]):null;$('buyAmount').value='';$('sellAmount').value='';await readConnectedWallet();await quoteBuy();await quoteSell();});
initialProvider?.on?.('chainChanged',async()=>{await readConnectedWallet();});
setStatus(cached?'Showing saved token details · checking the blockchain…':'Starting token data request…');
window.addEventListener('pixorun:walletChanged',readConnectedWallet);
window.addEventListener('pixorun:walletChanged',()=>{if(account)refreshBalances();});

paintMarketCache();
let marketRefreshTimer=null;
const scheduleMarketRefresh=()=>{if(marketRefreshTimer)clearInterval(marketRefreshTimer);marketRefreshTimer=setInterval(()=>{if(!document.hidden){loadMarketData();updateCurveProgress();if(account)refreshBalances();}},12000);};
scheduleMarketRefresh();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMarketData();});
loadTokenWithAutoRetry();
})();
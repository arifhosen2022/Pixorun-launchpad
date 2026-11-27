(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',SWAP_FACTORY='0xCC423d983E12f044F9F930463ADe7Ce150a8A644',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com',CHAIN='0xb626';
const factoryAbi=['function curveOf(address) view returns(address)','function creatorOf(address) view returns(address)','function liftoffCompleted(address) view returns(bool)'];
const tokenAbi=['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
const curveAbi=['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realNative() view returns(uint256)','function realToken() view returns(uint256)','function virtualNative() view returns(uint256)','function virtualToken() view returns(uint256)','function quoteBuy(uint256) view returns(uint256,uint256,uint256)','function quoteSell(uint256) view returns(uint256,uint256,uint256)','function buy(uint256) payable returns(uint256)','function sell(uint256,uint256) returns(uint256)'];
const swapFactoryAbi=['function getPair(address) view returns(address)'];
const pairAbi=['function reserveNative() view returns(uint112)','function reserveToken() view returns(uint112)','function swapNativeForToken(uint256) payable returns(uint256)','function swapTokenForNative(uint256,uint256) returns(uint256)'];
const $=id=>document.getElementById(id),provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
const tokenAddress=new URLSearchParams(location.search).get('address');
const cacheKey=tokenAddress&&ethers.isAddress(tokenAddress)?'pixorun:token:v2:'+tokenAddress.toLowerCase():null;
let cached=null;try{cached=cacheKey?JSON.parse(localStorage.getItem(cacheKey)||'null'):null;}catch(_){}
if(cached){$('tokenName').textContent=cached.name||'Token';$('tokenSymbol').textContent=cached.symbol||'—';$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;if(cached.curveAddress){$('curveAddress').textContent=cached.curveAddress;$('curveAddress').href=EXPLORER+'/address/'+cached.curveAddress;}if(cached.creator){$('creatorAddress').textContent=cached.creator;$('creatorAddress').href=EXPLORER+'/address/'+cached.creator;}$('totalSupply').textContent=cached.totalSupply||'—';$('tradeMode').textContent=cached.tradeMode||'Refreshing market…';}
let token,curve,pair,curveAddress,pairAddress,decimals=18,graduated=false,mode='curve',busy=false,account=null,canTrade=false,tokenBalance=0n,ethBalance=0n,totalSupplyRaw=0n,holderRows=[],holderOffset=0,holderCount=0,holderTop10=0,holderTop50=0,holderLoading=false;
const withTimeout=(promise,label,ms=12000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' timed out. Robinhood RPC did not respond.')),ms))]);
const fmt=(v,d=18)=>{const raw=ethers.formatUnits(v,d),parts=raw.split('.'),whole=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');const fraction=(parts[1]||'').replace(/0+$/,'');return fraction?whole+'.'+fraction:whole;};
const setStatus=m=>{if($('tradeStatus'))$('tradeStatus').textContent=m;};
function wallet(){const p=window.ethereum,b=window.bitkeep?.ethereum;if(p?.isMetaMask)return p;if(b?.isBitKeep||window.bitkeep?.isBitKeep)return b||p;return p||b||null;}
function slippage(){return Math.max(0,Math.min(50,Number($('slippage')?.value||1)));}
function minAfterSlippage(value){return value*BigInt(Math.floor((100-slippage())*100))/10000n;}
async function ensureNetwork(){const p=wallet();if(!p)throw Error('No compatible EVM wallet found. Open PIXORUN in your wallet browser.');let chain=(await p.request({method:'eth_chainId'})).toLowerCase();if(chain!==CHAIN){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}chain=(await p.request({method:'eth_chainId'})).toLowerCase();}if(chain!==CHAIN)throw Error('Switch to Robinhood Chain Testnet and try again.');}
async function refreshBalances(){
 if(!account||!token){$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';return;}
 try{const [eth,tok]=await Promise.all([withTimeout(provider.getBalance(account),'ETH balance'),withTimeout(token.balanceOf(account),'Token balance')]);ethBalance=eth;tokenBalance=tok;$('walletEthBalance').textContent=fmt(eth)+' ETH';$('walletTokenBalance').textContent=fmt(tok,decimals)+' '+$('tokenSymbol').textContent;$('walletNetworkNote').textContent='Live balances from Robinhood Chain Testnet. Gas is paid in ETH.';}catch(e){$('walletEthBalance').textContent='Balance unavailable';$('walletTokenBalance').textContent='Balance unavailable';$('walletNetworkNote').textContent=e.message||'Could not read wallet balances.';}
}
async function connect(){
 const p=wallet();if(!p)throw Error('Open PIXORUN in MetaMask or Bitget Wallet browser.');
 const a=await p.request({method:'eth_requestAccounts'});if(!a?.length)throw Error('Wallet connection was not approved.');
 account=ethers.getAddress(a[0]);const chain=(await p.request({method:'eth_chainId'})).toLowerCase();
 $('tokenConnect').textContent=account.slice(0,6)+'…'+account.slice(-4);
 $('walletNetworkNote').textContent=chain===CHAIN?'Wallet connected to Robinhood Chain Testnet.':'Wallet connected on another network. Switch to Robinhood Chain Testnet when trading.';
 await refreshBalances();renderHolderRows();return account;
}
async function readConnectedWallet(){
 const p=wallet();if(!p)return;
 try{const [a,chain]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);account=a?.[0]?ethers.getAddress(a[0]):null;if(account){$('tokenConnect').textContent=account.slice(0,6)+'…'+account.slice(-4);$('walletNetworkNote').textContent=chain.toLowerCase()===CHAIN?'Connected · Robinhood Chain Testnet':'Connected · wrong network; switch only when you trade.';await refreshBalances();renderHolderRows();}else{$('tokenConnect').textContent='Connect wallet';renderHolderRows();$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';}}catch(e){console.warn('Wallet state unavailable',e);}
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
function showCreatorDetails(m){
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value||'Not provided';};
 const link=(id,url,label)=>{const el=$(id);if(!el)return;if(url){el.href=url;el.textContent=label||url;el.hidden=false;}else{el.removeAttribute('href');el.textContent='Not provided';}};
 if(!m){set('launchCreator','Creator record unavailable');return;}
 const creator=m.creator_address||'';
 link('launchCreator',creator?EXPLORER+'/address/'+creator:null,creator);
 set('launchCreatedAt',m.created_at?new Date(m.created_at).toLocaleString():'Not provided');
 link('launchTx',m.tx_hash?EXPLORER+'/tx/'+m.tx_hash:null,m.tx_hash||null);
 set('launchDescription',m.description||'Not provided');
 set('launchLogoStatus',m.image_url?'Uploaded':'Not provided');
 set('launchBannerStatus',m.banner_url?'Uploaded':'Not provided');
 link('launchWebsite',m.website_url,m.website_url||null);
 link('launchX',m.x_url,m.x_url||null);
 link('launchTelegram',m.telegram_url,m.telegram_url||null);
}
async function loadMetadata(){try{if(window.PIXORUN_REGISTRY){const row=await window.PIXORUN_REGISTRY.getLaunch(tokenAddress);showMetadata(row);showCreatorDetails(row);}}catch(e){console.warn('Token metadata could not be loaded',e);}}
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
function marketFmt(n,max=8){const value=Number(n);return Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:max}):'—';}
function marketText(id,value){const el=$(id);if(el)el.textContent=value;}
let marketTimeframe=300,marketChartPoints=[],marketChart=null,marketCandleSeries=null,marketVolumeSeries=null,marketChartReady=false,marketChartHasFitted=false;
function buildMarketCandles(points){
 const buckets=new Map();
 points.filter(p=>Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.time)).sort((a,b)=>a.time-b.time).forEach(p=>{
  const t=Math.floor(p.time/marketTimeframe)*marketTimeframe;
  if(!buckets.has(t))buckets.set(t,{time:t,open:p.price,high:p.price,low:p.price,close:p.price,volume:0});
  const c=buckets.get(t);c.high=Math.max(c.high,p.price);c.low=Math.min(c.low,p.price);c.close=p.price;c.volume+=Math.max(0,Number(p.volume)||0);
 });
 const actual=[...buckets.values()].sort((a,b)=>a.time-b.time);
 if(!actual.length)return {candles:[],volumes:[]};
 // Standard no-trade bars carry the previous close and have zero volume.
 const rows=[];let previous=actual[0].open,idx=0;
 for(let t=actual[0].time;t<=actual[actual.length-1].time;t+=marketTimeframe){
  const c=actual[idx];
  if(c&&c.time===t){rows.push(c);previous=c.close;idx++;}
  else rows.push({time:t,open:previous,high:previous,low:previous,close:previous,volume:0});
 }
 return {
  candles:rows.map(({time,open,high,low,close})=>({time,open,high,low,close})),
  volumes:rows.map(c=>({time:c.time,value:c.volume,color:c.close>=c.open?'rgba(22,163,112,.38)':'rgba(220,72,100,.38)'}))
 };
}
function updateMarketOhlc(param){
 const box=$('marketOhlc');if(!box)return;
 const candle=param?.seriesData?.get(marketCandleSeries);
 if(!candle){box.innerHTML='<span>O <b>—</b></span><span>H <b>—</b></span><span>L <b>—</b></span><span>C <b>—</b></span><span>VOL <b>—</b></span>';return;}
 const volume=param.seriesData.get(marketVolumeSeries);
 const fmt=v=>marketFmt(Number(v),12);
 const cls=candle.close>=candle.open?'up':'down';
 box.innerHTML='<span>O <b>'+fmt(candle.open)+'</b></span><span>H <b>'+fmt(candle.high)+'</b></span><span>L <b>'+fmt(candle.low)+'</b></span><span>C <b class="'+cls+'">'+fmt(candle.close)+'</b></span><span>VOL <b>'+(volume?marketFmt(volume.value,5):'0')+' ETH</b></span>';
}
function initMarketChart(){
 const host=$('marketChart');if(!host||!window.LightweightCharts)return false;
 host.innerHTML='';
 const chartHeight=Math.max(260,host.clientHeight||390);
 marketChart=window.LightweightCharts.createChart(host,{
  width:host.clientWidth||800,height:chartHeight,
  layout:{background:{type:'solid',color:'#ffffff'},textColor:'#715b8c',fontFamily:'Inter,system-ui,sans-serif',fontSize:12},
  grid:{vertLines:{color:'#f1ebf8'},horzLines:{color:'#f1ebf8'}},
  crosshair:{mode:window.LightweightCharts.CrosshairMode.Normal,vertLine:{color:'#9872c7',width:1,style:2,labelBackgroundColor:'#7040b5'},horzLine:{color:'#9872c7',width:1,style:2,labelBackgroundColor:'#7040b5'}},
  rightPriceScale:{borderColor:'#e8def2',scaleMargins:{top:.08,bottom:.24},entireTextOnly:true},
  timeScale:{borderColor:'#e8def2',timeVisible:true,secondsVisible:false,rightOffset:6,barSpacing:9},
  localization:{priceFormatter:p=>marketFmt(p,12)}
 });
 marketCandleSeries=marketChart.addCandlestickSeries({
  upColor:'#16a36f',downColor:'#dc4864',borderUpColor:'#16a36f',borderDownColor:'#dc4864',
  wickUpColor:'#16a36f',wickDownColor:'#dc4864',priceLineVisible:true,lastValueVisible:true
 });
 marketVolumeSeries=marketChart.addHistogramSeries({
  priceFormat:{type:'volume'},priceScaleId:'volume',
  scaleMargins:{top:.82,bottom:0},lastValueVisible:false,priceLineVisible:false
 });
 marketChart.priceScale('volume').applyOptions({scaleMargins:{top:.82,bottom:0},visible:false});
 marketChart.subscribeCrosshairMove(updateMarketOhlc);
 marketChartReady=true;
 if(window.ResizeObserver){new ResizeObserver(entries=>{for(const e of entries){if(marketChart)marketChart.applyOptions({width:Math.max(300,Math.floor(e.contentRect.width)),height:Math.max(260,Math.floor(e.contentRect.height))});}}).observe(host);}
 return true;
}
function drawMarketChart(points){
 marketChartPoints=points||[];
 const host=$('marketChart');if(!host)return;
 if(!window.LightweightCharts){host.textContent='Loading professional chart…';return;}
 if(!marketChartReady&&!initMarketChart())return;
 const {candles,volumes}=buildMarketCandles(marketChartPoints);
 if(!candles.length){
  marketCandleSeries.setData([]);marketVolumeSeries.setData([]);
  marketText('marketChartRange','Waiting for confirmed trades');updateMarketOhlc(null);
  return;
 }
 marketCandleSeries.setData(candles);marketVolumeSeries.setData(volumes);
 if(!marketChartHasFitted){marketChart.timeScale().fitContent();marketChartHasFitted=true;}
 marketText('marketChartRange',candles.length+' candles · '+({300:'5 minutes',900:'15 minutes',3600:'1 hour',14400:'4 hours',86400:'1 day'}[marketTimeframe]||'timeframe'));
 updateMarketOhlc({seriesData:new Map([[marketCandleSeries,candles[candles.length-1]],[marketVolumeSeries,volumes[volumes.length-1]]])});
}
$('marketChartFit')?.addEventListener('click',()=>{if(marketChart){marketChart.timeScale().fitContent();marketChart.priceScale('right').applyOptions({autoScale:true});}});
document.querySelectorAll('[data-chart-range]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-chart-range]').forEach(b=>b.classList.toggle('active',b===button));
 marketTimeframe=Number(button.dataset.chartRange)||300;marketChartHasFitted=false;drawMarketChart(marketChartPoints);
}));
async function syncConfirmedTrade(tx){
 try{
  marketText('marketUpdated','Trade confirmed · syncing now…');
  const result=await window.PIXORUN_REGISTRY.syncTrade(tokenAddress,tx.hash);
  await loadMarketData();
  marketText('marketUpdated','Live · block '+(result.block||'confirmed')+' · '+new Date().toLocaleTimeString());
 }catch(e){console.warn('Instant market sync failed; background indexer will retry:',e);marketText('marketUpdated','Trade confirmed · indexer syncing');}
}
async function findBlockAtOrAfter(target,latest){let lo=0,hi=latest;while(lo<hi){const mid=Math.floor((lo+hi)/2),b=await withTimeout(provider.getBlock(mid),'Block timestamp');if(!b)throw Error('Could not read block timestamp.');if(Number(b.timestamp)<target)lo=mid+1;else hi=mid;}return lo;}
async function loadMarketData(){
 const marketCacheKey='pixorun:market:v2:'+tokenAddress.toLowerCase();
 const num=(v,d=6)=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:d});
 const render=(data,label)=>{
  const snap=data?.snapshot;if(!snap)return false;
  const trades=[...(data.trades||[])].sort((a,b)=>{const ta=Date.parse(a.block_timestamp)||0,tb=Date.parse(b.block_timestamp)||0;return ta-tb||Number(a.block_number||0)-Number(b.block_number||0)||Number(a.log_index||0)-Number(b.log_index||0);});
  const points=trades.map(t=>({price:Number(t.price_native),time:Math.floor(new Date(t.block_timestamp).getTime()/1000),volume:Number(t.native_amount)||0})).filter(t=>Number.isFinite(t.price)&&t.price>0);
  marketText('marketPrice',Number(snap.price_native)>0?num(snap.price_native,12)+' ETH':'—');
  marketText('marketCap',Number(snap.market_cap_native)>0?num(snap.market_cap_native,5)+' ETH':'—');
   marketText('marketChartCap','Market Cap: '+(Number(snap.market_cap_native)>0?num(snap.market_cap_native,5)+' ETH':'—'));
  marketText('marketLiquidity',num(snap.liquidity_native,18)+' ETH + '+num(snap.liquidity_token,0)+' tokens');
  marketText('marketVolume',num(snap.volume_24h_native,5)+' ETH');
  marketText('marketChange',snap.price_change_24h===null?'—':(Number(snap.price_change_24h)>=0?'+':'')+num(snap.price_change_24h,2)+'%');
  marketText('marketTrades',String(snap.trades_24h??0));
  marketText('marketHolders',snap.holder_count===null||snap.holder_count===undefined?'Indexing…':Number(snap.holder_count).toLocaleString('en-US'));
  marketText('marketUpdated',label+' · '+new Date(snap.data_updated_at||Date.now()).toLocaleTimeString());
  drawMarketChart(points);
  marketText('marketTradeCount',String(snap.trades_24h??0)+' trades in 24h');
  const host=$('marketRecentTrades'),rows=trades.slice(-8).reverse();
  if(host)host.innerHTML=rows.length?rows.map(t=>'<div class="market-trade-row"><strong class="'+(t.side==='Buy'?'market-buy':'market-sell')+'">'+t.side+'</strong><span>'+num(t.token_amount,3)+' tokens · '+num(t.native_amount,6)+' ETH</span><a href="'+EXPLORER+'/tx/'+t.tx_hash+'" target="_blank" rel="noopener noreferrer">View tx ↗</a></div>').join(''):'<p class="trade-help">No confirmed trades in the last 24 hours.</p>';
  marketText('marketDataNote','Robinhood Chain Testnet · verified confirmed on-chain trades · block '+(snap.indexed_block??'—')+'.');
  return true;
 };
 // Paint the last known snapshot immediately, before waiting for the network.
 try{
  const cached=JSON.parse(localStorage.getItem(marketCacheKey)||'null');
  if(cached?.data)render(cached.data,'Saved snapshot');
  else {
   const legacy=JSON.parse(localStorage.getItem('pixorun:market:v1:'+tokenAddress.toLowerCase())||'null');
   if(legacy&&Date.now()-legacy.savedAt<86400000){
    marketText('marketPrice',legacy.price||'—');marketText('marketCap',legacy.cap||'—');marketText('marketLiquidity',legacy.liquidity||'—');
    marketText('marketVolume',legacy.volume||'—');marketText('marketChange',legacy.change||'—');marketText('marketTrades',legacy.trades||'—');
    marketText('marketUpdated','Saved cache · refreshing market data');drawMarketChart(legacy.points||[]);
    marketText('marketTradeCount',legacy.tradeCount||'');const host=$('marketRecentTrades');if(host)host.innerHTML=legacy.rows||'';
   }
  }
 }catch(_){}
 marketText('marketUpdated',$('marketPrice')?.textContent&&$('marketPrice').textContent!=='—'?'Refreshing…':'Loading saved market data…');
 try{
  if(!window.PIXORUN_REGISTRY?.getMarketData)throw Error('Market data service unavailable');
  const data=await window.PIXORUN_REGISTRY.getMarketData(tokenAddress);
  if(data?.snapshot){
   render(data,'Live market data');
   try{localStorage.setItem(marketCacheKey,JSON.stringify({savedAt:Date.now(),data}));}catch(_){}
  }else if(!$('marketPrice')?.textContent||$('marketPrice').textContent==='—'){
   marketText('marketUpdated','Waiting for first indexed snapshot');
   marketText('marketDataNote','Market data will appear as soon as the Robinhood Chain indexer stores the first snapshot. No RPC history scan is run in the browser.');
   const host=$('marketRecentTrades');if(host)host.innerHTML='<p class="trade-help">No indexed trades yet.</p>';
  }
 }catch(e){
  console.warn('Market data read failed:',e);
  if(!$('marketPrice')?.textContent||$('marketPrice').textContent==='—'){
   marketText('marketUpdated','Market data temporarily unavailable');
   marketText('marketDataNote','Market data is temporarily unavailable. Refresh to retry; the page will not run a slow RPC history scan.');
  }
 }
}

function holderPct(raw){
 const supply=Number(ethers.formatUnits(totalSupplyRaw||0n,decimals));
 const balance=Number(ethers.formatUnits(BigInt(raw||0),decimals));
 return supply>0?(balance/supply)*100:0;
}
function holderPctText(value){return value>0&&value<0.0001?'<0.0001%':value.toLocaleString('en-US',{maximumFractionDigits:4})+'%';}
function holderSummary(){
 const top10=holderRows.slice(0,10).reduce((s,r)=>s+holderPct(r.balance_raw),0);
 const top50=holderRows.slice(0,50).reduce((s,r)=>s+holderPct(r.balance_raw),0);
 holderTop10=top10;holderTop50=top50;
 marketText('holdersTop10',holderRows.length>=Math.min(10,holderCount)?holderPctText(top10):'—');
 marketText('holdersTop50',holderRows.length>=Math.min(50,holderCount)?holderPctText(top50):'—');
}
function renderHolderRows(){
 const host=$('holdersTableHost');if(!host)return;
 if(!holderRows.length){host.innerHTML='<div class="holders-empty">No positive-balance holders found.</div>';return;}
 const rows=holderRows.filter(h=>ethers.isAddress(String(h.wallet_address||''))).map((h,i)=>{
  const address=ethers.getAddress(String(h.wallet_address)).toLowerCase();
  const pct=holderPct(h.balance_raw),you=account&&address===account.toLowerCase();
  const amount=fmt(BigInt(h.balance_raw||0),decimals);
  const symbol=String($('tokenSymbol')?.textContent||'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  const rank=i+1;
  return '<tr><td><span class="holders-rank '+(rank<=3?'top':'')+'">'+rank+'</span></td><td><a class="holders-wallet" href="'+EXPLORER+'/address/'+address+'" target="_blank" rel="noopener noreferrer">'+address.slice(0,6)+'…'+address.slice(-4)+' ↗</a> <button class="holders-copy" type="button" data-holder-copy="'+address+'" aria-label="Copy wallet address">Copy</button> '+(you?'<span class="holders-you">YOU</span>':'')+'</td><td class="holders-balance">'+amount+' '+symbol+'</td><td><div class="holders-share"><span>'+holderPctText(pct)+'</span><span class="holders-bar"><i style="width:'+Math.min(100,pct)+'%"></i></span></div></td></tr>';
 }).join('');
 host.innerHTML='<table class="holders-table"><thead><tr><th>Rank</th><th>Wallet</th><th>Token balance</th><th>Supply share</th></tr></thead><tbody>'+rows+'</tbody></table>';
 holderSummary();
}
async function loadTopHolders(reset=false){
 if(holderLoading||!tokenAddress||!window.PIXORUN_REGISTRY?.getTopHolders)return;
 holderLoading=true;const button=$('holdersMore');if(button)button.disabled=true;
 if(reset){holderRows=[];holderOffset=0;holderCount=0;marketText('holdersStatus','Checking index…');marketText('holdersTotal','—');marketText('holdersTop10','—');marketText('holdersTop50','—');if($('holdersTableHost'))$('holdersTableHost').innerHTML='<div class="holders-state">Loading verified holder balances…</div>';}
 try{
  const result=await window.PIXORUN_REGISTRY.getTopHolders(tokenAddress,holderOffset,50);
  if(!result.complete){marketText('holdersStatus','Indexing');marketText('holdersTotal','Indexing…');marketText('holdersTop10','—');marketText('holdersTop50','—');if($('holdersTableHost'))$('holdersTableHost').innerHTML='<div class="holders-state">Holder indexing is still in progress. The list will appear when the full token transfer history has been indexed.</div>';if(button)button.hidden=true;return;}
  holderCount=Number(result.holderCount||0);holderRows=reset?[...(result.holders||[])]:holderRows.concat(result.holders||[]);holderOffset=holderRows.length;
  marketText('holdersTotal',holderCount.toLocaleString('en-US'));marketText('holdersStatus','Verified on-chain');renderHolderRows();
  if(button){button.hidden=!result.hasMore;button.textContent='Load more holders · '+Math.max(0,holderCount-holderOffset).toLocaleString('en-US')+' remaining';}
  if(!holderCount){if($('holdersTableHost'))$('holdersTableHost').innerHTML='<div class="holders-empty">No holders with a positive token balance yet.</div>';marketText('holdersStatus','No holders yet');}
 }catch(e){console.warn('Holder list unavailable:',e);marketText('holdersStatus','Temporarily unavailable');if($('holdersTableHost')&&reset)$('holdersTableHost').innerHTML='<div class="holders-state">Could not load holder balances. Tap Retry or refresh this page.</div>';}
 finally{holderLoading=false;if(button)button.disabled=false;}
}
$('holdersMore')?.addEventListener('click',()=>loadTopHolders(false));
$('holdersTableHost')?.addEventListener('click',async event=>{
 const button=event.target.closest('[data-holder-copy]');if(!button)return;
 const address=button.getAttribute('data-holder-copy');try{await navigator.clipboard.writeText(address);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1300);}catch(_){button.textContent='Copy unavailable';setTimeout(()=>button.textContent='Copy',1300);}
});
async function refresh(){
 if(!tokenAddress||!ethers.isAddress(tokenAddress))throw Error('Token address is missing or invalid. Open this page from Explore Missions.');
 setStatus('Reading PIXORUN Factory on Robinhood Testnet…');
 const factory=new ethers.Contract(FACTORY,factoryAbi,provider);
 curveAddress=await withTimeout(factory.curveOf(tokenAddress),'Factory lookup');
 if(curveAddress===ethers.ZeroAddress)throw Error('This address is not registered in the PIXORUN Launchpad Factory.');
 token=new ethers.Contract(tokenAddress,tokenAbi,provider);curve=new ethers.Contract(curveAddress,curveAbi,provider);
 const swapFactory=new ethers.Contract(SWAP_FACTORY,swapFactoryAbi,provider);
 setStatus('Factory found · loading token and market data…');
 const [name,symbol,tokenDecimals,supply,creator,done,graduatedState,pairAddr]=await withTimeout(Promise.all([token.name(),token.symbol(),token.decimals(),token.totalSupply(),factory.creatorOf(tokenAddress),factory.liftoffCompleted(tokenAddress),curve.graduated(),swapFactory.getPair(tokenAddress)]),'Token data read');decimals=Number(tokenDecimals);totalSupplyRaw=supply;
 graduated=done||graduatedState;pairAddress=pairAddr;mode=graduated&&pairAddr!==ethers.ZeroAddress?'swap':'curve';
 $('tokenName').textContent=name;$('tokenSymbol').textContent=symbol;$('sellTicker').textContent=symbol;$('walletTokenLabel').textContent=symbol+' balance';$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;
 $('curveAddress').textContent=curveAddress;$('curveAddress').href=EXPLORER+'/address/'+curveAddress;
 $('creatorAddress').textContent=creator;$('creatorAddress').href=EXPLORER+'/address/'+creator;
 $('totalSupply').textContent=fmt(supply,decimals)+' '+symbol;
 $('tradeMode').textContent=mode==='swap'?'PIXORUN Swap pool':'Bonding curve';
 if(mode==='swap'){$('pairAddress').textContent=pairAddress;$('pairAddress').href=EXPLORER+'/address/'+pairAddress;pair=new ethers.Contract(pairAddress,pairAbi,provider);$('graduationNote').textContent='This token completed Liftoff. Trading uses its PIXORUN Swap pool.';}
 else {$('pairAddress').textContent='Not created yet';$('graduationNote').textContent='This token is still on its bonding curve. When the curve sells out, Liftoff seeds the PIXORUN Swap pool atomically.';}
 $('graduationNote').hidden=false;
 try{localStorage.setItem(cacheKey,JSON.stringify({name,symbol,creator,curveAddress,totalSupply:fmt(supply,decimals)+' '+symbol,tradeMode:mode==='swap'?'PIXORUN Swap pool':'Bonding curve'}));}catch(_){}
 const tradeDisabled=graduated&&mode!=='swap';canTrade=!tradeDisabled;$('buyBtn').disabled=tradeDisabled;$('sellBtn').disabled=tradeDisabled;
 if(tradeDisabled)setStatus('Liftoff completed, but the Swap pair is not available. Trading is paused until a pool is found.');
 else setStatus('Token loaded · enter an amount to see the exact on-chain fee quote.');
 await Promise.all([quoteBuy(),quoteSell(),loadMetadata(),loadTopHolders(true)]);

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
  setStatus('Confirm the buy in your wallet. The quote is protected by '+slippage()+'% slippage.');
  const tx=mode==='curve'?await contract.buy(minOut,{value:amount,gasLimit:gas*12n/10n}):await contract.swapNativeForToken(minOut,{value:amount,gasLimit:gas*12n/10n});setStatus('Buy submitted: '+tx.hash);await tx.wait();
  setStatus('Buy confirmed on Robinhood Chain Testnet.');await syncConfirmedTrade(tx);await refresh();
 }catch(e){setStatus(e.shortMessage||e.reason||e.message||'Buy failed.');}finally{busy=false;$('buyBtn').disabled=!canTrade;}
}
async function sell(){
 if(busy)return;busy=true;$('sellBtn').disabled=true;
 try{
  if(!account)await connect();await ensureNetwork();
  const amount=ethers.parseUnits($('sellAmount').value||'0',decimals);if(amount<=0n)throw Error('Enter a token amount greater than zero.');
  const currentBalance=await token.balanceOf(account);if(amount>currentBalance)throw Error('You do not have enough '+$('tokenSymbol').textContent+' for this sell.');
  const spender=mode==='curve'?curveAddress:pairAddress;
  const signer=await new ethers.BrowserProvider(wallet()).getSigner(),signedToken=token.connect(signer),allowance=await token.allowance(account,spender);
  if(allowance<amount){setStatus('Approve the exact token amount in your wallet…');const approval=await signedToken.approve(spender,amount);await approval.wait();}
  let minOut,contract;
  if(mode==='curve'){const q=await curve.quoteSell(amount);minOut=minAfterSlippage(q[2]);contract=new ethers.Contract(curveAddress,curveAbi,signer);}
  else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const gross=amount*rn/(rt+amount),out=gross-gross*100n/10000n;minOut=minAfterSlippage(out);contract=new ethers.Contract(pairAddress,pairAbi,signer);}
  setStatus('Confirm the sell in your wallet. The minimum receive amount includes '+slippage()+'% slippage protection.');
  const tx=mode==='curve'?await contract.sell(amount,minOut):await contract.swapTokenForNative(amount,minOut);
  setStatus('Sell submitted: '+tx.hash);await tx.wait();setStatus('Sell confirmed on Robinhood Chain Testnet.');await syncConfirmedTrade(tx);await refresh();
 }catch(e){setStatus(e.shortMessage||e.reason||e.message||'Sell failed.');}finally{busy=false;$('sellBtn').disabled=!canTrade;}
}
$('buyAmount')?.addEventListener('input',quoteBuy);$('sellAmount')?.addEventListener('input',quoteSell);$('slippage')?.addEventListener('change',()=>{quoteBuy();quoteSell();});
$('buyBtn')?.addEventListener('click',buy);$('sellBtn')?.addEventListener('click',sell);
$('tokenConnect')?.addEventListener('click',async()=>{try{await connect();setStatus('Wallet connected. Balances refreshed.');}catch(e){setStatus(e.shortMessage||e.message||'Wallet connection failed.');}});
$('buyMax')?.addEventListener('click',()=>setTradePercent('buy',100).catch(e=>setStatus(e.shortMessage||e.message||'Could not read ETH balance.')));
$('sellMax')?.addEventListener('click',()=>setTradePercent('sell',100).catch(e=>setStatus(e.shortMessage||e.message||'Could not read token balance.')));
document.querySelectorAll('[data-trade-side][data-trade-percent]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await setTradePercent(button.dataset.tradeSide,Number(button.dataset.tradePercent));}catch(e){setStatus(e.shortMessage||e.reason||e.message||'Could not calculate percentage.');}finally{button.disabled=false;}}));
const retry=$('tokenRetry');if(retry)retry.addEventListener('click',()=>{retry.disabled=true;refresh().catch(e=>setStatus('Load failed: '+(e.shortMessage||e.reason||e.message||'RPC error'))).finally(()=>retry.disabled=false);});
const p=wallet();p?.on?.('accountsChanged',async a=>{account=a?.[0]?ethers.getAddress(a[0]):null;$('buyAmount').value='';$('sellAmount').value='';await readConnectedWallet();await quoteBuy();await quoteSell();});
p?.on?.('chainChanged',async()=>{await readConnectedWallet();});
setStatus(cached?'Showing saved token details · checking the blockchain…':'Starting token data request…');
loadMarketData().catch(e=>console.warn('Market data unavailable:',e));
setInterval(()=>loadMarketData().catch(e=>console.warn('Market refresh failed:',e)),5000);
refresh().then(readConnectedWallet).catch(e=>{console.error('PIXORUN token load failed:',e);setStatus('Could not load token: '+(e.shortMessage||e.reason||e.message||'RPC error')+'. Tap Retry.');});
})();
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
let token,curve,pair,curveAddress,pairAddress,decimals=18,graduated=false,mode='curve',busy=false,account=null,canTrade=false,tokenBalance=0n,ethBalance=0n;
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
 await refreshBalances();return account;
}
async function readConnectedWallet(){
 const p=wallet();if(!p)return;
 try{const [a,chain]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);account=a?.[0]?ethers.getAddress(a[0]):null;if(account){$('tokenConnect').textContent=account.slice(0,6)+'…'+account.slice(-4);$('walletNetworkNote').textContent=chain.toLowerCase()===CHAIN?'Connected · Robinhood Chain Testnet':'Connected · wrong network; switch only when you trade.';await refreshBalances();}else{$('tokenConnect').textContent='Connect wallet';$('walletEthBalance').textContent='Not connected';$('walletTokenBalance').textContent='Not connected';}}catch(e){console.warn('Wallet state unavailable',e);}
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
async function loadMetadata(){try{if(window.PIXORUN_REGISTRY){const row=await window.PIXORUN_REGISTRY.getLaunch(tokenAddress);showMetadata(row);}}catch(e){console.warn('Token metadata could not be loaded',e);}}
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
const marketFmt=(n,max=6)=>Number(n).toLocaleString('en-US',{maximumFractionDigits:max});
function marketText(id,value){const el=$(id);if(el)el.textContent=value;}
function drawMarketChart(points){
 const host=$('marketChart');if(!host)return;
 if(points.length<2){host.innerHTML='<p class="trade-help" style="padding:14px">Not enough confirmed trades in the last 24 hours to draw a chart.</p>';return;}
 const vals=points.map(p=>p.price).filter(Number.isFinite);if(vals.length<2){host.textContent='Chart unavailable';return;}
 const min=Math.min(...vals),max=Math.max(...vals),range=max-min||Math.max(max*0.01,1e-12);
 const coords=points.map((p,i)=>{const x=12+i*976/Math.max(1,points.length-1),y=164-(p.price-min)/range*145;return x.toFixed(1)+','+y.toFixed(1)}).join(' ');
 host.innerHTML='<svg viewBox="0 0 1000 180" preserveAspectRatio="none" role="img" aria-label="Price chart from confirmed on-chain trades"><polyline points="'+coords+'" fill="none" stroke="#a78bfa" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
async function findBlockAtOrAfter(target,latest){let lo=0,hi=latest;while(lo<hi){const mid=Math.floor((lo+hi)/2),b=await withTimeout(provider.getBlock(mid),'Block timestamp');if(!b)throw Error('Could not read block timestamp.');if(Number(b.timestamp)<target)lo=mid+1;else hi=mid;}return lo;}
async function loadMarketData(){
 const marketCacheKey='pixorun:market:v1:'+tokenAddress.toLowerCase();
 try{
  const saved=JSON.parse(localStorage.getItem(marketCacheKey)||'null');
  if(saved&&Date.now()-saved.savedAt<120000){
   marketText('marketPrice',saved.price);marketText('marketCap',saved.cap);marketText('marketLiquidity',saved.liquidity);
   marketText('marketVolume',saved.volume);marketText('marketChange',saved.change);marketText('marketTrades',saved.trades);
   marketText('marketUpdated','Cached · '+new Date(saved.savedAt).toLocaleTimeString());
   drawMarketChart(saved.points||[]);
   marketText('marketTradeCount',saved.tradeCount);
   const cachedHost=$('marketRecentTrades');if(cachedHost)cachedHost.innerHTML=saved.rows||'<p class="trade-help">No confirmed trades in the last 24 hours.</p>';
   marketText('marketDataNote','Cached Robinhood Chain data · refreshes automatically.');return;
  }
 }catch(_){}
 const latest=await withTimeout(provider.getBlockNumber(),'Latest block',8000);
 let price=0,liquidity='—',reserveEth=0,reserveToken=0;
 if(mode==='curve'){
  const [rn,rt,realN,realT]=await Promise.all([curve.virtualNative(),curve.virtualToken(),curve.realNative(),curve.realToken()]);
  reserveEth=Number(ethers.formatEther(realN));reserveToken=Number(ethers.formatUnits(realT,decimals));
  if(rt>0n&&rn>0n)price=Number(ethers.formatEther(rn))/Number(ethers.formatUnits(rt,decimals));
  liquidity=marketFmt(reserveEth,5)+' ETH + '+marketFmt(reserveToken,0)+' tokens (curve reserves)';
 }else{
  const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);
  reserveEth=Number(ethers.formatEther(rn));reserveToken=Number(ethers.formatUnits(rt,decimals));
  if(rt>0n)price=Number(ethers.formatEther(rn))/Number(ethers.formatUnits(rt,decimals));
  liquidity=marketFmt(reserveEth,5)+' ETH + '+marketFmt(reserveToken,0)+' tokens (pool reserves)';
 }
 const supply=await token.totalSupply(),mcap=price*Number(ethers.formatUnits(supply,decimals));
 marketText('marketPrice',price>0?marketFmt(price,12)+' ETH':'—');
 marketText('marketCap',price>0?marketFmt(mcap,5)+' ETH':'—');
 marketText('marketLiquidity',liquidity);
 // Scan a bounded recent window; all prices and volume below come from actual emitted swap events.
 const fromBlock=await findBlockAtOrAfter(Math.floor(Date.now()/1000)-86400,latest),logs=[];
 const topics=[curveEvents.getEvent('Bought').topicHash,curveEvents.getEvent('Sold').topicHash,pairEvents.getEvent('Swap').topicHash];
 for(let start=fromBlock;start<=latest;start+=1000){
  const end=Math.min(latest,start+999);
  const [a,b]=await Promise.all([
   withTimeout(provider.getLogs({address:curveAddress,fromBlock:start,toBlock:end,topics:[[topics[0],topics[1]]]}),'Curve event scan',10000),
   mode==='swap'?withTimeout(provider.getLogs({address:pairAddress,fromBlock:start,toBlock:end,topics:[topics[2]]}),'Swap event scan',10000):Promise.resolve([])
  ]);
  logs.push(...a,...b);
 }
 const decoded=logs.map(log=>{try{
  if(log.address.toLowerCase()===curveAddress.toLowerCase()){
   const p=curveEvents.parseLog(log);
   if(p.name==='Bought')return {type:'Buy',native:Number(ethers.formatEther(p.args.grossNative)),tokens:Number(ethers.formatUnits(p.args.tokensOut,decimals)),block:log.blockNumber,hash:log.transactionHash};
   return {type:'Sell',native:Number(ethers.formatEther(p.args.netNative)),tokens:Number(ethers.formatUnits(p.args.tokensIn,decimals)),block:log.blockNumber,hash:log.transactionHash};
  }
  const p=pairEvents.parseLog(log),buy=p.args.nativeToToken;
  return {type:buy?'Buy':'Sell',native:Number(ethers.formatEther(buy?p.args.amountIn:p.args.amountOut)),tokens:Number(ethers.formatUnits(buy?p.args.amountOut:p.args.amountIn,decimals)),block:log.blockNumber,hash:log.transactionHash};
 }catch(_){return null;}}).filter(Boolean);
 const blockNums=[...new Set(decoded.map(t=>t.block))],blockTimes={};let blockIndex=0;
 const timestampWorkers=Array.from({length:Math.min(8,blockNums.length)},async()=>{while(blockIndex<blockNums.length){const n=blockNums[blockIndex++];try{const b=await withTimeout(provider.getBlock(n),'Trade timestamp',8000);if(b)blockTimes[n]=Number(b.timestamp);}catch(_){}}});
 await Promise.all(timestampWorkers);
 const now=Math.floor(Date.now()/1000),recent=decoded.map(t=>({...t,time:blockTimes[t.block]||0,price:t.tokens>0?t.native/t.tokens:0})).filter(t=>t.time>=now-86400&&t.time>0).sort((a,b)=>a.time-b.time);
 const volume=recent.reduce((s,t)=>s+t.native,0),first=recent.find(t=>t.price>0),last=[...recent].reverse().find(t=>t.price>0);
 const change=first&&last&&first.price>0?(last.price/first.price-1)*100:null;
 marketText('marketVolume',marketFmt(volume,5)+' ETH');marketText('marketChange',change===null?'—':(change>=0?'+':'')+marketFmt(change,2)+'%');
 marketText('marketTrades',String(recent.length));marketText('marketUpdated','Updated '+new Date().toLocaleTimeString());
 drawMarketChart(recent.filter(t=>t.price>0));
 const rows=recent.slice(-8).reverse();marketText('marketTradeCount',recent.length+' trades');
 const host=$('marketRecentTrades');
 if(host)host.innerHTML=rows.length?rows.map(t=>'<div class="market-trade-row"><strong class="'+(t.type==='Buy'?'market-buy':'market-sell')+'">'+t.type+'</strong><span>'+marketFmt(t.tokens,3)+' tokens · '+marketFmt(t.native,6)+' ETH</span><a href="'+EXPLORER+'/tx/'+t.hash+'" target="_blank" rel="noopener noreferrer">View tx ↗</a></div>').join(''):'<p class="trade-help">No confirmed trades in the last 24 hours.</p>';
 marketText('marketDataNote','Robinhood Chain Testnet · confirmed curve and swap events · exact 24-hour window.');
 try{localStorage.setItem(marketCacheKey,JSON.stringify({savedAt:Date.now(),price:price>0?marketFmt(price,12)+' ETH':'—',cap:price>0?marketFmt(mcap,5)+' ETH':'—',liquidity,volume:marketFmt(volume,5)+' ETH',change:change===null?'—':(change>=0?'+':'')+marketFmt(change,2)+'%',trades:String(recent.length),points:recent.filter(t=>t.price>0),tradeCount:recent.length+' trades',rows:host?host.innerHTML:''}));}catch(_){}
}

async function refresh(){
 if(!tokenAddress||!ethers.isAddress(tokenAddress))throw Error('Token address is missing or invalid. Open this page from Explore Missions.');
 setStatus('Reading PIXORUN Factory on Robinhood Testnet…');
 const factory=new ethers.Contract(FACTORY,factoryAbi,provider);
 curveAddress=await withTimeout(factory.curveOf(tokenAddress),'Factory lookup');
 if(curveAddress===ethers.ZeroAddress)throw Error('This address is not registered in the PIXORUN Launchpad Factory.');
 token=new ethers.Contract(tokenAddress,tokenAbi,provider);curve=new ethers.Contract(curveAddress,curveAbi,provider);
 const swapFactory=new ethers.Contract(SWAP_FACTORY,swapFactoryAbi,provider);
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
 try{localStorage.setItem(cacheKey,JSON.stringify({name,symbol,creator,curveAddress,totalSupply:fmt(supply,decimals)+' '+symbol,tradeMode:mode==='swap'?'PIXORUN Swap pool':'Bonding curve'}));}catch(_){}
 const tradeDisabled=graduated&&mode!=='swap';canTrade=!tradeDisabled;$('buyBtn').disabled=tradeDisabled;$('sellBtn').disabled=tradeDisabled;
 if(tradeDisabled)setStatus('Liftoff completed, but the Swap pair is not available. Trading is paused until a pool is found.');
 else setStatus('Token loaded · enter an amount to see the exact on-chain fee quote.');
 await Promise.all([quoteBuy(),quoteSell(),loadMetadata()]);
 loadMarketData().catch(e=>{console.warn('Market data unavailable:',e);marketText('marketUpdated','Market data temporarily unavailable');marketText('marketDataNote','Robinhood Chain RPC is slow or rate-limited. Token details and trading remain available; tap Retry to refresh.');});
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
  setStatus('Buy confirmed on Robinhood Chain Testnet.');await refresh();
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
  setStatus('Sell submitted: '+tx.hash);await tx.wait();setStatus('Sell confirmed on Robinhood Chain Testnet.');await refresh();
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
refresh().then(readConnectedWallet).catch(e=>{console.error('PIXORUN token load failed:',e);setStatus('Could not load token: '+(e.shortMessage||e.reason||e.message||'RPC error')+'. Tap Retry.');});
})();
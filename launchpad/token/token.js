(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',SWAP_FACTORY='0xCC423d983E12f044F9F930463ADe7Ce150a8A644',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com',CHAIN='0xb626';
const factoryAbi=['function curveOf(address) view returns(address)','function creatorOf(address) view returns(address)','function liftoffCompleted(address) view returns(bool)'];
const tokenAbi=['function name() view returns(string)','function symbol() view returns(string)','function decimals() view returns(uint8)','function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
const curveAbi=['function graduated() view returns(bool)','function totalSold() view returns(uint256)','function realNative() view returns(uint256)','function realToken() view returns(uint256)','function quoteBuy(uint256) view returns(uint256,uint256,uint256)','function quoteSell(uint256) view returns(uint256,uint256,uint256)','function buy(uint256) payable returns(uint256)','function sell(uint256,uint256) returns(uint256)'];
const swapFactoryAbi=['function getPair(address) view returns(address)'];
const pairAbi=['function reserveNative() view returns(uint112)','function reserveToken() view returns(uint112)','function swapNativeForToken(uint256) payable returns(uint256)','function swapTokenForNative(uint256,uint256) returns(uint256)'];
const $=id=>document.getElementById(id),provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true,batchMaxCount:1});
const tokenAddress=new URLSearchParams(location.search).get('address');
const cacheKey=tokenAddress&&ethers.isAddress(tokenAddress)?'pixorun:token:v2:'+tokenAddress.toLowerCase():null;
let cached=null;try{cached=cacheKey?JSON.parse(localStorage.getItem(cacheKey)||'null'):null;}catch(_){}
if(cached){if($('tokenName'))$('tokenName').textContent=cached.name||'Token';if($('tokenSymbol'))$('tokenSymbol').textContent=cached.symbol||'—';if($('tokenAddress')){$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;}if($('curveAddress')&&cached.curveAddress){$('curveAddress').textContent=cached.curveAddress;$('curveAddress').href=EXPLORER+'/address/'+cached.curveAddress;}if($('creatorAddress')&&cached.creator){$('creatorAddress').textContent=cached.creator;$('creatorAddress').href=EXPLORER+'/address/'+cached.creator;}if($('totalSupply'))$('totalSupply').textContent=cached.totalSupply||'—';if($('tradeMode'))$('tradeMode').textContent=cached.tradeMode||'Refreshing market…';}
let token,curve,pair,curveAddress,pairAddress,decimals=18,graduated=false,mode='curve',busy=false,account=null,canTrade=false;
const withTimeout=(promise,label,ms=12000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(label+' timed out. Robinhood RPC did not respond.')),ms))]);
const fmt=(v,d=5)=>Number(ethers.formatUnits(v,d)).toLocaleString(undefined,{maximumFractionDigits:6});
const setStatus=m=>{if($('tradeStatus'))$('tradeStatus').textContent=m;};
function wallet(){return window.ethereum?.isMetaMask?window.ethereum:(window.bitkeep?.ethereum||window.ethereum);}
async function ensureNetwork(){const p=wallet();if(!p)throw Error('No compatible EVM wallet found.');let chain=(await p.request({method:'eth_chainId'})).toLowerCase();if(chain!==CHAIN){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}chain=(await p.request({method:'eth_chainId'})).toLowerCase();}if(chain!==CHAIN)throw Error('Switch to Robinhood Chain Testnet and try again.');}
async function connect(){
 const p=wallet();if(!p)throw Error('Open PIXORUN in MetaMask or Bitget Wallet browser.');
 const a=await p.request({method:'eth_requestAccounts'});if(!a?.length)throw Error('Wallet connection was not approved.');
 const chain=(await p.request({method:'eth_chainId'})).toLowerCase();if(chain!==CHAIN){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}}
 account=a[0];await refresh();return account;
}
function slippage(){return Number($('slippage')?.value||1);}
async function quoteBuy(){
 const value=$('buyAmount')?.value||'';if(!value||Number(value)<=0){$('buyQuote').textContent='Enter an ETH amount';return;}
 try{const amount=ethers.parseEther(value);let out;if(mode==='curve'){const q=await curve.quoteBuy(amount);out=q[0];$('buyFee').textContent=fmt(q[1])+' ETH fee';}else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const after=amount-amount*100n/10000n;out=after*rt/(rn+after);$('buyFee').textContent=fmt(amount*100n/10000n)+' ETH fee';}
 $('buyQuote').textContent='Estimated receive: '+fmt(out,decimals)+' '+$('tokenSymbol').textContent;
 }catch(e){$('buyQuote').textContent=e.shortMessage||e.reason||e.message||'Quote unavailable';}
}
async function quoteSell(){
 const value=$('sellAmount')?.value||'';if(!value||Number(value)<=0){$('sellQuote').textContent='Enter a token amount';return;}
 try{const amount=ethers.parseUnits(value,decimals);let out;if(mode==='curve'){const q=await curve.quoteSell(amount);out=q[2];$('sellFee').textContent=fmt(q[1])+' ETH fee';}else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const gross=amount*rn/(rt+amount);const fee=gross*100n/10000n;out=gross-fee;$('sellFee').textContent=fmt(fee)+' ETH fee';}
 $('sellQuote').textContent='Estimated receive: '+fmt(out)+' ETH';
 }catch(e){$('sellQuote').textContent=e.shortMessage||e.reason||e.message||'Quote unavailable';}
}
async function refresh(){
 account=null;
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
 $('tokenName').textContent=name;$('tokenSymbol').textContent=symbol;$('tokenAddress').textContent=tokenAddress;$('tokenAddress').href=EXPLORER+'/address/'+tokenAddress;
 $('curveAddress').textContent=curveAddress;$('curveAddress').href=EXPLORER+'/address/'+curveAddress;
 $('creatorAddress').textContent=creator;$('creatorAddress').href=EXPLORER+'/address/'+creator;
 $('totalSupply').textContent=fmt(supply,decimals)+' '+symbol;
 $('tradeMode').textContent=mode==='swap'?'PIXORUN Swap pool':'Bonding curve';
 if(mode==='swap'){$('pairAddress').textContent=pairAddress;$('pairAddress').href=EXPLORER+'/address/'+pairAddress;pair=new ethers.Contract(pairAddress,pairAbi,provider);$('graduationNote').textContent='This token completed Liftoff. Trading uses its PIXORUN Swap pool.';}
 else {$('pairAddress').textContent='Not created yet';$('graduationNote').textContent='This token is still on its bonding curve. When the curve sells out, Liftoff seeds the PIXORUN Swap pool atomically.';}
 $('graduationNote').hidden=false;
 try{localStorage.setItem(cacheKey,JSON.stringify({name,symbol,creator,curveAddress,totalSupply:fmt(supply,decimals)+' '+symbol,tradeMode:mode==='swap'?'PIXORUN Swap pool':'Bonding curve'}));}catch(_){}
 $('walletTokenBalance').textContent='Connect wallet to view';
 const tradeDisabled=graduated&&mode!=='swap';canTrade=!tradeDisabled;$('buyBtn').disabled=tradeDisabled;$('sellBtn').disabled=tradeDisabled;
 if(tradeDisabled)setStatus('Liftoff completed, but the Swap pair is not available. Trading is paused until a pool is found.');
 else setStatus('Token data loaded from Robinhood Chain Testnet. Select an amount to see a live quote.');
 setStatus('Token loaded · fetching live quotes…');
 await withTimeout(Promise.all([quoteBuy(),quoteSell()]),'Live quote refresh',12000);
}
async function buy(){
 if(busy)return;busy=true;$('buyBtn').disabled=true;
 try{if(!account)await connect();await ensureNetwork();const amount=ethers.parseEther($('buyAmount').value||'0');if(amount<=0n)throw Error('Enter an ETH amount greater than zero.');
 let minOut;if(mode==='curve'){const q=await curve.quoteBuy(amount);minOut=q[0]*BigInt(Math.floor((100-slippage())*100))/10000n;const c=new ethers.Contract(curveAddress,curveAbi,await new ethers.BrowserProvider(wallet()).getSigner());setStatus('Confirm the bonding-curve buy in your wallet…');const tx=await c.buy(minOut,{value:amount});setStatus('Buy submitted: '+tx.hash);await tx.wait();}
 else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const after=amount-amount*100n/10000n;const out=after*rt/(rn+after);minOut=out*BigInt(Math.floor((100-slippage())*100))/10000n;const c=new ethers.Contract(pairAddress,pairAbi,await new ethers.BrowserProvider(wallet()).getSigner());setStatus('Confirm the Swap buy in your wallet…');const tx=await c.swapNativeForToken(minOut,{value:amount});setStatus('Buy submitted: '+tx.hash);await tx.wait();}
 setStatus('Buy confirmed on Robinhood Chain Testnet.');await refresh();
 }catch(e){setStatus(e.shortMessage||e.reason||e.message||'Buy failed.');}finally{busy=false;$('buyBtn').disabled=!canTrade;}
}
async function sell(){
 if(busy)return;busy=true;$('sellBtn').disabled=true;
 try{if(!account)await connect();await ensureNetwork();const amount=ethers.parseUnits($('sellAmount').value||'0',decimals);if(amount<=0n)throw Error('Enter a token amount greater than zero.');
 let minOut,spender=mode==='curve'?curveAddress:pairAddress;
 if(mode==='curve'){const q=await curve.quoteSell(amount);minOut=q[2]*BigInt(Math.floor((100-slippage())*100))/10000n;}else{const [rn,rt]=await Promise.all([pair.reserveNative(),pair.reserveToken()]);const gross=amount*rn/(rt+amount),out=gross-gross*100n/10000n;minOut=out*BigInt(Math.floor((100-slippage())*100))/10000n;}
 const signer=await new ethers.BrowserProvider(wallet()).getSigner(),signedToken=token.connect(signer),allowance=await token.allowance(account,spender);
 if(allowance<amount){setStatus('Approve token spending in your wallet…');const approval=await signedToken.approve(spender,amount);await approval.wait();}
 const signed=mode==='curve'?new ethers.Contract(curveAddress,curveAbi,signer):new ethers.Contract(pairAddress,pairAbi,signer);
 setStatus('Confirm the token sell in your wallet…');const tx=mode==='curve'?await signed.sell(amount,minOut):await signed.swapTokenForNative(amount,minOut);
 setStatus('Sell submitted: '+tx.hash);await tx.wait();setStatus('Sell confirmed on Robinhood Chain Testnet.');await refresh();
 }catch(e){setStatus(e.shortMessage||e.reason||e.message||'Sell failed.');}finally{busy=false;$('sellBtn').disabled=!canTrade;}
}
$('buyAmount')?.addEventListener('input',quoteBuy);$('sellAmount')?.addEventListener('input',quoteSell);$('slippage')?.addEventListener('change',()=>{quoteBuy();quoteSell();});
$('buyBtn')?.addEventListener('click',buy);$('sellBtn')?.addEventListener('click',sell);
const retry=$('tokenRetry');if(retry)retry.addEventListener('click',()=>{retry.disabled=true;refresh().catch(e=>setStatus('Load failed: '+(e.shortMessage||e.reason||e.message||'RPC error'))).finally(()=>retry.disabled=false);});
setStatus(cached?'Showing saved token details · checking the blockchain…':'Starting token data request…');
refresh().catch(e=>{console.error('PIXORUN token load failed:',e);setStatus('Could not load token: '+(e.shortMessage||e.reason||e.message||'RPC error')+'. Tap Retry.');});
})();
(()=>{
'use strict';
const EXPLORER='https://explorer.testnet.chain.robinhood.com',$=id=>document.getElementById(id),status=$('profileLaunchStatusText');
function say(s){if(status)status.textContent=s;}
function wallet(){return window.PIXORUN_WALLET?.getProvider()||null;}
function shortAddress(a){return a?a.slice(0,6)+'…'+a.slice(-4):'—';}
function tokenCard(x,kind,balance){
 const card=document.createElement('article');card.className='profile-token-card';
 const top=document.createElement('div');top.className='profile-token-top';
 if(x.image_url){const img=document.createElement('img');img.className='profile-token-logo';img.src=x.image_url;img.alt=(x.token_name||'Token')+' logo';img.loading='lazy';img.onerror=()=>{const f=document.createElement('span');f.className='profile-token-fallback';f.textContent=(x.token_symbol||x.token_name||'P').slice(0,1).toUpperCase();img.replaceWith(f);};top.append(img);}
 else{const f=document.createElement('span');f.className='profile-token-fallback';f.textContent=(x.token_symbol||x.token_name||'P').slice(0,1).toUpperCase();top.append(f);}
 const name=document.createElement('div');name.className='profile-token-name';const title=document.createElement('strong');title.textContent=x.token_name||'PIXORUN Token';const symbol=document.createElement('small');symbol.textContent='$'+(x.token_symbol||'TOKEN')+' · '+(kind==='hold'?'HELD TOKEN':'YOUR LAUNCH');name.append(title,symbol);top.append(name);card.append(top);
 if(x.banner_url){const banner=document.createElement('img');banner.src=x.banner_url;banner.alt='';banner.loading='lazy';banner.style.cssText='width:100%;height:72px;object-fit:cover;border-radius:11px;margin-top:12px';card.append(banner);}
 const metric=document.createElement('div');metric.className='profile-token-balance';const label=document.createElement('small');label.textContent=kind==='hold'?'Your balance':'Contract address';const value=document.createElement('strong');value.textContent=kind==='hold'?formatTokenBalance(balance,x.token_decimals):shortAddress(x.token_address);metric.append(label,value);card.append(metric);
 if(x.description){const desc=document.createElement('p');desc.className='profile-token-description';desc.textContent=x.description;card.append(desc);}
 const actions=document.createElement('div');actions.className='profile-token-actions';const open=document.createElement('a');open.href='../token/?address='+encodeURIComponent(x.token_address);open.textContent='View token ↗';const explorer=document.createElement('a');explorer.href=EXPLORER+'/address/'+x.token_address;explorer.target='_blank';explorer.rel='noopener noreferrer';explorer.textContent='Explorer ↗';actions.append(open,explorer);card.append(actions);return card;
}
function formatTokenBalance(raw,decimals){try{const n=Number(ethers.formatUnits(raw,Number(decimals??18)));if(!Number.isFinite(n))return '—';return n.toLocaleString('en-US',{maximumFractionDigits:5})+' '+(currentSymbol||'');}catch(_){return '—';}}
let currentSymbol='';
function renderPortfolio(holds,launches){
 const holdHost=$('profileHolds'),launchHost=$('profileLaunches');holdHost.replaceChildren();launchHost.replaceChildren();
 $('profileHoldsCount').textContent=String(holds.length);$('profileLaunchCount').textContent=String(launches.length);
 if(!holds.length){const p=document.createElement('p');p.className='profile-empty';p.textContent='No PIXORUN tokens found in this wallet yet.';holdHost.append(p);}
 for(const item of holds){currentSymbol=item.token_symbol||'';holdHost.append(tokenCard(item,'hold',item.balance));}
 if(!launches.length){const p=document.createElement('p');p.className='profile-empty';p.textContent='You have not launched any PIXORUN tokens from this wallet yet.';launchHost.append(p);}
 for(const item of launches)launchHost.append(tokenCard(item,'launch',0n));
}
function setProfileTab(which){
 const holds=which==='holds';$('profileHolds').hidden=!holds;$('profileLaunches').hidden=holds;
 $('profileHoldsTab').classList.toggle('active',holds);$('profileLaunchesTab').classList.toggle('active',!holds);
 $('profileHoldsTab').setAttribute('aria-selected',String(holds));$('profileLaunchesTab').setAttribute('aria-selected',String(!holds));
}
$('profileHoldsTab')?.addEventListener('click',()=>setProfileTab('holds'));
$('profileLaunchesTab')?.addEventListener('click',()=>setProfileTab('launches'));
function mergeRows(rows,localRows){const map=new Map();for(const x of rows||[])if(x.token_address)map.set(x.token_address.toLowerCase(),x);for(const x of localRows||[])if(x.token_address&&!map.has(x.token_address.toLowerCase()))map.set(x.token_address.toLowerCase(),x);return [...map.values()];}
async function load(){
 const p=wallet();if(!p){say('Open PIXORUN in your wallet browser to view your portfolio.');return;}
 try{
  const accounts=await p.request({method:'eth_accounts'}),account=accounts?.[0];
  if(!account){say('Connect your wallet to view Holds and Your Launches.');$('profileHoldsCount').textContent='—';$('profileLaunchCount').textContent='—';$('profileHolds').replaceChildren();$('profileLaunches').replaceChildren();return;}
  say('Loading your launches and checking on-chain token balances…');
  const cacheKey='pixorun:profile:v2:'+account.toLowerCase();let cache=[];
  try{cache=JSON.parse(localStorage.getItem(cacheKey)||'null')?.items||[];}catch(_){}
  const localRows=cache.map(x=>({token_address:x.token,token_name:x.name,token_symbol:x.symbol,curve_address:x.curve,creator_address:x.creator,tx_hash:x.txHash,block_number:x.blockNumber,token_decimals:18}));
  const [allRows,creatorRows]=await Promise.all([window.PIXORUN_REGISTRY.listLaunches(),window.PIXORUN_REGISTRY.listLaunches(account)]);
  const launches=mergeRows(creatorRows,localRows);
  const candidates=mergeRows(allRows,localRows);
  const rpc=window.PIXORUN_RPC.createProvider(),abi=['function balanceOf(address) view returns(uint256)'];
  const holds=[];
  for(let i=0;i<candidates.length;i+=12){
   const batch=candidates.slice(i,i+12);
   const results=await Promise.all(batch.map(async x=>{
    try{const c=new ethers.Contract(x.token_address,abi,rpc);const balance=await c.balanceOf(account);return balance>0n?{...x,balance,token_decimals:Number(x.token_decimals??18)}:null;}catch(error){console.warn('Could not read token balance',x.token_address,error);return null;}
   }));
   holds.push(...results.filter(Boolean));
  }
  holds.sort((a,b)=>a.balance===b.balance?0:a.balance>b.balance?-1:1);
  launches.sort((a,b)=>Number(b.block_number||0)-Number(a.block_number||0));
  renderPortfolio(holds,launches);say('Portfolio synced · balances verified on Robinhood Chain Testnet.');
 }catch(e){say('Portfolio could not fully sync: '+(e.message||'network error')+'. Tap Refresh to try again.');}
}
window.addEventListener('pixorun:walletChanged',load);$('profileRetry')?.addEventListener('click',load);const p=wallet();p?.on?.('accountsChanged',load);load();
})();

(()=>{
'use strict';
const FEE='0x2C1Bc9d4e1D262CbCb3474bAc13b666B241A6dbF',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com',abi=['function creatorClaimable(address) view returns(uint256)','function claimCreatorFees()','function stakingRewards() view returns(address)','function totalCreatorAccrued() view returns(uint256)','function totalTeamAccrued() view returns(uint256)'],provider=window.PIXORUN_RPC.createProvider(),$=id=>document.getElementById(id),fmt=v=>{const raw=ethers.formatEther(v),p=raw.split('.'),w=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,','),f=(p[1]||'').replace(/0+$/,'');return (f?w+'.'+f:w)+' ETH';};
const contractLink=$('profileFeeContract');if(contractLink){contractLink.href=EXPLORER+'/address/'+FEE;}
function feeStatus(s){const e=$('profileFeeStatus');if(e)e.textContent=s;}
async function loadProfileFees(){try{const c=new ethers.Contract(FEE,abi,provider),[staking,totalCreator,totalTeam]=await Promise.all([c.stakingRewards(),c.totalCreatorAccrued(),c.totalTeamAccrued()]);$('profileFeeStaking').textContent=staking;$('profileFeeCreatorTotal').textContent=fmt(totalCreator);$('profileFeeTeamTotal').textContent=fmt(totalTeam);const p=window.PIXORUN_WALLET?.getProvider(),accounts=p?await p.request({method:'eth_accounts'}):[],account=accounts?.[0];if(!account){$('profileFeeClaimable').textContent='Connect wallet to view';$('profileFeeClaim').disabled=true;feeStatus('Connect your wallet to check creator fees.');return;}const amount=await c.creatorClaimable(account);$('profileFeeClaimable').textContent=fmt(amount);$('profileFeeClaim').disabled=amount===0n;feeStatus(amount>0n?'Creator fees available to claim.':'No creator fees claimable yet.');}catch(e){feeStatus('Fee information unavailable. Please retry.');}}
$('profileFeeRetry')?.addEventListener('click',loadProfileFees);
$('profileFeeClaim')?.addEventListener('click',async()=>{try{const chosen=await window.PIXORUN_WALLET.connect(),p=chosen.provider;let chain=(await p.request({method:'eth_chainId'})).toLowerCase();if(chain!=='0xb626'){try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xb626'}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0xb626',chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}}const signer=await new ethers.BrowserProvider(p).getSigner(),c=new ethers.Contract(FEE,abi,signer);$('profileFeeClaim').disabled=true;feeStatus('Confirm claim in your wallet…');const tx=await c.claimCreatorFees();feeStatus('Claim submitted: '+tx.hash);await tx.wait();feeStatus('Creator fees claimed successfully.');await loadProfileFees();}catch(e){feeStatus(e.shortMessage||e.message||'Claim failed.');$('profileFeeClaim').disabled=false;}});
window.addEventListener('pixorun:walletChanged',loadProfileFees);const wp=window.PIXORUN_WALLET?.getProvider();wp?.on?.('accountsChanged',loadProfileFees);loadProfileFees();
})();
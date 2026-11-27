(()=>{
'use strict';
const OFFICIAL_TOKEN='0x74f0dA3f0C3C304933D26EA90411124287D7a920';
const CHAIN_ID=46630,CHAIN_HEX='0xb626';
const RPC='https://rpc.testnet.chain.robinhood.com';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const $=id=>document.getElementById(id);
const tokenAbi=['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function approve(address,uint256) returns(bool)'];
const stakingAbi=['function stakingToken() view returns(address)','function totalStaked() view returns(uint256)','function balanceOf(address) view returns(uint256)','function earned(address) view returns(uint256)','function stake(uint256)','function withdraw(uint256)','function claimReward()'];
let config=null,readProvider=null,tokenRead=null,stakingRead=null,decimals=18,symbol='PIXORUN',busy=false,account=null,signer=null,tokenWrite=null,stakingWrite=null,configReady=false,lastWalletDetail=null;
const status=(message,type='info')=>{const el=$('stakingStatus');if(el){el.textContent=message;el.dataset.type=type;}};
const fmt=(value,d=decimals)=>{try{return Number(ethers.formatUnits(value,d)).toLocaleString(undefined,{maximumFractionDigits:6});}catch(_){return '—';}};
const fmtCompact=(value,d=decimals,unit=symbol)=>{try{const exact=fmt(value,d),n=Number(ethers.formatUnits(value,d));let shown;if(!Number.isFinite(n))shown='—';else if(n>=1e9)shown=(n/1e9).toFixed(2).replace(/\.00$/,'')+'B';else if(n>=1e6)shown=(n/1e6).toFixed(2).replace(/\.00$/,'')+'M';else if(n>=1e3)shown=(n/1e3).toFixed(2).replace(/\.00$/,'')+'K';else shown=n.toLocaleString(undefined,{maximumFractionDigits:2});return {text:shown+' '+unit,title:exact+' '+unit};}catch(_){return {text:'—',title:'—'};}};
const setCompactAmount=(id,value,d=decimals,unit=symbol)=>{const el=$(id);if(!el)return;const result=fmtCompact(value,d,unit);el.textContent=result.text;el.title=result.title;el.setAttribute('aria-label',result.title);};
const explorerAddress=a=>EXPLORER+'/address/'+a;
const setButtons=enabled=>['stakeBtn','unstakeBtn','claimBtn'].forEach(id=>{if($(id))$(id).disabled=!enabled;});
async function loadConfig(){
 const url=new URL('../contracts/deployments/robinhood-testnet.json',location.href);
 const response=await fetch(url,{cache:'no-store'});
 if(!response.ok)throw Error('Could not load the Testnet deployment registry.');
 config=await response.json();
 if(Number(config.chainId)!==CHAIN_ID)throw Error('Deployment registry is not for Robinhood Chain Testnet.');
 if(!config.stakingRewards||!config.feeDistributor)throw Error('Staking contract has not been deployed yet. Buttons remain locked.');
 if(String(config.officialToken||'').toLowerCase()!==OFFICIAL_TOKEN.toLowerCase())throw Error('Registry token does not match the official PIXORUN token. Staking is locked.');
 if(!ethers.isAddress(config.stakingRewards)||!ethers.isAddress(config.feeDistributor))throw Error('Invalid staking deployment address. Staking is locked.');
 readProvider=new ethers.JsonRpcProvider(RPC,{chainId:CHAIN_ID,name:'Robinhood Chain Testnet'},{staticNetwork:true});
 const [network,tokenCode,stakingCode,feeCode]=await Promise.all([readProvider.getNetwork(),readProvider.getCode(OFFICIAL_TOKEN),readProvider.getCode(config.stakingRewards),readProvider.getCode(config.feeDistributor)]);
 if(Number(network.chainId)!==CHAIN_ID||tokenCode==='0x'||stakingCode==='0x'||feeCode==='0x')throw Error('The official token or staking deployment could not be verified on Testnet.');
 tokenRead=new ethers.Contract(OFFICIAL_TOKEN,tokenAbi,readProvider);
 stakingRead=new ethers.Contract(config.stakingRewards,stakingAbi,readProvider);
 const stakingLinkInterface=new ethers.Interface(['function stakingRewards() view returns(address)']);
 const [linkedToken,linkedStaking,tokenDecimals]=await Promise.all([stakingRead.stakingToken(),readProvider.call({to:config.feeDistributor,data:stakingLinkInterface.encodeFunctionData('stakingRewards')}).then(v=>stakingLinkInterface.decodeFunctionResult('stakingRewards',v)[0]),tokenRead.decimals()]);
 if(linkedToken.toLowerCase()!==OFFICIAL_TOKEN.toLowerCase()||linkedStaking.toLowerCase()!==config.stakingRewards.toLowerCase())throw Error('On-chain staking links do not match the official PIXORUN token and registry.');
 decimals=Number(tokenDecimals);
 try{symbol=await tokenRead.symbol();}catch(_){}
 const link=$('stakingTokenAddress');if(link){link.href=explorerAddress(OFFICIAL_TOKEN);link.textContent=OFFICIAL_TOKEN;}
 status('Staking contracts verified on Robinhood Chain Testnet.','success');
 setButtons(true);
}
async function refresh(){
 if(!tokenRead||!stakingRead)return;
 const [total]=await Promise.all([stakingRead.totalStaked()]);
 setCompactAmount('totalStaked',total,decimals,symbol);
 if(!account){setCompactAmount('yourStake',0n,decimals,symbol);$('pendingRewards').textContent='—';$('pendingRewards').removeAttribute('title');$('pendingRewards').removeAttribute('aria-label');$('walletBalance').textContent='—';$('walletBalance').removeAttribute('title');$('walletBalance').removeAttribute('aria-label');$('stakeAvailableBalance').textContent='Connect wallet from the site header';setButtons(false);return;}
 const [staked,reward,balance]=await Promise.all([stakingRead.balanceOf(account),stakingRead.earned(account),tokenRead.balanceOf(account)]);
 setCompactAmount('yourStake',staked,decimals,symbol);
 setCompactAmount('pendingRewards',reward,18,'ETH');
 setCompactAmount('walletBalance',balance,decimals,symbol);$('stakeAvailableBalance').textContent=fmt(balance)+' '+symbol+' available';
 $('unstakeBtn').disabled=busy||staked===0n;
 $('claimBtn').disabled=busy||reward===0n;
}
async function useSharedWallet(detail){
 const shared=window.PIXORUN_WALLET;
 const state=detail?.provider?detail:(shared?.getState?await shared.getState():null);
 const provider=state?.provider||detail?.provider||shared?.getProvider?.();
 const accounts=state?.account?[state.account]:(shared?await shared.getAccounts():[]);
 const next=state?.account||detail?.account||accounts?.[0]||null;
 const chain=String(state?.chainId||detail?.chainId||(provider?await provider.request({method:'eth_chainId'}):'')).toLowerCase();
 if(!provider||!next){
  account=null;signer=null;tokenWrite=null;stakingWrite=null;
  await refresh();
  status('Connect your wallet using the main site header to use Staking.','info');
  return;
 }
 if(chain!==CHAIN_HEX){
  account=null;signer=null;tokenWrite=null;stakingWrite=null;
  await refresh();
  status('Switch the network using the main site wallet menu: Robinhood Chain Testnet.','error');
  return;
 }
 account=ethers.getAddress(next);
 const browserProvider=new ethers.BrowserProvider(provider);
 signer=await browserProvider.getSigner(account);
 tokenWrite=tokenRead.connect(signer);
 stakingWrite=stakingRead.connect(signer);

 setButtons(true);
 await refresh();
}
function closeTxModal(){const modal=$('stakingTxModal');if(modal)modal.hidden=true;}
function showTxModal(kind,title,message,action,txHash,amount){
 const modal=$('stakingTxModal');if(!modal)return;
 $('stakingTxIcon').textContent=kind==='success'?'✓':'!';
 $('stakingTxTitle').textContent=title;
 $('stakingTxMessage').textContent=message;
 const amountEl=$('stakingTxAmount');if(amountEl){amountEl.hidden=!amount;amountEl.textContent=amount||'';}
 const txLink=$('stakingTxExplorer');if(txLink){txLink.hidden=!txHash;txLink.href=txHash?EXPLORER+'/tx/'+txHash:'#';}
 const retry=$('stakingTxRetry');retry.hidden=kind!=='error';
 retry.onclick=()=>{closeTxModal();if(action)runAction(action);};
 modal.hidden=false;
}
async function runAction(action){
 if(busy)return;busy=true;setButtons(false);
 try{
  if(!signer)throw Error('Connect your wallet from the main site header first, then return to Staking.');
  if(action==='stake'){
   const raw=String($('stakeAmount').value||'').trim();if(!raw||!/^\d+(\.\d+)?$/.test(raw))throw Error('Enter a valid PIXORUN amount.');
   const amount=ethers.parseUnits(raw,decimals);if(amount<=0n)throw Error('Amount must be greater than zero.');
   const balance=await tokenRead.balanceOf(account);if(balance<amount)throw Error('Insufficient PIXORUN balance.');
   const allowance=await tokenRead.allowance(account,config.stakingRewards);
   if(allowance<amount){
    status('Confirm PIXORUN approval in MetaMask…','pending');
    const approval=await tokenWrite.approve(config.stakingRewards,amount);
    status('Approving PIXORUN… Waiting for on-chain confirmation.','pending');
    await approval.wait();
    status('PIXORUN approval confirmed. Click Stake PIXORUN to continue.','success');
    showTxModal('success','Approved successfully','Your PIXORUN spending approval is confirmed on Robinhood Chain Testnet. Click Stake PIXORUN to submit your stake.',null);
    return;
   }
   status('Confirm the staking transaction in MetaMask…','pending');
   const tx=await stakingWrite.stake(amount);
   status('Staking… Waiting for on-chain confirmation.','pending');
   await tx.wait();$('stakeAmount').value='';
   status('Your PIXORUN stake is confirmed on-chain.','success');
   showTxModal('success','You’re officially staking!','Your PIXORUN is now staked on Robinhood Chain Testnet. You can track your position and rewards in the Staking Hub.',null,tx.hash,fmt(amount)+' '+symbol);
  }else if(action==='unstake'){
   const raw=String($('stakeAmount').value||'').trim();if(!raw||!/^\d+(\.\d+)?$/.test(raw))throw Error('Enter the PIXORUN amount to unstake.');
   const amount=ethers.parseUnits(raw,decimals);if(amount<=0n)throw Error('Amount must be greater than zero.');
   const staked=await stakingRead.balanceOf(account);if(staked<amount)throw Error('You cannot unstake more than your current stake.');
   status('Confirm the unstaking transaction in MetaMask…','pending');
   const tx=await stakingWrite.withdraw(amount);status('Unstaking… Waiting for on-chain confirmation.','pending');await tx.wait();$('stakeAmount').value='';
   status('Unstake confirmed on-chain.','success');showTxModal('success','Unstaking successful','Your unstaking transaction has been confirmed on Robinhood Chain Testnet.',null);
  }else if(action==='claim'){
   const reward=await stakingRead.earned(account);if(reward===0n)throw Error('There are no rewards available to claim.');
   status('Confirm the reward claim in MetaMask…','pending');
   const tx=await stakingWrite.claimReward();status('Claiming rewards… Waiting for on-chain confirmation.','pending');await tx.wait();
   status('Reward claim confirmed on-chain.','success');showTxModal('success','Rewards claimed','Your reward claim has been confirmed on Robinhood Chain Testnet.',null);
  }
  await refresh();
 }catch(e){
  const rejected=e?.code===4001||e?.code==='ACTION_REJECTED'||e?.shortMessage?.toLowerCase?.().includes('user rejected');
  const message=rejected?'You cancelled the request in MetaMask. No transaction was completed.':(e?.shortMessage||e?.reason||e?.message||'Transaction failed. Please try again.');
  status(message,'error');showTxModal('error',rejected?'Request cancelled':'Transaction failed',message,action);
 }finally{busy=false;setButtons(!!signer&&!!config?.stakingRewards);if(account)await refresh().catch(()=>{});}
}
window.addEventListener('pixorun:walletChanged',e=>{lastWalletDetail=e.detail||{};if(configReady)useSharedWallet(lastWalletDetail).catch(err=>{account=null;signer=null;tokenWrite=null;stakingWrite=null;refresh();status(err?.message||'Could not sync the connected site wallet.','error');});});
document.addEventListener('DOMContentLoaded',async()=>{
 setButtons(false);
 $('stakeBtn')?.addEventListener('click',()=>runAction('stake'));
 $('unstakeBtn')?.addEventListener('click',()=>runAction('unstake'));
 $('claimBtn')?.addEventListener('click',()=>runAction('claim'));
 document.querySelectorAll('[data-stake-percent]').forEach(button=>button.addEventListener('click',async()=>{if(!account||!tokenRead)return;const balance=await tokenRead.balanceOf(account);const pct=BigInt(button.dataset.stakePercent);const amount=balance*pct/100n;$('stakeAmount').value=ethers.formatUnits(amount,decimals);}));
 try{await loadConfig();configReady=true;await refresh();const state=await window.PIXORUN_WALLET?.getState?.();if(state?.provider&&state?.account)await useSharedWallet(state);else if(lastWalletDetail?.provider&&lastWalletDetail?.account)await useSharedWallet(lastWalletDetail);else status('Connect your wallet using the main site header to use Staking.','info');}catch(e){status(e?.message||'Staking is unavailable.','error');setButtons(false);}
});
})();
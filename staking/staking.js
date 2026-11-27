(()=>{
'use strict';
const OFFICIAL_TOKEN='0x74f0dA3f0C3C304933D26EA90411124287D7a920';
const CHAIN_ID=46630,CHAIN_HEX='0xb626';
const RPC='https://rpc.testnet.chain.robinhood.com';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const $=id=>document.getElementById(id);
const tokenAbi=['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function approve(address,uint256) returns(bool)'];
const stakingAbi=['function stakingToken() view returns(address)','function totalStaked() view returns(uint256)','function balanceOf(address) view returns(uint256)','function earned(address) view returns(uint256)','function stake(uint256)','function withdraw(uint256)','function claimReward()'];
let config=null,readProvider=null,tokenRead=null,stakingRead=null,decimals=18,symbol='PIXORUN',busy=false,account=null,signer=null,tokenWrite=null,stakingWrite=null;
const status=(message,type='info')=>{const el=$('stakingStatus');if(el){el.textContent=message;el.dataset.type=type;}};
const fmt=(value,d=decimals)=>{try{return Number(ethers.formatUnits(value,d)).toLocaleString(undefined,{maximumFractionDigits:6});}catch(_){return '—';}};
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
 $('totalStaked').textContent=fmt(total)+' '+symbol;
 if(!account){$('yourStake').textContent='Connect wallet';$('pendingRewards').textContent='—';$('walletBalance').textContent='—';$('unstakeBtn').disabled=true;$('claimBtn').disabled=true;return;}
 const [staked,reward,balance]=await Promise.all([stakingRead.balanceOf(account),stakingRead.earned(account),tokenRead.balanceOf(account)]);
 $('yourStake').textContent=fmt(staked)+' '+symbol;
 $('pendingRewards').textContent=fmt(reward,18)+' ETH';
 $('walletBalance').textContent=fmt(balance)+' '+symbol;
 $('unstakeBtn').disabled=busy||staked===0n;
 $('claimBtn').disabled=busy||reward===0n;
}
async function connect(){
 const result=await window.PIXORUN_WALLET.connect();
 const provider=result.provider;
 let chain=(await provider.request({method:'eth_chainId'})).toLowerCase();
 if(chain!==CHAIN_HEX){
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]});}
  catch(e){if(e.code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}
 }
 chain=(await provider.request({method:'eth_chainId'})).toLowerCase();
 if(chain!==CHAIN_HEX)throw Error('Switch to Robinhood Chain Testnet (46630) to stake.');
 account=ethers.getAddress(result.account);
 const browserProvider=new ethers.BrowserProvider(provider);
 signer=await browserProvider.getSigner(account);
 tokenWrite=tokenRead.connect(signer);stakingWrite=stakingRead.connect(signer);
 status('Wallet connected: '+account.slice(0,6)+'…'+account.slice(-4),'success');
 await refresh();
}
async function runAction(action){
 if(busy)return;busy=true;setButtons(false);
 try{
  if(!signer)await connect();
  if(action==='stake'){
   const raw=String($('stakeAmount').value||'').trim();if(!raw||!/^\d+(\.\d+)?$/.test(raw))throw Error('Enter a valid PIXORUN amount.');
   const amount=ethers.parseUnits(raw,decimals);if(amount<=0n)throw Error('Amount must be greater than zero.');
   const balance=await tokenRead.balanceOf(account);if(balance<amount)throw Error('Insufficient PIXORUN balance.');
   let allowance=await tokenRead.allowance(account,config.stakingRewards);
   if(allowance<amount){status('Approve PIXORUN spending in your wallet…','pending');const approval=await tokenWrite.approve(config.stakingRewards,amount);await approval.wait();status('Approval confirmed. Confirm the staking transaction…','pending');}
   const tx=await stakingWrite.stake(amount);status('Stake submitted. Waiting for confirmation…','pending');await tx.wait();$('stakeAmount').value='';
  }else if(action==='unstake'){
   const raw=String($('stakeAmount').value||'').trim();if(!raw||!/^\d+(\.\d+)?$/.test(raw))throw Error('Enter the PIXORUN amount to unstake.');
   const amount=ethers.parseUnits(raw,decimals);if(amount<=0n)throw Error('Amount must be greater than zero.');
   const staked=await stakingRead.balanceOf(account);if(staked<amount)throw Error('You cannot unstake more than your current stake.');
   const tx=await stakingWrite.withdraw(amount);status('Unstake submitted. Waiting for confirmation…','pending');await tx.wait();$('stakeAmount').value='';
  }else if(action==='claim'){
   const reward=await stakingRead.earned(account);if(reward===0n)throw Error('There are no rewards available to claim.');
   const tx=await stakingWrite.claimReward();status('Reward claim submitted. Waiting for confirmation…','pending');await tx.wait();
  }
  status('Transaction confirmed on Robinhood Chain Testnet.','success');await refresh();
 }catch(e){status(e?.shortMessage||e?.reason||e?.message||'Transaction failed.','error');}
 finally{busy=false;setButtons(!!config?.stakingRewards);if(account)await refresh().catch(()=>{});}
}
document.addEventListener('DOMContentLoaded',async()=>{
 setButtons(false);
 $('connectStakeWallet')?.addEventListener('click',async()=>{try{await connect();}catch(e){status(e?.message||'Wallet connection failed.','error');}});
 $('stakeBtn')?.addEventListener('click',()=>runAction('stake'));
 $('unstakeBtn')?.addEventListener('click',()=>runAction('unstake'));
 $('claimBtn')?.addEventListener('click',()=>runAction('claim'));
 try{await loadConfig();await refresh();}catch(e){status(e?.message||'Staking is unavailable.','error');setButtons(false);}
 window.addEventListener('pixorun:walletChanged',async e=>{if(e.detail?.account&&account&&e.detail.account.toLowerCase()!==account.toLowerCase()){account=null;signer=null;tokenWrite=null;stakingWrite=null;await refresh();}});
});
})();
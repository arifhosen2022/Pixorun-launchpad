(()=> {
'use strict';
let FACTORY='';
const CHAIN_ID=46630, CHAIN_HEX='0xb626';
const RPC='https://rpc.testnet.chain.robinhood.com';
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const ABI=[
 'function creationFee() view returns (uint256)',
 'function swapFactory() view returns (address)',
 'function feeDistributor() view returns (address)',
 'function createLaunch(string name,string symbol) payable returns (address tokenAddress,address curveAddress)',
 'event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)'
];
const $=id=>document.getElementById(id);
let readProvider,readFactory,creationFee,launchBusy=false,pendingRegistryTxHash=null;
function walletProvider(){return window.PIXORUN_WALLET?.getProvider()||null;}
const isBitgetProvider=provider=>!!provider&&(provider===window.bitkeep?.ethereum||provider.isBitKeep===true||(window.bitkeep?.isBitKeep===true&&provider===window.ethereum));
const status=(message,type='info')=>{const el=$('launchStatus');if(el){el.textContent=message;el.dataset.type=type;}};
const fmt=v=>Number(ethers.formatEther(v)).toLocaleString(undefined,{maximumFractionDigits:6});
const explorer=(kind,address)=>EXPLORER+'/'+kind+'/'+address;
const timeout=(promise,label,ms=20000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out. Check your connection and reload.')),ms))]);
function errorText(e){
 const parts=[e?.shortMessage,e?.reason,e?.info?.error?.message,e?.error?.message,e?.data?.message,e?.message,e?.code&&('Wallet error code: '+e.code)];
 const msg=[...new Set(parts.filter(x=>typeof x==='string'&&x.trim()))].join(' — ');
 return (msg||'Token launch failed. Please try again.').slice(0,650);
}


async function registerWithRetry(txHash,payload){
 let lastError;
 for(let attempt=0;attempt<4;attempt++){
  try{return await timeout(window.PIXORUN_REGISTRY.registerLaunch(txHash,payload),'Launch registry sync',30000);}
  catch(error){lastError=error;const code=Number(error?.status||0);if((code&&code!==408&&code!==429&&code<500)||attempt===3)break;await new Promise(resolve=>setTimeout(resolve,[700,1800,4000][attempt]));}
 }
 throw lastError||new Error('Could not sync this launch to Discover yet.');
}
function setButton(label,disabled){const b=$('launchBtn');if(b){b.textContent=label;b.disabled=!!disabled;}}
function updatePreview(){
 const name=$('tokenName')?.value.trim(),symbol=$('tokenSymbol')?.value.trim();
 if($('previewName'))$('previewName').textContent=name||'Your token name';
 if($('previewSymbol'))$('previewSymbol').textContent=symbol?('$'+symbol.toUpperCase()):'$TICKER';
 const nameCount=$('nameCount');if(nameCount)nameCount.textContent=(new TextEncoder().encode($('tokenName')?.value||'').length)+'/32 bytes';
 const symbolCount=$('symbolCount');if(symbolCount)symbolCount.textContent=(symbol||'').length+'/10';
 const validName=!!name&&new TextEncoder().encode(name).length<=32;
 const validSymbol=/^[A-Za-z0-9]{1,10}$/.test(symbol||'');
 if($('tokenName'))$('tokenName').setAttribute('aria-invalid',String(!validName&&!!name));
 if($('tokenSymbol'))$('tokenSymbol').setAttribute('aria-invalid',String(!validSymbol&&!!symbol));
}

function cleanUrl(value,label,hosts){
 const raw=String(value||'').trim();if(!raw)return '';
 let u;try{u=new URL(raw);}catch{throw new Error('Enter a valid '+label+' URL.');}
 if(!['https:','http:'].includes(u.protocol))throw new Error(label+' URL must start with https:// or http://');
 if(hosts&&!hosts.test(u.hostname))throw new Error('Use an official '+label+' link.');
 return u.href;
}
async function readImage(file,label){
 if(!file)return null;
 const allowed=['image/png','image/jpeg','image/webp','image/gif'];
 if(!allowed.includes(file.type))throw new Error(label+' must be PNG, JPG, WEBP or GIF.');
 if(file.size>2*1024*1024)throw new Error(label+' must be 2 MB or smaller.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const sha256=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return {mime:file.type,base64:btoa(binary),sha256};
}
function previewLogo(){
 const box=$('previewIcon');if(!box)return;box.replaceChildren();
 const file=$('tokenLogo')?.files?.[0];
 if(file){const img=document.createElement('img');img.alt='Token logo preview';img.src=URL.createObjectURL(file);box.append(img);}
 else box.textContent='P';
}

async function walletChainId(){
 const provider=walletProvider();
 if(!provider)throw new Error('No wallet detected. Open this page inside Bitget Wallet or another EVM wallet browser.');
 const id=await timeout(provider.request({method:'eth_chainId'}),'Wallet network check');
 return Number(BigInt(id));
}
async function refreshWalletNetwork(){
 const config={chainId:CHAIN_HEX,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]};
 try{
   await timeout(walletProvider().request({method:'wallet_addEthereumChain',params:[config]}),'Wallet network RPC update',30000);
 }catch(e){
   // Wallets may reject re-adding a chain that is already configured. The RPC probe below decides whether it is usable.
   if(e.code===4001||e.code===-32002)throw e;
 }
}
async function switchToTestnet(){
 const provider=walletProvider();
 let chain=await walletChainId();
 if(chain!==CHAIN_ID){
   status('Your wallet is on the wrong network. Approve switching to Robinhood Chain Testnet (46630).','pending');
   try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]});}
   catch(e){
     if(e.code!==4902)throw e;
     await provider.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});
   }
 }
 chain=await walletChainId();
 if(chain!==CHAIN_ID)throw new Error('Robinhood Chain Testnet was not selected. Switch the network in your wallet and try again.');
 // Do not use eth_blockNumber through the wallet provider here. Some mobile wallets
 // fail this read even while they can still sign and submit a transaction.
 // All chain reads are performed through the independent readProvider.
}
async function setup(){
 const form=$('launchForm'),btn=$('launchBtn');
 if(!form||!btn)return;
 try{const registry=await fetch('../contracts/deployments/robinhood-testnet.json',{cache:'no-store'});if(!registry.ok)throw new Error('Deployment registry unavailable.');const deployment=await registry.json();if(Number(deployment.chainId)!==CHAIN_ID||!ethers.isAddress(deployment.launchpadFactory))throw new Error('Launchpad deployment is not configured.');FACTORY=deployment.launchpadFactory;}catch(e){status(e.message||'Launchpad deployment unavailable.','error');setButton('LAUNCHPAD UNAVAILABLE',true);return;}
 $('factoryAddress').textContent=FACTORY;$('factoryAddress').href=explorer('address',FACTORY);
 $('factoryAddress').title=FACTORY;
 $('tokenName')?.addEventListener('input',updatePreview);
 $('tokenSymbol')?.addEventListener('input',updatePreview);
 $('tokenLogo')?.addEventListener('change',previewLogo);
 $('tokenBanner')?.addEventListener('change',()=>{const file=$('tokenBanner').files?.[0];if(file&&file.size>2*1024*1024){$('tokenBanner').value='';status('Banner image must be 2 MB or smaller.','error');}});
 updatePreview();previewLogo();
 setButton('CHECKING LAUNCHPAD…',true);
 status('Connecting to Robinhood Chain Testnet and verifying the launch contracts…','pending');
 try{
   if(!window.ethers)throw new Error('The ethers wallet library did not load. Refresh this page and try again.');
   readProvider=new ethers.JsonRpcProvider(RPC,{chainId:CHAIN_ID,name:'Robinhood Chain Testnet'},{staticNetwork:true});
   const network=await timeout(readProvider.getNetwork(),'Robinhood Testnet RPC');
   if(Number(network.chainId)!==CHAIN_ID)throw new Error('RPC network mismatch. Expected Robinhood Chain Testnet (46630).');
   const code=await timeout(readProvider.getCode(FACTORY),'Launchpad Factory verification');
   if(!code||code==='0x')throw new Error('Launchpad Factory bytecode was not found at the configured address. Token launch is paused until deployment is fixed.');
   readFactory=new ethers.Contract(FACTORY,ABI,readProvider);
   const [fee,swap,distributor]=await timeout(Promise.all([readFactory.creationFee(),readFactory.swapFactory(),readFactory.feeDistributor()]),'Launchpad configuration');
   if(swap===ethers.ZeroAddress)throw new Error('Launchpad Factory has no Swap Factory linked. Please fix the on-chain configuration before launching.');
   if(distributor===ethers.ZeroAddress)throw new Error('Launchpad Factory has no Fee Distributor linked. Token launch is paused.');
   creationFee=fee;
   $('creationFee').textContent=fmt(fee)+' ETH';
   $('swapAddress').textContent=swap;$('swapAddress').href=explorer('address',swap);
   $('feeAddress').textContent=distributor;$('feeAddress').href=explorer('address',distributor);
   $('networkStatus')&&($('networkStatus').textContent='Connected · Robinhood Chain Testnet');
   setButton('LAUNCH TOKEN',false);status('Launchpad verified. Enter your token name and ticker to continue.','success');
 }catch(e){
   $('creationFee').textContent='Unavailable';
   $('networkStatus')&&($('networkStatus').textContent='Not verified');
   status(errorText(e),'error');setButton('LAUNCHPAD UNAVAILABLE',true);return;
 }
 btn.addEventListener('click',async()=>{
   if(launchBusy)return;
   const name=$('tokenName').value.trim(),symbol=$('tokenSymbol').value.trim();
   if(!name||new TextEncoder().encode(name).length>32){status('Enter a token name. It must be 1–32 UTF-8 bytes.','error');$('tokenName').focus();return;}
   if(!/^[A-Za-z0-9]{1,10}$/.test(symbol)){status('Ticker must be 1–10 English letters or numbers, without spaces or symbols.','error');$('tokenSymbol').focus();return;}
   launchBusy=true;setButton('PREPARING TRANSACTION…',true);
   try{
     if(!name||new TextEncoder().encode(name).length>32)throw new Error('Enter a token name. It must be 1–32 UTF-8 bytes.');
     if(!/^[A-Za-z0-9]{1,10}$/.test(symbol))throw new Error('Ticker must be 1–10 English letters or numbers, without spaces or symbols.');
     const metadata={description:String($('tokenDescription')?.value||'').trim()||null,websiteUrl:cleanUrl($('tokenWebsite')?.value,'website')||null,xUrl:cleanUrl($('tokenX')?.value,'X',/(^|\.)((x|twitter)\.com)$/i)||null,telegramUrl:cleanUrl($('tokenTelegram')?.value,'Telegram',/(^|\.)((t\.me|telegram\.me))$/i)||null};
     const logo=await readImage($('tokenLogo')?.files?.[0],'Token logo');
     const hasMetadata=Object.values(metadata).some(Boolean)||!!logo;
     // Reuse the wallet already connected in the shared site header. Never open a second connect flow here.
     const shared=await timeout(window.PIXORUN_WALLET?.getState?.(),'Connected site wallet',15000);
     const provider=shared?.provider||walletProvider();
     const accounts=shared?.account?[shared.account]:(provider?await provider.request({method:'eth_accounts'}):[]);
     if(!provider||!accounts?.length)throw new Error('Connect your wallet from the homepage header first, then return here to launch your token.');
     const account=ethers.getAddress(accounts[0]);
     await switchToTestnet();
     const fee=creationFee??await readFactory.creationFee();
     const balance=await timeout(readProvider.getBalance(account),'Wallet balance');
     if(balance<fee)throw new Error('Insufficient testnet ETH. You need at least '+fmt(fee)+' ETH for the creation fee, plus gas.');
     status('Simulating the exact launch transaction. Your wallet will not be charged during this check…','pending');
     await timeout(readFactory.createLaunch.staticCall(name,symbol,{from:account,value:fee}),'Launch simulation',45000);
     const request=await timeout(readFactory.createLaunch.populateTransaction(name,symbol,{value:fee}),'Transaction preparation');
     const gas=await timeout(readProvider.estimateGas({...request,from:account}),'Gas estimation',45000);
     const gasLimit=gas*120n/100n;
     const feeData=await readProvider.getFeeData();
     const gasPrice=feeData.gasPrice??feeData.maxFeePerGas??0n;
     if(gasPrice&&balance<fee+(gasLimit*gasPrice))throw new Error('Your balance covers the creation fee but not the estimated network gas. Add more testnet ETH and retry.');
     const bitget=isBitgetProvider(provider);
     const nonce=bitget?null:await timeout(readProvider.getTransactionCount(account,'pending'),'Wallet nonce',30000);
     const txRequest={from:account,to:request.to,data:request.data,value:ethers.toQuantity(fee),gas:ethers.toQuantity(gasLimit)};
     if(!bitget){txRequest.nonce=ethers.toQuantity(nonce);txRequest.chainId=ethers.toQuantity(CHAIN_ID);}
     if(gasPrice)txRequest.gasPrice=ethers.toQuantity(gasPrice);
     status('Simulation passed. Confirm the token launch in your wallet. Fee: '+fmt(fee)+' ETH plus estimated network gas.','success');
     setButton('WAITING FOR WALLET APPROVAL…',true);
     const txHash=await timeout(provider.request({method:'eth_sendTransaction',params:[txRequest]}),'Wallet transaction approval',90000);
     status('Transaction submitted. Waiting for Robinhood Testnet confirmation…','pending');
     pendingRegistryTxHash=txHash;
     const txLink=explorer('tx',txHash);
     if($('resultTx')){$('resultTx').href=txLink;$('resultTx').textContent='View transaction '+txHash.slice(0,12)+'… ↗';}
     const receipt=await timeout(readProvider.waitForTransaction(txHash,1,180000), 'Transaction confirmation',190000);
     if(!receipt||receipt.status!==1)throw new Error('The launch transaction failed on-chain. Review the transaction: '+txLink);
     let token='',curve='';
     for(const log of receipt.logs){try{const parsed=readFactory.interface.parseLog(log);if(parsed?.name==='LaunchCreated'){token=parsed.args.token;curve=parsed.args.curve;break;}}catch(_){}}
     if(!token||!curve)throw new Error('Transaction confirmed, but token addresses could not be read from LaunchCreated event. Check '+txLink);
     // Save the confirmed launch locally so My Profile can display it instantly.
     try{
       const profileKey='pixorun:profile:v2:'+account.toLowerCase();
       const saved=JSON.parse(localStorage.getItem(profileKey)||'null');
       const items=Array.isArray(saved?.items)?saved.items:[];
       if(!items.some(item=>item.token?.toLowerCase()===token.toLowerCase()))items.unshift({token,name,symbol,curve,creator:account,blockNumber:receipt.blockNumber,txHash});
       localStorage.setItem(profileKey,JSON.stringify({items,lastBlock:receipt.blockNumber}));
     }catch(storageError){console.warn('Could not cache PIXORUN launch for My Profile:',storageError);}
     // Save the launch metadata for automatic registry sync. No extra wallet signature.
     pendingRegistryTxHash=txHash;
     const pendingSync={txHash,account,metadata,logo};
     try{localStorage.setItem('pixorun:pending-registry-sync',JSON.stringify(pendingSync));}catch(storageError){console.warn('Could not persist pending registry sync:',storageError);}
     let globalRegistered=false;
     try{
       if(!window.PIXORUN_REGISTRY)throw new Error('Shared registry is not available.');
       await registerWithRetry(txHash,{metadata,logo});
       globalRegistered=true;pendingRegistryTxHash=null;
       try{localStorage.removeItem('pixorun:pending-registry-sync');}catch(_){}
     }catch(syncError){console.warn('PIXORUN registry sync pending:',syncError);setTimeout(resumePendingSync,2500);}
     $('resultToken').textContent=token;$('resultToken').href=explorer('address',token);
     $('resultCurve').textContent=curve;$('resultCurve').href=explorer('address',curve);
     $('resultTokenLabel')&&($('resultTokenLabel').textContent='TOKEN CONTRACT');
     $('resultCurveLabel')&&($('resultCurveLabel').textContent='BONDING CURVE');
     $('launchResult').hidden=false;
     status(globalRegistered?'Token launched successfully. It is now available across PIXORUN Discover.':'Token launched on-chain. Discover sync is retrying automatically.',globalRegistered?'success':'pending');
     if(globalRegistered){form.reset();updatePreview();previewLogo();}
   }catch(e){status(errorText(e),'error');}
   finally{launchBusy=false;setButton('LAUNCH TOKEN',false);}
 });
}
async function resumePendingSync(){
 if(!pendingRegistryTxHash)return;
 try{
  const saved=JSON.parse(localStorage.getItem('pixorun:pending-registry-sync')||'null');
  const payload=saved?.txHash?.toLowerCase()===pendingRegistryTxHash.toLowerCase()?{metadata:saved.metadata||null,logo:saved.logo||null}:undefined;
  if(!window.PIXORUN_REGISTRY)throw new Error('Shared registry is not available.');
  await registerWithRetry(pendingRegistryTxHash,payload);
  pendingRegistryTxHash=null;try{localStorage.removeItem('pixorun:pending-registry-sync');}catch(_){}
  status('Token launched successfully. It is now available across PIXORUN Discover.','success');
 }catch(error){console.warn('PIXORUN registry sync will retry:',error);status('Token is live on-chain. Discover sync is retrying automatically.','pending');setTimeout(resumePendingSync,30000);}
}
document.addEventListener('DOMContentLoaded',()=>{
 setup();
 try{const saved=JSON.parse(localStorage.getItem('pixorun:pending-registry-sync')||'null');if(saved?.txHash){pendingRegistryTxHash=saved.txHash;setTimeout(resumePendingSync,1200);}}
 catch(e){console.warn('Could not restore pending registry sync:',e);}
});
})();
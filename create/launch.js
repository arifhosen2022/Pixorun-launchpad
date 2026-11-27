(()=> {
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc';
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
let readProvider,readFactory,creationFee,launchBusy=false,pendingMetadataSync=null,pendingRegistryTxHash=null;
function walletProvider(){
 const injected=window.ethereum;
 const bitget=window.bitkeep?.ethereum;
 // If MetaMask is explicitly injected, never let a simultaneously installed
 // Bitget extension silently replace it.
 if(injected?.isMetaMask)return injected;
 if(window.bitkeep?.isBitKeep||bitget?.isBitKeep)return bitget||injected;
 return injected||bitget;
}
const isBitgetProvider=provider=>!!provider&&(
 provider===window.bitkeep?.ethereum ||
 provider.isBitKeep===true ||
 (window.bitkeep?.isBitKeep===true&&provider===window.ethereum)
);
const status=(message,type='info')=>{const el=$('launchStatus');if(el){el.textContent=message;el.dataset.type=type;}};
const fmt=v=>Number(ethers.formatEther(v)).toLocaleString(undefined,{maximumFractionDigits:6});
const explorer=(kind,address)=>EXPLORER+'/'+kind+'/'+address;
const timeout=(promise,label,ms=20000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out. Check your connection and reload.')),ms))]);
function errorText(e){
 const parts=[e?.shortMessage,e?.reason,e?.info?.error?.message,e?.error?.message,e?.data?.message,e?.message,e?.code&&('Wallet error code: '+e.code)];
 const msg=[...new Set(parts.filter(x=>typeof x==='string'&&x.trim()))].join(' — ');
 return (msg||'Token launch failed. Please try again.').slice(0,650);
}


const META_DB='pixorun-launch-metadata-v1';
function metadataDB(){
 return new Promise((resolve,reject)=>{
  if(!window.indexedDB){reject(new Error('This browser does not support local metadata recovery.'));return;}
  const request=indexedDB.open(META_DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('pending'))db.createObjectStore('pending');};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open metadata recovery storage.'));
 });
}
async function savePendingMetadata(pending){
 const db=await metadataDB();await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readwrite');tx.objectStore('pending').put(pending,pending.txHash.toLowerCase());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
async function loadPendingMetadata(hash){
 const db=await metadataDB();const value=await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readonly');const req=tx.objectStore('pending').get(hash.toLowerCase());req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});db.close();return value;
}
async function removePendingMetadata(hash){
 if(!hash||!window.indexedDB)return;const db=await metadataDB();await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readwrite');tx.objectStore('pending').delete(hash.toLowerCase());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
}
async function latestPendingMetadata(){
 if(!window.indexedDB)return null;const db=await metadataDB();const values=await new Promise((resolve,reject)=>{const tx=db.transaction('pending','readonly');const req=tx.objectStore('pending').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});db.close();return values.length?values[values.length-1]:null;
}

async function syncPendingMetadata(){
 let pending=pendingMetadataSync;
 if(!pending&&pendingRegistryTxHash){try{pending=await loadPendingMetadata(pendingRegistryTxHash);pendingMetadataSync=pending;}catch(_){}}
 if(!window.PIXORUN_REGISTRY)throw new Error('Shared registry is not available. Reload the page and retry.');
 if(!pending){if(!pendingRegistryTxHash)throw new Error('There is no pending launch sync.');await timeout(window.PIXORUN_REGISTRY.registerLaunch(pendingRegistryTxHash),'Global launch registration',30000);pendingRegistryTxHash=null;if($('retryMetadata'))$('retryMetadata').hidden=true;return true;}
 const p=walletProvider();if(!p)throw new Error('Open PIXORUN in the same wallet to sign the metadata.');
 const accounts=await p.request({method:'eth_accounts'});
 if(!accounts?.[0]||ethers.getAddress(accounts[0])!==pending.account)throw new Error('Reconnect the wallet that created this token before saving its metadata.');
 const logoHash=pending.logo?.sha256||'',bannerHash=pending.banner?.sha256||'';
 const message='PIXORUN_TOKEN_METADATA_V1\n'+pending.txHash.toLowerCase()+'\n'+JSON.stringify(pending.metadata)+'\n'+logoHash+'\n'+bannerHash;
 status('Approve one free wallet signature to publish the token details and images…','pending');
 const signature=await timeout(p.request({method:'personal_sign',params:[ethers.hexlify(ethers.toUtf8Bytes(message)),pending.account]}),'Metadata wallet signature',90000);
 await timeout(window.PIXORUN_REGISTRY.registerLaunch(pending.txHash,{metadata:pending.metadata,logo:pending.logo,banner:pending.banner,signature}),'Metadata upload and global sync',30000);
 await removePendingMetadata(pending.txHash);pendingMetadataSync=null;pendingRegistryTxHash=null;if($('retryMetadata'))$('retryMetadata').hidden=true;
 return true;
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
 $('factoryAddress').textContent=FACTORY;$('factoryAddress').href=explorer('address',FACTORY);
 $('factoryAddress').title=FACTORY;
 $('tokenName')?.addEventListener('input',updatePreview);
 $('tokenSymbol')?.addEventListener('input',updatePreview);
 $('tokenLogo')?.addEventListener('change',previewLogo);
 $('tokenBanner')?.addEventListener('change',()=>{const file=$('tokenBanner').files?.[0];if(file&&file.size>2*1024*1024){$('tokenBanner').value='';status('Banner image must be 2 MB or smaller.','error');}});
 updatePreview();previewLogo();
 $('retryMetadata')?.addEventListener('click',async()=>{const b=$('retryMetadata');b.disabled=true;try{await syncPendingMetadata();status('Token and shared listing are now synced across PIXORUN.','success');}catch(e){status('Metadata save failed: '+errorText(e),'error');}finally{b.disabled=false;}});
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
   setButton('CONNECT WALLET & LAUNCH TOKEN',false);
   status('Launchpad verified. Enter your token name and ticker, then connect your wallet to continue.','success');
 }catch(e){
   $('creationFee').textContent='Unavailable';
   $('networkStatus')&&($('networkStatus').textContent='Not verified');
   status(errorText(e),'error');setButton('LAUNCHPAD UNAVAILABLE',true);return;
 }
 btn.addEventListener('click',async()=>{
   if(launchBusy)return;
   launchBusy=true;setButton('PREPARING TRANSACTION…',true);
   try{
     const name=$('tokenName').value.trim(),symbol=$('tokenSymbol').value.trim();
     if(!name||new TextEncoder().encode(name).length>32)throw new Error('Enter a token name. It must be 1–32 UTF-8 bytes.');
     if(!/^[A-Za-z0-9]{1,10}$/.test(symbol))throw new Error('Ticker must be 1–10 English letters or numbers, without spaces or symbols.');
     const metadata={description:String($('tokenDescription')?.value||'').trim()||null,websiteUrl:cleanUrl($('tokenWebsite')?.value,'website')||null,xUrl:cleanUrl($('tokenX')?.value,'X',/(^|\.)((x|twitter)\.com)$/i)||null,telegramUrl:cleanUrl($('tokenTelegram')?.value,'Telegram',/(^|\.)((t\.me|telegram\.me))$/i)||null};
     const logo=await readImage($('tokenLogo')?.files?.[0],'Token logo');
     const banner=await readImage($('tokenBanner')?.files?.[0],'Banner image');
     const hasMetadata=Object.values(metadata).some(Boolean)||!!logo||!!banner;
     await switchToTestnet();
     status('Requesting wallet connection…','pending');
     const provider=walletProvider();
     if(!provider)throw new Error('Bitget Wallet provider was not detected. Reopen PIXORUN in the Bitget DApp browser.');
     const accounts=await timeout(provider.request({method:'eth_requestAccounts'}),'Wallet connection',60000);
     if(!accounts?.length)throw new Error('Wallet connection was not approved.');
     const account=ethers.getAddress(accounts[0]);
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
     // Publish the confirmed transaction to the shared Supabase registry.
     pendingRegistryTxHash=txHash;
     let globalRegistered=false;
     try{
       const profileKey='pixorun:profile:v2:'+account.toLowerCase();
       const saved=JSON.parse(localStorage.getItem(profileKey)||'null');
       const items=Array.isArray(saved?.items)?saved.items:[];
       if(!items.some(item=>item.token?.toLowerCase()===token.toLowerCase()))items.unshift({token,name,symbol,curve,creator:account,blockNumber:receipt.blockNumber,txHash});
       localStorage.setItem(profileKey,JSON.stringify({items,lastBlock:receipt.blockNumber}));
       pendingRegistryTxHash=txHash;
       if(hasMetadata){pendingMetadataSync={txHash,account,metadata,logo,banner};await savePendingMetadata(pendingMetadataSync);}
       if(window.PIXORUN_REGISTRY){
         if(hasMetadata)await syncPendingMetadata();
         else {await timeout(window.PIXORUN_REGISTRY.registerLaunch(txHash),'Global launch registration',30000);pendingRegistryTxHash=null;}
         globalRegistered=true;
       }
     }catch(syncError){console.warn('PIXORUN global registry sync pending:',syncError);if((pendingMetadataSync||pendingRegistryTxHash)&&$('retryMetadata'))$('retryMetadata').hidden=false;}
     $('resultToken').textContent=token;$('resultToken').href=explorer('address',token);
     $('resultCurve').textContent=curve;$('resultCurve').href=explorer('address',curve);
     $('resultTokenLabel')&&($('resultTokenLabel').textContent='TOKEN CONTRACT');
     $('resultCurveLabel')&&($('resultCurveLabel').textContent='BONDING CURVE');
     $('launchResult').hidden=false;if((pendingMetadataSync||pendingRegistryTxHash)&&$('retryMetadata'))$('retryMetadata').hidden=false;
     status(globalRegistered?(hasMetadata?'Success! Your token and metadata are now visible across PIXORUN.':'Success! Your token is now visible across PIXORUN.'):'Token deployed, but shared listing/metadata sync is pending. Use Retry shared sync below.','success');
     if(globalRegistered){form.reset();updatePreview();previewLogo();}
   }catch(e){status(errorText(e),'error');}
   finally{launchBusy=false;setButton('CONNECT WALLET & LAUNCH TOKEN',false);}
 });
}
document.addEventListener('DOMContentLoaded',async()=>{setup();try{const pending=await latestPendingMetadata();if(pending){pendingMetadataSync=pending;pendingRegistryTxHash=pending.txHash;if($('retryMetadata'))$('retryMetadata').hidden=false;status('A token metadata upload is waiting for your wallet signature. Use Retry metadata save to continue.','pending');}}catch(e){console.warn('Could not restore pending metadata:',e);}});
})();
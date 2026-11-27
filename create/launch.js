(()=> {
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc';
const CHAIN_ID=46630;
const CHAIN_HEX='0xb626';
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
const status=(message,type='info')=>{const el=$('launchStatus');if(el){el.textContent=message;el.dataset.type=type;}};
const explorer=(kind,address)=>EXPLORER+'/'+kind+'/'+address;
const fmt=v=>Number(ethers.formatEther(v)).toLocaleString(undefined,{maximumFractionDigits:6});
const timeout=(promise,label,ms=15000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timed out. Check the Robinhood Testnet RPC connection and reload.')),ms))]);
async function walletChainId(){const id=await timeout(window.ethereum.request({method:'eth_chainId'}),'Wallet network check');return Number(BigInt(id));}
async function setup(){
 const btn=$('launchBtn'),form=$('launchForm');
 if(!btn||!form)return;
 if(!window.ethereum){status('Open this page in Zerion, Bitget, MetaMask or another compatible EVM wallet browser.','error');btn.disabled=true;return;}
 btn.disabled=true;
 status('Launch checker started. Preparing Robinhood Testnet RPC…','pending');
 let readProvider,readFactory;
 try{
   if(!window.ethers)throw new Error('Ethers library did not load. Refresh the page and try again.');
   readProvider=new ethers.JsonRpcProvider(RPC,{chainId:CHAIN_ID,name:'Robinhood Chain Testnet'},{staticNetwork:true});
   status('Connecting to Robinhood Chain Testnet RPC…','pending');
   const rpcNetwork=await timeout(readProvider.getNetwork(),'Robinhood Testnet RPC');
   status('Robinhood Testnet RPC connected. Checking Launchpad Factory bytecode…','pending');
   if(Number(rpcNetwork.chainId)!==CHAIN_ID)throw new Error('The configured RPC did not return Robinhood Chain Testnet (46630).');
   const code=await timeout(readProvider.getCode(FACTORY),'Launchpad Factory lookup');
   status('Factory bytecode found. Reading Factory settings…','pending');
   if(!code||code==='0x')throw new Error('No contract bytecode exists at the configured Launchpad Factory address on Robinhood Chain Testnet. Token creation is paused.');
   readFactory=new ethers.Contract(FACTORY,ABI,readProvider);
   const [fee,swapFactory,feeDistributor]=await timeout(Promise.all([readFactory.creationFee(),readFactory.swapFactory(),readFactory.feeDistributor()]),'Factory configuration read');
   if(swapFactory===ethers.ZeroAddress)throw new Error('Launchpad Factory is not linked to PIXORUN Swap Factory. Token creation is paused.');
   $('creationFee').textContent=fmt(fee)+' ETH';
   $('factoryAddress').textContent=FACTORY;$('factoryAddress').href=explorer('address',FACTORY);
   $('swapAddress').textContent=swapFactory;$('swapAddress').href=explorer('address',swapFactory);
   $('feeAddress').textContent=feeDistributor;$('feeAddress').href=explorer('address',feeDistributor);
   const walletChain=await walletChainId();
   btn.disabled=false;
   if(walletChain!==CHAIN_ID){btn.textContent='SWITCH NETWORK TO CONTINUE';status('Factory verified. Switch your wallet to Robinhood Chain Testnet (46630) to launch.','success');}
   else{btn.textContent='CONNECT WALLET TO LAUNCH';status('Factory verified on Robinhood Chain Testnet. Connect your wallet to create a token.','success');}
 }catch(e){
   $('creationFee').textContent='Unable to read';
   status(e.shortMessage||e.message||'Could not read PIXORUN Factory.','error');
   btn.disabled=true;
   return;
 }
 btn.addEventListener('click',async()=>{
   btn.disabled=true;btn.textContent='CHECKING WALLET…';
   try{
     if(!window.ethereum)throw new Error('No EVM wallet detected.');
     let chain=await walletChainId();
     if(chain!==CHAIN_ID){
       status('Please approve switching to Robinhood Chain Testnet.','pending');
       try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]});}
       catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});}
       chain=await walletChainId();
       if(chain!==CHAIN_ID)throw new Error('Robinhood Chain Testnet is not selected.');
     }
     const name=$('tokenName').value.trim(),symbol=$('tokenSymbol').value.trim();
     if(!name||new TextEncoder().encode(name).length>32)throw new Error('Token name is required and must be at most 32 bytes.');
     if(!/^[A-Za-z0-9]{1,10}$/.test(symbol))throw new Error('Ticker must contain 1–10 English letters or numbers.');
     const accounts=await timeout(window.ethereum.request({method:'eth_requestAccounts'}),'Wallet connection');
     if(!accounts||!accounts.length)throw new Error('Connect a wallet to continue.');
     const walletProvider=new ethers.BrowserProvider(window.ethereum,'any');
     const signer=await timeout(walletProvider.getSigner(),'Wallet signer');
     const factory=new ethers.Contract(FACTORY,ABI,signer);
     const fee=await timeout(readFactory.creationFee(),'Creation fee read');
     const balance=await timeout(readProvider.getBalance(accounts[0]),'Wallet balance read');
     if(balance<fee)throw new Error('Insufficient testnet ETH for the creation fee and network gas.');
     status('Please confirm the token launch transaction in your wallet. Creation fee: '+fmt(fee)+' ETH, plus network gas.','pending');
     btn.textContent='WAITING FOR WALLET…';
     const tx=await timeout(factory.createLaunch(name,symbol,{value:fee,gasLimit:6000000}),'Wallet transaction request',45000);
     status('Transaction submitted: '+tx.hash+'. Waiting for confirmation…','pending');
     btn.textContent='CONFIRMING…';
     const receipt=await timeout(tx.wait(),'Transaction confirmation',120000);
     if(!receipt||receipt.status!==1)throw new Error('Transaction was not successful. Check the transaction on the explorer: '+explorer('tx',tx.hash));
     let token='',curve='';
     for(const log of receipt.logs){try{const parsed=factory.interface.parseLog(log);if(parsed&&parsed.name==='LaunchCreated'){token=parsed.args.token;curve=parsed.args.curve;break;}}catch(_){}}
     if(!token||!curve)throw new Error('Transaction confirmed, but LaunchCreated event could not be read. Check: '+explorer('tx',tx.hash));
     $('resultToken').textContent=token;$('resultToken').href=explorer('address',token);
     $('resultCurve').textContent=curve;$('resultCurve').href=explorer('address',curve);
     $('resultTx').href=explorer('tx',tx.hash);$('launchResult').hidden=false;
     status('Token created successfully on Robinhood Chain Testnet.','success');form.reset();
   }catch(e){status(e.shortMessage||e.reason||e.message||'Token launch failed.','error');}
   finally{btn.disabled=false;btn.textContent='CONNECT WALLET TO LAUNCH';}
 });
}
document.addEventListener('DOMContentLoaded',setup);
})();
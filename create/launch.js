(()=> {
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc';
const CHAIN_ID=46630;
const EXPLORER='https://explorer.testnet.chain.robinhood.com';
const ABI=[
 'function creationFee() view returns (uint256)',
 'function swapFactory() view returns (address)',
 'function feeDistributor() view returns (address)',
 'function createLaunch(string name,string symbol) payable returns (address tokenAddress,address curveAddress)',
 'event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)'
];
const $=id=>document.getElementById(id);
const status=(message,type='info')=>{const el=$('launchStatus');el.textContent=message;el.dataset.type=type;};
const explorer=(kind,address)=>EXPLORER+'/'+kind+'/'+address;
const fmt=(v)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:6});
async function setup(){
 const btn=$('launchBtn'), form=$('launchForm');
 if(!btn||!form)return;
 if(!window.ethereum){status('Open this page in MetaMask or another compatible EVM wallet browser.','error');btn.disabled=true;return;}
 const provider=new ethers.BrowserProvider(window.ethereum);
 try{
   const net=await provider.getNetwork();
   if(Number(net.chainId)!==CHAIN_ID){status('Your wallet is on the wrong network. Connect and switch to Robinhood Chain Testnet to continue.','error');}
   const code=await provider.getCode(FACTORY);
   if(code==='0x'){status('Launchpad Factory bytecode was not found at the configured address. Token creation is paused.','error');btn.disabled=true;return;}
   const readFactory=new ethers.Contract(FACTORY,ABI,provider);
   const [fee,swapFactory,feeDistributor]=await Promise.all([readFactory.creationFee(),readFactory.swapFactory(),readFactory.feeDistributor()]);
   if(swapFactory===ethers.ZeroAddress){status('Launchpad Factory is not linked to PIXORUN Swap Factory. Token creation is paused.','error');btn.disabled=true;return;}
   $('creationFee').textContent=fmt(ethers.formatEther(fee))+' ETH';
   $('factoryAddress').textContent=FACTORY;
   $('factoryAddress').href=explorer('address',FACTORY);
   $('swapAddress').textContent=swapFactory;
   $('swapAddress').href=explorer('address',swapFactory);
   $('feeAddress').textContent=feeDistributor;
   $('feeAddress').href=explorer('address',feeDistributor);
   $('launchBtn').disabled=false;
   $('launchBtn').textContent='CONNECT WALLET TO LAUNCH';
   status('Factory code and factory links detected. Connect your wallet to create a token.','success');
 }catch(e){status('Could not read the launchpad contracts: '+(e.shortMessage||e.message),'error');btn.disabled=true;}
 btn.addEventListener('click',async()=>{
   btn.disabled=true;
   try{
     if(!window.ethereum)throw new Error('No EVM wallet detected.');
     let net=await provider.getNetwork();
     if(Number(net.chainId)!==CHAIN_ID){
       status('Please switch your wallet to Robinhood Chain Testnet.','error');
       try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xb626'}]});}
       catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0xb626',chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://rpc.testnet.chain.robinhood.com'],blockExplorerUrls:[EXPLORER]}]});}
       net=await provider.getNetwork();
       if(Number(net.chainId)!==CHAIN_ID)throw new Error('Robinhood Chain Testnet is not selected.');
     }
     const name=$('tokenName').value.trim(),symbol=$('tokenSymbol').value.trim();
     if(!name||new TextEncoder().encode(name).length>32)throw new Error('Token name is required and must be at most 32 bytes.');
     if(!/^[A-Za-z0-9]{1,10}$/.test(symbol))throw new Error('Ticker must contain 1–10 English letters or numbers.');
     const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
     if(!accounts||!accounts.length)throw new Error('Connect a wallet to continue.');
     const signer=await provider.getSigner();
     const factory=new ethers.Contract(FACTORY,ABI,signer);
     const fee=await factory.creationFee();
     status('Please confirm the token launch transaction in your wallet. Creation fee: '+fmt(ethers.formatEther(fee))+' ETH, plus network gas.');
     btn.textContent='WAITING FOR WALLET…';
     const tx=await factory.createLaunch(name,symbol,{value:fee});
     status('Transaction submitted: '+tx.hash+'. Waiting for confirmation…','pending');
     btn.textContent='CONFIRMING…';
     const receipt=await tx.wait();
     if(!receipt||receipt.status!==1)throw new Error('Transaction was not successful.');
     let token='',curve='';
     for(const log of receipt.logs){
       try{const parsed=factory.interface.parseLog(log);if(parsed&&parsed.name==='LaunchCreated'){token=parsed.args.token;curve=parsed.args.curve;break;}}catch(_){}
     }
     if(!token||!curve)throw new Error('Transaction confirmed, but LaunchCreated event could not be read. Check the transaction on the explorer: '+explorer('tx',tx.hash));
     $('resultToken').textContent=token;
     $('resultToken').href=explorer('address',token);
     $('resultCurve').textContent=curve;
     $('resultCurve').href=explorer('address',curve);
     $('resultTx').href=explorer('tx',tx.hash);
     $('launchResult').hidden=false;
     status('Token created successfully. The token and bonding curve are now on Robinhood Chain Testnet.','success');
     form.reset();
   }catch(e){status(e.shortMessage||e.reason||e.message||'Token launch failed.','error');}
   finally{btn.disabled=false;btn.textContent='CONNECT WALLET TO LAUNCH';}
 });
}
document.addEventListener('DOMContentLoaded',setup);
})();
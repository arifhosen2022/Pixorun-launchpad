(()=>{
'use strict';
const CHAIN='0xb626',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const network={chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]};
const $=(s,r=document)=>r.querySelector(s);let account=null,chainId=null,connecting=false,locallyDisconnected=false;
const pathNow=location.pathname;
const basePath=pathNow.startsWith('/Pixorun-launchpad/launchpad/')?'/Pixorun-launchpad/launchpad/':(pathNow.startsWith('/launchpad/')?'/launchpad/':'/');
const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'';
function walletProvider(){const injected=window.ethereum,bitget=window.bitkeep?.ethereum;if(injected?.isMetaMask)return injected;if(window.bitkeep?.isBitKeep||bitget?.isBitKeep)return bitget||injected;return injected||bitget||null;}
function status(m){document.querySelectorAll('[data-status]').forEach(e=>e.textContent=m);}
function controls(){
 const nav=$('.nav-right');if(!nav||$('.home-wallet',nav))return;
 const wrap=document.createElement('div');wrap.className='home-wallet';wrap.setAttribute('data-home-wallet','');
 wrap.innerHTML='<button type="button" class="wallet-trigger" data-wallet-trigger aria-expanded="false">CONNECT WALLET</button><div class="wallet-dropdown" data-wallet-dropdown hidden><button type="button" data-network-switch hidden>Switch Network</button><button type="button" data-disconnect>Disconnect Wallet</button></div>';
 const menu=$('.app-menu',nav);nav.insertBefore(wrap,menu||null);
}
document.querySelectorAll('.app-menu nav a, a.app-logo').forEach(a=>{const h=a.getAttribute('href');if(h&&h.startsWith('/'))a.setAttribute('href',basePath+h.replace(/^\/+/,''));});
controls();
async function readState(){const p=walletProvider();if(!p)return;try{const [a,c]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);account=locallyDisconnected?null:(a?.[0]||null);chainId=c?.toLowerCase()||null;}catch(e){console.warn('PIXORUN wallet state',e);}}
async function switchNetwork(){const p=walletProvider();if(!p)throw Error('No compatible EVM wallet found.');try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[network]});}locallyDisconnected=false;await readState();render();if(chainId!==CHAIN)throw Error('Robinhood Chain Testnet was not selected.');status('Robinhood Chain Testnet selected.');}
async function connect(){const p=walletProvider();if(!p)throw Error('Open PIXORUN in MetaMask or Bitget Wallet browser.');locallyDisconnected=false;const a=await p.request({method:'eth_requestAccounts'});if(!a?.length)throw Error('No wallet account selected.');account=a[0];chainId=(await p.request({method:'eth_chainId'})).toLowerCase();if(chainId!==CHAIN){status('Wrong network. Requesting Robinhood Chain Testnet…');await switchNetwork();}await readState();render();status('Wallet connected.');}
async function balance(a){const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[a,'latest']})});const j=await r.json();if(j.error)throw Error(j.error.message);return (Number(BigInt(j.result))/1e18).toFixed(5)+' ETH';}
function render(){
 const trigger=$('[data-wallet-trigger]'),menu=$('[data-wallet-dropdown]'),sw=$('[data-network-switch]');
 if(trigger)trigger.textContent=account?short(account):'CONNECT WALLET';
 if(sw)sw.hidden=!account||chainId===CHAIN;
 document.querySelectorAll('[data-wallet-address]').forEach(e=>e.textContent=account||'Not connected');
 document.querySelectorAll('[data-wallet-balance]').forEach(e=>{if(!account){e.textContent='Connect wallet to view balance';return;}e.textContent='Loading…';balance(account).then(v=>{if(account&&e.isConnected)e.textContent=v;}).catch(err=>{if(e.isConnected)e.textContent='Balance unavailable';console.warn(err);});});
 document.querySelectorAll('[data-wallet-explorer]').forEach(a=>{a.href=account?EXPLORER+'/address/'+account:'#';a.hidden=!account;});
 document.querySelectorAll('[data-connect]').forEach(b=>{b.textContent=account?short(account):'CONNECT WALLET';b.disabled=false;});
 if(!account&&menu){menu.hidden=true;trigger?.setAttribute('aria-expanded','false');}
}
document.addEventListener('click',async e=>{
 const trigger=e.target.closest('[data-wallet-trigger]');if(trigger){if(!account){if(connecting)return;connecting=true;trigger.disabled=true;status('Connecting wallet…');try{await connect();}catch(err){status(err.message||'Wallet connection failed.');}finally{connecting=false;trigger.disabled=false;}return;}const d=$('[data-wallet-dropdown]');if(d){d.hidden=!d.hidden;trigger.setAttribute('aria-expanded',String(!d.hidden));}return;}
 const sw=e.target.closest('[data-network-switch]');if(sw){sw.disabled=true;try{await switchNetwork();}catch(err){status(err.message||'Network switch failed.');}finally{sw.disabled=false;}return;}
 const dis=e.target.closest('[data-disconnect]');if(dis){locallyDisconnected=true;account=null;render();status('Disconnected from this PIXORUN page.');const d=$('[data-wallet-dropdown]');if(d)d.hidden=true;return;}
 const cp=e.target.closest('[data-copy-wallet]');if(cp){if(!account){status('Connect your wallet first.');return;}try{await navigator.clipboard.writeText(account);status('Wallet address copied.');}catch{status('Could not copy automatically.');}return;}
 const generic=e.target.closest('[data-connect]');if(generic){try{await connect();}catch(err){status(err.message||'Wallet connection failed.');}}
});
const providers=[window.ethereum,window.bitkeep?.ethereum].filter(Boolean);for(const p of providers){p.on?.('accountsChanged',async()=>{locallyDisconnected=false;await readState();render();});p.on?.('chainChanged',async()=>{await readState();render();if(account&&chainId!==CHAIN)status('Wrong network. Switch to Robinhood Chain Testnet.');});}
readState().then(render);
})();
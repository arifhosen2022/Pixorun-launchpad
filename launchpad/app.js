(()=>{
const CHAIN='0xb626',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const network={chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]};
const $=s=>document.querySelector(s);let account=null,chainId=null;
const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'';
const status=m=>{const e=$('[data-status]');if(e)e.textContent=m};
async function readState(){if(!window.ethereum)return;try{const [a,c]=await Promise.all([window.ethereum.request({method:'eth_accounts'}),window.ethereum.request({method:'eth_chainId'})]);account=a?.[0]||null;chainId=c?.toLowerCase()||null}catch{}}
async function switchNetwork(){if(!window.ethereum)throw Error('No compatible EVM wallet found.');try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]})}catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[network]})}await readState();render();if(chainId!==CHAIN)throw Error('Robinhood Chain Testnet was not selected.');status('Robinhood Chain Testnet selected.')}
async function connect(){if(!window.ethereum)throw Error('Open PIXORUN in MetaMask or a compatible wallet browser.');const a=await window.ethereum.request({method:'eth_requestAccounts'});if(!a?.length)throw Error('No wallet account selected.');await readState();if(chainId!==CHAIN)await switchNetwork();await readState();render();status('Wallet connected.')}
async function balance(a){const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[a,'latest']})});const j=await r.json();if(j.error)throw Error(j.error.message);return (Number(BigInt(j.result))/1e18).toFixed(5)+' ETH'}
function render(){
 const home=$('[data-home-wallet]'),trigger=$('[data-wallet-trigger]'),menu=$('[data-wallet-dropdown]'),sw=$('[data-network-switch]'),addr=$('[data-wallet-address]'),bal=$('[data-wallet-balance]');
 if(trigger){trigger.textContent=account?short(account):'CONNECT WALLET';trigger.setAttribute('aria-expanded','false');}
 if(menu)menu.hidden=!account;
 if(sw)sw.hidden=!account||chainId===CHAIN;
 if(addr)addr.textContent=account||'Not connected';
 if(bal){bal.textContent=account?'Loading…':'Connect wallet to view balance';if(account)balance(account).then(v=>{if(bal)bal.textContent=v}).catch(e=>{if(bal)bal.textContent=e.message})}
 document.querySelectorAll('[data-wallet-explorer]').forEach(a=>{a.href=account?EXPLORER+'/address/'+account:'#';a.hidden=!account});
 document.querySelectorAll('[data-connect]').forEach(b=>{b.textContent=account?short(account):'CONNECT WALLET';b.hidden=!home;b.disabled=false});
}
document.querySelectorAll('[data-wallet-trigger]').forEach(b=>b.addEventListener('click',async()=>{if(!account){b.disabled=true;try{await connect()}catch(e){status(e.message)}finally{b.disabled=false}return}const d=$('[data-wallet-dropdown]');if(d){d.hidden=!d.hidden;b.setAttribute('aria-expanded',String(!d.hidden))}}));
document.querySelectorAll('[data-connect]').forEach(b=>b.addEventListener('click',async()=>{try{await connect()}catch(e){status(e.message)}}));
document.querySelectorAll('[data-network-switch]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await switchNetwork()}catch(e){status(e.message)}finally{b.disabled=false}}));
document.querySelectorAll('[data-disconnect]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{if(window.ethereum?.request)await window.ethereum.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});account=null;await readState();render();status('Wallet disconnected from PIXORUN.')}catch(e){account=null;render();status('Wallet app থেকে PIXORUN-এর site permission disconnect করতে হতে পারে.')}finally{b.disabled=false;const d=$('[data-wallet-dropdown]');if(d)d.hidden=true}}));
if(window.ethereum){window.ethereum.on?.('accountsChanged',async()=>{await readState();render()});window.ethereum.on?.('chainChanged',async()=>{await readState();render();if(chainId!==CHAIN)status('Wrong network. Switch to Robinhood Chain Testnet.')});}
readState().then(render);
})();
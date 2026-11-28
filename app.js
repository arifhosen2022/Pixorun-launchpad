(()=>{
'use strict';
const CHAIN='0xb626',RPC='https://rpc.testnet.chain.robinhood.com',RPC_FALLBACKS=['https://rpc.testnet.chain.robinhood.com','https://robinhood-sepolia-rpc.publicnode.com','https://robinhood-testnet.drpc.org'],EXPLORER='https://explorer.testnet.chain.robinhood.com',network={chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]};
const $=(s,r=document)=>r.querySelector(s);let account=null,chainId=null,connecting=false,locallyDisconnected=localStorage.getItem('pixorun:wallet-disconnected')==='1',selectedId=localStorage.getItem('pixorun:selected-wallet')||'',selectedRdns=localStorage.getItem('pixorun:selected-wallet-rdns')||'';const providers=new Map();
function remember(id){selectedId=id;const item=providers.get(id);if(item?.info?.rdns){selectedRdns=item.info.rdns;localStorage.setItem('pixorun:selected-wallet-rdns',selectedRdns);}localStorage.setItem('pixorun:selected-wallet',selectedId);}
function add(info,p){
 if(!p)return;
 const label=(info?.name|| (p.isZerion?'Zerion':p.isRabby?'Rabby':p.isCoinbaseWallet?'Coinbase Wallet':p.isMetaMask?'MetaMask':'Browser Wallet')).trim();
 const name=label.toLowerCase();
 for(const [id,x] of providers){
  if(x.provider===p){
   if(info?.uuid && (!x.info?.uuid || x.info.uuid===id)){
    providers.delete(id);
    providers.set(info.uuid,{info:{...info,name:label},provider:p,nameKey:name});
    if(selectedId===id||selectedRdns&&selectedRdns===info.rdns){selectedId=info.uuid;localStorage.setItem('pixorun:selected-wallet',selectedId);}
   }
   return;
  }
  if(info?.uuid && x.info?.uuid===info.uuid)return;
 }
 const id=info?.uuid||('legacy-'+providers.size);
 providers.set(id,{info:{...info,name:label},provider:p,nameKey:name});
 if(info?.rdns&&selectedRdns===info.rdns){selectedId=id;localStorage.setItem('pixorun:selected-wallet',id);}
}
function discover(){
 try{
  (window.ethereum?.providers||[window.ethereum]).filter(Boolean).forEach((p,i)=>{
   const name=p.isZerion?'Zerion':p.isRabby?'Rabby':p.isCoinbaseWallet?'Coinbase Wallet':p.isMetaMask?'MetaMask':'Browser Wallet';
   add({uuid:'legacy-'+i,name},p);
  });
 }catch(_){}
 window.dispatchEvent(new Event('eip6963:requestProvider'));
}
let redrawPicker=null;
window.addEventListener('eip6963:announceProvider',async e=>{
 const info=e.detail?.info,p=e.detail?.provider;
 if(!info?.uuid||!p)return;
 add(info,p);listen(p);
 if(redrawPicker)redrawPicker();
 if(selectedId.startsWith('legacy-')&&!providers.has(selectedId)&&providers.size===1){selectedId=info.uuid;localStorage.setItem('pixorun:selected-wallet',selectedId);}if(selectedId===info.uuid||selectedId.startsWith('legacy-')||selectedRdns&&selectedRdns===info.rdns){await read();render();}
});const selected=()=>{let item=providers.get(selectedId);if(!item&&selectedRdns){for(const [id,x] of providers){if(x.info?.rdns===selectedRdns){selectedId=id;localStorage.setItem('pixorun:selected-wallet',id);item=x;break;}}}if(!item&&selectedId.startsWith('legacy-')&&providers.size===1){const [id,x]=providers.entries().next().value;selectedId=id;localStorage.setItem('pixorun:selected-wallet',id);item=x;}return item?.provider||null;};
function picker(){return new Promise(resolve=>{discover();let box=document.getElementById('pixorun-wallet-picker');if(!box){box=document.createElement('div');box.id='pixorun-wallet-picker';box.innerHTML='<div class="pw-backdrop" data-close></div><section class="pw-panel" role="dialog" aria-modal="true"><button class="pw-close" data-close>×</button><div class="pw-mark">P</div><h2>Connect a wallet</h2><p>Choose an installed wallet extension.</p><div class="pw-list"></div><div class="pw-empty" hidden>No injected wallets detected. Install MetaMask or Zerion and reload.</div></section>';document.body.append(box);box.addEventListener('click',e=>{if(e.target.closest('[data-close]')){box.remove();redrawPicker=null;resolve(null);return;}const b=e.target.closest('[data-id]');if(b){remember(b.dataset.id);const p=selected();box.remove();redrawPicker=null;resolve(p);}});}
const draw=()=>{if(!box.isConnected)return;const list=box.querySelector('.pw-list');list.replaceChildren();for(const [id,x] of providers){const b=document.createElement('button');b.className='pw-option';b.dataset.id=id;const n=x.info.name||'EVM Wallet';b.innerHTML='<span class="pw-icon">'+(n==='MetaMask'?'🦊':n==='Zerion'?'◈':'◇')+'</span><span><strong></strong><small>Detected extension</small></span><span class="pw-arrow">›</span>';b.querySelector('strong').textContent=n;list.append(b);}box.querySelector('.pw-empty').hidden=providers.size>0;};redrawPicker=draw;draw();setTimeout(draw,1200);});}
async function choose(){let p=selected();if(!p)p=await picker();if(!p)throw Error('Wallet selection cancelled.');return p;}
async function connect(){const provider=await choose();let a=await provider.request({method:'eth_accounts'});if(!a?.length)a=await provider.request({method:'eth_requestAccounts'});if(!a?.length)throw Error('No wallet account selected.');account=a[0];chainId=(await provider.request({method:'eth_chainId'})).toLowerCase();locallyDisconnected=false;localStorage.removeItem('pixorun:wallet-disconnected');return {provider,account,chainId};}
window.PIXORUN_WALLET={choose,connect,getProvider(){if(locallyDisconnected)return null;let p=selected();if(!p&&providers.size===1){const [id,item]=providers.entries().next().value;remember(id);p=item.provider;}return p;},async getAccounts(){const p=this.getProvider();return p?await p.request({method:'eth_accounts'}):[];},async getState(){const p=this.getProvider();if(!p)return {provider:null,account:null,chainId:null};const [accounts,chain]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);return {provider:p,account:locallyDisconnected?null:accounts?.[0]||null,chainId:chain?.toLowerCase()||null};}};
const pathNow=location.pathname,basePath=pathNow.startsWith('/Pixorun-launchpad/launchpad/')?'/Pixorun-launchpad/launchpad/':(pathNow.startsWith('/launchpad/')?'/launchpad/':'/'),short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'';
function status(m){document.querySelectorAll('[data-status]').forEach(e=>e.textContent=m);}
document.querySelectorAll('a[href^="/"]').forEach(a=>{const h=a.getAttribute('href');if(h)a.setAttribute('href',basePath+h.replace(/^\/+/,''));});
async function read(){const p=selected();if(!p)return;try{const [a,c]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);account=locallyDisconnected?null:a?.[0]||null;chainId=c?.toLowerCase()||null;}catch(_){}}
const walletBalanceCache=new Map();
async function balance(a){
 const key=String(a||'').toLowerCase(),now=Date.now(),cached=walletBalanceCache.get(key);
 if(cached?.value&&cached.expires>now)return cached.value;
 if(cached?.pending)return cached.pending;
 const pending=(async()=>{let lastError;for(const endpoint of RPC_FALLBACKS){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[a,'latest']})});if(!r.ok)throw Error('RPC returned '+r.status);const j=await r.json();if(j.error)throw Error(j.error.message||'RPC error');if(!j.result)throw Error('RPC returned no balance');const value=(Number(BigInt(j.result))/1e18).toFixed(5)+' ETH';walletBalanceCache.set(key,{value,expires:Date.now()+15000});return value;}catch(error){lastError=error;}finally{clearTimeout(timer);}}throw lastError||Error('All Robinhood RPC endpoints are unavailable.');})();
 walletBalanceCache.set(key,{pending});return pending;
}
function render(){window.dispatchEvent(new CustomEvent('pixorun:walletChanged',{detail:{account,chainId,provider:selected()}}));const t=$('[data-trigger], [data-wallet-trigger]'),d=$('[data-dropdown], [data-wallet-dropdown]'),s=$('[data-switch], [data-network-switch]');if(t)t.textContent=account?short(account):'CONNECT WALLET';if(s)s.hidden=!account||chainId===CHAIN;document.querySelectorAll('[data-wallet-address]').forEach(e=>e.textContent=account||'Not connected');document.querySelectorAll('[data-wallet-balance]').forEach(e=>{if(!account){e.textContent='Connect wallet to view balance';return;}const requested=account;e.textContent='Loading…';balance(requested).then(v=>{if(account===requested&&e.isConnected)e.textContent=v;}).catch(()=>{if(account===requested&&e.isConnected)e.textContent='Balance unavailable';});});document.querySelectorAll('[data-wallet-explorer]').forEach(a=>{a.href=account?EXPLORER+'/address/'+account:'#';a.hidden=!account;});if(!account&&d)d.hidden=true;}
async function switchNetwork(){const p=await choose();try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});}catch(e){if(e.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[network]});}await read();render();if(chainId!==CHAIN)throw Error('Robinhood Chain Testnet was not selected.');}
document.addEventListener('click',async e=>{const t=e.target.closest('[data-trigger], [data-wallet-trigger]');if(t){if(!account){if(connecting)return;connecting=true;t.disabled=true;try{await connect();await read();render();status('Wallet connected.');}catch(x){status(x.message||'Wallet connection failed.');}finally{connecting=false;t.disabled=false;}}else{const dd=$('[data-dropdown], [data-wallet-dropdown]');if(dd)dd.hidden=!dd.hidden;}return;}if(e.target.closest('[data-switch], [data-network-switch]')){try{await switchNetwork();}catch(x){status(x.message||'Network switch failed.');}return;}if(e.target.closest('[data-disconnect]')){locallyDisconnected=true;localStorage.setItem('pixorun:wallet-disconnected','1');account=null;render();status('Disconnected from this PIXORUN page.');const dd=$('[data-dropdown], [data-wallet-dropdown]');if(dd)dd.hidden=true;return;}if(e.target.closest('[data-copy-wallet]')){if(!account){status('Connect your wallet first.');return;}try{await navigator.clipboard.writeText(account);status('Wallet address copied.');}catch(_){status('Could not copy automatically.');}}});
function listen(p){p?.on?.('accountsChanged',async a=>{if(a?.length){locallyDisconnected=false;localStorage.removeItem('pixorun:wallet-disconnected');}await read();render();});p?.on?.('chainChanged',async()=>{await read();render();});}
// Shared navigation: identify the current page and dismiss the menu after selection or outside clicks.
function syncActiveMenu(){
 const current=location.pathname.replace(/\/+$/, '')||'/';
 document.querySelectorAll('.app-menu').forEach(menu=>{
  menu.querySelectorAll('nav a[href]').forEach(link=>{
   let target;try{target=new URL(link.href,location.href).pathname.replace(/\/+$/, '')||'/';}catch(_){return;}
   if(target===current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
 });
}
syncActiveMenu();
document.addEventListener('click',e=>{
 const inside=e.target.closest('.app-menu');
 if(!inside)document.querySelectorAll('.app-menu[open]').forEach(menu=>menu.removeAttribute('open'));
 else if(e.target.closest('nav a'))inside.removeAttribute('open');
});
discover();for(const x of providers.values())listen(x.provider);read().then(render);
})();
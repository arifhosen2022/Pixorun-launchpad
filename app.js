(()=>{
  const CHAIN='0xb626', RPC='https://rpc.testnet.chain.robinhood.com', EXPLORER='https://explorer.testnet.chain.robinhood.com', FAUCET='https://faucet.testnet.chain.robinhood.com/';
  const network={chainId:CHAIN,chainName:'Robinhood Chain Testnet',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]};
  const $=s=>document.querySelector(s); let account=null;
  const fmt=v=>(Number(v)/1e18).toFixed(5)+' ETH';
  const status=message=>{const el=$('[data-status]');if(el)el.textContent=message};
  async function switchNetwork(){
    if(!window.ethereum)throw Error('No EVM wallet detected. Open this page in your wallet browser.');
    try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]})}
    catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[network]})}
    const chain=await window.ethereum.request({method:'eth_chainId'});
    if(chain.toLowerCase()!==CHAIN)throw Error('Robinhood Chain Testnet was not selected.');
    status('Connected to Robinhood Chain Testnet.');
  }
  async function connect(){
    if(!window.ethereum)throw Error('No EVM wallet detected. Open this page in MetaMask or a compatible wallet.');
    const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
    if(!accounts.length)throw Error('No wallet account selected.');
    const chain=await window.ethereum.request({method:'eth_chainId'});
    if(chain.toLowerCase()!==CHAIN)await switchNetwork();
    account=accounts[0]; await render(); return account;
  }
  async function balance(address){
    const response=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[address,'latest']})});
    if(!response.ok)throw Error('Could not read testnet balance.');
    const data=await response.json();if(data.error)throw Error(data.error.message||'RPC error');return fmt(BigInt(data.result));
  }
  async function render(){
    const short=account?account.slice(0,6)+'…'+account.slice(-4):'CONNECT WALLET';
    document.querySelectorAll('[data-connect]').forEach(b=>{b.textContent=account?short:'CONNECT WALLET';b.disabled=false});
    const addr=$('[data-wallet-address]');if(addr)addr.textContent=account||'Not connected';
    const bal=$('[data-wallet-balance]');
    if(bal){bal.textContent=account?'Loading…':'Connect wallet to view balance';if(account){try{bal.textContent=await balance(account)}catch(e){bal.textContent=e.message}}}
    document.querySelectorAll('[data-wallet-explorer]').forEach(a=>{a.href=account?EXPLORER+'/address/'+account:'#';a.hidden=!account});
  }
  document.querySelectorAll('[data-connect]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;b.textContent='CONNECTING…';try{await connect();status('Wallet connected to Robinhood Chain Testnet.')}catch(e){b.disabled=false;b.textContent=account?account.slice(0,6)+'…'+account.slice(-4):'CONNECT WALLET';status(e.message)}}));
  document.querySelectorAll('[data-network-switch]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await switchNetwork()}catch(e){status(e.message)}finally{b.disabled=false}}));
  document.querySelectorAll('[data-disconnect]').forEach(b=>b.addEventListener('click',async()=>{
    b.disabled=true;
    try{
      if(window.ethereum?.disconnect){await window.ethereum.disconnect();account=null;await render();status('Wallet disconnected from PIXORUN.');}
      else if(window.ethereum?.request){await window.ethereum.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});account=null;await render();status('Wallet access revoked for PIXORUN.');}
      else throw Error('No wallet provider found.');
    }catch(e){status('এই wallet থেকে website permission revoke করা যাচ্ছে না। Wallet app-এর Connected sites / Permissions থেকে PIXORUN disconnect করুন।');}
    finally{b.disabled=false}
  }));
  document.querySelectorAll('[data-faucet]').forEach(a=>{a.href=FAUCET;a.target='_blank';a.rel='noopener noreferrer'});
  document.querySelectorAll('[data-copy-wallet]').forEach(b=>b.addEventListener('click',async()=>{if(!account){status('Connect your wallet first.');return}await navigator.clipboard.writeText(account);b.textContent='Copied'}));
  if(window.ethereum){
    window.ethereum.on?.('accountsChanged',a=>{account=a?.[0]||null;render()});
    window.ethereum.on?.('chainChanged',()=>{render();status('Network changed. Select Robinhood Chain Testnet to use PIXORUN.')});
    window.ethereum.request({method:'eth_accounts'}).then(a=>{if(a?.length){account=a[0];render()}}).catch(()=>{});
  }
  render().catch(()=>{});
})();
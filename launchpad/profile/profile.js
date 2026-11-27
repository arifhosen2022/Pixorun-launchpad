(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const iface=new ethers.Interface(['event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)']);
const provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true});
const status=document.getElementById('profileLaunchStatus'),list=document.getElementById('profileLaunches'),count=document.getElementById('profileLaunchCount');
async function load(){
 try{const p=window.ethereum?.isMetaMask?window.ethereum:(window.bitkeep?.ethereum||window.ethereum),accounts=p?await p.request({method:'eth_accounts'}):[],account=accounts?.[0];if(!account){status.textContent='Connect your wallet to load your on-chain launches.';return;}
 const topic=iface.getEvent('LaunchCreated').topicHash,filter=ethers.zeroPadValue(account,32),latest=await provider.getBlockNumber(),logs=[];
 for(let from=0;from<=latest;from+=10000){logs.push(...await provider.getLogs({address:FACTORY,topics:[topic,filter],fromBlock:from,toBlock:Math.min(from+9999,latest)}));}
 list.replaceChildren();count.textContent=String(logs.length);
 if(!logs.length){list.textContent='No token launches found for this wallet yet.';}else{for(const log of logs.reverse()){const e=iface.parseLog(log),card=document.createElement('div');card.className='app-card';card.style.margin='10px 0';const title=document.createElement('strong');title.textContent=e.args.name+' ($'+e.args.symbol+')';const link=document.createElement('a');link.href=EXPLORER+'/address/'+e.args.token;link.target='_blank';link.rel='noopener noreferrer';link.className='app-btn secondary';link.textContent='View token ↗';card.append(title,document.createElement('br'),link);list.append(card);}}
 status.textContent='Your launches are verified from the PIXORUN Launchpad Factory.';
 }catch(e){status.textContent='Could not load token history: '+(e.shortMessage||e.message||'RPC error');}
}
const p=window.ethereum?.isMetaMask?window.ethereum:(window.bitkeep?.ethereum||window.ethereum);p?.on?.('accountsChanged',load);load();
})();
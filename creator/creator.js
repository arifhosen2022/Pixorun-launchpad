(()=>{
'use strict';
const FACTORY='0xD3B77BaA03b128f348fc45c133248b0070C1b7bc',FEE='0x2C1Bc9d4e1D262CbCb3474bAc13b666B241A6dbF',RPC='https://rpc.testnet.chain.robinhood.com',EXPLORER='https://explorer.testnet.chain.robinhood.com';
const iface=new ethers.Interface(['event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)']);
const feeAbi=['function creatorClaimable(address) view returns(uint256)','function claimCreatorFees()'];
const curveAbi=['function graduated() view returns(bool)'];
const provider=new ethers.JsonRpcProvider(RPC,{chainId:46630,name:'Robinhood Chain Testnet'},{staticNetwork:true});
const $=id=>document.getElementById(id),status=m=>{if($('creatorStatus'))$('creatorStatus').textContent=m;};
const fmt=v=>Number(ethers.formatEther(v)).toFixed(6)+' ETH';
async function load(){
 try{
  const accounts=await (window.bitkeep?.ethereum||window.ethereum)?.request({method:'eth_accounts'});
  const account=accounts?.[0];if(!account){status('Connect your wallet to load your creator activity.');return;}
  $('creatorWallet')&&($('creatorWallet').textContent=account);
  const fee=new ethers.Contract(FEE,feeAbi,provider),claimable=await fee.creatorClaimable(account);
  $('creatorClaimable')&&($('creatorClaimable').textContent=fmt(claimable));
  $('creatorClaim')&&($('creatorClaim').disabled=claimable===0n);
  const topic=iface.getEvent('LaunchCreated').topicHash,creatorTopic=ethers.zeroPadValue(account,32);
  const latest=await provider.getBlockNumber(),logs=[];
  for(let from=0;from<=latest;from+=10000){const to=Math.min(from+9999,latest);logs.push(...await provider.getLogs({address:FACTORY,topics:[topic,creatorTopic],fromBlock:from,toBlock:to}));}
  const list=$('creatorLaunches');if(list){list.replaceChildren();if(!logs.length){list.textContent='No token launches found for this wallet yet.';}else{for(const log of logs.reverse()){const p=iface.parseLog(log),a=document.createElement('a');a.href=EXPLORER+'/address/'+p.args.token;a.target='_blank';a.rel='noopener noreferrer';a.className='app-btn secondary';a.style.margin='6px';a.textContent=p.args.name+' ($'+p.args.symbol+') · '+p.args.token.slice(0,6)+'…'+p.args.token.slice(-4);list.append(a);}}}
  $('creatorCount')&&($('creatorCount').textContent=String(logs.length));
  status('Creator data loaded from Robinhood Chain Testnet.');
 }catch(e){status('Could not load creator data: '+(e.shortMessage||e.message||'RPC error'));}
}
$('creatorClaim')?.addEventListener('click',async()=>{
 try{const p=window.bitkeep?.ethereum||window.ethereum;if(!p)throw Error('Open this page in your EVM wallet browser.');const a=(await p.request({method:'eth_requestAccounts'}))[0];const signer=new ethers.BrowserProvider(p).getSigner();const contract=new ethers.Contract(FEE,feeAbi,await signer);$('creatorClaim').disabled=true;status('Confirm the creator fee claim in your wallet…');const tx=await contract.claimCreatorFees();status('Claim submitted: '+tx.hash);await tx.wait();status('Creator fees claimed successfully.');await load();}catch(e){status(e.shortMessage||e.message||'Claim failed.');$('creatorClaim').disabled=false;}
});
load();
})();
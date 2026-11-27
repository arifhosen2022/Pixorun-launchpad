# PIXORUN Launchpad

PIXORUN is a testnet token launchpad built for Robinhood Chain Testnet.

## Website
- Main site: https://launchpad.pixorun.xyz/
- Token creation: https://launchpad.pixorun.xyz/create/
- Explore launches: https://launchpad.pixorun.xyz/missions/

## Network
- Robinhood Chain Testnet
- Chain ID: 46630 (0xb626)
- RPC: https://rpc.testnet.chain.robinhood.com
- Explorer: https://explorer.testnet.chain.robinhood.com
- Native currency: ETH

## Deployed contracts
- Launchpad Factory: 0xD3B77BaA03b128f348fc45c133248b0070C1b7bc
- Swap Factory: 0xCC423d983E12f044F9F930463ADe7Ce150a8A644
- Fee Distributor: 0x2C1Bc9d4e1D262CbCb3474bAc13b666B241A6dbF
- Staking Rewards: not deployed/configured (zero address)

## Current functionality
- Create fixed-supply ERC-20 tokens and bonding curves through the deployed Launchpad Factory.
- Explore Missions reads LaunchCreated events directly from the factory.
- Creator Studio reads launches for the connected wallet and supports creator-fee claims.
- Profile reads the connected wallet's on-chain PIXORUN launches.
- Fee page reads the deployed Fee Distributor and supports creator-fee claims.
- Wallet connection supports MetaMask and Bitget Wallet; network is Robinhood Chain Testnet only.
- Faucet links to the official Robinhood Chain Testnet faucet.

## Not active yet
- PIXORUN Points issuance and leaderboard require a verified backend/indexer and published scoring rules.
- Staking is disabled because the staking contract is not deployed and the Fee Distributor has a zero staking address.
- Token detail page supports bonding-curve buy/sell and graduated PIXORUN Swap pool buy/sell, with slippage protection; browser testing is still required.
- The testnet is for development; do not use real funds.

## Repository layout
- Static website pages are in the repository root.
- Matching legacy /launchpad/ routes are maintained for compatibility.
- Solidity contracts and tests are in contracts/.
- Testnet contract addresses are recorded in contracts/deployments/robinhood-testnet.json.

## Development
The frontend is hosted with GitHub Pages. Contract source and tests are maintained in this repository. Review contract code and testnet deployment configuration before any production/mainnet use.
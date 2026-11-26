# PIXORUN Launchpad

Standalone PIXORUN Launchpad beta interface for Robinhood Chain Testnet.

## GitHub Pages
Project site URL: `https://arifhosen2022.github.io/Pixorun-launchpad/`

Dashboard entry point: `/launchpad/`

## Network
- Robinhood Chain Testnet
- Chain ID: 46630 (`0xb626`)
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

## Included
- Responsive dashboard and launchpad pages
- EVM wallet connection, network switching and testnet ETH balance lookup
- Missions, create mission, creator studio, points, staking, profile, faucet, fee claims and docs pages
- Solidity contracts for fixed-supply mission tokens, bonding curves, Liftoff migration, PIXORUN Swap, fee distribution and staking rewards
- Foundry build and integration tests for the contract foundation
- Foundry contract-test workflow

## Implementation status
This is a beta UI and contract foundation, not a live launchpad. The Solidity modules and test suite are implemented as an initial foundation and pass the current GitHub Actions build/tests. They have not been deployed or independently audited. Wallet-connected UI pages still contain placeholders; frontend contract integration, Supabase-backed user data, final tokenomics validation, security review and Robinhood Chain Testnet deployment remain outstanding. Do not treat placeholder screens as live functionality or send real funds. No smart contracts or Supabase functions have been deployed.

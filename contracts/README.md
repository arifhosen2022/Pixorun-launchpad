# PIXORUN Contracts

Solidity development workspace for Robinhood Chain only.

## Network configuration

- Testnet: Robinhood Chain Testnet
- Chain ID: 46630 (0xb626)
- RPC: https://rpc.testnet.chain.robinhood.com
- Explorer: https://explorer.testnet.chain.robinhood.com

Mainnet settings are present in foundry.toml for later use, but do not deploy to mainnet during development.

## Open in GitHub Codespaces

1. Open https://github.com/arifhosen2022/Pixorun-launchpad
2. Select Code, then Codespaces, then Create codespace on the default branch.
3. Wait for the devcontainer to install Foundry.
4. In the terminal, run:

    cd contracts
    forge --version
    forge build --sizes
    forge test -vvv

## Testnet connection checks

After adding a test wallet with testnet ETH, verify the RPC without exposing any private key:

    cast chain-id --rpc-url robinhood_testnet
    cast block-number --rpc-url robinhood_testnet

Expected chain ID: 46630.

## Deployment safety

- Never commit private keys, seed phrases, keystore files, or populated .env files.
- Use a dedicated testnet deployer wallet.
- Keep deployer keys in Codespaces secrets or a local ignored environment file.
- Do not deploy to mainnet until contracts pass unit, fuzz, invariant, integration, and independent security review.
- Testnet deployment is not proof of security.

## Current implementation status

The Solidity workspace now contains the initial PIXORUN protocol modules: fixed-supply mission token, curve math, bonding curve, open-access launch factory, atomic Liftoff migration, PIXORUN Swap factory/pair, fee distributor and staking rewards. The current Foundry build and integration tests pass in GitHub Actions. This is not an audit or deployment approval. Frontend contract integration, final tokenomics confirmation, fuzz/invariant testing and independent security review remain outstanding. Review all addresses and constructor parameters before any deployment.

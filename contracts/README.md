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

The current Solidity files are only an initial foundation: curve quote math and an immutable-supply token primitive. The full launchpad, Liftoff migration, AMM, staking, fee accounting, and access-control integration are not implemented yet. Existing curve constants and fee assumptions must be reviewed against final approved tokenomics before deployment.

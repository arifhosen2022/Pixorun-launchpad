#!/usr/bin/env bash
set -euo pipefail

# PIXORUN Robinhood Chain Testnet staking migration.
# This deploys a NEW fee/factory stack. Existing factories, curves and token launches remain untouched.
# Never commit PRIVATE_KEY or a populated .env file.
: "${PRIVATE_KEY:?Set PRIVATE_KEY in your local shell or Codespaces secret}"
: "${TEAM_WALLET:?Set TEAM_WALLET to the wallet that receives protocol fees}"

RPC_URL="${RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
CHAIN_ID="46630"
CREATION_FEE_WEI="${CREATION_FEE_WEI:-100000000000000}"
ZERO_ADDRESS="0x0000000000000000000000000000000000000000"
PIXORUN_TOKEN_ADDRESS="0x74f0dA3f0C3C304933D26EA90411124287D7a920"

cd "$(dirname "$0")"

echo "Checking Robinhood Chain Testnet..."
ACTUAL_CHAIN="$(cast chain-id --rpc-url "$RPC_URL")"
if [[ "$ACTUAL_CHAIN" != "$CHAIN_ID" ]]; then
  echo "Wrong chain: expected $CHAIN_ID, received $ACTUAL_CHAIN" >&2
  exit 1
fi

TOKEN_CODE="$(cast code "$PIXORUN_TOKEN_ADDRESS" --rpc-url "$RPC_URL")"
if [[ -z "$TOKEN_CODE" || "$TOKEN_CODE" == "0x" ]]; then
  echo "Official PIXORUN token has no deployed bytecode on Robinhood Chain Testnet." >&2
  exit 1
fi
# Confirm the token exposes standard ERC-20 decimals before any deployment.
cast call "$PIXORUN_TOKEN_ADDRESS" "decimals()(uint8)" --rpc-url "$RPC_URL" >/dev/null

deploy() {
  local contract="$1"
  shift
  local output address
  output="$(forge create --json --broadcast --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$contract" --constructor-args "$@")"
  address="$(printf '%s' "$output" | jq -r '.deployedTo // empty')"
  if [[ -z "$address" || "$address" == "null" ]]; then
    echo "Could not read deployed address for $contract. Raw output:" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
  printf '%s' "$address"
}

PREVIOUS_REGISTRY="$(cat deployments/robinhood-testnet.json)"

echo "Deploying new FeeDistributor (staking link will be set once)..."
FEE_DISTRIBUTOR="$(deploy src/PixorunFeeDistributor.sol:PixorunFeeDistributor "$TEAM_WALLET" "$ZERO_ADDRESS")"
echo "FeeDistributor: $FEE_DISTRIBUTOR"

echo "Deploying single-token PIXORUN Staking Rewards..."
STAKING_REWARDS="$(deploy src/PixorunStakingRewards.sol:PixorunStakingRewards "$PIXORUN_TOKEN_ADDRESS" "$FEE_DISTRIBUTOR")"
echo "StakingRewards: $STAKING_REWARDS"

echo "Linking FeeDistributor to the one-time staking receiver..."
cast send "$FEE_DISTRIBUTOR" "setStakingRewards(address)" "$STAKING_REWARDS" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null

LINKED_STAKING="$(cast call "$FEE_DISTRIBUTOR" "stakingRewards()(address)" --rpc-url "$RPC_URL")"
STAKED_TOKEN="$(cast call "$STAKING_REWARDS" "stakingToken()(address)" --rpc-url "$RPC_URL")"
if [[ "${LINKED_STAKING,,}" != "${STAKING_REWARDS,,}" || "${STAKED_TOKEN,,}" != "${PIXORUN_TOKEN_ADDRESS,,}" ]]; then
  echo "On-chain staking configuration verification failed; stopping before factory deployment." >&2
  exit 1
fi

echo "Deploying new SwapFactory..."
SWAP_FACTORY="$(deploy src/PixorunSwapFactory.sol:PixorunSwapFactory "$FEE_DISTRIBUTOR")"
echo "SwapFactory: $SWAP_FACTORY"

echo "Deploying new LaunchpadFactory..."
LAUNCHPAD_FACTORY="$(deploy src/PixorunLaunchpadFactory.sol:PixorunLaunchpadFactory "$FEE_DISTRIBUTOR" "$CREATION_FEE_WEI")"
echo "LaunchpadFactory: $LAUNCHPAD_FACTORY"

echo "Linking new factories..."
cast send "$SWAP_FACTORY" "configureLaunchpadFactory(address)" "$LAUNCHPAD_FACTORY" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null
cast send "$LAUNCHPAD_FACTORY" "configureSwapFactory(address)" "$SWAP_FACTORY" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null

# Verify both factory links before publishing the new registry.
SWAP_FEE="$(cast call "$SWAP_FACTORY" "feeDistributor()(address)" --rpc-url "$RPC_URL")"
LAUNCH_FEE="$(cast call "$LAUNCHPAD_FACTORY" "feeDistributor()(address)" --rpc-url "$RPC_URL")"
if [[ "${SWAP_FEE,,}" != "${FEE_DISTRIBUTOR,,}" || "${LAUNCH_FEE,,}" != "${FEE_DISTRIBUTOR,,}" ]]; then
  echo "Factory/FeeDistributor link verification failed." >&2
  exit 1
fi

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -n \
  --arg deployedAt "$DEPLOYED_AT" \
  --arg run "${GITHUB_RUN_ID:-0}" \
  --arg token "$PIXORUN_TOKEN_ADDRESS" \
  --arg fees "$FEE_DISTRIBUTOR" \
  --arg staking "$STAKING_REWARDS" \
  --arg swap "$SWAP_FACTORY" \
  --arg launch "$LAUNCHPAD_FACTORY" \
  --arg fee "$CREATION_FEE_WEI" \
  --argjson previous "$PREVIOUS_REGISTRY" \
  '{
    network:"Robinhood Chain Testnet",
    chainId:46630,
    chainIdHex:"0xb626",
    rpcUrl:"https://rpc.testnet.chain.robinhood.com",
    explorerUrl:"https://explorer.testnet.chain.robinhood.com",
    deployedAt:$deployedAt,
    deployerWorkflowRun:($run|tonumber),
    creationFeeWei:$fee,
    officialToken:$token,
    feeDistributor:$fees,
    stakingRewards:$staking,
    swapFactory:$swap,
    launchpadFactory:$launch,
    previousDeployment:{
      deployedAt:$previous.deployedAt,
      feeDistributor:$previous.feeDistributor,
      swapFactory:$previous.swapFactory,
      launchpadFactory:$previous.launchpadFactory
    }
  }' > deployments/robinhood-testnet.json

cat <<SUMMARY

PIXORUN TESTNET STAKING STACK DEPLOYED AND VERIFIED
Network: Robinhood Chain Testnet (46630)
Official staking token: $PIXORUN_TOKEN_ADDRESS
FeeDistributor: $FEE_DISTRIBUTOR
StakingRewards: $STAKING_REWARDS
SwapFactory: $SWAP_FACTORY
LaunchpadFactory: $LAUNCHPAD_FACTORY
Creation fee (wei): $CREATION_FEE_WEI

Existing deployment addresses were preserved in previousDeployment.
Do not publish or commit PRIVATE_KEY.
SUMMARY

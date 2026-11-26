#!/usr/bin/env bash
set -euo pipefail

# PIXORUN Robinhood Chain Testnet deployment.
# Never commit PRIVATE_KEY or a populated .env file.
: "${PRIVATE_KEY:?Set PRIVATE_KEY in your local shell or Codespaces secret}"
: "${TEAM_WALLET:?Set TEAM_WALLET to the wallet that receives protocol fees}"

RPC_URL="${RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
CHAIN_ID="46630"
CREATION_FEE_WEI="${CREATION_FEE_WEI:-100000000000000}" # 0.0001 ETH
ZERO_ADDRESS="0x0000000000000000000000000000000000000000"

cd "$(dirname "$0")"

echo "Checking Robinhood Chain Testnet..."
ACTUAL_CHAIN="$(cast chain-id --rpc-url "$RPC_URL")"
if [[ "$ACTUAL_CHAIN" != "$CHAIN_ID" ]]; then
  echo "Wrong chain: expected $CHAIN_ID, received $ACTUAL_CHAIN" >&2
  exit 1
fi

deploy() {
  local contract="$1"
  shift
  local output
  output="$(forge create --json --broadcast --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$contract" --constructor-args "$@")"
  local address
  address="$(printf '%s' "$output" | jq -r '.deployedTo // empty')"
  if [[ -z "$address" || "$address" == "null" ]]; then
    echo "Could not read deployed address for $contract. Raw output:" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
  printf '%s' "$address"
}

echo "Deploying FeeDistributor..."
FEE_DISTRIBUTOR="$(deploy src/PixorunFeeDistributor.sol:PixorunFeeDistributor "$TEAM_WALLET" "$ZERO_ADDRESS")"
echo "FeeDistributor: $FEE_DISTRIBUTOR"

echo "Deploying SwapFactory..."
SWAP_FACTORY="$(deploy src/PixorunSwapFactory.sol:PixorunSwapFactory "$FEE_DISTRIBUTOR")"
echo "SwapFactory: $SWAP_FACTORY"

echo "Deploying open LaunchpadFactory..."
LAUNCHPAD_FACTORY="$(deploy src/PixorunLaunchpadFactory.sol:PixorunLaunchpadFactory "$FEE_DISTRIBUTOR" "$CREATION_FEE_WEI")"
echo "LaunchpadFactory: $LAUNCHPAD_FACTORY"

echo "Linking SwapFactory to LaunchpadFactory..."
cast send "$SWAP_FACTORY" "configureLaunchpadFactory(address)" "$LAUNCHPAD_FACTORY" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null

echo "Linking LaunchpadFactory to SwapFactory..."
cast send "$LAUNCHPAD_FACTORY" "configureSwapFactory(address)" "$SWAP_FACTORY" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null

cat <<SUMMARY

PIXORUN TESTNET DEPLOYMENT COMPLETE
Network: Robinhood Chain Testnet (46630)
FeeDistributor: $FEE_DISTRIBUTOR
SwapFactory: $SWAP_FACTORY
LaunchpadFactory: $LAUNCHPAD_FACTORY
Creation fee (wei): $CREATION_FEE_WEI

Save these addresses. Do not publish or commit PRIVATE_KEY.
SUMMARY

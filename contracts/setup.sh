#!/usr/bin/env bash
# Pulls Uniswap v4-core (pinned) and its forge-std / solmate submodules into lib/.
set -euo pipefail
cd "$(dirname "$0")"

V4_CORE_COMMIT=59d3ecf53afa9264a16bba0e38f4c5d2231f80bc

if [ ! -d lib/v4-core/.git ]; then
  git clone https://github.com/Uniswap/v4-core lib/v4-core
fi
git -C lib/v4-core fetch --depth 1 origin "$V4_CORE_COMMIT"
git -C lib/v4-core checkout -q "$V4_CORE_COMMIT"
git -C lib/v4-core submodule update --init --depth 1 lib/forge-std lib/solmate lib/openzeppelin-contracts

echo "lib ready. run: forge test"

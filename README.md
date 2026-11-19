<p align="center"><img src="frontend/public/mark.svg" width="96" alt="Ripcord seal"></p>

<h1 align="center">RIPCORD</h1>
<p align="center"><b>The captain steers. You hold the rope.</b></p>
<p align="center">A curated Uniswap v4 vault where every depositor sets their own stop-loss, and the hook exits them automatically.</p>

---

## What it is

In a shared vault everyone accepts the same risk. Ripcord keeps one curator-managed LP position, but each depositor picks a personal floor ("pull me out if my share drops 10%"). After every swap the hook reads the vault's share price and exits every depositor whose floor has been reached. No keeper or bot is needed, and the depositor signs nothing.

| The story | The protocol |
|---|---|
| The boat | One Uniswap v4 pool and its vault |
| The captain | The curator, who sets the LP range |
| Your rope | Your floor: 5%, 10%, 20% or none |
| The haul | `afterSwap` exits your share pro rata |

Built for the **Atrium Hookathon, UHI 11**.

## Repo layout

```
contracts/   Foundry: RipcordHook, tests, deploy script
frontend/    Next.js 15 app: landing, /boat, /dive, /line, /surfaced
docs/        Architecture, demo script, pitch deck (.pptx)
```

## How it works (short)

1. **Deposit** rUSDC with `deposit(amount, dropBps, minShares)`. The hook swaps part of it to rWETH and adds liquidity to the curator's range. Shares are minted at the settled price.
2. Your trigger price is `entryPrice × (1 − drop)`, rounded **up** onto a 0.1% grid. Everyone with the same trigger shares one **bucket**, and buckets are kept sorted.
3. **`beforeSwap`** records the block's opening price. **`afterSwap`** compares the share price at that opening price with the highest buckets and pulls up to 4 per swap.
4. A **pull** removes that bucket's slice of liquidity and idle balance and parks it for claim. There is no selling during the pull.
5. **Claim** with `claim(toQuote, min)`, which can convert the rWETH side to rUSDC. You can also `surface()` by hand or `setRope()` at any time. When no swap comes, anyone can call `haul()`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and its trade-offs.

## Quick start

### 1. Contracts

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).

```bash
cd contracts
./setup.sh                    # pulls v4-core into lib/
forge test                    # 12 tests
cp .env.example .env          # add PRIVATE_KEY (funded with testnet ETH)
source .env
forge script script/Deploy.s.sol --rpc-url unichain_sepolia --broadcast
```

The script deploys two faucet tokens (rWETH, rUSDC), mines a hook address with the right permission bits, opens the pool at about 3,000 rUSDC per rWETH, deploys a swap router and seeds the vault with about 100k of value. It prints the frontend env vars and writes them to `contracts/deployments/<chainId>.json`.

Supported chains: Unichain Sepolia (1301, default), Base Sepolia (84532), Sepolia (11155111) and anvil (31337, deploys its own PoolManager).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # paste the addresses the deploy printed
npm run dev                   # http://localhost:3000
```

To deploy the frontend to Vercel, set the root directory to `frontend` and add the same `NEXT_PUBLIC_*` variables.

### 3. Local chain (optional)

```bash
anvil
cd contracts && PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
# frontend/.env.local: NEXT_PUBLIC_CHAIN_ID=31337, NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
```

## Try it (judges)

1. On **/boat**, connect your wallet and use **Rough Seas** to faucet rUSDC and rWETH.
2. On **/dive**, deposit 1,000 rUSDC with a **5%** rope.
3. Back on **/boat**, **Sell** 4 rWETH to start a storm (about −7% on the share price).
4. Wait one block, then hit **Haul ropes** or make any swap. Your rope pulls.
5. **/surfaced** shows the haul. **Claim your catch** as rUSDC.

## Contract surface

| Function | Who | What |
|---|---|---|
| `deposit(amountIn, dropBps, minShares)` | anyone | board with rUSDC and set a rope |
| `setRope(dropBps)` | depositor | change rope; trigger stays anchored to entry |
| `surface(shares, toQuote, minQuote)` | depositor | exit by hand |
| `claim(toQuote, minQuote)` | pulled depositor | collect the haul |
| `haul(maxPulls)` | anyone | check ropes without a swap |
| `seed(amount0, amount1)` | curator | launch the vault two-sided (once) |
| `rebalance(lower, upper)` | curator | move the shared range |
| `ropeOf(user)`, `activeBuckets()`, `sharePrice()` | view | everything the app reads |

## Known limits

- A rope is a stop-loss, not a guarantee. It pulls at the first check after the floor is crossed, so a large one-block gap can land below it.
- Pricing is manipulation-resistant within a block, but not a TWAP. Production should read an oracle.
- There are no curator fees yet. The code is unaudited and for testnet only.

## License

MIT

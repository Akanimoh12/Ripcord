# Ripcord architecture

## One contract

`RipcordHook` is the hook, the vault and the rope book in one contract. It owns the only liquidity position in its pool. External LPs are blocked in `beforeAddLiquidity`, and the hook's own calls skip its callbacks.

```
          deposit / surface / claim / haul / rebalance
user ───────────────────────────────▶ RipcordHook ──unlock──▶ PoolManager
                                          ▲                       │
trader ── swap ──▶ PoolManager ── beforeSwap / afterSwap ─────────┘
```

Hook permissions: `beforeInitialize`, `beforeAddLiquidity`, `beforeSwap`, `afterSwap`.

## Accounting

- **Value** is measured in quote (rUSDC): position amounts plus idle balances, priced at the **settled** sqrt price. Tokens reserved for pulled ropes are excluded.
- **Share price** is `value × 1e18 / totalShares`. The first deposit (the curator's `seed`) mints shares at 1.0.
- Fees are collected (a zero-liquidity poke) **before** every valuation, so they belong to existing holders.
- **Deposits** take rUSDC only. The hook swaps the base share into rWETH (the zap), adds what fits, and keeps the rest idle. Shares are minted from the value actually added, so the depositor pays their own zap cost. The value is measured twice, at the settled price and at the pre-deposit spot price, and the depositor gets the **smaller** share count, so a gap between the two inside a block can't be used to mint cheap shares.
- Deposits revert with `OutOfRange` while the settled or spot price is outside the range. There the vault has no liquidity, so the price can be pushed anywhere for free.
- `minDeposit` (curator-set, 10 rUSDC on deploy) applies to deposits and to what a partial `surface` leaves behind, so dust ropes can't fill the 96 bucket slots. Ropes come in whole percents (100–9000 bps).

## Ropes and buckets

- A depositor's trigger is `entryPrice × (10000 − dropBps) / 10000`, rounded **up** to a `PRICE_STEP` of 1e15 (0.1% of 1.0). Rounding up means a rope never runs longer than asked.
- Every depositor on the same trigger shares one `Bucket { shares, round }`. Active bucket ids live in an ascending array capped at 96 (`SortedBuckets`).
- When a top-up changes the entry, it becomes the value-weighted average of the old and new entries.

## The pull

`afterSwap` and `haul()` both run `_haul(max)`:

1. `price = sharePrice()` at the settled price.
2. While the highest active bucket's trigger is at or above `price` (at most 4 per swap): remove `liquidity × S / totalShares` plus the same share of idle balances, burn `S`, and store `Pull { shares, amount0, amount1, sharePrice, block }` under `(bucket, round)`. Then bump the round and pop the bucket.
3. Each pull is pro rata, so the share price is unchanged for those who stay, and the loop never cascades.

The tokens stay in the hook as `reserved0/1`. A depositor's claim is `pull.amount × theirShares / pull.shares`. If they asked for quote, the rWETH side is sold at claim time, which the user chooses. Nothing is sold during the pull itself.

## Settled price (manipulation guard)

`beforeSwap`, and every action the hook starts itself, records the pool price the first time the hook sees each block (`blockOpenSqrtPrice`). Within that block, valuation uses this opening price. So a trade that crashes the pool cannot trigger ropes or mint cheap shares in the same block: its effect is only seen from the next block on.

This raises the cost of manipulation (the attacker must hold the price across a block boundary against arbitrage), but it is not a TWAP. The next step is to read an oracle.

## Range-bounded internal swaps

The vault is the pool's only LP, so outside its range the pool has no liquidity. Every swap the hook makes itself (the deposit zap, and selling rWETH on `surface` or `claim`) is limited to the range edge. Without that limit, one large exit would run the price to the tick bounds and set off every rope. Whatever can't be sold inside the range is returned as rWETH, and `minQuote` still protects the user.

## Pool guards

`beforeInitialize` allows one pool per hook, created by the curator, with ERC20 tokens on both sides, a static fee, and a range that fits the tick spacing.

## Curator

- `seed(a0, a1)` launches the vault two-sided, once. The zap needs liquidity to trade against.
- `rebalance(lower, upper)` moves the whole position. Ropes are untouched, because they are tied to share price, not ticks.
- `setCurator` hands over the role.

## Gas bounds

- A swap with no triggered rope pays for one slot0 read and one comparison against the top bucket.
- A triggering swap pays for at most 4 bucket pulls plus one fee poke. Deeper ropes wait for the next swap or `haul()`.

## Tests

`contracts/test/Ripcord.t.sol` (24 tests):

- **Core:** launch, the zap at fair value, rope setting, a pull after a drawdown with claim to quote, the flash-trade guard, surfacing, rope changes, rejecting a rope that would pull immediately, shared buckets paying pro rata, external liquidity blocked, and curator rebalance and access control.
- **Price safety:** large exits and large deposits stay inside the range, a crash → deposit → restore inside one block loses money compared with the same trades without the deposit, and deposits are refused out of range.
- **Limits:** at most 4 pulls per swap with `haul` taking the rest, rope validation, the dust minimum, curator handover, and dynamic-fee or second pools rejected.
- **Fuzz:** a deposit and exit round trip never dilutes the holders who stay, and the hook's balances always cover `idle + reserved`.

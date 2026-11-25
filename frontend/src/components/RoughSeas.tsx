"use client";

import { useState } from "react";
import { maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { erc20Abi, ripcordAbi, routerAbi } from "@/lib/abi";
import { addresses, poolKey } from "@/lib/config";
import { ethPrice, fmtUsdc, fmtWeth, parseUnitsSafe, sqrtPriceAtTick } from "@/lib/format";
import { useToken, useTx, useVault } from "@/lib/hooks";
import { TxStatus } from "./TxStatus";

const SETTINGS = { takeClaims: false, settleUsingBurn: false } as const;

/** Testnet tools: faucet, move the price, haul ropes by hand. */
export function RoughSeas() {
  const { isConnected } = useAccount();
  const { spotSqrtPrice, tickLower, tickUpper } = useVault();
  const weth = useToken(addresses.weth, addresses.router);
  const usdc = useToken(addresses.usdc, addresses.router);
  const tx = useTx();
  const [sell, setSell] = useState("4");

  const price = ethPrice(spotSqrtPrice);

  async function faucet(token: `0x${string}`, label: string) {
    await tx.send(label, { address: token, abi: erc20Abi, functionName: "faucet" });
  }

  async function swap(zeroForOne: boolean) {
    const token = zeroForOne ? addresses.weth : addresses.usdc;
    const allowance = zeroForOne ? weth.allowance : usdc.allowance;
    const amount = zeroForOne ? parseUnitsSafe(sell, 18) : parseUnitsSafe((Number(sell) * (price ?? 3000)).toFixed(6), 6);
    if (amount === 0n || tickLower === undefined || tickUpper === undefined) return;

    if ((allowance ?? 0n) < amount) {
      await tx.send("Approve router", {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.router, maxUint256],
      });
    }
    // stop at the edge of the captain's range so the pool never runs dry
    const limit = zeroForOne ? sqrtPriceAtTick(tickLower + 60) : sqrtPriceAtTick(tickUpper - 60);
    await tx.send(zeroForOne ? "Sell rWETH" : "Buy rWETH", {
      address: addresses.router,
      abi: routerAbi,
      functionName: "swap",
      args: [poolKey, { zeroForOne, amountSpecified: -amount, sqrtPriceLimitX96: limit }, SETTINGS, "0x"],
    });
  }

  async function haul() {
    await tx.send("Haul ropes", { address: addresses.hook, abi: ripcordAbi, functionName: "haul", args: [10n] });
  }

  return (
    <section aria-label="Rough seas" className="panel">
      <div className="row-between" style={{ alignItems: "baseline" }}>
        <div className="eyebrow-sm">ROUGH SEAS · TESTNET TOOLS</div>
        <div className="muted" style={{ fontSize: 15, fontWeight: 700 }}>
          rWETH now {price ? `${price.toLocaleString("en-US", { maximumFractionDigits: 0 })} rUSDC` : "—"}
        </div>
      </div>
      <p className="m0 muted">
        Push the price around to watch ropes pull. Ropes read the block&apos;s opening price, so a pull shows up on the
        next swap or haul after your trade.
      </p>

      <div className="grid-app" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="strong">1. Fill your hold</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button type="button" className="btn btn-ghost" disabled={!isConnected || tx.busy} onClick={() => faucet(addresses.usdc, "Faucet rUSDC")}>
              + 20,000 rUSDC
            </button>
            <button type="button" className="btn btn-ghost" disabled={!isConnected || tx.busy} onClick={() => faucet(addresses.weth, "Faucet rWETH")}>
              + 5 rWETH
            </button>
          </div>
          <div className="muted" style={{ fontSize: 15 }}>
            You hold {fmtUsdc(usdc.balance)} rUSDC · {fmtWeth(weth.balance)} rWETH
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <label htmlFor="waves" className="strong">2. Make waves</label>
          <div className="amount-box">
            <input id="waves" inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value)} style={{ fontSize: 24 }} />
            <div className="amount-unit">rWETH</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button type="button" className="btn btn-md" disabled={!isConnected || tx.busy} onClick={() => swap(true)}>
              SELL · STORM
            </button>
            <button type="button" className="btn btn-ghost" disabled={!isConnected || tx.busy} onClick={() => swap(false)}>
              BUY · CALM
            </button>
          </div>
        </div>
      </div>

      <div className="row-between" style={{ borderTop: "2px solid var(--line)", paddingTop: 18 }}>
        <div className="muted">No swap coming? Anyone can haul the ropes.</div>
        <button type="button" className="btn btn-md" disabled={!isConnected || tx.busy} onClick={haul}>
          HAUL ROPES
        </button>
      </div>
      <TxStatus {...tx} />
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { maxUint256 } from "viem";
import { useAccount } from "wagmi";
import { erc20Abi, ripcordAbi } from "@/lib/abi";
import { addresses, ROPES } from "@/lib/config";
import { fmtPrice, fmtUsdc, parseUnitsSafe } from "@/lib/format";
import { useRope, useToken, useTx, useVault } from "@/lib/hooks";
import { WalletButton } from "@/components/Headers";
import { TxStatus } from "@/components/TxStatus";

const ONE = 10n ** 18n;

export default function DivePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { sharePrice } = useVault();
  const { rope, hasPosition } = useRope();
  const usdc = useToken(addresses.usdc);
  const tx = useTx();

  const [amount, setAmount] = useState("1000");
  const [picked, setPicked] = useState<number>(1000);

  const amountRaw = parseUnitsSafe(amount, 6);
  const hasRope = picked !== 0;
  const price = sharePrice ?? ONE;
  // existing divers keep their entry; new ones board at today's price
  const anchor = hasPosition && amountRaw === 0n ? rope!.entryPrice : price;
  const trigger = (anchor * BigInt(10_000 - picked)) / 10_000n;
  const floorValue = (amountRaw * BigInt(10_000 - picked)) / 10_000n;
  const ropeOnly = hasPosition && amountRaw === 0n;

  async function dive() {
    if (ropeOnly) {
      await tx.send("Set rope", { address: addresses.hook, abi: ripcordAbi, functionName: "setRope", args: [picked] });
      router.push("/line");
      return;
    }
    if (amountRaw === 0n) return;
    if ((usdc.allowance ?? 0n) < amountRaw) {
      await tx.send("Approve rUSDC", {
        address: addresses.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.hook, maxUint256],
      });
    }
    // 3% slippage on the zap
    const minShares = (((amountRaw * ONE) / price) * 97n) / 100n;
    await tx.send("Dive", {
      address: addresses.hook,
      abi: ripcordAbi,
      functionName: "deposit",
      args: [amountRaw, picked, minShares],
    });
    router.push("/line");
  }

  const short = usdc.balance !== undefined && amountRaw > usdc.balance;

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h-app">CUT YOUR ROPE</h1>
        <p className="m0 muted" style={{ fontSize: 20 }}>
          Decide now, in calm water, how deep you are willing to go.
        </p>
      </div>

      {rope?.pulled && (
        <div className="notice">
          Your rope already pulled. <a href="/surfaced">Claim your catch</a> before diving again.
        </div>
      )}

      <div className="grid-app">
        <div className="stack" style={{ gap: 32 }}>
          <div className="stack" style={{ gap: 12 }}>
            <label htmlFor="amount" className="label-step">
              <span className="bronze">I.</span> HOW MUCH GOES DOWN?
            </label>
            <div className="amount-box">
              <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <div className="amount-unit">rUSDC</div>
            </div>
            <div className="muted" style={{ fontSize: 15 }}>
              Balance {fmtUsdc(usdc.balance)} rUSDC
              {hasPosition && " · leave at 0 to only change your rope"}
            </div>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            <div id="rope-label" className="label-step">
              <span className="bronze">II.</span> HOW LONG IS YOUR ROPE?
            </div>
            <div role="group" aria-labelledby="rope-label" className="rope-options">
              {ROPES.map((r) => (
                <button
                  key={r.bps}
                  type="button"
                  className="rope-option"
                  aria-pressed={picked === r.bps}
                  onClick={() => setPicked(r.bps)}
                >
                  <span className="display">{r.label}</span>
                  <span>{r.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <section aria-label="Summary" className="panel panel-deep" style={{ gap: 18 }}>
          <div className="eyebrow-sm">BEFORE YOU GO UNDER</div>
          <div className="row-between" style={{ gap: 16 }}>
            <div className="muted" style={{ fontWeight: 700 }}>
              {ropeOnly ? "You boarded at share price" : "You board at share price"}
            </div>
            <div className="strong">{fmtPrice(ropeOnly ? rope!.entryPrice : price)}</div>
          </div>
          {hasRope ? (
            <div className="stack" style={{ gap: 18 }}>
              <div className="row-between" style={{ borderTop: "2px solid var(--line)", paddingTop: 18 }}>
                <div className="muted" style={{ fontWeight: 700 }}>Your rope pulls at</div>
                <div className="display bronze" style={{ fontSize: 28 }}>{fmtPrice(trigger)}</div>
              </div>
              {!ropeOnly && (
                <div className="row-between" style={{ borderTop: "2px solid var(--line)", paddingTop: 18 }}>
                  <div className="muted" style={{ fontWeight: 700 }}>Worth at the pull, about</div>
                  <div className="strong">{fmtUsdc(floorValue)} rUSDC</div>
                </div>
              )}
              <p className="m0 muted">
                If the share price reaches {fmtPrice(trigger)}, the hook exits you after that swap. You sign nothing.
              </p>
            </div>
          ) : (
            <p className="m0 strong" style={{ borderTop: "2px solid var(--line)", paddingTop: 18, fontWeight: 700 }}>
              No rope. You stay with the boat through any drawdown and leave only when you choose to.
            </p>
          )}

          {isConnected ? (
            <button
              type="button"
              className="btn"
              style={{ marginTop: 6 }}
              disabled={tx.busy || rope?.pulled || (!ropeOnly && (amountRaw === 0n || short))}
              onClick={() => dive().catch(() => {})}
            >
              {tx.busy ? "DIVING…" : ropeOnly ? "SET ROPE" : short ? "NOT ENOUGH rUSDC" : "DIVE"}
            </button>
          ) : (
            <WalletButton />
          )}
          <TxStatus {...tx} />
        </section>
      </div>
    </>
  );
}

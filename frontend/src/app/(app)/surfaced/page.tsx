"use client";

import Link from "next/link";
import { useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount } from "wagmi";
import { ripcordAbi } from "@/lib/abi";
import { addresses, explorerTx } from "@/lib/config";
import { fmtPct, fmtPrice, fmtUsdc, fmtWeth } from "@/lib/format";
import { useRope, useTx, type RopeState } from "@/lib/hooks";
import { RopeBar } from "@/components/Art";
import { WalletButton } from "@/components/Headers";
import { TxStatus } from "@/components/TxStatus";

type Paid = { weth: bigint; usdc: bigint; hash?: string };

export default function SurfacedPage() {
  const { isConnected } = useAccount();
  const { rope } = useRope();
  const tx = useTx();
  // keep the pulled rope on screen while the claim confirms (the contract deletes it on claim)
  const [held, setHeld] = useState<RopeState>();
  const [paid, setPaid] = useState<Paid>();

  const shown = rope?.pulled ? rope : held;
  const pulled = !!shown?.pulled;

  async function claim() {
    const r = rope!;
    setHeld(r);
    const receipt = await tx.send("Claim", {
      address: addresses.hook,
      abi: ripcordAbi,
      functionName: "claim",
      args: [true, (r.value * 95n) / 100n],
    });
    const [ev] = parseEventLogs({ abi: ripcordAbi, logs: receipt.logs, eventName: "Claimed" });
    setPaid({ weth: ev?.args.amount0 ?? 0n, usdc: ev?.args.amount1 ?? 0n, hash: receipt.transactionHash });
  }

  return (
    <>
      <div style={{ margin: "-48px calc(-1 * var(--app-pad-x)) 0" }}>
        <RopeBar />
      </div>

      <div className="grid-app" style={{ gap: 40, paddingTop: 8 }}>
        <div className="stack" style={{ gap: 20 }}>
          <div className="eyebrow-sm">YOU ARE BACK ON DECK</div>
          <h1 className="h1" style={{ fontSize: "clamp(40px, 6vw, 80px)", lineHeight: 1 }}>
            {paid ? "CATCH CLAIMED." : pulled ? "YOUR ROPE PULLED." : "NOT YET PULLED."}
          </h1>
          {pulled || paid ? (
            <>
              <p className="m0" style={{ fontSize: 22, fontWeight: 500 }}>
                The share price reached your floor, so the hook brought you up. Nothing of yours is still at risk in
                this vault.
              </p>
              <p className="m0 muted">The boat sails on for everyone whose rope runs deeper.</p>
            </>
          ) : (
            <>
              <p className="m0" style={{ fontSize: 22, fontWeight: 500 }}>
                Your rope is still in the water. When the share price reaches your floor, this is where you land.
              </p>
              <Link href="/line" className="btn btn-md" style={{ alignSelf: "flex-start" }}>CHECK YOUR LINE</Link>
            </>
          )}
        </div>

        <section aria-label="What happened" className="panel panel-deep" style={{ gap: 18 }}>
          <div className="eyebrow-sm">THE HAUL</div>
          {!isConnected ? (
            <WalletButton />
          ) : paid ? (
            <>
              <dl className="dl">
                <div>
                  <dt>Sent to your wallet</dt>
                  <dd className="big-num kelp" style={{ fontSize: 32 }}>
                    {fmtUsdc(paid.usdc)} <span className="unit">rUSDC</span>
                  </dd>
                </div>
                {paid.weth > 0n && (
                  <div>
                    <dt>Plus, unsold in thin water</dt>
                    <dd>{fmtWeth(paid.weth)} rWETH</dd>
                  </div>
                )}
                {shown && (
                  <div>
                    <dt>Pulled at share price</dt>
                    <dd>{fmtPrice(shown.pullPrice)}</dd>
                  </div>
                )}
              </dl>
              {paid.hash && explorerTx(paid.hash) && (
                <a href={explorerTx(paid.hash)} target="_blank" rel="noreferrer" className="strong">
                  View the claim on the explorer
                </a>
              )}
              <Link href="/dive" className="btn">DIVE AGAIN</Link>
            </>
          ) : pulled && shown ? (
            <>
              <dl className="dl">
                <div>
                  <dt>Your rope</dt>
                  <dd>{fmtPct(shown.dropBps / 10_000, 0)} below {fmtPrice(shown.entryPrice)}</dd>
                </div>
                <div>
                  <dt>Pulled at share price</dt>
                  <dd>{fmtPrice(shown.pullPrice)}</dd>
                </div>
                <div>
                  <dt>Set off by</dt>
                  <dd>A check in block {shown.pullBlock.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Held for you</dt>
                  <dd>
                    {fmtWeth(shown.claim0)} rWETH + {fmtUsdc(shown.claim1)} rUSDC
                  </dd>
                </div>
                <div>
                  <dt>Worth now, about</dt>
                  <dd className="big-num kelp" style={{ fontSize: 32 }}>
                    {fmtUsdc(shown.value)} <span className="unit">rUSDC</span>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 6 }}
                disabled={tx.busy}
                onClick={() => claim().catch(() => {})}
              >
                {tx.busy ? (
                  "HAULING IN…"
                ) : (
                  <>
                    CLAIM AS <span className="unit">rUSDC</span>
                  </>
                )}
              </button>
              <TxStatus {...tx} />
              <p className="m0 muted" style={{ fontSize: 15 }}>
                The rWETH is sold at today&apos;s price when you claim, so the final amount can differ a little.
              </p>
            </>
          ) : (
            <p className="m0 muted">Nothing hauled up yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import { ripcordAbi } from "@/lib/abi";
import { addresses } from "@/lib/config";
import { fmtPct, fmtPrice, fmtUsdc } from "@/lib/format";
import { useRope, useTx } from "@/lib/hooks";
import { RopeBar } from "@/components/Art";
import { WalletButton } from "@/components/Headers";
import { TxStatus } from "@/components/TxStatus";

export default function SurfacedPage() {
  const { isConnected } = useAccount();
  const { rope } = useRope();
  const tx = useTx();
  const [claimed, setClaimed] = useState<bigint>();

  async function claim() {
    const before = rope!.value;
    await tx.send("Claim", {
      address: addresses.hook,
      abi: ripcordAbi,
      functionName: "claim",
      args: [true, (before * 95n) / 100n],
    });
    setClaimed(before);
  }

  const pulled = !!rope?.pulled;

  return (
    <>
      <div style={{ margin: "-48px calc(-1 * var(--app-pad-x)) 0" }}>
        <RopeBar />
      </div>

      <div className="grid-app" style={{ gap: 40, paddingTop: 8 }}>
        <div className="stack" style={{ gap: 20 }}>
          <div className="eyebrow-sm">YOU ARE BACK ON DECK</div>
          <h1 className="h1" style={{ fontSize: "clamp(40px, 6vw, 80px)", lineHeight: 1 }}>
            {claimed !== undefined ? "CATCH CLAIMED." : pulled ? "YOUR ROPE PULLED." : "NOT YET PULLED."}
          </h1>
          {pulled || claimed !== undefined ? (
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
          ) : claimed !== undefined ? (
            <>
              <dl className="dl">
                <div>
                  <dt>Sent to your wallet</dt>
                  <dd className="big-num kelp" style={{ fontSize: 32 }}>~{fmtUsdc(claimed)} rUSDC</dd>
                </div>
              </dl>
              <Link href="/dive" className="btn">DIVE AGAIN</Link>
            </>
          ) : pulled && rope ? (
            <>
              <dl className="dl">
                <div>
                  <dt>Your rope</dt>
                  <dd>{fmtPct(rope.dropBps / 10_000, 0)} below {fmtPrice(rope.entryPrice)}</dd>
                </div>
                <div>
                  <dt>Pulled at share price</dt>
                  <dd>{fmtPrice(rope.pullPrice)}</dd>
                </div>
                <div>
                  <dt>Set off by</dt>
                  <dd>A check in block {rope.pullBlock.toString()}</dd>
                </div>
                <div>
                  <dt>Waiting for you</dt>
                  <dd className="big-num kelp" style={{ fontSize: 32 }}>{fmtUsdc(rope.value)} rUSDC</dd>
                </div>
              </dl>
              <button type="button" className="btn" style={{ marginTop: 6 }} disabled={tx.busy} onClick={() => claim().catch(() => {})}>
                {tx.busy ? "HAULING IN…" : "CLAIM YOUR CATCH"}
              </button>
              <TxStatus {...tx} />
              <Link href="/dive" style={{ textAlign: "center", fontWeight: 800, padding: "12px 0" }}>
                Dive again with a new rope
              </Link>
            </>
          ) : (
            <p className="m0 muted">Nothing hauled up yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

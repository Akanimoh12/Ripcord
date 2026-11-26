"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEventLogs } from "viem";
import { useAccount } from "wagmi";
import { ripcordAbi } from "@/lib/abi";
import { addresses } from "@/lib/config";
import { below, fmtPct, fmtPrice, fmtUsdc, fmtWeth, mulPrice } from "@/lib/format";
import { useRope, useTx, useVault } from "@/lib/hooks";
import { WalletButton } from "@/components/Headers";
import { TxStatus } from "@/components/TxStatus";

export default function LinePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { sharePrice } = useVault();
  const { rope, hasPosition, isLoading } = useRope();
  const tx = useTx();
  const [surfaced, setSurfaced] = useState<{ weth: bigint; usdc: bigint }>();

  useEffect(() => {
    if (rope?.pulled) router.replace("/surfaced");
  }, [rope?.pulled, router]);

  if (surfaced) {
    return (
      <Empty
        title="YOU SURFACED"
        body={`${fmtUsdc(surfaced.usdc)} rUSDC${surfaced.weth > 0n ? ` and ${fmtWeth(surfaced.weth)} rWETH` : ""} went back to your wallet.`}
      >
        <Link href="/dive" className="btn btn-md">DIVE AGAIN</Link>
      </Empty>
    );
  }
  if (!isConnected) {
    return (
      <Empty title="YOUR LINE" body="Connect your wallet to see how deep you are.">
        <WalletButton />
      </Empty>
    );
  }
  if (!hasPosition || !rope || !sharePrice) {
    return (
      <Empty title="YOUR LINE" body={isLoading ? "Checking the water…" : "You are not in the water yet."}>
        <Link href="/dive" className="btn btn-md">SET YOUR ROPE</Link>
      </Empty>
    );
  }

  const depth = Math.max(0, below(rope.entryPrice, sharePrice));
  const up = sharePrice > rope.entryPrice;
  const drop = rope.dropBps / 10_000;
  const left = Math.max(0, drop - depth);
  // stone sits on the rope at the current depth; no rope = depth over a 20% scale
  const fill = Math.min(1, drop > 0 ? depth / drop : depth / 0.2);

  const takenDown = mulPrice(rope.shares, rope.entryPrice);
  const atPull = drop > 0 ? mulPrice(rope.shares, rope.triggerPrice) : undefined;

  async function surfaceNow() {
    const receipt = await tx.send("Surface", {
      address: addresses.hook,
      abi: ripcordAbi,
      functionName: "surface",
      args: [0n, true, (rope!.value * 95n) / 100n],
    });
    const [ev] = parseEventLogs({ abi: ripcordAbi, logs: receipt.logs, eventName: "Surfaced" });
    setSurfaced({ weth: ev?.args.amount0 ?? 0n, usdc: ev?.args.amount1 ?? 0n });
  }

  return (
    <>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h-app">YOUR LINE</h1>
        <p className="m0 muted" style={{ fontSize: 20 }}>
          {up
            ? `You are ${fmtPct(-below(rope.entryPrice, sharePrice))} above where you boarded.`
            : `You are ${fmtPct(depth)} under the surface.`}{" "}
          {drop > 0 ? `Your rope has ${fmtPct(left)} left to run.` : "You have no rope."}
        </p>
      </div>

      <div className="grid-app">
        <section aria-label="Depth gauge" className="panel panel-deep">
          <div className="eyebrow-sm">DEPTH</div>
          <div className="gauge">
            <div aria-hidden="true" className="gauge-line">
              <div className="rope-v" style={{ height: `${Math.max(4, fill * 88)}%` }} />
              <div className="gauge-stone" />
              <div className="gauge-slack" />
              {drop > 0 && <div className="gauge-end" />}
            </div>
            <div className="gauge-labels">
              <div style={{ top: 0 }}>
                <div className="strong kelp">SURFACE</div>
                <div className="muted" style={{ fontSize: 16 }}>You entered at {fmtPrice(rope.entryPrice)}</div>
              </div>
              <div style={{ top: `${Math.min(62, Math.max(14, fill * 88 - 4))}%` }}>
                <div className="display" style={{ fontSize: 34, lineHeight: 1.1 }}>
                  {up ? "ABOVE" : `${fmtPct(depth)} DOWN`}
                </div>
                <div className="muted" style={{ fontSize: 16 }}>Share price now {fmtPrice(sharePrice)}</div>
              </div>
              <div style={{ bottom: 0 }}>
                {drop > 0 ? (
                  <>
                    <div className="strong bronze">ROPE ENDS AT {fmtPct(drop, 0)}</div>
                    <div className="muted" style={{ fontSize: 16 }}>Pulls at {fmtPrice(rope.triggerPrice)}</div>
                  </>
                ) : (
                  <div className="strong muted">NO ROPE · RIDING IT OUT</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="stack" style={{ gap: 24 }}>
          <section aria-label="Position" className="panel" style={{ gap: 16 }}>
            <div className="row-between" style={{ alignItems: "baseline" }}>
              <div className="eyebrow-sm">YOUR CATCH</div>
              <div className="muted" style={{ fontSize: 15, fontWeight: 700 }}>Live</div>
            </div>
            <dl className="dl">
              <div>
                <dt>Value when you boarded</dt>
                <dd>{fmtUsdc(takenDown)} rUSDC</dd>
              </div>
              <div>
                <dt>Worth now</dt>
                <dd className="display" style={{ fontSize: 30 }}>
                  {fmtUsdc(rope.value)} <span className="unit">rUSDC</span>
                </dd>
              </div>
              <div>
                <dt>Worth at the pull, about</dt>
                <dd>{atPull !== undefined ? `${fmtUsdc(atPull)} rUSDC` : "No rope"}</dd>
              </div>
            </dl>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href="/dive" className="btn btn-md" style={{ flex: "1 1 180px" }}>CHANGE ROPE</Link>
            <button
              type="button"
              className="btn btn-ghost display"
              style={{ flex: "1 1 180px", fontSize: 17, letterSpacing: "0.08em" }}
              disabled={tx.busy}
              onClick={() => surfaceNow().catch(() => {})}
            >
              {tx.busy ? "SURFACING…" : "SURFACE NOW"}
            </button>
          </div>
          <TxStatus {...tx} />
          <p className="m0 muted">
            Surfacing now withdraws you by hand at today&apos;s price.{" "}
            <Link href="/surfaced" className="strong">See what a pull looks like</Link>
          </p>
        </div>
      </div>
    </>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 20, alignItems: "flex-start" }}>
      <h1 className="h-app">{title}</h1>
      <p className="m0 muted" style={{ fontSize: 20 }}>{body}</p>
      {children}
    </div>
  );
}

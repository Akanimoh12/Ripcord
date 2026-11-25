"use client";

import Link from "next/link";
import { RoughSeas } from "@/components/RoughSeas";
import { below, fmtPct, fmtPrice, fmtUsdc, shortAddr, tickToEthPrice } from "@/lib/format";
import { useVault } from "@/lib/hooks";

export default function BoatPage() {
  const v = useVault();
  const total = v.totalShares ?? 0n;
  const roped = v.buckets.reduce((s, b) => s + b.shares, 0n);
  const share = (x: bigint) => (total > 0n ? Number((x * 10_000n) / total) / 100 : 0);

  const rows = [
    ...v.buckets.map((b) => ({
      key: String(b.id),
      price: fmtPrice(b.trigger),
      below: v.sharePrice ? fmtPct(below(v.sharePrice, b.trigger)) : "—",
      pct: share(b.shares),
    })),
    { key: "none", price: "No rope", below: "Never pulls", pct: share(total - roped) },
  ];

  const range =
    v.tickLower !== undefined && v.tickUpper !== undefined
      ? `${Math.round(tickToEthPrice(v.tickLower)).toLocaleString()}–${Math.round(tickToEthPrice(v.tickUpper)).toLocaleString()} rUSDC`
      : "—";

  return (
    <>
      <div className="row-between" style={{ gap: "20px 40px", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="h-app">THE BOAT</h1>
          <p className="m0 muted" style={{ fontSize: 20 }}>
            One vault. The captain picks the waters. You pick your rope.
          </p>
        </div>
        <Link href="/dive" className="btn" style={{ fontSize: 18, padding: "18px 32px" }}>
          DIVE IN
        </Link>
      </div>

      <div className="grid-app">
        <section aria-label="The captain" className="panel">
          <div className="eyebrow-sm">THE CAPTAIN</div>
          <div className="display" style={{ fontSize: 28 }}>
            Ripcord Curator
          </div>
          <dl className="dl">
            <div>
              <dt>Captain</dt>
              <dd>{v.curator ? shortAddr(v.curator) : "—"}</dd>
            </div>
            <div>
              <dt>Waters</dt>
              <dd>rWETH / rUSDC pool</dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>{range}</dd>
            </div>
            <div>
              <dt>Captain&apos;s fee</dt>
              <dd>0%</dd>
            </div>
            <div>
              <dt>Aboard</dt>
              <dd>{fmtUsdc(v.totalValue, 0)} rUSDC</dd>
            </div>
          </dl>
          <div className="panel-deep stack" style={{ padding: 20, gap: 4 }}>
            <div className="muted strong" style={{ fontSize: 16, fontWeight: 700 }}>
              Share price now
            </div>
            <div className="big-num kelp" style={{ fontSize: 52 }}>
              {fmtPrice(v.sharePrice)}
            </div>
          </div>
        </section>

        <section aria-label="Ropes in the water" className="panel">
          <div className="row-between" style={{ alignItems: "baseline" }}>
            <div className="eyebrow-sm">ROPES IN THE WATER</div>
            <div className="muted" style={{ fontSize: 15, fontWeight: 700 }}>
              Live
            </div>
          </div>
          <p className="m0 muted">Depositors are grouped by the share price at which their rope pulls.</p>
          <div className="table-box">
            <table className="table" style={{ minWidth: 400 }}>
              <thead>
                <tr>
                  <th scope="col">Pulls at</th>
                  <th scope="col">Below now</th>
                  <th scope="col" style={{ width: "45%" }}>
                    Share of the boat
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="display" style={{ fontSize: 22 }}>
                      {r.price}
                    </th>
                    <td style={{ fontWeight: 700 }}>{r.below}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div className="meter">
                          <div style={{ width: `${r.pct}%` }} />
                        </div>
                        <div className="strong" style={{ flex: "0 0 56px", textAlign: "right" }}>
                          {r.pct.toFixed(0)}%
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <RoughSeas />
    </>
  );
}

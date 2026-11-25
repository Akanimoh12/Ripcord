import Link from "next/link";
import { CoilIcon, HaulIcon, Meander, RopeBar, ShipHero, ShipIcon } from "@/components/Art";
import { SiteHeader } from "@/components/Headers";
import { Tilt } from "@/components/Tilt";

const STEPS = [
  {
    n: "I",
    title: "BOARD THE BOAT",
    body: "Deposit into one vault. The curator manages the position for everyone on board.",
    Icon: ShipIcon,
  },
  {
    n: "II",
    title: "CUT YOUR ROPE",
    body: "Choose how far your share may fall before you leave: 5%, 10%, 20%, or no rope at all.",
    Icon: CoilIcon,
  },
  {
    n: "III",
    title: "GET HAULED HOME",
    body: "After every swap the hook checks the share price. Reach your floor and it exits you, with no transaction from you.",
    Icon: HaulIcon,
  },
];

const COMPARE = [
  ["Loss limit", "One for the whole vault, if any", "One per depositor"],
  ["Who sets it", "The manager", "You, at deposit"],
  ["In a drawdown", "Watch the chart and withdraw by hand", "The hook exits you at your floor"],
];

const FAQ = [
  {
    q: "When does the rope pull?",
    a: "After each swap the hook compares the vault's share price with every rope. The price is the block's opening price, so one trade can't cut anyone loose.",
  },
  {
    q: "What do I come up with?",
    a: "Your share of the vault at the moment of the pull, held for you in rWETH and rUSDC. Claim it as rUSDC whenever you like.",
  },
  { q: "Can I change my rope?", a: "Yes. Lengthen it, shorten it, or surface yourself whenever you choose." },
];

export default function Landing() {
  return (
    <>
      <SiteHeader />
      <Meander />

      <section id="top" className="hero">
        <div className="wrap stack" style={{ gap: 44 }}>
          <h1 className="h1">
            THE CAPTAIN STEERS. <span className="bronze">YOU HOLD THE ROPE.</span>
          </h1>
          <div className="grid-2">
            <div className="stack" style={{ gap: 28, alignItems: "flex-start" }}>
              <p className="lede">
                Ripcord is a curated Uniswap v4 vault where every depositor sets a personal floor. If your share falls
                to it, the hook pulls you out. <strong className="strong">Automatically.</strong>
              </p>
              <p className="m0 muted">
                In a shared vault everyone rides the same risk. Here the curator still picks the waters, but how deep
                you go is your decision alone.
              </p>
              <Link href="/dive" className="btn">SET YOUR ROPE</Link>
            </div>
            <Tilt className="plaque" style={{ padding: 16 }}>
              <ShipHero />
            </Tilt>
          </div>
        </div>
      </section>

      <section id="story" className="section-tight">
        <div className="wrap plaque grid-2" style={{ padding: "clamp(28px, 5vw, 64px)", gap: 48 }}>
          <div className="stack" style={{ gap: 20 }}>
            <div className="eyebrow">THE OLD WAY</div>
            <h2 className="h2" style={{ fontSize: "clamp(32px, 4vw, 54px)" }}>
              EVERY DIVER WENT DOWN ON THEIR OWN ROPE.
            </h2>
          </div>
          <div className="stack" style={{ gap: 24, fontSize: 21 }}>
            <p className="m0">
              Long before markets, the sponge divers of the Aegean shared one boat and one captain. The captain chose
              the waters. Each diver rode a flat stone to the seabed, and that stone was tied to the boat by a rope cut
              to the diver&apos;s own length.
            </p>
            <p className="m0">
              When the rope ran out, it pulled them home. Nobody argued about how deep was too deep, because each diver
              had already decided.
            </p>
            <RopeBar className="rope-thin" />
            <p className="motto">ONE BOAT. ONE CAPTAIN. YOUR OWN ROPE.</p>
          </div>
        </div>
      </section>

      <section id="how" className="section-tight">
        <div className="wrap stack" style={{ gap: 48 }}>
          <h2 className="h2">THREE MOVES, THEN THE SEA.</h2>
          <div className="grid-3">
            {STEPS.map(({ n, title, body, Icon }) => (
              <div key={n} className="card">
                <div className="row-between bronze" style={{ flexWrap: "nowrap" }}>
                  <div className="numeral">{n}</div>
                  <Icon />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ padding: "0 var(--pad-x)" }}>
        <RopeBar className="wrap" />
      </div>

      <section className="section">
        <div className="wrap stack" style={{ gap: 40 }}>
          <h2 className="h2" style={{ maxWidth: 900 }}>
            GUARDRAILS USUALLY BIND THE CAPTAIN. <span className="bronze">THIS ONE IS YOURS.</span>
          </h2>
          <div className="table-box" style={{ background: "var(--panel)" }}>
            <table className="table compare" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col">A SHARED VAULT</th>
                  <th scope="col" className="bronze">RIPCORD</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([row, shared, ours]) => (
                  <tr key={row}>
                    <th scope="row" className="strong">{row}</th>
                    <td className="muted">{shared}</td>
                    <td style={{ fontWeight: 700 }}>{ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="questions" className="section-tight">
        <div className="wrap stack" style={{ gap: 48 }}>
          <h2 className="h2">ASKED BEFORE EVERY DIVE.</h2>
          <div className="grid-3">
            {FAQ.map((f) => (
              <div key={f.q} className="faq">
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Meander />

      <section className="section" style={{ paddingTop: 104, paddingBottom: 104 }}>
        <div className="wrap stack" style={{ gap: 32, alignItems: "flex-start" }}>
          <h2 className="h1">HOW DEEP WILL YOU GO?</h2>
          <Link href="/dive" className="btn">SET YOUR ROPE</Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap row-between" style={{ gap: "12px 32px" }}>
          <div>Built for the Atrium Hookathon, UHI 11.</div>
          <div style={{ display: "flex", gap: 24 }}>
            <a href="https://github.com/YOUR_ORG/ripcord">GitHub</a>
            <a href="https://github.com/YOUR_ORG/ripcord/blob/main/docs/ARCHITECTURE.md">Docs</a>
          </div>
        </div>
      </footer>
    </>
  );
}

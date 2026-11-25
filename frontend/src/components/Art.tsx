/* Drawn marks for the Ripcord look: seal, rope, Greek key, ship. */

type Tone = "dark" | "light";

export function Mark({ size = 38, tone = "dark", label }: { size?: number; tone?: Tone; label?: string }) {
  const ring = tone === "dark" ? "#E0A43A" : "#8A5F12";
  const ground = tone === "dark" ? "#0B1F2A" : "#EDE6D6";
  const stone = tone === "dark" ? "#EDE6D6" : "#0B1F2A";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="24" cy="24" r="20" stroke={ring} strokeWidth="5" />
      <circle cx="24" cy="24" r="20" stroke={ground} strokeWidth="5" strokeDasharray="1.5 4.8" />
      <path d="M24 2V26" stroke={stone} strokeWidth="3" />
      <path d="M15 25h18l-3 13H18z" fill={stone} />
      <circle cx="24" cy="30" r="2" fill={ground} />
    </svg>
  );
}

/** Greek key band, tiles across any width */
export function Meander() {
  let d = "";
  for (let i = 0; i < 170; i++) {
    const x = i * 24;
    d += `M${x} 21h24M${x + 21} 21v-18h-15v12h9v-6h-3`;
  }
  return (
    <svg aria-hidden="true" width="100%" height="24" className="meander">
      <path d={d} fill="none" stroke="#E0A43A" strokeWidth="2.5" />
    </svg>
  );
}

/** twisted two-strand rope, horizontal */
export function RopeBar({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rope ${className}`} />;
}

type Vars = React.CSSProperties & Record<`--${string}`, string>;

/** one wave period is 70 units; the path overhangs both edges so it can drift and parallax */
function wavePath(y: number, amp: number) {
  let d = `M-140 ${y}`;
  for (let i = 0; i < 13; i++) d += `q17.5 ${-amp} 35 0t35 0`;
  return d;
}

function HangingRope({ x, end, label, sway }: { x: number; end: number; label: string; sway: [number, number] }) {
  const [dur, delay] = sway;
  const rise = `${-(end - 196)}px`;
  return (
    <g className="hero-rope" style={{ transformOrigin: `${x}px 150px`, "--dur": `${dur}s`, "--delay": `${delay}s` } as Vars}>
      <path d={`M${x} 150V${end}`} stroke="#C9A46A" strokeWidth="8" />
      <path d={`M${x} 150V${end}`} stroke="#7A5A2E" strokeWidth="8" strokeDasharray="2 6" />
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          className="hero-bubble"
          cx={x + (i - 1) * 7}
          cy={end - 4}
          r={2 + (i % 2) * 1.5}
          fill="none"
          stroke="#7ED3C2"
          strokeWidth="1.5"
          style={{ "--rise": rise, animationDelay: `${delay + i * 1.3}s` } as Vars}
        />
      ))}
      <path d={`M${x - 22} ${end}h44l-7 28h-30z`} fill="#EDE6D6" />
      <circle cx={x} cy={end + 10} r="3.5" fill="#0B1F2A" />
      <text x={x} y={end + 68} textAnchor="middle" className="svg-display" fontSize="32" fill="#EDE6D6">
        {label}
      </text>
    </g>
  );
}

export function ShipHero() {
  const front = wavePath(178, 16);
  return (
    <svg
      role="img"
      aria-label="A Greek ship on the surface with four divers' ropes of different lengths hanging below it: 5 percent, 10 percent, 20 percent, and no rope"
      viewBox="0 0 560 640"
      width="100%"
      className="hero-art"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="hero-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ED3C2" stopOpacity="0.16" />
          <stop offset="1" stopColor="#7ED3C2" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* far layer: deep water and light rays */}
      <g className="hero-far">
        <g className="hero-wave hero-wave-back">
          <path d={wavePath(190, 9)} stroke="#7ED3C2" strokeOpacity="0.35" strokeWidth="3" fill="none" />
        </g>
        {[
          "120,180 170,180 120,640 40,640",
          "260,180 300,180 290,640 220,640",
          "400,180 460,180 520,640 420,640",
        ].map((pts, i) => (
          <polygon key={i} className="hero-ray" points={pts} fill="#7ED3C2" style={{ animationDelay: `${i * 1.7}s` }} />
        ))}
      </g>

      {/* water surface */}
      <g className="hero-mid">
        <g className="hero-wave hero-wave-front">
          <path d={`${front}V640H-140Z`} fill="url(#hero-water)" />
          <path d={front} stroke="#7ED3C2" strokeWidth="4" fill="none" />
        </g>
        <text x="12" y="208" className="svg-body" fontWeight="800" fontSize="15" letterSpacing="1.5" fill="#7ED3C2">
          SURFACE
        </text>
      </g>

      {/* near layer: the boat, with every rope tied to it */}
      <g className="hero-near">
        <g className="hero-bob">
          <path className="hero-slack" d="M440 150V560" stroke="#A9B7BC" strokeWidth="3" strokeDasharray="6 10" />
          <text x="440" y="596" textAnchor="middle" className="svg-display" fontSize="22" fill="#EDE6D6">
            NO ROPE
          </text>
          <HangingRope x={130} end={262} label="5%" sway={[5.2, 0]} />
          <HangingRope x={230} end={352} label="10%" sway={[6.4, -1.1]} />
          <HangingRope x={330} end={492} label="20%" sway={[7.6, -2.3]} />

          <path d="M280 108V18" stroke="#EDE6D6" strokeWidth="5" />
          <path d="M214 34H346" stroke="#EDE6D6" strokeWidth="5" />
          <rect className="hero-sail" x="220" y="38" width="120" height="12" fill="#EDE6D6" />
          <path
            d="M30 90C50 140 110 150 160 150H410C470 150 510 120 528 60C505 100 470 108 420 108H150C100 108 60 104 30 90Z"
            fill="#E0A43A"
          />
          <path d="M528 62C544 32 524 12 502 22" stroke="#E0A43A" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M30 90C22 78 24 66 34 60" stroke="#E0A43A" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="88" cy="122" r="9" fill="#0B1F2A" />
          <circle cx="88" cy="122" r="3.5" fill="#E0A43A" />
          <path d="M150 128H420" stroke="#0B1F2A" strokeWidth="3" strokeDasharray="14 10" />
        </g>
      </g>
    </svg>
  );
}

const iconProps = {
  width: 72,
  height: 72,
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ShipIcon = () => (
  <svg {...iconProps}>
    <path d="M6 30H42L36 40H12Z" />
    <path d="M24 30V8" />
    <path d="M24 10L38 26H24" />
    <path d="M4 45q5 -4 10 0t10 0t10 0t10 0" />
  </svg>
);

export const CoilIcon = () => (
  <svg {...iconProps}>
    <circle cx="22" cy="20" r="15" />
    <circle cx="22" cy="20" r="9" />
    <circle cx="22" cy="20" r="3" />
    <path d="M37 20V34" />
    <path d="M29 34h16l-3 10H32z" />
  </svg>
);

export const HaulIcon = () => (
  <svg {...iconProps}>
    <path d="M4 12q5 -4 10 0t10 0t10 0t10 0" />
    <path d="M24 44V18" />
    <path d="M15 27L24 18L33 27" />
    <path d="M15 38h18" />
  </svg>
);

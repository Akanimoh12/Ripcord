const ONE = 10n ** 18n;
const Q96 = 2 ** 96;

export const USDC_DECIMALS = 6;
export const WETH_DECIMALS = 18;

/** 1e18-scaled share price -> "1.0420" */
export function fmtPrice(pps?: bigint) {
  if (pps === undefined) return "—";
  return (Number(pps) / 1e18).toFixed(4);
}

export function fmtUsdc(raw?: bigint, digits = 2) {
  if (raw === undefined) return "—";
  return (Number(raw) / 10 ** USDC_DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtWeth(raw?: bigint) {
  if (raw === undefined) return "—";
  return (Number(raw) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function fmtPct(x: number, digits = 1) {
  return `${(x * 100).toFixed(digits)}%`;
}

/** % below `ref` (positive = below) */
export function below(ref: bigint, price: bigint) {
  if (ref === 0n) return 0;
  return Number(((ref - price) * 1_000_000n) / ref) / 1_000_000;
}

/** rUSDC per rWETH from sqrtPriceX96 (18 / 6 decimals) */
export function ethPrice(sqrtPriceX96?: bigint) {
  if (!sqrtPriceX96) return undefined;
  const r = Number(sqrtPriceX96) / Q96;
  return r * r * 1e12;
}

export function tickToEthPrice(tick: number) {
  return Math.pow(1.0001, tick) * 1e12;
}

export function sqrtPriceAtTick(tick: number) {
  return BigInt(Math.floor(Math.pow(1.0001, tick / 2) * Q96));
}

export function shortAddr(a?: string) {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "";
}

export function parseUnitsSafe(value: string, decimals: number) {
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return 0n;
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals));
}

export const mulPrice = (shares: bigint, pps: bigint) => (shares * pps) / ONE;

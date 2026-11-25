import { zeroAddress, type Address, type Chain } from "viem";
import { anvil, baseSepolia, sepolia, unichainSepolia } from "viem/chains";

const chains = {
  [unichainSepolia.id]: unichainSepolia,
  [baseSepolia.id]: baseSepolia,
  [sepolia.id]: sepolia,
  [anvil.id]: anvil,
} as const;

const id = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? unichainSepolia.id) as keyof typeof chains;

export const chain: Chain = chains[id] ?? unichainSepolia;
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];

const addr = (v?: string) => (v && v.startsWith("0x") ? (v as Address) : zeroAddress);

export const addresses = {
  hook: addr(process.env.NEXT_PUBLIC_HOOK_ADDRESS),
  router: addr(process.env.NEXT_PUBLIC_ROUTER_ADDRESS),
  weth: addr(process.env.NEXT_PUBLIC_WETH_ADDRESS),
  usdc: addr(process.env.NEXT_PUBLIC_USDC_ADDRESS),
};

export const isConfigured = Object.values(addresses).every((a) => a !== zeroAddress);

// must match script/Deploy.s.sol
export const POOL = { fee: 3000, tickSpacing: 60 } as const;

export const poolKey = {
  currency0: addresses.weth,
  currency1: addresses.usdc,
  fee: POOL.fee,
  tickSpacing: POOL.tickSpacing,
  hooks: addresses.hook,
} as const;

export const ROPES = [
  { bps: 500, label: "5%", note: "short rope" },
  { bps: 1000, label: "10%", note: "middle rope" },
  { bps: 2000, label: "20%", note: "long rope" },
  { bps: 0, label: "NONE", note: "ride it out" },
] as const;

export const explorerTx = (hash: string) =>
  chain.blockExplorers?.default ? `${chain.blockExplorers.default.url}/tx/${hash}` : undefined;

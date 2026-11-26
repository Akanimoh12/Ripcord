import { parseAbi } from "viem";

export const ripcordAbi = parseAbi([
  "function deposit(uint256 amountIn, uint16 dropBps, uint256 minShares) returns (uint256 shares)",
  "function setRope(uint16 dropBps)",
  "function surface(uint256 shares, bool toQuote, uint256 minQuote) returns (uint256 amount0, uint256 amount1)",
  "function claim(bool toQuote, uint256 minQuote) returns (uint256 amount0, uint256 amount1)",
  "function haul(uint256 maxPulls) returns (uint256 pulled)",
  "function sharePrice() view returns (uint256)",
  "function totalValue() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function spotSqrtPrice() view returns (uint160)",
  "function curator() view returns (address)",
  "function tickLower() view returns (int24)",
  "function tickUpper() view returns (int24)",
  "function activeBuckets() view returns (uint32[] ids, uint256[] triggers, uint256[] shares)",
  "function ropeOf(address user) view returns (uint256 shares, uint256 entryPrice, uint16 dropBps, uint256 triggerPrice, uint256 value, bool pulled, uint256 claim0, uint256 claim1, uint256 pullPrice, uint256 pullBlock)",
  "event Claimed(address indexed user, uint256 amount0, uint256 amount1)",
  "event Surfaced(address indexed user, uint256 shares, uint256 amount0, uint256 amount1)",
  "event RopePulled(uint32 indexed bucket, uint32 round, uint256 shares, uint256 amount0, uint256 amount1, uint256 sharePrice)",
  "error NotLaunched()",
  "error ZeroAmount()",
  "error InvalidDrop()",
  "error Slippage()",
  "error RopeTooShort()",
  "error TooManyRopes()",
  "error NoPosition()",
  "error AlreadyPulled()",
  "error NotPulled()",
  "error ClaimFirst()",
  "error OutOfRange()",
  "error BelowMinimum()",
  "function minDeposit() view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet()",
]);

export const routerAbi = parseAbi([
  "function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, (bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) payable returns (int256)",
]);

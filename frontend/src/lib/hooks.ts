"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { ripcordAbi, erc20Abi } from "./abi";
import { addresses, isConfigured } from "./config";

const POLL = 4_000;
const hook = { address: addresses.hook, abi: ripcordAbi } as const;

export function useVault() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...hook, functionName: "sharePrice" },
      { ...hook, functionName: "totalValue" },
      { ...hook, functionName: "totalShares" },
      { ...hook, functionName: "activeBuckets" },
      { ...hook, functionName: "tickLower" },
      { ...hook, functionName: "tickUpper" },
      { ...hook, functionName: "curator" },
      { ...hook, functionName: "spotSqrtPrice" },
    ],
    query: { enabled: isConfigured, refetchInterval: POLL },
  });

  const [sharePrice, totalValue, totalShares, buckets, tickLower, tickUpper, curator, spot] =
    data?.map((d) => d.result) ?? [];
  const b = buckets as readonly [readonly number[], readonly bigint[], readonly bigint[]] | undefined;

  return {
    isLoading,
    sharePrice: sharePrice as bigint | undefined,
    totalValue: totalValue as bigint | undefined,
    totalShares: totalShares as bigint | undefined,
    tickLower: tickLower as number | undefined,
    tickUpper: tickUpper as number | undefined,
    curator: curator as `0x${string}` | undefined,
    spotSqrtPrice: spot as bigint | undefined,
    buckets: b ? b[0].map((id, i) => ({ id, trigger: b[1][i], shares: b[2][i] })) : [],
  };
}

export type RopeState = {
  shares: bigint;
  entryPrice: bigint;
  dropBps: number;
  triggerPrice: bigint;
  value: bigint;
  pulled: boolean;
  claim0: bigint;
  claim1: bigint;
  pullPrice: bigint;
  pullBlock: bigint;
};

export function useRope() {
  const { address } = useAccount();
  const { data, isLoading } = useReadContract({
    ...hook,
    functionName: "ropeOf",
    args: address ? [address] : undefined,
    query: { enabled: isConfigured && !!address, refetchInterval: POLL },
  });
  const rope: RopeState | undefined = data
    ? {
        shares: data[0],
        entryPrice: data[1],
        dropBps: data[2],
        triggerPrice: data[3],
        value: data[4],
        pulled: data[5],
        claim0: data[6],
        claim1: data[7],
        pullPrice: data[8],
        pullBlock: data[9],
      }
    : undefined;
  return { rope, isLoading, hasPosition: !!rope && rope.shares > 0n };
}

export function useToken(token: `0x${string}`, spender?: `0x${string}`) {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [address!] },
      { address: token, abi: erc20Abi, functionName: "allowance", args: [address!, spender ?? addresses.hook] },
    ],
    query: { enabled: isConfigured && !!address, refetchInterval: POLL },
  });
  return { balance: data?.[0]?.result as bigint | undefined, allowance: data?.[1]?.result as bigint | undefined };
}

type TxStatus = "idle" | "signing" | "mining" | "done" | "error";

/** wallet write + receipt + refetch, with readable errors */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [message, setMessage] = useState<string>();
  const [hash, setHash] = useState<`0x${string}`>();

  async function send(label: string, request: Parameters<typeof writeContractAsync>[0]) {
    try {
      setStatus("signing");
      setMessage(`${label}: confirm in your wallet`);
      const h = await writeContractAsync(request);
      setHash(h);
      setStatus("mining");
      setMessage(`${label}: waiting for the block`);
      const receipt = await client!.waitForTransactionReceipt({ hash: h });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      await queryClient.invalidateQueries();
      setStatus("done");
      setMessage(`${label}: done`);
      return receipt;
    } catch (e) {
      setStatus("error");
      setMessage(readableError(e));
      throw e;
    }
  }

  return { send, status, message, hash, busy: status === "signing" || status === "mining" };
}

const ERRORS: Record<string, string> = {
  RopeTooShort: "That rope would pull straight away. Pick a longer one.",
  ClaimFirst: "Your rope already pulled. Claim your catch before diving again.",
  AlreadyPulled: "Your rope already pulled. Claim your catch instead.",
  NotLaunched: "The boat hasn't launched yet.",
  Slippage: "Price moved too much. Try again.",
  TooManyRopes: "Too many ropes in the water. Pick another length.",
  NoPosition: "You're not in the water.",
  InvalidDrop: "Ropes come in whole percents, up to 90%.",
  BelowMinimum: "That's below the minimum dive (10 rUSDC), or would leave less than that behind.",
  OutOfRange: "The price is outside the captain's waters. Deposits reopen after the curator rebalances.",
  ZeroAmount: "That amount is too small to buy any shares.",
};

export function readableError(e: unknown) {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      return ERRORS[name] || name || revert.shortMessage;
    }
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}


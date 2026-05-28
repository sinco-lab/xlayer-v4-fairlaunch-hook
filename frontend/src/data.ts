import { useQuery } from "@tanstack/react-query";
import { decodeEventLog } from "viem";
import type { Address, Hex } from "viem";

import {
  fairFlowSwapEvent,
  flowPassUpgradedEvent,
  launchGuardTriggeredEvent,
  marketScoreUpdatedEvent,
  metricsLensAbi,
} from "./abi";
import { appConfig } from "./config";
import { publicClient } from "./web3";

export type PoolDashboard = {
  score: number;
  currentFee: number;
  rollingVolume: bigint;
  netFlow: bigint;
  buyCount: bigint;
  sellCount: bigint;
  uniqueTraderCount: bigint;
  largeTradeCount: bigint;
  inLaunchWindow: boolean;
  guardActive: boolean;
  configured: boolean;
};

export type UserStatus = {
  flowPassTier: number;
  swapCount: bigint;
  buyCount: bigint;
  sellCount: bigint;
  largeTradeCount: bigint;
  lastBuyBlock: bigint;
  lastSwapBlock: bigint;
};

export type LaunchConfig = {
  launchToken: Address;
  quoteToken: Address;
  launchStart: bigint;
  launchEnd: bigint;
  baseFeePips: number;
  maxFeePips: number;
  minFeePips: number;
  maxBuyBps: number;
  maxBuyAmount: bigint;
  cooldownBlocks: number;
  nftDiscountEnabled: boolean;
};

export type EventLog =
  | {
      kind: "swap";
      blockNumber: bigint;
      logIndex: number;
      transactionHash: Hex;
      user?: Address;
      isBuy?: boolean;
      amountInAbs?: bigint;
      appliedFee?: number;
      flowPassTier?: number;
      marketScore?: number;
      source?: "live" | "proof";
    }
  | {
      kind: "score";
      blockNumber: bigint;
      logIndex: number;
      transactionHash: Hex;
      score?: number;
      netFlow?: bigint;
      rollingVolume?: bigint;
      currentFee?: number;
      source?: "live" | "proof";
    }
  | {
      kind: "guard";
      blockNumber: bigint;
      logIndex: number;
      transactionHash: Hex;
      user?: Address;
      reason?: string;
      source?: "live" | "proof";
    }
  | {
      kind: "flowpass";
      blockNumber: bigint;
      logIndex: number;
      transactionHash: Hex;
      user?: Address;
      tokenId?: bigint;
      oldTier?: number;
      newTier?: number;
      source?: "live" | "proof";
    };

type TupleLike = readonly unknown[] & Record<string, unknown>;
type LogWithNullableHash = { transactionHash: Hex | null };

const LOG_QUERY_BLOCK_CHUNK = 100n;
const MAX_LIVE_LOG_BLOCK_WINDOW = 5_000n;

function tupleValue(raw: unknown, name: string, index: number): unknown {
  if (Array.isArray(raw)) {
    const tuple = raw as unknown as TupleLike;
    return tuple[name] ?? tuple[index];
  }

  return (raw as Record<string, unknown>)[name];
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value ?? 0);
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function asAddress(value: unknown): Address {
  return String(value) as Address;
}

function hasTransactionHash<T extends LogWithNullableHash>(log: T): log is T & { transactionHash: Hex } {
  return log.transactionHash !== null;
}

function normalizeDashboard(raw: unknown): PoolDashboard {
  return {
    score: asNumber(tupleValue(raw, "score", 0)),
    currentFee: asNumber(tupleValue(raw, "currentFee", 1)),
    rollingVolume: asBigInt(tupleValue(raw, "rollingVolume", 2)),
    netFlow: asBigInt(tupleValue(raw, "netFlow", 3)),
    buyCount: asBigInt(tupleValue(raw, "buyCount", 4)),
    sellCount: asBigInt(tupleValue(raw, "sellCount", 5)),
    uniqueTraderCount: asBigInt(tupleValue(raw, "uniqueTraderCount", 6)),
    largeTradeCount: asBigInt(tupleValue(raw, "largeTradeCount", 7)),
    inLaunchWindow: asBoolean(tupleValue(raw, "inLaunchWindow", 8)),
    guardActive: asBoolean(tupleValue(raw, "guardActive", 9)),
    configured: asBoolean(tupleValue(raw, "configured", 10)),
  };
}

function normalizeUserStatus(raw: unknown): UserStatus {
  return {
    flowPassTier: asNumber(tupleValue(raw, "flowPassTier", 0)),
    swapCount: asBigInt(tupleValue(raw, "swapCount", 1)),
    buyCount: asBigInt(tupleValue(raw, "buyCount", 2)),
    sellCount: asBigInt(tupleValue(raw, "sellCount", 3)),
    largeTradeCount: asBigInt(tupleValue(raw, "largeTradeCount", 4)),
    lastBuyBlock: asBigInt(tupleValue(raw, "lastBuyBlock", 5)),
    lastSwapBlock: asBigInt(tupleValue(raw, "lastSwapBlock", 6)),
  };
}

function normalizeLaunchConfig(raw: unknown): LaunchConfig {
  return {
    launchToken: asAddress(tupleValue(raw, "launchToken", 0)),
    quoteToken: asAddress(tupleValue(raw, "quoteToken", 1)),
    launchStart: asBigInt(tupleValue(raw, "launchStart", 2)),
    launchEnd: asBigInt(tupleValue(raw, "launchEnd", 3)),
    baseFeePips: asNumber(tupleValue(raw, "baseFeePips", 4)),
    maxFeePips: asNumber(tupleValue(raw, "maxFeePips", 5)),
    minFeePips: asNumber(tupleValue(raw, "minFeePips", 6)),
    maxBuyBps: asNumber(tupleValue(raw, "maxBuyBps", 7)),
    maxBuyAmount: asBigInt(tupleValue(raw, "maxBuyAmount", 8)),
    cooldownBlocks: asNumber(tupleValue(raw, "cooldownBlocks", 9)),
    nftDiscountEnabled: asBoolean(tupleValue(raw, "nftDiscountEnabled", 10)),
  };
}

async function readDashboard(poolId: Hex): Promise<PoolDashboard> {
  if (!appConfig.metricsLensAddress) {
    throw new Error("MetricsLens address and poolId are required.");
  }

  const raw = await publicClient.readContract({
    address: appConfig.metricsLensAddress,
    abi: metricsLensAbi,
    functionName: "getPoolDashboard",
    args: [poolId],
  });

  return normalizeDashboard(raw);
}

async function readLaunchConfig(poolId: Hex): Promise<LaunchConfig> {
  if (!appConfig.metricsLensAddress) {
    throw new Error("MetricsLens address and poolId are required.");
  }

  const raw = await publicClient.readContract({
    address: appConfig.metricsLensAddress,
    abi: metricsLensAbi,
    functionName: "getLaunchConfig",
    args: [poolId],
  });

  return normalizeLaunchConfig(raw);
}

async function readUserStatus(poolId: Hex, userAddress: Address): Promise<UserStatus> {
  if (!appConfig.metricsLensAddress) {
    throw new Error("MetricsLens address and poolId are required.");
  }

  const raw = await publicClient.readContract({
    address: appConfig.metricsLensAddress,
    abi: metricsLensAbi,
    functionName: "getUserStatus",
    args: [poolId, userAddress],
  });

  return normalizeUserStatus(raw);
}

async function readWindowEventLogs(poolId: Hex): Promise<EventLog[]> {
  if (!appConfig.fairFlowHookAddress) {
    throw new Error("FairFlowHook address and poolId are required.");
  }

  const latestBlock = await publicClient.getBlockNumber();
  const configuredWindow = BigInt(appConfig.eventBlockWindow);
  const window = configuredWindow > MAX_LIVE_LOG_BLOCK_WINDOW ? MAX_LIVE_LOG_BLOCK_WINDOW : configuredWindow;
  const fromBlock = latestBlock > window ? latestBlock - window : 0n;
  const flowPassAddress = appConfig.flowPassNftAddress;

  const [swapLogs, scoreLogs, guardLogs, flowPassLogs] = await Promise.all([
    getLogsInChunks(fromBlock, latestBlock, (chunkFromBlock, chunkToBlock) =>
      publicClient.getLogs({
        address: appConfig.fairFlowHookAddress,
        event: fairFlowSwapEvent,
        args: { poolId },
        fromBlock: chunkFromBlock,
        toBlock: chunkToBlock,
      }),
    ),
    getLogsInChunks(fromBlock, latestBlock, (chunkFromBlock, chunkToBlock) =>
      publicClient.getLogs({
        address: appConfig.fairFlowHookAddress,
        event: marketScoreUpdatedEvent,
        args: { poolId },
        fromBlock: chunkFromBlock,
        toBlock: chunkToBlock,
      }),
    ),
    getLogsInChunks(fromBlock, latestBlock, (chunkFromBlock, chunkToBlock) =>
      publicClient.getLogs({
        address: appConfig.fairFlowHookAddress,
        event: launchGuardTriggeredEvent,
        args: { poolId },
        fromBlock: chunkFromBlock,
        toBlock: chunkToBlock,
      }),
    ),
    flowPassAddress
      ? getLogsInChunks(fromBlock, latestBlock, (chunkFromBlock, chunkToBlock) =>
          publicClient.getLogs({
            address: flowPassAddress,
            event: flowPassUpgradedEvent,
            fromBlock: chunkFromBlock,
            toBlock: chunkToBlock,
          }),
        )
      : Promise.resolve([]),
  ]);

  const events: EventLog[] = [
    ...swapLogs.filter(hasTransactionHash).map((log) => ({
      kind: "swap" as const,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      transactionHash: log.transactionHash,
      user: log.args.user,
      isBuy: log.args.isBuy,
      amountInAbs: log.args.amountInAbs,
      appliedFee: log.args.appliedFee,
      flowPassTier: log.args.flowPassTier,
      marketScore: log.args.marketScore,
      source: "live" as const,
    })),
    ...scoreLogs.filter(hasTransactionHash).map((log) => ({
      kind: "score" as const,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      transactionHash: log.transactionHash,
      score: log.args.score,
      netFlow: log.args.netFlow,
      rollingVolume: log.args.rollingVolume,
      currentFee: log.args.currentFee,
      source: "live" as const,
    })),
    ...guardLogs.filter(hasTransactionHash).map((log) => ({
      kind: "guard" as const,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      transactionHash: log.transactionHash,
      user: log.args.user,
      reason: log.args.reason,
      source: "live" as const,
    })),
    ...flowPassLogs.filter(hasTransactionHash).map((log) => ({
      kind: "flowpass" as const,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      transactionHash: log.transactionHash,
      user: log.args.user,
      tokenId: log.args.tokenId,
      oldTier: log.args.oldTier,
      newTier: log.args.newTier,
      source: "live" as const,
    })),
  ];

  return events.sort((a, b) => {
    if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
    return a.blockNumber > b.blockNumber ? -1 : 1;
  });
}

async function getLogsInChunks<T>(
  fromBlock: bigint,
  toBlock: bigint,
  readChunk: (fromBlock: bigint, toBlock: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  const logs: T[] = [];
  let chunkStart = fromBlock;

  while (chunkStart <= toBlock) {
    const chunkEnd = chunkStart + LOG_QUERY_BLOCK_CHUNK - 1n > toBlock ? toBlock : chunkStart + LOG_QUERY_BLOCK_CHUNK - 1n;
    const chunkLogs = await readChunk(chunkStart, chunkEnd);
    logs.push(...chunkLogs);
    chunkStart = chunkEnd + 1n;
  }

  return logs;
}

async function readReceiptEvents(poolId: Hex, hash: Hex): Promise<EventLog[]> {
  if (!appConfig.fairFlowHookAddress) return [];

  const receipt = await publicClient.getTransactionReceipt({ hash });
  const fairFlowHook = appConfig.fairFlowHookAddress.toLowerCase();
  const flowPass = appConfig.flowPassNftAddress?.toLowerCase();
  const events: EventLog[] = [];

  for (const log of receipt.logs) {
    const address = log.address.toLowerCase();
    if (address !== fairFlowHook && address !== flowPass) continue;

    try {
      const decoded = decodeEventLog({
        abi: [fairFlowSwapEvent, marketScoreUpdatedEvent, launchGuardTriggeredEvent, flowPassUpgradedEvent],
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as Record<string, unknown>;

      if (decoded.eventName !== "FlowPassUpgraded" && String(args.poolId).toLowerCase() !== poolId.toLowerCase()) {
        continue;
      }

      if (decoded.eventName === "FairFlowSwap") {
        events.push({
          kind: "swap",
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
          transactionHash: log.transactionHash ?? hash,
          user: args.user as Address | undefined,
          isBuy: asBoolean(args.isBuy),
          amountInAbs: asBigInt(args.amountInAbs),
          appliedFee: asNumber(args.appliedFee),
          flowPassTier: asNumber(args.flowPassTier),
          marketScore: asNumber(args.marketScore),
          source: "proof",
        });
        continue;
      }

      if (decoded.eventName === "MarketScoreUpdated") {
        events.push({
          kind: "score",
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
          transactionHash: log.transactionHash ?? hash,
          score: asNumber(args.score),
          netFlow: asBigInt(args.netFlow),
          rollingVolume: asBigInt(args.rollingVolume),
          currentFee: asNumber(args.currentFee),
          source: "proof",
        });
        continue;
      }

      if (decoded.eventName === "LaunchGuardTriggered") {
        events.push({
          kind: "guard",
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
          transactionHash: log.transactionHash ?? hash,
          user: args.user as Address | undefined,
          reason: String(args.reason ?? "Guard rule"),
          source: "proof",
        });
        continue;
      }

      events.push({
        kind: "flowpass",
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
        transactionHash: log.transactionHash ?? hash,
        user: args.user as Address | undefined,
        tokenId: asBigInt(args.tokenId),
        oldTier: asNumber(args.oldTier),
        newTier: asNumber(args.newTier),
        source: "proof",
      });
    } catch {
      continue;
    }
  }

  return events;
}

async function readConfiguredProofEvents(poolId: Hex): Promise<EventLog[]> {
  const hashes = [appConfig.demoSwapTxHash, appConfig.browserSwapTxHash].filter(Boolean) as Hex[];
  const results = await Promise.allSettled(hashes.map((hash) => readReceiptEvents(poolId, hash)));

  return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function mergeEvents(...eventGroups: EventLog[][]): EventLog[] {
  const seen = new Set<string>();
  const events = eventGroups.flat().filter((event) => {
    const key = `${event.transactionHash}-${event.logIndex}-${event.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return events.sort((a, b) => {
    if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
    return a.blockNumber > b.blockNumber ? -1 : 1;
  });
}

async function readEventLogs(poolId: Hex): Promise<EventLog[]> {
  const [windowResult, proofResult] = await Promise.allSettled([readWindowEventLogs(poolId), readConfiguredProofEvents(poolId)]);
  const windowEvents = windowResult.status === "fulfilled" ? windowResult.value : [];
  const proofEvents = proofResult.status === "fulfilled" ? proofResult.value : [];

  if (!windowEvents.length && !proofEvents.length) {
    if (windowResult.status === "rejected") throw windowResult.reason;
    if (proofResult.status === "rejected") throw proofResult.reason;
  }

  return mergeEvents(windowEvents, proofEvents);
}

export function usePulsePoolData(userAddress?: Address, poolId?: Hex) {
  const readReady = Boolean(appConfig.metricsLensAddress && appConfig.fairFlowHookAddress && poolId);

  const dashboardQuery = useQuery({
    queryKey: ["pool-dashboard", appConfig.chainId, appConfig.metricsLensAddress, poolId],
    queryFn: () => readDashboard(poolId as Hex),
    enabled: readReady,
    refetchInterval: 12_000,
  });

  const launchConfigQuery = useQuery({
    queryKey: ["launch-config", appConfig.chainId, appConfig.metricsLensAddress, poolId],
    queryFn: () => readLaunchConfig(poolId as Hex),
    enabled: readReady,
    refetchInterval: 30_000,
  });

  const userStatusQuery = useQuery({
    queryKey: ["user-status", appConfig.chainId, appConfig.metricsLensAddress, poolId, userAddress],
    queryFn: () => readUserStatus(poolId as Hex, userAddress as Address),
    enabled: readReady && Boolean(userAddress),
    refetchInterval: 12_000,
  });

  const eventLogsQuery = useQuery({
    queryKey: ["event-logs", appConfig.chainId, appConfig.fairFlowHookAddress, poolId],
    queryFn: () => readEventLogs(poolId as Hex),
    enabled: readReady,
    refetchInterval: 12_000,
  });

  return {
    dashboardQuery,
    launchConfigQuery,
    userStatusQuery,
    eventLogsQuery,
    refetchAll: () =>
      Promise.all([
        dashboardQuery.refetch(),
        launchConfigQuery.refetch(),
        userStatusQuery.refetch(),
        eventLogsQuery.refetch(),
      ]),
  };
}

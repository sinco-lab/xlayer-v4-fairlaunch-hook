import { encodeAbiParameters, getAddress, keccak256, parseUnits, type Address, type Hex } from "viem";

import { appConfig } from "./config";

export type SwapDirection = "buy" | "sell";

export type ParsedAmount =
  | {
      value: bigint;
      error?: undefined;
    }
  | {
      value?: undefined;
      error: string;
    };

export type DemoPoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

const poolManagerPoolsSlot = `0x${"0".repeat(63)}6` as Hex;
const uint160Mask = (1n << 160n) - 1n;

export function parseDemoAmount(input: string, decimals: number): ParsedAmount {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Enter an amount." };

  try {
    const value = parseUnits(trimmed, decimals);
    if (value <= 0n) return { error: "Amount must be greater than zero." };
    return { value };
  } catch {
    return { error: `Use a valid decimal amount with up to ${decimals} decimals.` };
  }
}

export function parseOptionalDemoAmount(input: string, decimals: number): ParsedAmount {
  const trimmed = input.trim();
  if (!trimmed) return { value: 0n };

  try {
    const value = parseUnits(trimmed, decimals);
    if (value < 0n) return { error: "Minimum output cannot be negative." };
    return { value };
  } catch {
    return { error: `Use a valid decimal amount with up to ${decimals} decimals.` };
  }
}

export function demoInputToken(direction: SwapDirection): Address | undefined {
  return direction === "buy" ? appConfig.quoteTokenAddress : appConfig.launchTokenAddress;
}

export function demoOutputToken(direction: SwapDirection): Address | undefined {
  return direction === "buy" ? appConfig.launchTokenAddress : appConfig.quoteTokenAddress;
}

export function demoInputSymbol(direction: SwapDirection): string {
  return direction === "buy" ? appConfig.quoteTokenSymbol : appConfig.launchTokenSymbol;
}

export function demoOutputSymbol(direction: SwapDirection): string {
  return direction === "buy" ? appConfig.launchTokenSymbol : appConfig.quoteTokenSymbol;
}

export function demoZeroForOne(direction: SwapDirection): boolean {
  return direction === "buy";
}

export function buildDemoPoolKey(): DemoPoolKey {
  if (!appConfig.quoteTokenAddress || !appConfig.launchTokenAddress || !appConfig.fairFlowHookAddress) {
    throw new Error("Demo PoolKey requires quote token, launch token, and hook addresses.");
  }

  return {
    currency0: appConfig.quoteTokenAddress,
    currency1: appConfig.launchTokenAddress,
    fee: appConfig.poolFee,
    tickSpacing: appConfig.poolTickSpacing,
    hooks: appConfig.fairFlowHookAddress,
  };
}

export function buildPoolKeyForTokens(launchToken: Address, quoteToken: Address): DemoPoolKey {
  if (!appConfig.fairFlowHookAddress) {
    throw new Error("PoolKey requires a configured FairFlowHook address.");
  }

  const [currency0, currency1] =
    BigInt(quoteToken.toLowerCase()) < BigInt(launchToken.toLowerCase())
      ? [getAddress(quoteToken), getAddress(launchToken)]
      : [getAddress(launchToken), getAddress(quoteToken)];

  return {
    currency0,
    currency1,
    fee: appConfig.poolFee,
    tickSpacing: appConfig.poolTickSpacing,
    hooks: appConfig.fairFlowHookAddress,
  };
}

export function poolIdForPoolKey(poolKey: DemoPoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
    ),
  );
}

export function poolStateSlotForPoolId(poolId: Hex): Hex {
  return keccak256(`${poolId}${poolManagerPoolsSlot.slice(2)}` as Hex);
}

export function sqrtPriceX96FromSlot0(slot0: Hex): bigint {
  return BigInt(slot0) & uint160Mask;
}

export function encodeHookUser(user: Address) {
  return encodeAbiParameters([{ type: "address" }], [user]);
}

export function buildSwapDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + appConfig.swapDeadlineSeconds);
}

import { encodeAbiParameters, parseUnits, type Address } from "viem";

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

export function encodeHookUser(user: Address) {
  return encodeAbiParameters([{ type: "address" }], [user]);
}

export function buildSwapDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + appConfig.swapDeadlineSeconds);
}

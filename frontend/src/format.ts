import { formatUnits } from "viem";
import type { Address, Hex } from "viem";

export function formatAddress(address?: Address): string {
  if (!address) return "Not configured";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatHash(hash?: Hex): string {
  if (!hash) return "Not configured";
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function formatFeePips(pips?: number): string {
  if (pips === undefined) return "Not available";
  return `${(pips / 10_000).toFixed(2)}%`;
}

export function formatInteger(value?: bigint | number): string {
  if (value === undefined) return "Not available";
  const numeric = typeof value === "bigint" ? Number(value) : value;

  if (!Number.isSafeInteger(numeric)) {
    return value.toString();
  }

  return new Intl.NumberFormat("en", {
    notation: Math.abs(numeric) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatSignedInteger(value?: bigint): string {
  if (value === undefined) return "Not available";
  const prefix = value > 0n ? "+" : "";
  return `${prefix}${formatInteger(value)}`;
}

export function formatTokenAmount(value?: bigint, symbol = "", decimals = 18): string {
  if (value === undefined) return "Not available";

  const normalized = Number(formatUnits(value < 0n ? -value : value, decimals));
  const prefix = value < 0n ? "-" : "";
  const suffix = symbol ? ` ${symbol}` : "";

  if (!Number.isFinite(normalized)) {
    return `${prefix}${formatUnits(value < 0n ? -value : value, decimals)}${suffix}`;
  }

  if (normalized >= 1_000_000_000_000) {
    return `${prefix}>1T${suffix}`;
  }

  const formatted = new Intl.NumberFormat("en", {
    notation: normalized >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: normalized >= 1 ? 4 : 6,
  }).format(normalized);

  return `${prefix}${formatted}${suffix}`;
}

export function formatSignedTokenAmount(value?: bigint, symbol = "", decimals = 18): string {
  if (value === undefined) return "Not available";
  const prefix = value > 0n ? "+" : "";
  return `${prefix}${formatTokenAmount(value, symbol, decimals)}`;
}

export function formatDateTime(timestamp?: bigint): string {
  if (!timestamp || timestamp === 0n) return "Not configured";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(Number(timestamp) * 1000);
}

export function blockExplorerTxUrl(explorerUrl: string, txHash?: Hex): string | undefined {
  if (!txHash) return undefined;
  return `${explorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

export function blockExplorerAddressUrl(explorerUrl: string, address?: Address): string | undefined {
  if (!address) return undefined;
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

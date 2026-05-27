import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export type ConfigIssue = {
  label: string;
  detail: string;
};

const DEFAULT_RPC_URL = "https://testrpc.xlayer.tech/terigon";
const DEFAULT_EXPLORER_URL = "https://www.okx.com/web3/explorer/xlayer-test";
const DEFAULT_DYNAMIC_FEE_FLAG = 0x800000;

function readEnv(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean, issues: ConfigIssue[]): boolean {
  const raw = readEnv(name);
  if (!raw) return fallback;

  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  issues.push({
    label: name,
    detail: "Must be true or false.",
  });

  return fallback;
}

function readAddress(name: string, issues: ConfigIssue[]): Address | undefined {
  const raw = readEnv(name);
  if (!raw) return undefined;

  if (!isAddress(raw)) {
    issues.push({
      label: name,
      detail: "Must be a valid EVM address.",
    });
    return undefined;
  }

  return getAddress(raw);
}

function readBytes32(name: string, issues: ConfigIssue[]): Hex | undefined {
  const raw = readEnv(name);
  if (!raw) return undefined;

  if (!isHex(raw, { strict: true }) || raw.length !== 66) {
    issues.push({
      label: name,
      detail: "Must be a 32-byte hex value.",
    });
    return undefined;
  }

  return raw;
}

function readTxHash(name: string, issues: ConfigIssue[]): Hex | undefined {
  const raw = readEnv(name);
  if (!raw) return undefined;

  if (!isHex(raw, { strict: true }) || raw.length !== 66) {
    issues.push({
      label: name,
      detail: "Must be a 32-byte transaction hash.",
    });
    return undefined;
  }

  return raw;
}

const configIssues: ConfigIssue[] = [];

export const appConfig = {
  chainId: readNumber("VITE_PULSEPOOL_CHAIN_ID", 1952),
  networkName: readEnv("VITE_PULSEPOOL_NETWORK_NAME") ?? "X Layer testnet",
  nativeCurrencySymbol: readEnv("VITE_PULSEPOOL_NATIVE_SYMBOL") ?? "OKB",
  rpcUrl: readEnv("VITE_PULSEPOOL_RPC_URL") ?? DEFAULT_RPC_URL,
  explorerUrl: readEnv("VITE_PULSEPOOL_EXPLORER_URL") ?? DEFAULT_EXPLORER_URL,
  enableWrites: readBoolean("VITE_PULSEPOOL_ENABLE_WRITES", false, configIssues),
  metricsLensAddress: readAddress("VITE_METRICS_LENS_ADDRESS", configIssues),
  fairFlowHookAddress: readAddress("VITE_FAIRFLOW_HOOK_ADDRESS", configIssues),
  poolManagerAddress: readAddress("VITE_POOL_MANAGER_ADDRESS", configIssues),
  v4QuoterAddress: readAddress("VITE_V4_QUOTER_ADDRESS", configIssues),
  launchFactoryAddress: readAddress("VITE_LAUNCH_FACTORY_ADDRESS", configIssues),
  swapRouterAddress: readAddress("VITE_SWAP_ROUTER_ADDRESS", configIssues),
  flowPassNftAddress: readAddress("VITE_FLOW_PASS_NFT_ADDRESS", configIssues),
  launchTokenAddress: readAddress("VITE_LAUNCH_TOKEN_ADDRESS", configIssues),
  quoteTokenAddress: readAddress("VITE_QUOTE_TOKEN_ADDRESS", configIssues),
  launchTokenSymbol: readEnv("VITE_LAUNCH_TOKEN_SYMBOL") ?? "LAUNCH",
  quoteTokenSymbol: readEnv("VITE_QUOTE_TOKEN_SYMBOL") ?? "QUOTE",
  tokenDecimals: readNumber("VITE_TOKEN_DECIMALS", 18),
  poolFee: readNumber("VITE_POOL_FEE", DEFAULT_DYNAMIC_FEE_FLAG),
  poolTickSpacing: readNumber("VITE_POOL_TICK_SPACING", 60),
  swapDeadlineSeconds: readNumber("VITE_SWAP_DEADLINE_SECONDS", 3600),
  poolId: readBytes32("VITE_POOL_ID", configIssues),
  demoSwapTxHash: readTxHash("VITE_DEMO_SWAP_TX_HASH", configIssues),
  browserSwapTxHash: readTxHash("VITE_BROWSER_SWAP_TX_HASH", configIssues),
  eventBlockWindow: readNumber("VITE_EVENT_BLOCK_WINDOW", 250_000),
  configIssues,
};

export const liveReadReady = Boolean(
  appConfig.metricsLensAddress && appConfig.fairFlowHookAddress && appConfig.poolId,
);

const invalidConfigLabels = new Set(configIssues.map((issue) => issue.label));

function requiredWriteIssue(label: string, value: unknown, detail: string): ConfigIssue | undefined {
  if (Boolean(value) || invalidConfigLabels.has(label)) return undefined;
  return { label, detail };
}

export const liveWriteIssues = [
  ...configIssues,
  !appConfig.enableWrites
    ? {
        label: "VITE_PULSEPOOL_ENABLE_WRITES",
        detail: "Set to true before allowing browser wallet transactions.",
      }
    : undefined,
  requiredWriteIssue("VITE_POOL_MANAGER_ADDRESS", appConfig.poolManagerAddress, "Required to verify the launch pool write path."),
  requiredWriteIssue("VITE_SWAP_ROUTER_ADDRESS", appConfig.swapRouterAddress, "Required to submit fair swaps."),
  requiredWriteIssue("VITE_LAUNCH_TOKEN_ADDRESS", appConfig.launchTokenAddress, "Required to construct the launch PoolKey."),
  requiredWriteIssue("VITE_QUOTE_TOKEN_ADDRESS", appConfig.quoteTokenAddress, "Required to construct the launch PoolKey."),
  requiredWriteIssue("VITE_FAIRFLOW_HOOK_ADDRESS", appConfig.fairFlowHookAddress, "Required to construct the launch PoolKey."),
  requiredWriteIssue("VITE_POOL_ID", appConfig.poolId, "Required to connect writes back to the configured dashboard."),
].filter(Boolean) as ConfigIssue[];

export const liveWriteReady = appConfig.enableWrites && liveWriteIssues.length === 0;

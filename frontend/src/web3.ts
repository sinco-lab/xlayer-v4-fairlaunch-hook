import { createPublicClient, defineChain, http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

import { appConfig } from "./config";

export const pulsePoolChain = defineChain({
  id: appConfig.chainId,
  name: appConfig.networkName,
  nativeCurrency: {
    name: appConfig.nativeCurrencySymbol,
    symbol: appConfig.nativeCurrencySymbol,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [appConfig.rpcUrl] },
    public: { http: [appConfig.rpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "Explorer",
      url: appConfig.explorerUrl,
    },
  },
});

export const wagmiConfig = createConfig({
  chains: [pulsePoolChain] as const,
  connectors: [injected()],
  transports: {
    [pulsePoolChain.id]: http(appConfig.rpcUrl),
  },
});

export const publicClient = createPublicClient({
  chain: pulsePoolChain,
  transport: http(appConfig.rpcUrl),
});

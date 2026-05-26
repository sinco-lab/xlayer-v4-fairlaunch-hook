import { parseAbiItem } from "viem";

export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const swapRouterAbi = [
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "zeroForOne", type: "bool" },
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "hookData", type: "bytes" },
      { name: "receiver", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "Delta", type: "int256" }],
  },
] as const;

export const metricsLensAbi = [
  {
    type: "function",
    name: "getPoolDashboard",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      {
        name: "dashboard",
        type: "tuple",
        components: [
          { name: "score", type: "uint16" },
          { name: "currentFee", type: "uint24" },
          { name: "rollingVolume", type: "uint256" },
          { name: "netFlow", type: "int256" },
          { name: "buyCount", type: "uint256" },
          { name: "sellCount", type: "uint256" },
          { name: "uniqueTraderCount", type: "uint256" },
          { name: "largeTradeCount", type: "uint256" },
          { name: "inLaunchWindow", type: "bool" },
          { name: "guardActive", type: "bool" },
          { name: "configured", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getUserStatus",
    stateMutability: "view",
    inputs: [
      { name: "poolId", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [
      {
        name: "status",
        type: "tuple",
        components: [
          { name: "flowPassTier", type: "uint8" },
          { name: "swapCount", type: "uint256" },
          { name: "buyCount", type: "uint256" },
          { name: "sellCount", type: "uint256" },
          { name: "largeTradeCount", type: "uint256" },
          { name: "lastBuyBlock", type: "uint64" },
          { name: "lastSwapBlock", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getLaunchConfig",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      {
        name: "config",
        type: "tuple",
        components: [
          { name: "launchToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "launchStart", type: "uint64" },
          { name: "launchEnd", type: "uint64" },
          { name: "baseFeePips", type: "uint24" },
          { name: "maxFeePips", type: "uint24" },
          { name: "minFeePips", type: "uint24" },
          { name: "maxBuyBps", type: "uint16" },
          { name: "maxBuyAmount", type: "uint256" },
          { name: "cooldownBlocks", type: "uint32" },
          { name: "nftDiscountEnabled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getCurrentFee",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "fee", type: "uint24" }],
  },
] as const;

export const fairFlowSwapEvent = parseAbiItem(
  "event FairFlowSwap(bytes32 indexed poolId, address indexed user, bool isBuy, uint256 amountInAbs, uint24 appliedFee, uint8 flowPassTier, uint16 marketScore)",
);

export const marketScoreUpdatedEvent = parseAbiItem(
  "event MarketScoreUpdated(bytes32 indexed poolId, uint16 score, int256 netFlow, uint256 rollingVolume, uint24 currentFee)",
);

export const launchGuardTriggeredEvent = parseAbiItem(
  "event LaunchGuardTriggered(bytes32 indexed poolId, address indexed user, string reason)",
);

export const flowPassUpgradedEvent = parseAbiItem(
  "event FlowPassUpgraded(address indexed user, uint256 indexed tokenId, uint8 oldTier, uint8 newTier)",
);

import { encodeAbiParameters, type Address, type Hex } from "viem";

import type { DemoPoolKey } from "./transactions";

export const universalRouterCommands = {
  v4Swap: "0x10" as Hex,
} as const;

export const v4RouterActions = {
  settleAll: 0x0c,
  swapExactInSingle: 0x06,
  takeAll: 0x0f,
} as const;

export type V4ExactInputSingleSwapParams = {
  amountIn: bigint;
  amountOutMinimum: bigint;
  hookData: Hex;
  outputCurrency: Address;
  poolKey: DemoPoolKey;
  zeroForOne: boolean;
};

export type UniversalRouterPlan = {
  commands: Hex;
  inputs: readonly [Hex];
};

export function buildV4ExactInputSingleSwap({
  amountIn,
  amountOutMinimum,
  hookData,
  outputCurrency,
  poolKey,
  zeroForOne,
}: V4ExactInputSingleSwapParams): UniversalRouterPlan {
  const actions = encodeV4Actions([
    v4RouterActions.swapExactInSingle,
    v4RouterActions.settleAll,
    v4RouterActions.takeAll,
  ]);
  const inputCurrency = zeroForOne ? poolKey.currency0 : poolKey.currency1;
  const params = [
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            {
              name: "poolKey",
              type: "tuple",
              components: poolKeyAbiComponents,
            },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint128" },
            { name: "amountOutMinimum", type: "uint128" },
            { name: "hookData", type: "bytes" },
          ],
        },
      ],
      [
        {
          amountIn,
          amountOutMinimum,
          hookData,
          poolKey,
          zeroForOne,
        },
      ],
    ),
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
      ],
      [inputCurrency, amountIn],
    ),
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
      ],
      [outputCurrency, amountOutMinimum],
    ),
  ] as const;

  return {
    commands: universalRouterCommands.v4Swap,
    inputs: [encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [...params]])],
  };
}

function encodeV4Actions(actions: readonly number[]): Hex {
  return `0x${actions.map((action) => action.toString(16).padStart(2, "0")).join("")}`;
}

const poolKeyAbiComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

import assert from "node:assert/strict";
import test from "node:test";

import { decodeAbiParameters } from "viem";

import { buildV4ExactInputSingleSwap, universalRouterCommands, v4RouterActions } from "../src/universalRouter.ts";

const poolKey = {
  currency0: "0x9Aa9313467F791f5AC031F5f130cA07F23e25204",
  currency1: "0xd641ed64bbe3dB2856E6523a2968D33Ff5e55d22",
  fee: 0x800000,
  tickSpacing: 60,
  hooks: "0xc560CD40AcD57db2eD18373351fDcf9211d890C0",
};

test("encodes a v4 exact-input swap for the Universal Router", () => {
  const hookData = "0x00000000000000000000000098a078b22b258b30532f73c0187b7e7296047a57";
  const plan = buildV4ExactInputSingleSwap({
    amountIn: 1_000_000_000_000_000_000n,
    amountOutMinimum: 950_000_000_000_000_000n,
    hookData,
    outputCurrency: poolKey.currency1,
    poolKey,
    zeroForOne: true,
  });

  assert.equal(plan.commands, universalRouterCommands.v4Swap);

  const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], plan.inputs[0]);

  assert.equal(actions, "0x060c0f");
  assert.equal(params.length, 3);

  const [swapParams] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
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
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    params[0],
  );
  const [settleCurrency, settleAmount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[1]);
  const [takeCurrency, takeMinimum] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], params[2]);

  assert.deepEqual(swapParams.poolKey, poolKey);
  assert.equal(swapParams.zeroForOne, true);
  assert.equal(swapParams.amountIn, 1_000_000_000_000_000_000n);
  assert.equal(swapParams.amountOutMinimum, 950_000_000_000_000_000n);
  assert.equal(swapParams.hookData, hookData);
  assert.equal(settleCurrency, poolKey.currency0);
  assert.equal(settleAmount, 1_000_000_000_000_000_000n);
  assert.equal(takeCurrency, poolKey.currency1);
  assert.equal(takeMinimum, 950_000_000_000_000_000n);

  assert.equal(universalRouterCommands.v4Swap, "0x10");
  assert.deepEqual(v4RouterActions, {
    settleAll: 0x0c,
    swapExactInSingle: 0x06,
    takeAll: 0x0f,
  });
});

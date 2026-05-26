// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

contract HookSpike is BaseHook {
    using LPFeeLibrary for uint24;
    using PoolIdLibrary for PoolKey;

    error InvalidHookData();
    error NotDynamicFee();

    mapping(PoolId => uint256) public beforeSwapCount;
    mapping(PoolId => uint256) public afterSwapCount;
    mapping(PoolId => address) public lastUser;
    mapping(PoolId => uint24) public lastReturnedFee;
    mapping(PoolId => BalanceDelta) public lastSwapDelta;

    uint24 public overrideFee;

    constructor(IPoolManager _poolManager, uint24 _overrideFee) BaseHook(_poolManager) {
        overrideFee = _overrideFee;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function setOverrideFee(uint24 fee) external {
        overrideFee = fee;
    }

    function _afterInitialize(address, PoolKey calldata key, uint160, int24) internal pure override returns (bytes4) {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        address user = _decodeUser(hookData);
        PoolId poolId = key.toId();

        beforeSwapCount[poolId]++;
        lastUser[poolId] = user;
        lastReturnedFee[poolId] = overrideFee;

        return
            (
                BaseHook.beforeSwap.selector,
                BeforeSwapDeltaLibrary.ZERO_DELTA,
                overrideFee | LPFeeLibrary.OVERRIDE_FEE_FLAG
            );
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta delta, bytes calldata hookData)
        internal
        override
        returns (bytes4, int128)
    {
        address user = _decodeUser(hookData);
        PoolId poolId = key.toId();

        afterSwapCount[poolId]++;
        lastUser[poolId] = user;
        lastSwapDelta[poolId] = delta;

        return (BaseHook.afterSwap.selector, 0);
    }

    function _decodeUser(bytes calldata hookData) internal pure returns (address user) {
        if (hookData.length != 32) revert InvalidHookData();
        user = abi.decode(hookData, (address));
        if (user == address(0)) revert InvalidHookData();
    }
}

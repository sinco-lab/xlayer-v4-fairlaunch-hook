// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "../utils/libraries/EasyPosm.sol";

import {HookSpike} from "../../src/spikes/HookSpike.sol";
import {BaseTest} from "../utils/BaseTest.sol";

contract HookSpikeTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;
    PoolId poolId;
    HookSpike hook;

    address user = makeAddr("spike-user");

    event Swap(
        PoolId indexed poolId,
        address indexed sender,
        int128 amount0,
        int128 amount1,
        uint160 sqrtPriceX96,
        uint128 liquidity,
        int24 tick,
        uint24 fee
    );

    function setUp() public {
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();

        address flags = address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG));
        bytes memory constructorArgs = abi.encode(poolManager, uint24(123));
        deployCodeTo("spikes/HookSpike.sol:HookSpike", constructorArgs, flags);
        hook = HookSpike(flags);

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        _addFullRangeLiquidity();
    }

    function testHookAddressHasExpectedPermissions() public view {
        assertTrue(uint160(address(hook)) & Hooks.AFTER_INITIALIZE_FLAG != 0);
        assertTrue(uint160(address(hook)) & Hooks.BEFORE_SWAP_FLAG != 0);
        assertTrue(uint160(address(hook)) & Hooks.AFTER_SWAP_FLAG != 0);

        Hooks.Permissions memory permissions = hook.getHookPermissions();
        assertTrue(permissions.afterInitialize);
        assertTrue(permissions.beforeSwap);
        assertTrue(permissions.afterSwap);
        assertFalse(permissions.beforeSwapReturnDelta);
        assertFalse(permissions.afterSwapReturnDelta);
    }

    function testBeforeAndAfterSwapAreCalled() public {
        assertEq(hook.beforeSwapCount(poolId), 0);
        assertEq(hook.afterSwapCount(poolId), 0);

        BalanceDelta swapDelta = _swapWithUser(user);

        assertEq(swapDelta.amount0(), -1e18);
        assertEq(hook.beforeSwapCount(poolId), 1);
        assertEq(hook.afterSwapCount(poolId), 1);
    }

    function testHookDataUserDecoding() public {
        _swapWithUser(user);

        assertEq(hook.lastUser(poolId), user);
    }

    function testMalformedHookDataReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.beforeSwap.selector,
                abi.encodeWithSelector(HookSpike.InvalidHookData.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: bytes("bad"),
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function testFeeOverrideWorks() public {
        hook.setOverrideFee(500000);

        vm.expectEmit(true, true, false, false, address(poolManager));
        emit Swap(poolId, address(swapRouter), -1e18, 0, 0, 0, 0, 500000);

        _swapWithUser(user);

        assertEq(hook.lastReturnedFee(poolId), 500000);
        (,,, uint24 storedFee) = poolManager.getSlot0(poolId);
        assertEq(storedFee, 0);
    }

    function testStaticFeePoolRejectedOnInitialize() public {
        PoolKey memory staticFeePool = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));

        vm.expectRevert();
        poolManager.initialize(staticFeePool, Constants.SQRT_PRICE_1_1);
    }

    function _swapWithUser(address swapUser) internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: abi.encode(swapUser),
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function _addFullRangeLiquidity() internal {
        int24 tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);
        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }
}

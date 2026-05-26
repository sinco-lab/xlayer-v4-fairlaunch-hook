// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";
import {IMetricsLens} from "../src/interfaces/IMetricsLens.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";
import {MetricsLens} from "../src/MetricsLens.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract MetricsLensTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;
    FairFlowHook hook;
    FlowPassNFT flowPass;
    MetricsLens lens;

    address user = makeAddr("lens-user");
    address secondUser = makeAddr("second-lens-user");

    function setUp() public {
        vm.warp(1_700_000_000);
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG));
        bytes memory constructorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("FairFlowHook.sol:FairFlowHook", constructorArgs, flags);
        hook = FairFlowHook(flags);

        flowPass = new FlowPassNFT(address(this));
        flowPass.setMinter(address(hook), true);
        hook.setFlowPass(address(flowPass));

        lens = new MetricsLens(IFairFlowHook(address(hook)));

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);
        _addFullRangeLiquidity(poolKey);
    }

    function testGetPoolDashboard() public {
        hook.setLaunchConfig(poolKey, _defaultConfig());

        IMetricsLens.PoolDashboard memory dashboard = lens.getPoolDashboard(poolId);

        assertTrue(dashboard.configured);
        assertTrue(dashboard.inLaunchWindow);
        assertTrue(dashboard.guardActive);
        assertEq(dashboard.score, 50);
        assertEq(dashboard.currentFee, 3000);
        assertEq(dashboard.rollingVolume, 0);
        assertEq(dashboard.netFlow, 0);
    }

    function testGetUserStatus() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig());

        _swapWithUser(user);

        IMetricsLens.UserStatus memory status = lens.getUserStatus(poolId, user);
        assertEq(status.flowPassTier, 1);
        assertEq(status.swapCount, 1);
        assertEq(status.buyCount, 1);
        assertEq(status.sellCount, 0);
        assertEq(status.largeTradeCount, 0);
        assertEq(status.lastBuyBlock, block.number);
        assertEq(status.lastSwapBlock, block.number);
    }

    function testGetLaunchConfig() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();
        hook.setLaunchConfig(poolKey, config);

        IFairFlowHook.LaunchConfig memory saved = lens.getLaunchConfig(poolId);

        assertEq(saved.launchToken, config.launchToken);
        assertEq(saved.quoteToken, config.quoteToken);
        assertEq(saved.launchStart, config.launchStart);
        assertEq(saved.launchEnd, config.launchEnd);
        assertEq(saved.baseFeePips, config.baseFeePips);
    }

    function testGetCurrentFee() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig();
        hook.setLaunchConfig(poolKey, config);

        assertEq(lens.getCurrentFee(poolId), config.baseFeePips);
    }

    function testLensDoesNotModifyState() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig());
        _swapWithUser(user);

        uint256 volumeBefore = lens.getPoolDashboard(poolId).rollingVolume;
        uint256 swapCountBefore = lens.getUserStatus(poolId, user).swapCount;

        lens.getPoolDashboard(poolId);
        lens.getUserStatus(poolId, user);
        lens.getCurrentFee(poolId);
        lens.getLaunchConfig(poolId);

        assertEq(lens.getPoolDashboard(poolId).rollingVolume, volumeBefore);
        assertEq(lens.getUserStatus(poolId, user).swapCount, swapCountBefore);
    }

    function testLensReflectsStateAfterSwaps() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig());

        _swapWithUser(user);
        _swapWithUser(secondUser, 1e18, false);

        IMetricsLens.PoolDashboard memory dashboard = lens.getPoolDashboard(poolId);
        assertEq(dashboard.rollingVolume, 2e18);
        assertEq(dashboard.netFlow, 0);
        assertEq(dashboard.buyCount, 1);
        assertEq(dashboard.sellCount, 1);
        assertEq(dashboard.uniqueTraderCount, 2);
        assertGt(dashboard.score, 50);
    }

    function _swapWithUser(address swapUser) internal {
        _swapWithUser(swapUser, 1e18, true);
    }

    function _swapWithUser(address swapUser, uint256 amountIn, bool zeroForOne) internal {
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: abi.encode(swapUser),
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function _addFullRangeLiquidity(PoolKey memory key) internal {
        int24 tickLower = TickMath.minUsableTick(key.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(key.tickSpacing);
        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        positionManager.mint(
            key,
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

    function _defaultConfig() internal view returns (IFairFlowHook.LaunchConfig memory) {
        return IFairFlowHook.LaunchConfig({
            launchToken: Currency.unwrap(currency1),
            quoteToken: Currency.unwrap(currency0),
            launchStart: uint64(block.timestamp),
            launchEnd: uint64(block.timestamp + 7 days),
            baseFeePips: 3000,
            maxFeePips: 100000,
            minFeePips: 500,
            maxBuyBps: 500,
            maxBuyAmount: 5e18,
            cooldownBlocks: 3,
            nftDiscountEnabled: true
        });
    }

    function _postLaunchConfig() internal view returns (IFairFlowHook.LaunchConfig memory) {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();
        config.launchStart = uint64(block.timestamp - 14 days);
        config.launchEnd = uint64(block.timestamp - 7 days);
        return config;
    }
}

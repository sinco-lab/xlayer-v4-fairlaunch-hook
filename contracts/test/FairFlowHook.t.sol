// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract FairFlowHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;
    Currency secondCurrency0;
    Currency secondCurrency1;

    PoolKey poolKey;
    PoolKey secondPoolKey;
    PoolId poolId;
    PoolId secondPoolId;
    FairFlowHook hook;
    FlowPassNFT flowPass;

    address user = makeAddr("fairflow-user");
    address secondUser = makeAddr("second-fairflow-user");

    event LaunchConfigSet(
        PoolId indexed poolId,
        address indexed launchToken,
        address indexed quoteToken,
        uint64 launchStart,
        uint64 launchEnd,
        uint24 baseFeePips,
        uint24 minFeePips,
        uint24 maxFeePips
    );

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

    event FairFlowSwap(
        PoolId indexed poolId,
        address indexed user,
        bool isBuy,
        uint256 amountInAbs,
        uint24 appliedFee,
        uint8 flowPassTier,
        uint16 marketScore
    );

    event MarketScoreUpdated(
        PoolId indexed poolId, uint16 score, int256 netFlow, uint256 rollingVolume, uint24 currentFee
    );

    function setUp() public {
        vm.warp(1_700_000_000);
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();
        (secondCurrency0, secondCurrency1) = deployCurrencyPair();

        address flags = address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG));
        bytes memory constructorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("FairFlowHook.sol:FairFlowHook", constructorArgs, flags);
        hook = FairFlowHook(flags);
        flowPass = new FlowPassNFT(address(this));
        flowPass.setMinter(address(this), true);
        flowPass.setMinter(address(hook), true);

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        secondPoolKey = PoolKey(secondCurrency0, secondCurrency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
        secondPoolId = secondPoolKey.toId();

        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);
        poolManager.initialize(secondPoolKey, Constants.SQRT_PRICE_1_1);

        _addFullRangeLiquidity(poolKey);
        _addFullRangeLiquidity(secondPoolKey);
    }

    function testSetLaunchConfig() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);

        hook.setLaunchConfig(poolKey, config);

        (
            address launchToken,
            address quoteToken,
            uint64 launchStart,
            uint64 launchEnd,
            uint24 baseFeePips,
            uint24 maxFeePips,
            uint24 minFeePips,
            uint16 maxBuyBps,
            uint256 maxBuyAmount,
            uint32 cooldownBlocks,
            bool nftDiscountEnabled
        ) = hook.launchConfigs(poolId);

        assertEq(launchToken, config.launchToken);
        assertEq(quoteToken, config.quoteToken);
        assertEq(launchStart, config.launchStart);
        assertEq(launchEnd, config.launchEnd);
        assertEq(baseFeePips, config.baseFeePips);
        assertEq(maxFeePips, config.maxFeePips);
        assertEq(minFeePips, config.minFeePips);
        assertEq(maxBuyBps, config.maxBuyBps);
        assertEq(maxBuyAmount, config.maxBuyAmount);
        assertEq(cooldownBlocks, config.cooldownBlocks);
        assertEq(nftDiscountEnabled, config.nftDiscountEnabled);
        assertTrue(hook.launchConfigured(poolId));

        (,,,,,, uint24 currentFee, uint16 marketScore,) = hook.poolStates(poolId);
        assertEq(currentFee, config.baseFeePips);
        assertEq(marketScore, 50);
    }

    function testInvalidLaunchConfigReverts() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);

        config.launchEnd = config.launchStart;
        vm.expectRevert(IFairFlowHook.InvalidLaunchConfig.selector);
        hook.setLaunchConfig(poolKey, config);

        config = _defaultConfig(poolKey);
        config.minFeePips = config.baseFeePips + 1;
        vm.expectRevert(IFairFlowHook.InvalidLaunchConfig.selector);
        hook.setLaunchConfig(poolKey, config);

        config = _defaultConfig(poolKey);
        config.baseFeePips = config.maxFeePips + 1;
        vm.expectRevert(IFairFlowHook.InvalidLaunchConfig.selector);
        hook.setLaunchConfig(poolKey, config);

        config = _defaultConfig(poolKey);
        config.maxBuyAmount = 0;
        vm.expectRevert(IFairFlowHook.InvalidLaunchConfig.selector);
        hook.setLaunchConfig(poolKey, config);
    }

    function testUnauthorizedConfigReverts() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert(IFairFlowHook.Unauthorized.selector);
        hook.setLaunchConfig(poolKey, _defaultConfig(poolKey));
    }

    function testStaticFeePoolRejected() public {
        PoolKey memory staticFeePool = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);

        vm.expectRevert(IFairFlowHook.NotDynamicFee.selector);
        hook.setLaunchConfig(staticFeePool, config);

        vm.expectRevert();
        poolManager.initialize(staticFeePool, Constants.SQRT_PRICE_1_1);
    }

    function testUnconfiguredPoolReverts() public {
        vm.expectRevert(
            _wrappedBeforeSwapError(abi.encodeWithSelector(IFairFlowHook.LaunchNotConfigured.selector, poolId))
        );
        _swapWithUser(poolKey, user);
    }

    function testMalformedHookDataReverts() public {
        hook.setLaunchConfig(poolKey, _defaultConfig(poolKey));

        vm.expectRevert(_wrappedBeforeSwapError(abi.encodeWithSelector(IFairFlowHook.InvalidHookData.selector)));
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

    function testPoolIdStateIsolation() public {
        hook.setLaunchConfig(poolKey, _defaultConfig(poolKey));
        hook.setLaunchConfig(secondPoolKey, _defaultConfig(secondPoolKey));

        _swapWithUser(poolKey, user);

        (uint256 rollingVolume, int256 netFlow, uint256 buyCount,,,,,,) = hook.poolStates(poolId);
        (uint256 secondRollingVolume, int256 secondNetFlow, uint256 secondBuyCount,,,,,,) =
            hook.poolStates(secondPoolId);

        assertEq(rollingVolume, 1e18);
        assertEq(netFlow, 1e18);
        assertEq(buyCount, 1);
        assertEq(secondRollingVolume, 0);
        assertEq(secondNetFlow, 0);
        assertEq(secondBuyCount, 0);
    }

    function testUserStateIsolationByPool() public {
        hook.setLaunchConfig(poolKey, _defaultConfig(poolKey));
        hook.setLaunchConfig(secondPoolKey, _defaultConfig(secondPoolKey));

        _swapWithUser(poolKey, user);

        (uint256 swapCount, uint256 buyCount,,, uint64 lastBuyBlock,,) = hook.userStates(poolId, user);
        (uint256 secondSwapCount, uint256 secondBuyCount,,, uint64 secondLastBuyBlock,,) =
            hook.userStates(secondPoolId, user);

        assertEq(swapCount, 1);
        assertEq(buyCount, 1);
        assertEq(lastBuyBlock, block.number);
        assertEq(secondSwapCount, 0);
        assertEq(secondBuyCount, 0);
        assertEq(secondLastBuyBlock, 0);
    }

    function testLaunchConfigSetEvent() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);

        vm.expectEmit(true, true, true, true, address(hook));
        emit LaunchConfigSet(
            poolId,
            config.launchToken,
            config.quoteToken,
            config.launchStart,
            config.launchEnd,
            config.baseFeePips,
            config.minFeePips,
            config.maxFeePips
        );

        hook.setLaunchConfig(poolKey, config);
    }

    function testAfterSwapUpdatesRollingVolume() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);

        assertEq(_rollingVolume(poolId), 1e18);
    }

    function testAfterSwapUpdatesNetFlowOnBuy() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);

        assertEq(_netFlow(poolId), 1e18);
    }

    function testAfterSwapUpdatesNetFlowOnSell() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user, 1e18, false);

        assertEq(_netFlow(poolId), -1e18);
    }

    function testAfterSwapUpdatesBuySellCounts() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);
        _swapWithUser(poolKey, secondUser, 1e18, false);

        assertEq(_buyCount(poolId), 1);
        assertEq(_sellCount(poolId), 1);
    }

    function testFirstTradeIncrementsUniqueTraderCount() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);

        assertEq(_uniqueTraderCount(poolId), 1);
    }

    function testRepeatTraderDoesNotIncrementUniqueCount() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);
        _swapWithUser(poolKey, user, 1e18, false);

        assertEq(_uniqueTraderCount(poolId), 1);
    }

    function testLargeTradeCountIncrements() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user, 4e18, true);

        assertEq(_largeTradeCount(poolId), 1);
        assertEq(_userLargeTradeCount(poolId, user), 1);
    }

    function testMarketScoreWithinBounds() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        for (uint256 i; i < 8; i++) {
            _swapWithUser(poolKey, makeAddr(string.concat("bound-user-", vm.toString(i))), 4e18, true);
            uint16 score = _marketScore(poolId);
            assertGe(uint256(score), 0);
            assertLe(uint256(score), 100);
        }
    }

    function testBalancedFlowImprovesScore() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);
        uint16 oneSidedScore = _marketScore(poolId);

        _swapWithUser(poolKey, secondUser, 1e18, false);
        uint16 balancedScore = _marketScore(poolId);

        assertGt(balancedScore, oneSidedScore);
    }

    function testImbalanceLowersScore() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));

        _swapWithUser(poolKey, user);

        assertLt(_marketScore(poolId), 50);
    }

    function testFairFlowSwapEventMatchesState() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        vm.expectEmit(true, true, false, true, address(hook));
        emit FairFlowSwap(poolId, user, true, 1e18, config.baseFeePips, 0, 25);

        _swapWithUser(poolKey, user);

        assertEq(_currentFee(poolId), config.baseFeePips);
        assertEq(_marketScore(poolId), 25);
    }

    function testMarketScoreUpdatedEventMatchesState() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        vm.expectEmit(true, false, false, true, address(hook));
        emit MarketScoreUpdated(poolId, 25, 1e18, 1e18, config.baseFeePips);

        _swapWithUser(poolKey, user);

        assertEq(_marketScore(poolId), 25);
        assertEq(_netFlow(poolId), 1e18);
        assertEq(_rollingVolume(poolId), 1e18);
        assertEq(_currentFee(poolId), config.baseFeePips);
    }

    function testLaunchWindowMaxBuyReverts() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        config.maxBuyAmount = 1e18;
        hook.setLaunchConfig(poolKey, config);

        vm.expectRevert(
            _wrappedBeforeSwapError(
                abi.encodeWithSelector(IFairFlowHook.MaxBuyExceeded.selector, poolId, user, 2e18, config.maxBuyAmount)
            )
        );
        _swapWithUser(poolKey, user, 2e18, true);
    }

    function testPreviewFeeUsesLaunchGuard() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        config.maxBuyAmount = 1e18;
        hook.setLaunchConfig(poolKey, config);

        vm.expectRevert(
            abi.encodeWithSelector(IFairFlowHook.MaxBuyExceeded.selector, poolId, user, 2e18, config.maxBuyAmount)
        );
        _previewFee(poolKey, true, 2e18, user);
    }

    function testSellDoesNotUseMaxBuyGuard() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        config.maxBuyAmount = 1e18;
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user, 2e18, false);

        (,,, uint256 sellCount,,,,,) = hook.poolStates(poolId);
        assertEq(sellCount, 1);
    }

    function testRepeatedBuyCooldownReverts() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user);

        uint256 nextAllowedBlock = block.number + config.cooldownBlocks;
        vm.expectRevert(
            _wrappedBeforeSwapError(
                abi.encodeWithSelector(
                    IFairFlowHook.CooldownActive.selector, poolId, user, block.number, nextAllowedBlock
                )
            )
        );
        _swapWithUser(poolKey, user);
    }

    function testBuyAllowedAfterCooldown() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user);
        vm.roll(block.number + config.cooldownBlocks);
        _swapWithUser(poolKey, user);

        (, uint256 buyCount,,,,,) = hook.userStates(poolId, user);
        assertEq(buyCount, 2);
    }

    function testCooldownIsPerPool() public {
        hook.setLaunchConfig(poolKey, _defaultConfig(poolKey));
        hook.setLaunchConfig(secondPoolKey, _defaultConfig(secondPoolKey));

        _swapWithUser(poolKey, user);
        _swapWithUser(secondPoolKey, user);

        (, uint256 buyCount,,,,,) = hook.userStates(poolId, user);
        (, uint256 secondBuyCount,,,,,) = hook.userStates(secondPoolId, user);
        assertEq(buyCount, 1);
        assertEq(secondBuyCount, 1);
    }

    function testBaseFeeApplied() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        vm.expectEmit(true, true, false, false, address(poolManager));
        emit Swap(poolId, address(swapRouter), -1e18, 0, 0, 0, 0, config.baseFeePips);

        _swapWithUser(poolKey, user);

        assertEq(_currentFee(poolId), config.baseFeePips);
    }

    function testLaunchPremiumDecays() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        uint24 earlyFee = _previewFee(poolKey, true, 1e18, user);
        vm.warp(config.launchEnd - 1);
        uint24 lateFee = _previewFee(poolKey, true, 1e18, user);

        assertGt(earlyFee, lateFee);
        assertEq(earlyFee, 23000);
        assertEq(lateFee, config.baseFeePips);
    }

    function testBuyPressureIncreasesBuyFee() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user);

        uint24 buyFee = _previewFee(poolKey, true, 1e18, secondUser);
        assertGt(buyFee, config.baseFeePips);
    }

    function testSellPressureIncreasesSellFee() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user, 1e18, false);

        uint24 sellFee = _previewFee(poolKey, false, 1e18, secondUser);
        assertGt(sellFee, config.baseFeePips);
    }

    function testBalancedDirectionCanReducePremium() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        _swapWithUser(poolKey, user);

        uint24 buyFee = _previewFee(poolKey, true, 1e18, secondUser);
        uint24 sellFee = _previewFee(poolKey, false, 1e18, secondUser);

        assertGt(buyFee, sellFee);
        assertEq(sellFee, config.baseFeePips);
    }

    function testSizePremiumIncreasesWithTradeSize() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);

        uint24 smallFee = _previewFee(poolKey, true, 1e18, user);
        uint24 largeFee = _previewFee(poolKey, true, 4e18, user);

        assertGt(largeFee, smallFee);
    }

    function testFeeClampedToMin() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        config.baseFeePips = 700;
        config.minFeePips = 500;
        config.maxFeePips = 100000;
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        uint24 fee = _previewFee(poolKey, true, 1e18, user);

        assertEq(fee, config.minFeePips);
    }

    function testFeeClampedToMax() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        config.maxFeePips = 10000;
        hook.setLaunchConfig(poolKey, config);

        uint24 fee = _previewFee(poolKey, true, 4e18, user);

        assertEq(fee, config.maxFeePips);
    }

    function testNftDiscountAppliesOutsideLaunch() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        uint24 fee = _previewFee(poolKey, true, 1e18, user);

        assertEq(fee, config.baseFeePips - 1000);
    }

    function testNftDiscountDisabledDuringLaunch() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        uint24 fee = _previewFee(poolKey, true, 1e18, user);

        assertEq(fee, 23000);
    }

    function testNftDiscountDisabledForLargeTrade() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        uint24 fee = _previewFee(poolKey, true, 4e18, user);

        assertGt(fee, config.baseFeePips);
    }

    function testNftDiscountDisabledInHighRiskState() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(secondUser, 2);

        _swapWithUser(poolKey, user);

        uint24 fee = _previewFee(poolKey, false, 1e18, secondUser);

        assertEq(fee, config.baseFeePips);
    }

    function testHookReadsFlowPassTier() public {
        IFairFlowHook.LaunchConfig memory config = _postLaunchConfig(poolKey);
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        _swapWithUser(poolKey, user);

        assertEq(_lastObservedTier(poolId, user), 2);
    }

    function testHealthySwapCanMintLevelOne() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));
        hook.setFlowPass(address(flowPass));

        assertEq(flowPass.tierOf(user), 0);

        _swapWithUser(poolKey, user);

        assertEq(flowPass.tierOf(user), 1);
        assertEq(flowPass.balanceOf(user), 1);
    }

    function testMultipleHealthySwapsCanUpgrade() public {
        hook.setLaunchConfig(poolKey, _postLaunchConfig(poolKey));
        hook.setFlowPass(address(flowPass));

        _swapWithUser(poolKey, user);
        _swapWithUser(poolKey, user, 1e18, false);
        _swapWithUser(poolKey, user);

        assertEq(flowPass.tierOf(user), 2);
        assertEq(flowPass.balanceOf(user), 1);
    }

    function testLaunchGuardOverridesFlowPassDiscount() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(poolKey);
        config.maxBuyAmount = 1e18;
        hook.setLaunchConfig(poolKey, config);
        hook.setFlowPass(address(flowPass));
        flowPass.mintOrUpgrade(user, 2);

        vm.expectRevert(
            _wrappedBeforeSwapError(
                abi.encodeWithSelector(IFairFlowHook.MaxBuyExceeded.selector, poolId, user, 2e18, config.maxBuyAmount)
            )
        );
        _swapWithUser(poolKey, user, 2e18, true);
    }

    function _swapWithUser(PoolKey memory key, address swapUser) internal {
        _swapWithUser(key, swapUser, 1e18, true);
    }

    function _swapWithUser(PoolKey memory key, address swapUser, uint256 amountIn, bool zeroForOne) internal {
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: key,
            hookData: abi.encode(swapUser),
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function _previewFee(PoolKey memory key, bool zeroForOne, uint256 amountIn, address swapUser)
        internal
        view
        returns (uint24)
    {
        SwapParams memory params =
            SwapParams({zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: 0});
        return hook.previewSwapFee(key, params, swapUser);
    }

    function _currentFee(PoolId id) internal view returns (uint24) {
        (,,,,,, uint24 currentFee,,) = hook.poolStates(id);
        return currentFee;
    }

    function _rollingVolume(PoolId id) internal view returns (uint256 rollingVolume) {
        (rollingVolume,,,,,,,,) = hook.poolStates(id);
    }

    function _netFlow(PoolId id) internal view returns (int256 netFlow) {
        (, netFlow,,,,,,,) = hook.poolStates(id);
    }

    function _buyCount(PoolId id) internal view returns (uint256 buyCount) {
        (,, buyCount,,,,,,) = hook.poolStates(id);
    }

    function _sellCount(PoolId id) internal view returns (uint256 sellCount) {
        (,,, sellCount,,,,,) = hook.poolStates(id);
    }

    function _uniqueTraderCount(PoolId id) internal view returns (uint256 uniqueTraderCount) {
        (,,,, uniqueTraderCount,,,,) = hook.poolStates(id);
    }

    function _largeTradeCount(PoolId id) internal view returns (uint256 largeTradeCount) {
        (,,,,, largeTradeCount,,,) = hook.poolStates(id);
    }

    function _marketScore(PoolId id) internal view returns (uint16 marketScore) {
        (,,,,,,, marketScore,) = hook.poolStates(id);
    }

    function _userLargeTradeCount(PoolId id, address account) internal view returns (uint256 largeTradeCount) {
        (,,, largeTradeCount,,,) = hook.userStates(id, account);
    }

    function _lastObservedTier(PoolId id, address account) internal view returns (uint8 lastObservedTier) {
        (,,,,,, lastObservedTier) = hook.userStates(id, account);
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

    function _defaultConfig(PoolKey memory key) internal view returns (IFairFlowHook.LaunchConfig memory) {
        return IFairFlowHook.LaunchConfig({
            launchToken: Currency.unwrap(key.currency1),
            quoteToken: Currency.unwrap(key.currency0),
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

    function _postLaunchConfig(PoolKey memory key) internal view returns (IFairFlowHook.LaunchConfig memory) {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig(key);
        config.launchStart = uint64(block.timestamp - 14 days);
        config.launchEnd = uint64(block.timestamp - 7 days);
        return config;
    }

    function _wrappedBeforeSwapError(bytes memory originalError) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector,
            address(hook),
            IHooks.beforeSwap.selector,
            originalError,
            abi.encodeWithSelector(Hooks.HookCallFailed.selector)
        );
    }
}

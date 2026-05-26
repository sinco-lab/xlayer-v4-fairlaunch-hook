// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {IFlowPassNFT} from "./interfaces/IFlowPassNFT.sol";
import {IFairFlowHook} from "./interfaces/IFairFlowHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

contract FairFlowHook is BaseHook, IFairFlowHook {
    using LPFeeLibrary for uint24;
    using PoolIdLibrary for PoolKey;

    uint16 internal constant INITIAL_MARKET_SCORE = 50;
    uint16 internal constant MAX_BPS = 10_000;
    uint24 internal constant LAUNCH_PREMIUM_MAX_PIPS = 20_000;
    uint24 internal constant IMBALANCE_PREMIUM_MAX_PIPS = 30_000;
    uint24 internal constant SIZE_PREMIUM_MAX_PIPS = 15_000;
    uint24 internal constant REPUTATION_DISCOUNT_PER_TIER_PIPS = 500;
    uint24 internal constant MAX_REPUTATION_DISCOUNT_PIPS = 2_000;
    uint16 internal constant HIGH_RISK_IMBALANCE_BPS = 6_000;
    uint16 internal constant UNIQUE_TRADER_BONUS_PER_TRADER = 5;
    uint16 internal constant UNIQUE_TRADER_BONUS_MAX = 20;
    uint16 internal constant BALANCED_FLOW_BONUS_MAX = 20;
    uint16 internal constant IMBALANCE_PENALTY_MAX = 30;
    uint16 internal constant LARGE_TRADE_PENALTY_PER_TRADE = 5;
    uint16 internal constant LARGE_TRADE_PENALTY_MAX = 20;
    uint8 internal constant FLOWPASS_TIER_ONE = 1;
    uint8 internal constant FLOWPASS_TIER_TWO = 2;
    uint256 internal constant FLOWPASS_TIER_TWO_MIN_SWAPS = 3;

    address public immutable owner;
    address public flowPass;

    mapping(PoolId => LaunchConfig) public launchConfigs;
    mapping(PoolId => PoolState) public poolStates;
    mapping(PoolId => mapping(address => UserState)) public userStates;
    mapping(PoolId => mapping(address => bool)) public hasTraded;
    mapping(PoolId => bool) public launchConfigured;
    mapping(address => bool) public configWriters;

    constructor(IPoolManager _poolManager, address _owner) BaseHook(_poolManager) {
        if (_owner == address(0)) revert Unauthorized();
        owner = _owner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyConfigWriter() {
        if (msg.sender != owner && !configWriters[msg.sender]) revert Unauthorized();
        _;
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

    function setFlowPass(address _flowPass) external onlyOwner {
        flowPass = _flowPass;
        emit FlowPassSet(_flowPass);
    }

    function setConfigWriter(address writer, bool allowed) external onlyOwner {
        if (writer == address(0)) revert Unauthorized();
        configWriters[writer] = allowed;
        emit ConfigWriterSet(writer, allowed);
    }

    function setLaunchConfig(PoolKey calldata key, LaunchConfig calldata config) external onlyConfigWriter {
        _validateLaunchConfig(key, config);

        PoolId poolId = key.toId();
        bool wasConfigured = launchConfigured[poolId];

        launchConfigs[poolId] = config;
        launchConfigured[poolId] = true;

        PoolState storage state = poolStates[poolId];
        state.currentFee = config.baseFeePips;
        if (!wasConfigured) {
            state.marketScore = INITIAL_MARKET_SCORE;
        }
        state.lastUpdated = uint64(block.timestamp);

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
    }

    function getLaunchConfig(PoolId poolId) external view returns (LaunchConfig memory) {
        return launchConfigs[poolId];
    }

    function getPoolState(PoolId poolId) external view returns (PoolState memory) {
        return poolStates[poolId];
    }

    function getUserState(PoolId poolId, address user) external view returns (UserState memory) {
        return userStates[poolId][user];
    }

    function isLaunchConfigured(PoolId poolId) external view returns (bool) {
        return launchConfigured[poolId];
    }

    function previewSwapFee(PoolKey calldata key, SwapParams calldata params, address user)
        external
        view
        returns (uint24)
    {
        if (user == address(0)) revert InvalidHookData();

        PoolId poolId = key.toId();
        LaunchConfig memory config = _configuredLaunch(poolId);
        bool isBuy = _isBuy(key, params, config);
        uint256 amountInAbs = _specifiedAmountAbs(params.amountSpecified);
        uint8 flowPassTier = _flowPassTier(user);

        _checkLaunchGuard(poolId, config, userStates[poolId][user], user, isBuy, amountInAbs);

        return _calculateFee(poolStates[poolId], config, isBuy, amountInAbs, flowPassTier);
    }

    function _afterInitialize(address, PoolKey calldata key, uint160, int24) internal pure override returns (bytes4) {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        address user = _decodeUser(hookData);

        PoolId poolId = key.toId();
        LaunchConfig memory config = _configuredLaunch(poolId);
        bool isBuy = _isBuy(key, params, config);
        uint256 amountInAbs = _specifiedAmountAbs(params.amountSpecified);
        UserState storage userState = userStates[poolId][user];

        _checkLaunchGuard(poolId, config, userState, user, isBuy, amountInAbs);

        uint8 flowPassTier = _flowPassTier(user);
        uint24 fee = _calculateFee(poolStates[poolId], config, isBuy, amountInAbs, flowPassTier);

        poolStates[poolId].currentFee = fee;
        userState.lastObservedTier = flowPassTier;

        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        address user = _decodeUser(hookData);
        PoolId poolId = key.toId();
        LaunchConfig memory config = _configuredLaunch(poolId);

        bool isBuy = _isBuy(key, params, config);
        uint256 amountInAbs = _amountInAbs(params, delta);
        PoolState storage poolState = poolStates[poolId];
        UserState storage userState = userStates[poolId][user];
        uint16 previousMarketScore = poolState.marketScore;
        bool wasHighRisk = _isHighRisk(poolState);

        if (!hasTraded[poolId][user]) {
            hasTraded[poolId][user] = true;
            poolState.uniqueTraderCount++;
        }

        poolState.rollingVolume += amountInAbs;
        poolState.netFlow = isBuy ? poolState.netFlow + int256(amountInAbs) : poolState.netFlow - int256(amountInAbs);
        if (_isLargeTrade(config, amountInAbs)) {
            poolState.largeTradeCount++;
            userState.largeTradeCount++;
        }
        if (isBuy) {
            poolState.buyCount++;
            userState.buyCount++;
            userState.lastBuyBlock = uint64(block.number);
        } else {
            poolState.sellCount++;
            userState.sellCount++;
        }
        poolState.marketScore = _calculateMarketScore(poolState);
        poolState.lastUpdated = uint64(block.timestamp);

        userState.swapCount++;
        userState.lastSwapBlock = uint64(block.number);

        _maybeUpgradeFlowPass(config, userState, user, amountInAbs, previousMarketScore, wasHighRisk);

        emit FairFlowSwap(
            poolId, user, isBuy, amountInAbs, poolState.currentFee, userState.lastObservedTier, poolState.marketScore
        );
        emit MarketScoreUpdated(
            poolId, poolState.marketScore, poolState.netFlow, poolState.rollingVolume, poolState.currentFee
        );

        return (BaseHook.afterSwap.selector, 0);
    }

    function _validateLaunchConfig(PoolKey calldata key, LaunchConfig calldata config) internal pure {
        if (!key.fee.isDynamicFee()) revert NotDynamicFee();
        if (config.launchToken == address(0) || config.quoteToken == address(0)) revert InvalidLaunchConfig();
        if (config.launchToken == config.quoteToken) revert InvalidLaunchConfig();
        if (config.launchEnd <= config.launchStart) revert InvalidLaunchConfig();
        if (config.minFeePips > config.baseFeePips || config.baseFeePips > config.maxFeePips) {
            revert InvalidLaunchConfig();
        }
        if (!config.minFeePips.isValid() || !config.baseFeePips.isValid() || !config.maxFeePips.isValid()) {
            revert InvalidLaunchConfig();
        }
        if (config.maxBuyAmount == 0 || config.maxBuyBps > MAX_BPS) revert InvalidLaunchConfig();

        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        bool matchesPool = (config.launchToken == currency0 && config.quoteToken == currency1)
            || (config.launchToken == currency1 && config.quoteToken == currency0);
        if (!matchesPool) revert InvalidLaunchConfig();
    }

    function _configuredLaunch(PoolId poolId) internal view returns (LaunchConfig memory config) {
        if (!launchConfigured[poolId]) revert LaunchNotConfigured(poolId);
        return launchConfigs[poolId];
    }

    function _checkLaunchGuard(
        PoolId poolId,
        LaunchConfig memory config,
        UserState storage userState,
        address user,
        bool isBuy,
        uint256 amountInAbs
    ) internal view {
        if (!_isInLaunchWindow(config) || !isBuy) return;

        if (amountInAbs > config.maxBuyAmount) {
            revert MaxBuyExceeded(poolId, user, amountInAbs, config.maxBuyAmount);
        }

        if (config.cooldownBlocks == 0 || userState.lastBuyBlock == 0) return;

        uint256 nextAllowedBlock = uint256(userState.lastBuyBlock) + uint256(config.cooldownBlocks);
        if (block.number < nextAllowedBlock) {
            revert CooldownActive(poolId, user, block.number, nextAllowedBlock);
        }
    }

    function _calculateFee(
        PoolState storage poolState,
        LaunchConfig memory config,
        bool isBuy,
        uint256 amountInAbs,
        uint8 flowPassTier
    ) internal view returns (uint24) {
        uint256 fee = uint256(config.baseFeePips) + _launchPremium(config) + _imbalancePremium(poolState, isBuy)
            + _sizePremium(config, amountInAbs);
        uint256 discount = _reputationDiscount(poolState, config, amountInAbs, flowPassTier);

        if (discount >= fee) {
            fee = 0;
        } else {
            fee -= discount;
        }

        if (fee < config.minFeePips) return config.minFeePips;
        if (fee > config.maxFeePips) return config.maxFeePips;
        return uint24(fee);
    }

    function _launchPremium(LaunchConfig memory config) internal view returns (uint24) {
        if (!_isInLaunchWindow(config)) return 0;

        uint256 duration = uint256(config.launchEnd) - uint256(config.launchStart);
        uint256 remaining = uint256(config.launchEnd) - block.timestamp;
        return uint24((uint256(LAUNCH_PREMIUM_MAX_PIPS) * remaining) / duration);
    }

    function _imbalancePremium(PoolState storage poolState, bool isBuy) internal view returns (uint24) {
        if (poolState.rollingVolume == 0 || poolState.netFlow == 0) return 0;
        if (isBuy && poolState.netFlow < 0) return 0;
        if (!isBuy && poolState.netFlow > 0) return 0;

        uint256 imbalanceBps = (_abs(poolState.netFlow) * MAX_BPS) / poolState.rollingVolume;
        if (imbalanceBps > MAX_BPS) imbalanceBps = MAX_BPS;

        return uint24((uint256(IMBALANCE_PREMIUM_MAX_PIPS) * imbalanceBps) / MAX_BPS);
    }

    function _sizePremium(LaunchConfig memory config, uint256 amountInAbs) internal pure returns (uint24) {
        uint256 threshold = config.maxBuyAmount / 2;
        if (threshold == 0 || amountInAbs <= threshold) return 0;

        uint256 premium = (uint256(SIZE_PREMIUM_MAX_PIPS) * (amountInAbs - threshold)) / threshold;
        if (premium > SIZE_PREMIUM_MAX_PIPS) return SIZE_PREMIUM_MAX_PIPS;
        return uint24(premium);
    }

    function _reputationDiscount(
        PoolState storage poolState,
        LaunchConfig memory config,
        uint256 amountInAbs,
        uint8 flowPassTier
    ) internal view returns (uint24) {
        if (flowPassTier == 0 || !config.nftDiscountEnabled) return 0;
        if (_isInLaunchWindow(config) || _isLargeTrade(config, amountInAbs) || _isHighRisk(poolState)) return 0;

        uint256 discount = uint256(flowPassTier) * REPUTATION_DISCOUNT_PER_TIER_PIPS;
        if (discount > MAX_REPUTATION_DISCOUNT_PIPS) return MAX_REPUTATION_DISCOUNT_PIPS;
        return uint24(discount);
    }

    function _calculateMarketScore(PoolState storage poolState) internal view returns (uint16) {
        uint256 imbalanceBps = _imbalanceBps(poolState);
        int256 score = int256(uint256(INITIAL_MARKET_SCORE)) + int256(uint256(_uniqueTraderBonus(poolState)))
            + int256(uint256(_balancedFlowBonus(imbalanceBps))) - int256(uint256(_largeTradePenalty(poolState)))
            - int256(uint256(_imbalancePenalty(imbalanceBps)));

        if (score <= 0) return 0;
        if (score >= 100) return 100;
        return uint16(uint256(score));
    }

    function _uniqueTraderBonus(PoolState storage poolState) internal view returns (uint16) {
        uint256 bonus = poolState.uniqueTraderCount * UNIQUE_TRADER_BONUS_PER_TRADER;
        if (bonus > UNIQUE_TRADER_BONUS_MAX) return UNIQUE_TRADER_BONUS_MAX;
        return uint16(bonus);
    }

    function _balancedFlowBonus(uint256 imbalanceBps) internal pure returns (uint16) {
        if (imbalanceBps >= MAX_BPS) return 0;
        return uint16((uint256(BALANCED_FLOW_BONUS_MAX) * (MAX_BPS - imbalanceBps)) / MAX_BPS);
    }

    function _largeTradePenalty(PoolState storage poolState) internal view returns (uint16) {
        uint256 penalty = poolState.largeTradeCount * LARGE_TRADE_PENALTY_PER_TRADE;
        if (penalty > LARGE_TRADE_PENALTY_MAX) return LARGE_TRADE_PENALTY_MAX;
        return uint16(penalty);
    }

    function _imbalancePenalty(uint256 imbalanceBps) internal pure returns (uint16) {
        return uint16((uint256(IMBALANCE_PENALTY_MAX) * imbalanceBps) / MAX_BPS);
    }

    function _maybeUpgradeFlowPass(
        LaunchConfig memory config,
        UserState storage userState,
        address user,
        uint256 amountInAbs,
        uint16 previousMarketScore,
        bool wasHighRisk
    ) internal {
        if (flowPass == address(0)) return;
        if (_isInLaunchWindow(config) || _isLargeTrade(config, amountInAbs) || wasHighRisk || previousMarketScore < 50)
        {
            return;
        }

        uint8 currentTier = _flowPassTier(user);
        uint8 targetTier = userState.swapCount >= FLOWPASS_TIER_TWO_MIN_SWAPS ? FLOWPASS_TIER_TWO : FLOWPASS_TIER_ONE;

        if (targetTier > currentTier) {
            IFlowPassNFT(flowPass).mintOrUpgrade(user, targetTier);
        }
    }

    function _decodeUser(bytes calldata hookData) internal pure returns (address user) {
        if (hookData.length != 32) revert InvalidHookData();
        user = abi.decode(hookData, (address));
        if (user == address(0)) revert InvalidHookData();
    }

    function _isBuy(PoolKey calldata key, SwapParams calldata params, LaunchConfig memory config)
        internal
        pure
        returns (bool)
    {
        address outputToken = params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);
        return outputToken == config.launchToken;
    }

    function _amountInAbs(SwapParams calldata params, BalanceDelta delta) internal pure returns (uint256) {
        int128 inputDelta = params.zeroForOne ? delta.amount0() : delta.amount1();
        if (inputDelta < 0) return uint256(uint128(-inputDelta));

        return _specifiedAmountAbs(params.amountSpecified);
    }

    function _specifiedAmountAbs(int256 amountSpecified) internal pure returns (uint256) {
        return uint256(amountSpecified < 0 ? -amountSpecified : amountSpecified);
    }

    function _isInLaunchWindow(LaunchConfig memory config) internal view returns (bool) {
        return block.timestamp >= config.launchStart && block.timestamp <= config.launchEnd;
    }

    function _isLargeTrade(LaunchConfig memory config, uint256 amountInAbs) internal pure returns (bool) {
        return amountInAbs > config.maxBuyAmount / 2;
    }

    function _isHighRisk(PoolState storage poolState) internal view returns (bool) {
        if (poolState.rollingVolume == 0) return false;
        return _imbalanceBps(poolState) >= HIGH_RISK_IMBALANCE_BPS;
    }

    function _imbalanceBps(PoolState storage poolState) internal view returns (uint256) {
        if (poolState.rollingVolume == 0) return 0;

        uint256 imbalance = (_abs(poolState.netFlow) * MAX_BPS) / poolState.rollingVolume;
        if (imbalance > MAX_BPS) return MAX_BPS;
        return imbalance;
    }

    function _flowPassTier(address user) internal view returns (uint8) {
        if (flowPass == address(0)) return 0;

        try IFlowPassNFT(flowPass).tierOf(user) returns (uint8 tier) {
            return tier;
        } catch {
            return 0;
        }
    }

    function _abs(int256 value) internal pure returns (uint256) {
        return uint256(value < 0 ? -value : value);
    }
}

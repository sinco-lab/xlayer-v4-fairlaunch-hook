// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

interface IFairFlowHook {
    struct LaunchConfig {
        address launchToken;
        address quoteToken;
        uint64 launchStart;
        uint64 launchEnd;
        uint24 baseFeePips;
        uint24 maxFeePips;
        uint24 minFeePips;
        uint16 maxBuyBps;
        uint256 maxBuyAmount;
        uint32 cooldownBlocks;
        bool nftDiscountEnabled;
    }

    struct PoolState {
        uint256 rollingVolume;
        int256 netFlow;
        uint256 buyCount;
        uint256 sellCount;
        uint256 uniqueTraderCount;
        uint256 largeTradeCount;
        uint24 currentFee;
        uint16 marketScore;
        uint64 lastUpdated;
    }

    struct UserState {
        uint256 swapCount;
        uint256 buyCount;
        uint256 sellCount;
        uint256 largeTradeCount;
        uint64 lastBuyBlock;
        uint64 lastSwapBlock;
        uint8 lastObservedTier;
    }

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

    event LaunchGuardTriggered(PoolId indexed poolId, address indexed user, string reason);
    event FlowPassSet(address indexed flowPass);
    event ConfigWriterSet(address indexed writer, bool allowed);

    error InvalidHookData();
    error LaunchNotConfigured(PoolId poolId);
    error InvalidLaunchConfig();
    error MaxBuyExceeded(PoolId poolId, address user, uint256 amount, uint256 maxAmount);
    error CooldownActive(PoolId poolId, address user, uint256 currentBlock, uint256 nextAllowedBlock);
    error Unauthorized();
    error NotDynamicFee();

    function setLaunchConfig(PoolKey calldata key, LaunchConfig calldata config) external;
    function setFlowPass(address flowPass) external;
    function setConfigWriter(address writer, bool allowed) external;
    function flowPass() external view returns (address);
    function getLaunchConfig(PoolId poolId) external view returns (LaunchConfig memory);
    function getPoolState(PoolId poolId) external view returns (PoolState memory);
    function getUserState(PoolId poolId, address user) external view returns (UserState memory);
    function isLaunchConfigured(PoolId poolId) external view returns (bool);
    function previewSwapFee(PoolKey calldata key, SwapParams calldata params, address user)
        external
        view
        returns (uint24);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFairFlowHook} from "./IFairFlowHook.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IMetricsLens {
    struct PoolDashboard {
        uint16 score;
        uint24 currentFee;
        uint256 rollingVolume;
        int256 netFlow;
        uint256 buyCount;
        uint256 sellCount;
        uint256 uniqueTraderCount;
        uint256 largeTradeCount;
        bool inLaunchWindow;
        bool guardActive;
        bool configured;
    }

    struct UserStatus {
        uint8 flowPassTier;
        uint256 swapCount;
        uint256 buyCount;
        uint256 sellCount;
        uint256 largeTradeCount;
        uint64 lastBuyBlock;
        uint64 lastSwapBlock;
    }

    function fairFlowHook() external view returns (IFairFlowHook);
    function getPoolDashboard(PoolId poolId) external view returns (PoolDashboard memory);
    function getUserStatus(PoolId poolId, address user) external view returns (UserStatus memory);
    function getLaunchConfig(PoolId poolId) external view returns (IFairFlowHook.LaunchConfig memory);
    function getCurrentFee(PoolId poolId) external view returns (uint24);
}

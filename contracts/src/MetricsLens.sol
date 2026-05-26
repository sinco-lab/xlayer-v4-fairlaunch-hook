// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFlowPassNFT} from "./interfaces/IFlowPassNFT.sol";
import {IFairFlowHook} from "./interfaces/IFairFlowHook.sol";
import {IMetricsLens} from "./interfaces/IMetricsLens.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

contract MetricsLens is IMetricsLens {
    IFairFlowHook public immutable fairFlowHook;

    constructor(IFairFlowHook _fairFlowHook) {
        fairFlowHook = _fairFlowHook;
    }

    function getPoolDashboard(PoolId poolId) external view returns (PoolDashboard memory dashboard) {
        bool configured = fairFlowHook.isLaunchConfigured(poolId);
        IFairFlowHook.PoolState memory state = fairFlowHook.getPoolState(poolId);
        IFairFlowHook.LaunchConfig memory config = fairFlowHook.getLaunchConfig(poolId);

        dashboard = PoolDashboard({
            score: state.marketScore,
            currentFee: state.currentFee,
            rollingVolume: state.rollingVolume,
            netFlow: state.netFlow,
            buyCount: state.buyCount,
            sellCount: state.sellCount,
            uniqueTraderCount: state.uniqueTraderCount,
            largeTradeCount: state.largeTradeCount,
            inLaunchWindow: configured && _isInLaunchWindow(config),
            guardActive: configured && _isInLaunchWindow(config)
                && (config.maxBuyAmount > 0 || config.cooldownBlocks > 0),
            configured: configured
        });
    }

    function getUserStatus(PoolId poolId, address user) external view returns (UserStatus memory status) {
        IFairFlowHook.UserState memory state = fairFlowHook.getUserState(poolId, user);

        status = UserStatus({
            flowPassTier: _flowPassTier(user),
            swapCount: state.swapCount,
            buyCount: state.buyCount,
            sellCount: state.sellCount,
            largeTradeCount: state.largeTradeCount,
            lastBuyBlock: state.lastBuyBlock,
            lastSwapBlock: state.lastSwapBlock
        });
    }

    function getLaunchConfig(PoolId poolId) external view returns (IFairFlowHook.LaunchConfig memory) {
        return fairFlowHook.getLaunchConfig(poolId);
    }

    function getCurrentFee(PoolId poolId) external view returns (uint24) {
        return fairFlowHook.getPoolState(poolId).currentFee;
    }

    function _flowPassTier(address user) internal view returns (uint8) {
        address flowPass = fairFlowHook.flowPass();
        if (flowPass == address(0)) return 0;

        try IFlowPassNFT(flowPass).tierOf(user) returns (uint8 tier) {
            return tier;
        } catch {
            return 0;
        }
    }

    function _isInLaunchWindow(IFairFlowHook.LaunchConfig memory config) internal view returns (bool) {
        return block.timestamp >= config.launchStart && block.timestamp <= config.launchEnd;
    }
}

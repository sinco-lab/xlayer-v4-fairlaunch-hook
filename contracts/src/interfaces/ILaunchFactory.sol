// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFairFlowHook} from "./IFairFlowHook.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface ILaunchFactory {
    event LaunchCreated(
        PoolId indexed poolId,
        address indexed launchToken,
        address indexed quoteToken,
        address hook,
        uint64 launchStart,
        uint64 launchEnd
    );

    error InvalidLaunchConfig();
    error LaunchAlreadyRegistered(PoolId poolId);
    error ZeroAddress();

    function fairFlowHook() external view returns (IFairFlowHook);
    function registeredLaunches(PoolId poolId) external view returns (bool);
    function registerLaunch(PoolKey calldata key, IFairFlowHook.LaunchConfig calldata config)
        external
        returns (PoolId poolId);
}

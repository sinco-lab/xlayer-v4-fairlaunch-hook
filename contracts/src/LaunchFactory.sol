// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ILaunchFactory} from "./interfaces/ILaunchFactory.sol";
import {IFairFlowHook} from "./interfaces/IFairFlowHook.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

contract LaunchFactory is Ownable, ILaunchFactory {
    using LPFeeLibrary for uint24;
    using PoolIdLibrary for PoolKey;

    uint16 internal constant MAX_BPS = 10_000;
    uint32 public constant MAX_COOLDOWN_BLOCKS = 50_000;

    IFairFlowHook public immutable fairFlowHook;
    mapping(PoolId => bool) public registeredLaunches;

    constructor(IFairFlowHook _fairFlowHook, address initialOwner) Ownable(initialOwner) {
        if (address(_fairFlowHook) == address(0)) revert ZeroAddress();
        fairFlowHook = _fairFlowHook;
    }

    function registerLaunch(PoolKey calldata key, IFairFlowHook.LaunchConfig calldata config)
        external
        onlyOwner
        returns (PoolId poolId)
    {
        _validateLaunchConfig(key, config);

        poolId = key.toId();
        if (registeredLaunches[poolId]) revert LaunchAlreadyRegistered(poolId);

        registeredLaunches[poolId] = true;
        fairFlowHook.setLaunchConfig(key, config);

        emit LaunchCreated(
            poolId, config.launchToken, config.quoteToken, address(fairFlowHook), config.launchStart, config.launchEnd
        );
    }

    function _validateLaunchConfig(PoolKey calldata key, IFairFlowHook.LaunchConfig calldata config) internal pure {
        if (!key.fee.isDynamicFee()) revert InvalidLaunchConfig();
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
        if (config.cooldownBlocks > MAX_COOLDOWN_BLOCKS) revert InvalidLaunchConfig();

        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        bool matchesPool = (config.launchToken == currency0 && config.quoteToken == currency1)
            || (config.launchToken == currency1 && config.quoteToken == currency0);
        if (!matchesPool) revert InvalidLaunchConfig();
    }
}

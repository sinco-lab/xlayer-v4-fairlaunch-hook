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
    event LaunchCreatorRecorded(PoolId indexed poolId, address indexed creator, uint256 feePaid);
    event CreatorAccessSet(address indexed creator, bool allowed);
    event PublicCreationSet(bool enabled);
    event CreationFeeSet(uint256 fee, address indexed recipient);
    event FactoryPausedSet(bool paused);

    error InvalidLaunchConfig();
    error LaunchAlreadyRegistered(PoolId poolId);
    error ZeroAddress();
    error CreatorNotAllowed(address creator);
    error FactoryPaused();
    error IncorrectCreationFee(uint256 expected, uint256 received);
    error FeeTransferFailed();

    function fairFlowHook() external view returns (IFairFlowHook);
    function registeredLaunches(PoolId poolId) external view returns (bool);
    function launchCreators(PoolId poolId) external view returns (address);
    function allowedCreators(address creator) external view returns (bool);
    function publicCreationEnabled() external view returns (bool);
    function creationFee() external view returns (uint256);
    function feeRecipient() external view returns (address);
    function paused() external view returns (bool);
    function canCreate(address creator) external view returns (bool);
    function registerLaunch(PoolKey calldata key, IFairFlowHook.LaunchConfig calldata config)
        external
        payable
        returns (PoolId poolId);
}

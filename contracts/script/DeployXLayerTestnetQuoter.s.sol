// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {V4Quoter} from "@uniswap/v4-periphery/src/lens/V4Quoter.sol";

contract DeployXLayerTestnetQuoterScript is Script {
    uint256 internal constant XLAYER_TESTNET_CHAIN_ID = 1952;

    function run() external {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "DeployXLayerTestnetQuoter: wrong chain");

        address poolManager = vm.envAddress("PULSEPOOL_TESTNET_POOL_MANAGER");

        vm.startBroadcast();
        V4Quoter quoter = new V4Quoter(IPoolManager(poolManager));
        vm.stopBroadcast();

        console2.log("PulsePool X Layer testnet V4Quoter");
        console2.log("PoolManager:", poolManager);
        console2.log("V4Quoter:", address(quoter));
    }
}

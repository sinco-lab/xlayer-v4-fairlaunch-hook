// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract CreateDemoPoolScript is PulsePoolLocalDemo {
    function run() external {
        address actor = _scriptSender();
        vm.startBroadcast(actor);
        DemoContracts memory demo = _deployDemoContracts(actor);
        uint256 liquidityTokenId = _initializePoolRegisterLaunchAndAddLiquidity(demo);
        vm.stopBroadcast();

        console2.log("PulsePool local pool dry-run");
        _logDeployment(demo);
        console2.log("Liquidity token ID:", liquidityTokenId);
        _logDashboard(demo);
    }
}

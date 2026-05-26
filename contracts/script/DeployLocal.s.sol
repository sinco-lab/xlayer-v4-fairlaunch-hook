// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract DeployLocalScript is PulsePoolLocalDemo {
    function run() external {
        address actor = _scriptSender();
        vm.startBroadcast(actor);
        DemoContracts memory demo = _deployDemoContracts(actor);
        vm.stopBroadcast();

        console2.log("PulsePool local dry-run deployment");
        _logDeployment(demo);
    }
}

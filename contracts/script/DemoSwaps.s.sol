// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract DemoSwapsScript is PulsePoolLocalDemo {
    function run() external {
        address actor = _scriptSender();
        vm.startBroadcast(actor);
        DemoContracts memory demo = _deployDemoContracts(actor);
        _initializePoolRegisterLaunchAndAddLiquidity(demo);

        _swap(demo, DEMO_USER, 1 ether, true);
        console2.log("healthy buy emitted FairFlowSwap");

        bool cooldownGuardTriggered = _trySwap(demo, DEMO_USER, 1 ether, true);
        require(cooldownGuardTriggered, "cooldown guard did not trigger");
        console2.log("cooldown guard proved by reverted repeated buy");

        vm.roll(block.number + 3);
        _swap(demo, SECOND_DEMO_USER, 1 ether, false);
        console2.log("balancing sell emitted FairFlowSwap");

        bool maxBuyGuardTriggered = _trySwap(demo, SECOND_DEMO_USER, 6 ether, true);
        require(maxBuyGuardTriggered, "max buy guard did not trigger");
        console2.log("max buy guard proved by reverted large buy");
        vm.stopBroadcast();

        _logDashboard(demo);
    }

    function _trySwap(DemoContracts memory demo, address user, uint256 amountIn, bool zeroForOne)
        internal
        returns (bool reverted)
    {
        try demo.swapRouter
            .swapExactTokensForTokens({
                amountIn: amountIn,
                amountOutMin: 0,
                zeroForOne: zeroForOne,
                poolKey: demo.poolKey,
                hookData: abi.encode(user),
                receiver: demo.actor,
                deadline: block.timestamp + 1 hours
            }) {
            return false;
        } catch {
            return true;
        }
    }
}

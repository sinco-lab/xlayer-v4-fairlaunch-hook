// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {DemoToken} from "../src/DemoToken.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";
import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {MetricsLens} from "../src/MetricsLens.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract DemoSwapXLayerTestnetScript is PulsePoolLocalDemo {
    using PoolIdLibrary for PoolKey;

    uint256 internal constant XLAYER_TESTNET_CHAIN_ID = 1952;

    function run() external {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "DemoSwapXLayerTestnet: wrong chain");

        address actor = _scriptSender();

        vm.startBroadcast(actor);
        DemoContracts memory demo = _loadDemoContracts(actor);
        _approveSwapTokens(demo);
        _swap(demo, DEMO_USER, 1 ether, true);
        vm.stopBroadcast();

        console2.log("PulsePool X Layer testnet demo swap broadcast");
        console2.log("FairFlowHook:", address(demo.hook));
        console2.logBytes32(PoolId.unwrap(demo.poolKey.toId()));
        console2.log("healthy buy emitted FairFlowSwap");
        _logDashboard(demo);
    }

    function _loadDemoContracts(address actor) internal view returns (DemoContracts memory demo) {
        demo.actor = actor;
        demo.poolManager = IPoolManager(vm.envAddress("PULSEPOOL_TESTNET_POOL_MANAGER"));
        demo.swapRouter = IUniswapV4Router04(payable(vm.envAddress("PULSEPOOL_TESTNET_SWAP_ROUTER")));
        demo.currency0Token = DemoToken(vm.envAddress("PULSEPOOL_TESTNET_TOKEN0"));
        demo.currency1Token = DemoToken(vm.envAddress("PULSEPOOL_TESTNET_TOKEN1"));
        demo.hook = FairFlowHook(vm.envAddress("PULSEPOOL_TESTNET_FAIRFLOW_HOOK"));
        demo.flowPass = FlowPassNFT(vm.envAddress("PULSEPOOL_TESTNET_FLOW_PASS"));
        demo.factory = LaunchFactory(vm.envAddress("PULSEPOOL_TESTNET_LAUNCH_FACTORY"));
        demo.lens = MetricsLens(vm.envAddress("PULSEPOOL_TESTNET_METRICS_LENS"));

        demo.poolKey = PoolKey({
            currency0: Currency.wrap(address(demo.currency0Token)),
            currency1: Currency.wrap(address(demo.currency1Token)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(demo.hook)
        });
        demo.poolId = demo.poolKey.toId();
    }

    function _approveSwapTokens(DemoContracts memory demo) internal {
        demo.currency0Token.approve(address(demo.swapRouter), type(uint256).max);
        demo.currency1Token.approve(address(demo.swapRouter), type(uint256).max);
        demo.currency0Token.approve(address(demo.poolManager), type(uint256).max);
        demo.currency1Token.approve(address(demo.poolManager), type(uint256).max);
    }
}

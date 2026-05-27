// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {DemoToken} from "../src/DemoToken.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";
import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {MetricsLens} from "../src/MetricsLens.sol";
import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract DeployExpiredFiveMinutePoolAndVerifyFlowPassScript is PulsePoolLocalDemo {
    using PoolIdLibrary for PoolKey;

    uint256 internal constant XLAYER_TESTNET_CHAIN_ID = 1952;
    uint64 internal constant FIVE_MINUTES = 5 minutes;

    function run() external {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "DeployExpiredFiveMinutePool: wrong chain");

        address actor = _scriptSender();

        vm.startBroadcast(actor);
        DemoContracts memory demo = _loadSharedStack(actor);
        demo.flowPass = new FlowPassNFT(actor);
        demo.flowPass.setMinter(address(demo.hook), true);
        demo.hook.setFlowPass(address(demo.flowPass));

        (demo.currency0Token, demo.currency1Token) = _deployDemoTokenPair(actor);
        demo.poolKey = PoolKey({
            currency0: Currency.wrap(address(demo.currency0Token)),
            currency1: Currency.wrap(address(demo.currency1Token)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(demo.hook)
        });
        demo.poolId = demo.poolKey.toId();

        _approveDemoTokens(demo);
        demo.poolManager.initialize(demo.poolKey, _startingPrice());
        demo.factory.registerLaunch(demo.poolKey, _expiredFiveMinuteLaunchConfig(demo));
        uint256 liquidityTokenId = _addDemoLiquidity(demo.positionManager, demo.poolKey, actor);

        _swap(demo, actor, 1 ether, true);
        _swap(demo, actor, 1 ether, false);
        _swap(demo, actor, 1 ether, true);

        vm.stopBroadcast();

        uint256 tokenId = demo.flowPass.tokenOf(actor);
        uint8 tier = demo.flowPass.tierOf(actor);

        console2.log("FairFlow expired 5-minute pool verification");
        console2.log("Actor:", actor);
        console2.log("PoolManager:", address(demo.poolManager));
        console2.log("PositionManager:", address(demo.positionManager));
        console2.log("SwapRouter:", address(demo.swapRouter));
        console2.log("Token0:", address(demo.currency0Token));
        console2.log("Token1:", address(demo.currency1Token));
        console2.log("FairFlowHook:", address(demo.hook));
        console2.log("FlowPassNFT:", address(demo.flowPass));
        console2.log("LaunchFactory:", address(demo.factory));
        console2.log("MetricsLens:", address(demo.lens));
        console2.logBytes32(PoolId.unwrap(demo.poolId));
        console2.log("Liquidity token ID:", liquidityTokenId);
        console2.log("FlowPass token ID:", tokenId);
        console2.log("FlowPass tier:", tier);
        console2.log("Tier 2 image URI:", demo.flowPass.imageURIForTier(2));
        console2.log("Token URI:", demo.flowPass.tokenURI(tokenId));
        _logDashboard(demo);
    }

    function _loadSharedStack(address actor) internal view returns (DemoContracts memory demo) {
        demo.actor = actor;
        demo.permit2 = IPermit2(AddressConstants.getPermit2Address());
        demo.poolManager = IPoolManager(vm.envAddress("PULSEPOOL_TESTNET_POOL_MANAGER"));
        demo.positionManager = IPositionManager(vm.envAddress("PULSEPOOL_TESTNET_POSITION_MANAGER"));
        demo.swapRouter = IUniswapV4Router04(payable(vm.envAddress("PULSEPOOL_TESTNET_SWAP_ROUTER")));
        demo.hook = FairFlowHook(vm.envAddress("PULSEPOOL_TESTNET_FAIRFLOW_HOOK"));
        demo.factory = LaunchFactory(vm.envAddress("PULSEPOOL_TESTNET_LAUNCH_FACTORY"));
        demo.lens = MetricsLens(vm.envAddress("PULSEPOOL_TESTNET_METRICS_LENS"));
    }

    function _expiredFiveMinuteLaunchConfig(DemoContracts memory demo)
        internal
        view
        returns (IFairFlowHook.LaunchConfig memory)
    {
        uint64 launchEnd = uint64(block.timestamp - 1);
        uint64 launchStart = launchEnd - FIVE_MINUTES;

        return IFairFlowHook.LaunchConfig({
            launchToken: address(demo.currency1Token),
            quoteToken: address(demo.currency0Token),
            launchStart: launchStart,
            launchEnd: launchEnd,
            baseFeePips: 3000,
            maxFeePips: 100000,
            minFeePips: 500,
            maxBuyBps: 500,
            maxBuyAmount: 5 ether,
            cooldownBlocks: 3,
            nftDiscountEnabled: true
        });
    }

    function _startingPrice() internal pure returns (uint160) {
        return 79228162514264337593543950336;
    }
}

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
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {V4Quoter} from "@uniswap/v4-periphery/src/lens/V4Quoter.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {DeployXLayerTestnetDemoScript} from "./DeployXLayerTestnetDemo.s.sol";

contract DeployXLayerTestnetPhase20Script is DeployXLayerTestnetDemoScript {
    using PoolIdLibrary for PoolKey;

    uint64 internal constant FIVE_MINUTES = 5 minutes;

    function run() external override {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "DeployXLayerTestnetPhase20: wrong chain");

        address actor = _scriptSender();
        uint256 creationFee = vm.envOr("PULSEPOOL_TESTNET_CREATION_FEE", uint256(0));
        address feeRecipient = vm.envOr("PULSEPOOL_TESTNET_FEE_RECIPIENT", actor);

        vm.startBroadcast(actor);
        DemoContracts memory demo = _loadSharedStack(actor);
        demo.flowPass = new FlowPassNFT(actor);
        demo.factory = new LaunchFactory(IFairFlowHook(address(demo.hook)), actor);
        demo.lens = new MetricsLens(IFairFlowHook(address(demo.hook)));
        V4Quoter quoter = new V4Quoter(demo.poolManager);

        demo.flowPass.setMinter(address(demo.hook), true);
        demo.hook.setFlowPass(address(demo.flowPass));
        demo.hook.setConfigWriter(address(demo.factory), true);
        demo.factory.setCreationFee(creationFee, feeRecipient);
        demo.factory.setPublicCreationEnabled(true);

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
        demo.poolManager.initialize(demo.poolKey, Constants.SQRT_PRICE_1_1);
        demo.factory.registerLaunch(demo.poolKey, _expiredFiveMinuteLaunchConfig(demo));
        uint256 liquidityTokenId = _addDemoLiquidity(demo.positionManager, demo.poolKey, actor);

        _swap(demo, actor, 1 ether, true);
        _swap(demo, actor, 1 ether, false);
        _swap(demo, actor, 1 ether, true);
        vm.stopBroadcast();

        uint256 tokenId = demo.flowPass.tokenOf(actor);
        uint8 tier = demo.flowPass.tierOf(actor);

        console2.log("PulsePool X Layer testnet Phase 20 deployment");
        console2.log("Actor:", actor);
        _logDeployment(demo);
        console2.log("V4Quoter:", address(quoter));
        console2.log("Liquidity token ID:", liquidityTokenId);
        console2.log("Launch creator:", demo.factory.launchCreators(demo.poolId));
        console2.log("Public creation enabled:", demo.factory.publicCreationEnabled());
        console2.log("Can actor create:", demo.factory.canCreate(actor));
        console2.log("Creation fee:", demo.factory.creationFee());
        console2.log("Fee recipient:", demo.factory.feeRecipient());
        console2.log("FlowPass token ID:", tokenId);
        console2.log("FlowPass tier:", tier);
        console2.log("Tier 2 image URI:", demo.flowPass.imageURIForTier(2));
        console2.logBytes32(PoolId.unwrap(demo.poolId));
        _logDashboard(demo);
    }

    function _loadSharedStack(address actor) internal view returns (DemoContracts memory demo) {
        demo.actor = actor;
        demo.permit2 = IPermit2(AddressConstants.getPermit2Address());
        demo.poolManager =
            IPoolManager(_envAddressWithFallback("PULSEPOOL_TESTNET_POOL_MANAGER", "VITE_POOL_MANAGER_ADDRESS"));
        demo.positionManager = IPositionManager(
            _envAddressWithFallback("PULSEPOOL_TESTNET_POSITION_MANAGER", "VITE_POSITION_MANAGER_ADDRESS")
        );
        demo.swapRouter = IUniswapV4Router04(
            payable(_envAddressWithFallback("PULSEPOOL_TESTNET_SWAP_ROUTER", "VITE_SWAP_ROUTER_ADDRESS"))
        );
        demo.hook =
            FairFlowHook(_envAddressWithFallback("PULSEPOOL_TESTNET_FAIRFLOW_HOOK", "VITE_FAIRFLOW_HOOK_ADDRESS"));
    }

    function _envAddressWithFallback(string memory primary, string memory fallbackKey) internal view returns (address) {
        address value = vm.envOr(primary, address(0));
        if (value != address(0)) return value;
        return vm.envAddress(fallbackKey);
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
}

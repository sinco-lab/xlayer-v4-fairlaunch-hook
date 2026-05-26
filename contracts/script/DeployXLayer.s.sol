// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {DemoToken} from "../src/DemoToken.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";
import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {MetricsLens} from "../src/MetricsLens.sol";
import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

contract DeployXLayerScript is Script {
    using PoolIdLibrary for PoolKey;

    uint256 internal constant XLAYER_MAINNET_CHAIN_ID = 196;

    address internal constant DEFAULT_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address internal constant DEFAULT_POSITION_MANAGER = 0xcF1EAFC6928dC385A342E7C6491d371d2871458b;
    address internal constant DEFAULT_STATE_VIEW = 0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990;
    address internal constant DEFAULT_UNIVERSAL_ROUTER = 0xDa00aE15d3A71466517129255255db7c0c0956d3;
    address internal constant DEFAULT_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    struct XLayerConfig {
        address poolManager;
        address positionManager;
        address stateView;
        address universalRouter;
        address permit2;
    }

    struct XLayerDeployment {
        DemoToken currency0Token;
        DemoToken currency1Token;
        FairFlowHook hook;
        FlowPassNFT flowPass;
        LaunchFactory factory;
        MetricsLens lens;
        PoolKey poolKey;
        PoolId poolId;
    }

    function run() external {
        require(block.chainid == XLAYER_MAINNET_CHAIN_ID, "DeployXLayer: wrong chain");

        address actor = _scriptSender();
        XLayerConfig memory config = _xLayerConfig();
        _validateUniswapContracts(config);

        vm.startBroadcast(actor);
        XLayerDeployment memory deployment = _deployPulsePool(config, actor);
        vm.stopBroadcast();

        _logConfig(config);
        _logDeployment(deployment);
    }

    function _scriptSender() internal returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) return wallets[0];
        return msg.sender;
    }

    function _xLayerConfig() internal view returns (XLayerConfig memory config) {
        config.poolManager = vm.envOr("POOL_MANAGER", DEFAULT_POOL_MANAGER);
        config.positionManager = vm.envOr("POSITION_MANAGER", DEFAULT_POSITION_MANAGER);
        config.stateView = vm.envOr("STATE_VIEW", DEFAULT_STATE_VIEW);
        config.universalRouter = vm.envOr("UNIVERSAL_ROUTER", DEFAULT_UNIVERSAL_ROUTER);
        config.permit2 = vm.envOr("PERMIT2", DEFAULT_PERMIT2);
    }

    function _validateUniswapContracts(XLayerConfig memory config) internal view {
        _requireContract(config.poolManager, "PoolManager");
        _requireContract(config.positionManager, "PositionManager");
        _requireContract(config.stateView, "StateView");
        _requireContract(config.universalRouter, "UniversalRouter");
        _requireContract(config.permit2, "Permit2");
    }

    function _requireContract(address target, string memory label) internal view {
        require(target != address(0), string.concat(label, " is zero"));
        require(target.code.length > 0, string.concat(label, " has no code"));
    }

    function _deployPulsePool(XLayerConfig memory config, address actor)
        internal
        returns (XLayerDeployment memory deployment)
    {
        (deployment.currency0Token, deployment.currency1Token) = _deployDemoTokenPair(actor);
        deployment.hook = _deployFairFlowHook(IPoolManager(config.poolManager), actor);
        deployment.flowPass = new FlowPassNFT(actor);
        deployment.factory = new LaunchFactory(IFairFlowHook(address(deployment.hook)), actor);
        deployment.lens = new MetricsLens(IFairFlowHook(address(deployment.hook)));

        deployment.flowPass.setMinter(address(deployment.hook), true);
        deployment.hook.setFlowPass(address(deployment.flowPass));
        deployment.hook.setConfigWriter(address(deployment.factory), true);

        deployment.poolKey = PoolKey({
            currency0: Currency.wrap(address(deployment.currency0Token)),
            currency1: Currency.wrap(address(deployment.currency1Token)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(deployment.hook)
        });
        deployment.poolId = deployment.poolKey.toId();
    }

    function _deployDemoTokenPair(address actor) internal returns (DemoToken currency0Token, DemoToken currency1Token) {
        DemoToken tokenA = new DemoToken("PulsePool X Layer Quote", "PXQ", actor, 10_000_000 ether);
        DemoToken tokenB = new DemoToken("PulsePool X Layer Launch", "PXL", actor, 10_000_000 ether);

        if (address(tokenA) < address(tokenB)) {
            (currency0Token, currency1Token) = (tokenA, tokenB);
        } else {
            (currency0Token, currency1Token) = (tokenB, tokenA);
        }
    }

    function _deployFairFlowHook(IPoolManager poolManager, address actor) internal returns (FairFlowHook hook) {
        uint160 flags = uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(poolManager, actor);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(FairFlowHook).creationCode, constructorArgs);

        hook = new FairFlowHook{salt: salt}(poolManager, actor);
        require(address(hook) == hookAddress, "FairFlowHook address mismatch");
    }

    function _logConfig(XLayerConfig memory config) internal pure {
        console2.log("X Layer Uniswap v4 config");
        console2.log("PoolManager:", config.poolManager);
        console2.log("PositionManager:", config.positionManager);
        console2.log("StateView:", config.stateView);
        console2.log("UniversalRouter:", config.universalRouter);
        console2.log("Permit2:", config.permit2);
    }

    function _logDeployment(XLayerDeployment memory deployment) internal pure {
        console2.log("PulsePool X Layer deployment");
        console2.log("Token0:", address(deployment.currency0Token));
        console2.log("Token1:", address(deployment.currency1Token));
        console2.log("FairFlowHook:", address(deployment.hook));
        console2.log("FlowPassNFT:", address(deployment.flowPass));
        console2.log("LaunchFactory:", address(deployment.factory));
        console2.log("MetricsLens:", address(deployment.lens));
        console2.logBytes32(PoolId.unwrap(deployment.poolId));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {FlowPassNFT} from "../src/FlowPassNFT.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";
import {MetricsLens} from "../src/MetricsLens.sol";
import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {V4PoolManagerDeployer} from "hookmate/artifacts/V4PoolManager.sol";
import {V4PositionManagerDeployer} from "hookmate/artifacts/V4PositionManager.sol";
import {V4RouterDeployer} from "hookmate/artifacts/V4Router.sol";

import {PulsePoolLocalDemo} from "./base/PulsePoolLocalDemo.sol";

contract DeployXLayerTestnetDemoScript is PulsePoolLocalDemo {
    uint256 internal constant XLAYER_TESTNET_CHAIN_ID = 1952;

    function run() external virtual {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "DeployXLayerTestnetDemo: wrong chain");

        address actor = _scriptSender();

        vm.startBroadcast(actor);
        DemoContracts memory demo = _deployTestnetDemoContracts(actor);
        uint256 liquidityTokenId = _initializePoolRegisterLaunchAndAddLiquidity(demo);
        vm.stopBroadcast();

        console2.log("PulsePool X Layer testnet demo dry-run");
        _logDeployment(demo);
        console2.log("Liquidity token ID:", liquidityTokenId);
        _logDashboard(demo);
    }

    function _deployTestnetDemoContracts(address actor) internal returns (DemoContracts memory demo) {
        demo.actor = actor;
        (demo.permit2, demo.poolManager, demo.positionManager, demo.swapRouter) = _deploySelfHostedV4(actor);
        (demo.currency0Token, demo.currency1Token) = _deployDemoTokenPair(actor);
        demo.hook = _deployFairFlowHook(demo.poolManager, actor);
        demo.flowPass = new FlowPassNFT(actor);
        demo.factory = new LaunchFactory(IFairFlowHook(address(demo.hook)), actor);
        demo.lens = new MetricsLens(IFairFlowHook(address(demo.hook)));

        demo.flowPass.setMinter(address(demo.hook), true);
        demo.hook.setFlowPass(address(demo.flowPass));
        demo.hook.setConfigWriter(address(demo.factory), true);

        demo.poolKey = PoolKey({
            currency0: Currency.wrap(address(demo.currency0Token)),
            currency1: Currency.wrap(address(demo.currency1Token)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(demo.hook)
        });
        demo.poolId = demo.poolKey.toId();

        _approveDemoTokens(demo);
    }

    function _deploySelfHostedV4(address owner)
        internal
        returns (
            IPermit2 permit2,
            IPoolManager poolManager,
            IPositionManager positionManager,
            IUniswapV4Router04 swapRouter
        )
    {
        address permit2Address = AddressConstants.getPermit2Address();
        require(permit2Address.code.length > 0, "DeployXLayerTestnetDemo: Permit2 missing");

        permit2 = IPermit2(permit2Address);
        poolManager = IPoolManager(V4PoolManagerDeployer.deploy(owner));
        positionManager = IPositionManager(
            V4PositionManagerDeployer.deploy(address(poolManager), address(permit2), 300_000, address(0), address(0))
        );
        swapRouter = IUniswapV4Router04(payable(V4RouterDeployer.deploy(address(poolManager), address(permit2))));
    }
}

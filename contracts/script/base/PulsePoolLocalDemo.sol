// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {DemoToken} from "../../src/DemoToken.sol";
import {FairFlowHook} from "../../src/FairFlowHook.sol";
import {FlowPassNFT} from "../../src/FlowPassNFT.sol";
import {LaunchFactory} from "../../src/LaunchFactory.sol";
import {MetricsLens} from "../../src/MetricsLens.sol";
import {IFairFlowHook} from "../../src/interfaces/IFairFlowHook.sol";
import {IMetricsLens} from "../../src/interfaces/IMetricsLens.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {Permit2Deployer} from "hookmate/artifacts/Permit2.sol";
import {V4PoolManagerDeployer} from "hookmate/artifacts/V4PoolManager.sol";
import {V4PositionManagerDeployer} from "hookmate/artifacts/V4PositionManager.sol";
import {V4RouterDeployer} from "hookmate/artifacts/V4Router.sol";

abstract contract PulsePoolLocalDemo is Script {
    using PoolIdLibrary for PoolKey;

    struct DemoContracts {
        address actor;
        IPermit2 permit2;
        IPoolManager poolManager;
        IPositionManager positionManager;
        IUniswapV4Router04 swapRouter;
        DemoToken currency0Token;
        DemoToken currency1Token;
        FairFlowHook hook;
        FlowPassNFT flowPass;
        LaunchFactory factory;
        MetricsLens lens;
        PoolKey poolKey;
        PoolId poolId;
    }

    struct LiquidityPlan {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidityAmount;
        uint256 amount0Max;
        uint256 amount1Max;
    }

    address internal constant DEMO_USER = address(0xA11CE);
    address internal constant SECOND_DEMO_USER = address(0xB0B);

    function _scriptSender() internal returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) return wallets[0];
        return msg.sender;
    }

    function _deployDemoContracts(address actor) internal returns (DemoContracts memory demo) {
        demo.actor = actor;
        (demo.permit2, demo.poolManager, demo.positionManager, demo.swapRouter) = _deployLocalV4();
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

    function _deployLocalV4()
        internal
        returns (
            IPermit2 permit2,
            IPoolManager poolManager,
            IPositionManager positionManager,
            IUniswapV4Router04 swapRouter
        )
    {
        address permit2Address = AddressConstants.getPermit2Address();
        if (permit2Address.code.length == 0) {
            vm.etch(permit2Address, Permit2Deployer.deploy().code);
        }

        permit2 = IPermit2(permit2Address);
        poolManager = IPoolManager(V4PoolManagerDeployer.deploy(address(0x4444)));
        positionManager = IPositionManager(
            V4PositionManagerDeployer.deploy(address(poolManager), address(permit2), 300_000, address(0), address(0))
        );
        swapRouter = IUniswapV4Router04(payable(V4RouterDeployer.deploy(address(poolManager), address(permit2))));
    }

    function _deployDemoTokenPair(address actor) internal returns (DemoToken currency0Token, DemoToken currency1Token) {
        DemoToken tokenA = new DemoToken("PulsePool Demo Quote", "PDQ", actor, 10_000_000 ether);
        DemoToken tokenB = new DemoToken("PulsePool Demo Launch", "PDL", actor, 10_000_000 ether);

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

    function _initializePoolRegisterLaunchAndAddLiquidity(DemoContracts memory demo)
        internal
        returns (uint256 liquidityTokenId)
    {
        demo.poolManager.initialize(demo.poolKey, Constants.SQRT_PRICE_1_1);
        demo.factory.registerLaunch(demo.poolKey, _launchConfig(demo));
        liquidityTokenId = _addDemoLiquidity(demo.positionManager, demo.poolKey, demo.actor);
    }

    function _addDemoLiquidity(IPositionManager positionManager, PoolKey memory poolKey, address recipient)
        internal
        returns (uint256 liquidityTokenId)
    {
        LiquidityPlan memory plan = _liquidityPlan(poolKey);
        liquidityTokenId = _mintDemoLiquidity(positionManager, poolKey, plan, recipient);
    }

    function _liquidityPlan(PoolKey memory poolKey) internal pure returns (LiquidityPlan memory plan) {
        plan.tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        plan.tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);
        plan.liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(plan.tickLower),
            TickMath.getSqrtPriceAtTick(plan.tickUpper),
            plan.liquidityAmount
        );
        plan.amount0Max = amount0Expected + 1;
        plan.amount1Max = amount1Expected + 1;
    }

    function _mintDemoLiquidity(
        IPositionManager positionManager,
        PoolKey memory poolKey,
        LiquidityPlan memory plan,
        address recipient
    ) internal returns (uint256 liquidityTokenId) {
        liquidityTokenId = positionManager.nextTokenId();
        (bytes memory actions, bytes[] memory mintParams) = _mintLiquidityParams(
            poolKey,
            plan.tickLower,
            plan.tickUpper,
            plan.liquidityAmount,
            plan.amount0Max,
            plan.amount1Max,
            recipient,
            Constants.ZERO_BYTES
        );
        positionManager.modifyLiquidities(abi.encode(actions, mintParams), block.timestamp + 1 hours);
    }

    function _mintLiquidityParams(
        PoolKey memory poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint256 liquidity,
        uint256 amount0Max,
        uint256 amount1Max,
        address recipient,
        bytes memory hookData
    ) internal pure returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );

        params = new bytes[](4);
        params[0] = abi.encode(poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData);
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        params[2] = abi.encode(poolKey.currency0, recipient);
        params[3] = abi.encode(poolKey.currency1, recipient);
    }

    function _launchConfig(DemoContracts memory demo) internal view returns (IFairFlowHook.LaunchConfig memory) {
        return IFairFlowHook.LaunchConfig({
            launchToken: address(demo.currency1Token),
            quoteToken: address(demo.currency0Token),
            launchStart: uint64(block.timestamp),
            launchEnd: uint64(block.timestamp + 7 days),
            baseFeePips: 3000,
            maxFeePips: 100000,
            minFeePips: 500,
            maxBuyBps: 500,
            maxBuyAmount: 5 ether,
            cooldownBlocks: 3,
            nftDiscountEnabled: true
        });
    }

    function _approveDemoTokens(DemoContracts memory demo) internal {
        demo.currency0Token.approve(address(demo.permit2), type(uint256).max);
        demo.currency1Token.approve(address(demo.permit2), type(uint256).max);
        demo.currency0Token.approve(address(demo.swapRouter), type(uint256).max);
        demo.currency1Token.approve(address(demo.swapRouter), type(uint256).max);

        demo.permit2
            .approve(address(demo.currency0Token), address(demo.positionManager), type(uint160).max, type(uint48).max);
        demo.permit2
            .approve(address(demo.currency1Token), address(demo.positionManager), type(uint160).max, type(uint48).max);
        demo.permit2
            .approve(address(demo.currency0Token), address(demo.poolManager), type(uint160).max, type(uint48).max);
        demo.permit2
            .approve(address(demo.currency1Token), address(demo.poolManager), type(uint160).max, type(uint48).max);
    }

    function _swap(DemoContracts memory demo, address user, uint256 amountIn, bool zeroForOne)
        internal
        returns (BalanceDelta)
    {
        return demo.swapRouter
            .swapExactTokensForTokens({
                amountIn: amountIn,
                amountOutMin: 0,
                zeroForOne: zeroForOne,
                poolKey: demo.poolKey,
                hookData: abi.encode(user),
                receiver: demo.actor,
                deadline: block.timestamp + 1 hours
            });
    }

    function _logDeployment(DemoContracts memory demo) internal pure {
        console2.log("Permit2:", address(demo.permit2));
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
    }

    function _logDashboard(DemoContracts memory demo) internal view {
        IMetricsLens.PoolDashboard memory dashboard = demo.lens.getPoolDashboard(demo.poolId);
        console2.log("score:", dashboard.score);
        console2.log("currentFee:", dashboard.currentFee);
        console2.log("rollingVolume:", dashboard.rollingVolume);
        console2.logInt(dashboard.netFlow);
        console2.log("buyCount:", dashboard.buyCount);
        console2.log("sellCount:", dashboard.sellCount);
        console2.log("uniqueTraderCount:", dashboard.uniqueTraderCount);
        console2.log("largeTradeCount:", dashboard.largeTradeCount);
        console2.log("inLaunchWindow:", dashboard.inLaunchWindow);
        console2.log("guardActive:", dashboard.guardActive);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

contract PrepareXLayerMainnetDemoPoolScript is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 internal constant XLAYER_MAINNET_CHAIN_ID = 196;
    uint24 internal constant POOL_FEE = LPFeeLibrary.DYNAMIC_FEE_FLAG;
    int24 internal constant TICK_SPACING = 60;
    uint160 internal constant SQRT_PRICE_1_1 = Constants.SQRT_PRICE_1_1;

    address internal constant DEFAULT_POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address internal constant DEFAULT_POSITION_MANAGER = 0xcF1EAFC6928dC385A342E7C6491d371d2871458b;
    address internal constant DEFAULT_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant DEFAULT_UNIVERSAL_ROUTER = 0xDa00aE15d3A71466517129255255db7c0c0956d3;

    address internal constant DEFAULT_FAIRFLOW_HOOK = 0xc560CD40AcD57db2eD18373351fDcf9211d890C0;
    address internal constant DEFAULT_LAUNCH_FACTORY = 0xe2e1a6AD6D596Cd88b27C82173eD9099609eE869;
    address internal constant DEFAULT_LAUNCH_TOKEN = 0x9Aa9313467F791f5AC031F5f130cA07F23e25204;
    address internal constant DEFAULT_QUOTE_TOKEN = 0xd641ed64bbe3dB2856E6523a2968D33Ff5e55d22;

    bytes1 internal constant UNIVERSAL_ROUTER_V4_SWAP = 0x10;
    uint8 internal constant V4_SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 internal constant V4_SETTLE_ALL = 0x0c;
    uint8 internal constant V4_TAKE_ALL = 0x0f;

    struct DemoConfig {
        address actor;
        IPoolManager poolManager;
        IPositionManager positionManager;
        IPermit2 permit2;
        IUniversalRouter universalRouter;
        IFairFlowHook fairFlowHook;
        LaunchFactory launchFactory;
        IERC20 launchToken;
        IERC20 quoteToken;
        PoolKey poolKey;
        PoolId poolId;
        uint256 amount0Max;
        uint256 amount1Max;
        uint128 swapAmountSmall;
        uint128 swapAmountMedium;
        bool seedLiquidity;
        bool runSwaps;
    }

    struct LiquidityPlan {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bytes actions;
        bytes[] params;
    }

    function run() external {
        require(block.chainid == XLAYER_MAINNET_CHAIN_ID, "PrepareMainnetDemo: wrong chain");

        DemoConfig memory config = _loadConfig();
        _validateConfig(config);

        (uint160 sqrtPriceBefore,,,) = config.poolManager.getSlot0(config.poolId);
        bool wasInitialized = sqrtPriceBefore != 0;
        bool wasRegistered = config.launchFactory.registeredLaunches(config.poolId);

        vm.startBroadcast(config.actor);

        if (!wasInitialized) {
            config.poolManager.initialize(config.poolKey, SQRT_PRICE_1_1);
        }

        if (!wasRegistered) {
            config.launchFactory.registerLaunch(config.poolKey, _launchConfig(config));
        }

        uint256 liquidityTokenId;
        uint128 liquidity;
        if (config.seedLiquidity) {
            LiquidityPlan memory plan = _mintPlan(config);
            _approveForPositionManager(config.poolKey.currency0, config.permit2, config.positionManager);
            _approveForPositionManager(config.poolKey.currency1, config.permit2, config.positionManager);
            liquidityTokenId = config.positionManager.nextTokenId();
            liquidity = plan.liquidity;
            config.positionManager.modifyLiquidities(abi.encode(plan.actions, plan.params), block.timestamp + 1 hours);
        }

        if (config.runSwaps) {
            _approveForUniversalRouter(config.launchToken, config.permit2, config.universalRouter);
            _approveForUniversalRouter(config.quoteToken, config.permit2, config.universalRouter);

            _swap(config, false, config.swapAmountSmall);
            _swap(config, true, config.swapAmountSmall / 2);
            _swap(config, false, config.swapAmountMedium);
        }

        vm.stopBroadcast();

        _logResult(config, wasInitialized, wasRegistered, liquidityTokenId, liquidity);
    }

    function _loadConfig() internal returns (DemoConfig memory config) {
        config.actor = _scriptSender();
        config.poolManager = IPoolManager(vm.envOr("PULSEPOOL_MAINNET_POOL_MANAGER", DEFAULT_POOL_MANAGER));
        config.positionManager =
            IPositionManager(vm.envOr("PULSEPOOL_MAINNET_POSITION_MANAGER", DEFAULT_POSITION_MANAGER));
        config.permit2 = IPermit2(vm.envOr("PULSEPOOL_MAINNET_PERMIT2", DEFAULT_PERMIT2));
        config.universalRouter =
            IUniversalRouter(vm.envOr("PULSEPOOL_MAINNET_UNIVERSAL_ROUTER", DEFAULT_UNIVERSAL_ROUTER));
        config.fairFlowHook = IFairFlowHook(vm.envOr("PULSEPOOL_MAINNET_FAIRFLOW_HOOK", DEFAULT_FAIRFLOW_HOOK));
        config.launchFactory = LaunchFactory(vm.envOr("PULSEPOOL_MAINNET_LAUNCH_FACTORY", DEFAULT_LAUNCH_FACTORY));
        config.launchToken = IERC20(vm.envOr("PULSEPOOL_MAINNET_LAUNCH_TOKEN", DEFAULT_LAUNCH_TOKEN));
        config.quoteToken = IERC20(vm.envOr("PULSEPOOL_MAINNET_QUOTE_TOKEN", DEFAULT_QUOTE_TOKEN));
        config.poolKey = _poolKey(address(config.launchToken), address(config.quoteToken), address(config.fairFlowHook));
        config.poolId = config.poolKey.toId();
        config.amount0Max = vm.envOr("PULSEPOOL_MAINNET_LIQUIDITY_AMOUNT0", uint256(1_000 ether));
        config.amount1Max = vm.envOr("PULSEPOOL_MAINNET_LIQUIDITY_AMOUNT1", uint256(1_000 ether));
        config.swapAmountSmall = uint128(vm.envOr("PULSEPOOL_MAINNET_SWAP_AMOUNT_SMALL", uint256(1 ether)));
        config.swapAmountMedium = uint128(vm.envOr("PULSEPOOL_MAINNET_SWAP_AMOUNT_MEDIUM", uint256(2 ether)));
        config.seedLiquidity = vm.envOr("PULSEPOOL_MAINNET_SEED_LIQUIDITY", true);
        config.runSwaps = vm.envOr("PULSEPOOL_MAINNET_RUN_SWAPS", true);
    }

    function _scriptSender() internal returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) return wallets[0];
        return msg.sender;
    }

    function _poolKey(address launchToken, address quoteToken, address hook) internal pure returns (PoolKey memory) {
        (address currency0, address currency1) = _ordered(launchToken, quoteToken);
        return PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hook)
        });
    }

    function _ordered(address tokenA, address tokenB) internal pure returns (address currency0, address currency1) {
        require(tokenA != address(0) && tokenB != address(0), "PrepareMainnetDemo: zero token");
        require(tokenA != tokenB, "PrepareMainnetDemo: duplicate token");
        return uint160(tokenA) < uint160(tokenB) ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function _validateConfig(DemoConfig memory config) internal view {
        _requireContract(address(config.poolManager), "PoolManager");
        _requireContract(address(config.positionManager), "PositionManager");
        _requireContract(address(config.permit2), "Permit2");
        _requireContract(address(config.universalRouter), "UniversalRouter");
        _requireContract(address(config.fairFlowHook), "FairFlowHook");
        _requireContract(address(config.launchFactory), "LaunchFactory");
        _requireContract(address(config.launchToken), "LaunchToken");
        _requireContract(address(config.quoteToken), "QuoteToken");
        require(config.launchFactory.canCreate(config.actor), "PrepareMainnetDemo: actor cannot create");
    }

    function _requireContract(address target, string memory label) internal view {
        require(target != address(0), string.concat(label, " is zero"));
        require(target.code.length > 0, string.concat(label, " has no code"));
    }

    function _launchConfig(DemoConfig memory config) internal view returns (IFairFlowHook.LaunchConfig memory) {
        return IFairFlowHook.LaunchConfig({
            launchToken: address(config.launchToken),
            quoteToken: address(config.quoteToken),
            launchStart: uint64(block.timestamp),
            launchEnd: uint64(block.timestamp + 7 days),
            baseFeePips: 3_000,
            maxFeePips: 100_000,
            minFeePips: 500,
            maxBuyBps: 500,
            maxBuyAmount: 1_000 ether,
            cooldownBlocks: 0,
            nftDiscountEnabled: true
        });
    }

    function _mintPlan(DemoConfig memory config) internal view returns (LiquidityPlan memory plan) {
        (uint160 sqrtPriceX96,,,) = config.poolManager.getSlot0(config.poolId);
        if (sqrtPriceX96 == 0) sqrtPriceX96 = SQRT_PRICE_1_1;

        plan.tickLower = TickMath.minUsableTick(TICK_SPACING);
        plan.tickUpper = TickMath.maxUsableTick(TICK_SPACING);
        plan.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(plan.tickLower),
            TickMath.getSqrtPriceAtTick(plan.tickUpper),
            config.amount0Max,
            config.amount1Max
        );
        require(plan.liquidity > 0, "PrepareMainnetDemo: zero liquidity");

        (plan.actions, plan.params) =
            _mintLiquidityParams(config.poolKey, plan.tickLower, plan.tickUpper, plan.liquidity, config);
    }

    function _mintLiquidityParams(
        PoolKey memory poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        DemoConfig memory config
    ) internal pure returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );

        params = new bytes[](4);
        params[0] = abi.encode(
            poolKey, tickLower, tickUpper, liquidity, config.amount0Max, config.amount1Max, config.actor, bytes("")
        );
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        params[2] = abi.encode(poolKey.currency0, config.actor);
        params[3] = abi.encode(poolKey.currency1, config.actor);
    }

    function _approveForPositionManager(Currency currency, IPermit2 permit2, IPositionManager positionManager)
        internal
    {
        IERC20 token = IERC20(Currency.unwrap(currency));
        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(positionManager), type(uint160).max, type(uint48).max);
    }

    function _approveForUniversalRouter(IERC20 token, IPermit2 permit2, IUniversalRouter universalRouter) internal {
        token.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token), address(universalRouter), type(uint160).max, type(uint48).max);
    }

    function _swap(DemoConfig memory config, bool zeroForOne, uint128 amountIn) internal {
        require(amountIn > 0, "PrepareMainnetDemo: zero swap amount");

        Currency inputCurrency = zeroForOne ? config.poolKey.currency0 : config.poolKey.currency1;
        Currency outputCurrency = zeroForOne ? config.poolKey.currency1 : config.poolKey.currency0;
        bytes memory actions = abi.encodePacked(V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE_ALL, V4_TAKE_ALL);
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: config.poolKey,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: 0,
                hookData: abi.encode(config.actor)
            })
        );
        params[1] = abi.encode(inputCurrency, uint256(amountIn));
        params[2] = abi.encode(outputCurrency, uint256(0));

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        config.universalRouter.execute(abi.encodePacked(UNIVERSAL_ROUTER_V4_SWAP), inputs, block.timestamp + 1 hours);
    }

    function _logResult(
        DemoConfig memory config,
        bool wasInitialized,
        bool wasRegistered,
        uint256 liquidityTokenId,
        uint128 liquidity
    ) internal view {
        (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee) =
            config.poolManager.getSlot0(config.poolId);

        console2.log("FairFlow X Layer mainnet demo pool prepared");
        console2.log("Actor:", config.actor);
        console2.log("PoolManager:", address(config.poolManager));
        console2.log("PositionManager:", address(config.positionManager));
        console2.log("Permit2:", address(config.permit2));
        console2.log("UniversalRouter:", address(config.universalRouter));
        console2.log("FairFlowHook:", address(config.fairFlowHook));
        console2.log("LaunchFactory:", address(config.launchFactory));
        console2.log("Launch token:", address(config.launchToken));
        console2.log("Launch symbol:", _symbol(config.launchToken));
        console2.log("Quote token:", address(config.quoteToken));
        console2.log("Quote symbol:", _symbol(config.quoteToken));
        console2.log("Currency0:", Currency.unwrap(config.poolKey.currency0));
        console2.log("Currency1:", Currency.unwrap(config.poolKey.currency1));
        console2.logBytes32(PoolId.unwrap(config.poolId));
        console2.log("Was initialized before run:", wasInitialized);
        console2.log("Was registered before run:", wasRegistered);
        console2.log("Registered after run:", config.launchFactory.registeredLaunches(config.poolId));
        console2.log("sqrtPriceX96:", sqrtPriceX96);
        console2.log("tick:", tick);
        console2.log("protocolFee:", protocolFee);
        console2.log("lpFee:", lpFee);
        console2.log("Liquidity seeded:", config.seedLiquidity);
        console2.log("Predicted/used LP token ID:", liquidityTokenId);
        console2.log("Liquidity:", liquidity);
        console2.log("Swaps executed:", config.runSwaps);
        console2.log("Small swap amount:", config.swapAmountSmall);
        console2.log("Medium swap amount:", config.swapAmountMedium);
    }

    function _symbol(IERC20 token) internal view returns (string memory) {
        (bool ok, bytes memory data) = address(token).staticcall(abi.encodeWithSignature("symbol()"));
        if (!ok || data.length == 0) return "UNKNOWN";
        return abi.decode(data, (string));
    }
}

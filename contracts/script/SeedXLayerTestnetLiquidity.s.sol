// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";

contract SeedXLayerTestnetLiquidityScript is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint256 internal constant XLAYER_TESTNET_CHAIN_ID = 1952;
    uint24 internal constant POOL_FEE = LPFeeLibrary.DYNAMIC_FEE_FLAG;
    int24 internal constant TICK_SPACING = 60;

    struct SeedConfig {
        address actor;
        IPoolManager poolManager;
        IPositionManager positionManager;
        IPermit2 permit2;
        PoolKey poolKey;
        PoolId poolId;
        uint160 sqrtPriceX96;
        uint256 amount0Max;
        uint256 amount1Max;
        address recipient;
    }

    struct MintPlan {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bytes actions;
        bytes[] params;
    }

    function run() external {
        require(block.chainid == XLAYER_TESTNET_CHAIN_ID, "SeedXLayerTestnetLiquidity: wrong chain");

        SeedConfig memory config = _loadConfig();
        MintPlan memory plan = _mintPlan(config);

        vm.startBroadcast(config.actor);
        _approveToken(config.poolKey.currency0, config.permit2, config.positionManager);
        _approveToken(config.poolKey.currency1, config.permit2, config.positionManager);

        uint256 predictedTokenId = config.positionManager.nextTokenId();
        config.positionManager.modifyLiquidities(abi.encode(plan.actions, plan.params), block.timestamp + 1 hours);
        vm.stopBroadcast();

        _logResult(config, plan, predictedTokenId);
    }

    function _loadConfig() internal returns (SeedConfig memory config) {
        config.actor = _scriptSender();
        config.poolManager = IPoolManager(vm.envAddress("PULSEPOOL_TESTNET_POOL_MANAGER"));
        config.positionManager = IPositionManager(vm.envAddress("PULSEPOOL_TESTNET_POSITION_MANAGER"));
        config.permit2 = IPermit2(AddressConstants.getPermit2Address());
        require(address(config.permit2).code.length > 0, "SeedXLayerTestnetLiquidity: Permit2 missing");

        config.poolKey = _poolKey();
        config.poolId = config.poolKey.toId();
        bytes32 expectedPoolId = vm.envOr("PULSEPOOL_TESTNET_POOL_ID", bytes32(0));
        if (expectedPoolId != bytes32(0)) {
            require(PoolId.unwrap(config.poolId) == expectedPoolId, "SeedXLayerTestnetLiquidity: pool id mismatch");
        }

        (config.sqrtPriceX96,,,) = config.poolManager.getSlot0(config.poolId);
        require(config.sqrtPriceX96 != 0, "SeedXLayerTestnetLiquidity: pool not initialized");

        config.amount0Max = vm.envOr("PULSEPOOL_TESTNET_LIQUIDITY_AMOUNT0", uint256(100 ether));
        config.amount1Max = vm.envOr("PULSEPOOL_TESTNET_LIQUIDITY_AMOUNT1", uint256(100 ether));
        config.recipient = vm.envOr("PULSEPOOL_TESTNET_LIQUIDITY_RECIPIENT", config.actor);
    }

    function _mintPlan(SeedConfig memory config) internal pure returns (MintPlan memory plan) {
        plan.tickLower = TickMath.minUsableTick(TICK_SPACING);
        plan.tickUpper = TickMath.maxUsableTick(TICK_SPACING);
        plan.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            config.sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(plan.tickLower),
            TickMath.getSqrtPriceAtTick(plan.tickUpper),
            config.amount0Max,
            config.amount1Max
        );
        require(plan.liquidity > 0, "SeedXLayerTestnetLiquidity: zero liquidity");

        (plan.actions, plan.params) = _mintLiquidityParams(
            config.poolKey,
            plan.tickLower,
            plan.tickUpper,
            plan.liquidity,
            config.amount0Max,
            config.amount1Max,
            config.recipient
        );
    }

    function _logResult(SeedConfig memory config, MintPlan memory plan, uint256 predictedTokenId) internal pure {
        int24 currentTick = TickMath.getTickAtSqrtPrice(config.sqrtPriceX96);
        console2.log("FairFlow X Layer testnet liquidity seeded");
        console2.log("Actor:", config.actor);
        console2.log("Recipient:", config.recipient);
        console2.log("PoolManager:", address(config.poolManager));
        console2.log("PositionManager:", address(config.positionManager));
        console2.log("Token0:", Currency.unwrap(config.poolKey.currency0));
        console2.log("Token1:", Currency.unwrap(config.poolKey.currency1));
        console2.log("FairFlowHook:", address(config.poolKey.hooks));
        console2.logBytes32(PoolId.unwrap(config.poolId));
        console2.log("Current tick:", currentTick);
        console2.log("Tick lower:", plan.tickLower);
        console2.log("Tick upper:", plan.tickUpper);
        console2.log("Amount0 max:", config.amount0Max);
        console2.log("Amount1 max:", config.amount1Max);
        console2.log("Liquidity:", plan.liquidity);
        console2.log("Predicted LP token ID:", predictedTokenId);
    }

    function _scriptSender() internal returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) return wallets[0];
        return msg.sender;
    }

    function _poolKey() internal view returns (PoolKey memory) {
        (address currency0, address currency1) =
            _ordered(vm.envAddress("PULSEPOOL_TESTNET_TOKEN0"), vm.envAddress("PULSEPOOL_TESTNET_TOKEN1"));

        return PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(vm.envAddress("PULSEPOOL_TESTNET_FAIRFLOW_HOOK"))
        });
    }

    function _ordered(address tokenA, address tokenB) internal pure returns (address currency0, address currency1) {
        require(tokenA != address(0) && tokenB != address(0), "SeedXLayerTestnetLiquidity: zero token");
        require(tokenA != tokenB, "SeedXLayerTestnetLiquidity: duplicate token");
        return uint160(tokenA) < uint160(tokenB) ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function _approveToken(Currency currency, IPermit2 permit2, IPositionManager positionManager) internal {
        address token = Currency.unwrap(currency);
        IERC20(token).approve(address(permit2), type(uint256).max);
        permit2.approve(token, address(positionManager), type(uint160).max, type(uint48).max);
    }

    function _mintLiquidityParams(
        PoolKey memory poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 amount0Max,
        uint256 amount1Max,
        address recipient
    ) internal pure returns (bytes memory actions, bytes[] memory params) {
        actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP), uint8(Actions.SWEEP)
        );

        params = new bytes[](4);
        params[0] = abi.encode(poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, bytes(""));
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        params[2] = abi.encode(poolKey.currency0, recipient);
        params[3] = abi.encode(poolKey.currency1, recipient);
    }
}

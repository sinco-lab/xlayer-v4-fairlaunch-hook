// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IFairFlowHook} from "../src/interfaces/IFairFlowHook.sol";
import {ILaunchFactory} from "../src/interfaces/ILaunchFactory.sol";
import {FairFlowHook} from "../src/FairFlowHook.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {BaseTest} from "./utils/BaseTest.sol";

contract LaunchFactoryTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;
    FairFlowHook hook;
    LaunchFactory factory;

    event LaunchCreated(
        PoolId indexed poolId,
        address indexed launchToken,
        address indexed quoteToken,
        address hook,
        uint64 launchStart,
        uint64 launchEnd
    );

    function setUp() public {
        vm.warp(1_700_000_000);
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG));
        bytes memory constructorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("FairFlowHook.sol:FairFlowHook", constructorArgs, flags);
        hook = FairFlowHook(flags);

        factory = new LaunchFactory(IFairFlowHook(address(hook)), address(this));
        hook.setConfigWriter(address(factory), true);

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolId = poolKey.toId();
    }

    function testRegisterValidLaunch() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();

        PoolId returnedPoolId = factory.registerLaunch(poolKey, config);

        assertEq(PoolId.unwrap(returnedPoolId), PoolId.unwrap(poolId));
        assertTrue(factory.registeredLaunches(poolId));
        assertTrue(hook.isLaunchConfigured(poolId));
        assertEq(hook.getLaunchConfig(poolId).launchToken, config.launchToken);
    }

    function testRegisterInvalidLaunchReverts() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();

        config.launchEnd = config.launchStart;
        vm.expectRevert(ILaunchFactory.InvalidLaunchConfig.selector);
        factory.registerLaunch(poolKey, config);

        config = _defaultConfig();
        config.minFeePips = config.baseFeePips + 1;
        vm.expectRevert(ILaunchFactory.InvalidLaunchConfig.selector);
        factory.registerLaunch(poolKey, config);

        config = _defaultConfig();
        config.baseFeePips = config.maxFeePips + 1;
        vm.expectRevert(ILaunchFactory.InvalidLaunchConfig.selector);
        factory.registerLaunch(poolKey, config);

        config = _defaultConfig();
        config.maxBuyAmount = 0;
        vm.expectRevert(ILaunchFactory.InvalidLaunchConfig.selector);
        factory.registerLaunch(poolKey, config);

        config = _defaultConfig();
        config.cooldownBlocks = factory.MAX_COOLDOWN_BLOCKS() + 1;
        vm.expectRevert(ILaunchFactory.InvalidLaunchConfig.selector);
        factory.registerLaunch(poolKey, config);
    }

    function testDuplicateLaunchReverts() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();

        factory.registerLaunch(poolKey, config);

        vm.expectRevert(abi.encodeWithSelector(ILaunchFactory.LaunchAlreadyRegistered.selector, poolId));
        factory.registerLaunch(poolKey, config);
    }

    function testLaunchCreatedEvent() public {
        IFairFlowHook.LaunchConfig memory config = _defaultConfig();

        vm.expectEmit(true, true, true, true, address(factory));
        emit LaunchCreated(
            poolId, config.launchToken, config.quoteToken, address(hook), config.launchStart, config.launchEnd
        );

        factory.registerLaunch(poolKey, config);
    }

    function testFactoryDoesNotHoldFunds() public {
        vm.deal(address(this), 1 ether);

        (bool ok,) = payable(address(factory)).call{value: 1 ether}("");

        assertFalse(ok);
        assertEq(address(factory).balance, 0);
    }

    function testUnauthorizedCannotRegisterLaunch() public {
        vm.prank(makeAddr("not-owner"));
        vm.expectRevert();
        factory.registerLaunch(poolKey, _defaultConfig());
    }

    function _defaultConfig() internal view returns (IFairFlowHook.LaunchConfig memory) {
        return IFairFlowHook.LaunchConfig({
            launchToken: Currency.unwrap(currency1),
            quoteToken: Currency.unwrap(currency0),
            launchStart: uint64(block.timestamp),
            launchEnd: uint64(block.timestamp + 7 days),
            baseFeePips: 3000,
            maxFeePips: 100000,
            minFeePips: 500,
            maxBuyBps: 500,
            maxBuyAmount: 5e18,
            cooldownBlocks: 3,
            nftDiscountEnabled: true
        });
    }
}

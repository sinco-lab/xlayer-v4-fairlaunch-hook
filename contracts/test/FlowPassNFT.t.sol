// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IFlowPassNFT} from "../src/interfaces/IFlowPassNFT.sol";
import {FlowPassNFT} from "../src/FlowPassNFT.sol";

contract FlowPassNFTTest is Test {
    FlowPassNFT flowPass;

    address owner = address(this);
    address minter = makeAddr("minter");
    address user = makeAddr("flowpass-user");
    address recipient = makeAddr("recipient");

    event FlowPassUpgraded(address indexed user, uint256 indexed tokenId, uint8 oldTier, uint8 newTier);

    function setUp() public {
        flowPass = new FlowPassNFT(owner);
        flowPass.setMinter(minter, true);
    }

    function testTierOfReturnsZeroWithoutNft() public view {
        assertEq(flowPass.tierOf(user), 0);
        assertEq(flowPass.tokenOf(user), 0);
    }

    function testMintFirstFlowPass() public {
        vm.prank(minter);
        flowPass.mintOrUpgrade(user, 1);

        uint256 tokenId = flowPass.tokenOf(user);
        assertEq(tokenId, 1);
        assertEq(flowPass.ownerOf(tokenId), user);
        assertEq(flowPass.balanceOf(user), 1);
        assertEq(flowPass.tierOf(user), 1);
    }

    function testCannotMintTwoFlowPassesForOneUser() public {
        vm.startPrank(minter);
        flowPass.mintOrUpgrade(user, 1);
        uint256 tokenId = flowPass.tokenOf(user);
        flowPass.mintOrUpgrade(user, 2);
        vm.stopPrank();

        assertEq(flowPass.tokenOf(user), tokenId);
        assertEq(flowPass.balanceOf(user), 1);
        assertEq(flowPass.tierOf(user), 2);
    }

    function testUpgradeTier() public {
        vm.startPrank(minter);
        flowPass.mintOrUpgrade(user, 1);
        flowPass.mintOrUpgrade(user, 2);
        vm.stopPrank();

        assertEq(flowPass.tierOf(user), 2);
    }

    function testCannotDowngradeTier() public {
        vm.startPrank(minter);
        flowPass.mintOrUpgrade(user, 2);
        vm.expectRevert(abi.encodeWithSelector(IFlowPassNFT.TierNotIncreasing.selector, 2, 1));
        flowPass.mintOrUpgrade(user, 1);
        vm.stopPrank();
    }

    function testInvalidTierReverts() public {
        vm.startPrank(minter);
        vm.expectRevert(IFlowPassNFT.InvalidTier.selector);
        flowPass.mintOrUpgrade(user, 0);
        vm.expectRevert(IFlowPassNFT.InvalidTier.selector);
        flowPass.mintOrUpgrade(user, 3);
        vm.stopPrank();
    }

    function testUnauthorizedCannotMintOrUpgrade() public {
        vm.expectRevert(IFlowPassNFT.UnauthorizedMinter.selector);
        flowPass.mintOrUpgrade(user, 1);
    }

    function testTransferBlocked() public {
        vm.prank(minter);
        flowPass.mintOrUpgrade(user, 1);
        uint256 tokenId = flowPass.tokenOf(user);

        vm.prank(user);
        vm.expectRevert(IFlowPassNFT.SoulboundTransfer.selector);
        flowPass.transferFrom(user, recipient, tokenId);
    }

    function testFlowPassUpgradedEvent() public {
        vm.expectEmit(true, true, false, true, address(flowPass));
        emit FlowPassUpgraded(user, 1, 0, 1);

        vm.prank(minter);
        flowPass.mintOrUpgrade(user, 1);
    }
}

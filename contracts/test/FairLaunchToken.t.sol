// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {FairLaunchToken} from "../src/FairLaunchToken.sol";

contract FairLaunchTokenTest is Test {
    event ProjectMetadataURISet(string uri);

    address owner = makeAddr("owner");
    address liquidity = makeAddr("liquidity");
    address treasury = makeAddr("treasury");

    function testConstructorMintsAllocationsAndStoresMetadata() public {
        address[] memory recipients = new address[](3);
        recipients[0] = owner;
        recipients[1] = liquidity;
        recipients[2] = treasury;

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 600_000 ether;
        amounts[1] = 300_000 ether;
        amounts[2] = 100_000 ether;

        vm.expectEmit(false, false, false, true);
        emit ProjectMetadataURISet("ipfs://metadata");

        FairLaunchToken token =
            new FairLaunchToken("Fair Launch", "FAIR", owner, recipients, amounts, "ipfs://metadata");

        assertEq(token.name(), "Fair Launch");
        assertEq(token.symbol(), "FAIR");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), owner);
        assertEq(token.projectMetadataURI(), "ipfs://metadata");
        assertEq(token.totalSupply(), 1_000_000 ether);
        assertEq(token.balanceOf(owner), 600_000 ether);
        assertEq(token.balanceOf(liquidity), 300_000 ether);
        assertEq(token.balanceOf(treasury), 100_000 ether);
    }

    function testOwnerCanUpdateMetadataURI() public {
        address[] memory recipients = new address[](1);
        recipients[0] = owner;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1_000_000 ether;

        FairLaunchToken token =
            new FairLaunchToken("Fair Launch", "FAIR", owner, recipients, amounts, "ipfs://metadata");

        vm.prank(owner);
        token.setProjectMetadataURI("ipfs://metadata-v2");

        assertEq(token.projectMetadataURI(), "ipfs://metadata-v2");
    }

    function testRejectsInvalidAllocations() public {
        address[] memory recipients = new address[](1);
        recipients[0] = owner;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;

        vm.expectRevert(FairLaunchToken.AllocationLengthMismatch.selector);
        new FairLaunchToken("Fair Launch", "FAIR", owner, recipients, amounts, "ipfs://metadata");

        amounts = new uint256[](1);
        amounts[0] = 0;

        vm.expectRevert(FairLaunchToken.ZeroAllocationAmount.selector);
        new FairLaunchToken("Fair Launch", "FAIR", owner, recipients, amounts, "ipfs://metadata");

        recipients[0] = address(0);
        amounts[0] = 1 ether;

        vm.expectRevert(FairLaunchToken.ZeroAllocationAddress.selector);
        new FairLaunchToken("Fair Launch", "FAIR", owner, recipients, amounts, "ipfs://metadata");
    }
}

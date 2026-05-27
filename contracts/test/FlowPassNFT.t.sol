// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IFlowPassNFT} from "../src/interfaces/IFlowPassNFT.sol";
import {FlowPassNFT} from "../src/FlowPassNFT.sol";

contract FlowPassNFTTest is Test {
    FlowPassNFT flowPass;

    string constant TIER_ONE_IMAGE = "ipfs://bafybeibdkwlmm3zekqtaqog3ldx2vd2hukyfde52muuc2qpjbrxnkssv34";
    string constant TIER_FOUR_IMAGE = "ipfs://bafybeibz5llct6lce4vge4q2wwc5ku2o33z4eastdtjcecntch5umagqlu";
    string constant TOKEN_URI_PREFIX = "data:application/json;base64,";

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
        flowPass.mintOrUpgrade(user, 4);
        vm.stopPrank();

        assertEq(flowPass.tierOf(user), 4);
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
        flowPass.mintOrUpgrade(user, 5);
        vm.stopPrank();
    }

    function testImageURIForTierUsesPinnedIpfsAssets() public view {
        assertEq(flowPass.MAX_TIER(), 4);
        assertEq(flowPass.imageURIForTier(1), TIER_ONE_IMAGE);
        assertEq(flowPass.imageURIForTier(4), TIER_FOUR_IMAGE);
    }

    function testInvalidImageTierReverts() public {
        vm.expectRevert(IFlowPassNFT.InvalidTier.selector);
        flowPass.imageURIForTier(0);

        vm.expectRevert(IFlowPassNFT.InvalidTier.selector);
        flowPass.imageURIForTier(5);
    }

    function testTokenURIIsOnchainJsonEnvelope() public {
        vm.prank(minter);
        flowPass.mintOrUpgrade(user, 4);

        string memory uri = flowPass.tokenURI(flowPass.tokenOf(user));

        assertTrue(_startsWith(uri, TOKEN_URI_PREFIX));
        assertGt(bytes(uri).length, bytes(TOKEN_URI_PREFIX).length);
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

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (valueBytes.length < prefixBytes.length) return false;

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (valueBytes[i] != prefixBytes[i]) return false;
        }

        return true;
    }
}

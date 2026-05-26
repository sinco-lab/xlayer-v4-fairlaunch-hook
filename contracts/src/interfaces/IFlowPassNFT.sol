// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IFlowPassNFT {
    event FlowPassUpgraded(address indexed user, uint256 indexed tokenId, uint8 oldTier, uint8 newTier);
    event MinterSet(address indexed minter, bool allowed);

    error UnauthorizedMinter();
    error InvalidTier();
    error TierNotIncreasing(uint8 currentTier, uint8 newTier);
    error SoulboundTransfer();
    error ZeroAddress();

    function tierOf(address user) external view returns (uint8);
    function tokenOf(address user) external view returns (uint256);
    function tierOfToken(uint256 tokenId) external view returns (uint8);
    function authorizedMinters(address minter) external view returns (bool);
    function setMinter(address minter, bool allowed) external;
    function mintOrUpgrade(address user, uint8 newTier) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFlowPassNFT} from "./interfaces/IFlowPassNFT.sol";

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract FlowPassNFT is ERC721, Ownable, IFlowPassNFT {
    uint256 internal constant FIRST_TOKEN_ID = 1;
    uint8 public constant MAX_TIER = 2;

    uint256 public nextTokenId = FIRST_TOKEN_ID;

    mapping(address user => uint256 tokenId) public tokenOf;
    mapping(uint256 tokenId => uint8 tier) public tierOfToken;
    mapping(address minter => bool allowed) public authorizedMinters;

    constructor(address initialOwner) ERC721("FlowPass", "FLOWPASS") Ownable(initialOwner) {}

    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender]) revert UnauthorizedMinter();
        _;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        if (minter == address(0)) revert ZeroAddress();
        authorizedMinters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function tierOf(address user) external view returns (uint8) {
        return tierOfToken[tokenOf[user]];
    }

    function mintOrUpgrade(address user, uint8 newTier) external onlyMinter {
        if (user == address(0)) revert ZeroAddress();
        if (newTier == 0 || newTier > MAX_TIER) revert InvalidTier();

        uint256 tokenId = tokenOf[user];
        uint8 oldTier;

        if (tokenId == 0) {
            tokenId = nextTokenId++;
            tokenOf[user] = tokenId;
            _mint(user, tokenId);
        } else {
            oldTier = tierOfToken[tokenId];
            if (newTier <= oldTier) revert TierNotIncreasing(oldTier, newTier);
        }

        tierOfToken[tokenId] = newTier;
        emit FlowPassUpgraded(user, tokenId, oldTier, newTier);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert SoulboundTransfer();
        return super._update(to, tokenId, auth);
    }
}

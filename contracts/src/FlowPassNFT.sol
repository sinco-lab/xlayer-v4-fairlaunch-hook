// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFlowPassNFT} from "./interfaces/IFlowPassNFT.sol";

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract FlowPassNFT is ERC721, Ownable, IFlowPassNFT {
    uint256 internal constant FIRST_TOKEN_ID = 1;
    uint8 public constant MAX_TIER = 4;
    string internal constant IMAGE_TIER_ONE = "ipfs://bafybeibdkwlmm3zekqtaqog3ldx2vd2hukyfde52muuc2qpjbrxnkssv34";
    string internal constant IMAGE_TIER_TWO = "ipfs://bafybeibdsa6zr3ggekgs2b5icwabo2sqohwh6laqjfhiexkyzu3kfrw27q";
    string internal constant IMAGE_TIER_THREE = "ipfs://bafybeicpv6u4coalfvggg6uusxg54zdwh5f5ltyh2hftx7avg3ltijua3i";
    string internal constant IMAGE_TIER_FOUR = "ipfs://bafybeibz5llct6lce4vge4q2wwc5ku2o33z4eastdtjcecntch5umagqlu";

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

    function imageURIForTier(uint8 tier) public pure returns (string memory) {
        if (tier == 1) return IMAGE_TIER_ONE;
        if (tier == 2) return IMAGE_TIER_TWO;
        if (tier == 3) return IMAGE_TIER_THREE;
        if (tier == 4) return IMAGE_TIER_FOUR;
        revert InvalidTier();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint8 tier = tierOfToken[tokenId];
        string memory tierText = Strings.toString(tier);
        string memory metadata = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"FlowPass Tier ',
                    tierText,
                    '",',
                    '"description":"Soulbound FairFlow Launch reputation earned through qualifying post-launch trading behavior.",',
                    '"image":"',
                    imageURIForTier(tier),
                    '",',
                    '"attributes":[',
                    '{"trait_type":"Tier","value":',
                    tierText,
                    "},",
                    '{"trait_type":"Soulbound","value":"true"},',
                    '{"trait_type":"Product","value":"FairFlow Launch"}',
                    "]}"
                )
            )
        );

        return string.concat("data:application/json;base64,", metadata);
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

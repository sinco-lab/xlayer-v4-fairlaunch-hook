// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract FairLaunchToken is ERC20, Ownable {
    error AllocationLengthMismatch();
    error EmptyAllocation();
    error EmptyMetadataURI();
    error ZeroAllocationAddress();
    error ZeroAllocationAmount();

    string private _projectMetadataURI;

    event ProjectMetadataURISet(string uri);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address[] memory recipients,
        uint256[] memory amounts,
        string memory metadataURI_
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        if (bytes(metadataURI_).length == 0) revert EmptyMetadataURI();
        if (recipients.length == 0) revert EmptyAllocation();
        if (recipients.length != amounts.length) revert AllocationLengthMismatch();

        _projectMetadataURI = metadataURI_;
        emit ProjectMetadataURISet(metadataURI_);

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAllocationAddress();
            if (amounts[i] == 0) revert ZeroAllocationAmount();
            _mint(recipients[i], amounts[i]);
        }
    }

    function projectMetadataURI() external view returns (string memory) {
        return _projectMetadataURI;
    }

    function setProjectMetadataURI(string calldata nextURI) external onlyOwner {
        if (bytes(nextURI).length == 0) revert EmptyMetadataURI();
        _projectMetadataURI = nextURI;
        emit ProjectMetadataURISet(nextURI);
    }
}

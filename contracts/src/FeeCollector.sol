// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FeeCollector
/// @notice Treasury for protocol fees and optional gas sponsorship (USDC).
contract FeeCollector is Ownable {
    IERC20 public immutable usdc;

    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address usdcToken) Ownable(msg.sender) {
        require(usdcToken != address(0), "FeeCollector: zero token");
        usdc = IERC20(usdcToken);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "FeeCollector: zero recipient");
        require(usdc.transfer(to, amount), "FeeCollector: transfer failed");
        emit FeesWithdrawn(to, amount);
    }
}

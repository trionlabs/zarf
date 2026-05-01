// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC20
/// @notice Minimal ERC20 interface for transfer operations
/// @dev Used by ZarfVesting and ZarfVestingFactory for token transfers
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZarfVesting} from "./ZarfVesting.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title ZarfVestingFactory
/// @notice Factory for deploying fully-initialized vesting contracts in minimal transactions
/// @dev Reduces deployment from 6 TX to 2 TX (approve + createAndFundVesting)
/// @author Zarf Team
contract ZarfVestingFactory {
    // ============ Events ============
    
    /// @notice Emitted when a new vesting contract is created
    /// @param vesting Address of the deployed vesting contract
    /// @param owner Address that will own the vesting contract
    /// @param token Token being vested
    /// @param totalAmount Total tokens allocated
    /// @param recipientCount Number of recipients in the distribution
    event VestingCreated(
        address indexed vesting,
        address indexed owner,
        address indexed token,
        uint256 totalAmount,
        uint256 recipientCount
    );

    // ============ Errors ============
    
    error ArrayLengthMismatch();
    error ZeroAllocations();
    error TransferFailed();

    // ============ Immutables ============
    
    /// @notice The verifier contract used for ZK proofs
    address public immutable verifier;
    
    /// @notice The JWK registry for OAuth key verification
    address public immutable jwkRegistry;

    // ============ State ============
    
    /// @notice All vesting contracts deployed through this factory
    address[] public deployments;
    
    /// @notice Mapping from owner address to their deployed vesting contracts
    mapping(address => address[]) public ownerDeployments;

    // ============ Constructor ============
    
    /// @param _verifier Address of the ZK verifier contract
    /// @param _jwkRegistry Address of the JWK registry contract
    constructor(address _verifier, address _jwkRegistry) {
        verifier = _verifier;
        jwkRegistry = _jwkRegistry;
    }

    // ============ Factory Functions ============

    /// @notice Create a vesting contract without funding (for two-step deployment)
    /// @dev Use this if you want to fund the contract separately, or test deployment
    /// @param token The ERC20 token to vest
    /// @param merkleRoot The merkle root for whitelist verification
    /// @param emailHashes Array of recipient email hashes (Pedersen hashes)
    /// @param amounts Array of allocation amounts (must match emailHashes length)
    /// @param cliffDuration Cliff duration in seconds before any tokens vest
    /// @param vestingDuration Total vesting duration in seconds (after cliff)
    /// @param vestingPeriod Duration of each unlock period in seconds
    /// @return vesting Address of the deployed vesting contract
    function createVesting(
        address token,
        bytes32 merkleRoot,
        bytes32[] calldata emailHashes,
        uint256[] calldata amounts,
        uint256 cliffDuration,
        uint256 vestingDuration,
        uint256 vestingPeriod
    ) external returns (address vesting) {
        // Validation
        if (emailHashes.length != amounts.length) revert ArrayLengthMismatch();
        if (emailHashes.length == 0) revert ZeroAllocations();

        // Deploy new vesting contract
        ZarfVesting vest = new ZarfVesting(token, verifier, jwkRegistry);
        
        // Initialize all parameters in one go
        vest.setMerkleRoot(merkleRoot);
        vest.setAllocations(emailHashes, amounts);
        vest.startVesting(cliffDuration, vestingDuration, vestingPeriod);
        
        // Transfer ownership to the caller
        vest.transferOwnership(msg.sender);
        
        // Track deployment
        vesting = address(vest);
        _trackDeployment(vesting, msg.sender);
        
        // Calculate total for event
        uint256 total = _sumAmounts(amounts);
        emit VestingCreated(vesting, msg.sender, token, total, emailHashes.length);
    }

    /// @notice Create AND fund a vesting contract in one transaction
    /// @dev Caller must have approved this factory to spend `depositAmount` tokens
    /// @param token The ERC20 token to vest
    /// @param merkleRoot The merkle root for whitelist verification
    /// @param emailHashes Array of recipient email hashes (Pedersen hashes)
    /// @param amounts Array of allocation amounts (must match emailHashes length)
    /// @param cliffDuration Cliff duration in seconds before any tokens vest
    /// @param vestingDuration Total vesting duration in seconds (after cliff)
    /// @param vestingPeriod Duration of each unlock period in seconds
    /// @param depositAmount Total tokens to transfer to the vesting contract
    /// @return vesting Address of the deployed vesting contract
    function createAndFundVesting(
        address token,
        bytes32 merkleRoot,
        bytes32[] calldata emailHashes,
        uint256[] calldata amounts,
        uint256 cliffDuration,
        uint256 vestingDuration,
        uint256 vestingPeriod,
        uint256 depositAmount
    ) external returns (address vesting) {
        // Validation
        if (emailHashes.length != amounts.length) revert ArrayLengthMismatch();
        if (emailHashes.length == 0) revert ZeroAllocations();

        // Deploy new vesting contract
        ZarfVesting vest = new ZarfVesting(token, verifier, jwkRegistry);
        
        // Initialize all parameters
        vest.setMerkleRoot(merkleRoot);
        vest.setAllocations(emailHashes, amounts);
        vest.startVesting(cliffDuration, vestingDuration, vestingPeriod);
        
        // Pull tokens from caller directly to the vesting contract
        // Caller must have approved THIS factory contract for depositAmount
        bool success = IERC20(token).transferFrom(msg.sender, address(vest), depositAmount);
        if (!success) revert TransferFailed();
        
        // Transfer ownership to the caller
        vest.transferOwnership(msg.sender);
        
        // Track deployment
        vesting = address(vest);
        _trackDeployment(vesting, msg.sender);
        
        emit VestingCreated(vesting, msg.sender, token, depositAmount, emailHashes.length);
    }

    // ============ View Functions ============
    
    /// @notice Get total number of vesting contracts deployed through this factory
    /// @return count Number of deployments
    function getDeploymentCount() external view returns (uint256 count) {
        return deployments.length;
    }
    
    /// @notice Get all vesting contracts deployed by a specific owner
    /// @param owner Address of the owner
    /// @return Array of vesting contract addresses
    function getOwnerDeployments(address owner) external view returns (address[] memory) {
        return ownerDeployments[owner];
    }
    
    /// @notice Get the number of vesting contracts for a specific owner
    /// @param owner Address of the owner
    /// @return count Number of deployments by this owner
    function getOwnerDeploymentCount(address owner) external view returns (uint256 count) {
        return ownerDeployments[owner].length;
    }

    // ============ Internal Functions ============
    
    /// @dev Track a new deployment in storage
    function _trackDeployment(address vesting, address owner) internal {
        deployments.push(vesting);
        ownerDeployments[owner].push(vesting);
    }
    
    /// @dev Sum all amounts in an array
    function _sumAmounts(uint256[] calldata amounts) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
    }
}

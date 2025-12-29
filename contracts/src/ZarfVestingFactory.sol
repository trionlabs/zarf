// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZarfVesting} from "./ZarfVesting.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title ZarfVestingFactory
/// @notice Factory for deploying fully-initialized vesting contracts in minimal transactions
/// @dev Reduces deployment from 6 TX to 2 TX (approve + createAndFundVesting)
/// @author Zarf Team
contract ZarfVestingFactory {
    // ============ Structs ============

    /// @notice Parameters for creating a vesting contract (avoids stack too deep)
    struct CreateVestingParams {
        string name;              // Human-readable name
        string description;       // Description or category
        address token;            // ERC20 token to vest
        bytes32 merkleRoot;       // Merkle root for whitelist verification
        bytes32[] emailHashes;    // Array of recipient email hashes
        uint256[] amounts;        // Array of allocation amounts
        uint256 cliffDuration;    // Cliff duration in seconds
        uint256 vestingDuration;  // Total vesting duration in seconds
        uint256 vestingPeriod;    // Duration of each unlock period in seconds
    }

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
    /// @param params Struct containing all vesting parameters
    /// @return vesting Address of the deployed vesting contract
    function createVesting(CreateVestingParams calldata params) external returns (address vesting) {
        // Validation
        if (params.emailHashes.length != params.amounts.length) revert ArrayLengthMismatch();
        if (params.emailHashes.length == 0) revert ZeroAllocations();

        // Deploy new vesting contract with metadata
        ZarfVesting vest = new ZarfVesting(
            params.name,
            params.description,
            params.token,
            verifier,
            jwkRegistry
        );
        
        // Initialize all parameters in one go
        vest.setMerkleRoot(params.merkleRoot);
        vest.setAllocations(params.emailHashes, params.amounts);
        vest.startVesting(params.cliffDuration, params.vestingDuration, params.vestingPeriod);
        
        // Transfer ownership to the caller
        vest.transferOwnership(msg.sender);
        
        // Track deployment
        vesting = address(vest);
        _trackDeployment(vesting, msg.sender);
        
        // Calculate total for event
        uint256 total = _sumAmounts(params.amounts);
        emit VestingCreated(vesting, msg.sender, params.token, total, params.emailHashes.length);
    }

    /// @notice Create AND fund a vesting contract in one transaction
    /// @dev Caller must have approved this factory to spend `depositAmount` tokens
    /// @param params Struct containing all vesting parameters
    /// @param depositAmount Total tokens to transfer to the vesting contract
    /// @return vesting Address of the deployed vesting contract
    function createAndFundVesting(
        CreateVestingParams calldata params,
        uint256 depositAmount
    ) external returns (address vesting) {
        // Validation
        if (params.emailHashes.length != params.amounts.length) revert ArrayLengthMismatch();
        if (params.emailHashes.length == 0) revert ZeroAllocations();

        // Deploy new vesting contract with metadata
        ZarfVesting vest = new ZarfVesting(
            params.name,
            params.description,
            params.token,
            verifier,
            jwkRegistry
        );
        
        // Initialize all parameters
        vest.setMerkleRoot(params.merkleRoot);
        vest.setAllocations(params.emailHashes, params.amounts);
        vest.startVesting(params.cliffDuration, params.vestingDuration, params.vestingPeriod);
        
        // Pull tokens from caller directly to the vesting contract
        // Caller must have approved THIS factory contract for depositAmount
        bool success = IERC20(params.token).transferFrom(msg.sender, address(vest), depositAmount);
        if (!success) revert TransferFailed();
        
        // Transfer ownership to the caller
        vest.transferOwnership(msg.sender);
        
        // Track deployment
        vesting = address(vest);
        _trackDeployment(vesting, msg.sender);
        
        emit VestingCreated(vesting, msg.sender, params.token, depositAmount, params.emailHashes.length);
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

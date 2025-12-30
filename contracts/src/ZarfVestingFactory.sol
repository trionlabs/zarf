// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZarfVesting} from "./ZarfVesting.sol";
import {IERC20} from "./interfaces/IERC20.sol";

/// @title ZarfVestingFactory
/// @notice Factory for deploying fully-initialized vesting contracts in minimal transactions
/// @dev Reduces deployment from 6 TX to 2 TX (approve + createAndFundVesting). Uses CREATE2 for deterministic addresses.
/// @author Zarf Team
contract ZarfVestingFactory {
    // ============ Structs ============

    /// @notice Parameters for creating a vesting contract
    struct CreateVestingParams {
        string name;              // Human-readable name
        string description;       // Description or category
        address token;            // ERC20 token to vest
        bytes32 merkleRoot;       // Merkle root for whitelist verification
        // ADR-012: Changed from emailHashes to commitments for privacy
        bytes32[] commitments;    // Array of identity commitments (Pedersen(emailHash, secretHash))
        uint256[] amounts;        // Array of allocation amounts
        uint256 cliffDuration;    // Cliff duration in seconds
        uint256 vestingDuration;  // Total vesting duration in seconds
        uint256 vestingPeriod;    // Duration of each unlock period in seconds
    }

    // ============ Events ============
    
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
    error DeploymentFailed();

    // ============ Immutables ============
    
    address public immutable verifier;
    address public immutable jwkRegistry;

    // ============ State ============
    
    address[] public deployments;
    mapping(address => address[]) public ownerDeployments;

    // ============ Constructor ============
    
    constructor(address _verifier, address _jwkRegistry) {
        verifier = _verifier;
        jwkRegistry = _jwkRegistry;
    }

    // ============ Factory Functions ============

    /// @notice Create AND fund a vesting contract in one transaction
    /// @dev Caller must have approved this factory to spend `totalAmount` tokens
    function createAndFundVesting(
        CreateVestingParams calldata params,
        uint256 totalAmount
    ) external returns (address vesting) {
        if (params.commitments.length != params.amounts.length) revert ArrayLengthMismatch();
        if (params.commitments.length == 0) revert ZeroAllocations();

        // 1. Pull tokens from caller (must be approved)
        // Use SafeTransferFrom
        _safeTransferFrom(params.token, msg.sender, address(this), totalAmount);
        
        // 2. Predict address for approve
        address predictedAddress = _predictAddress(params, msg.sender);
        
        // 3. Deploy using CREATE2 (deterministic) and Initialize
        vesting = _deployAndInitialize(params, msg.sender);
        
        // 4. Check address match (sanity check)
        if (vesting != predictedAddress) revert DeploymentFailed();
        
        // 5. Fund the contract (Push from Factory)
        // Use SafeTransfer
        _safeTransfer(params.token, vesting, totalAmount);
        
        // 6. Track deployment
        _trackDeployment(vesting, msg.sender);
        
        emit VestingCreated(vesting, msg.sender, params.token, totalAmount, params.commitments.length);
    }
    
    function createVesting(CreateVestingParams calldata params) external returns (address vesting) {
         if (params.commitments.length != params.amounts.length) revert ArrayLengthMismatch();
         if (params.commitments.length == 0) revert ZeroAllocations();
         vesting = _deployAndInitialize(params, msg.sender);
         _trackDeployment(vesting, msg.sender);
         uint256 total = _sumAmounts(params.amounts);
         emit VestingCreated(vesting, msg.sender, params.token, total, params.commitments.length);
    }

    // ============ Internal Deployment Logic ============

    function _deployAndInitialize(CreateVestingParams calldata params, address owner) internal returns (address) {
        // 1. Calculate Salt
        bytes32 salt = keccak256(abi.encode(params));
        
        // 2. Deploy (Constructor args: verifier, jwkRegistry)
        ZarfVesting vest = new ZarfVesting{salt: salt}(
            verifier,
            jwkRegistry
        );
        
        // 3. Initialize Base (Factory becomes owner)
        // Using address(this) as owner temporarily so we can call setters
        vest.initialize(address(this), params.token, params.name, params.description);
        
        // 4. Set Allocations
        vest.setAllocations(params.commitments, params.amounts);
        
        // 5. Set Merkle Root
        vest.setMerkleRoot(params.merkleRoot);
        
        // 6. Start Vesting
        vest.startVesting(params.cliffDuration, params.vestingDuration, params.vestingPeriod);
        
        // 7. Transfer Ownership to real owner
        vest.transferOwnership(owner);
        
        return address(vest);
    }

    function _predictAddress(
        CreateVestingParams calldata params, 
        address owner
    ) internal view returns (address) {
        // Constructor args used for deployment
        bytes memory args = abi.encode(
            verifier,
            jwkRegistry
        );
        
        // Salt calculation
        bytes32 salt = keccak256(abi.encode(params));
        
        bytes32 bytecodeHash = keccak256(abi.encodePacked(
            type(ZarfVesting).creationCode,
            args
        ));

        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            bytecodeHash
        )))));
    }

    // ============ View Functions ============
    
    function predictVestingAddress(
        CreateVestingParams calldata params,
        address owner
    ) external view returns (address) {
        return _predictAddress(params, owner);
    }

    function getDeploymentCount() external view returns (uint256 count) {
        return deployments.length;
    }
    
    function getOwnerDeployments(address owner) external view returns (address[] memory) {
        return ownerDeployments[owner];
    }
    
    function getOwnerDeploymentCount(address owner) external view returns (uint256 count) {
        return ownerDeployments[owner].length;
    }

    // ============ Internal Utils ============
    
    function _trackDeployment(address vesting, address owner) internal {
        deployments.push(vesting);
        ownerDeployments[owner].push(vesting);
    }
    
    function _sumAmounts(uint256[] calldata amounts) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
    }

    // ============ Safe Transfer Utils ============

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFailed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFailed");
    }
}

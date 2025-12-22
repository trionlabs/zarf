// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {JWKRegistry} from "./JWKRegistry.sol";

/// @title ZarfVesting
/// @notice Vesting contract with ZK proof-based claims
/// @dev Users prove email ownership via ZK proof to claim vested tokens
contract ZarfVesting {
    // ============ Errors ============
    error InvalidProof();
    error InvalidMerkleRoot();
    error InvalidRecipient();
    error InvalidPubkey();
    error NothingToClaim();
    error AllocationAlreadySet();
    error VestingNotStarted();
    error Unauthorized();
    error InvalidAllocation();
    error TransferFailed();

    // ============ Events ============
    event AllocationSet(bytes32 indexed emailHash, uint256 amount);
    event Claimed(bytes32 indexed emailHash, address indexed recipient, uint256 amount);
    event VestingStarted(uint256 startTime, uint256 cliffDuration, uint256 vestingDuration);
    event MerkleRootSet(bytes32 merkleRoot);
    event Deposited(uint256 amount);

    // ============ Constants ============
    /// @notice Number of pubkey limbs in public inputs (RSA-2048 = 18 limbs of 120 bits)
    uint256 public constant PUBKEY_LIMBS = 18;

    // ============ State ============
    IERC20 public immutable token;
    IVerifier public immutable verifier;
    JWKRegistry public immutable jwkRegistry;
    address public owner;

    bytes32 public merkleRoot;
    uint256 public vestingStart;
    uint256 public cliffDuration;
    uint256 public vestingDuration;

    // emailHash => total allocation
    mapping(bytes32 => uint256) public allocations;
    // emailHash => claimed amount
    mapping(bytes32 => uint256) public claimed;

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============ Constructor ============
    constructor(address _token, address _verifier, address _jwkRegistry) {
        token = IERC20(_token);
        verifier = IVerifier(_verifier);
        jwkRegistry = JWKRegistry(_jwkRegistry);
        owner = msg.sender;
    }

    // ============ Admin Functions ============

    /// @notice Set the merkle root for proof verification
    /// @param _merkleRoot The merkle root from the whitelist
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }

    /// @notice Start the vesting schedule
    /// @param _cliffDuration Duration before any tokens vest (seconds)
    /// @param _vestingDuration Total vesting duration after cliff (seconds)
    function startVesting(uint256 _cliffDuration, uint256 _vestingDuration) external onlyOwner {
        vestingStart = block.timestamp;
        cliffDuration = _cliffDuration;
        vestingDuration = _vestingDuration;
        emit VestingStarted(block.timestamp, _cliffDuration, _vestingDuration);
    }

    /// @notice Set allocation for an email hash
    /// @param emailHash The pedersen hash of the email
    /// @param amount The total token allocation
    function setAllocation(bytes32 emailHash, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAllocation();
        allocations[emailHash] = amount;
        emit AllocationSet(emailHash, amount);
    }

    /// @notice Batch set allocations
    /// @param emailHashes Array of email hashes
    /// @param amounts Array of allocation amounts
    function setAllocations(bytes32[] calldata emailHashes, uint256[] calldata amounts) external onlyOwner {
        require(emailHashes.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < emailHashes.length; i++) {
            if (amounts[i] == 0) revert InvalidAllocation();
            allocations[emailHashes[i]] = amounts[i];
            emit AllocationSet(emailHashes[i], amounts[i]);
        }
    }

    /// @notice Deposit tokens for distribution
    /// @param amount Amount of tokens to deposit
    function deposit(uint256 amount) external onlyOwner {
        bool success = token.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        emit Deposited(amount);
    }

    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ============ User Functions ============

    /// @notice Claim vested tokens with ZK proof
    /// @param proof The ZK proof bytes
    /// @param publicInputs The public inputs (includes pubkey limbs, merkleRoot, emailHash, recipient)
    /// @dev publicInputs layout: [pubkey_modulus_limbs[0..17], merkleRoot, emailHash, recipient]
    ///      - First 18 elements: RSA pubkey modulus limbs (120 bits each)
    ///      - Element 18: merkleRoot
    ///      - Element 19: emailHash (return value 1 from circuit)
    ///      - Element 20: recipient (return value 2 from circuit)
    function claim(bytes calldata proof, bytes32[] calldata publicInputs) external {
        if (vestingStart == 0) revert VestingNotStarted();

        // Verify the ZK proof
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        // Verify pubkey is a trusted key (e.g., Google OAuth)
        // Copy first 18 public inputs (pubkey limbs) to memory and hash
        bytes32 keyHash;
        assembly {
            // Allocate 576 bytes (18 * 32) on the stack via scratch space
            let ptr := mload(0x40)
            // Copy each of the 18 pubkey limbs from calldata to memory
            for { let i := 0 } lt(i, 18) { i := add(i, 1) } {
                // publicInputs[i] - calldataload at offset + i*32
                let val := calldataload(add(publicInputs.offset, mul(i, 32)))
                mstore(add(ptr, mul(i, 32)), val)
            }
            keyHash := keccak256(ptr, 576)
        }
        if (!jwkRegistry.isValidKeyHash(keyHash)) revert InvalidPubkey();

        // Extract public inputs (last three elements after pubkey)
        // Layout: [pubkey[0..17], merkleRoot, emailHash, recipient]
        bytes32 proofMerkleRoot = publicInputs[PUBKEY_LIMBS]; // index 18
        bytes32 emailHash = publicInputs[PUBKEY_LIMBS + 1]; // index 19
        bytes32 proofRecipient = publicInputs[PUBKEY_LIMBS + 2]; // index 20

        // Verify merkle root matches
        if (proofMerkleRoot != merkleRoot) revert InvalidMerkleRoot();

        // Verify recipient matches msg.sender (prevents front-running)
        if (proofRecipient != bytes32(uint256(uint160(msg.sender)))) revert InvalidRecipient();

        // Calculate claimable amount
        uint256 vested = calculateVested(emailHash);
        uint256 claimable = vested - claimed[emailHash];

        if (claimable == 0) revert NothingToClaim();

        // Update claimed amount
        claimed[emailHash] += claimable;

        // Transfer tokens to caller
        bool success = token.transfer(msg.sender, claimable);
        if (!success) revert TransferFailed();

        emit Claimed(emailHash, msg.sender, claimable);
    }

    // ============ View Functions ============

    /// @notice Calculate vested amount for an email hash
    /// @param emailHash The email hash to check
    /// @return The vested amount
    function calculateVested(bytes32 emailHash) public view returns (uint256) {
        uint256 allocation = allocations[emailHash];
        if (allocation == 0) return 0;
        if (vestingStart == 0) return 0;

        uint256 elapsed = block.timestamp - vestingStart;

        // Before cliff: nothing vested
        if (elapsed < cliffDuration) {
            return 0;
        }

        // After cliff + vesting: fully vested
        if (elapsed >= cliffDuration + vestingDuration) {
            return allocation;
        }

        // During vesting: linear
        uint256 vestedTime = elapsed - cliffDuration;
        return (allocation * vestedTime) / vestingDuration;
    }

    /// @notice Get claimable amount for an email hash
    /// @param emailHash The email hash to check
    /// @return The claimable amount
    function getClaimable(bytes32 emailHash) external view returns (uint256) {
        return calculateVested(emailHash) - claimed[emailHash];
    }

    /// @notice Get vesting info
    /// @return start The vesting start timestamp
    /// @return cliff The cliff duration
    /// @return duration The vesting duration
    function getVestingInfo() external view returns (uint256 start, uint256 cliff, uint256 duration) {
        return (vestingStart, cliffDuration, vestingDuration);
    }
}

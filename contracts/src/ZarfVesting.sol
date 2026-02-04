// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {JWKRegistry} from "./JWKRegistry.sol";

/// @title ZarfVesting
/// @notice Vesting contract with ZK proof-based claims and Discrete Vesting (ADR-023)
/// @dev Implements private, unlinkable, per-epoch claiming logic
contract ZarfVesting {
    // ============ Errors ============
    error InvalidProof();
    error InvalidMerkleRoot();
    error InvalidRecipient();
    error InvalidPubkey();
    error AlreadyClaimed();
    error EpochLocked();
    error Unauthorized();
    error TransferFailed();
    error AlreadyInitialized();

    // ============ Events ============
    event Claimed(bytes32 indexed epochCommitment, address indexed recipient, uint256 amount);
    event MerkleRootSet(bytes32 merkleRoot);
    event Deposited(uint256 amount);
    event Initialized(address token, address owner);

    // ============ Constants ============
    uint256 public constant PUBKEY_LIMBS = 18;

    // ============ Metadata ============
    string public name;
    string public description;

    // ============ State ============
    IERC20 public token;
    IVerifier public immutable verifier;
    JWKRegistry public immutable jwkRegistry;
    address public owner;
    bool public initialized;

    bytes32 public merkleRoot;

    // ADR-023: Nullifiers track claimed epochs to prevent double-spending
    // Key is the 'epochCommitment' (derived from MasterSalt + EpochIndex)
    mapping(bytes32 => bool) public nullifiers;

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _verifier,
        address _jwkRegistry
    ) {
        verifier = IVerifier(_verifier);
        jwkRegistry = JWKRegistry(_jwkRegistry);
    }

    // ============ Initialization ============
    /// @dev Atomic initialization to avoid stack too deep errors with large structs
    function initialize(
        address _owner,
        address _token,
        string memory _name,
        string memory _description
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;

        owner = _owner; // Factory becomes owner temporarily
        token = IERC20(_token);
        name = _name;
        description = _description;
        
        emit Initialized(_token, _owner);
    }

    // ============ Admin Functions ============

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }

    function deposit(uint256 amount) external onlyOwner {
        safeTransferFrom(token, msg.sender, address(this), amount);
        emit Deposited(amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ============ User Functions ============

    function claim(bytes calldata proof, bytes32[] calldata publicInputs) external {
        // 1. Verify ZK Proof
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        // 2. Validate Google JWK Public Key
        bytes32 keyHash;
        assembly {
            let ptr := mload(0x40)
            for { let i := 0 } lt(i, 18) { i := add(i, 1) } {
                let val := calldataload(add(publicInputs.offset, mul(i, 32)))
                mstore(add(ptr, mul(i, 32)), val)
            }
            keyHash := keccak256(ptr, 576)
        }
        if (!jwkRegistry.isValidKeyHash(keyHash)) revert InvalidPubkey();

        // 3. Extract and Validate Public Inputs
        // Layout: [PubKey(18), Root(1), UnlockTime(1), Commitment(1), Recipient(1), Amount(1)]
        
        bytes32 proofMerkleRoot = publicInputs[PUBKEY_LIMBS];
        uint256 unlockTime = uint256(publicInputs[PUBKEY_LIMBS + 1]); 
        bytes32 epochCommitment = publicInputs[PUBKEY_LIMBS + 2];
        bytes32 proofRecipient = publicInputs[PUBKEY_LIMBS + 3];
        uint256 amount = uint256(publicInputs[PUBKEY_LIMBS + 4]);

        // 4. Integrity Checks
        if (proofMerkleRoot != merkleRoot) revert InvalidMerkleRoot();
        if (proofRecipient != bytes32(uint256(uint160(msg.sender)))) revert InvalidRecipient();
        
        // 5. Time-Lock Check (ADR-023: Discrete Vesting)
        // UnlockTime is bound to the leaf hash, so user cannot fake it without breaking the proof
        if (block.timestamp < unlockTime) revert EpochLocked();

        // 6. Double-Spend Check
        if (nullifiers[epochCommitment]) revert AlreadyClaimed();

        // 7. Mark as Claimed
        nullifiers[epochCommitment] = true;
        
        // 8. Transfer Tokens
        safeTransfer(token, msg.sender, amount);

        emit Claimed(epochCommitment, msg.sender, amount);
    }

    // ============ View Functions ============

    /// @notice Check if a specific epoch commitment has been claimed
    function isClaimed(bytes32 epochCommitment) external view returns (bool) {
        return nullifiers[epochCommitment];
    }

    // ============ Internal Utils (SafeTransfer) ============

    function safeTransfer(IERC20 _token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(_token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFailed");
    }

    function safeTransferFrom(IERC20 _token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(_token).call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFailed");
    }
}

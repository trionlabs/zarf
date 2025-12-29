// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "./interfaces/IVerifier.sol";
import {JWKRegistry} from "./JWKRegistry.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

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
    error AlreadyInitialized();

    // ============ Events ============
    event AllocationSet(bytes32 indexed emailHash, uint256 amount);
    event Claimed(bytes32 indexed emailHash, address indexed recipient, uint256 amount);
    event VestingStarted(uint256 startTime, uint256 cliffDuration, uint256 vestingDuration, uint256 vestingPeriod);
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
    uint256 public vestingStart;
    uint256 public cliffDuration;
    uint256 public vestingDuration;
    uint256 public vestingPeriod;

    mapping(bytes32 => uint256) public allocations;
    mapping(bytes32 => uint256) public claimed;

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

    function startVesting(uint256 _cliffDuration, uint256 _vestingDuration, uint256 _vestingPeriod) external onlyOwner {
        require(_vestingPeriod > 0, "Period must be > 0");
        require(_vestingDuration >= _vestingPeriod, "Duration must be >= period");
        
        vestingStart = block.timestamp;
        
        cliffDuration = _cliffDuration;
        vestingDuration = _vestingDuration;
        vestingPeriod = _vestingPeriod;
        emit VestingStarted(block.timestamp, _cliffDuration, _vestingDuration, _vestingPeriod);
    }

    function setAllocation(bytes32 emailHash, uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAllocation();
        allocations[emailHash] = amount;
        emit AllocationSet(emailHash, amount);
    }

    function setAllocations(bytes32[] calldata emailHashes, uint256[] calldata amounts) external onlyOwner {
        require(emailHashes.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < emailHashes.length; i++) {
            if (amounts[i] == 0) revert InvalidAllocation();
            allocations[emailHashes[i]] = amounts[i];
            emit AllocationSet(emailHashes[i], amounts[i]);
        }
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
        if (vestingStart == 0) revert VestingNotStarted();
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

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

        bytes32 proofMerkleRoot = publicInputs[PUBKEY_LIMBS];
        bytes32 emailHash = publicInputs[PUBKEY_LIMBS + 1];
        bytes32 proofRecipient = publicInputs[PUBKEY_LIMBS + 2];

        if (proofMerkleRoot != merkleRoot) revert InvalidMerkleRoot();
        if (proofRecipient != bytes32(uint256(uint160(msg.sender)))) revert InvalidRecipient();

        uint256 vested = calculateVested(emailHash);
        uint256 claimable = vested - claimed[emailHash];
        if (claimable == 0) revert NothingToClaim();

        claimed[emailHash] += claimable;
        
        safeTransfer(token, msg.sender, claimable);

        emit Claimed(emailHash, msg.sender, claimable);
    }

    // ============ View Functions ============

    function calculateVested(bytes32 emailHash) public view returns (uint256) {
        uint256 allocation = allocations[emailHash];
        if (allocation == 0) return 0;
        if (vestingStart == 0) return 0;

        uint256 elapsed = block.timestamp - vestingStart;
        if (elapsed < cliffDuration) return 0;
        if (elapsed >= cliffDuration + vestingDuration) return allocation;

        uint256 vestedTime = elapsed - cliffDuration;
        uint256 completedPeriods = vestedTime / vestingPeriod;
        uint256 totalPeriods = vestingDuration / vestingPeriod;
        
        if (totalPeriods == 0) return allocation;
        return (allocation * completedPeriods) / totalPeriods;
    }

    function getClaimable(bytes32 emailHash) external view returns (uint256) {
        return calculateVested(emailHash) - claimed[emailHash];
    }

    function getVestingInfo() external view returns (uint256 start, uint256 cliff, uint256 duration, uint256 period) {
        return (vestingStart, cliffDuration, vestingDuration, vestingPeriod);
    }

    function getUnlockProgress() external view returns (uint256 completed, uint256 total) {
        if (vestingStart == 0 || vestingPeriod == 0) return (0, 0);
        
        uint256 elapsed = block.timestamp - vestingStart;
        if (elapsed < cliffDuration) return (0, vestingDuration / vestingPeriod);
        
        uint256 vestedTime = elapsed - cliffDuration;
        uint256 completedPeriods = vestedTime / vestingPeriod;
        uint256 totalPeriods = vestingDuration / vestingPeriod;
        
        if (completedPeriods > totalPeriods) completedPeriods = totalPeriods;
        return (completedPeriods, totalPeriods);
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

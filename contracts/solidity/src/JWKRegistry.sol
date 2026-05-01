// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title JWKRegistry
/// @notice On-chain registry of trusted RSA public keys (e.g., Google OAuth)
/// @dev Stores RSA-2048 modulus as 18 limbs of 120 bits each (matching noir-jwt format)
contract JWKRegistry {
    // ============ Errors ============
    error Unauthorized();
    error InvalidKeyLength();
    error KeyNotFound();

    // ============ Events ============
    event KeyRegistered(bytes32 indexed keyHash, string kid);
    event KeyRevoked(bytes32 indexed keyHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ Constants ============
    /// @notice Number of 120-bit limbs for RSA-2048 modulus
    uint256 public constant PUBKEY_LIMBS = 18;

    // ============ State ============
    address public owner;

    /// @notice Mapping from key hash to registration status
    /// @dev keyHash = keccak256(abi.encodePacked(limbs))
    mapping(bytes32 => bool) public isRegisteredKey;

    /// @notice Mapping from kid (key ID) to key hash for lookup
    mapping(string => bytes32) public kidToKeyHash;

    /// @notice Array of all registered key hashes for enumeration
    bytes32[] public registeredKeys;

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============ Constructor ============
    constructor() {
        owner = msg.sender;
    }

    // ============ Admin Functions ============

    /// @notice Register a new RSA public key
    /// @param kid The key ID from the JWK (e.g., Google's kid)
    /// @param pubkeyLimbs The 18 limbs of the RSA modulus (120 bits each, little-endian)
    function registerKey(string calldata kid, bytes32[18] calldata pubkeyLimbs) external onlyOwner {
        bytes32 keyHash = keccak256(abi.encodePacked(pubkeyLimbs));

        if (!isRegisteredKey[keyHash]) {
            isRegisteredKey[keyHash] = true;
            kidToKeyHash[kid] = keyHash;
            registeredKeys.push(keyHash);
        }

        emit KeyRegistered(keyHash, kid);
    }

    /// @notice Revoke a registered key
    /// @param keyHash The hash of the key to revoke
    function revokeKey(bytes32 keyHash) external onlyOwner {
        if (!isRegisteredKey[keyHash]) revert KeyNotFound();

        isRegisteredKey[keyHash] = false;
        emit KeyRevoked(keyHash);
    }

    /// @notice Transfer ownership
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ============ View Functions ============

    /// @notice Check if a key hash is registered (gas-optimized)
    /// @param keyHash The keccak256 hash of the pubkey limbs
    /// @return True if the key is registered and not revoked
    function isValidKeyHash(bytes32 keyHash) external view returns (bool) {
        return isRegisteredKey[keyHash];
    }

    /// @notice Check if a pubkey (as limbs from proof) is registered
    /// @param pubkeyLimbs The 18 limbs from the ZK proof's public inputs
    /// @return True if the key is registered and not revoked
    function isValidKey(bytes32[18] calldata pubkeyLimbs) external view returns (bool) {
        bytes32 keyHash = keccak256(abi.encodePacked(pubkeyLimbs));
        return isRegisteredKey[keyHash];
    }

    /// @notice Compute key hash from limbs (useful for verification)
    /// @param pubkeyLimbs The 18 limbs of the RSA modulus
    /// @return The keccak256 hash of the limbs
    function computeKeyHash(bytes32[18] calldata pubkeyLimbs) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(pubkeyLimbs));
    }

    /// @notice Get the number of registered keys
    /// @return The count of registered keys (including revoked)
    function getRegisteredKeyCount() external view returns (uint256) {
        return registeredKeys.length;
    }

    /// @notice Check if a key ID is registered
    /// @param kid The key ID to check
    /// @return True if the kid has a registered key
    function isKidRegistered(string calldata kid) external view returns (bool) {
        bytes32 keyHash = kidToKeyHash[kid];
        return keyHash != bytes32(0) && isRegisteredKey[keyHash];
    }
}

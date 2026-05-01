// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockHonkVerifier
/// @notice TEST ONLY - Always returns true for any proof
/// @dev DO NOT USE IN PRODUCTION - This is for integration testing only
/// The real HonkVerifier is 32KB which exceeds EVM's 24KB limit.
/// For production, consider: L2 deployment, verifier splitting, or recursive proofs.
contract MockHonkVerifier {
    /// @notice Returns true for any proof - FOR TESTING ONLY
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

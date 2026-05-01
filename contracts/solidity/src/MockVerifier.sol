// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVerifier} from "./interfaces/IVerifier.sol";

/// @title MockVerifier
/// @notice Mock verifier that always returns true - for testing only
/// @dev Replace with real UltraHonk verifier in production
contract MockVerifier is IVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

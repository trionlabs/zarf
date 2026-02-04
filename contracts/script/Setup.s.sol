// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JWKRegistry} from "../src/JWKRegistry.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title Setup Script
/// @notice Registers test pubkey, sets merkle root, and configures vesting
contract SetupScript is Script {
    // Contract addresses from deployment
    address constant TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address constant JWK_REGISTRY = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    address constant VESTING = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;

    // Test data from fixtures
    bytes32 constant MERKLE_ROOT = 0x0d7ff9f493f7a01fc88d11714f630d0573faae3f862ddc12944b4e52cee86478;
    bytes32 constant EMAIL_HASH = 0x0e0831b9d4f5db98fab220b5f9af70836bfee0d501df4980f79952dfb69d2bb2;
    uint256 constant ALLOCATION = 1000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        JWKRegistry registry = JWKRegistry(JWK_REGISTRY);
        ZarfVesting vesting = ZarfVesting(VESTING);
        IERC20 token = IERC20(TOKEN);

        // 1. Register test pubkey
        bytes32[18] memory pubkeyLimbs = [
            bytes32(0x00000000000000000000000000000000001d35da9983bde00e628ef58bedc3fb),
            bytes32(0x000000000000000000000000000000000072fc9fafa1c7362f8e96beb1e94265),
            bytes32(0x0000000000000000000000000000000000724782ca2f5b393489c2d1f055118f),
            bytes32(0x000000000000000000000000000000000035c994ecacaeb1b26d35c2553d5cee),
            bytes32(0x000000000000000000000000000000000062d3cb6e542ccf4d72bf86a55e29ca),
            bytes32(0x000000000000000000000000000000000067bea2868de4dc17a99e8df2fc1db0),
            bytes32(0x00000000000000000000000000000000003195939e4774ab27176a63037422f3),
            bytes32(0x0000000000000000000000000000000000eb00cb1f8d833f1bae94c4cb57f4aa),
            bytes32(0x00000000000000000000000000000000000a557c203fd42c76cecf320dd64483),
            bytes32(0x0000000000000000000000000000000000e95bad34163e1b0ef3e6b93706fc34),
            bytes32(0x0000000000000000000000000000000000d617991eb25e09370ae12e3231689f),
            bytes32(0x000000000000000000000000000000000082ee86c3a384e3d35bfdfffae92147),
            bytes32(0x0000000000000000000000000000000000bf42a8f7d4e971b6d0c2113453b516),
            bytes32(0x0000000000000000000000000000000000a8984c8641401a3a50e8102761c0d5),
            bytes32(0x000000000000000000000000000000000039939849206e7c4207f37532c93f0c),
            bytes32(0x0000000000000000000000000000000000716de5bfee1406accfdcd619a4cda3),
            bytes32(0x0000000000000000000000000000000000b054e1ed43487bf5818606048dc3b1),
            bytes32(0x0000000000000000000000000000000000000000000000000000000000000095)
        ];
        registry.registerKey("test-key", pubkeyLimbs);
        console.log("Registered test pubkey");

        // Verify registration
        bytes32 keyHash = registry.computeKeyHash(pubkeyLimbs);
        console.log("Key hash:");
        console.logBytes32(keyHash);
        require(registry.isValidKeyHash(keyHash), "Key not registered");

        // 2. Set merkle root
        vesting.setMerkleRoot(MERKLE_ROOT);
        console.log("Set merkle root");

        // 3. Approve and deposit tokens (ADR-023: No setAllocation needed)
        token.approve(address(vesting), ALLOCATION);
        vesting.deposit(ALLOCATION);
        console.log("Deposited tokens:", ALLOCATION);

        // ADR-023: No startVesting needed - schedule is in Merkle leaves

        vm.stopBroadcast();

        console.log("\n=== Setup Complete ===");
        console.log("Vesting configured with discrete epochs (ADR-023)");
    }
}

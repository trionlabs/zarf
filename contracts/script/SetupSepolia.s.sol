// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JWKRegistry} from "../src/JWKRegistry.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title Setup Sepolia Script
/// @notice Registers real Google JWKs and sets up vesting for testing
contract SetupSepoliaScript is Script {
    function run() external {
        // Load addresses from environment
        address jwkRegistry = vm.envAddress("JWK_REGISTRY_ADDRESS");
        address vestingAddr = vm.envAddress("VESTING_ADDRESS");
        address tokenAddr = vm.envAddress("TOKEN_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        JWKRegistry registry = JWKRegistry(jwkRegistry);
        ZarfVesting vesting = ZarfVesting(vestingAddr);
        IERC20 token = IERC20(tokenAddr);

        // Register Google JWK #1: kid = 130fdcefcc8ed7be6bedfa6fc879722040c92b38
        // Fetched from https://www.googleapis.com/oauth2/v3/certs on 2025-12-21
        bytes32[18] memory googleKey1 = [
            bytes32(0x0000000000000000000000000000000000189f79bb5524c56cae11ddfd4fa95f),
            bytes32(0x000000000000000000000000000000000033595953752c157fedef3262fcde94),
            bytes32(0x0000000000000000000000000000000000a5caf3854a75f355f0f9c55ebf57dd),
            bytes32(0x0000000000000000000000000000000000a2dec5a3119f7194c493682a3b7f86),
            bytes32(0x0000000000000000000000000000000000e9a4489f26f519d76e241fa30c5a4d),
            bytes32(0x0000000000000000000000000000000000f4e757d352c1f69dac9578f55958bb),
            bytes32(0x0000000000000000000000000000000000014299053a2fc117881df1b30bf272),
            bytes32(0x0000000000000000000000000000000000158c75597d833d6942a20d319ddf7c),
            bytes32(0x00000000000000000000000000000000009d462410fc4ec012d9ca73ef1c5195),
            bytes32(0x00000000000000000000000000000000002b2c3109d41d6414bd0825a4b3c3d9),
            bytes32(0x0000000000000000000000000000000000ce8dfd494e2769b9d2d3c9e0c5864d),
            bytes32(0x00000000000000000000000000000000000298602128080fb055d7c539cf75fd),
            bytes32(0x00000000000000000000000000000000001fc915ba9fecb736ee27be7bbea966),
            bytes32(0x0000000000000000000000000000000000e1767d27befa2badb970416bbfc6d3),
            bytes32(0x0000000000000000000000000000000000d9e7ed80352ce4eb64464a19515df8),
            bytes32(0x0000000000000000000000000000000000ec8b98695ba53b03fd152e66f63bd4),
            bytes32(0x0000000000000000000000000000000000b2282a9b305e523724fa5961bb0255),
            bytes32(0x0000000000000000000000000000000000000000000000000000000000000090)
        ];
        registry.registerKey("130fdcefcc8ed7be6bedfa6fc879722040c92b38", googleKey1);
        console.log("Registered Google JWK: 130fdcefcc8ed7be6bedfa6fc879722040c92b38");

        // Register Google JWK #2: kid = 6a906ec119d7ba46a6a43ef1ea842e34a8ee08b4
        bytes32[18] memory googleKey2 = [
            bytes32(0x0000000000000000000000000000000000626cd88e3ba4b3a1c31ec7f85755fd),
            bytes32(0x0000000000000000000000000000000000fd019b100362c7f137274078b689f1),
            bytes32(0x0000000000000000000000000000000000988ccec15cd1174e4ab24d2c9c714b),
            bytes32(0x00000000000000000000000000000000001438fbb41b08aa4fe75706d915ea20),
            bytes32(0x000000000000000000000000000000000029f5ad4054014448a0c3fa4e15294f),
            bytes32(0x0000000000000000000000000000000000dc3bb5809abcc988899e8053985771),
            bytes32(0x00000000000000000000000000000000000a66eeeec909cafcd4af860b31a343),
            bytes32(0x00000000000000000000000000000000002e9bd8c9df3aa6f9bbef94cd0235fd),
            bytes32(0x00000000000000000000000000000000002d45aa1567c238e3f8b2b92307104f),
            bytes32(0x000000000000000000000000000000000043535f0907047c8a5b8fbc97978e3c),
            bytes32(0x00000000000000000000000000000000003446e05c69ffde2030ef569b722f74),
            bytes32(0x000000000000000000000000000000000012c149f99959ee62332f2d8dc72044),
            bytes32(0x0000000000000000000000000000000000d952ea177be3e48508c6d5df4e6953),
            bytes32(0x0000000000000000000000000000000000945bdb70ee9456c7a465683a888d2a),
            bytes32(0x0000000000000000000000000000000000940dc1fc09dcc7d6edf353cfff7f7e),
            bytes32(0x00000000000000000000000000000000007455b415dce3d723562cbc2e136b91),
            bytes32(0x000000000000000000000000000000000082081e9c64daadb811cacf77ebb826),
            bytes32(0x00000000000000000000000000000000000000000000000000000000000000db)
        ];
        registry.registerKey("6a906ec119d7ba46a6a43ef1ea842e34a8ee08b4", googleKey2);
        console.log("Registered Google JWK: 6a906ec119d7ba46a6a43ef1ea842e34a8ee08b4");

        // Set a test merkle root (replace with real one for production)
        // This is placeholder - user needs to compute merkle root from their allocation list
        bytes32 merkleRoot = bytes32(uint256(1)); // Placeholder
        vesting.setMerkleRoot(merkleRoot);
        console.log("Set placeholder merkle root");

        // Approve and deposit tokens for testing
        uint256 depositAmount = 10000 * 10 ** 18;
        token.approve(address(vesting), depositAmount);
        vesting.deposit(depositAmount);
        console.log("Deposited", depositAmount, "tokens");

        // Start vesting with 0 cliff, 1 year duration, 30-day period for monthly discrete unlocks
        vesting.startVesting(0, 365 days, 30 days);
        console.log("Started vesting with 30-day periodic unlocks");

        vm.stopBroadcast();

        console.log("\n=== Setup Complete ===");
        console.log("Google JWKs registered: 2");
        console.log("Tokens deposited:", depositAmount);
        console.log("NOTE: Replace merkle root with real allocations!");
    }
}

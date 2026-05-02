// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ZarfVestingFactory.sol";

/// @title DeployFactory
/// @notice Deploys ZarfVestingFactory to mainnet or testnet
/// @dev Run with: forge script script/DeployFactory.s.sol --rpc-url $RPC_URL --broadcast --verify
contract DeployFactory is Script {
    function run() external {
        // Load environment variables (VITE_-prefixed because frontend reads them too)
        address verifier = _envAddressWithFallback("VITE_VERIFIER_ADDRESS", "VERIFIER_ADDRESS");
        address jwkRegistry = _envAddressWithFallback("VITE_JWK_REGISTRY_ADDRESS", "JWK_REGISTRY_ADDRESS");

        console.log("Deploying ZarfVestingFactory...");
        console.log("  Verifier:", verifier);
        console.log("  JWK Registry:", jwkRegistry);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        ZarfVestingFactory factory = new ZarfVestingFactory(verifier, jwkRegistry);

        vm.stopBroadcast();

        console.log("  Factory deployed at:", address(factory));
        console.log("");
        console.log("Add to .env:");
        console.log("  VITE_FACTORY_ADDRESS=", address(factory));
    }

    function _envAddressWithFallback(
        string memory primaryName,
        string memory legacyName
    ) internal view returns (address) {
        address value = vm.envOr(primaryName, address(0));
        if (value != address(0)) return value;
        return vm.envAddress(legacyName);
    }
}

/// @title DeployFactoryWithMocks
/// @notice Deploys Factory with mock dependencies for testing
/// @dev Use for local development: forge script script/DeployFactory.s.sol:DeployFactoryWithMocks --rpc-url $RPC_URL --broadcast
contract DeployFactoryWithMocks is Script {
    function run() external {
        // For testing, we can use zero addresses or mock addresses
        // In production, these should be real deployed contracts
        address verifier = vm.envOr("VERIFIER_ADDRESS", address(0x97e072357E5D276605BBB203ae22D6A7f36C1727));
        address jwkRegistry = vm.envOr("JWK_REGISTRY_ADDRESS", address(0xDD41f435A7Be96A49322f6c33e8D93f276A83b43));

        console.log("Deploying ZarfVestingFactory (with env or defaults)...");
        console.log("  Verifier:", verifier);
        console.log("  JWK Registry:", jwkRegistry);

        vm.startBroadcast();

        ZarfVestingFactory factory = new ZarfVestingFactory(verifier, jwkRegistry);

        vm.stopBroadcast();

        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("Factory Address:", address(factory));
        console.log("");
        console.log("Frontend .env update:");
        console.log("VITE_FACTORY_ADDRESS_SEPOLIA=", address(factory));
    }
}

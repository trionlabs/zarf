// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JWKRegistry} from "../src/JWKRegistry.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";
import {HonkVerifier} from "../src/HonkVerifier.sol";
import {MockHonkVerifier} from "../src/MockHonkVerifier.sol";

/// @title Deploy Script for Zarf Vesting
/// @notice Deploys JWKRegistry, HonkVerifier, and ZarfVesting contracts
contract DeployScript is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy JWKRegistry
        JWKRegistry jwkRegistry = new JWKRegistry();
        console.log("JWKRegistry deployed at:", address(jwkRegistry));

        // 2. Deploy HonkVerifier
        HonkVerifier verifier = new HonkVerifier();
        console.log("HonkVerifier deployed at:", address(verifier));

        // 3. Deploy ZarfVesting
        ZarfVesting vesting = new ZarfVesting(
            tokenAddress,
            address(verifier),
            address(jwkRegistry)
        );
        console.log("ZarfVesting deployed at:", address(vesting));

        vm.stopBroadcast();

        // Output deployment info for frontend config
        console.log("\n=== Deployment Complete ===");
        console.log("Add these to your frontend .env:");
        console.log("VITE_JWK_REGISTRY_ADDRESS=", address(jwkRegistry));
        console.log("VITE_VERIFIER_ADDRESS=", address(verifier));
        console.log("VITE_VESTING_ADDRESS=", address(vesting));
    }
}

/// @title Deploy Script with Mock Token (for testnet)
/// @notice Deploys all contracts including a mock ERC20 token
contract DeployWithMockTokenScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock Token
        MockERC20 token = new MockERC20("Zarf Test Token", "ZARF", 18);
        console.log("MockERC20 deployed at:", address(token));

        // 2. Deploy JWKRegistry
        JWKRegistry jwkRegistry = new JWKRegistry();
        console.log("JWKRegistry deployed at:", address(jwkRegistry));

        // 3. Deploy HonkVerifier
        HonkVerifier verifier = new HonkVerifier();
        console.log("HonkVerifier deployed at:", address(verifier));

        // 4. Deploy ZarfVesting
        ZarfVesting vesting = new ZarfVesting(
            address(token),
            address(verifier),
            address(jwkRegistry)
        );
        console.log("ZarfVesting deployed at:", address(vesting));

        // 5. Mint tokens to deployer for testing
        token.mint(msg.sender, 1_000_000 * 10 ** 18);
        console.log("Minted 1M tokens to deployer");

        vm.stopBroadcast();

        // Output deployment info
        console.log("\n=== Deployment Complete ===");
        console.log("TOKEN_ADDRESS=", address(token));
        console.log("JWK_REGISTRY_ADDRESS=", address(jwkRegistry));
        console.log("VERIFIER_ADDRESS=", address(verifier));
        console.log("VESTING_ADDRESS=", address(vesting));
    }
}

/// @title Deploy Script with Mock Verifier (for testnet - bypasses code size limit)
/// @notice Uses MockHonkVerifier which always returns true - FOR TESTING ONLY
/// @dev The real HonkVerifier exceeds EVM's 24KB contract size limit
contract DeployTestnetScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock Token
        MockERC20 token = new MockERC20("Zarf Test Token", "ZARF", 18);
        console.log("MockERC20 deployed at:", address(token));

        // 2. Deploy JWKRegistry
        JWKRegistry jwkRegistry = new JWKRegistry();
        console.log("JWKRegistry deployed at:", address(jwkRegistry));

        // 3. Deploy MockHonkVerifier (TEST ONLY - always returns true!)
        MockHonkVerifier verifier = new MockHonkVerifier();
        console.log("MockHonkVerifier deployed at:", address(verifier));
        console.log("WARNING: Using MOCK verifier - proofs are NOT verified!");

        // 4. Deploy ZarfVesting
        ZarfVesting vesting = new ZarfVesting(
            address(token),
            address(verifier),
            address(jwkRegistry)
        );
        console.log("ZarfVesting deployed at:", address(vesting));

        // 5. Mint tokens to deployer for testing
        token.mint(msg.sender, 1_000_000 * 10 ** 18);
        console.log("Minted 1M tokens to deployer");

        vm.stopBroadcast();

        // Output deployment info
        console.log("\n=== TESTNET Deployment Complete ===");
        console.log("WARNING: MockHonkVerifier used - proofs NOT verified!");
        console.log("");
        console.log("TOKEN_ADDRESS=", address(token));
        console.log("JWK_REGISTRY_ADDRESS=", address(jwkRegistry));
        console.log("VERIFIER_ADDRESS=", address(verifier));
        console.log("VESTING_ADDRESS=", address(vesting));
    }
}

/// @title Simple Mock ERC20 for testing
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

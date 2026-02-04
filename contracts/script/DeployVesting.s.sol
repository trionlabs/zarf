// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";

contract DeployVestingScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        address token = vm.envAddress("VITE_ZRFT_TEST_TOKEN"); // Use Test Token
        address verifier = vm.envAddress("VITE_VERIFIER_ADDRESS");
        address registry = vm.envAddress("VITE_JWK_REGISTRY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Logic
        ZarfVesting vesting = new ZarfVesting(
            verifier,
            registry
        );

        // 2. Initialize
        vesting.initialize(
            deployer,
            token,
            "Zarf Vesting (Sepolia)",
            "Private Distribution via ZK"
        );

        console.log("ZarfVesting deployed at:", address(vesting));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TestToken.sol";

/**
 * @title DeployTestToken
 * @notice Deploys a test ERC20 token to Sepolia for wizard testing
 * @dev Usage: forge script script/DeployTestToken.s.sol --rpc-url sepolia --broadcast
 */
contract DeployTestToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy ZRFT token with 100K supply
        TestToken token = new TestToken(
            "ZRFTEST",      // name
            "ZRFT",         // symbol  
            100_000         // initial supply (100K tokens)
        );
        
        console.log("TestToken deployed at:", address(token));
        console.log("Name:", token.name());
        console.log("Symbol:", token.symbol());
        console.log("Total Supply:", token.totalSupply());
        console.log("Deployer Balance:", token.balanceOf(msg.sender));
        
        vm.stopBroadcast();
    }
}

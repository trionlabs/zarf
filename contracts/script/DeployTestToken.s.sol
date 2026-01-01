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
        address targetAddress = 0x822eEa13f8f91a2A6dFeD760393883dFAc0E3D87;
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy ZRFTST token with 1M supply
        TestToken token = new TestToken(
            "Zarf Test Token", // name
            "ZRFTST",         // symbol
            1_000_000         // initial supply (1M tokens)
        );
        
        // Transfer all tokens to the target address if the deployer is not the target
        if (msg.sender != targetAddress) {
            token.transfer(targetAddress, token.totalSupply());
        }
        
        console.log("TestToken deployed at:", address(token));
        console.log("Name:", token.name());
        console.log("Symbol:", token.symbol());
        console.log("Total Supply:", token.totalSupply());
        console.log("Target Balance:", token.balanceOf(targetAddress));
        
        vm.stopBroadcast();
    }
}

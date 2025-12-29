// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";

contract DeployVestingScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        ZarfVesting vesting = new ZarfVesting(
            "Manual Vesting Deploy",
            "Deployed via DeployVestingScript",
            0x5495C2F6975711f2ab78A146b106bde4FA1D69Fb, // token
            0x97e072357E5D276605BBB203ae22D6A7f36C1727, // NEW verifier (correct)
            0xDD41f435A7Be96A49322f6c33e8D93f276A83b43  // jwkRegistry
        );
        console.log("ZarfVesting deployed at:", address(vesting));

        vm.stopBroadcast();
    }
}

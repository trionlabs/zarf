// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZarfVestingFactory} from "../src/ZarfVestingFactory.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";
import {JWKRegistry} from "../src/JWKRegistry.sol";
import {MockVerifier} from "../src/MockVerifier.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ZarfVestingFactoryTest is Test {
    ZarfVestingFactory public factory;
    MockERC20 public token;
    MockVerifier public verifier;
    JWKRegistry public jwkRegistry;

    address public alice = address(0xA11CE);

    bytes32 public merkleRoot = bytes32(uint256(0xDEADBEEF));
    bytes32[] public commitments;
    uint256[] public amounts;

    string constant TEST_CID = "bafkreigh2akiscaildc6dlmvnqnwmkn4nsrxr3vexhvk5gajlfpsmthxxa";

    event VestingCreated(
        address indexed vesting,
        address indexed owner,
        address indexed token,
        uint256 totalAmount,
        uint256 recipientCount,
        string metadataCid
    );

    function setUp() public {
        verifier = new MockVerifier();
        jwkRegistry = new JWKRegistry();
        token = new MockERC20("Test", "TST", 1_000_000 ether);
        factory = new ZarfVestingFactory(address(verifier), address(jwkRegistry));

        commitments = new bytes32[](2);
        commitments[0] = bytes32(uint256(1));
        commitments[1] = bytes32(uint256(2));

        amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;
    }

    function _params(string memory cid) internal view returns (ZarfVestingFactory.CreateVestingParams memory) {
        return ZarfVestingFactory.CreateVestingParams({
            name: "Test",
            description: "Desc",
            token: address(token),
            merkleRoot: merkleRoot,
            commitments: commitments,
            amounts: amounts,
            cliffDuration: 0,
            vestingDuration: 365 days,
            vestingPeriod: 30 days,
            metadataCid: cid
        });
    }

    function test_CreateVesting_EmitsCidInEvent() public {
        // Predict address so we can match the event
        address predicted = factory.predictVestingAddress(_params(TEST_CID), address(this));

        vm.expectEmit(true, true, true, true);
        emit VestingCreated(predicted, address(this), address(token), 300 ether, 2, TEST_CID);

        factory.createVesting(_params(TEST_CID));
    }

    function test_CreateAndFundVesting_EmitsCidInEvent() public {
        address predicted = factory.predictVestingAddress(_params(TEST_CID), address(this));
        token.approve(address(factory), 300 ether);

        vm.expectEmit(true, true, true, true);
        emit VestingCreated(predicted, address(this), address(token), 300 ether, 2, TEST_CID);

        factory.createAndFundVesting(_params(TEST_CID), 300 ether);
    }

    function test_CreateVesting_AcceptsEmptyCid() public {
        address predicted = factory.predictVestingAddress(_params(""), address(this));

        vm.expectEmit(true, true, true, true);
        emit VestingCreated(predicted, address(this), address(token), 300 ether, 2, "");

        factory.createVesting(_params(""));
    }

    function test_CreateVesting_DifferentCidsProduceDifferentAddresses() public {
        // CID is part of CREATE2 salt, so it must affect the predicted address
        address a = factory.predictVestingAddress(_params("cid-a"), address(this));
        address b = factory.predictVestingAddress(_params("cid-b"), address(this));
        assertTrue(a != b, "different CIDs should produce different addresses");
    }

    function test_CreateVesting_DifferentOwnersProduceDifferentAddresses() public {
        address a = factory.predictVestingAddress(_params(TEST_CID), address(this));
        address b = factory.predictVestingAddress(_params(TEST_CID), alice);
        assertTrue(a != b, "different owners should produce different addresses");
    }
}

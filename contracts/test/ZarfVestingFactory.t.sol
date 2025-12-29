// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ZarfVestingFactory.sol";
import "../src/ZarfVesting.sol";
import "../src/TestToken.sol";
import "../src/MockVerifier.sol";
import "../src/JWKRegistry.sol";

contract ZarfVestingFactoryTest is Test {
    ZarfVestingFactory public factory;
    TestToken public token;
    MockVerifier public verifier;
    JWKRegistry public jwkRegistry;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    // Test data
    bytes32 public merkleRoot = bytes32(uint256(123456));
    bytes32[] public emailHashes;
    uint256[] public amounts;

    function setUp() public {
        // Deploy dependencies
        verifier = new MockVerifier();
        jwkRegistry = new JWKRegistry();
        
        // Deploy token with initial supply to this contract
        token = new TestToken("Test Token", "TEST", 10_000_000);
        
        // Deploy factory
        factory = new ZarfVestingFactory(address(verifier), address(jwkRegistry));

        // Setup test allocations
        emailHashes = new bytes32[](3);
        emailHashes[0] = bytes32(uint256(1));
        emailHashes[1] = bytes32(uint256(2));
        emailHashes[2] = bytes32(uint256(3));

        amounts = new uint256[](3);
        amounts[0] = 1000 ether;
        amounts[1] = 2000 ether;
        amounts[2] = 3000 ether;
        
        // Transfer some tokens to alice for testing
        token.transfer(alice, 1_000_000 ether);
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsImmutables() public view {
        assertEq(factory.verifier(), address(verifier));
        assertEq(factory.jwkRegistry(), address(jwkRegistry));
    }

    // ============ createVesting Tests ============

    function test_CreateVesting_DeploysContract() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,  // cliff
            365 days, // duration
            30 days   // period
        );

        // Verify contract was deployed
        assertTrue(vesting != address(0));
        assertTrue(vesting.code.length > 0);
    }

    function test_CreateVesting_SetsOwnership() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        // Caller should be the owner
        assertEq(ZarfVesting(vesting).owner(), owner);
    }

    function test_CreateVesting_SetsMerkleRoot() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        assertEq(ZarfVesting(vesting).merkleRoot(), merkleRoot);
    }

    function test_CreateVesting_SetsAllocations() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        // Verify allocations
        assertEq(ZarfVesting(vesting).allocations(emailHashes[0]), amounts[0]);
        assertEq(ZarfVesting(vesting).allocations(emailHashes[1]), amounts[1]);
        assertEq(ZarfVesting(vesting).allocations(emailHashes[2]), amounts[2]);
    }

    function test_CreateVesting_SetsVestingSchedule() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        ZarfVesting v = ZarfVesting(vesting);
        assertEq(v.cliffDuration(), 30 days);
        assertEq(v.vestingDuration(), 365 days);
        assertEq(v.vestingPeriod(), 30 days);
        assertTrue(v.vestingStart() > 0);
    }

    function test_CreateVesting_TracksDeployment() public {
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        assertEq(factory.getDeploymentCount(), 1);
        assertEq(factory.deployments(0), vesting);
        assertEq(factory.getOwnerDeployments(owner).length, 1);
        assertEq(factory.getOwnerDeployments(owner)[0], vesting);
    }

    function test_CreateVesting_EmitsEvent() public {
        uint256 totalAmount = amounts[0] + amounts[1] + amounts[2];

        // Record logs to capture the event
        vm.recordLogs();

        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days
        );

        // Get recorded logs
        Vm.Log[] memory logs = vm.getRecordedLogs();
        
        // Find VestingCreated event (last event in the call)
        bool eventFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            // VestingCreated event topic
            if (logs[i].topics[0] == keccak256("VestingCreated(address,address,address,uint256,uint256)")) {
                eventFound = true;
                // Verify indexed params from topics
                assertEq(address(uint160(uint256(logs[i].topics[1]))), vesting);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), owner);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), address(token));
                // Verify data params
                (uint256 emittedAmount, uint256 emittedCount) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(emittedAmount, totalAmount);
                assertEq(emittedCount, 3);
                break;
            }
        }
        assertTrue(eventFound, "VestingCreated event not found");
    }

    function test_CreateVesting_RevertOnArrayMismatch() public {
        uint256[] memory wrongAmounts = new uint256[](2);
        wrongAmounts[0] = 1000 ether;
        wrongAmounts[1] = 2000 ether;

        vm.expectRevert(ZarfVestingFactory.ArrayLengthMismatch.selector);
        factory.createVesting(
            address(token),
            merkleRoot,
            emailHashes,  // 3 items
            wrongAmounts, // 2 items
            30 days,
            365 days,
            30 days
        );
    }

    function test_CreateVesting_RevertOnEmptyArrays() public {
        bytes32[] memory emptyHashes = new bytes32[](0);
        uint256[] memory emptyAmounts = new uint256[](0);

        vm.expectRevert(ZarfVestingFactory.ZeroAllocations.selector);
        factory.createVesting(
            address(token),
            merkleRoot,
            emptyHashes,
            emptyAmounts,
            30 days,
            365 days,
            30 days
        );
    }

    // ============ createAndFundVesting Tests ============

    function test_CreateAndFundVesting_TransfersTokens() public {
        uint256 depositAmount = 6000 ether;
        
        // Approve factory
        token.approve(address(factory), depositAmount);

        uint256 balanceBefore = token.balanceOf(owner);

        address vesting = factory.createAndFundVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days,
            depositAmount
        );

        // Tokens should be in vesting contract
        assertEq(token.balanceOf(vesting), depositAmount);
        assertEq(token.balanceOf(owner), balanceBefore - depositAmount);
    }

    function test_CreateAndFundVesting_FullFlow() public {
        uint256 depositAmount = 6000 ether;
        token.approve(address(factory), depositAmount);

        address vesting = factory.createAndFundVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days,
            depositAmount
        );

        ZarfVesting v = ZarfVesting(vesting);

        // Verify everything is set
        assertEq(v.owner(), owner);
        assertEq(v.merkleRoot(), merkleRoot);
        assertEq(v.allocations(emailHashes[0]), amounts[0]);
        assertEq(v.cliffDuration(), 30 days);
        assertEq(token.balanceOf(vesting), depositAmount);
    }

    function test_CreateAndFundVesting_RevertOnInsufficientApproval() public {
        uint256 depositAmount = 6000 ether;
        
        // Only approve half
        token.approve(address(factory), depositAmount / 2);

        vm.expectRevert(); // Will revert on transferFrom
        factory.createAndFundVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days,
            depositAmount
        );
    }

    function test_CreateAndFundVesting_RevertOnInsufficientBalance() public {
        uint256 depositAmount = 6000 ether;
        
        // Approve from bob who has no tokens
        vm.startPrank(bob);
        token.approve(address(factory), depositAmount);

        vm.expectRevert(); // Will revert on transferFrom
        factory.createAndFundVesting(
            address(token),
            merkleRoot,
            emailHashes,
            amounts,
            30 days,
            365 days,
            30 days,
            depositAmount
        );
        vm.stopPrank();
    }

    // ============ Multi-Deployment Tests ============

    function test_MultipleDeployments_TrackedCorrectly() public {
        // Owner deploys 2
        address v1 = factory.createVesting(
            address(token), merkleRoot, emailHashes, amounts,
            30 days, 365 days, 30 days
        );
        address v2 = factory.createVesting(
            address(token), merkleRoot, emailHashes, amounts,
            60 days, 180 days, 30 days
        );

        // Alice deploys 1
        vm.prank(alice);
        address v3 = factory.createVesting(
            address(token), merkleRoot, emailHashes, amounts,
            0, 365 days, 7 days
        );

        // Verify counts
        assertEq(factory.getDeploymentCount(), 3);
        assertEq(factory.getOwnerDeploymentCount(owner), 2);
        assertEq(factory.getOwnerDeploymentCount(alice), 1);

        // Verify arrays
        assertEq(factory.deployments(0), v1);
        assertEq(factory.deployments(1), v2);
        assertEq(factory.deployments(2), v3);
        assertEq(factory.getOwnerDeployments(alice)[0], v3);
    }

    // ============ Large Allocation Tests ============

    function test_LargeAllocation_100Recipients() public {
        uint256 recipientCount = 100;
        bytes32[] memory largeHashes = new bytes32[](recipientCount);
        uint256[] memory largeAmounts = new uint256[](recipientCount);

        for (uint256 i = 0; i < recipientCount; i++) {
            largeHashes[i] = bytes32(uint256(i + 1));
            largeAmounts[i] = 100 ether;
        }

        uint256 gasBefore = gasleft();
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            largeHashes,
            largeAmounts,
            30 days,
            365 days,
            30 days
        );
        uint256 gasUsed = gasBefore - gasleft();

        // Verify it worked
        assertTrue(vesting != address(0));
        assertEq(ZarfVesting(vesting).allocations(largeHashes[0]), 100 ether);
        assertEq(ZarfVesting(vesting).allocations(largeHashes[99]), 100 ether);

        // Log gas for analysis
        emit log_named_uint("Gas used for 100 recipients", gasUsed);
    }

    function test_LargeAllocation_200Recipients() public {
        uint256 recipientCount = 200;
        bytes32[] memory largeHashes = new bytes32[](recipientCount);
        uint256[] memory largeAmounts = new uint256[](recipientCount);

        for (uint256 i = 0; i < recipientCount; i++) {
            largeHashes[i] = bytes32(uint256(i + 1));
            largeAmounts[i] = 50 ether;
        }

        uint256 gasBefore = gasleft();
        address vesting = factory.createVesting(
            address(token),
            merkleRoot,
            largeHashes,
            largeAmounts,
            30 days,
            365 days,
            30 days
        );
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(vesting != address(0));
        emit log_named_uint("Gas used for 200 recipients", gasUsed);
    }
}

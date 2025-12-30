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
    // ADR-012: Renamed from emailHashes to commitments
    bytes32[] public commitments;
    uint256[] public amounts;

    function setUp() public {
        // Deploy dependencies
        verifier = new MockVerifier();
        jwkRegistry = new JWKRegistry();
        
        // Deploy token with initial supply to this contract
        token = new TestToken("Test Token", "TEST", 10_000_000);
        
        // Deploy factory
        factory = new ZarfVestingFactory(address(verifier), address(jwkRegistry));

        // Setup test allocations (ADR-012: now using commitments)
        commitments = new bytes32[](3);
        commitments[0] = bytes32(uint256(1));
        commitments[1] = bytes32(uint256(2));
        commitments[2] = bytes32(uint256(3));

        amounts = new uint256[](3);
        amounts[0] = 1000 ether;
        amounts[1] = 2000 ether;
        amounts[2] = 3000 ether;
        
        // Transfer some tokens to alice for testing
        token.transfer(alice, 1_000_000 ether);
    }

    // Helper to create params struct
    function _createParams() internal view returns (ZarfVestingFactory.CreateVestingParams memory) {
        return ZarfVestingFactory.CreateVestingParams({
            name: "Test Vesting",
            description: "Test description",
            token: address(token),
            merkleRoot: merkleRoot,
            commitments: commitments,
            amounts: amounts,
            cliffDuration: 30 days,
            vestingDuration: 365 days,
            vestingPeriod: 30 days
        });
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsImmutables() public view {
        assertEq(factory.verifier(), address(verifier));
        assertEq(factory.jwkRegistry(), address(jwkRegistry));
    }

    // ============ createVesting Tests ============

    function test_CreateVesting_DeploysContract() public {
        address vesting = factory.createVesting(_createParams());

        // Verify contract was deployed
        assertTrue(vesting != address(0));
        assertTrue(vesting.code.length > 0);
    }

    function test_CreateVesting_SetsOwnership() public {
        address vesting = factory.createVesting(_createParams());

        // Caller should be the owner
        assertEq(ZarfVesting(vesting).owner(), owner);
    }

    function test_CreateVesting_SetsMetadata() public {
        address vesting = factory.createVesting(_createParams());

        assertEq(ZarfVesting(vesting).name(), "Test Vesting");
        assertEq(ZarfVesting(vesting).description(), "Test description");
    }

    function test_CreateVesting_SetsMerkleRoot() public {
        address vesting = factory.createVesting(_createParams());

        assertEq(ZarfVesting(vesting).merkleRoot(), merkleRoot);
    }

    function test_CreateVesting_SetsAllocations() public {
        address vesting = factory.createVesting(_createParams());

        // Verify allocations
        assertEq(ZarfVesting(vesting).allocations(commitments[0]), amounts[0]);
        assertEq(ZarfVesting(vesting).allocations(commitments[1]), amounts[1]);
        assertEq(ZarfVesting(vesting).allocations(commitments[2]), amounts[2]);
    }

    function test_CreateVesting_SetsVestingSchedule() public {
        address vesting = factory.createVesting(_createParams());

        ZarfVesting v = ZarfVesting(vesting);
        assertEq(v.cliffDuration(), 30 days);
        assertEq(v.vestingDuration(), 365 days);
        assertEq(v.vestingPeriod(), 30 days);
        assertTrue(v.vestingStart() > 0);
    }

    function test_CreateVesting_TracksDeployment() public {
        address vesting = factory.createVesting(_createParams());

        assertEq(factory.getDeploymentCount(), 1);
        assertEq(factory.deployments(0), vesting);
        assertEq(factory.getOwnerDeployments(owner).length, 1);
        assertEq(factory.getOwnerDeployments(owner)[0], vesting);
    }

    function test_CreateVesting_EmitsEvent() public {
        uint256 totalAmount = amounts[0] + amounts[1] + amounts[2];

        // Record logs to capture the event
        vm.recordLogs();

        address vesting = factory.createVesting(_createParams());

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
        ZarfVestingFactory.CreateVestingParams memory params = _createParams();
        
        // Create mismatched amounts array
        uint256[] memory wrongAmounts = new uint256[](2);
        wrongAmounts[0] = 1000 ether;
        wrongAmounts[1] = 2000 ether;
        params.amounts = wrongAmounts;

        vm.expectRevert(ZarfVestingFactory.ArrayLengthMismatch.selector);
        factory.createVesting(params);
    }

    function test_CreateVesting_RevertOnEmptyArrays() public {
        ZarfVestingFactory.CreateVestingParams memory params = _createParams();
        params.commitments = new bytes32[](0);
        params.amounts = new uint256[](0);

        vm.expectRevert(ZarfVestingFactory.ZeroAllocations.selector);
        factory.createVesting(params);
    }

    // ============ createAndFundVesting Tests ============

    function test_CreateAndFundVesting_TransfersTokens() public {
        uint256 depositAmount = 6000 ether;
        
        // Approve factory
        token.approve(address(factory), depositAmount);

        uint256 balanceBefore = token.balanceOf(owner);

        address vesting = factory.createAndFundVesting(_createParams(), depositAmount);

        // Tokens should be in vesting contract
        assertEq(token.balanceOf(vesting), depositAmount);
        assertEq(token.balanceOf(owner), balanceBefore - depositAmount);
    }

    function test_CreateAndFundVesting_FullFlow() public {
        uint256 depositAmount = 6000 ether;
        token.approve(address(factory), depositAmount);

        address vesting = factory.createAndFundVesting(_createParams(), depositAmount);

        ZarfVesting v = ZarfVesting(vesting);

        // Verify everything is set
        assertEq(v.owner(), owner);
        assertEq(v.merkleRoot(), merkleRoot);
        assertEq(v.allocations(commitments[0]), amounts[0]);
        assertEq(v.cliffDuration(), 30 days);
        assertEq(token.balanceOf(vesting), depositAmount);
    }

    function test_CreateAndFundVesting_RevertOnInsufficientApproval() public {
        uint256 depositAmount = 6000 ether;
        
        // Only approve half
        token.approve(address(factory), depositAmount / 2);

        vm.expectRevert(); // Will revert on transferFrom
        factory.createAndFundVesting(_createParams(), depositAmount);
    }

    function test_CreateAndFundVesting_RevertOnInsufficientBalance() public {
        uint256 depositAmount = 6000 ether;
        
        // Approve from bob who has no tokens
        vm.startPrank(bob);
        token.approve(address(factory), depositAmount);

        vm.expectRevert(); // Will revert on transferFrom
        factory.createAndFundVesting(_createParams(), depositAmount);
        vm.stopPrank();
    }

    // ============ Multi-Deployment Tests ============

    function test_MultipleDeployments_TrackedCorrectly() public {
        // Owner deploys 2
        address v1 = factory.createVesting(_createParams());
        
        ZarfVestingFactory.CreateVestingParams memory params2 = _createParams();
        params2.name = "Vesting 2";
        params2.cliffDuration = 60 days;
        params2.vestingDuration = 180 days;
        address v2 = factory.createVesting(params2);

        // Alice deploys 1
        vm.prank(alice);
        ZarfVestingFactory.CreateVestingParams memory params3 = _createParams();
        params3.name = "Alice Vesting";
        params3.cliffDuration = 0;
        params3.vestingPeriod = 7 days;
        address v3 = factory.createVesting(params3);

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

        ZarfVestingFactory.CreateVestingParams memory params = ZarfVestingFactory.CreateVestingParams({
            name: "Large Vesting",
            description: "100 recipients test",
            token: address(token),
            merkleRoot: merkleRoot,
            commitments: largeHashes,
            amounts: largeAmounts,
            cliffDuration: 30 days,
            vestingDuration: 365 days,
            vestingPeriod: 30 days
        });

        uint256 gasBefore = gasleft();
        address vesting = factory.createVesting(params);
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

        ZarfVestingFactory.CreateVestingParams memory params = ZarfVestingFactory.CreateVestingParams({
            name: "Large Vesting 2",
            description: "200 recipients test",
            token: address(token),
            merkleRoot: merkleRoot,
            commitments: largeHashes,
            amounts: largeAmounts,
            cliffDuration: 30 days,
            vestingDuration: 365 days,
            vestingPeriod: 30 days
        });

        uint256 gasBefore = gasleft();
        address vesting = factory.createVesting(params);
        uint256 gasUsed = gasBefore - gasleft();

        assertTrue(vesting != address(0));
        emit log_named_uint("Gas used for 200 recipients", gasUsed);
    }
}

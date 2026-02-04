// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ZarfVesting} from "../src/ZarfVesting.sol";
import {JWKRegistry} from "../src/JWKRegistry.sol";
import {MockVerifier} from "../src/MockVerifier.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ZarfVestingTest is Test {
    ZarfVesting public vesting;
    JWKRegistry public jwkRegistry;
    MockVerifier public verifier;
    MockERC20 public token;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    bytes32 public merkleRoot = bytes32(uint256(0x1234));
    bytes32 public aliceEmailHash = bytes32(uint256(0xA11CE));
    bytes32 public bobEmailHash = bytes32(uint256(0xB0B));

    // Mock pubkey limbs (18 limbs for RSA-2048)
    bytes32[18] public mockPubkeyLimbs;

    uint256 public constant TOTAL_SUPPLY = 1_000_000 ether;
    uint256 public constant ALICE_ALLOCATION = 10_000 ether;
    uint256 public constant BOB_ALLOCATION = 20_000 ether;

    uint256 public constant CLIFF = 30 days;
    uint256 public constant VESTING_DURATION = 365 days;

    function setUp() public {
        // Initialize mock pubkey limbs
        for (uint256 i = 0; i < 18; i++) {
            mockPubkeyLimbs[i] = bytes32(uint256(i + 1));
        }

        // Deploy contracts
        token = new MockERC20("Zarf Token", "ZARF", TOTAL_SUPPLY);
        verifier = new MockVerifier();
        jwkRegistry = new JWKRegistry();

        // Register mock pubkey in JWK registry
        jwkRegistry.registerKey("mock-kid", mockPubkeyLimbs);

        // Deploy vesting with JWK registry
        vesting = new ZarfVesting(address(token), address(verifier), address(jwkRegistry));

        // Setup vesting
        vesting.setMerkleRoot(merkleRoot);
        vesting.setAllocation(aliceEmailHash, ALICE_ALLOCATION);
        vesting.setAllocation(bobEmailHash, BOB_ALLOCATION);

        // Deposit tokens
        token.approve(address(vesting), TOTAL_SUPPLY);
        vesting.deposit(ALICE_ALLOCATION + BOB_ALLOCATION);

        // Start vesting
        vesting.startVesting(CLIFF, VESTING_DURATION);
    }

    /// @dev Helper to create public inputs with mock pubkey
    function _createPublicInputs(bytes32 _merkleRoot, address recipient, bytes32 emailHash)
        internal
        view
        returns (bytes32[] memory)
    {
        bytes32[] memory inputs = new bytes32[](21);
        // First 18: pubkey limbs
        for (uint256 i = 0; i < 18; i++) {
            inputs[i] = mockPubkeyLimbs[i];
        }
        // Last 3: merkleRoot, emailHash, recipient
        inputs[18] = _merkleRoot;
        inputs[19] = emailHash;
        inputs[20] = bytes32(uint256(uint160(recipient)));
        return inputs;
    }

    // ============ Setup Tests ============

    function test_InitialState() public view {
        assertEq(address(vesting.token()), address(token));
        assertEq(address(vesting.verifier()), address(verifier));
        assertEq(address(vesting.jwkRegistry()), address(jwkRegistry));
        assertEq(vesting.owner(), owner);
        assertEq(vesting.merkleRoot(), merkleRoot);
        assertEq(vesting.allocations(aliceEmailHash), ALICE_ALLOCATION);
        assertEq(vesting.allocations(bobEmailHash), BOB_ALLOCATION);
    }

    function test_VestingStarted() public view {
        (uint256 start, uint256 cliff, uint256 duration) = vesting.getVestingInfo();
        assertEq(start, block.timestamp);
        assertEq(cliff, CLIFF);
        assertEq(duration, VESTING_DURATION);
    }

    // ============ Vesting Calculation Tests ============

    function test_NoVestingBeforeCliff() public view {
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        assertEq(vested, 0);
    }

    function test_NoVestingAtCliffMinus1() public {
        vm.warp(block.timestamp + CLIFF - 1);
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        assertEq(vested, 0);
    }

    function test_VestingStartsAtCliff() public {
        vm.warp(block.timestamp + CLIFF);
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        // At exactly cliff, 0 time has passed in vesting period
        assertEq(vested, 0);
    }

    function test_HalfVestedAtHalfway() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION / 2);
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        assertEq(vested, ALICE_ALLOCATION / 2);
    }

    function test_FullyVestedAtEnd() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        assertEq(vested, ALICE_ALLOCATION);
    }

    function test_FullyVestedAfterEnd() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION + 365 days);
        uint256 vested = vesting.calculateVested(aliceEmailHash);
        assertEq(vested, ALICE_ALLOCATION);
    }

    // ============ Claim Tests ============

    function test_ClaimAfterFullVesting() public {
        // Warp to after full vesting
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        // Create mock proof and public inputs
        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        // Claim as alice
        vm.prank(alice);
        vesting.claim(proof, publicInputs);

        // Verify
        assertEq(token.balanceOf(alice), ALICE_ALLOCATION);
        assertEq(vesting.claimed(aliceEmailHash), ALICE_ALLOCATION);
    }

    function test_ClaimPartialVesting() public {
        // Warp to halfway through vesting
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION / 2);

        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        vm.prank(alice);
        vesting.claim(proof, publicInputs);

        assertEq(token.balanceOf(alice), ALICE_ALLOCATION / 2);
        assertEq(vesting.claimed(aliceEmailHash), ALICE_ALLOCATION / 2);
    }

    function test_ClaimMultipleTimes() public {
        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        // First claim at 25%
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION / 4);
        vm.prank(alice);
        vesting.claim(proof, publicInputs);
        assertEq(token.balanceOf(alice), ALICE_ALLOCATION / 4);

        // Second claim at 75%
        vm.warp(block.timestamp + VESTING_DURATION / 2); // +50% more
        vm.prank(alice);
        vesting.claim(proof, publicInputs);
        assertEq(token.balanceOf(alice), (ALICE_ALLOCATION * 3) / 4);

        // Final claim at 100%
        vm.warp(block.timestamp + VESTING_DURATION / 4 + 1); // rest
        vm.prank(alice);
        vesting.claim(proof, publicInputs);
        assertEq(token.balanceOf(alice), ALICE_ALLOCATION);
    }

    function test_RevertClaimBeforeCliff() public {
        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        vm.prank(alice);
        vm.expectRevert(ZarfVesting.NothingToClaim.selector);
        vesting.claim(proof, publicInputs);
    }

    function test_RevertClaimInvalidMerkleRoot() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(bytes32(uint256(0x9999)), alice, aliceEmailHash);

        vm.prank(alice);
        vm.expectRevert(ZarfVesting.InvalidMerkleRoot.selector);
        vesting.claim(proof, publicInputs);
    }

    function test_RevertClaimNoAllocation() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, bytes32(uint256(0xDEAD)));

        vm.prank(alice);
        vm.expectRevert(ZarfVesting.NothingToClaim.selector);
        vesting.claim(proof, publicInputs);
    }

    function test_RevertDoubleClaimSameBlock() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        vm.prank(alice);
        vesting.claim(proof, publicInputs);

        // Try to claim again in same block
        vm.prank(alice);
        vm.expectRevert(ZarfVesting.NothingToClaim.selector);
        vesting.claim(proof, publicInputs);
    }

    function test_RevertClaimInvalidRecipient() public {
        // Bob tries to use a proof intended for alice
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        // Bob tries to claim - should fail because recipient doesn't match
        vm.prank(bob);
        vm.expectRevert(ZarfVesting.InvalidRecipient.selector);
        vesting.claim(proof, publicInputs);
    }

    function test_RevertClaimInvalidPubkey() public {
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        // Create public inputs with unregistered pubkey
        bytes32[] memory publicInputs = new bytes32[](21);
        for (uint256 i = 0; i < 18; i++) {
            publicInputs[i] = bytes32(uint256(100 + i)); // Different pubkey
        }
        publicInputs[18] = merkleRoot;
        publicInputs[19] = aliceEmailHash;
        publicInputs[20] = bytes32(uint256(uint160(alice)));

        vm.prank(alice);
        vm.expectRevert(ZarfVesting.InvalidPubkey.selector);
        vesting.claim("", publicInputs);
    }

    // ============ Admin Tests ============

    function test_OnlyOwnerCanSetMerkleRoot() public {
        vm.prank(alice);
        vm.expectRevert(ZarfVesting.Unauthorized.selector);
        vesting.setMerkleRoot(bytes32(uint256(0x5678)));
    }

    function test_OnlyOwnerCanSetAllocation() public {
        vm.prank(alice);
        vm.expectRevert(ZarfVesting.Unauthorized.selector);
        vesting.setAllocation(aliceEmailHash, 1000);
    }

    function test_BatchSetAllocations() public {
        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = bytes32(uint256(0x111));
        hashes[1] = bytes32(uint256(0x222));

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5000 ether;
        amounts[1] = 7000 ether;

        vesting.setAllocations(hashes, amounts);

        assertEq(vesting.allocations(hashes[0]), 5000 ether);
        assertEq(vesting.allocations(hashes[1]), 7000 ether);
    }

    function test_TransferOwnership() public {
        vesting.transferOwnership(alice);
        assertEq(vesting.owner(), alice);

        // Old owner can no longer set allocations
        vm.expectRevert(ZarfVesting.Unauthorized.selector);
        vesting.setAllocation(aliceEmailHash, 1000);
    }

    // ============ Edge Cases ============

    function test_FrontRunningPrevented() public {
        // This test verifies that front-running is prevented
        // Bob cannot intercept alice's proof and claim her tokens
        vm.warp(block.timestamp + CLIFF + VESTING_DURATION);

        // Alice's proof with alice as recipient
        bytes memory proof = "";
        bytes32[] memory publicInputs = _createPublicInputs(merkleRoot, alice, aliceEmailHash);

        // Bob tries to front-run - FAILS
        vm.prank(bob);
        vm.expectRevert(ZarfVesting.InvalidRecipient.selector);
        vesting.claim(proof, publicInputs);

        // Alice can still claim her tokens
        vm.prank(alice);
        vesting.claim(proof, publicInputs);

        assertEq(token.balanceOf(alice), ALICE_ALLOCATION);
        assertEq(token.balanceOf(bob), 0);
    }
}

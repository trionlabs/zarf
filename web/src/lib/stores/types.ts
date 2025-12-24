/**
 * Global Store Type Definitions
 * 
 * This file contains all TypeScript interfaces for Svelte 5 Runes stores.
 * Covers wizard, claim flow, wallet, and theme state management.
 * 
 * @module stores/types
 */

import type { Address } from 'viem';

// ============================================================================
// Wizard Store Types
// ============================================================================

/**
 * Token details for distribution setup (Step 1)
 */
export interface TokenDetails {
    distributionName: string;
    iconUrl: string | null;
    tokenAddress: Address | null;
    totalAmount: string; // String to avoid precision issues in input
}

/**
 * Vesting schedule configuration (Step 2)
 */
export interface Schedule {
    cliffEndDate: string; // ISO date string (YYYY-MM-DD)
    distributionDurationMonths: number;
}

/**
 * Whitelist recipient entry (Step 3)
 */
export interface Recipient {
    email: string;
    amount: number;
    leafIndex?: number; // Assigned after Merkle tree generation
    salt?: string; // Random salt for leaf privacy
}

/**
 * Complete wizard state across all 6 steps
 */
export interface WizardState {
    currentStep: number; // 1-6

    // Step 1: Token Details
    tokenDetails: TokenDetails;

    // Step 2: Schedule
    schedule: Schedule;

    // Step 3: Recipients (CSV Upload)
    recipients: Recipient[];
    csvFilename: string | null;

    // Step 4: Regulatory Rules
    regulatoryRules: string[]; // IDs of selected rules

    // Step 5: Review & Deploy
    merkleRoot: string | null; // Hex string

    // Step 6: Deployment Result
    deployedContractAddress: Address | null;
    txHash: string | null;
}

// ============================================================================
// Claim Flow Store Types
// ============================================================================

/**
 * Claim flow step progression (5 steps)
 */
export type ClaimStep = 1 | 2 | 3 | 4 | 5;

/**
 * Claimable distribution metadata (from contract or The Graph)
 */
export interface ClaimableDistribution {
    id: string; // Contract address or unique ID
    name: string;
    projectIcon: string; // URL to project logo
    status: 'vesting' | 'claimable' | 'claimed';
    totalAmount: number;
    claimedAmount: number;
    nextUnlockDate: string; // ISO date string
    merkleRoot?: string; // For validation
}

/**
 * Selected tranche for claiming
 */
export interface SelectedTranche {
    date: string; // ISO date string
    amount: number;
    index: number; // Tranche index in schedule
}

/**
 * Complete claim flow state
 */
export interface ClaimFlowState {
    mode: 'dashboard' | 'claiming'; // UI mode toggle

    currentStep: ClaimStep;

    // Step 1: Select Distribution
    selectedDistribution: ClaimableDistribution | null;

    // Step 2: Select Tranche
    selectedTranche: SelectedTranche | null;

    // Step 3: Connect Wallet & Generate Proof
    targetWallet: Address | null;
    zkProof: string | null; // Hex-encoded proof (not persisted)
    publicInputs: any | null; // Public inputs for verification (not persisted)

    // Step 4-5: Submit & Success
    claimTxHash: string | null; // Transaction hash (not persisted)
}

// ============================================================================
// Wallet Store Types
// ============================================================================

/**
 * Wallet connection state
 */
export interface WalletState {
    address: Address | null;
    isConnected: boolean;
    isConnecting: boolean; // Loading state
    chainId: number | null;
}

// ============================================================================
// Theme Store Types
// ============================================================================

/**
 * Available theme options (DaisyUI themes)
 */
export type Theme = 'nord' | 'wireframe';

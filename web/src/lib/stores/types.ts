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
 * Token details for distribution setup (Step 0)
 */
export interface TokenDetails {
    // Token Contract Info (fetched from API)
    tokenAddress: Address | null;
    tokenName: string | null;        // Fetched from contract
    tokenSymbol: string | null;      // Fetched from contract (ticker)
    tokenDecimals: number | null;    // Fetched from contract
    tokenTotalSupply: string | null; // Fetched from contract
    iconUrl: string | null;          // Fetched from API (if available)
}

/**
 * Vesting schedule configuration
 */
export interface Schedule {
    cliffEndDate: string; // ISO date string (YYYY-MM-DD)
    distributionDuration: number;
    durationUnit: "minutes" | "hours" | "weeks" | "months" | "quarters" | "years";
}

/**
 * Whitelist recipient entry
 */
export interface Recipient {
    address: string; // Keep as primary identifier, but might be empty if email is used initially
    email?: string;  // Add optional email field
    amount: number;
    leafIndex?: number; // assigned after merkle generation
    salt?: string;
}

// Alias for compatibility if needed
export type WhitelistEntry = Recipient;

/**
 * Distribution State
 */
export type DistributionState =
    | 'created'      // Draft / Waiting for launch
    | 'launched'     // Active / Deposit made
    | 'in_progress'  // Claiming started
    | 'cancelled';   // Cancelled

/**
 * Single Distribution Entry (Step 1)
 */
/**
 * Detailed deployment progress steps
 */
export type DeploymentStep = 'idle' | 'approving' | 'approved' | 'depositing' | 'deployed';

/**
 * Single Distribution Entry (Step 1)
 */
export interface Distribution {
    id: string; // UUID
    name: string;
    description: string;
    amount: string; // Total amount for this distribution
    schedule: Schedule;
    recipients: Recipient[];
    csvFilename?: string | null;
    regulatoryRules: string[];

    // State Management
    state: DistributionState;
    createdAt: string;       // ISO timestamp
    launchedAt?: string;     // Deposit timestamp
    depositTxHash?: string;  // Deposit transaction hash
    cancelledAt?: string;    // Cancel timestamp

    // UI Deployment State
    deploymentStep?: DeploymentStep;
}

/**
 * Complete wizard state across all steps
 */
export interface WizardState {
    currentStep: number; // 0-3

    // Step 0: Token Details
    tokenDetails: TokenDetails;

    // Step 1: Distributions (Basket)
    distributions: Distribution[];

    // Step 2: Review & Deploy
    merkleRoot: string | null; // Aggregate or per-distribution logic TBD

    // Step 3: Deployment Result
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
 * Selected tranche for claiming
 */
export interface SelectedTranche {
    date: string; // ISO date string
    amount: number;
    index: number; // Tranche index in schedule
}


// ============================================================================
// Merkle Tree Types (ADR-023 Updated)
// ============================================================================

export interface MerkleProof {
    siblings: string[]; // Hex strings
    indices: number[];  // 0 or 1
}

export interface MerkleClaim {
    email: string;
    amount: bigint;
    salt: string; // The secret (Master or Epoch secret)
    identityCommitment: string;
    leafIndex: number;
    leaf: bigint;
    unlockTime: number; // ADR-023: Discrete Vesting unlock timestamp
}

export interface MerkleTreeData {
    root: bigint;
    tree: {
        minDepth: number;
        depth: number;
        layers: bigint[][];
        emptyHashes: bigint[];
    };
    claims: MerkleClaim[];
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
export type Theme = 'nord' | 'wireframe' | 'dim';

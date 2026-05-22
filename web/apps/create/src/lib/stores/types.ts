/**
 * App-specific store types for the create wizard.
 *
 * Domain types (MerkleClaim, MerkleProof, MerkleTreeData, Schedule, WhitelistEntry,
 * DurationUnit, UnlockMarker, etc.) live in `@zarf/core` and are re-exported below
 * so existing imports `from './types'` keep working.
 *
 * Only put types here that are genuinely UI/wizard-specific (TokenDetails,
 * Distribution, WizardState, Recipient, ClaimStep, …).
 *
 * @module stores/types
 */

import type { Schedule, StellarAddress, StellarContractId } from '@zarf/core';

// Re-export domain types for app-local convenience.
export type {
    Schedule,
    MerkleClaim,
    MerkleProof,
    MerkleTreeData,
    WhitelistEntry,
    DurationUnit,
    UnlockMarker,
} from '@zarf/core';

// ============================================================================
// Wizard Store Types
// ============================================================================

/**
 * Token details for distribution setup (Step 0)
 */
export interface TokenDetails {
    // Token Contract Info (fetched from API)
    tokenAddress: StellarContractId | null;
    tokenName: string | null; // Fetched from contract
    tokenSymbol: string | null; // Fetched from contract (ticker)
    tokenDecimals: number | null; // Fetched from contract
    tokenTotalSupply: string | null; // Fetched from contract
    iconUrl: string | null; // Fetched from API (if available)
}

/**
 * Whitelist recipient entry — wizard-form draft shape.
 *
 * NOTE: this is the user-facing input (amount: number from a form field).
 * It is NOT the same as `MerkleClaim` (the post-processing on-chain shape with
 * amount: bigint). Conversion happens at the boundary when the merkle tree is
 * generated.
 */
export interface Recipient {
    address: string; // Keep as primary identifier, but might be empty if email is used initially
    email?: string; // Add optional email field
    amount: number;
    leafIndex?: number; // assigned after merkle generation
    salt?: string;
}

/**
 * Distribution State
 */
export type DistributionState =
    | 'created' // Draft / Waiting for launch
    | 'launched' // Active / Deposit made
    | 'in_progress' // Claiming started
    | 'cancelled'; // Cancelled

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
    createdAt: string; // ISO timestamp
    launchedAt?: string; // Deposit timestamp
    depositTxHash?: string; // Deposit transaction hash
    cancelledAt?: string; // Cancel timestamp

    // UI Deployment State
    deploymentStep?: DeploymentStep;
}

/**
 * Complete wizard state across all steps.
 *
 * Deploy-result fields (merkleRoot/deployedContractAddress/txHash) live in
 * `deployStore`, not here — the wizard tracks creation, deployStore tracks
 * the deploy/recovery write-ahead log.
 */
export interface WizardState {
    currentStep: number; // 0-3

    // Step 0: Token Details
    tokenDetails: TokenDetails;

    // Step 1: Distributions (Basket)
    distributions: Distribution[];
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
// Wallet Store Types
// ============================================================================

/**
 * Wallet connection state
 */
export interface WalletState {
    address: StellarAddress | null;
    isConnected: boolean;
    isConnecting: boolean; // Loading state
    networkPassphrase: string | null;
}

// ============================================================================
// Theme Store Types
// ============================================================================

/**
 * Available theme options (Binary: dark/light)
 * Maps to DaisyUI themes: light='wireframe', dark='glass-porcelain'
 */
export type Theme = 'dark' | 'light';

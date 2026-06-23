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

import type { Schedule, StellarAddress, StellarContractId, DurationUnit } from '@zarf/core';

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

    // Trust gate (persisted so step-1 can re-assert it across navigation/deep-links,
    // not just rely on step-0's ephemeral in-memory check). Optional for back-compat
    // with pre-migration localStorage blobs.
    trust?: 'curated' | 'imported' | null; // 'curated' = in the registry; else imported
    acknowledged?: boolean; // imported-token acknowledgement, set on Continue
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
    email: string; // Email is the mandatory identifier (create.zarf.to is email-only)
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
 * In-progress (un-saved) Step-1 form draft, persisted so a reload/deep-link
 * restores the user's work. Recipients are intentionally excluded — they can be
 * large (CSV import) and already live in saved `distributions[]`; they are
 * re-imported from the CSV if a reload happens mid-flight.
 */
export interface DistributionDraft {
    name: string;
    description: string;
    poolAmount: number;
    poolInputValue: string;
    cliffDate: string;
    cliffTime: string;
    duration: number;
    durationUnit: DurationUnit;
    csvFileName: string | null;
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

    // Step 1: In-progress form draft (null when none)
    draft: DistributionDraft | null;
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
 * Maps to data-theme tokens: light='paper-porcelain', dark='glass-porcelain'
 */
export type Theme = 'dark' | 'light';

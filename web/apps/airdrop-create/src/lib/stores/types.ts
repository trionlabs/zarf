/**
 * Store types for the airdrop-create wizard.
 *
 * Deliberately address-centric (no email / PII): an airdrop campaign is a token
 * + a public list of `(address, amount)` recipients + a deadline + a `locked`
 * flag. The full list is stored verbatim in localStorage (it is public, pinned
 * to IPFS) — there is no PII-redaction step, unlike a privacy-sensitive flow.
 *
 * @module stores/types
 */
import type { StellarAddress, StellarContractId } from '@zarf/core';

/** Token details captured in step-0 (decimals are load-bearing for UI→i128). */
export interface TokenDetails {
    tokenAddress: StellarContractId | null;
    tokenName: string | null;
    tokenSymbol: string | null;
    /** Read from the contract via RPC sim; required before the tree is built. */
    tokenDecimals: number | null;
    /** Pasted/imported-token acknowledgement, set on Continue (no curated list). */
    acknowledged?: boolean;
}

/**
 * One recipient row as entered in the grid. `amount` is the raw decimal STRING
 * the user typed (not a JS number — a numeric type silently rounds integers
 * above 2^53 base units before they reach the leaf). It is validated against the
 * token's decimals and converted to i128 base units at tree-build time via
 * `parseTokenAmount`. `address` is the canonical UPPERCASE strkey.
 */
export interface RecipientRow {
    address: string;
    amount: string;
}

/** A campaign's lifecycle. */
export type CampaignState = 'created' | 'launched' | 'cancelled';

/**
 * A launched (or cancelled) campaign — the dashboard history entry. Distinct
 * from the in-flight wizard draft (`WizardState.recipients`/`deadline`/…).
 */
export interface Campaign {
    id: string;
    token: StellarContractId;
    tokenSymbol: string | null;
    tokenDecimals: number;
    recipientCount: number;
    /** Total funded, in token base units (i128 decimal string). */
    total: string;
    /** Claim deadline as a unix timestamp in seconds; 0 = no deadline. */
    deadline: number;
    locked: boolean;
    merkleRoot: string;
    /** IPFS CID of the pinned claim-list. */
    metadataCid: string;
    /** Deployed instance address (== predicted). */
    airdropAddress: StellarContractId;
    state: CampaignState;
    createdAt: string;
    launchedAt?: string;
    approveTxHash?: string;
    createTxHash?: string;
    cancelledAt?: string;
}

/**
 * The deploy write-ahead log for the one in-flight campaign. Mirrors the create
 * app's `deployStore` recovery fields, minus the Backup sub-step (an airdrop
 * list is public — there is nothing to back up before publishing). Persisted
 * with the wizard blob so a reload mid-deploy recovers the predicted address +
 * tx hashes rather than re-deploying.
 */
export interface ActiveDeploy {
    /** 1 = Prepare, 2 = Connect & Approve, 3 = Distribute & Fund. */
    step: 1 | 2 | 3;
    /** Fixed once Prepare runs; the address is baked into the claim-list. */
    salt: `0x${string}` | null;
    predictedAddress: StellarContractId | null;
    merkleRoot: `0x${string}` | null;
    metadataCid: string | null;
    /** Total to fund, in token base units (i128 decimal string). */
    total: string | null;
    approveTxHash: string | null;
    createTxHash: string | null;
    /** Wall-clock of the last save; used to expire a stale WAL on restore. */
    savedAt: number | null;
}

/** Complete wizard state: in-flight draft + launched-campaign history. */
export interface WizardState {
    /** 0 = Token, 1 = Recipients, 2 = Review & Distribute. */
    currentStep: number;
    tokenDetails: TokenDetails;
    /** The in-flight recipient list (step-1). */
    recipients: RecipientRow[];
    /** Claim deadline (unix seconds); 0 = no deadline. */
    deadline: number;
    locked: boolean;
    /** The in-flight deploy WAL (null until step-2 Prepare). */
    activeDeploy: ActiveDeploy | null;
    /** Launched/cancelled campaigns (the dashboard). */
    campaigns: Campaign[];
}

export type { StellarAddress, StellarContractId };

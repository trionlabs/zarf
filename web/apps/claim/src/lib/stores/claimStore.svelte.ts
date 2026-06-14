import { browser } from '$app/environment';
import type { ZKProof, MerkleClaim } from '@zarf/ui/types';
import { toastStore } from '@zarf/ui/stores/toastStore.svelte';
import { getActiveStellarNetworkId } from '@zarf/core/config/runtime';
import { devTag, warn } from '@zarf/core/utils/log';

import type { DistributionData } from '@zarf/core/services/distribution';
import {
    totalAllocation as totalAllocationOf,
    claimedAmount as claimedAmountOf,
    unlockedAmount as unlockedAmountOf,
    claimableAmount as claimableAmountOf,
    isCliffPassed as isCliffPassedOf,
    cliffEndDate as cliffEndDateOf,
    findNextClaimableIdx,
    buildVestingPeriods,
} from '@zarf/core/domain/claimFlow';

/**
 * Claim Store - InMemory State for the Claim Flow (Discrete Vesting Edition)
 *
 * SECURITY CRITICAL:
 * This store handles the User's MASTER SALT and Epoch Secrets.
 * It is effectively an "InMemory" store.
 * We explicitly DO NOT persist derived secrets to storage.
 */

const log = devTag('claimStore');

export type ClaimStep = 1 | 2 | 3 | 4 | 5;

export interface EpochClaim extends MerkleClaim {
    isClaimed: boolean;
    isLocked: boolean;
    canClaim: boolean;
    email: string;
    salt: string; // Epoch Secret (PIN_Index)
    amount: bigint;
    unlockTime: number;
    identityCommitment: string;
    leafIndex: number;
    leaf: bigint;
}

class ClaimFlowState {
    // Single Source of Truth
    state = $state({
        masterSalt: null as string | null,
        epochs: [] as EpochClaim[],
        vestingSchedule: null as DistributionData['schedule'] | null,
        tokenSymbol: 'XLM' as string,
        tokenDecimals: 7 as number,
        currentStep: 1 as ClaimStep,
        targetWallet: null as string | null,
        loading: false,
        error: null as string | null,
        statusMessage: null as string | null,
        // The vesting contract holds less than this user's remaining
        // allocation — claims may fail until the creator deposits more.
        underfunded: false,

        // Form inputs (persisted or transient)
        email: '' as string | null,
        jwt: '' as string | null, // Added for ZK Proof
        pin: '' as string | null,

        // Transaction state
        proof: null as ZKProof | null,
        txHash: null as string | null,
        selectedEpochIndex: null as number | null,
    });

    constructor() {
        this.recoverSession();
    }

    // ==========================================
    // Getters (Derived from State)
    // ==========================================

    get totalAllocation() {
        return totalAllocationOf(this.state.epochs);
    }
    get claimedAmount() {
        return claimedAmountOf(this.state.epochs);
    }
    get unlockedAmount() {
        return unlockedAmountOf(this.state.epochs);
    }
    get vestedAmount() {
        return this.unlockedAmount;
    }
    get claimableAmount() {
        return claimableAmountOf(this.state.epochs);
    }
    get isEligible() {
        return this.state.epochs.length > 0;
    }

    /**
     * Has the cliff passed? Returns `true | false | null` — `null` means
     * "schedule not loaded yet"; UI should treat as "unknown", not as eligible.
     * (Previously this returned `true` on null schedule, which momentarily
     * showed a CTA before data loaded.)
     */
    get isCliffPassed() {
        return isCliffPassedOf(this.state.vestingSchedule);
    }
    get cliffEndDate() {
        return cliffEndDateOf(this.state.vestingSchedule);
    }

    // UI Helpers (Direct Accessors)
    get currentStep() {
        return this.state.currentStep;
    }
    get isLoading() {
        return this.state.loading;
    }
    get error() {
        return this.state.error;
    }
    get statusMessage() {
        return this.state.statusMessage;
    }
    get masterSalt() {
        return this.state.masterSalt;
    }
    get epochs() {
        return this.state.epochs;
    }
    get email() {
        return this.state.email;
    }
    get pin() {
        return this.state.pin;
    }
    get jwt() {
        return this.state.jwt;
    } // Added
    get targetWallet() {
        return this.state.targetWallet;
    } // Added
    get vestingSchedule() {
        return this.state.vestingSchedule;
    }
    get tokenSymbol() {
        return this.state.tokenSymbol;
    }
    get tokenDecimals() {
        return this.state.tokenDecimals;
    }

    get periods() {
        return buildVestingPeriods(this.state.epochs);
    }

    get selectedEpoch() {
        return this.state.selectedEpochIndex !== null
            ? this.state.epochs[this.state.selectedEpochIndex]
            : null;
    }

    get proof() {
        return this.state.proof;
    }

    // ==========================================
    // Actions
    // ==========================================

    setCredentials(email: string, salt: string, pin: string) {
        this.state.email = email;
        this.state.masterSalt = salt;
        this.state.pin = pin;
    }

    setProof(proof: ZKProof) {
        this.state.proof = proof;
    }

    setTxHash(hash: string) {
        this.state.txHash = hash;
    }

    setEpochs(epochs: EpochClaim[]) {
        log('Setting epochs:', epochs.length);
        this.state.epochs = epochs;
        log('New Total:', this.totalAllocation.toString());

        if (epochs.length > 0) {
            this.saveSession();
        }
    }

    setSchedule(schedule: DistributionData['schedule']) {
        this.state.vestingSchedule = schedule;
    }

    setLoading(loading: boolean) {
        this.state.loading = loading;
    }

    setError(error: string | null) {
        this.state.error = error;
        if (error) {
            toastStore.error(error);
        }
    }

    nextStep() {
        if (this.state.currentStep < 5) {
            this.state.currentStep = (this.state.currentStep + 1) as ClaimStep;
            this.saveSession();
        }
    }

    prevStep() {
        if (this.state.currentStep > 1) {
            this.state.currentStep = (this.state.currentStep - 1) as ClaimStep;
            this.saveSession();
        }
    }

    reset() {
        this.state.currentStep = 1;
        this.state.epochs = [];
        this.state.masterSalt = null;
        this.state.pin = '';
        this.state.email = '';
        this.state.error = null;
        this.state.loading = false;
        this.state.selectedEpochIndex = null;
        this.state.proof = null;
        this.state.txHash = null;
        this.state.tokenSymbol = 'XLM';
        this.state.tokenDecimals = 7;

        // Optionally clear session
        if (browser) {
            sessionStorage.removeItem(this.sessionKey());
        }
    }

    setTargetWallet(address: string) {
        this.state.targetWallet = address;
        this.saveSession();
    }

    /**
     * Clear proof and update target wallet for regeneration
     */
    clearProofForNewWallet(newAddress: string) {
        this.state.proof = null;
        this.state.targetWallet = newAddress;
        this.state.currentStep = 4;
        this.state.error = null;
        this.state.txHash = null;
        this.saveSession();
    }

    markAsClaimed(commitment: string) {
        const commitmentLower = commitment.toLowerCase();
        const index = this.state.epochs.findIndex(
            (e) => e.identityCommitment.toLowerCase() === commitmentLower,
        );

        log('Mark as Claimed:', commitmentLower, 'Found Index:', index);

        if (index !== -1) {
            this.state.epochs[index].isClaimed = true;
            this.state.epochs[index].canClaim = false;
            this.saveSession(); // Persist update if applicable
        } else {
            warn('[claimStore] Could not find epoch for commitment:', commitmentLower);
        }
    }

    selectNextClaimableEpoch() {
        const idx = findNextClaimableIdx(this.state.epochs);
        if (idx === null) return false;
        this.state.selectedEpochIndex = idx;
        return true;
    }

    // --- Persistence ---

    private sessionKey() {
        try {
            return `claim_flow_state:${getActiveStellarNetworkId()}`;
        } catch {
            return 'claim_flow_state';
        }
    }

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.state.currentStep,
            targetWallet: this.state.targetWallet,
            // Email (PII) and PIN are never persisted. The OAuth callback
            // re-establishes the email from the id_token; PIN is in-memory
            // only (ADR-025). Persisting the email would expose the very
            // identifier the protocol keeps unlinkable to any same-origin
            // script / shared machine.
        };

        sessionStorage.setItem(this.sessionKey(), JSON.stringify(data));
    }

    private recoverSession() {
        if (!browser) return;

        const raw = sessionStorage.getItem(this.sessionKey());
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            // Always force Step 1 on fresh load to ensure Barretenberg & Secrets are initialized correctly
            this.state.currentStep = 1;
            this.state.targetWallet = data.targetWallet || null;
            this.state.email = null; // Re-established from the OAuth id_token, never read from storage
            this.state.pin = null; // Ensure PIN is never recovered
        } catch (e) {
            warn('Failed to recover claim session', e);
            sessionStorage.removeItem(this.sessionKey());
        }
    }

    private cryptoModulePromise: Promise<typeof import('@zarf/core/crypto/merkleTree')> | null =
        null;

    /**
     * Warm the merkleTree dynamic import on hover/focus of entry buttons.
     * Phase 1.1 split merkleTree into a lazy chunk; calling this primes
     * the network/parse cost so the click path doesn't pay it.
     */
    preloadCrypto() {
        if (!this.cryptoModulePromise) {
            this.cryptoModulePromise = import('@zarf/core/crypto/merkleTree');
        }
        return this.cryptoModulePromise;
    }
}

export const claimStore = new ClaimFlowState();

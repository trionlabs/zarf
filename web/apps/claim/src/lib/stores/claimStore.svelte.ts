import { browser } from '$app/environment';
import type { ZKProof, MerkleClaim, MerkleTreeData } from "@zarf/ui/types";
import { toastStore } from "@zarf/ui/stores/toastStore.svelte";

import { fetchDistributionData, type DistributionData } from "@zarf/core/services/distribution";
import { isEpochClaimed } from "@zarf/core/contracts";
import {
    totalAllocation as totalAllocationOf,
    claimedAmount as claimedAmountOf,
    unlockedAmount as unlockedAmountOf,
    claimableAmount as claimableAmountOf,
    isCliffPassed as isCliffPassedOf,
    cliffEndDate as cliffEndDateOf,
    findNextClaimableIdx,
    buildVestingPeriods,
} from "@zarf/core/domain/claimFlow";
import { discoverEpochs as discoverEpochsCore } from "@zarf/core/domain/epochDiscovery";
import { type Address } from 'viem';

/**
 * Claim Store - InMemory State for the Claim Flow (Discrete Vesting Edition)
 * 
 * SECURITY CRITICAL:
 * This store handles the User's MASTER SALT and Epoch Secrets.
 * It is effectively an "InMemory" store. 
 * We explicitly DO NOT persist derived secrets to storage.
 */

export type ClaimStep = 1 | 2 | 3 | 4 | 5;

export interface EpochClaim extends MerkleClaim {
    isClaimed: boolean;
    isLocked: boolean;
    canClaim: boolean;
    email: string;
    salt: string;    // Epoch Secret (PIN_Index)
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
        currentStep: 1 as ClaimStep,
        targetWallet: null as string | null,
        loading: false,
        error: null as string | null,
        statusMessage: null as string | null,

        // Form inputs (persisted or transient)
        email: "" as string | null,
        jwt: "" as string | null, // Added for ZK Proof
        pin: "" as string | null,

        // Transaction state
        proof: null as ZKProof | null,
        txHash: null as string | null,
        selectedEpochIndex: null as number | null
    });

    constructor() {
        this.recoverSession();
    }

    // ==========================================
    // Getters (Derived from State)
    // ==========================================

    get totalAllocation()  { return totalAllocationOf(this.state.epochs); }
    get claimedAmount()    { return claimedAmountOf(this.state.epochs); }
    get unlockedAmount()   { return unlockedAmountOf(this.state.epochs); }
    get vestedAmount()     { return this.unlockedAmount; }
    get claimableAmount()  { return claimableAmountOf(this.state.epochs); }
    get isEligible()       { return this.state.epochs.length > 0; }

    /**
     * Has the cliff passed? Returns `true | false | null` — `null` means
     * "schedule not loaded yet"; UI should treat as "unknown", not as eligible.
     * (Previously this returned `true` on null schedule, which momentarily
     * showed a CTA before data loaded.)
     */
    get isCliffPassed() { return isCliffPassedOf(this.state.vestingSchedule); }
    get cliffEndDate()  { return cliffEndDateOf(this.state.vestingSchedule); }

    // UI Helpers (Direct Accessors)
    get currentStep() { return this.state.currentStep; }
    get isLoading() { return this.state.loading; }
    get error() { return this.state.error; }
    get statusMessage() { return this.state.statusMessage; }
    get masterSalt() { return this.state.masterSalt; }
    get epochs() { return this.state.epochs; }
    get email() { return this.state.email; }
    get pin() { return this.state.pin; }
    get jwt() { return this.state.jwt; } // Added
    get targetWallet() { return this.state.targetWallet; } // Added
    get vestingSchedule() { return this.state.vestingSchedule; }

    get periods() {
        return buildVestingPeriods(this.state.vestingSchedule, this.state.epochs);
    }

    get selectedEpoch() {
        return this.state.selectedEpochIndex !== null ? this.state.epochs[this.state.selectedEpochIndex] : null;
    }

    get proof() { return this.state.proof; }

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
        console.log('[claimStore] Setting epochs:', epochs.length);
        this.state.epochs = epochs;
        console.log('[claimStore] New Total:', this.totalAllocation.toString());

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
        this.state.pin = "";
        this.state.email = "";
        this.state.error = null;
        this.state.loading = false;
        this.state.selectedEpochIndex = null;
        this.state.proof = null;
        this.state.txHash = null;

        // Optionally clear session
        if (browser) {
            sessionStorage.removeItem('claim_flow_state');
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
        const index = this.state.epochs.findIndex(e => e.identityCommitment.toLowerCase() === commitmentLower);

        console.log('[Store] Mark as Claimed:', commitmentLower, 'Found Index:', index);

        if (index !== -1) {
            this.state.epochs[index].isClaimed = true;
            this.state.epochs[index].canClaim = false;
            this.saveSession(); // Persist update if applicable
        } else {
            console.warn('[Store] Could not find epoch for commitment:', commitmentLower);
        }
    }

    selectNextClaimableEpoch() {
        const idx = findNextClaimableIdx(this.state.epochs);
        if (idx === null) return false;
        this.state.selectedEpochIndex = idx;
        return true;
    }

    // --- Persistence ---

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.state.currentStep,
            email: this.state.email,
            targetWallet: this.state.targetWallet
            // PIN is never persisted for security (ADR-025)
        };

        sessionStorage.setItem('claim_flow_state', JSON.stringify(data));
    }

    private recoverSession() {
        if (!browser) return;

        const raw = sessionStorage.getItem('claim_flow_state');
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            // Always force Step 1 on fresh load to ensure Barretenberg & Secrets are initialized correctly
            this.state.currentStep = 1;
            this.state.email = data.email || null;
            this.state.targetWallet = data.targetWallet || null;
            this.state.pin = null; // Ensure PIN is never recovered
        } catch (e) {
            console.warn('Failed to recover claim session', e);
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    private cryptoModulePromise: Promise<typeof import("@zarf/core/crypto/merkleTree")> | null = null;

    /**
     * Performance: Preload Heavy WASM Bundle
     * Trigger this on hover/focus of entry buttons
     */
    preloadCrypto() {
        if (!this.cryptoModulePromise) {
            console.log('[Performance] Preloading Crypto WASM...');
            this.cryptoModulePromise = import("@zarf/core/crypto/merkleTree");
        }
        return this.cryptoModulePromise;
    }

    /**
     * Off-chain epoch discovery via the recursive hash chain.
     * The actual algorithm lives in @zarf/core/domain/epochDiscovery (pure,
     * unit-tested). This method wires up Svelte concerns: WASM lazy-load,
     * status messages, error toasts, and the post-success transition.
     */
    async discoverEpochs(email: string, jwt: string, pin: string, contractAddress: string) {
        this.state.loading = true;
        this.state.error = null;
        this.state.statusMessage = "Loading distribution data...";
        this.state.epochs = [];

        try {
            // Lazy-load the WASM-heavy crypto module (~7MB) only when needed.
            const {
                computeIdentityCommitment,
                stringToBytes,
                pedersenHashBytes,
                pedersenHashField,
            } = await this.preloadCrypto();

            const result = await discoverEpochsCore(
                { email, pin, contractAddress },
                { computeIdentityCommitment, stringToBytes, pedersenHashBytes, pedersenHashField },
                {
                    fetchDistribution: fetchDistributionData,
                    isEpochClaimed: (commitment, addr) => isEpochClaimed(commitment, addr as Address),
                },
            );

            this.setSchedule(result.schedule);
            // Adapt domain epochs → claim store's EpochClaim shape.
            const found: EpochClaim[] = result.epochs.map((e) => ({
                email,
                amount: e.amount,
                salt: e.salt,
                identityCommitment: e.identityCommitment,
                leafIndex: e.leafIndex,
                leaf: 0n,
                unlockTime: e.unlockTime,
                isClaimed: e.isClaimed,
                isLocked: e.isLocked,
                canClaim: e.canClaim,
            }));

            this.setCredentials(email, "", pin);
            this.state.jwt = jwt;
            this.setEpochs(found);
            this.nextStep();
        } catch (e: any) {
            console.error("Discovery failed:", e);
            let msg = e.message || "Failed to discover epochs.";
            if (msg.includes("404")) msg = "Contract distribution data not found.";
            this.setError(msg);
            throw new Error(msg);
        } finally {
            this.state.loading = false;
            this.state.statusMessage = null;
        }
    }
}

export const claimStore = new ClaimFlowState();

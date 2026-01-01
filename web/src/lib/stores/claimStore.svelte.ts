import { browser } from '$app/environment';
import type { ZKProof } from '$lib/types';

/**
 * Claim Store - InMemory State for the Claim Flow
 * 
 * SECURITY CRITICAL:
 * This store handles the User's SALT and Claim Data.
 * It is effectively an "InMemory" store. 
 * We explicitly DO NOT persist `salt` or `claimData` to localStorage/sessionStorage
 * to prevent Cross-Site Scripting (XSS) attacks from easily harvesting unencrypted salts.
 * 
 * If the user refreshes the page, this state is lost, and they must re-upload their JSON.
 * This is a security feature, not a bug.
 */

export type ClaimStep = 1 | 2 | 3 | 4 | 5;

export class ClaimFlowState {
    // UI State
    currentStep = $state<ClaimStep>(1);
    isLoading = $state(false);
    error = $state<string | null>(null);

    // Session Data (Identification)
    // CRITICAL: salt (PIN) is NEVER persisted to localStorage
    email = $state<string | null>(null);
    jwt = $state<string | null>(null); // Google ID Token
    salt = $state<string | null>(null); // The 8-char PIN

    // Derived Identity
    // identityCommitment = Pedersen(email, Hash(salt))
    identityCommitment = $state<string | null>(null);

    // Discovered Chain Data
    totalAllocation = $state<bigint>(0n);
    claimedAmount = $state<bigint>(0n);
    vestedAmount = $state<bigint>(0n);
    claimableAmount = $derived(this.vestedAmount - this.claimedAmount);
    isEligible = $derived(this.totalAllocation > 0n);

    // Claim Execution
    targetWallet = $state<string | null>(null); // Address
    proof = $state<ZKProof | null>(null); // Hex proof
    txHash = $state<string | null>(null);

    // Vesting Schedule
    vestingInfo = $state<{
        vestingStart: number;
        cliffDuration: number;
        vestingDuration: number;
        vestingPeriod: number;
        completedPeriods: number;
        totalPeriods: number;
    } | null>(null);

    // Computed Vesting Props
    cliffEndDate = $derived(this.vestingInfo ? new Date((this.vestingInfo.vestingStart + this.vestingInfo.cliffDuration) * 1000) : null);

    isCliffPassed = $derived.by(() => {
        if (!this.cliffEndDate) return false;
        return Date.now() > this.cliffEndDate.getTime();
    });

    nextUnlockDate = $derived.by(() => {
        if (!this.vestingInfo) return null;
        // If fully vested
        if (this.vestingInfo.completedPeriods >= this.vestingInfo.totalPeriods) return null;

        // Calculate next period time
        const start = this.vestingInfo.vestingStart;
        const cliff = this.vestingInfo.cliffDuration;
        const period = this.vestingInfo.vestingPeriod;
        // The periods start after cliff.
        // Period 0 ends at start + cliff + period
        // Period n ends at start + cliff + (n+1)*period

        // However, "completedPeriods" usually means how many full periods have passed.
        // So the next unlock (end of next period) is:
        const nextPeriodIndex = this.vestingInfo.completedPeriods + 1;
        const nextUnlockTimestamp = start + cliff + (nextPeriodIndex * period);

        return new Date(nextUnlockTimestamp * 1000);
    });

    percentVested = $derived.by(() => {
        if (!this.vestingInfo || this.vestingInfo.totalPeriods === 0) return 0;
        // Use completed periods for discrete steps, or time-based for smooth?
        // Backlog implies progress bar.
        // Using strict completed periods per contract logic usually best for "claimable".
        return (this.vestingInfo.completedPeriods / this.vestingInfo.totalPeriods) * 100;
    });

    constructor() {
        // Recover session if exists (excluding PIN)
        this.recoverSession();
    }

    // --- Actions ---

    setCredentials(email: string, jwt: string, salt: string) {
        this.email = email;
        this.jwt = jwt;
        this.salt = salt;

        // We will calculate commitment in the service layer, but store it here
        // For now, reset discovery until validated
        this.totalAllocation = 0n;
        this.claimedAmount = 0n;
        this.vestedAmount = 0n;
    }

    setAllocation(total: bigint, claimed: bigint, vested: bigint, commitment: string) {
        this.totalAllocation = total;
        this.claimedAmount = claimed;
        this.vestedAmount = vested;
        this.identityCommitment = commitment;

        if (total > 0n) {
            this.saveSession(); // Save minimal non-secret state
        }
    }

    setTargetWallet(address: string) {
        this.targetWallet = address;
        this.saveSession();
    }

    setProof(proof: ZKProof) {
        this.proof = proof;
        this.nextStep();
    }

    setTxHash(hash: string) {
        this.txHash = hash;
    }

    setVestingInfo(
        schedule: { vestingStart: number; cliffDuration: number; vestingDuration: number; vestingPeriod: number },
        progress: { completed: number; total: number }
    ) {
        this.vestingInfo = {
            ...schedule,
            completedPeriods: progress.completed,
            totalPeriods: progress.total
        };
    }

    // --- Navigation ---

    nextStep() {
        if (this.currentStep < 5) {
            this.currentStep = (this.currentStep + 1) as ClaimStep;
            this.saveSession();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep = (this.currentStep - 1) as ClaimStep;
            this.saveSession();
        }
    }

    goToStep(step: ClaimStep) {
        this.currentStep = step;
        this.saveSession();
    }

    reset() {
        this.currentStep = 1;
        this.error = null;
        this.email = null;
        this.jwt = null;
        this.salt = null;
        this.identityCommitment = null;
        this.totalAllocation = 0n;
        this.claimedAmount = 0n;
        this.vestedAmount = 0n;
        this.targetWallet = null;
        this.proof = null;
        this.txHash = null;
        this.vestingInfo = null;

        if (browser) {
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    // --- Persistence (SessionStorage Only) ---

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.currentStep,
            email: this.email,
            // jwt: this.jwt, // Optional to persist, maybe expire?
            // NEVERY PERSIST SALT
            identityCommitment: this.identityCommitment,
            totalAllocation: this.totalAllocation.toString(), // BigInt -> String
            claimedAmount: this.claimedAmount.toString(),
            vestedAmount: this.vestedAmount.toString(),
            targetWallet: this.targetWallet
        };

        sessionStorage.setItem('claim_flow_state', JSON.stringify(data));
    }

    private recoverSession() {
        if (!browser) return;

        const raw = sessionStorage.getItem('claim_flow_state');
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            this.currentStep = data.step as ClaimStep;
            this.email = data.email;
            this.identityCommitment = data.identityCommitment;
            this.totalAllocation = BigInt(data.totalAllocation || '0');
            this.claimedAmount = BigInt(data.claimedAmount || '0');
            this.vestedAmount = BigInt(data.vestedAmount || '0');
            this.targetWallet = data.targetWallet;
        } catch (e) {
            console.warn('Failed to recover claim session', e);
            sessionStorage.removeItem('claim_flow_state');
        }
    }
}

export const claimStore = new ClaimFlowState();

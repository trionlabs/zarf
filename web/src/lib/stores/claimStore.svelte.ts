import { browser } from '$app/environment';
import type { ZKProof, MerkleClaim, MerkleTreeData } from '$lib/types';
import { computeIdentityCommitment, stringToBytes, pedersenHashBytes, pedersenHashField } from '$lib/crypto/merkleTree';
import { fetchDistributionData, type DistributionData } from '$lib/services/distribution';
import { isEpochClaimed } from '$lib/contracts/contracts';
import { type Address } from 'viem';

/**
 * Claim Store - InMemory State for the Claim Flow (Discrete Vesting Edition)
 * 
 * SECURITY CRITICAL:
 * This store handles the User's MASTER SALT and Epoch Secrets.
 * It is effectively an "InMemory" store. 
 * We explicitly DO NOT persist derived secrets to storage unless necessary for the active session.
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
    // ==========================================
    // State Definition
    // ==========================================
    state = $state({
        // Core Identity & Discovery
        masterSalt: null as string | null,
        epochs: [] as EpochClaim[],
        vestingSchedule: null as DistributionData['schedule'] | null,

        // Flow Control
        currentStep: 1 as ClaimStep,
        loading: false,
        error: null as string | null,
        statusMessage: null as string | null,

        // User Inputs (Session Context)
        email: "" as string | null,
        jwt: "" as string | null,
        pin: "" as string | null,
        contractAddress: null as string | null, // Context Safety
        targetWallet: null as string | null,

        // Transaction & Proof State
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

    get totalAllocation() {
        return this.state.epochs.reduce((sum, e) => sum + e.amount, 0n);
    }

    get claimedAmount() {
        return this.state.epochs.filter(e => e.isClaimed).reduce((sum, e) => sum + e.amount, 0n);
    }

    get unlockedAmount() {
        return this.state.epochs.filter(e => !e.isLocked).reduce((sum, e) => sum + e.amount, 0n);
    }

    get vestedAmount() {
        return this.unlockedAmount;
    }

    get claimableAmount() {
        return this.state.epochs.filter(e => !e.isLocked && !e.isClaimed).reduce((sum, e) => sum + e.amount, 0n);
    }

    get isEligible() {
        return this.state.epochs.length > 0;
    }

    get isCliffPassed() {
        if (!this.state.vestingSchedule) return true;
        const start = Number(this.state.vestingSchedule.vestingStart);
        const cliff = Number(this.state.vestingSchedule.cliffDuration);
        return (Date.now() / 1000) >= (start + cliff);
    }

    // Direct State Accessors
    get currentStep() { return this.state.currentStep; }
    get isLoading() { return this.state.loading; }
    get error() { return this.state.error; }
    get statusMessage() { return this.state.statusMessage; }
    get masterSalt() { return this.state.masterSalt; }
    get epochs() { return this.state.epochs; }
    get email() { return this.state.email; }
    get pin() { return this.state.pin; }
    get jwt() { return this.state.jwt; }
    get targetWallet() { return this.state.targetWallet; }
    get proof() { return this.state.proof; }
    get contractAddress() { return this.state.contractAddress; }
    get vestingSchedule() { return this.state.vestingSchedule; }

    get selectedEpoch() {
        return this.state.selectedEpochIndex !== null ? this.state.epochs[this.state.selectedEpochIndex] : null;
    }

    // ==========================================
    // Actions (State Mutators)
    // ==========================================

    setCredentials(email: string, salt: string, pin: string) {
        this.state.email = email;
        this.state.masterSalt = salt;
        this.state.pin = pin;
        // Logic: Credentials usually change at start of flow, valid point to save?
        // Usually dependent on subsequent 'discoverEpochs' success.
    }

    setProof(proof: ZKProof) {
        this.state.proof = proof;
        this.saveSession();
    }

    setTxHash(hash: string) {
        this.state.txHash = hash;
        this.saveSession(); // Optional, but good for persistence on success screen
    }

    setEpochs(epochs: EpochClaim[]) {
        console.log('[claimStore] Setting epochs:', epochs.length);
        this.state.epochs = epochs;

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
    }

    setTargetWallet(address: string) {
        this.state.targetWallet = address;
        this.saveSession();
    }

    // ==========================================
    // Flow Logic
    // ==========================================

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
        this.state.error = null;
        this.state.loading = false;
        this.state.proof = null;
        this.state.selectedEpochIndex = null;
        this.state.jwt = null;

        // Clear session storage
        if (browser) {
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    markAsClaimed(commitment: string) {
        const index = this.state.epochs.findIndex(e => e.identityCommitment === commitment);
        if (index !== -1) {
            this.state.epochs[index].isClaimed = true;
            this.state.epochs[index].canClaim = false;
            this.saveSession();
        }
    }

    selectNextClaimableEpoch() {
        if (!this.state.epochs) return false;
        const index = this.state.epochs.findIndex(e => !e.isLocked && !e.isClaimed);
        if (index !== -1) {
            this.state.selectedEpochIndex = index;
            this.saveSession();
            return true;
        }
        return false;
    }

    /**
     * DISCOVERY LOGIC
     * Handles retrieving distribution data, computing secrets, and finding user's allocations.
     */
    async discoverEpochs(email: string, jwt: string, pin: string, contractAddress: string) {
        this.state.loading = true;
        this.state.error = null;
        this.state.statusMessage = "Loading distribution data...";
        this.state.epochs = [];
        this.state.contractAddress = contractAddress; // Store context

        try {
            console.log('[Discovery] Starting for:', email);

            // 1. Fetch Static Distribution Data
            const data = await fetchDistributionData(contractAddress);
            this.setSchedule(data.schedule);

            // 2. Create Lookup Map for O(1) access
            const commitmentMap = data.commitments;
            const normalizedMap: Record<string, typeof data.commitments[string]> = {};

            for (const [key, val] of Object.entries(commitmentMap)) {
                normalizedMap[key.toLowerCase()] = val;
                // Add unpadded version if needed
                const cleanKey = '0x' + key.slice(2).replace(/^0+/, '');
                if (cleanKey !== key.toLowerCase()) {
                    normalizedMap[cleanKey.toLowerCase()] = val;
                }
            }

            console.log('[Discovery] Total Commitments:', Object.keys(commitmentMap).length);

            // 3. Discovery Loop (Derive secrets -> Check map)
            const foundEpochs: EpochClaim[] = [];
            let index = 0;
            const MAX_EPOCHS = 200;

            this.state.statusMessage = "Discovering epochs...";

            // Hash Chain Initialization
            const masterSaltBytes = stringToBytes(pin);
            let currentSecret = await pedersenHashBytes(masterSaltBytes); // Epoch 0 Result

            while (index < MAX_EPOCHS) {
                // a. Derive Epoch Secret (Recursive Hash Chain)
                if (index > 0) {
                    currentSecret = await pedersenHashField(currentSecret);
                }
                const epochSecret = '0x' + currentSecret.toString(16);

                // b. Compute Commitment
                const commitmentBigInt = await computeIdentityCommitment(email, currentSecret);
                const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');
                const commitmentLower = commitment.toLowerCase();

                // c. Check Existence (Offline)
                let meta = normalizedMap[commitmentLower];
                if (!meta) {
                    // Try unpadded backup check
                    const unpadded = '0x' + commitment.slice(2).replace(/^0+/, '').toLowerCase();
                    meta = normalizedMap[unpadded];
                }

                if (meta) {
                    // Found an allocation for this epoch
                    let isClaimed = false;
                    try {
                        isClaimed = await isEpochClaimed(commitment, contractAddress as Address);
                    } catch (err) {
                        console.warn(`[Discovery] Status check failed for ${index}`, err);
                    }

                    const unlockTime = Number(meta.unlockTime);

                    foundEpochs.push({
                        email,
                        amount: BigInt(meta.amount),
                        salt: epochSecret,
                        identityCommitment: commitment,
                        leafIndex: meta.index,
                        leaf: 0n, // Computed later if needed
                        unlockTime: unlockTime,
                        isClaimed,
                        isLocked: (Date.now() / 1000) < unlockTime,
                        canClaim: !isClaimed && (Date.now() / 1000) >= unlockTime
                    });

                    index++;
                } else {
                    // Gap detected?
                    if (index === 0) break; // Wrong PIN/Email (No epoch 0 found)
                    else break; // End of user's sequence
                }
            }

            if (foundEpochs.length === 0) {
                throw new Error("No allocation found. Please check your Email and PIN.");
            }

            // Success
            this.setCredentials(email, "", pin);
            this.state.jwt = jwt;
            this.setEpochs(foundEpochs);
            this.nextStep(); // Proceed to Dashboard

        } catch (e: any) {
            console.error("Discovery failed:", e);
            let msg = e.message || "Failed to discover epochs.";

            if (msg.includes("404")) msg = "Contract distribution data not found.";

            this.setError(msg);
        } finally {
            this.state.loading = false;
            this.state.statusMessage = null;
        }
    }

    // ==========================================
    // Persistence (Session Storage)
    // ==========================================

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.state.currentStep,
            email: this.state.email,
            targetWallet: this.state.targetWallet,
            pin: this.state.pin,
            jwt: this.state.jwt,
            epochs: this.state.epochs,
            selectedEpochIndex: this.state.selectedEpochIndex,
            proof: this.state.proof,
            masterSalt: this.state.masterSalt,
            contractAddress: this.state.contractAddress
        };

        try {
            sessionStorage.setItem('claim_flow_state', JSON.stringify(data, this.replacer));
        } catch (e) {
            console.warn('Failed to save session:', e);
        }
    }

    private recoverSession() {
        if (!browser) return;

        // Security Check: Detect fresh navigation/entry
        try {
            const navEntries = performance.getEntriesByType("navigation");
            if (navEntries.length > 0) {
                const nav = navEntries[0] as PerformanceNavigationTiming;
                // 'navigate' indicates a fresh URL entry or link click, not a reload/back_forward
                if (nav.type === 'navigate') {
                    console.log('[ClaimStore] Fresh navigation detected. Clearing session.');
                    sessionStorage.removeItem('claim_flow_state');
                }
            }
        } catch (e) {
            console.warn('[ClaimStore] Navigation timing check failed', e);
        }

        const raw = sessionStorage.getItem('claim_flow_state');
        if (!raw) return;

        try {
            const data = JSON.parse(raw, this.reviver);

            // Restore State
            this.state.currentStep = data.step as ClaimStep;
            this.state.email = data.email || null;
            this.state.targetWallet = data.targetWallet || null;
            this.state.pin = data.pin || null;
            this.state.jwt = data.jwt || null;
            this.state.epochs = data.epochs || [];
            this.state.selectedEpochIndex = data.selectedEpochIndex ?? null;
            this.state.proof = data.proof || null;
            this.state.masterSalt = data.masterSalt || null;
            this.state.contractAddress = data.contractAddress || null;

        } catch (e) {
            console.warn('Failed to recover claim session', e);
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    // JSON Helpers for BigInt Serialization
    private replacer(key: string, value: any) {
        if (typeof value === 'bigint') {
            return { __type: 'bigint', value: value.toString() };
        }
        return value;
    }

    private reviver(key: string, value: any) {
        if (value && typeof value === 'object' && value.__type === 'bigint') {
            return BigInt(value.value);
        }
        return value;
    }
}

export const claimStore = new ClaimFlowState();

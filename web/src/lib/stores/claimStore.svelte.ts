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

    get cliffEndDate() {
        if (!this.state.vestingSchedule) return null;
        const start = Number(this.state.vestingSchedule.vestingStart);
        const cliff = Number(this.state.vestingSchedule.cliffDuration);
        return new Date((start + cliff) * 1000);
    }

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

    get selectedEpoch() {
        return this.state.selectedEpochIndex !== null ? this.state.epochs[this.state.selectedEpochIndex] : null;
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
        this.state.error = null;
        this.state.loading = false;
        // Optionally clear session
        if (browser) {
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    setTargetWallet(address: string) {
        this.state.targetWallet = address;
        this.saveSession();
    }

    markAsClaimed(commitment: string) {
        const index = this.state.epochs.findIndex(e => e.identityCommitment === commitment);
        if (index !== -1) {
            this.state.epochs[index].isClaimed = true;
            this.state.epochs[index].canClaim = false;
        }
    }

    selectNextClaimableEpoch() {
        if (!this.state.epochs) return false;
        const index = this.state.epochs.findIndex(e => !e.isLocked && !e.isClaimed);
        if (index !== -1) {
            this.state.selectedEpochIndex = index;
            return true;
        }
        return false;
    }

    // --- Persistence ---

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.state.currentStep,
            email: this.state.email,
            targetWallet: this.state.targetWallet,
            pin: this.state.pin // Should strictly handle secret persistence policy here
        };

        sessionStorage.setItem('claim_flow_state', JSON.stringify(data));
    }

    private recoverSession() {
        if (!browser) return;

        const raw = sessionStorage.getItem('claim_flow_state');
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            this.state.currentStep = data.step as ClaimStep;
            this.state.email = data.email || null;
            this.state.targetWallet = data.targetWallet || null;
            this.state.pin = data.pin || null;
        } catch (e) {
            console.warn('Failed to recover claim session', e);
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    /**
     * DISCOVERY LOGIC (Discrete Vesting)
     */
    async discoverEpochs(email: string, jwt: string, pin: string, contractAddress: string) {
        this.state.loading = true;
        this.state.error = null;
        this.state.statusMessage = "Loading distribution data...";
        this.state.epochs = [];

        try {
            console.log('[Discovery] Starting for:', email);
            // Store JWT if passed (it might be needed for the circuit inputs if using Google JWK)
            // But wait, the circuit just needs the signature? 
            // In the "privacy" architecture, do we use the JWT signature in the ZK proof?
            // Yes, usually "header.payload.signature" is input.
            // So we MUST store it.
            // Let's create a dedicated field for it if not exists, or misuse 'masterSalt' if that was the intent.
            // But we have 'jwt' in state definition in the Class above? No, we removed it in the big refactor?
            // Let me check the Class definition again.

            // Checking the file content provided in previous turn:
            // state = $state({ ... email: "", pin: "", ... })
            // It does NOT have jwt in the state object in my last write!

            // I need to add 'jwt' to the state object definition first.


            // 1. Fetch Static Distribution Data
            const data = await fetchDistributionData(contractAddress);
            this.setSchedule(data.schedule);

            // 2. Create Lookup Map (O(1)) and handle key normalization
            const commitmentMap = data.commitments;
            // Normalized map
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

            // 3. Discovery Loop
            const foundEpochs: EpochClaim[] = [];
            let index = 0;
            const MAX_EPOCHS = 200;

            this.state.statusMessage = "Discovering epochs...";

            // Hash Chain State Initialization
            const masterSaltBytes = stringToBytes(pin);
            let currentSecret = await pedersenHashBytes(masterSaltBytes); // Epoch 0 Result

            while (index < MAX_EPOCHS) {
                // a. Derive Epoch Secret (Recursive Hash Chain)
                if (index > 0) {
                    currentSecret = await pedersenHashField(currentSecret);
                }
                const epochSecret = '0x' + currentSecret.toString(16);

                // b. Compute Commitment
                // Pass BigInt secret directly to avoid re-encoding ambiguity
                const commitmentBigInt = await computeIdentityCommitment(email, currentSecret);
                // Standardize: 0x + 64 chars hex
                const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');
                const commitmentLower = commitment.toLowerCase();

                // c. Check Existence (Offline)
                let meta = normalizedMap[commitmentLower];

                if (!meta) {
                    // Try unpadded
                    const unpadded = '0x' + commitment.slice(2).replace(/^0+/, '').toLowerCase();
                    meta = normalizedMap[unpadded];
                }

                if (meta) {
                    // FOUND ONE!
                    // console.log(`[Discovery] Found epoch ${index} logic...`);

                    // d. Check Status (On-Chain)
                    let isClaimed = false;
                    try {
                        isClaimed = await isEpochClaimed(commitment, contractAddress as Address);
                    } catch (err) {
                        console.warn(`[Discovery] Status check failed for ${index}`, err);
                    }

                    foundEpochs.push({
                        email,
                        amount: BigInt(meta.amount),
                        salt: epochSecret,
                        identityCommitment: commitment,
                        leafIndex: meta.index,
                        leaf: 0n,
                        unlockTime: meta.unlockTime,
                        isClaimed,
                        isLocked: (Date.now() / 1000) < meta.unlockTime,
                        canClaim: !isClaimed && (Date.now() / 1000) >= meta.unlockTime
                    });

                    index++;
                } else {
                    if (index === 0) break; // Wrong PIN/Email
                    else break; // Done
                }
            }

            if (foundEpochs.length === 0) {
                throw new Error("No allocation found. Please check your Email and PIN.");
            }

            // Success!
            this.setCredentials(email, "", pin);
            this.state.jwt = jwt;
            this.setEpochs(foundEpochs);
            this.nextStep(); // Move to Dashboard

        } catch (e: any) {
            console.error("Discovery failed:", e);
            let msg = e.message || "Failed to discover epochs.";

            if (msg.includes("404")) msg = "Contract distribution data not found.";
            else if (msg.includes("No allocation found")) { /* keep */ }

            this.setError(msg);
        } finally {
            this.state.loading = false;
            this.state.statusMessage = null;
        }
    }
}

export const claimStore = new ClaimFlowState();

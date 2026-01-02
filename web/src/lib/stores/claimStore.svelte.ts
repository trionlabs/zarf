import { browser } from '$app/environment';
import type { ZKProof, MerkleClaim, MerkleTreeData } from '$lib/types';
import { computeIdentityCommitment } from '$lib/crypto/merkleTree';
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
}

export class ClaimFlowState {
    // UI State
    currentStep = $state<ClaimStep>(1);
    isLoading = $state(false);
    error = $state<string | null>(null);
    statusMessage = $state<string | null>(null); // Progress updates

    // Session Data (Identification)
    email = $state<string | null>(null);
    jwt = $state<string | null>(null);
    masterSalt = $state<string | null>(null);

    // Discovered Epochs
    epochs = $state<EpochClaim[]>([]);
    vestingSchedule = $state<DistributionData['schedule'] | null>(null); // Store schedule metadata

    // Aggregates
    totalAllocation = $derived(this.epochs.reduce((sum, e) => sum + e.amount, 0n));
    // Only count claimed epochs
    claimedAmount = $derived(this.epochs.filter(e => e.isClaimed).reduce((sum, e) => sum + e.amount, 0n));
    // Unlockable amount (passed time lock) - This is "Vested"
    unlockedAmount = $derived(this.epochs.filter(e => !e.isLocked).reduce((sum, e) => sum + e.amount, 0n));

    // Alias for UI compatibility
    vestedAmount = $derived(this.unlockedAmount);

    // Claimable = Unlocked AND Not Claimed
    claimableAmount = $derived(this.epochs.filter(e => !e.isLocked && !e.isClaimed).reduce((sum, e) => sum + e.amount, 0n));

    isEligible = $derived(this.epochs.length > 0);

    isCliffPassed = $derived(
        this.vestingSchedule
            ? (Date.now() / 1000) >= (Number(this.vestingSchedule.vestingStart) + Number(this.vestingSchedule.cliffDuration))
            : true // Fallback to true if unknown, or maybe false?
    );

    // Claim Execution
    selectedEpochIndex = $state<number | null>(null); // Index in this.epochs array
    selectedEpoch = $derived(this.selectedEpochIndex !== null ? this.epochs[this.selectedEpochIndex] : null);

    targetWallet = $state<string | null>(null);
    proof = $state<ZKProof | null>(null);
    txHash = $state<string | null>(null);

    constructor() {
        this.recoverSession();
    }

    // --- Actions ---

    setCredentials(email: string, jwt: string, masterSalt: string) {
        this.email = email;
        this.jwt = jwt;
        this.masterSalt = masterSalt;

        // Reset epochs on new login
        this.epochs = [];
    }

    /**
     * DISCOVERY ENGINE (The Core Logic)
     * 
     * Loops through potential epoch indices (0..N) and checks if they exist 
     * in the off-chain distribution data.
     */
    async discoverEpochs(email: string, pin: string, contractAddress: string) {
        this.isLoading = true;
        this.error = null;
        this.statusMessage = "Loading distribution data...";
        this.epochs = [];

        try {
            // 1. Fetch Static Data (Leaves & Schedule & Commitment Map)
            // We assume the JSON has a 'commitments' map for O(1) lookup
            const data = await fetchDistributionData(contractAddress);

            // Use typed map for O(1) lookup
            const commitmentMap = data.commitments;
            this.vestingSchedule = data.schedule;

            this.statusMessage = "Deriving secure keys...";

            let index = 0;
            const foundEpochs: EpochClaim[] = [];
            const MAX_EPOCHS = 100; // Safety break

            // 2. The Discovery Loop
            while (index < MAX_EPOCHS) {
                // a. Derive Secret: "PIN_Index"
                const epochSecret = `${pin}_${index}`;

                // b. Compute Commitment (Pedersen Hash)
                const commitmentBigInt = await computeIdentityCommitment(email, epochSecret);
                // Pad to 32 bytes hex
                const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');

                // c. Check Existence (Offline)
                const meta = commitmentMap[commitment];

                if (meta) {
                    // FOUND ONE!
                    // d. Check Status (On-Chain)
                    // We can optimize this by batching, but for now 1-by-1 is safer/easier
                    const isClaimed = await isEpochClaimed(commitment, contractAddress as Address);

                    // e. Calculate Unlock Time (if not in meta)
                    // meta should ideally have { amount, leafIndex }
                    // If meta is just "true", we are stuck on Amount. Assuming meta has Amount.

                    foundEpochs.push({
                        email,
                        amount: BigInt(meta.amount),
                        salt: epochSecret,
                        identityCommitment: commitment,
                        leafIndex: meta.index, // Needed for Proof Gen
                        leaf: 0n, // We'll compute this later or need it from meta
                        unlockTime: meta.unlockTime,

                        isClaimed,
                        isLocked: (Date.now() / 1000) < meta.unlockTime,
                        canClaim: !isClaimed && (Date.now() / 1000) >= meta.unlockTime
                    });

                    index++;
                } else {
                    // If we miss Index 0, maybe wrong PIN?
                    // If we hit a gap after finding some, assuming end of schedule.
                    // Strict rule: Epochs are sequential 0..N.
                    if (index === 0) {
                        // Wrong credentials or not in list
                        break;
                    } else {
                        // End of stream
                        break;
                    }
                }
            }

            if (foundEpochs.length === 0) {
                throw new Error("No allocation found. Please check your Email and PIN.");
            }

            this.setEpochs(foundEpochs);
            this.setCredentials(email, "", pin); // Store session (JWT optional here?)

        } catch (e: any) {
            console.error("Discovery failed:", e);
            this.error = e.message || "Failed to discover epochs.";
            // Clear epochs on error
            this.epochs = [];
        } finally {
            this.isLoading = false;
            this.statusMessage = null;
        }
    }

    /**
     * Set discovered epochs and their statuses
     */
    setEpochs(epochs: EpochClaim[]) {
        this.epochs = epochs;
        if (epochs.length > 0) {
            this.saveSession();
        }
    }

    /**
     * Update status of a single epoch (e.g. after successful claim)
     */
    markAsClaimed(commitment: string) {
        const index = this.epochs.findIndex(e => e.identityCommitment === commitment);
        if (index !== -1) {
            // Create new object to trigger reactivity if needed (though Runes handles mutation fine)
            this.epochs[index].isClaimed = true;
            this.epochs[index].canClaim = false;
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
        this.statusMessage = null;
        this.email = null;
        this.jwt = null;
        this.masterSalt = null;
        this.epochs = [];
        this.selectedEpochIndex = null;
        this.targetWallet = null;
        this.proof = null;
        this.txHash = null;

        if (browser) {
            sessionStorage.removeItem('claim_flow_state');
        }
    }

    // --- Persistence ---

    private saveSession() {
        if (!browser) return;

        const data = {
            step: this.currentStep,
            email: this.email,
            // jwt: this.jwt, 
            // masterSalt: NEVER PERSIST
            targetWallet: this.targetWallet,
            // We can persist public epoch data (commitments/statuses) but NOT secrets
            // Actually, to endure refresh, we might need to rely on User re-entering PIN?
            // Or we assume session ends on refresh.
            // Let's persist email and basic state.
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
            this.targetWallet = data.targetWallet;
        } catch (e) {
            console.warn('Failed to recover claim session', e);
            sessionStorage.removeItem('claim_flow_state');
        }
    }
}

export const claimStore = new ClaimFlowState();

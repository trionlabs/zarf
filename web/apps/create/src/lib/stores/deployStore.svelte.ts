import type { Distribution, Recipient, MerkleTreeData } from './types';
import type { DeployProgress, DeployConfig } from '../services/deploy';
import type { Address } from 'viem';
import { safeParse, safeStringify } from '@zarf/core/utils/json';

export type DeployStep = 1 | 2 | 3 | 4;

export class DeployState {
    // State is reactive by default with Runes
    currentStep = $state<DeployStep>(1);
    isLoading = $state(false);
    error = $state<string | null>(null);

    // Data
    distribution = $state<Distribution | null>(null);
    merkleResult = $state<MerkleTreeData | null>(null);
    isGeneratingMerkle = $state(false);
    merkleError = $state<string | null>(null);

    // Step 2 & 3
    isBackupDownloaded = $state(false);
    isBackupConfirmed = $state(false);
    isWalletConnected = $state(false);
    walletAddress = $state<Address | null>(null);

    // Step 4
    deployProgress = $state<DeployProgress | null>(null);
    contractAddress = $state<Address | null>(null);
    isDeployed = $state(false);

    // Recovery Fields (The Write-Ahead Log)
    approveTxHash = $state<string | null>(null);
    createTxHash = $state<string | null>(null);

    // External guards (Derived)
    canContinueToStep2 = $derived(!!this.merkleResult);
    canContinueToStep3 = $derived(this.isBackupDownloaded && this.isBackupConfirmed);
    canContinueToStep4 = $derived(this.isWalletConnected);

    constructor() {
        // No auto-load in constructor because we need distributionId
    }

    // Persistence Logic ("Write-Ahead Log")
    private save() {
        if (typeof window === "undefined" || !this.distribution?.id) return;

        try {
            const state = {
                version: 2,
                currentStep: this.currentStep,
                merkleResult: this.merkleResult, // Critical: contains salts
                isBackupDownloaded: this.isBackupDownloaded,
                isBackupConfirmed: this.isBackupConfirmed,
                // Recovery fields
                approveTxHash: this.approveTxHash,
                createTxHash: this.createTxHash,
                timestamp: Date.now()
            };
            const key = `deploy_state_${this.distribution.id}`;
            localStorage.setItem(key, safeStringify(state));
        } catch (e) {
            console.warn("Failed to save deploy state", e);
        }
    }

    private load(distributionId: string) {
        if (typeof window === "undefined") return;

        try {
            const key = `deploy_state_${distributionId}`;
            const raw = localStorage.getItem(key);
            if (!raw) return;

            const state = safeParse(raw);

            // Validate TTL (e.g., 24 hours). If too old, discard (security/stale data)
            const ONE_DAY = 24 * 60 * 60 * 1000;
            if (state.timestamp && (Date.now() - state.timestamp > ONE_DAY)) {
                localStorage.removeItem(key);
                return;
            }

            if (state) {
                // Restore critical state
                this.currentStep = state.currentStep || 1;
                this.merkleResult = state.merkleResult;
                this.isBackupDownloaded = !!state.isBackupDownloaded;
                this.isBackupConfirmed = !!state.isBackupConfirmed;

                // Restore recovery state
                this.approveTxHash = state.approveTxHash || null;
                this.createTxHash = state.createTxHash || null;
            }
        } catch (e) {
            console.warn("Failed to load deploy state", e);
        }
    }

    // Actions
    initDistribution(dist: Distribution) {
        // If switching distributions or initializing fresh
        if (this.distribution?.id !== dist.id) {
            // CRITICAL: Reset state first to prevent leakage from previous distribution!
            this.reset();

            this.distribution = dist; // Set it first so we can load
            this.load(dist.id); // Attempt recovery
        } else {
            // Re-sync object reference
            this.distribution = dist;
        }
        // Always save to ensure fresh timestamp
        this.save();
    }

    goToStep(step: DeployStep) {
        this.currentStep = step;
        this.save();
    }

    nextStep() {
        this.currentStep = Math.min(this.currentStep + 1, 4) as DeployStep;
        this.save();
    }

    prevStep() {
        this.currentStep = Math.max(this.currentStep - 1, 1) as DeployStep;
        this.save();
    }

    // Merkle Actions
    startMerkleGeneration() {
        this.isGeneratingMerkle = true;
        this.merkleError = null;
    }

    setMerkleResult(result: MerkleTreeData) {
        this.isGeneratingMerkle = false;
        this.merkleResult = result;
        this.save(); // Critical save point
    }

    setMerkleError(error: string) {
        this.isGeneratingMerkle = false;
        this.merkleError = error;
    }

    // Backup Actions
    setBackupDownloaded(downloaded: boolean) {
        this.isBackupDownloaded = downloaded;
        this.save();
    }

    setBackupConfirmed(confirmed: boolean) {
        this.isBackupConfirmed = confirmed;
        this.save();
    }

    // Wallet Actions
    setWalletState(connected: boolean, address: Address | null) {
        this.isWalletConnected = connected;
        this.walletAddress = address;
    }

    // Deploy Actions
    updateDeployProgress(progress: DeployProgress) {
        this.deployProgress = progress;
    }

    // Persist Transaction Hashes (The Write-Ahead Log)
    setApproveTx(hash: string) {
        this.approveTxHash = hash;
        this.save();
    }

    setCreateTx(hash: string) {
        this.createTxHash = hash;
        this.save();
    }

    setDeployed(address: Address) {
        this.isDeployed = true;
        this.contractAddress = address;
        // Clean up log on success
        if (typeof window !== "undefined" && this.distribution?.id) {
            localStorage.removeItem(`deploy_state_${this.distribution.id}`);
        }
    }

    setDeployError(error: string) {
        this.error = error;
    }

    reset(keepDistribution = false) {
        this.currentStep = 1;
        this.isLoading = false;
        this.error = null;
        if (!keepDistribution) this.distribution = null;
        this.merkleResult = null;
        this.isGeneratingMerkle = false;
        this.merkleError = null;
        this.isBackupDownloaded = false;
        this.isBackupConfirmed = false;
        this.isWalletConnected = false;
        this.walletAddress = null;
        this.deployProgress = null;
        this.contractAddress = null;
        this.isDeployed = false;
        this.approveTxHash = null;
        this.createTxHash = null;

        if (typeof window !== "undefined" && this.distribution?.id) {
            localStorage.removeItem(`deploy_state_${this.distribution.id}`);
        }
    }
}

// Global Singleton
export const deployStore = new DeployState();

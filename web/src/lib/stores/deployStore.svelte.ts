import type { Distribution, Recipient } from './types.js';
import type { DeployProgress, DeployConfig } from '../services/deploy.js';
import type { MerkleTreeResult } from '../services/merkleTree.js';
import type { Address } from 'viem';
import { safeParse, safeStringify } from '../utils/json.js';

export type DeployStep = 1 | 2 | 3 | 4;

export class DeployState {
    // State is reactive by default with Runes
    currentStep = $state<DeployStep>(1);
    isLoading = $state(false);
    error = $state<string | null>(null);

    // Data
    distribution = $state<Distribution | null>(null);
    merkleResult = $state<MerkleTreeResult | null>(null);
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

    // External guards (Derived)
    canContinueToStep2 = $derived(!!this.merkleResult);
    canContinueToStep3 = $derived(this.isBackupDownloaded && this.isBackupConfirmed);
    canContinueToStep4 = $derived(this.isWalletConnected);

    constructor() {
        // Attempt to restore session state to prevent "Salt Mismatch" disaster
        this.load();
    }

    // Persistence Logic
    private save() {
        if (typeof window === "undefined") return;

        try {
            const state = {
                currentStep: this.currentStep,
                distribution: this.distribution,
                merkleResult: this.merkleResult, // Critical: contains salts
                isBackupDownloaded: this.isBackupDownloaded,
                isBackupConfirmed: this.isBackupConfirmed,
                // Do not persist connection state (wallet must reconnect)
                // Do not persist errors or loading states
            };
            sessionStorage.setItem("deployState", safeStringify(state));
        } catch (e) {
            console.warn("Failed to save deploy state", e);
        }
    }

    private load() {
        if (typeof window === "undefined") return;

        try {
            const raw = sessionStorage.getItem("deployState");
            if (!raw) return;

            const state = safeParse(raw);
            if (state && state.distribution && state.distribution.id) {
                // Restore critical state
                this.currentStep = state.currentStep || 1;
                this.distribution = state.distribution;
                this.merkleResult = state.merkleResult;
                this.isBackupDownloaded = !!state.isBackupDownloaded;
                this.isBackupConfirmed = !!state.isBackupConfirmed;
            }
        } catch (e) {
            console.warn("Failed to load deploy state", e);
            sessionStorage.removeItem("deployState");
        }
    }

    // Actions
    initDistribution(dist: Distribution) {
        // If switching distributions, reset
        if (this.distribution?.id !== dist.id) {
            this.reset();
            this.distribution = dist;
            this.save();
        } else {
            // Same dist, keep state (it might be loaded from storage)
            // But ensure distribution object is fresh from wizardStore
            this.distribution = dist;
            // Don't save here to avoid overwriting merkleResult if it exists
        }
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

    setMerkleResult(result: MerkleTreeResult) {
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
        // Do not save wallet state
    }

    // Deploy Actions
    updateDeployProgress(progress: DeployProgress) {
        this.deployProgress = progress;
        // Could save progress, but might be tricky with non-serializable objects (if any)
    }

    setDeployed(address: Address) {
        this.isDeployed = true;
        this.contractAddress = address;
        // Clear storage on success to clean up
        if (typeof window !== "undefined") {
            sessionStorage.removeItem("deployState");
        }
    }

    setDeployError(error: string) {
        this.error = error;
    }

    reset() {
        this.currentStep = 1;
        this.isLoading = false;
        this.error = null;
        this.distribution = null;
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

        if (typeof window !== "undefined") {
            sessionStorage.removeItem("deployState");
        }
    }
}

// Global Singleton
export const deployStore = new DeployState();

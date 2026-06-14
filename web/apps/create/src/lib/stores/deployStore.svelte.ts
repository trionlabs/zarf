import type { Distribution, MerkleTreeData } from './types';
import type { StellarAddress, StellarContractId } from '@zarf/core/types';
import { getActiveStellarNetworkId } from '@zarf/core/config/runtime';
import { safeParse, safeStringify } from '@zarf/core/utils/json';
import { warn } from '@zarf/core/utils/log';

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
    isPinning = $state(false);
    pinError = $state<string | null>(null);

    // Step 2 & 3
    isBackupDownloaded = $state(false);
    isBackupConfirmed = $state(false);
    isWalletConnected = $state(false);
    walletAddress = $state<StellarAddress | null>(null);

    // Step 4
    contractAddress = $state<StellarContractId | null>(null);
    isDeployed = $state(false);

    // Recovery Fields (The Write-Ahead Log)
    approveTxHash = $state<string | null>(null);
    createTxHash = $state<string | null>(null);
    metadataCid = $state<string | null>(null);
    schedulePlanAtMs = $state<number | null>(null);

    // Evidence of an interrupted earlier attempt, restored from the WAL.
    // Display-only: warns the user that on-chain transactions may already
    // exist for this distribution before they start a fresh attempt.
    priorApproveTxHash = $state<string | null>(null);
    priorCreateTxHash = $state<string | null>(null);

    // External guards (Derived)
    canContinueToStep2 = $derived(!!this.merkleResult && !!this.metadataCid);
    canContinueToStep3 = $derived(this.isBackupDownloaded && this.isBackupConfirmed);
    canContinueToStep4 = $derived(this.isWalletConnected);

    constructor() {
        // No auto-load in constructor because we need distributionId
    }

    private storageKey(distributionId: string): string {
        try {
            return `deploy_state_${getActiveStellarNetworkId()}_${distributionId}`;
        } catch {
            return `deploy_state_${distributionId}`;
        }
    }

    // Persistence Logic ("Write-Ahead Log")
    //
    // v3: the merkle tree is deliberately NOT persisted. It carries every
    // recipient's email, PIN, and per-epoch secret — exactly the material an
    // attacker wants — and regeneration mints fresh random PINs, so a tree
    // restored out of sync with the downloaded backup CSV could deploy a
    // distribution whose secrets nobody holds. A reload therefore restarts
    // the deploy flow from Step 1; only on-chain evidence (tx hashes)
    // survives so an interrupted attempt is never silently forgotten.
    private save() {
        if (typeof window === 'undefined' || !this.distribution?.id) return;

        try {
            const state = {
                version: 3,
                approveTxHash: this.approveTxHash ?? this.priorApproveTxHash,
                createTxHash: this.createTxHash ?? this.priorCreateTxHash,
                timestamp: Date.now(),
            };
            const key = this.storageKey(this.distribution.id);
            localStorage.setItem(key, safeStringify(state));
        } catch (e) {
            warn('Failed to save deploy state', e);
        }
    }

    private load(distributionId: string) {
        if (typeof window === 'undefined') return;

        try {
            const key = this.storageKey(distributionId);
            const raw = localStorage.getItem(key);
            if (!raw) return;

            const state = safeParse(raw);

            // Older versions (v2) persisted the full merkle tree incl.
            // recipient PII — purge them on sight.
            if (!state || typeof state !== 'object' || state.version !== 3) {
                localStorage.removeItem(key);
                return;
            }

            // Discard stale evidence after 7 days (a completed deploy removes
            // the entry anyway via setDeployed).
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            if (state.timestamp && Date.now() - state.timestamp > SEVEN_DAYS) {
                localStorage.removeItem(key);
                return;
            }

            this.priorApproveTxHash = state.approveTxHash || null;
            this.priorCreateTxHash = state.createTxHash || null;
        } catch (e) {
            warn('Failed to load deploy state', e);
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
        this.metadataCid = null;
        this.schedulePlanAtMs = null;
        this.save(); // Critical save point
    }

    setMerkleError(error: string) {
        this.isGeneratingMerkle = false;
        this.merkleError = error;
    }

    startPinning() {
        this.isPinning = true;
        this.pinError = null;
    }

    setPinError(error: string) {
        this.isPinning = false;
        this.pinError = error;
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
    setWalletState(connected: boolean, address: StellarAddress | null) {
        this.isWalletConnected = connected;
        this.walletAddress = address;
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

    setMetadataCid(cid: string) {
        this.metadataCid = cid;
        this.isPinning = false;
        this.pinError = null;
        this.save();
    }

    setSchedulePlanAt(date: Date) {
        this.schedulePlanAtMs = date.getTime();
        this.save();
    }

    setDeployed(address: StellarContractId) {
        this.isDeployed = true;
        this.contractAddress = address;
        // Clean up log on success
        if (typeof window !== 'undefined' && this.distribution?.id) {
            localStorage.removeItem(this.storageKey(this.distribution.id));
        }
    }

    setDeployError(error: string) {
        this.error = error;
    }

    clearPendingTransactions() {
        this.approveTxHash = null;
        this.createTxHash = null;
        this.save();
    }

    reset(keepDistribution = false) {
        this.currentStep = 1;
        this.isLoading = false;
        this.error = null;
        if (!keepDistribution) this.distribution = null;
        this.merkleResult = null;
        this.isGeneratingMerkle = false;
        this.merkleError = null;
        this.isPinning = false;
        this.pinError = null;
        this.isBackupDownloaded = false;
        this.isBackupConfirmed = false;
        this.isWalletConnected = false;
        this.walletAddress = null;
        this.contractAddress = null;
        this.isDeployed = false;
        this.approveTxHash = null;
        this.createTxHash = null;
        this.metadataCid = null;
        this.schedulePlanAtMs = null;
        this.priorApproveTxHash = null;
        this.priorCreateTxHash = null;

        if (typeof window !== 'undefined' && this.distribution?.id) {
            localStorage.removeItem(this.storageKey(this.distribution.id));
        }
    }
}

// Global Singleton
export const deployStore = new DeployState();

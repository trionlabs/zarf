/**
 * Claim Flow Store - Private Claim Workflow (5 Steps)
 * 
 * Manages state for the claiming process:
 * 1. View Dashboard / Select Distribution
 * 2. Select Tranche
 * 3. Connect Wallet & Generate ZK Proof
 * 4. Submit Claim Transaction
 * 5. Success
 * 
 * Uses sessionStorage for persistence (security-conscious).
 * Sensitive data (proofs, tx hashes) are NOT persisted.
 * 
 * @module stores/claimFlowStore
 */

import { browser } from '$app/environment';
import type { ClaimFlowState, ClaimableDistribution, SelectedTranche, ClaimStep } from './types';
import type { Address } from 'viem';

const STORAGE_KEY = 'zarf_claim_flow';

// ============================================================================
// Initial State
// ============================================================================

const initialState: ClaimFlowState = {
    mode: 'dashboard',
    currentStep: 1,
    selectedDistribution: null,
    selectedTranche: null,
    targetWallet: null,
    zkProof: null,
    publicInputs: null,
    claimTxHash: null
};

// ============================================================================
// Internal State (Private)
// ============================================================================

let state = $state<ClaimFlowState>(structuredClone(initialState));

// ============================================================================
// Derived Values (Computed)
// ============================================================================

const isInClaimFlow = $derived(state.mode === 'claiming');

const canGenerateProof = $derived(
    state.selectedTranche !== null && state.targetWallet !== null
);

const isClaimComplete = $derived(state.claimTxHash !== null);

const currentStepName = $derived(
    state.currentStep === 1 ? 'Select Distribution' :
        state.currentStep === 2 ? 'Select Tranche' :
            state.currentStep === 3 ? 'Generate Proof' :
                state.currentStep === 4 ? 'Submit Claim' :
                    'Success'
);

// ============================================================================
// Persistence Helpers (Security-Conscious)
// ============================================================================

/**
 * Persist state to sessionStorage
 * EXCLUDES sensitive data (zkProof, publicInputs, claimTxHash)
 */
function persist() {
    if (!browser) return;

    try {
        // Only persist non-sensitive data
        const toSave: Partial<ClaimFlowState> = {
            mode: state.mode,
            currentStep: state.currentStep,
            selectedDistribution: state.selectedDistribution,
            selectedTranche: state.selectedTranche,
            targetWallet: state.targetWallet
            // zkProof, publicInputs, claimTxHash intentionally excluded
        };

        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
        console.warn('[ClaimFlowStore] Failed to persist:', error);
    }
}

/**
 * Restore state from sessionStorage
 */
function restore() {
    if (!browser) return;

    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with initialState to ensure all fields exist
            state = { ...initialState, ...parsed };
        }
    } catch (error) {
        console.warn('[ClaimFlowStore] Failed to restore, clearing storage:', error);
        sessionStorage.removeItem(STORAGE_KEY);
    }
}

// ============================================================================
// Mutation Actions
// ============================================================================

function enterClaimFlow(distribution: ClaimableDistribution) {
    state.mode = 'claiming';
    state.currentStep = 1;
    state.selectedDistribution = distribution;
    persist();
}

function exitClaimFlow() {
    reset();
}

function selectTranche(tranche: SelectedTranche) {
    state.selectedTranche = tranche;
    persist();
}

function setTargetWallet(address: Address) {
    state.targetWallet = address;
    persist();
}

function setZKProof(proof: string, publicInputs: any) {
    state.zkProof = proof;
    state.publicInputs = publicInputs;
    // Intentionally NOT persisted for security
}

function setClaimTxHash(txHash: string) {
    state.claimTxHash = txHash;
    state.currentStep = 5;
    // Intentionally NOT persisted
}

function nextStep() {
    if (state.currentStep < 5) {
        state.currentStep++;
        persist();
    }
}

function previousStep() {
    if (state.currentStep > 1) {
        state.currentStep--;
        persist();
    }
}

function goToStep(step: ClaimStep) {
    state.currentStep = step;
    persist();
}

function reset() {
    state = structuredClone(initialState);
    if (browser) {
        sessionStorage.removeItem(STORAGE_KEY);
    }
}

// ============================================================================
// Public API
// ============================================================================

export const claimFlowStore = {
    // Getters (read-only)
    get mode() { return state.mode; },
    get currentStep() { return state.currentStep; },
    get selectedDistribution() { return state.selectedDistribution; },
    get selectedTranche() { return state.selectedTranche; },
    get targetWallet() { return state.targetWallet; },
    get zkProof() { return state.zkProof; },
    get publicInputs() { return state.publicInputs; },
    get claimTxHash() { return state.claimTxHash; },

    // Derived getters
    get isInClaimFlow() { return isInClaimFlow; },
    get canGenerateProof() { return canGenerateProof; },
    get isClaimComplete() { return isClaimComplete; },
    get currentStepName() { return currentStepName; },

    // Mutation methods
    enterClaimFlow,
    exitClaimFlow,
    selectTranche,
    setTargetWallet,
    setZKProof,
    setClaimTxHash,
    nextStep,
    previousStep,
    goToStep,
    reset,

    // Lifecycle
    restore
};

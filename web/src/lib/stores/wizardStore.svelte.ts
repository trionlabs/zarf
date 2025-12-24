/**
 * Wizard Store - Distribution Creation Flow (6 Steps)
 * 
 * Manages state for the multi-step wizard:
 * 1. Token Details
 * 2. Vesting Schedule
 * 3. Upload Whitelist (CSV)
 * 4. Regulatory Rules
 * 5. Review & Deploy
 * 6. Success
 * 
 * State persists to localStorage and clears on completion.
 * 
 * @module stores/wizardStore
 */

import { browser } from '$app/environment';
import type { WizardState, TokenDetails, Schedule, Recipient, Distribution } from './types';
import type { Address } from 'viem';

const STORAGE_KEY = 'zarf_wizard_state';

// ============================================================================
// Initial State
// ============================================================================

const initialState: WizardState = {
    currentStep: 0,
    tokenDetails: {
        tokenAddress: null,
        tokenName: null,
        tokenSymbol: null,
        tokenDecimals: null,
        tokenTotalSupply: null,
        iconUrl: null,
    },
    distributions: [],
    merkleRoot: null,
    deployedContractAddress: null,
    txHash: null
};

// ============================================================================
// Internal State (Private)
// ============================================================================

let state = $state<WizardState>(structuredClone(initialState));

// ============================================================================
// Derived Values (Computed)
// ============================================================================

const totalRecipientsAmount = $derived(
    state.distributions.reduce((total, dist) => {
        return total + dist.recipients.reduce((sum, r) => sum + r.amount, 0);
    }, 0)
);

const totalDistributionCount = $derived(
    state.distributions.length
);

// Editing state (for live preview in StatsPanel)
let editingPoolAmount = $state<number>(0);

const isComplete = $derived(
    state.currentStep === 3 && state.deployedContractAddress !== null
);

// ============================================================================
// Persistence Helpers
// ============================================================================

function persist() {
    if (!browser) return;

    try {
        if (state.currentStep === 3 && state.deployedContractAddress) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('[WizardStore] Failed to persist:', error);
    }
}

function restore() {
    if (!browser) return;

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as WizardState;
            // Validate minimal structure
            if (parsed.distributions && Array.isArray(parsed.distributions)) {
                state = parsed;
            }
        }
    } catch (error) {
        console.warn('[WizardStore] Failed to restore, clearing storage:', error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

// ============================================================================
// Mutation Actions
// ============================================================================

function setTokenDetails(details: Partial<TokenDetails>) {
    state.tokenDetails = { ...state.tokenDetails, ...details };
    persist();
}

function addDistribution(distribution: Distribution) {
    state.distributions.push(distribution);
    persist();
}

function removeDistribution(id: string) {
    state.distributions = state.distributions.filter(d => d.id !== id);
    persist();
}

function updateDistribution(id: string, updates: Partial<Distribution>) {
    const index = state.distributions.findIndex(d => d.id === id);
    if (index !== -1) {
        state.distributions[index] = { ...state.distributions[index], ...updates };
        persist();
    }
}

function setMerkleRoot(root: string) {
    state.merkleRoot = root;
    persist();
}

function setDeploymentResult(contractAddress: Address, txHash: string) {
    state.deployedContractAddress = contractAddress;
    state.txHash = txHash;
    state.currentStep = 3;
    persist();
}

function nextStep() {
    if (state.currentStep < 3) {
        state.currentStep++;
        persist();
    }
}

function previousStep() {
    if (state.currentStep > 0) {
        state.currentStep--;
        persist();
    }
}

function goToStep(step: number) {
    if (step >= 0 && step <= 3) {
        state.currentStep = step;
        persist();
    }
}

function reset() {
    state = structuredClone(initialState);
    if (browser) {
        localStorage.removeItem(STORAGE_KEY);
    }
}

// ============================================================================
// Public API
// ============================================================================

export const wizardStore = {
    // Getters
    get currentStep() { return state.currentStep; },
    get tokenDetails() { return state.tokenDetails; },
    get distributions() { return state.distributions; },
    get merkleRoot() { return state.merkleRoot; },
    get deployedContractAddress() { return state.deployedContractAddress; },
    get txHash() { return state.txHash; },
    get editingPoolAmount() { return editingPoolAmount; },

    // Derived
    get totalRecipientsAmount() { return totalRecipientsAmount; },
    get totalDistributionCount() { return totalDistributionCount; },
    get isComplete() { return isComplete; },

    // Actions
    setTokenDetails,
    addDistribution,
    removeDistribution,
    updateDistribution,
    setMerkleRoot,
    setDeploymentResult,
    nextStep,
    previousStep,
    goToStep,
    reset,
    restore,
    setEditingPoolAmount(amount: number) { editingPoolAmount = amount; },
};

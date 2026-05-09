/**
 * Wizard Store - Distribution Creation Flow (4 Steps: 0..3)
 *
 * Tracks creation state (token + distributions). The deploy flow's
 * write-ahead log (merkleResult, contract address, tx hashes) lives in
 * `deployStore` — keep them out of here.
 *
 * State persists to localStorage and clears on full reset.
 *
 * @module stores/wizardStore
 */

import { browser } from '$app/environment';
import { getActiveStellarNetworkId } from '@zarf/core/config/runtime';
import type { WizardState, TokenDetails, Distribution } from './types';

const STORAGE_KEY = 'zarf_wizard_state';

function storageKey(): string {
    try {
        return `${STORAGE_KEY}:${getActiveStellarNetworkId()}`;
    } catch {
        return STORAGE_KEY;
    }
}

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

// ============================================================================
// Editing State (for live preview in StatsPanel during creation)
// These are ephemeral and NOT persisted - they represent the "draft" distribution
// ============================================================================

let editingPoolAmount = $state<number>(0);
let editingVestingDuration = $state<number>(0);
let editingDurationUnit = $state<string>(""); // 'weeks' | 'months' | 'quarters' | 'years'
let editingRecipientCount = $state<number>(0);
let editingCliffDate = $state<string>("");

// ============================================================================
// Persistence Helpers
// ============================================================================

function persist() {
    if (!browser) return;

    try {
        localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (error) {
        console.warn('[WizardStore] Failed to persist:', error);
    }
}

function restore() {
    if (!browser) return;

    try {
        const saved = localStorage.getItem(storageKey());
        if (saved) {
            const parsed = JSON.parse(saved) as WizardState;
            // Validate minimal structure
            if (parsed.distributions && Array.isArray(parsed.distributions)) {
                state = parsed;
            }
        }
    } catch (error) {
        console.warn('[WizardStore] Failed to restore, clearing storage:', error);
        localStorage.removeItem(storageKey());
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
    // Ensure initial state is set correctly
    const newDist = {
        ...distribution,
        state: distribution.state || 'created',
        createdAt: distribution.createdAt || new Date().toISOString()
    };
    state.distributions.push(newDist);
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

/**
 * Transitions a distribution to 'launched' state after successful deposit
 */
function moveDistributionToLaunched(id: string, txHash: string) {
    const index = state.distributions.findIndex(d => d.id === id);
    if (index !== -1) {
        state.distributions[index] = {
            ...state.distributions[index],
            state: 'launched',
            launchedAt: new Date().toISOString(),
            depositTxHash: txHash
        };
        persist();
    }
}

/**
 * Transitions a distribution to 'cancelled' state
 */
function cancelDistribution(id: string) {
    const index = state.distributions.findIndex(d => d.id === id);
    if (index !== -1) {
        state.distributions[index] = {
            ...state.distributions[index],
            state: 'cancelled',
            cancelledAt: new Date().toISOString()
        };
        persist();
    }
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
        localStorage.removeItem(storageKey());
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
    get editingPoolAmount() { return editingPoolAmount; },
    get editingVestingDuration() { return editingVestingDuration; },
    get editingDurationUnit() { return editingDurationUnit; },
    get editingRecipientCount() { return editingRecipientCount; },
    get editingCliffDate() { return editingCliffDate; },

    // Derived
    get totalRecipientsAmount() { return totalRecipientsAmount; },
    get totalDistributionCount() { return totalDistributionCount; },

    // Actions
    setTokenDetails,
    addDistribution,
    removeDistribution,
    updateDistribution,
    moveDistributionToLaunched,
    cancelDistribution,
    nextStep,
    previousStep,
    goToStep,
    reset,
    restore,
    // Editing State Setters (for live preview)
    setEditingPoolAmount(amount: number) { editingPoolAmount = amount; },
    setEditingVestingDuration(months: number) { editingVestingDuration = months; },
    setEditingRecipientCount(count: number) { editingRecipientCount = count; },
    setEditingCliffDate(date: string) { editingCliffDate = date; },

    /** Reset all editing states - call when cancelling or saving a distribution */
    clearEditingState() {
        editingPoolAmount = 0;
        editingVestingDuration = 0;
        editingDurationUnit = "";
        editingRecipientCount = 0;
        editingCliffDate = "";
    },
    setEditingDurationUnit(unit: string) { editingDurationUnit = unit; },
};

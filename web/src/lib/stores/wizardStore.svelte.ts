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
import type { WizardState, TokenDetails, Schedule, Recipient } from './types';
import type { Address } from 'viem';

const STORAGE_KEY = 'zarf_wizard_state';

// ============================================================================
// Initial State
// ============================================================================

const initialState: WizardState = {
    currentStep: 1,
    tokenDetails: {
        // Token Contract Info (fetched from API)
        tokenAddress: null,
        tokenName: null,
        tokenSymbol: null,
        tokenDecimals: null,
        tokenTotalSupply: null,
        iconUrl: null,

        // Distribution Config (user input)
        distributionAmount: '',
        distributionName: '',
        distributionDescription: '',
    },
    schedule: {
        cliffEndDate: '',
        distributionDurationMonths: 12
    },
    recipients: [],
    csvFilename: null,
    regulatoryRules: [],
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

const canProceedFromStep1 = $derived(
    state.tokenDetails.distributionName.length >= 3 &&
    state.tokenDetails.tokenAddress !== null &&
    state.tokenDetails.tokenName !== null &&
    parseFloat(state.tokenDetails.distributionAmount) > 0
);

const canProceedFromStep2 = $derived(
    state.schedule.cliffEndDate !== '' &&
    state.schedule.distributionDurationMonths > 0
);

const canProceedFromStep3 = $derived(
    state.recipients.length > 0
);

const canProceedFromStep4 = $derived(
    true // Regulatory rules are optional
);

const canProceedFromStep5 = $derived(
    state.merkleRoot !== null
);

const isComplete = $derived(
    state.currentStep === 6 && state.deployedContractAddress !== null
);

const totalRecipientsAmount = $derived(
    state.recipients.reduce((sum, r) => sum + r.amount, 0)
);

// ============================================================================
// Persistence Helpers
// ============================================================================

/**
 * Persist state to localStorage
 * Clears storage if wizard is complete (step 6)
 */
function persist() {
    if (!browser) return;

    try {
        if (state.currentStep === 6 && state.deployedContractAddress) {
            // Wizard complete, clear storage
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('[WizardStore] Failed to persist:', error);
    }
}

/**
 * Restore state from localStorage
 */
function restore() {
    if (!browser) return;

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as WizardState;

            // Validate structure before applying
            if (parsed.currentStep && parsed.tokenDetails) {
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

function setSchedule(schedule: Partial<Schedule>) {
    state.schedule = { ...state.schedule, ...schedule };
    persist();
}

function setRecipients(recipients: Recipient[], filename: string) {
    state.recipients = recipients;
    state.csvFilename = filename;
    persist();
}

function setMerkleRoot(root: string) {
    state.merkleRoot = root;
    persist();
}

function setRegulatoryRules(rules: string[]) {
    state.regulatoryRules = rules;
    persist();
}

function setDeploymentResult(contractAddress: Address, txHash: string) {
    state.deployedContractAddress = contractAddress;
    state.txHash = txHash;
    state.currentStep = 6;
    persist(); // Will actually clear storage
}

function nextStep() {
    if (state.currentStep < 6) {
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

function goToStep(step: number) {
    if (step >= 1 && step <= 6) {
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
    // Getters (read-only via property access)
    get currentStep() { return state.currentStep; },
    get tokenDetails() { return state.tokenDetails; },
    get schedule() { return state.schedule; },
    get recipients() { return state.recipients; },
    get csvFilename() { return state.csvFilename; },
    get regulatoryRules() { return state.regulatoryRules; },
    get merkleRoot() { return state.merkleRoot; },
    get deployedContractAddress() { return state.deployedContractAddress; },
    get txHash() { return state.txHash; },

    // Derived getters
    get canProceedFromStep1() { return canProceedFromStep1; },
    get canProceedFromStep2() { return canProceedFromStep2; },
    get canProceedFromStep3() { return canProceedFromStep3; },
    get canProceedFromStep4() { return canProceedFromStep4; },
    get canProceedFromStep5() { return canProceedFromStep5; },
    get isComplete() { return isComplete; },
    get totalRecipientsAmount() { return totalRecipientsAmount; },

    // Mutation methods
    setTokenDetails,
    setSchedule,
    setRecipients,
    setMerkleRoot,
    setRegulatoryRules,
    setDeploymentResult,
    nextStep,
    previousStep,
    goToStep,
    reset,

    // Lifecycle
    restore
};

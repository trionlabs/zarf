/**
 * Campaign Store — airdrop creation flow (3 steps: 0 Token, 1 Recipients,
 * 2 Review & Distribute) + the in-flight deploy write-ahead log.
 *
 * This merges the create app's `wizardStore` (token + draft) and `deployStore`
 * (deploy recovery WAL) into one network-keyed blob, because an airdrop builds
 * exactly one campaign at a time. Two deliberate omissions vs. the vesting
 * stores: (1) no PII-redaction — the recipient list is public and stored
 * verbatim; (2) no Backup sub-step — there is no secret to back up before
 * publishing a public list, so the deploy is 3 sub-steps, not 4.
 *
 * @module stores/campaignStore
 */
import { browser } from '$app/environment';
import { getActiveStellarNetworkId } from '@zarf/core/config/runtime';
import { warn } from '@zarf/core/utils/log';
import type { ActiveDeploy, Campaign, RecipientRow, TokenDetails, WizardState } from './types';

const STORAGE_KEY = 'zarf_airdrop_wizard';
/** Bump when the persisted shape changes incompatibly (drops old blobs). */
const SCHEMA_VERSION = 1;
/** A deploy WAL older than this is discarded on restore (stale recovery). */
const WAL_TTL_MS = 24 * 60 * 60 * 1000;

function storageKey(): string {
    try {
        return `${STORAGE_KEY}:${getActiveStellarNetworkId()}`;
    } catch {
        return STORAGE_KEY;
    }
}

const initialState: WizardState = {
    currentStep: 0,
    tokenDetails: {
        tokenAddress: null,
        tokenName: null,
        tokenSymbol: null,
        tokenDecimals: null,
        acknowledged: false,
    },
    recipients: [],
    deadline: 0,
    locked: false,
    activeDeploy: null,
    campaigns: [],
};

let state = $state<WizardState>(structuredClone(initialState));

// ---- Derived ----------------------------------------------------------------

/** Recipient count of the in-flight draft. */
const recipientCount = $derived(state.recipients.length);

/** Σ of the draft amounts in UI units (display-only; the base-unit total is
 *  computed exactly via parseTokenAmount/sumBaseUnits at prepare). */
const totalAmountUi = $derived(
    state.recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
);

// ---- Persistence ------------------------------------------------------------

function persist() {
    if (!browser) return;
    try {
        const blob = { version: SCHEMA_VERSION, ...state };
        localStorage.setItem(storageKey(), JSON.stringify(blob));
    } catch (error) {
        warn('[campaignStore] Failed to persist:', error);
    }
}

function restore() {
    if (!browser) return;
    try {
        const saved = localStorage.getItem(storageKey());
        if (!saved) return;
        const parsed = JSON.parse(saved) as Partial<WizardState> & { version?: number };
        if (parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.recipients)) {
            localStorage.removeItem(storageKey());
            return;
        }
        // Expire a stale deploy WAL but keep the user's draft (token + list).
        let activeDeploy = parsed.activeDeploy ?? null;
        if (
            activeDeploy &&
            (typeof activeDeploy.savedAt !== 'number' ||
                Date.now() - activeDeploy.savedAt > WAL_TTL_MS)
        ) {
            activeDeploy = null;
        }
        state = {
            ...structuredClone(initialState),
            ...parsed,
            activeDeploy,
            campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        };
    } catch (error) {
        warn('[campaignStore] Failed to restore, clearing storage:', error);
        localStorage.removeItem(storageKey());
    }
}

// ---- Draft actions ----------------------------------------------------------

function setTokenDetails(details: Partial<TokenDetails>) {
    state.tokenDetails = { ...state.tokenDetails, ...details };
    persist();
}

function setRecipients(rows: RecipientRow[]) {
    state.recipients = rows;
    persist();
}

function setDeadline(deadlineSeconds: number) {
    state.deadline = Math.max(0, Math.floor(deadlineSeconds));
    persist();
}

function setLocked(locked: boolean) {
    state.locked = locked;
    persist();
}

function nextStep() {
    if (state.currentStep < 2) {
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
    if (step >= 0 && step <= 2) {
        state.currentStep = step;
        persist();
    }
}

// ---- Deploy WAL actions -----------------------------------------------------

/** Begin (or reset) the deploy WAL for the current draft. */
function startDeploy() {
    state.activeDeploy = {
        step: 1,
        salt: null,
        predictedAddress: null,
        merkleRoot: null,
        metadataCid: null,
        total: null,
        approveTxHash: null,
        createTxHash: null,
        savedAt: Date.now(),
    };
    persist();
}

function updateDeploy(updates: Partial<ActiveDeploy>) {
    if (!state.activeDeploy) return;
    state.activeDeploy = { ...state.activeDeploy, ...updates, savedAt: Date.now() };
    persist();
}

function clearActiveDeploy() {
    if (state.activeDeploy === null) return;
    state.activeDeploy = null;
    persist();
}

// ---- Finalize ---------------------------------------------------------------

/**
 * Record a successfully-deployed campaign in history and clear the draft +
 * deploy WAL so the wizard returns clean. Pulls the immutable facts from the
 * in-flight draft + WAL; `createTxHash` marks the funding tx.
 */
function moveCampaignToLaunched(createTxHash: string): Campaign | null {
    const d = state.activeDeploy;
    const token = state.tokenDetails.tokenAddress;
    if (
        !d ||
        !token ||
        !d.predictedAddress ||
        !d.merkleRoot ||
        !d.metadataCid ||
        !d.total ||
        state.tokenDetails.tokenDecimals === null
    ) {
        warn('[campaignStore] moveCampaignToLaunched called with incomplete deploy state');
        return null;
    }
    const campaign: Campaign = {
        id: browser ? crypto.randomUUID() : `${Date.now()}`,
        token,
        tokenSymbol: state.tokenDetails.tokenSymbol,
        tokenDecimals: state.tokenDetails.tokenDecimals,
        recipientCount: state.recipients.length,
        total: d.total,
        deadline: state.deadline,
        locked: state.locked,
        merkleRoot: d.merkleRoot,
        metadataCid: d.metadataCid,
        airdropAddress: d.predictedAddress,
        state: 'launched',
        createdAt: new Date().toISOString(),
        launchedAt: new Date().toISOString(),
        approveTxHash: d.approveTxHash ?? undefined,
        createTxHash,
    };
    state.campaigns = [campaign, ...state.campaigns];
    // Clear the draft for the next campaign.
    state.recipients = [];
    state.deadline = 0;
    state.locked = false;
    state.activeDeploy = null;
    state.currentStep = 0;
    persist();
    return campaign;
}

function cancelCampaign(id: string) {
    const i = state.campaigns.findIndex((c) => c.id === id);
    if (i !== -1) {
        state.campaigns[i] = {
            ...state.campaigns[i],
            state: 'cancelled',
            cancelledAt: new Date().toISOString(),
        };
        persist();
    }
}

function reset() {
    state = structuredClone(initialState);
    if (browser) localStorage.removeItem(storageKey());
}

// ---- Public API -------------------------------------------------------------

export const campaignStore = {
    get currentStep() {
        return state.currentStep;
    },
    get tokenDetails() {
        return state.tokenDetails;
    },
    get recipients() {
        return state.recipients;
    },
    get deadline() {
        return state.deadline;
    },
    get locked() {
        return state.locked;
    },
    get activeDeploy() {
        return state.activeDeploy;
    },
    get campaigns() {
        return state.campaigns;
    },
    get recipientCount() {
        return recipientCount;
    },
    get totalAmountUi() {
        return totalAmountUi;
    },

    setTokenDetails,
    setRecipients,
    setDeadline,
    setLocked,
    nextStep,
    previousStep,
    goToStep,
    startDeploy,
    updateDeploy,
    clearActiveDeploy,
    moveCampaignToLaunched,
    cancelCampaign,
    reset,
    restore,
};

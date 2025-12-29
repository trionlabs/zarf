import { browser } from '$app/environment';

/**
 * Claim Store - InMemory State for the Claim Flow
 * 
 * SECURITY CRITICAL:
 * This store handles the User's SALT and Claim Data.
 * It is effectively an "InMemory" store. 
 * We explicitly DO NOT persist `salt` or `claimData` to localStorage/sessionStorage
 * to prevent Cross-Site Scripting (XSS) attacks from easily harvesting unencrypted salts.
 * 
 * If the user refreshes the page, this state is lost, and they must re-upload their JSON.
 * This is a security feature, not a bug.
 */

type ClaimState = {
    step: 1 | 2 | 3; // 1: Upload, 2: Proof, 3: Review/Submit

    // Decrypted/Parsed from claim-data.json
    claimData: {
        email: string;
        salt: string; // CRITICAL: NEVER PERSIST
        merkleProof: {
            siblings: string[];
            indices: string[];
        };
        merkleRoot: string; // Hex
        vestedAmount: string; // Hex or Dec string from JSON
        recipient: string; // The intended recipient in the JSON (optional, but good for verification)
    } | null;

    // The generated ZK Proof
    proof: {
        hex: string;
        publicInputs: string[]; // bytes32[]
    } | null;

    // The submitted transaction
    txHash: string | null;
};

const initialState: ClaimState = {
    step: 1,
    claimData: null,
    proof: null,
    txHash: null
};

// Svelte 5 Rune State
let state = $state<ClaimState>(initialState);

export const claimStore = {
    // Getters
    get step() { return state.step; },
    get claimData() { return state.claimData; },
    get proof() { return state.proof; },
    get txHash() { return state.txHash; },

    // Actions
    setClaimData(data: ClaimState['claimData']) {
        state.claimData = data;
        // Auto-advance is handled by the UI usually, but we can signal readiness
        if (data) state.step = 2;
    },

    setProof(proof: ClaimState['proof']) {
        state.proof = proof;
        if (proof) state.step = 3;
    },

    setTxHash(hash: string) {
        state.txHash = hash;
    },

    goToStep(step: 1 | 2 | 3) {
        state.step = step;
    },

    reset() {
        // Wipes everything (Salt gone)
        state.step = 1;
        state.claimData = null;
        state.proof = null;
        state.txHash = null;
        console.log('[ClaimStore] State reset (Memory Cleared)');
    }
};

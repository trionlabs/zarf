import { browser } from '$app/environment';
import {
    getActiveStellarNetworkId,
    getConfiguredStellarNetworks,
    setActiveStellarNetwork,
    STELLAR_NETWORK_STORAGE_KEY,
    type StellarNetworkId,
    type StellarNetworkOption,
} from '@zarf/core/config/runtime';

interface NetworkState {
    activeId: StellarNetworkId;
    options: StellarNetworkOption[];
    error: string | null;
}

function currentState(): NetworkState {
    return {
        activeId: getActiveStellarNetworkId(),
        options: getConfiguredStellarNetworks(),
        error: null,
    };
}

const state = $state<NetworkState>(currentState());

function sync() {
    state.activeId = getActiveStellarNetworkId();
    state.options = getConfiguredStellarNetworks();
}

function persist(id: StellarNetworkId) {
    if (!browser) return;
    localStorage.setItem(STELLAR_NETWORK_STORAGE_KEY, id);
}

function select(id: StellarNetworkId, options: { reload?: boolean } = {}) {
    try {
        setActiveStellarNetwork(id);
        persist(id);
        sync();
        state.error = null;

        if (options.reload && browser) {
            window.location.reload();
        }
    } catch (error) {
        state.error = error instanceof Error ? error.message : 'Failed to switch network.';
    }
}

function restore() {
    if (!browser) {
        sync();
        return;
    }

    const stored = localStorage.getItem(STELLAR_NETWORK_STORAGE_KEY) as StellarNetworkId | null;
    if (stored && state.options.some((option) => option.id === stored && option.configured)) {
        select(stored);
        return;
    }

    sync();
}

export const networkStore = {
    get activeId() { return state.activeId; },
    get options() { return state.options; },
    get active() { return state.options.find((option) => option.id === state.activeId) ?? null; },
    get error() { return state.error; },
    get canSwitch() { return state.options.filter((option) => option.configured).length > 1; },
    select,
    restore,
    sync,
};

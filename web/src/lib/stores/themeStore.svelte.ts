/**
 * Theme Store - Application Theme Management
 * 
 * Manages theme selection between 'nord' and 'wireframe' DaisyUI themes.
 * Persists to localStorage and applies to document root.
 * 
 * @module stores/themeStore
 */

import { browser } from '$app/environment';
import type { Theme } from './types';

const STORAGE_KEY = 'zarf_theme';
const DEFAULT_THEME: Theme = 'nord';

// ============================================================================
// Internal State (Private)
// ============================================================================

let currentTheme = $state<Theme>(DEFAULT_THEME);

// ============================================================================
// Derived Values
// ============================================================================

// Both nord and wireframe are light themes in DaisyUI
const isDark = $derived(false); // None of our themes are dark
const isLight = $derived(true);

// ============================================================================
// Persistence Helpers
// ============================================================================

/**
 * Persist theme to localStorage and apply to document
 */
function persist(theme: Theme) {
    if (!browser) return;

    try {
        localStorage.setItem(STORAGE_KEY, theme);
        document.documentElement.setAttribute('data-theme', theme);
    } catch (error) {
        console.warn('[ThemeStore] Failed to persist theme:', error);
    }
}

/**
 * Restore theme from localStorage
 */
function restore() {
    if (!browser) return;

    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved === 'nord' || saved === 'wireframe' || saved === 'dim') {
            currentTheme = saved;
            document.documentElement.setAttribute('data-theme', saved);
        } else {
            // Default theme
            persist(DEFAULT_THEME);
        }
    } catch (error) {
        console.warn('[ThemeStore] Failed to restore theme:', error);
        persist(DEFAULT_THEME);
    }
}

// ============================================================================
// Mutation Actions
// ============================================================================

function setTheme(theme: Theme) {
    currentTheme = theme;
    persist(theme);
}

function toggleTheme() {
    const newTheme: Theme = currentTheme === 'nord' ? 'wireframe' : 'nord';
    setTheme(newTheme);
}

function reset() {
    setTheme(DEFAULT_THEME);
}

// ============================================================================
// Public API
// ============================================================================

export const themeStore = {
    // Getters (read-only)
    get current() { return currentTheme; },

    // Derived getters
    get isDark() { return isDark; },
    get isLight() { return isLight; },

    // Mutation methods
    setTheme,
    toggleTheme,
    reset,

    // Lifecycle
    restore
};

/**
 * Theme Store - Application Theme Management
 * 
 * Manages binary dark/light theme selection.
 * Maps to DaisyUI themes: light='wireframe', dark='glass-porcelain'
 * Persists to localStorage and applies to document root.
 * 
 * @module stores/themeStore
 */

// SSR-safe browser check
const browser = typeof window !== 'undefined';
import type { Theme } from './types';

const STORAGE_KEY = 'zarf_theme';
const DEFAULT_THEME: Theme = 'dark';

// DaisyUI theme mapping
const THEME_MAP: Record<Theme, string> = {
    light: 'paper-porcelain',
    dark: 'glass-porcelain'
};

// ============================================================================
// Internal State (Private)
// ============================================================================

let currentTheme = $state<Theme>(DEFAULT_THEME);

// ============================================================================
// Derived Values
// ============================================================================

const isDark = $derived(currentTheme === 'dark');
const isLight = $derived(currentTheme === 'light');

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
        const daisyTheme = THEME_MAP[theme];
        document.documentElement.setAttribute('data-theme', daisyTheme);
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
        const saved = localStorage.getItem(STORAGE_KEY) as Theme;

        if (saved && ['dark', 'light'].includes(saved)) {
            currentTheme = saved;
            const daisyTheme = THEME_MAP[saved];
            document.documentElement.setAttribute('data-theme', daisyTheme);
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
    const newTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
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

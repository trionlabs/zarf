/**
 * Theme Store - Application Theme Management
 *
 * Manages binary dark/light theme selection.
 * Maps to data-theme tokens: light='paper-porcelain', dark='glass-porcelain'
 * Persists to localStorage and applies to document root.
 *
 * @module stores/themeStore
 */

import { browser } from '@zarf/core/utils/ssr';
import { warn } from '@zarf/core/utils/log';
import type { Theme } from './types';

const STORAGE_KEY = 'zarf_theme';
const DEFAULT_THEME: Theme = 'dark';

// Theme name → Tailwind v4 @theme registration token
const THEME_MAP: Record<Theme, string> = {
    light: 'paper-porcelain',
    dark: 'glass-porcelain',
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
        const themeName = THEME_MAP[theme];
        document.documentElement.setAttribute('data-theme', themeName);
    } catch (error) {
        warn('[ThemeStore] Failed to persist theme:', error);
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
            const themeName = THEME_MAP[saved];
            document.documentElement.setAttribute('data-theme', themeName);
        } else {
            // Default theme
            persist(DEFAULT_THEME);
        }
    } catch (error) {
        warn('[ThemeStore] Failed to restore theme:', error);
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
    get current() {
        return currentTheme;
    },

    // Derived getters
    get isDark() {
        return isDark;
    },
    get isLight() {
        return isLight;
    },

    // Mutation methods
    setTheme,
    toggleTheme,
    reset,

    // Lifecycle
    restore,
};

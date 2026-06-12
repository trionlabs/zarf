/**
 * Global Constants for Zarf Web
 */

// ===================================
// Domain Constants
// ===================================

// PINs generated before 2026-06 are 8 chars; newer ones are 12 (~69 bits).
// Validation accepts the old floor, inputs allow headroom for either.
export const PIN_MIN_LENGTH = 8;
export const PIN_MAX_LENGTH = 64;
export const PIN_GENERATED_LENGTH = 12;
export const MAX_EMAIL_LENGTH = 64;
export const MAX_AUDIENCE_LENGTH = 128;

// ===================================
// ZK / Crypto Constants
// ===================================

export const TREE_DEPTH = 20;
export const MAX_SIGNED_DATA_LENGTH = 1024;

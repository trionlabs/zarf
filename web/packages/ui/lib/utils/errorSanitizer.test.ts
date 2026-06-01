import { describe, expect, it } from 'vitest';
import { sanitizeBlockchainError } from './errorSanitizer';

describe('sanitizeBlockchainError', () => {
    it('maps user rejection (reject/denied) to a friendly retry message', () => {
        expect(sanitizeBlockchainError(new Error('User rejected the request'))).toBe(
            'Request rejected. Please try again when ready.',
        );
        expect(sanitizeBlockchainError(new Error('Request denied in wallet'))).toBe(
            'Request rejected. Please try again when ready.',
        );
    });

    it('maps insufficient funds and balance distinctly', () => {
        expect(sanitizeBlockchainError(new Error('insufficient funds for fee'))).toBe(
            'Insufficient funds to cover gas fees.',
        );
        expect(sanitizeBlockchainError(new Error('insufficient balance'))).toBe(
            'Insufficient token balance.',
        );
    });

    it('maps rate-limit and network errors', () => {
        expect(sanitizeBlockchainError(new Error('429 rate limit exceeded'))).toBe(
            'RPC rate limited. Please try again in a moment.',
        );
        expect(sanitizeBlockchainError(new Error('network disconnected'))).toBe(
            'Network error. Please check your connection and try again.',
        );
    });

    it('handles the pending-request code (-32002) with no useful message', () => {
        expect(sanitizeBlockchainError({ code: -32002 })).toBe(
            'A wallet request is already pending. Check your wallet and try again.',
        );
    });

    it('tries custom rules before built-ins', () => {
        expect(
            sanitizeBlockchainError(new Error('AlreadyClaimed'), {
                customRules: [{ match: 'AlreadyClaimed', message: 'You have already claimed.' }],
            }),
        ).toBe('You have already claimed.');
    });

    it('lets a custom rule win when it overlaps a built-in', () => {
        expect(
            sanitizeBlockchainError(new Error('user rejected'), {
                customRules: [{ match: /reject/i, message: 'Custom rejection copy.' }],
            }),
        ).toBe('Custom rejection copy.');
    });
});

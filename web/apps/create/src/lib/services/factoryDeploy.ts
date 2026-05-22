/**
 * Stellar factory deploy service.
 *
 * Handles the two Soroban writes needed to launch a distribution:
 * 1. Approve the factory to transfer the selected token.
 * 2. Create and fund the vesting contract through the factory.
 */

import {
    approveTokenAllowance,
    createAndFundVesting,
    getLatestLedgerSequence,
    getTokenAllowance,
} from '@zarf/core/contracts';
import { getFactoryAddress as getConfiguredFactoryAddress } from '@zarf/core/config/contracts';
import type {
    HexString,
    StellarAddress,
    StellarContractId,
    TransactionHash,
} from '@zarf/core/types';
import { sanitizeBlockchainError } from '@zarf/ui/utils/errorSanitizer';

export interface FactoryDeployConfig {
    factoryAddress: StellarContractId;
    tokenAddress: StellarContractId;
    merkleRoot: HexString;
    recipientCount: number;
    totalAmount: bigint;
    owner: StellarAddress;
    name: string;
    description: string;
    metadataCid: string;
    salt?: HexString;
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    periodSeconds: bigint;
    immediateUnlock?: boolean;
}

export type FactoryDeployStep = 'approve' | 'create' | 'complete' | 'error';

export interface FactoryDeployProgress {
    step: FactoryDeployStep;
    message: string;
    txHash?: TransactionHash;
}

export type FactoryProgressCallback = (progress: FactoryDeployProgress) => void;

export class FactoryDeployService {
    private readonly MAX_RETRIES = 3;
    private readonly INITIAL_RETRY_DELAY = 2000;
    private readonly salt: HexString;

    constructor(
        private readonly config: FactoryDeployConfig,
        private readonly onProgress: FactoryProgressCallback,
    ) {
        this.salt = config.salt ?? randomSalt();
    }

    private async withRetry<T>(operation: () => Promise<T>, step: FactoryDeployStep): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                const retryable = /rate limit|too many|network|fetch|timeout|temporar/i.test(
                    message,
                );

                if (retryable && attempt < this.MAX_RETRIES) {
                    const delayMs = this.INITIAL_RETRY_DELAY * 2 ** attempt;
                    this.onProgress({
                        step,
                        message: `Network busy. Retrying in ${Math.ceil(delayMs / 1000)}s...`,
                    });
                    await delay(delayMs);
                    continue;
                }

                throw error;
            }
        }

        throw lastError;
    }

    async approveFactory(): Promise<TransactionHash | null> {
        this.onProgress({ step: 'approve', message: 'Checking token allowance...' });

        const allowance = await this.withRetry(
            () =>
                getTokenAllowance(
                    this.config.tokenAddress,
                    this.config.owner,
                    this.config.factoryAddress,
                ),
            'approve',
        );

        if (allowance >= this.config.totalAmount) {
            this.onProgress({
                step: 'approve',
                message: 'Token allowance already covers this distribution.',
            });
            return null;
        }

        this.onProgress({ step: 'approve', message: 'Requesting token approval...' });
        const latestLedger = await getLatestLedgerSequence();
        const expirationLedger = latestLedger + 100_000;

        return this.withRetry(
            () =>
                approveTokenAllowance(
                    {
                        tokenAddress: this.config.tokenAddress,
                        owner: this.config.owner,
                        spender: this.config.factoryAddress,
                        amount: this.config.totalAmount,
                        expirationLedger,
                    },
                    (txHash) => {
                        this.onProgress({
                            step: 'approve',
                            message: 'Waiting for approval confirmation...',
                            txHash,
                        });
                    },
                ),
            'approve',
        );
    }

    async createAndFundVesting(): Promise<{
        hash: TransactionHash;
        vestingAddress: StellarContractId;
    }> {
        this.onProgress({
            step: 'create',
            message: 'Creating and funding Stellar vesting contract...',
        });

        return this.withRetry(
            () =>
                createAndFundVesting(
                    {
                        factoryAddress: this.config.factoryAddress,
                        owner: this.config.owner,
                        tokenAddress: this.config.tokenAddress,
                        salt: this.salt,
                        name: this.config.name,
                        description: this.config.description,
                        merkleRoot: this.config.merkleRoot,
                        recipientCount: this.config.recipientCount,
                        totalAmount: this.config.totalAmount,
                        metadataCid: this.config.metadataCid,
                    },
                    (txHash) => {
                        this.onProgress({
                            step: 'create',
                            message: 'Waiting for deployment confirmation...',
                            txHash,
                        });
                    },
                ),
            'create',
        );
    }

    async deploy(): Promise<StellarContractId> {
        try {
            await this.approveFactory();
            await delay(1000);
            const { vestingAddress } = await this.createAndFundVesting();
            this.onProgress({
                step: 'complete',
                message: 'Distribution deployed successfully.',
            });
            return vestingAddress;
        } catch (error) {
            const message = sanitizeError(error);
            this.onProgress({ step: 'error', message });
            const sanitized = new Error(message);
            (sanitized as Error & { cause?: unknown }).cause = error;
            throw sanitized;
        }
    }
}

export function getFactoryAddress(): StellarContractId | null {
    return getConfiguredFactoryAddress() ?? null;
}

export function isFactoryAvailable(): boolean {
    return getFactoryAddress() !== null;
}

function randomSalt(): HexString {
    const crypto = globalThis.crypto;
    if (!crypto?.getRandomValues) {
        throw new Error('Secure random salt generation is unavailable in this runtime');
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeError(error: unknown): string {
    return sanitizeBlockchainError(error, {
        customRules: [
            { match: 'InvalidRecipientCount', message: 'No recipients were provided.' },
            { match: 'InvalidAmount', message: 'Distribution amount must be greater than zero.' },
            {
                match: /allowance|transfer_from|insufficient/i,
                message: 'Token approval or funding failed.',
            },
        ],
        fallback: 'Stellar transaction failed. Please try again.',
    });
}

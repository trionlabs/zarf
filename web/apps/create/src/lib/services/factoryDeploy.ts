/**
 * Factory Deploy Service
 * 
 * Handles 2-TX deployment flow using ZarfVestingFactory.
 * Reduces 6-TX deployment to just:
 *   1. Approve factory to spend tokens
 *   2. Create and fund vesting contract
 * 
 * @module services/factoryDeploy
 */

import { getWalletClient, waitForTransactionReceipt } from '@wagmi/core';
import type { Address, Hash, TransactionReceipt, Log } from 'viem';
import { keccak256, toBytes, decodeEventLog, publicActions } from 'viem';
import { ZarfVestingFactoryABI } from '@zarf/core/contracts/abis/ZarfVestingFactory';
import { ERC20ABI } from '@zarf/core/contracts/abis/ERC20';
import { wagmiConfig } from '@zarf/core/contracts/wallet';

// ============================================================================
// Types
// ============================================================================

export interface FactoryDeployConfig {
    /** Factory contract address */
    factoryAddress: Address;
    /** ERC20 token address to vest */
    tokenAddress: Address;
    /** Merkle root for whitelist verification */
    merkleRoot: Hash;
    /** Array of identity commitments (Pedersen hashes) */
    commitments: Hash[];
    /** Array of allocation amounts (must match commitments length) */
    amounts: bigint[];
    /** Cliff duration in seconds */
    cliffSeconds: bigint;
    /** Total vesting duration in seconds */
    vestingSeconds: bigint;
    /** Period duration for discrete unlocks in seconds */
    periodSeconds: bigint;
    /** Total tokens to deposit */
    totalAmount: bigint;
    /** Owner's wallet address */
    owner: Address;
    /** Vesting name (metadata) */
    name: string;
    /** Vesting description (metadata) */
    description: string;
    /** Creation source (e.g. "zarf-web") */
    source?: string;
}

export type FactoryDeployStep = 'approve' | 'create' | 'complete' | 'error';

export interface FactoryDeployProgress {
    step: FactoryDeployStep;
    message: string;
    txHash?: Hash;
}

export type FactoryProgressCallback = (progress: FactoryDeployProgress) => void;

// ============================================================================
// Constants
// ============================================================================

/** VestingCreated event signature for log parsing */
export const VESTING_CREATED_EVENT = 'VestingCreated(address,address,address,uint256,uint256)' as const;

// ============================================================================
// Service Class
// ============================================================================

export class FactoryDeployService {
    private config: FactoryDeployConfig;
    private onProgress: FactoryProgressCallback;
    private readonly MAX_RETRIES = 3;
    private readonly INITIAL_RETRY_DELAY = 2000; // 2 seconds

    constructor(config: FactoryDeployConfig, onProgress: FactoryProgressCallback) {
        this.config = config;
        this.onProgress = onProgress;
    }

    /**
     * Retry wrapper with exponential backoff for RPC errors
     */
    private async withRetry<T>(
        operation: () => Promise<T>,
        operationName: string
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;
                const message = error?.message || '';

                // Check if this is a retryable RPC error
                const isRpcError =
                    message.includes('too many errors') ||
                    message.includes('rate limit') ||
                    message.includes('ResourceUnavailable') ||
                    message.includes('resource not available') ||
                    message.includes('NetworkError') ||
                    message.includes('fetch') ||
                    message.includes('Failed to fetch') ||
                    message.includes('network') ||
                    error?.code === -32002;

                if (isRpcError && attempt < this.MAX_RETRIES) {
                    const delayMs = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
                    const waitSeconds = Math.ceil(delayMs / 1000);

                    this.onProgress({
                        step: operationName as any,
                        message: `RPC rate limited. Retrying in ${waitSeconds}s... (attempt ${attempt + 2}/${this.MAX_RETRIES + 1})`
                    });

                    await delay(delayMs);
                    continue;
                }

                // Not a retryable error or max retries exceeded
                throw error;
            }
        }

        throw lastError;
    }

    /**
     * Step 1: Approve Factory to spend tokens
     * @returns Transaction hash if approval was needed, null if skipped
     *
     * MASTERCLASS: Uses wallet's RPC via publicActions extension.
     * This avoids CORS issues and public RPC rate limits by routing
     * read calls through the user's wallet (MetaMask) connection.
     */
    async approveFactory(): Promise<Hash | null> {
        this.onProgress({ step: 'approve', message: 'Checking existing token allowance...' });

        const wallet = await getWalletClient(wagmiConfig);

        // Extend wallet client with public actions - reads go through wallet's RPC
        // This bypasses CORS issues and uses MetaMask's configured RPC
        const client = wallet.extend(publicActions);

        // Check current allowance (with retry for network errors)
        const allowance = await this.withRetry(async () => {
            return client.readContract({
                address: this.config.tokenAddress,
                abi: ERC20ABI,
                functionName: 'allowance',
                args: [this.config.owner, this.config.factoryAddress]
            });
        }, 'approve');

        if (allowance >= this.config.totalAmount) {
            this.onProgress({ step: 'approve', message: 'Existing allowance sufficient. Skipping approval.' });
            return null; // No transaction needed
        }

        this.onProgress({ step: 'approve', message: 'Requesting token approval...' });

        const hash = await this.withRetry(async () => {
            return wallet.writeContract({
                address: this.config.tokenAddress,
                abi: ERC20ABI,
                functionName: 'approve',
                args: [this.config.factoryAddress, this.config.totalAmount],
                account: this.config.owner,
            });
        }, 'approve');

        this.onProgress({ step: 'approve', message: 'Waiting for approval confirmation...', txHash: hash });

        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status !== 'success') {
            throw new Error('Approval transaction failed');
        }

        return hash;
    }

    /**
     * Step 2: Create and Fund Vesting Contract
     */
    async createAndFundVesting(): Promise<{ hash: Hash; vestingAddress: Address }> {
        this.onProgress({ step: 'create', message: 'Creating and funding vesting contract...' });

        const hash = await this.withRetry(async () => {
            const wallet = await getWalletClient(wagmiConfig);
            return wallet.writeContract({
                address: this.config.factoryAddress,
                abi: ZarfVestingFactoryABI,
                functionName: 'createAndFundVesting',
                args: [{
                    token: this.config.tokenAddress,
                    merkleRoot: this.config.merkleRoot,
                    commitments: this.config.commitments, // ADR-023: identity commitments
                    amounts: this.config.amounts,
                    cliffDuration: this.config.cliffSeconds,
                    vestingDuration: this.config.vestingSeconds,
                    vestingPeriod: this.config.periodSeconds,
                    name: this.config.name,
                    description: this.config.description
                }, this.config.totalAmount],
                account: this.config.owner,
            });
        }, 'create');

        this.onProgress({ step: 'create', message: 'Waiting for contract creation...', txHash: hash });

        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status !== 'success') {
            throw new Error('Contract creation transaction failed');
        }

        // Parse VestingCreated event to get the deployed contract address
        const vestingAddress = this.parseVestingAddress(receipt);

        return { hash, vestingAddress };
    }

    /**
     * Execute full 2-TX deployment flow
     */
    async deploy(): Promise<Address> {
        try {
            // TX 1: Approve
            await this.approveFactory();

            // Small delay to ensure RPC state is synced
            await delay(1000);

            // TX 2: Create & Fund
            const { vestingAddress } = await this.createAndFundVesting();

            this.onProgress({ step: 'complete', message: 'Distribution deployed successfully!' });

            return vestingAddress;

        } catch (error: unknown) {
            const message = sanitizeError(error);
            this.onProgress({ step: 'error', message });
            throw error;
        }
    }

    /**
     * Parse VestingCreated event from transaction receipt
     */
    private parseVestingAddress(receipt: TransactionReceipt): Address {
        return parseVestingAddressFromReceipt(receipt);
    }
}

// ============================================================================
// Utility Functions (Exported for reuse)
// ============================================================================

/**
 * Parse VestingCreated event from transaction receipt to extract deployed contract address.
 * Can be used for recovery scenarios outside the service class.
 */
export function parseVestingAddressFromReceipt(receipt: TransactionReceipt): Address {
    // Try VIEM's decodeEventLog for robust parsing
    for (const log of receipt.logs) {
        try {
            const event = decodeEventLog({
                abi: ZarfVestingFactoryABI,
                data: log.data,
                topics: log.topics
            });

            if (event.eventName === 'VestingCreated') {
                const args = event.args as unknown as { vesting: Address };
                return args.vesting;
            }
        } catch {
            // Ignore logs that don't match our ABI
            continue;
        }
    }

    // Fallback: Manual topic parsing
    const eventTopic = keccak256(toBytes(VESTING_CREATED_EVENT));

    for (const log of receipt.logs) {
        if (log.topics[0] === eventTopic) {
            // topics[1] is vestingContract (first indexed parameter)
            const vestingAddressRaw = log.topics[1];
            if (vestingAddressRaw) {
                return `0x${vestingAddressRaw.slice(-40)}` as Address;
            }
        }
    }

    throw new Error('VestingCreated event not found in transaction receipt');
}

// ============================================================================
// Helper Functions (Internal to module)
// ============================================================================

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeError(error: unknown): string {
    const message = (error as { message?: string })?.message || '';

    if (message.includes('rejected') || message.includes('denied')) {
        return 'Transaction rejected by user';
    }
    if (message.includes('insufficient allowance')) {
        return 'Insufficient token approval. Please approve more tokens.';
    }
    if (message.includes('insufficient balance')) {
        return 'Insufficient token balance';
    }
    if (message.includes('ArrayLengthMismatch')) {
        return 'Allocation data mismatch: email hashes and amounts must have same length';
    }
    if (message.includes('ZeroAllocations')) {
        return 'No allocations provided';
    }
    if (message.includes('TransferFailed')) {
        return 'Token transfer failed';
    }
    const code = (error as { code?: number })?.code;
    if (message.includes('rate limit') || message.includes('too many') || message.includes('resource not available') || message.includes('ResourceUnavailable') || code === -32002) {
        return 'MetaMask RPC rate limited. Fix: Open MetaMask → Settings → Networks → Sepolia → Change RPC URL to: https://ethereum-sepolia-rpc.publicnode.com';
    }

    // Return original message for development, sanitize in production
    return import.meta.env.DEV ? message : 'Transaction failed. Please try again.';
}

// ============================================================================
// Factory Addresses (Environment-based)
// ============================================================================

/**
 * Get factory address for current network
 */
export function getFactoryAddress(chainId: number): Address | null {
    // Sepolia
    if (chainId === 11155111) {
        const address = import.meta.env.VITE_FACTORY_ADDRESS_SEPOLIA;
        return address ? (address as Address) : null;
    }

    // Mainnet
    if (chainId === 1) {
        const address = import.meta.env.VITE_FACTORY_ADDRESS_MAINNET;
        return address ? (address as Address) : null;
    }

    return null;
}

/**
 * Check if factory deployment is available for network
 */
export function isFactoryAvailable(chainId: number): boolean {
    return getFactoryAddress(chainId) !== null;
}

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

import { getWalletClient, waitForTransactionReceipt, getPublicClient } from '@wagmi/core';
import type { Address, Hash, TransactionReceipt, Log } from 'viem';
import { keccak256, toBytes, decodeEventLog } from 'viem';
import { ZarfVestingFactoryABI } from '../contracts/abis/ZarfVestingFactory';
import { ERC20ABI } from '../contracts/abis/ERC20';
import { wagmiConfig } from '../contracts/wallet';

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
    /** Array of email hashes (Pedersen hashes) */
    emailHashes: Hash[];
    /** Array of allocation amounts (must match emailHashes length) */
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
}

export type FactoryDeployStep = 'approve' | 'create' | 'complete' | 'error';

export interface FactoryDeployProgress {
    step: FactoryDeployStep;
    message: string;
    txHash?: Hash;
}

export type FactoryProgressCallback = (progress: FactoryDeployProgress) => void;

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
                    error?.code === -32002;

                if (isRpcError && attempt < this.MAX_RETRIES) {
                    const delayMs = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt);
                    const waitSeconds = Math.ceil(delayMs / 1000);

                    this.onProgress({
                        step: operationName as any,
                        message: `RPC rate limited. Retrying in ${waitSeconds}s... (attempt ${attempt + 2}/${this.MAX_RETRIES + 1})`
                    });

                    await this.delay(delayMs);
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
     */
    async approveFactory(): Promise<Hash> {
        this.onProgress({ step: 'approve', message: 'Requesting token approval...' });

        const hash = await this.withRetry(async () => {
            const wallet = await getWalletClient(wagmiConfig);
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
                args: [
                    this.config.tokenAddress,
                    this.config.merkleRoot,
                    this.config.emailHashes,
                    this.config.amounts,
                    this.config.cliffSeconds,
                    this.config.vestingSeconds,
                    this.config.periodSeconds,
                    this.config.totalAmount
                ],
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
            await this.delay(1000);

            // TX 2: Create & Fund
            const { vestingAddress } = await this.createAndFundVesting();

            this.onProgress({ step: 'complete', message: 'Distribution deployed successfully!' });

            return vestingAddress;

        } catch (error: any) {
            const message = this.sanitizeError(error);
            this.onProgress({ step: 'error', message });
            throw error;
        }
    }

    /**
     * Parse VestingCreated event from transaction receipt
     */
    private parseVestingAddress(receipt: TransactionReceipt): Address {
        // VestingCreated event signature
        const eventSignature = 'VestingCreated(address,address,address,uint256,uint256)';
        const eventTopic = keccak256(toBytes(eventSignature));

        for (const log of receipt.logs) {
            if (log.topics[0] === eventTopic) {
                // First indexed param is the vesting address
                const vestingAddressRaw = log.topics[1];
                if (vestingAddressRaw) {
                    // Extract address from bytes32 topic (last 20 bytes)
                    return `0x${vestingAddressRaw.slice(-40)}` as Address;
                }
            }
        }

        throw new Error('VestingCreated event not found in transaction receipt');
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private sanitizeError(error: any): string {
        const message = error?.message || '';

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
        if (message.includes('rate limit') || message.includes('too many') || message.includes('resource not available') || message.includes('ResourceUnavailable') || error?.code === -32002) {
            return 'MetaMask RPC rate limited. Fix: Open MetaMask → Settings → Networks → Sepolia → Change RPC URL to: https://ethereum-sepolia-rpc.publicnode.com';
        }

        // Return original message for development, sanitize in production
        return import.meta.env.DEV ? message : 'Transaction failed. Please try again.';
    }
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

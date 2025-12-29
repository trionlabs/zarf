import { getPublicClient, getWalletClient } from '@wagmi/core';
import type { Address, Hash, TransactionReceipt } from 'viem';
import { ZarfVestingABI, ZarfVestingBytecode } from '../contracts/abis/ZarfVesting';
import { ERC20ABI } from '../contracts/abis/ERC20';
import { wagmiConfig } from '../contracts/wallet';
import { waitForTransactionReceipt } from '@wagmi/core';

// --- Types ---

export interface DeployConfig {
    /** Human-readable name for this distribution */
    name: string;
    /** Description or category */
    description: string;
    tokenAddress: Address;
    verifierAddress: Address;
    jwkRegistryAddress: Address;
    merkleRoot: Hash;
    allocations: { emailHash: Hash; amount: bigint }[];
    cliffSeconds: bigint;
    vestingSeconds: bigint;
    vestingPeriodSeconds: bigint; // Duration of each unlock period (e.g., 2592000 for ~30 days)
    totalAmount: bigint;
    owner: Address;
}

export interface DeployProgress {
    step: 'deploy' | 'merkle' | 'allocations' | 'approve' | 'deposit' | 'start' | 'complete' | 'error';
    message: string;
    txHash?: Hash;
    allocationsBatch?: { current: number; total: number };
}

export type ProgressCallback = (progress: DeployProgress) => void;

// --- Service ---

export class DeployService {
    private config: DeployConfig;
    private onProgress: ProgressCallback;
    private contractAddress: Address | null = null;
    private publicClient;

    constructor(config: DeployConfig, onProgress: ProgressCallback) {
        this.config = config;
        this.onProgress = onProgress;
        this.publicClient = getPublicClient(wagmiConfig);
    }

    private async getWallet() {
        // Need to ensure wallet is connected
        const client = await getWalletClient(wagmiConfig);
        return client;
    }

    private async waitTx(hash: Hash, stepName: string) {
        this.onProgress({ step: stepName as any, message: `Confirming ${stepName} transaction...`, txHash: hash });
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status !== 'success') {
            throw new Error(`${stepName} transaction failed on-chain`);
        }
        return receipt;
    }

    /**
     * Step 1: Deploy Contract
     */
    async deployContract(): Promise<Address> {
        this.onProgress({ step: 'deploy', message: 'Deploying ZarfVesting contract...' });

        const wallet = await this.getWallet();

        try {
            const hash = await wallet.deployContract({
                abi: ZarfVestingABI,
                bytecode: ZarfVestingBytecode,
                args: [
                    this.config.name,
                    this.config.description,
                    this.config.tokenAddress,
                    this.config.verifierAddress,
                    this.config.jwkRegistryAddress
                ],
                account: this.config.owner,
            });

            this.onProgress({ step: 'deploy', message: 'Waiting for deployment confirmation...', txHash: hash });

            const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

            if (!receipt.contractAddress) {
                throw new Error('Deployment failed: No contract address returned');
            }

            this.contractAddress = receipt.contractAddress;
            return this.contractAddress;
        } catch (error: any) {
            this.onError('deploy', error);
            throw error;
        }
    }

    /**
     * Step 2: Set Merkle Root
     */
    async setMerkleRoot() {
        if (!this.contractAddress) throw new Error('Contract not deployed');
        this.onProgress({ step: 'merkle', message: 'Setting Merkle Root...' });

        const wallet = await this.getWallet();
        try {
            const hash = await wallet.writeContract({
                address: this.contractAddress,
                abi: ZarfVestingABI,
                functionName: 'setMerkleRoot',
                args: [this.config.merkleRoot],
                account: this.config.owner,
            });
            await this.waitTx(hash, 'merkle');
        } catch (error: any) {
            this.onError('merkle', error);
            throw error;
        }
    }

    /**
     * Step 3: Set Allocations (Batched)
     */
    async setAllocations() {
        if (!this.contractAddress) throw new Error('Contract not deployed');

        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(this.config.allocations.length / BATCH_SIZE);

        const wallet = await this.getWallet();

        try {
            for (let i = 0; i < this.config.allocations.length; i += BATCH_SIZE) {
                const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
                const batch = this.config.allocations.slice(i, i + BATCH_SIZE);

                const emailHashes = batch.map(a => a.emailHash);
                const amounts = batch.map(a => a.amount);

                this.onProgress({
                    step: 'allocations',
                    message: `Setting allocations (Batch ${batchNumber}/${totalBatches})...`,
                    allocationsBatch: { current: batchNumber, total: totalBatches }
                });

                const hash = await wallet.writeContract({
                    address: this.contractAddress,
                    abi: ZarfVestingABI,
                    functionName: 'setAllocations',
                    args: [emailHashes, amounts],
                    account: this.config.owner,
                });

                await this.waitTx(hash, 'allocations');
            }
        } catch (error: any) {
            this.onError('allocations', error);
            throw error;
        }
    }

    /**
     * Step 4: Approve Token
     */
    async approveToken() {
        if (!this.contractAddress) throw new Error('Contract not deployed');
        this.onProgress({ step: 'approve', message: 'Approving token transfer...' });

        const wallet = await this.getWallet();
        try {
            // First check allowance to see if we already have enough
            // But usually for new deployment we just approve
            const hash = await wallet.writeContract({
                address: this.config.tokenAddress,
                abi: ERC20ABI,
                functionName: 'approve',
                args: [this.contractAddress, this.config.totalAmount],
                account: this.config.owner,
            });
            await this.waitTx(hash, 'approve');
        } catch (error: any) {
            this.onError('approve', error);
            throw error;
        }
    }

    /**
     * Step 5: Deposit
     */
    async deposit() {
        if (!this.contractAddress) throw new Error('Contract not deployed');
        this.onProgress({ step: 'deposit', message: 'Depositing tokens...' });

        const wallet = await this.getWallet();
        try {
            const hash = await wallet.writeContract({
                address: this.contractAddress,
                abi: ZarfVestingABI,
                functionName: 'deposit',
                args: [this.config.totalAmount],
                account: this.config.owner,
            });
            await this.waitTx(hash, 'deposit');
        } catch (error: any) {
            this.onError('deposit', error);
            throw error;
        }
    }

    /**
     * Step 6: Start Vesting with Discrete Periodic Unlocks
     * @dev Tokens unlock in complete periods only (e.g., every 30 days).
     *      At 29 days with 30-day period, 0 tokens are claimable.
     *      At 30 days, 1 period's worth unlocks.
     */
    async startVesting() {
        if (!this.contractAddress) throw new Error('Contract not deployed');
        this.onProgress({ step: 'start', message: 'Starting vesting schedule with periodic unlocks...' });

        const wallet = await this.getWallet();
        try {
            const hash = await wallet.writeContract({
                address: this.contractAddress,
                abi: ZarfVestingABI,
                functionName: 'startVesting',
                args: [
                    this.config.cliffSeconds,
                    this.config.vestingSeconds,
                    this.config.vestingPeriodSeconds  // NEW: Period for discrete unlocks
                ],
                account: this.config.owner,
            });
            await this.waitTx(hash, 'start');
        } catch (error: any) {
            this.onError('start', error);
            throw error;
        }
    }

    /**
     * Full Orchestration
     */
    async executeFullDeploy() {
        try {
            await this.deployContract();
            await this.delay(2000); // Prevent RPC rate limiting

            await this.setMerkleRoot();
            await this.delay(2000);

            await this.setAllocations();
            await this.delay(2000);

            await this.approveToken();
            await this.delay(2000);

            await this.deposit();
            await this.delay(2000);

            await this.startVesting();

            this.onProgress({ step: 'complete', message: 'Distribution deployed successfully!' });
            return this.contractAddress;
        } catch (error) {
            // Error is already handled/reported in individual steps
            throw error;
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private onError(step: DeployProgress['step'], error: any) {
        console.error(`Error in ${step}:`, error);
        this.onProgress({
            step: 'error',
            message: error.message || `Failed at ${step}`,
        });
    }
}

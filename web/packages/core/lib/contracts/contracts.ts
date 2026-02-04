/**
 * Smart Contract Interaction Utilities
 * 
 * Handles interactions with ZarfVesting contract for claim submissions
 * and status queries. Uses Viem for type-safe contract interactions.
 * 
 * @module contracts/contracts
 */

import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    parseAbi,
    type PublicClient,
    type WalletClient,
    type Hash,
    type Address
} from 'viem';
import { sepolia } from 'viem/chains';
import type { VestingInfo, TransactionResult, VestingSchedule } from '../types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Contract addresses from environment variables
 */
const VESTING_ADDRESS = import.meta.env.VITE_VESTING_ADDRESS as Address | undefined;
const JWK_REGISTRY_ADDRESS = import.meta.env.VITE_JWK_REGISTRY_ADDRESS as Address | undefined;

/**
 * RPC URL override (optional)
 */
const RPC_URL = import.meta.env.VITE_RPC_URL as string | undefined;

/**
 * Active chain
 */
const chain = sepolia;

// ============================================================================
// Contract ABIs
// ============================================================================

/**
 * ZarfVesting contract ABI (minimal - only functions we use)
 */
const VESTING_ABI = parseAbi([
    // Write functions
    'function claim(bytes calldata proof, bytes32[] calldata publicInputs) external',

    // Read functions
    'function isClaimed(bytes32 epochCommitment) external view returns (bool)',
    'function merkleRoot() external view returns (bytes32)',

    // Metadata
    'function name() external view returns (string)',
    'function owner() external view returns (address)',
    'function token() external view returns (address)',

    // Errors
    'error InvalidProof()',
    'error InvalidMerkleRoot()',
    'error InvalidRecipient()',
    'error InvalidPubkey()',
    'error AlreadyClaimed()',
    'error EpochLocked()',
    'error Unauthorized()',
    'error TransferFailed()',
    'error AlreadyInitialized()',
]);

/**
 * ERC20 Metadata ABI
 */
const ERC20_ABI = parseAbi([
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
]);

/**
 * JWK Registry contract ABI (minimal)
 */
const JWK_REGISTRY_ABI = parseAbi([
    'function isValidKeyHash(bytes32 keyHash) external view returns (bool)',
    'function computeKeyHash(bytes32[18] calldata pubkeyLimbs) external pure returns (bytes32)',
]);

// ============================================================================
// Chain Management
// ============================================================================

/**
 * Ensure wallet is connected to Sepolia network.
 * Automatically switches or adds Sepolia if necessary.
 * 
 * @throws {Error} If no wallet is detected or switch fails
 * 
 * @internal
 */
async function ensureSepoliaChain(): Promise<void> {
    if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
    }

    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
    const sepoliaChainId = '0x' + sepolia.id.toString(16); // 0xaa36a7

    if (currentChainId === sepoliaChainId) {
        return; // Already on Sepolia
    }

    try {
        // Attempt to switch to Sepolia
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: sepoliaChainId }],
        });
    } catch (switchError: any) {
        // Chain not added to wallet - add it
        if (switchError.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                    {
                        chainId: sepoliaChainId,
                        chainName: 'Sepolia Testnet',
                        nativeCurrency: {
                            name: 'Sepolia ETH',
                            symbol: 'ETH',
                            decimals: 18,
                        },
                        rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                        blockExplorerUrls: ['https://sepolia.etherscan.io'],
                    },
                ],
            });
        } else {
            throw new Error(`Failed to switch to Sepolia: ${switchError.message || 'unknown error'}`);
        }
    }
}

// ============================================================================
// Client Creation
// ============================================================================

/**
 * Get public client for reading contract state.
 * No wallet required.
 * 
 * @returns Public client instance
 */
function getPublicClient(): PublicClient {
    const rpcUrl = RPC_URL || chain.rpcUrls.default.http[0];

    return createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
}

/**
 * Get wallet client for sending transactions.
 * Requires wallet extension (MetaMask, etc.).
 * 
 * @returns Wallet client instance
 * 
 * @throws {Error} If no wallet is detected
 */
function getWalletClient(): WalletClient {
    if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
    }

    return createWalletClient({
        chain,
        transport: custom(window.ethereum),
    });
}

// ============================================================================
// Contract Interactions
// ============================================================================

/**
 * Submit a claim to the vesting contract.
 * 
 * Workflow:
 * 1. Validates contract is configured
 * 2. Ensures wallet is on Sepolia
 * 3. Simulates transaction to catch errors early
 * 4. Submits transaction
 * 5. Waits for confirmation
 * 
 * @param proof - Hex-encoded ZK proof bytes
 * @param publicInputs - Array of public inputs (strings or bigints)
 * @param account - User's wallet address
 * @returns Transaction hash and receipt
 * 
 * @throws {Error} If contract not configured, simulation fails, or tx fails
 * 
 * @example
 * ```typescript
 * const result = await submitClaim(
 *   proof.proof,
 *   proof.publicInputs.map(i => i.toString()),
 *   walletAddress
 * );
 * 
 * console.log('Claim submitted:', result.hash);
 * console.log('Block:', result.receipt.blockNumber);
 * ```
 */
/**
 * Read metadata from a Vesting Contract.
 * Used for the "Import Distribution" feature.
 * 
 * @param address - Contract address
 */
export async function readVestingContract(address: Address) {
    const publicClient = getPublicClient();

    try {
        const [name, owner, token, merkleRoot] = await Promise.all([
            publicClient.readContract({ address, abi: VESTING_ABI, functionName: 'name' }),
            publicClient.readContract({ address, abi: VESTING_ABI, functionName: 'owner' }),
            publicClient.readContract({ address, abi: VESTING_ABI, functionName: 'token' }),
            publicClient.readContract({ address, abi: VESTING_ABI, functionName: 'merkleRoot' }),
        ]);

        // Fetch token metadata
        const [symbol, decimals] = await Promise.all([
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);

        return {
            name,
            owner,
            token,
            merkleRoot,
            tokenSymbol: symbol,
            tokenDecimals: decimals
        };
    } catch (error) {
        console.error('Failed to read vesting contract:', error);
        throw new Error('Invalid Vesting Address or Network Error');
    }
}

export async function submitClaim(
    proof: string,
    publicInputs: (string | bigint)[],
    account: Address,
    contractAddress?: Address
): Promise<{ hash: Hash; receipt: any }> {
    const targetAddress = contractAddress || VESTING_ADDRESS;
    if (!targetAddress) {
        throw new Error('Vesting contract not configured. Set VITE_VESTING_ADDRESS in .env file or pass explicit address.');
    }

    // Ensure wallet is on Sepolia
    await ensureSepoliaChain();

    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    // Format proof as bytes
    const proofBytes = proof.startsWith('0x') ? proof : `0x${proof}`;

    // Format public inputs as bytes32 array
    const formattedInputs = publicInputs.map((input) => {
        if (typeof input === 'string' && input.startsWith('0x')) {
            // Ensure 32 bytes (64 hex chars + 0x)
            return input.padEnd(66, '0') as `0x${string}`;
        }
        // Convert bigint/number to hex
        return ('0x' + BigInt(input).toString(16).padStart(64, '0')) as `0x${string}`;
    });

    console.log('[Contracts] Submitting claim:', {
        targetAddress,
        proof: proofBytes.slice(0, 20) + '...',
        publicInputsCount: formattedInputs.length,
        account,
    });

    // Simulate transaction to catch errors before sending
    try {
        await publicClient.simulateContract({
            address: targetAddress,
            abi: VESTING_ABI,
            functionName: 'claim',
            args: [proofBytes as `0x${string}`, formattedInputs],
            account,
        });
    } catch (error: any) {
        // Parse contract-specific errors
        const errorMessage = error.message || error.toString();

        if (errorMessage.includes('InvalidProof')) {
            throw new Error('ZK proof verification failed on-chain');
        }
        if (errorMessage.includes('InvalidPubkey')) {
            throw new Error('JWT public key not registered in JWKRegistry');
        }
        if (errorMessage.includes('InvalidMerkleRoot')) {
            throw new Error('Merkle root in proof does not match contract');
        }
        if (errorMessage.includes('InvalidRecipient')) {
            throw new Error('Proof was generated for a different wallet address');
        }
        if (errorMessage.includes('AlreadyClaimed')) {
            throw new Error('This epoch has already been claimed');
        }
        if (errorMessage.includes('EpochLocked')) {
            throw new Error('This epoch is not yet unlocked');
        }

        // Generic error
        throw new Error(`Transaction simulation failed: ${errorMessage}`);
    }

    // Submit transaction
    const hash = await walletClient.writeContract({
        address: targetAddress,
        abi: VESTING_ABI,
        functionName: 'claim',
        args: [proofBytes as `0x${string}`, formattedInputs],
        account,
        chain,
        gas: 1200000n, // Explicit buffer for ZK Verifier (approx 800k-1M)
    });

    console.log('[Contracts] Transaction submitted:', hash);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('[Contracts] Transaction confirmed:', receipt);

    return { hash, receipt };
}

/**
 * Get vesting contract information.
 * 
 * @returns Vesting parameters or null if contract not configured
 * 
 * @example
 * ```typescript
 * const info = await getVestingInfo();
 * if (info) {
 *   console.log('Vesting starts:', new Date(info.vestingStart * 1000));
 *   console.log('Cliff:', info.cliffDuration, 'seconds');
 *   console.log('Merkle root:', info.merkleRoot);
 * }
 * ```
 */


/**
 * Get claim status for a specific email hash.
 * 
 * @param emailHash - Hashed email (bytes32)
 * @returns Claim status data or null on error
 * 
 * @example
 * ```typescript
 * const status = await getClaimStatus(emailHashHex);
 * if (status) {
 *   console.log('Allocated:', status.allocation);
 *   console.log('Claimed:', status.claimed);
 *   console.log('Available:', status.claimable);
 * }
 * ```
 */
/**
 * Check if a specific epoch commitment has been claimed.
 * 
 * @param epochCommitment - The unique identifier for the epoch (bytes32)
 */
export async function isEpochClaimed(
    epochCommitment: string,
    contractAddress?: Address
): Promise<boolean> {
    const targetAddress = contractAddress || VESTING_ADDRESS;
    if (!targetAddress) return false;

    const publicClient = getPublicClient();

    try {
        return await publicClient.readContract({
            address: targetAddress,
            abi: VESTING_ABI,
            functionName: 'isClaimed',
            args: [epochCommitment as `0x${string}`],
        });
    } catch (error) {
        console.warn('[Contracts] Failed to check epoch status:', error);
        return false;
    }
}

/**
 * Get vesting schedule parameters.
 * 
 * @param contractAddress - Optional override
 * @returns Vesting schedule or null
 */


/**
 * Get vesting unlock progress.
 * 
 * @param contractAddress - Optional override
 * @returns Progress stats or null
 */


// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if contract addresses are configured.
 * 
 * @returns True if VITE_VESTING_ADDRESS is set
 * 
 * @example
 * ```typescript
 * if (!isContractConfigured()) {
 *   console.log('Please configure contract addresses in .env');
 * }
 * ```
 */
export function isContractConfigured(): boolean {
    return !!VESTING_ADDRESS;
}

/**
 * Get block explorer URL for a transaction.
 * 
 * @param txHash - Transaction hash
 * @returns Etherscan URL
 * 
 * @example
 * ```typescript
 * const url = getExplorerUrl(txHash);
 * window.open(url, '_blank');
 * ```
 */
export function getExplorerUrl(txHash: Hash): string {
    return `${chain.blockExplorers.default.url}/tx/${txHash}`;
}

/**
 * Get block explorer URL for an address.
 * 
 * @param address - Contract or wallet address
 * @returns Etherscan URL
 * 
 * @example
 * ```typescript
 * const url = getAddressUrl(contractAddress);
 * ```
 */
export function getAddressUrl(address: Address): string {
    return `${chain.blockExplorers.default.url}/address/${address}`;
}

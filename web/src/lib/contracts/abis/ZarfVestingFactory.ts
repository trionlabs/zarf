/**
 * ZarfVestingFactory ABI
 * 
 * Auto-generated from Solidity contract.
 * Provides typed interface for factory deployment operations.
 * 
 * Updated: 2026-01-03 - ADR-023: Removed on-chain allocations, using Merkle Root only
 * 
 * @module contracts/abis/ZarfVestingFactory
 */

/**
 * CreateVestingParams struct - matches Solidity struct (ADR-023)
 * Note: commitments and amounts are still passed for salt calculation (CREATE2),
 * but they are NOT stored on-chain anymore.
 */
export interface CreateVestingParams {
    name: string;
    description: string;
    token: `0x${string}`;
    merkleRoot: `0x${string}`;
    commitments: readonly `0x${string}`[];  // ADR-012: identity commitments
    amounts: readonly bigint[];
    cliffDuration: bigint;
    vestingDuration: bigint;
    vestingPeriod: bigint;
}

export const ZarfVestingFactoryABI = [
    // Events
    {
        type: 'event',
        name: 'VestingCreated',
        inputs: [
            { name: 'vesting', type: 'address', indexed: true },
            { name: 'owner', type: 'address', indexed: true },
            { name: 'token', type: 'address', indexed: true },
            { name: 'totalAmount', type: 'uint256', indexed: false },
            { name: 'recipientCount', type: 'uint256', indexed: false }
        ]
    },

    // Errors
    { type: 'error', name: 'ArrayLengthMismatch', inputs: [] },
    { type: 'error', name: 'ZeroAllocations', inputs: [] },
    { type: 'error', name: 'TransferFailed', inputs: [] },
    { type: 'error', name: 'DeploymentFailed', inputs: [] },

    // Constructor
    {
        type: 'constructor',
        inputs: [
            { name: '_verifier', type: 'address' },
            { name: '_jwkRegistry', type: 'address' }
        ]
    },

    // Read functions
    {
        type: 'function',
        name: 'verifier',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'jwkRegistry',
        inputs: [],
        outputs: [{ type: 'address' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'deployments',
        inputs: [{ name: 'index', type: 'uint256' }],
        outputs: [{ type: 'address' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'getDeploymentCount',
        inputs: [],
        outputs: [{ name: 'count', type: 'uint256' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'getOwnerDeployments',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ type: 'address[]' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'getOwnerDeploymentCount',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: 'count', type: 'uint256' }],
        stateMutability: 'view'
    },
    {
        type: 'function',
        name: 'ownerDeployments',
        inputs: [
            { name: '', type: 'address' },
            { name: '', type: 'uint256' }
        ],
        outputs: [{ type: 'address' }],
        stateMutability: 'view'
    },
    // NEW: predictVestingAddress for deterministic filename
    {
        type: 'function',
        name: 'predictVestingAddress',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'description', type: 'string' },
                    { name: 'token', type: 'address' },
                    { name: 'merkleRoot', type: 'bytes32' },
                    { name: 'commitments', type: 'bytes32[]' },
                    { name: 'amounts', type: 'uint256[]' },
                    { name: 'cliffDuration', type: 'uint256' },
                    { name: 'vestingDuration', type: 'uint256' },
                    { name: 'vestingPeriod', type: 'uint256' }
                ]
            },
            { name: 'owner', type: 'address' }
        ],
        outputs: [{ type: 'address' }],
        stateMutability: 'view'
    },

    // Write functions - Using struct pattern (CreateVestingParams)
    {
        type: 'function',
        name: 'createVesting',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'description', type: 'string' },
                    { name: 'token', type: 'address' },
                    { name: 'merkleRoot', type: 'bytes32' },
                    { name: 'commitments', type: 'bytes32[]' },
                    { name: 'amounts', type: 'uint256[]' },
                    { name: 'cliffDuration', type: 'uint256' },
                    { name: 'vestingDuration', type: 'uint256' },
                    { name: 'vestingPeriod', type: 'uint256' }
                ]
            }
        ],
        outputs: [{ name: 'vesting', type: 'address' }],
        stateMutability: 'nonpayable'
    },
    {
        type: 'function',
        name: 'createAndFundVesting',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'name', type: 'string' },
                    { name: 'description', type: 'string' },
                    { name: 'token', type: 'address' },
                    { name: 'merkleRoot', type: 'bytes32' },
                    { name: 'commitments', type: 'bytes32[]' },
                    { name: 'amounts', type: 'uint256[]' },
                    { name: 'cliffDuration', type: 'uint256' },
                    { name: 'vestingDuration', type: 'uint256' },
                    { name: 'vestingPeriod', type: 'uint256' }
                ]
            },
            { name: 'depositAmount', type: 'uint256' }
        ],
        outputs: [{ name: 'vesting', type: 'address' }],
        stateMutability: 'nonpayable'
    }
] as const;

export type ZarfVestingFactoryAbi = typeof ZarfVestingFactoryABI;

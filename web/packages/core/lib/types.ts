/**
 * Shared TypeScript types for Zarf web application
 * 
 * This file contains all core type definitions used across utilities and stores.
 * Keep this file focused on data structures, not UI component props.
 */

export type StellarAddress = string;
export type StellarContractId = string;
export type TransactionHash = string;
export type HexString = `0x${string}`;

// ============================================================================
// Whitelist & CSV Types
// ============================================================================

/**
 * Entry from CSV whitelist file
 */
export interface WhitelistEntry {
    email: string;
    amount: bigint;
}

/**
 * Complete Merkle tree data structure with claims
 */
export interface MerkleTreeData {
    root: bigint;
    tree: {
        minDepth: number;
        depth: number;
        layers: bigint[][];
        emptyHashes: bigint[];
    };
    claims: MerkleClaim[];
}


export type DurationUnit = "minutes" | "hours" | "weeks" | "months" | "quarters" | "years";

export interface UnlockMarker {
    x: number;
    percent: number;
    tokens: number;
    date: Date | null;
    event: number;
    isGrouped: boolean;
}

/**
 * Vesting schedule configuration (Defined in Wizard, used in Generator)
 */
export interface Schedule {
    cliffEndDate: string; // ISO date string (YYYY-MM-DD)
    cliffTime: string;    // Time string (HH:MM) in UTC
    distributionDuration: number;
    durationUnit: DurationUnit;
}

/**
 * Individual claim with Merkle proof data
 */
export interface MerkleClaim {
    email: string;
    amount: bigint;
    salt: string;        // Hex string (Holds the Hash Chain Secret for the circuit)
    pin?: string;        // The original plain text PIN (Master Salt) - Used for export
    identityCommitment: string; // Pedersen(email, secret) - Public Identifier
    leaf: bigint;
    leafIndex: number;
    unlockTime: number; // ADR-023: Discrete Vesting unlock timestamp
}

/**
 * Merkle proof for verification
 */
export interface MerkleProof {
    siblings: string[];  // Hex strings
    indices: number[];   // Path indices (0 = left, 1 = right)
}

// ============================================================================
// Authentication & JWT Types
// ============================================================================

/**
 * Decoded JWT payload from Google OAuth
 */
export interface JWTPayload {
    email: string;
    name?: string;
    picture?: string;
    iss: string;        // Issuer (accounts.google.com)
    aud: string;        // Audience (client ID)
    exp: number;        // Expiration timestamp
    iat: number;        // Issued at timestamp
    sub: string;        // Subject (user ID)
    email_verified?: boolean;
}

/**
 * Decoded JWT header
 */
export interface JWTHeader {
    kid: string;        // Key ID
    alg: string;        // Algorithm (RS256)
    typ: string;        // Type (JWT)
}

/**
 * Google's public key for JWT verification
 */
export interface GooglePublicKey {
    kid: string;        // Key ID (matches JWT header)
    n: string;          // Modulus (base64url)
    e: string;          // Exponent (base64url)
    alg: string;        // Algorithm
    kty: string;        // Key type (RSA)
    use: string;        // Usage (sig)
}

/**
 * Complete decoded JWT
 */
export interface DecodedJWT {
    header: JWTHeader;
    payload: JWTPayload;
}

/**
 * OAuth state parameter for preserving context through redirect
 * Used to pass contractAddress through Google OAuth flow
 */
export interface OAuthState {
    /** Contract address to claim from (optional) */
    address?: StellarContractId;
}

// ============================================================================
// ZK Proof Types
// ============================================================================

/**
 * Public inputs for ZK proof verification
 */
export interface ZKPublicInputs {
    identityCommitment: string;      // Pedersen(email, secret) - Public Identifier
    merkleRoot: string;     // Merkle root (hex)
    recipient: string;      // Recipient field element used by the Stellar circuit
    amount: bigint;         // Claimed amount
}

/**
 * Complete ZK proof with metadata
 */
export interface ZKProof {
    proof: string;                    // Hex-encoded proof bytes
    publicInputs: ZKPublicInputs;     // Public inputs object (Convenience)
    publicValues: string[];           // Raw public inputs array (REQUIRED for Contract)
    // Convenience duplicates (same as publicInputs)
    identityCommitment: string;       // REPLACED emailHash
    merkleRoot: string;
    recipient: string;
    amount: bigint;
}

/**
 * Claim data for ZK proof generation
 */
export interface ZKClaimData {
    email: string;              // User's email
    salt: string;               // Random salt (hex field element)
    amount: bigint;             // Claimed amount
    merkleProof: MerkleProof;   // Merkle proof siblings & indices
    merkleRoot: bigint;         // Merkle root
    recipient: string;          // Stellar recipient field element
    unlockTime: bigint;         // ADR-023: Discrete Vesting unlock timestamp
}

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet connection result
 */
export interface WalletConnection {
    address: StellarAddress;
    network: string;
    networkPassphrase: string;
}

/**
 * Wallet account state
 */
export interface WalletAccount {
    isConnected: boolean;
    address?: StellarAddress;
    network?: string;
    networkPassphrase?: string;
}

// ============================================================================
// Contract Types
// ============================================================================

/**
 * Vesting contract information
 */
export interface VestingInfo {
    vestingAddress: StellarContractId;
    totalAmount: bigint;
    claimedAmount: bigint;
    merkleRoot: string;
    cliffEndDate: number;       // Unix timestamp
    distributionDuration: number; // Months
}

/**
 * Vesting schedule parameters
 */
export interface VestingSchedule {
    vestingStart: number;
    cliffDuration: number;
    vestingDuration: number;
    vestingPeriod: number;
}

/**
 * Transaction result
 */
export interface TransactionResult {
    hash: TransactionHash;
    blockNumber?: bigint;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic async operation state
 */
export type AsyncState<T> =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; data: T }
    | { status: 'error'; error: Error };

/**
 * Network configuration
 */
export interface NetworkConfig {
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    networkPassphrase: string;
}

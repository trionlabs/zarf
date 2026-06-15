/**
 * Stellar/Soroban contract interaction utilities.
 */

import {
    Address as StellarSdkAddress,
    BASE_FEE,
    Contract,
    ScInt,
    TransactionBuilder,
    nativeToScVal,
    rpc,
    scValToNative,
    xdr,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { getStellarConfig } from '../config/runtime';
import type { StellarRuntimeConfig } from '../config/runtime';
import { fetchIndexerJson, indexerNetworkPath } from '../utils/indexerClient';
import { warn } from '../utils/log';
import { validateTokenDecimals } from '../utils/tokenDecimals';
import type {
    StellarAddress,
    StellarContractId,
    TransactionHash,
    TransactionResult,
} from '../types';
import { signTransaction } from './wallet';

const FIELD_BYTES = 32;

export interface VestingContractMetadata {
    name: string;
    description: string;
    owner: StellarAddress;
    token: StellarContractId;
    merkleRoot: string;
    tokenSymbol: string;
    tokenDecimals: number;
}

export interface TokenContractMetadata {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    totalSupply: string | null;
    logoUrl: string | null;
}

interface IndexerVestingContract {
    address?: StellarContractId;
    name: string;
    description: string;
    owner: StellarAddress;
    token: StellarContractId;
    merkleRoot: string;
    tokenSymbol: string;
    tokenDecimals: number;
    metadataCid?: string | null;
}

interface IndexerTokenBalance {
    balance: string;
}

interface IndexerTokenAllowance {
    allowance: string;
}

interface IndexerRecipientId {
    recipientId: `0x${string}`;
}

interface IndexerClaimed {
    claimed: boolean;
}

interface IndexerClaimedBatch {
    claimed: Record<string, boolean>;
}

interface IndexerPrediction {
    address: StellarContractId;
}

interface IndexerLatestLedger {
    sequence: number;
}

interface IndexerVestings {
    vestings: Array<{ address: StellarContractId; metadataCid?: string | null }>;
    total: number;
}

interface IndexerOwnerVestings {
    contracts: Array<{ address: StellarContractId }>;
    total: number;
}

function cfg(): StellarRuntimeConfig & { rpcUrl: string; networkPassphrase: string } {
    const stellar = getStellarConfig();
    const { rpcUrl, networkPassphrase } = stellar;
    if (!rpcUrl) throw new Error('Missing Stellar RPC URL');
    if (!networkPassphrase) throw new Error('Missing Stellar network passphrase');
    return { ...stellar, rpcUrl, networkPassphrase };
}

function server(): rpc.Server {
    return new rpc.Server(cfg().rpcUrl);
}

function normalizeHex(value: string): string {
    return value.startsWith('0x') ? value.slice(2) : value;
}

function hexToBuffer(value: string, expectedBytes?: number): Buffer {
    const hex = normalizeHex(value);
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error(`Invalid hex string: ${value}`);
    }
    const out = Buffer.from(hex, 'hex');
    if (expectedBytes !== undefined && out.length !== expectedBytes) {
        throw new Error(`Expected ${expectedBytes} bytes, got ${out.length}`);
    }
    return out;
}

function fieldToBytes(value: string | bigint): Buffer {
    const hex = typeof value === 'bigint' ? value.toString(16) : normalizeHex(value);
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
        throw new Error(`Invalid field element: ${String(value)}`);
    }
    if (hex.length > FIELD_BYTES * 2) {
        throw new Error('Field element exceeds 32 bytes');
    }
    return Buffer.from(hex.padStart(FIELD_BYTES * 2, '0'), 'hex');
}

function fieldsToBytes(fields: (string | bigint)[]): Buffer {
    return Buffer.concat(fields.map(fieldToBytes));
}

function scBytes(hex: string): xdr.ScVal {
    return xdr.ScVal.scvBytes(hexToBuffer(hex));
}

function scBytesN32(hex: string): xdr.ScVal {
    return xdr.ScVal.scvBytes(hexToBuffer(hex, FIELD_BYTES));
}

function scString(value: string): xdr.ScVal {
    return xdr.ScVal.scvString(value);
}

function scAddress(address: string): xdr.ScVal {
    return StellarSdkAddress.fromString(address).toScVal();
}

function scI128(value: bigint): xdr.ScVal {
    return new ScInt(value, { type: 'i128' }).toI128();
}

function scU32(value: number): xdr.ScVal {
    return nativeToScVal(value, { type: 'u32' });
}

function scU64(value: number | bigint): xdr.ScVal {
    return nativeToScVal(value, { type: 'u64' });
}

function scBool(value: boolean): xdr.ScVal {
    return xdr.ScVal.scvBool(value);
}

async function invoke(
    sourceAddress: StellarAddress,
    contractId: StellarContractId,
    method: string,
    args: xdr.ScVal[],
    onSubmitted?: (hash: TransactionHash) => void,
): Promise<{ hash: TransactionHash; receipt: rpc.Api.GetTransactionResponse }> {
    const s = server();
    const source = await s.getAccount(sourceAddress);
    const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: cfg().networkPassphrase,
    })
        .setTimeout(30)
        .addOperation(new Contract(contractId).call(method, ...args))
        .build();

    const prepared = await s.prepareTransaction(tx);
    const signedXdr = await signTransaction(prepared.toXDR(), sourceAddress);
    const signed = TransactionBuilder.fromXDR(signedXdr, cfg().networkPassphrase);
    const sent = await s.sendTransaction(signed);
    if (sent.status === 'ERROR') {
        throw new Error('Stellar transaction submission failed');
    }
    onSubmitted?.(sent.hash);

    const receipt = await s.pollTransaction(sent.hash, { attempts: 12 });
    if (receipt.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Stellar transaction ${receipt.status}`);
    }

    return { hash: sent.hash, receipt };
}

/** Read-only contract call via RPC simulation (no signing or submission). */
async function simulateRead(
    sourceAddress: StellarAddress,
    contractId: StellarContractId,
    method: string,
    args: xdr.ScVal[],
): Promise<xdr.ScVal> {
    const s = server();
    const source = await s.getAccount(sourceAddress);
    const tx = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: cfg().networkPassphrase,
    })
        .setTimeout(30)
        .addOperation(new Contract(contractId).call(method, ...args))
        .build();

    const sim = await s.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Simulation failed: ${sim.error}`);
    }
    const retval = sim.result?.retval;
    if (!retval) {
        throw new Error('Simulation returned no value');
    }
    return retval;
}

export async function readVestingContract(
    address: StellarContractId,
): Promise<VestingContractMetadata> {
    const indexed = await fetchIndexerJson<IndexerVestingContract>(
        indexerNetworkPath(`/vestings/${encodeURIComponent(address)}`),
    );

    validateTokenDecimals(indexed.tokenDecimals);

    return {
        name: indexed.name,
        description: indexed.description,
        owner: indexed.owner,
        token: indexed.token,
        merkleRoot: indexed.merkleRoot,
        tokenSymbol: indexed.tokenSymbol,
        tokenDecimals: indexed.tokenDecimals,
    };
}

export async function readTokenContract(
    tokenAddress: StellarContractId,
): Promise<TokenContractMetadata> {
    return fetchIndexerJson<TokenContractMetadata>(
        indexerNetworkPath(`/tokens/${encodeURIComponent(tokenAddress)}`),
    );
}

export async function getTokenBalance(
    tokenAddress: StellarContractId,
    owner: StellarAddress,
): Promise<bigint> {
    const indexed = await fetchIndexerJson<IndexerTokenBalance>(
        indexerNetworkPath(
            `/tokens/${encodeURIComponent(tokenAddress)}/balances/${encodeURIComponent(owner)}`,
        ),
    );
    return BigInt(indexed.balance);
}

export async function getTokenAllowance(
    tokenAddress: StellarContractId,
    owner: StellarAddress,
    spender: StellarContractId,
): Promise<bigint> {
    const indexed = await fetchIndexerJson<IndexerTokenAllowance>(
        indexerNetworkPath(
            `/tokens/${encodeURIComponent(tokenAddress)}/allowances/${encodeURIComponent(owner)}/${encodeURIComponent(spender)}`,
        ),
    );
    return BigInt(indexed.allowance);
}

export async function recipientId(
    contractAddress: StellarContractId,
    recipient: StellarAddress,
): Promise<`0x${string}`> {
    const indexed = await fetchIndexerJson<IndexerRecipientId>(
        indexerNetworkPath(
            `/vestings/${encodeURIComponent(contractAddress)}/recipient-id/${encodeURIComponent(recipient)}`,
        ),
    );
    return indexed.recipientId;
}

export async function isEpochClaimed(
    epochCommitment: string,
    contractAddress?: StellarContractId,
): Promise<boolean> {
    const target = contractAddress || cfg().vestingAddress;
    if (!target) throw new Error('Missing Stellar vesting contract address');
    const indexed = await fetchIndexerJson<IndexerClaimed>(
        indexerNetworkPath(
            `/vestings/${encodeURIComponent(target)}/claimed/${encodeURIComponent(epochCommitment)}`,
        ),
    );
    return indexed.claimed;
}

/** Indexer batch route reads ledger entries directly; it accepts up to 100 commitments. */
const CLAIMED_BATCH_CHUNK = 100;

/**
 * Batched claim-status lookup. One indexer request (one RPC `getLedgerEntries`
 * call) covers up to 100 commitments, instead of one `is_claimed` simulation
 * per epoch. Falls back to parallel per-epoch reads when the indexer
 * deployment predates the batch route; individual fallback failures count as
 * unclaimed, matching discovery semantics.
 */
export async function areEpochsClaimed(
    epochCommitments: string[],
    contractAddress?: StellarContractId,
): Promise<Map<string, boolean>> {
    const target = contractAddress || cfg().vestingAddress;
    if (!target) throw new Error('Missing Stellar vesting contract address');

    const flags = new Map<string, boolean>();
    if (epochCommitments.length === 0) return flags;

    try {
        for (let i = 0; i < epochCommitments.length; i += CLAIMED_BATCH_CHUNK) {
            const chunk = epochCommitments.slice(i, i + CLAIMED_BATCH_CHUNK);
            const indexed = await fetchIndexerJson<IndexerClaimedBatch>(
                indexerNetworkPath(`/vestings/${encodeURIComponent(target)}/claimed`),
                { commitments: chunk.join(',') },
            );
            for (const commitment of chunk) {
                flags.set(commitment, indexed.claimed[commitment] === true);
            }
        }
        return flags;
    } catch (error) {
        warn('[Contracts] Batch claim-status read failed; falling back to per-epoch reads', error);
        const statuses = await Promise.all(
            epochCommitments.map((commitment) =>
                isEpochClaimed(commitment, target).catch(() => false),
            ),
        );
        epochCommitments.forEach((commitment, index) => flags.set(commitment, statuses[index]));
        return flags;
    }
}

export async function submitClaim(
    proof: string,
    publicInputs: (string | bigint)[],
    account: StellarAddress,
    contractAddress?: StellarContractId,
): Promise<TransactionResult & { receipt: rpc.Api.GetTransactionResponse }> {
    const target = contractAddress || cfg().vestingAddress;
    if (!target) throw new Error('Missing Stellar vesting contract address');

    const { hash, receipt } = await invoke(account, target, 'claim', [
        scBytes(proof),
        xdr.ScVal.scvBytes(fieldsToBytes(publicInputs)),
        scAddress(account),
    ]);

    return { hash, receipt };
}

export async function approveTokenAllowance(
    params: {
        tokenAddress: StellarContractId;
        owner: StellarAddress;
        spender: StellarContractId;
        amount: bigint;
        expirationLedger: number;
    },
    onSubmitted?: (hash: TransactionHash) => void,
): Promise<TransactionHash> {
    const { hash } = await invoke(
        params.owner,
        params.tokenAddress,
        'approve',
        [
            scAddress(params.owner),
            scAddress(params.spender),
            scI128(params.amount),
            scU32(params.expirationLedger),
        ],
        onSubmitted,
    );
    return hash;
}

export async function createAndFundVesting(
    params: {
        factoryAddress: StellarContractId;
        owner: StellarAddress;
        tokenAddress: StellarContractId;
        salt: `0x${string}`;
        name: string;
        description: string;
        merkleRoot: `0x${string}`;
        audienceHash: `0x${string}`;
        recipientCount: number;
        totalAmount: bigint;
        metadataCid: string;
    },
    onSubmitted?: (hash: TransactionHash) => void,
): Promise<{ hash: TransactionHash; vestingAddress: StellarContractId }> {
    const predicted = await predictVestingAddress(params.factoryAddress, params.owner, params.salt);
    const { hash } = await invoke(
        params.owner,
        params.factoryAddress,
        'create_and_fund_vesting',
        [
            scAddress(params.owner),
            scAddress(params.tokenAddress),
            scBytesN32(params.salt),
            scString(params.name),
            scString(params.description),
            scBytesN32(params.merkleRoot),
            scBytesN32(params.audienceHash),
            scU32(params.recipientCount),
            scI128(params.totalAmount),
            scString(params.metadataCid),
        ],
        onSubmitted,
    );
    return { hash, vestingAddress: predicted };
}

export async function predictVestingAddress(
    _factoryAddress: StellarContractId,
    owner: StellarAddress,
    salt: `0x${string}`,
): Promise<StellarContractId> {
    const indexed = await fetchIndexerJson<IndexerPrediction>(
        indexerNetworkPath(
            `/factory/predict/${encodeURIComponent(owner)}/${encodeURIComponent(salt)}`,
        ),
    );
    return indexed.address;
}

// ---- Airdrop factory (standalone; separate from the ZK vesting factory above) ----

export interface CreateAirdropParams {
    factoryAddress: StellarContractId;
    owner: StellarAddress;
    token: StellarContractId;
    merkleRoot: `0x${string}`;
    total: bigint;
    /** Claim deadline as a unix timestamp in seconds; 0 = no deadline. */
    deadline: number;
    locked: boolean;
    recipientCount: number;
    salt: `0x${string}`;
    metadataCid: string;
}

/**
 * Build the `create_airdrop` ScVal argument list in the exact positional order
 * the contract expects (02 §2.5): owner, token, merkle_root, total, deadline,
 * locked, recipient_count, salt, metadata_cid. Exported so the ordering can be
 * unit-tested without a live network.
 */
export function buildCreateAirdropArgs(params: CreateAirdropParams): xdr.ScVal[] {
    return [
        scAddress(params.owner),
        scAddress(params.token),
        scBytesN32(params.merkleRoot),
        scI128(params.total),
        scU64(params.deadline),
        scBool(params.locked),
        scU32(params.recipientCount),
        scBytesN32(params.salt),
        scString(params.metadataCid),
    ];
}

/**
 * Deploy + atomically fund an airdrop instance via the airdrop factory. The
 * caller already holds the predicted address (from `predictAirdropAddress`) to
 * build/pin the claim-list, so this returns only the tx hash; the deployed
 * address equals the predicted one (proven by the factory's M2 tests).
 */
export async function createAirdrop(
    params: CreateAirdropParams,
    onSubmitted?: (hash: TransactionHash) => void,
): Promise<{ hash: TransactionHash }> {
    const { hash } = await invoke(
        params.owner,
        params.factoryAddress,
        'create_airdrop',
        buildCreateAirdropArgs(params),
        onSubmitted,
    );
    return { hash };
}

/**
 * Predict the deterministic instance address for `(owner, salt)` by simulating
 * the factory's `predict_airdrop_address` view. The airdrop tool has no indexer
 * in v1, so this reads the contract directly via RPC simulation — the contract
 * is the source of truth (cf. the indexer-backed `predictVestingAddress`).
 */
export async function predictAirdropAddress(
    factoryAddress: StellarContractId,
    owner: StellarAddress,
    salt: `0x${string}`,
): Promise<StellarContractId> {
    const retval = await simulateRead(owner, factoryAddress, 'predict_airdrop_address', [
        scAddress(owner),
        scBytesN32(salt),
    ]);
    return StellarSdkAddress.fromScVal(retval).toString() as StellarContractId;
}

/**
 * Read a token's display metadata (name/symbol/decimals) straight from the
 * contract via RPC simulation. Indexer-free (D13): the standalone airdrop tool
 * treats the token contract as the source of truth, unlike the indexer-backed
 * `readTokenContract`. `source` must be an existing account (the connected
 * wallet) — `simulateRead` anchors the simulation on a real source account.
 */
export async function readTokenMetaRpc(
    source: StellarAddress,
    token: StellarContractId,
): Promise<{ name: string; symbol: string; decimals: number }> {
    const [nameVal, symbolVal, decimalsVal] = await Promise.all([
        simulateRead(source, token, 'name', []),
        simulateRead(source, token, 'symbol', []),
        simulateRead(source, token, 'decimals', []),
    ]);
    return {
        name: String(scValToNative(nameVal)),
        symbol: String(scValToNative(symbolVal)),
        decimals: Number(scValToNative(decimalsVal)),
    };
}

/**
 * Read a token balance straight from the contract via RPC simulation
 * (indexer-free; cf. the indexer-backed `getTokenBalance`). `source` must be an
 * existing account (the connected wallet) to anchor the simulation.
 */
export async function getTokenBalanceRpc(
    source: StellarAddress,
    token: StellarContractId,
    owner: StellarAddress,
): Promise<bigint> {
    const retval = await simulateRead(source, token, 'balance', [scAddress(owner)]);
    return BigInt(scValToNative(retval) as bigint | number | string);
}

/**
 * Latest ledger sequence via RPC (indexer-free; cf. the indexer-backed
 * `getLatestLedgerSequence`). Used to compute a token-allowance expiration
 * ledger in the airdrop deploy flow.
 */
export async function getLatestLedgerRpc(): Promise<number> {
    const latest = await server().getLatestLedger();
    return latest.sequence;
}

export async function getLatestLedgerSequence(): Promise<number> {
    const indexed = await fetchIndexerJson<IndexerLatestLedger>(
        indexerNetworkPath('/ledger/latest'),
    );
    return indexed.sequence;
}

export async function getDeploymentCount(
    _factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<number> {
    const indexed = await fetchIndexerJson<IndexerVestings>(indexerNetworkPath('/vestings'));
    return indexed.total;
}

export async function getDeployment(
    index: number,
    _factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<StellarContractId> {
    const indexed = await fetchIndexerJson<IndexerVestings>(indexerNetworkPath('/vestings'));
    const deployment = indexed.vestings[index];
    if (!deployment) throw new Error(`No deployment at index ${index}`);
    return deployment.address;
}

export async function getOwnerDeploymentCount(
    owner: StellarAddress,
    _factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<number> {
    const indexed = await fetchIndexerJson<IndexerOwnerVestings>(
        indexerNetworkPath(`/owners/${encodeURIComponent(owner)}/vestings`),
    );
    return indexed.total;
}

export async function getOwnerDeployment(
    owner: StellarAddress,
    index: number,
    _factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<StellarContractId> {
    const indexed = await fetchIndexerJson<IndexerOwnerVestings>(
        indexerNetworkPath(`/owners/${encodeURIComponent(owner)}/vestings`),
        { maxContracts: index + 1 },
    );
    const deployment = indexed.contracts[index];
    if (!deployment) throw new Error(`No owner deployment at index ${index}`);
    return deployment.address;
}

export async function getCidForVesting(
    vestingAddress: StellarContractId,
    _factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<string | null> {
    const indexed = await fetchIndexerJson<IndexerVestingContract>(
        indexerNetworkPath(`/vestings/${encodeURIComponent(vestingAddress)}`),
    );
    return indexed.metadataCid ?? null;
}

function requireFactoryAddress(): StellarContractId {
    const factoryAddress = cfg().factoryAddress;
    if (!factoryAddress) throw new Error('Missing Stellar factory contract address');
    return factoryAddress;
}

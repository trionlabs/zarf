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
    /** Contract's current token balance (base units) when the indexer provides it. */
    tokenBalance?: bigint;
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
    tokenBalance?: string;
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

export async function readVestingContract(
    address: StellarContractId,
): Promise<VestingContractMetadata> {
    const indexed = await fetchIndexerJson<IndexerVestingContract>(
        indexerNetworkPath(`/vestings/${encodeURIComponent(address)}`),
    );

    validateTokenDecimals(indexed.tokenDecimals);

    let tokenBalance: bigint | undefined;
    if (typeof indexed.tokenBalance === 'string' && /^\d+$/.test(indexed.tokenBalance)) {
        tokenBalance = BigInt(indexed.tokenBalance);
    }

    return {
        name: indexed.name,
        description: indexed.description,
        owner: indexed.owner,
        token: indexed.token,
        merkleRoot: indexed.merkleRoot,
        tokenSymbol: indexed.tokenSymbol,
        tokenDecimals: indexed.tokenDecimals,
        tokenBalance,
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

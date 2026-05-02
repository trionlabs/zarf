/**
 * Stellar/Soroban contract interaction utilities.
 */

import {
    Account,
    Address as StellarSdkAddress,
    BASE_FEE,
    Contract,
    ScInt,
    StrKey,
    TransactionBuilder,
    nativeToScVal,
    rpc,
    scValToNative,
    xdr,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { getStellarConfig } from '../config/runtime';
import type { StellarRuntimeConfig } from '../config/runtime';
import type {
    StellarAddress,
    StellarContractId,
    TransactionHash,
    TransactionResult,
} from '../types';
import { signTransaction } from './wallet';

const SIMULATION_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
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

function fakeAccount(): Account {
    return new Account(SIMULATION_SOURCE, '0');
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

function bytesToHex(bytes: Buffer | Uint8Array): `0x${string}` {
    return `0x${Buffer.from(bytes).toString('hex')}`;
}

function fieldToBytes(value: string | bigint): Buffer {
    const hex = typeof value === 'bigint'
        ? value.toString(16)
        : normalizeHex(value);
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

async function simulate(
    contractId: StellarContractId,
    method: string,
    args: xdr.ScVal[] = [],
): Promise<xdr.ScVal> {
    const tx = new TransactionBuilder(fakeAccount(), {
        fee: BASE_FEE,
        networkPassphrase: cfg().networkPassphrase,
    })
        .setTimeout(30)
        .addOperation(new Contract(contractId).call(method, ...args))
        .build();

    const result = await server().simulateTransaction(tx);
    if (rpc.Api.isSimulationError(result)) {
        throw new Error(result.error);
    }
    if (!result.result) {
        throw new Error(`No simulation result for ${method}`);
    }
    return result.result.retval;
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

function scValToBigInt(value: xdr.ScVal): bigint {
    const native = scValToNative(value);
    return BigInt(native.toString());
}

export async function readVestingContract(
    address: StellarContractId,
): Promise<VestingContractMetadata> {
    const [name, description, owner, token, merkleRoot] = await Promise.all([
        simulate(address, 'name'),
        simulate(address, 'description'),
        simulate(address, 'owner'),
        simulate(address, 'token'),
        simulate(address, 'merkle_root'),
    ]);

    const tokenAddress = StellarSdkAddress.fromScVal(token).toString();
    let tokenSymbol = 'XLM';
    let tokenDecimals = 7;
    try {
        const [symbol, decimals] = await Promise.all([
            simulate(tokenAddress, 'symbol'),
            simulate(tokenAddress, 'decimals'),
        ]);
        tokenSymbol = String(scValToNative(symbol));
        tokenDecimals = Number(scValToNative(decimals));
    } catch {
        // SAC metadata is nice-to-have for display; the vesting metadata remains valid.
    }

    return {
        name: String(scValToNative(name)),
        description: String(scValToNative(description)),
        owner: StellarSdkAddress.fromScVal(owner).toString(),
        token: tokenAddress,
        merkleRoot: bytesToHex(scValToNative(merkleRoot)),
        tokenSymbol,
        tokenDecimals,
    };
}

export async function readTokenContract(
    tokenAddress: StellarContractId,
): Promise<TokenContractMetadata> {
    const [name, symbol, decimals] = await Promise.all([
        simulate(tokenAddress, 'name').catch(() => null),
        simulate(tokenAddress, 'symbol').catch(() => null),
        simulate(tokenAddress, 'decimals').catch(() => null),
    ]);

    return {
        name: name ? String(scValToNative(name)) : null,
        symbol: symbol ? String(scValToNative(symbol)) : null,
        decimals: decimals ? Number(scValToNative(decimals)) : null,
        totalSupply: null,
        logoUrl: null,
    };
}

export async function getTokenBalance(
    tokenAddress: StellarContractId,
    owner: StellarAddress,
): Promise<bigint> {
    return scValToBigInt(await simulate(tokenAddress, 'balance', [scAddress(owner)]));
}

export async function getTokenAllowance(
    tokenAddress: StellarContractId,
    owner: StellarAddress,
    spender: StellarContractId,
): Promise<bigint> {
    return scValToBigInt(await simulate(tokenAddress, 'allowance', [
        scAddress(owner),
        scAddress(spender),
    ]));
}

export async function recipientId(
    contractAddress: StellarContractId,
    recipient: StellarAddress,
): Promise<`0x${string}`> {
    const result = await simulate(contractAddress, 'recipient_id', [scAddress(recipient)]);
    return bytesToHex(scValToNative(result));
}

export async function isEpochClaimed(
    epochCommitment: string,
    contractAddress?: StellarContractId,
): Promise<boolean> {
    const target = contractAddress || cfg().vestingAddress;
    if (!target) throw new Error('Missing Stellar vesting contract address');
    const result = await simulate(target, 'is_claimed', [scBytesN32(epochCommitment)]);
    return Boolean(scValToNative(result));
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

export async function approveTokenAllowance(params: {
    tokenAddress: StellarContractId;
    owner: StellarAddress;
    spender: StellarContractId;
    amount: bigint;
    expirationLedger: number;
}, onSubmitted?: (hash: TransactionHash) => void): Promise<TransactionHash> {
    const { hash } = await invoke(params.owner, params.tokenAddress, 'approve', [
        scAddress(params.owner),
        scAddress(params.spender),
        scI128(params.amount),
        scU32(params.expirationLedger),
    ], onSubmitted);
    return hash;
}

export async function createAndFundVesting(params: {
    factoryAddress: StellarContractId;
    owner: StellarAddress;
    tokenAddress: StellarContractId;
    salt: `0x${string}`;
    name: string;
    description: string;
    merkleRoot: `0x${string}`;
    recipientCount: number;
    totalAmount: bigint;
    metadataCid: string;
}, onSubmitted?: (hash: TransactionHash) => void): Promise<{ hash: TransactionHash; vestingAddress: StellarContractId }> {
    const predicted = await predictVestingAddress(params.factoryAddress, params.salt);
    const { hash } = await invoke(params.owner, params.factoryAddress, 'create_and_fund_vesting', [
        scAddress(params.owner),
        scAddress(params.tokenAddress),
        scBytesN32(params.salt),
        scString(params.name),
        scString(params.description),
        scBytesN32(params.merkleRoot),
        scU32(params.recipientCount),
        scI128(params.totalAmount),
        scString(params.metadataCid),
    ], onSubmitted);
    return { hash, vestingAddress: predicted };
}

export async function predictVestingAddress(
    factoryAddress: StellarContractId,
    salt: `0x${string}`,
): Promise<StellarContractId> {
    const result = await simulate(factoryAddress, 'predict_vesting_address', [scBytesN32(salt)]);
    return StellarSdkAddress.fromScVal(result).toString();
}

export async function getLatestLedgerSequence(): Promise<number> {
    const latest = await server().getLatestLedger();
    return latest.sequence;
}

export async function getDeploymentCount(
    factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<number> {
    const result = await simulate(factoryAddress, 'get_deployment_count');
    return Number(scValToNative(result));
}

export async function getDeployment(
    index: number,
    factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<StellarContractId> {
    const result = await simulate(factoryAddress, 'get_deployment', [scU32(index)]);
    return StellarSdkAddress.fromScVal(result).toString();
}

export async function getOwnerDeploymentCount(
    owner: StellarAddress,
    factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<number> {
    const result = await simulate(factoryAddress, 'get_owner_deployment_count', [scAddress(owner)]);
    return Number(scValToNative(result));
}

export async function getOwnerDeployment(
    owner: StellarAddress,
    index: number,
    factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<StellarContractId> {
    const result = await simulate(factoryAddress, 'get_owner_deployment', [
        scAddress(owner),
        scU32(index),
    ]);
    return StellarSdkAddress.fromScVal(result).toString();
}

export async function getCidForVesting(
    vestingAddress: StellarContractId,
    factoryAddress: StellarContractId = requireFactoryAddress(),
): Promise<string | null> {
    try {
        const result = await simulate(factoryAddress, 'vesting_metadata_cid', [
            scAddress(vestingAddress),
        ]);
        const cid = String(scValToNative(result));
        return cid.length > 0 ? cid : null;
    } catch {
        return null;
    }
}

function requireFactoryAddress(): StellarContractId {
    const factoryAddress = cfg().factoryAddress;
    if (!factoryAddress) throw new Error('Missing Stellar factory contract address');
    return factoryAddress;
}

export function getExplorerUrl(hash: TransactionHash): string {
    const base = cfg().explorerBaseUrl;
    if (!base) throw new Error('Missing Stellar explorer URL');
    return `${base.replace(/\/$/, '')}/tx/${hash}`;
}

export function getAccountExplorerUrl(address: StellarAddress): string {
    const base = cfg().explorerBaseUrl;
    if (!base) throw new Error('Missing Stellar explorer URL');
    return `${base.replace(/\/$/, '')}/account/${address}`;
}

export function getContractExplorerUrl(address: StellarContractId): string {
    const base = cfg().explorerBaseUrl;
    if (!base) throw new Error('Missing Stellar explorer URL');
    return `${base.replace(/\/$/, '')}/contract/${address}`;
}

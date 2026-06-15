/**
 * Airdrop campaign deploy service.
 *
 * Two phases, matching the step-2 micro-stepper:
 *   1. `prepareCampaign` — fix a salt, predict the instance address, build the
 *      Merkle claim-list (`leafBinding:'none'`), and pin it to IPFS → CID.
 *      (Address-into-list ordering is load-bearing: the predicted address is
 *      embedded in the published list *before* deploy.)
 *   2. `deployCampaign` — approve the factory for `total`, then `create_airdrop`
 *      (atomic deploy + fund). Added in T7.
 *
 * @module services/airdropDeploy
 */
import { buildClaimList } from '@zarf/core/merkle';
import type { Row } from '@zarf/core/merkle';
import { predictAirdropAddress } from '@zarf/core/contracts';
import { parseTokenAmount } from '@zarf/core/utils/amount';
import type { StellarAddress, StellarContractId } from '@zarf/core/types';
import { normalizeAirdropAddress } from '$lib/csv/airdropCsv';
import { pinAirdropClaimList } from './pinService';
import type { RecipientRow } from '$lib/stores/types';

/** A fresh 32-byte salt as `0x`-hex. Fixing it makes predict/pin/deploy stable. */
export function generateSalt(): `0x${string}` {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return `0x${Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;
}

/**
 * Convert UI recipient rows to canonical Merkle rows: UPPERCASE address (the
 * load-bearing strkey normalization) + amount in i128 base units (decimal
 * string, no IEEE-754 loss). Throws if an amount has more decimal places than
 * the token allows (surfaced to the user before any tx).
 */
export function buildMerkleRows(recipients: RecipientRow[], decimals: number): Row[] {
    return recipients.map((r) => ({
        address: normalizeAirdropAddress(r.address),
        amount: parseTokenAmount(String(r.amount), decimals).toString(),
    }));
}

/** Σ of base-unit amounts as an i128 decimal string. */
export function sumBaseUnits(rows: Row[]): string {
    return rows.reduce((sum, r) => sum + BigInt(r.amount), 0n).toString();
}

export interface PrepareInput {
    factoryAddress: StellarContractId;
    owner: StellarAddress;
    token: StellarContractId;
    network: 'testnet' | 'mainnet';
    /** Fixed by the caller (stored in the deploy WAL) so retries are stable. */
    salt: `0x${string}`;
    recipients: RecipientRow[];
    decimals: number;
}

export interface PrepareResult {
    /** Deterministic instance address (== the eventual deployed address). */
    predictedAddress: StellarContractId;
    merkleRoot: `0x${string}`;
    /** IPFS CID of the pinned claim-list (becomes `metadata_cid`). */
    metadataCid: string;
    /** Total to fund, in token base units (i128 decimal string). */
    total: string;
}

/**
 * Phase 1: predict the address, build + pin the claim-list. The pinned doc
 * embeds the predicted address; because `leafBinding:'none'`, the root is
 * independent of that address, so a retry with the same salt re-pins to the
 * same CID.
 */
export async function prepareCampaign(input: PrepareInput): Promise<PrepareResult> {
    const rows = buildMerkleRows(input.recipients, input.decimals);
    const total = sumBaseUnits(rows);

    const predictedAddress = await predictAirdropAddress(
        input.factoryAddress,
        input.owner,
        input.salt,
    );

    const doc = buildClaimList(
        {
            network: input.network,
            airdrop: predictedAddress,
            token: input.token,
            leafBinding: 'none',
        },
        rows,
    );

    const { cid } = await pinAirdropClaimList(doc, { owner: input.owner });

    return {
        predictedAddress,
        merkleRoot: doc.root as `0x${string}`,
        metadataCid: cid,
        total,
    };
}

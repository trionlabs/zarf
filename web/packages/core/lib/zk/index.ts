import type { ZKClaimData, ZKProof } from '../types';
import type { ClaimData } from './proofInputs';

// Re-export types for worker consumers
export type { ProofRequest } from './proof.worker';

/**
 * Proof generation request payload sent to worker
 */
export interface ProofRequestPayload {
    jwt: string;
    publicKey: any;
    claimData: ZKClaimData;
}

export type ProgressCallback = (message: string) => void;

// Single instance of the worker
let worker: Worker | null = null;
let pendingResolver: ((value: ZKProof) => void) | null = null;
let pendingRejecter: ((reason: any) => void) | null = null;
let pendingProgress: ProgressCallback | null = null;

/*
 * Initialize the ZK Proof Worker
 * Use import.meta.url to resolve worker path relative to this file.
 */
function initWorker() {
    if (worker) return worker;
    if (typeof window === 'undefined') return null; // SSR safety

    try {
        // Vite worker import
        worker = new Worker(new URL('./proof.worker.ts', import.meta.url), {
            type: 'module',
        });

        worker.onmessage = (e) => {
            const { type, data, message } = e.data;

            if (type === 'RESULT') {
                if (pendingResolver) {
                    pendingResolver(data);
                    pendingResolver = null;
                    pendingRejecter = null;
                    pendingProgress = null;
                }
            } else if (type === 'ERROR') {
                if (pendingRejecter) {
                    pendingRejecter(new Error(message));
                    pendingResolver = null;
                    pendingRejecter = null;
                    pendingProgress = null;
                }
                console.error('[ZK Prover Error]', message);
                terminateWorker();
            } else if (type === 'PROGRESS') {
                if (pendingProgress) {
                    try {
                        pendingProgress(message);
                    } catch (e) {
                        console.error('[ZK Prover] onProgress threw:', e);
                    }
                } else {
                    console.log('[ZK Prover]', message);
                }
            }
        };

        worker.onerror = (e) => {
            console.error('[ZK Prover Worker Error]', e);
            if (pendingRejecter) {
                pendingRejecter(e);
                pendingResolver = null;
                pendingRejecter = null;
                pendingProgress = null;
            }
            terminateWorker();
        };
    } catch (e) {
        console.error('Failed to initialize ZK Worker:', e);
        return null;
    }

    return worker;
}

function terminateWorker() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

function decodeJwtPayload(jwt: string): { aud?: unknown; exp?: unknown } {
    const parts = jwt.split('.');
    if (parts.length !== 3) throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`);
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { aud?: unknown; exp?: unknown };
}

/** Convert a domain ZKClaimData (bigints) into the wire shape the worker expects (hex strings). */
function toWireClaimData(c: ZKClaimData, jwt: string): ClaimData {
    const payload = decodeJwtPayload(jwt);
    if (typeof payload.aud !== 'string' || payload.aud.length === 0) {
        throw new Error('JWT audience claim is missing');
    }
    return {
        email: c.email,
        salt: c.salt,
        amount: '0x' + c.amount.toString(16),
        merkleProof: {
            siblings: c.merkleProof.siblings,
            indices: c.merkleProof.indices.map((i) => i.toString()),
        },
        merkleRoot: '0x' + c.merkleRoot.toString(16),
        recipient: c.recipient,
        unlockTime: '0x' + c.unlockTime.toString(16),
        audience: payload.aud,
    };
}

/**
 * Generate a ZK Proof for claiming tokens.
 * This runs in a dedicated Web Worker to avoid blocking the main thread.
 *
 * @param jwt Google OAuth JWT token
 * @param publicKey Google Public Key (JWK)
 * @param claimData Claim data including merkle proof
 * @param onProgress Optional callback fired for each progress message from the worker
 * @returns Generated ZK Proof
 */
export async function generateClaimProof(
    jwt: string,
    publicKey: any,
    claimData: ZKClaimData,
    onProgress?: ProgressCallback,
): Promise<ZKProof> {
    const w = initWorker();
    if (!w) throw new Error('ZK Prover not supported in this environment');

    if (pendingResolver) {
        throw new Error('A proof generation is already in progress');
    }

    return new Promise((resolve, reject) => {
        pendingResolver = resolve;
        pendingRejecter = reject;
        pendingProgress = onProgress ?? null;

        w.postMessage({
            type: 'GENERATE_PROOF',
            payload: {
                jwt,
                publicKey,
                claimData: toWireClaimData(claimData, jwt),
            },
        });
    });
}


import type { ZKClaimData, ZKProof } from '../types';

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

// Single instance of the worker
let worker: Worker | null = null;
let pendingResolver: ((value: ZKProof) => void) | null = null;
let pendingRejecter: ((reason: any) => void) | null = null;

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
                }
            } else if (type === 'ERROR') {
                if (pendingRejecter) {
                    pendingRejecter(new Error(message));
                    pendingResolver = null;
                    pendingRejecter = null;
                }
                console.error('[ZK Prover Error]', message);
                terminateWorker();
            } else if (type === 'PROGRESS') {
                console.log('[ZK Prover]', message);
            }
        };

        worker.onerror = (e) => {
            console.error('[ZK Prover Worker Error]', e);
            if (pendingRejecter) {
                pendingRejecter(e);
                pendingResolver = null;
                pendingRejecter = null;
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

/**
 * Generate a ZK Proof for claiming tokens.
 * This runs in a dedicated Web Worker to avoid blocking the main thread.
 *
 * @param jwt Google OAuth JWT token
 * @param publicKey Google Public Key (JWK)
 * @param claimData Claim data including merkle proof
 * @returns Generated ZK Proof
 */
export async function generateClaimProof(
    jwt: string,
    publicKey: any,
    claimData: ZKClaimData
): Promise<ZKProof> {
    const w = initWorker();
    if (!w) throw new Error('ZK Prover not supported in this environment');

    if (pendingResolver) {
        throw new Error('A proof generation is already in progress');
    }

    return new Promise((resolve, reject) => {
        pendingResolver = resolve;
        pendingRejecter = reject;

        w.postMessage({
            type: 'GENERATE_PROOF',
            payload: {
                jwt,
                publicKey,
                claimData,
            },
        });
    });
}

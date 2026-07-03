// SEP-53 wallet-signature verification for the "link wallet" quest.
//
// This is the early-app mirror of pin-proxy's SEP-53 auth (see
// web/apps/pin-proxy/src/index.ts:321-370): same message-hash scheme, same
// signature-decode shape. The only intentional divergences:
//   - The message body/version differs (zarf-early-wallet-v1, not zarf-pin-v1)
//     so a signature is structurally non-replayable across the two services.
//   - Verification is ZERO-DEP native WebCrypto Ed25519 (crypto.subtle) instead
//     of @stellar/stellar-sdk's Keypair.verify. WebCrypto Ed25519 is confirmed
//     working under workerd (probed with `wrangler dev`: importKey('raw',…,
//     {name:'Ed25519'}) + verify('Ed25519',…) → accept:true / tampered:false).
//     Keeping the SDK out of `early` preserves the app's zero-dependency ethos.
//
// SEP-53 = the SIGNATURE SCHEME: sign SHA-256('Stellar Signed Message:\n' + msg)
// with the account's ed25519 key. SEP-43 = the wallet RPC surface (signMessage).
// Freighter v6 implements both; the create→pin-proxy pair proves it in prod.

import { decodeEd25519PublicKey } from './strkey';

// The SEP-53 domain-separation prefix, prepended to the message before hashing.
export const SEP53_PREFIX = 'Stellar Signed Message:\n';

// ⚠️ DOUBLE-PREFIX WARNING (the classic SEP-53 bug):
// Freighter applies SEP53_PREFIX *internally* when it signs — the client is
// handed and signs the RAW message (the exact string buildWalletLinkMessage
// returns, no prefix). The prefix is added ONLY here on the server, once, inside
// sep53MessageHash. Never send the prefixed string to the client, and never
// prefix twice — a double prefix makes every real signature fail to verify while
// still "looking" correct. pin-proxy's test vector (index.test.ts:82-87) is the
// canonical single-prefix reference this file matches.

// Build the canonical link-wallet message. Newline-joined, field order is fixed
// and load-bearing (the client re-derives nothing — the server rebuilds this
// exact string from the KV challenge record at verify time). `account:<xUserId>`
// is the anti-phishing binding: verify requires session.user.id === the account
// in the message, so a stolen signature can't be bound to another X account. The
// `zarf-early-wallet-v1` version line structurally blocks cross-service replay
// (it can never equal pin-proxy's `zarf-pin-v1`).
export function buildWalletLinkMessage(input: {
  xUserId: string;
  address: string;
  nonce: string;
  issuedAt: number;
}): string {
  return [
    'zarf-early-wallet-v1',
    'domain:early.zarf.to',
    'purpose:link-wallet',
    `account:${input.xUserId}`,
    `address:${input.address}`,
    `nonce:${input.nonce}`,
    `issuedAt:${input.issuedAt}`
  ].join('\n');
}

// SHA-256 of (prefix + message) via crypto.subtle — mirrors pin-proxy's
// sep53MessageHash exactly. Returns the 32-byte digest; this digest is the
// payload the ed25519 signature is verified against. The prefix is added HERE
// and ONLY here (see the double-prefix warning above).
export async function sep53MessageHash(message: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${SEP53_PREFIX}${message}`)
  );
  return new Uint8Array(digest);
}

// Decode a wallet signature into exactly 64 raw bytes, or null. Mirrors
// pin-proxy's decodeSignature shape: length-capped input (≤512), accepts either
// 128-hex (optional `0x`) or base64/base64url; anything else, or a decode that
// isn't exactly 64 bytes, is null. Freighter returns base64 — that's the live
// path; the hex branch is defence for other wallets / manual callers. Never
// throws (bad base64 is caught) and never logs the input.
export function decodeSignature(input: string): Uint8Array<ArrayBuffer> | null {
  if (typeof input !== 'string' || input.length > 512) return null;

  // 64-byte hex, with or without a 0x prefix.
  const hex = input.startsWith('0x') ? input.slice(2) : input;
  if (/^[0-9a-fA-F]{128}$/.test(hex)) {
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  // base64 / base64url. Normalise url-safe chars, reject any non-alphabet char,
  // pad to a multiple of 4, then atob. atob throws on malformed input → null.
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const bin = atob(padded);
    if (bin.length !== 64) return null;
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// Verify a SEP-53 wallet signature over the canonical link-wallet message.
//   1. Decode the G-address to its raw 32-byte ed25519 public key (or reject).
//   2. Decode the signature to exactly 64 bytes (or reject).
//   3. Hash SHA-256(prefix + message) — the single-prefix SEP-53 digest.
//   4. Native WebCrypto Ed25519 verify (importKey 'raw' + verify 'Ed25519').
// Returns false (never throws) on ANY failure — bad address, bad signature
// encoding, importKey/verify error, or a genuine signature mismatch. Never logs
// the address/signature/message.
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  const pubkey = decodeEd25519PublicKey(address);
  if (pubkey === null) return false;

  const sig = decodeSignature(signature);
  if (sig === null) return false;

  try {
    const hash = await sep53MessageHash(message);
    // Copy into a fresh, definitely-ArrayBuffer-backed view: decodeEd25519PublicKey
    // returns Uint8Array<ArrayBufferLike> (a subarray slice), which doesn't satisfy
    // importKey's BufferSource (ArrayBuffer-backed) contract.
    const rawKey = new Uint8Array(pubkey.length);
    rawKey.set(pubkey);
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, [
      'verify'
    ]);
    return await crypto.subtle.verify('Ed25519', key, sig, hash);
  } catch {
    // importKey/verify can throw on a malformed key or in a runtime without
    // Ed25519 — treat every throw as a verification failure, never a 500.
    return false;
  }
}

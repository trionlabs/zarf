// ─── Client-side wallet connect + SEP-53 sign (Wallet quest only) ───────────
//
// The `early` app does NOT run configureCore (it has no coreInit — see
// apps/create/src/lib/coreInit.ts for the full-app pattern). @zarf/core's
// signMessage reads the network passphrase from the runtime config, so we
// configure core EXACTLY ONCE, lazily, using the CONNECTED wallet's own
// passphrase. The server verify is network-independent (it re-hashes the raw
// message under the SEP-53 prefix and checks the ed25519 signature), so whatever
// network the wallet is on is fine — we just echo it back to Freighter.
//
// SSR-safety: @zarf/core/contracts/wallet dynamic-imports Freighter internally,
// and this module is only ever imported from inside a browser event handler
// (dynamic `import('$lib/wallet')`), so nothing wallet-related executes during
// SSR.

// Safe default passphrase used ONLY to satisfy connectWallet's display-name
// fallback in the pathological case where Freighter returns no network name.
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

let configured = false;

async function ensureCoreConfigured(networkPassphrase: string | undefined): Promise<void> {
  if (configured) return;
  const { configureCore } = await import('@zarf/core/config/runtime');
  try {
    configureCore({ stellar: { networkPassphrase } });
  } catch {
    // configureCore throws if called twice — treat an already-configured core
    // as success (another code path may have seeded it first).
  }
  configured = true;
}

// Freighter is a desktop browser extension. `true` when it is NOT present, so
// the Wallet quest can show the install link + steer mobile users to paste.
export function isFreighterMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /install Freighter|No Stellar wallet|not detected/i.test(msg);
}

// `true` when the user dismissed / rejected the Freighter approval prompt.
export function isUserRejectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { code?: number } | null)?.code;
  return code === -4 || /declin|denied|reject|cancel|user/i.test(msg);
}

// Connect Freighter and return the active Stellar address. Configures core once
// with the connection's own network passphrase so a later signMessage echoes it
// back to Freighter.
export async function connectWalletAddress(): Promise<string> {
  const { connectWallet } = await import('@zarf/core/contracts/wallet');

  let conn;
  try {
    conn = await connectWallet();
  } catch (e) {
    // Only the display-name fallback in connectWallet reaches getStellarConfig;
    // it fires solely when Freighter returns no network name. Seed a default so
    // the retry resolves, then let real errors (missing / rejected) propagate.
    if (String(e instanceof Error ? e.message : e).includes('configureCore')) {
      await ensureCoreConfigured(TESTNET_PASSPHRASE);
      conn = await connectWallet();
    } else {
      throw e;
    }
  }

  await ensureCoreConfigured(conn.networkPassphrase);
  return conn.address;
}

// Sign `message` RAW with Freighter (it applies the SEP-53 prefix internally —
// do NOT prepend anything). Returns the base64 signature for wallet-verify.
export async function signWalletMessage(message: string, address: string): Promise<string> {
  const { signMessage } = await import('@zarf/core/contracts/wallet');
  return signMessage(message, address);
}

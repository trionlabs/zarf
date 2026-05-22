/**
 * Google JWK (JSON Web Key) Utilities
 * Fetches and caches Google's public keys for JWT verification
 */

// Google's JWK endpoint
const GOOGLE_JWK_URL = 'https://www.googleapis.com/oauth2/v3/certs';

interface GoogleJwk {
    kty: string;
    use: string;
    kid: string;
    n: string;
    e: string;
    alg: string;
}

interface GoogleJwkSet {
    keys: GoogleJwk[];
}

// Cache for JWKs
let cachedJwks: GoogleJwkSet | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Fetch Google's public JWKs
 */
export async function fetchGoogleJwks(): Promise<GoogleJwkSet> {
    const now = Date.now();

    // Return cached if still valid
    if (cachedJwks && (now - cacheTimestamp) < CACHE_DURATION) {
        console.log('[GoogleJWK] Using cached keys');
        return cachedJwks;
    }

    console.log('[GoogleJWK] Fetching fresh keys from Google...');

    try {
        const response = await fetch(GOOGLE_JWK_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch Google JWKs: ${response.status}`);
        }

        cachedJwks = await response.json();
        cacheTimestamp = now;

        console.log(`[GoogleJWK] Loaded ${cachedJwks?.keys.length} keys`);
        return cachedJwks!;
    } catch (error) {
        console.error('[GoogleJWK] Fetch error:', error);
        throw error;
    }
}

/**
 * Get the correct public key for a specific JWT
 * Matches the `kid` in the JWT header to the correct JWK
 */
export async function getPublicKeyForJwt(jwt: string): Promise<GoogleJwk> {
    // Decode JWT header to get `kid`
    const [headerB64] = jwt.split('.');
    const headerJson = atob(headerB64.replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson);

    const kid = header.kid;
    if (!kid) {
        throw new Error('JWT header missing "kid" (key ID)');
    }

    console.log(`[GoogleJWK] Looking for key with kid: ${kid}`);

    const jwks = await fetchGoogleJwks();
    const key = jwks.keys.find(k => k.kid === kid);

    if (!key) {
        throw new Error(`No matching Google public key found for kid: ${kid}`);
    }

    console.log(`[GoogleJWK] Found matching key`);
    return key;
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Initiates Google OAuth login
 * @param {string} clientId - Google OAuth Client ID
 * @param {string} redirectUri - Redirect URI (must match Google Console config)
 * @param {string} nonce - Optional nonce for replay protection
 */
export function initiateGoogleLogin(clientId, redirectUri, nonce = null) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: nonce || crypto.randomUUID(),
  });

  window.location.href = `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Extracts the id_token from the URL fragment after OAuth redirect
 * @returns {string|null} The JWT id_token or null if not found
 */
export function extractTokenFromUrl() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('id_token');
}

/**
 * Decodes a JWT without verification (verification is done in the zk-circuit)
 * @param {string} jwt - The JWT string
 * @returns {{ header: object, payload: object, signature: string }}
 */
export function decodeJwt(jwt) {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

  return { header, payload, signature: parts[2] };
}

/**
 * Fetches Google's public JWKs
 * @returns {Promise<object[]>} Array of JWK objects
 */
export async function fetchGooglePublicKeys() {
  const response = await fetch(GOOGLE_CERTS_URL);
  const data = await response.json();
  return data.keys;
}

/**
 * Finds the correct public key for a JWT based on its kid
 * @param {object[]} keys - Array of JWKs
 * @param {string} kid - Key ID from JWT header
 * @returns {object|null} The matching JWK or null
 */
export function findKeyById(keys, kid) {
  return keys.find((key) => key.kid === kid) || null;
}

/**
 * Clears the URL fragment (removes token from URL for security)
 */
export function clearUrlFragment() {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

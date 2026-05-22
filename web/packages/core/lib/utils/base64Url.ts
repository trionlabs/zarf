/**
 * Convert a base64url-encoded string to padded standard base64.
 *
 * `atob` is strict per the spec: input length must be a multiple of 4.
 * Base64url segments (JWT header/payload, JWK fields) routinely arrive
 * unpadded. Safari and some Firefox builds throw `InvalidCharacterError`
 * on unpadded input; modern Chromium tolerates it but the behavior is
 * implementation-dependent.
 *
 * Use this helper anywhere base64url bytes are about to feed `atob`.
 */
export function base64UrlToBase64(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    return base64 + '='.repeat(padding);
}

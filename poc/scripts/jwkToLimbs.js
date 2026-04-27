#!/usr/bin/env node
/**
 * Convert Google OAuth JWK public keys to limbs format for on-chain registration.
 *
 * This script:
 * 1. Fetches Google's current OAuth public keys
 * 2. Converts each RSA modulus to 18 limbs of 120 bits
 * 3. Outputs Solidity-compatible bytes32[] arrays for JWKRegistry.registerKey()
 *
 * Usage:
 *   node jwkToLimbs.js                    # Fetch from Google
 *   node jwkToLimbs.js <kid>              # Only specific key ID
 *   node jwkToLimbs.js --test             # Use test key from fixture
 */

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Convert base64url to bytes
 */
function base64UrlToBytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Convert bytes to BigInt
 */
function bytesToBigInt(bytes) {
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return BigInt(hex);
}

/**
 * Split BigInt into limbs of specified bit size
 * Returns little-endian (least significant first)
 */
function splitBigIntToLimbs(value, bitsPerLimb, numLimbs) {
  const limbs = [];
  const mask = (1n << BigInt(bitsPerLimb)) - 1n;

  for (let i = 0; i < numLimbs; i++) {
    limbs.push(value & mask);
    value >>= BigInt(bitsPerLimb);
  }

  return limbs;
}

/**
 * Convert JWK modulus to 18 limbs of 120 bits each
 */
function jwkModulusToLimbs(modulusBase64Url) {
  const modulusBytes = base64UrlToBytes(modulusBase64Url);
  const modulusBigInt = bytesToBigInt(modulusBytes);
  return splitBigIntToLimbs(modulusBigInt, 120, 18);
}

/**
 * Format limbs as Solidity bytes32 array
 */
function formatAsSolidityArray(limbs, indent = '    ') {
  const lines = limbs.map((limb, i) => {
    const hex = limb.toString(16).padStart(64, '0');
    return `${indent}bytes32(0x${hex})${i < limbs.length - 1 ? ',' : ''}`;
  });
  return lines.join('\n');
}

/**
 * Format limbs as JavaScript hex array
 */
function formatAsJsArray(limbs) {
  return limbs.map((limb) => '0x' + limb.toString(16).padStart(64, '0'));
}

/**
 * Fetch Google's public keys
 */
async function fetchGoogleKeys() {
  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google keys: ${response.status}`);
  }
  const data = await response.json();
  return data.keys;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const specificKid = args.find((a) => !a.startsWith('--'));
  const useTest = args.includes('--test');

  console.log('=== JWK to Limbs Converter ===\n');

  let keys;

  if (useTest) {
    // Use a mock key for testing
    console.log('Using test key...\n');
    keys = [
      {
        kid: 'test-key',
        n: 'xyOw_test_modulus_base64url_encoded_value',
      },
    ];
  } else {
    console.log(`Fetching keys from: ${GOOGLE_CERTS_URL}\n`);
    keys = await fetchGoogleKeys();
  }

  console.log(`Found ${keys.length} key(s)\n`);

  for (const key of keys) {
    if (specificKid && key.kid !== specificKid) {
      continue;
    }

    console.log(`=== Key ID: ${key.kid} ===`);
    console.log(`Algorithm: ${key.alg}`);
    console.log(`Key Type: ${key.kty}`);
    console.log(`Use: ${key.use}\n`);

    if (key.kty !== 'RSA') {
      console.log('Skipping non-RSA key\n');
      continue;
    }

    const limbs = jwkModulusToLimbs(key.n);

    console.log('Limbs (18 x 120-bit, little-endian):');
    limbs.forEach((limb, i) => {
      console.log(`  [${i.toString().padStart(2)}] 0x${limb.toString(16)}`);
    });

    console.log('\n--- Solidity Format ---');
    console.log('bytes32[18] memory pubkeyLimbs = [');
    console.log(formatAsSolidityArray(limbs));
    console.log('];');

    console.log('\n--- JavaScript Format ---');
    console.log('const pubkeyLimbs = [');
    const jsArray = formatAsJsArray(limbs);
    jsArray.forEach((hex, i) => {
      console.log(`  "${hex}"${i < jsArray.length - 1 ? ',' : ''}`);
    });
    console.log('];');

    console.log('\n--- Registration Command ---');
    console.log(`jwkRegistry.registerKey("${key.kid}", pubkeyLimbs);`);

    console.log('\n--- Environment Variables (for Foundry script) ---');
    console.log(`JWK_KID="${key.kid}"`);
    limbs.forEach((limb, i) => {
      console.log(`JWK_LIMB_${i}=${limb.toString()}`);
    });
    console.log('');
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

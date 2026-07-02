// Zero-dependency Stellar StrKey validator (SEP-23 "Strkey" encoding).
// A canonical account id is a base32 (RFC 4648, no padding) encoding of
// [ version-byte (0x30 = 6<<3, ed25519 public key 'G') | 32-byte key |
// 2-byte CRC16-XModem checksum (little-endian) ]. We only accept G... keys;
// muxed (M...) and secret seeds (S...) are rejected at the shape gate so a
// mispasted secret never reaches the decoder — and the raw input is never
// logged on any path.

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// RFC 4648 base32 decode (no padding). Returns the decoded bytes, or null if
// any character is outside the alphabet. Callers gate the length/shape first.
function base32Decode(input: string): Uint8Array | null {
  const out: number[] = [];
  let value = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const idx = B32_ALPHABET.indexOf(input.charAt(i));
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
      value &= (1 << bits) - 1; // keep only the unemitted low bits, stays < 2^8
    }
  }
  return new Uint8Array(out);
}

// CRC16-XModem: polynomial 0x1021, initial value 0x0000, no reflection.
function crc16xmodem(data: Uint8Array, len: number): number {
  let crc = 0x0000;
  for (let i = 0; i < len; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Validate a canonical Stellar ed25519 public-key account id (G...).
 * Pure, dependency-free, never logs the input. Returns true only for a
 * well-formed 56-char G-address whose version byte is 0x30 and whose trailing
 * CRC16-XModem checksum matches the payload.
 */
export function isValidStellarAccount(input: string): boolean {
  // Cheap shape gate: rejects M.../S..., wrong length, non-base32 chars — and
  // never touches the decoder (or a log line) for anything malformed.
  if (!/^G[A-Z2-7]{55}$/.test(input)) return false;

  const decoded = base32Decode(input);
  // 56 base32 chars = 280 bits = exactly 35 bytes: 1 version + 32 key + 2 crc.
  if (decoded === null || decoded.length !== 35) return false;

  // Version byte for an ed25519 public key ('G') is 6 << 3 = 0x30.
  if (decoded[0] !== 0x30) return false;

  // Trailing checksum is little-endian over bytes[0..33).
  const expected = decoded[33] | (decoded[34] << 8);
  return crc16xmodem(decoded, 33) === expected;
}

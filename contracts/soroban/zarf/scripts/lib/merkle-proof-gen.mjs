#!/usr/bin/env node
/**
 * merkle-proof-gen.mjs — airdrop Merkle proof generator for the testnet e2e (M7 T5).
 *
 * Reuses the audited `@zarf/core/lib/merkle` port (plain keccak256, sorted-pair
 * nodes, ScVal(ScAddress) XDR leaves) so the emitted {root, leaf, proof[]} is
 * BYTE-IDENTICAL to the Rust `MerkleAirdrop` contract and to the committed
 * differential fixture (`airdrop/tests/fixtures/merkle-vectors.json`). It does
 * NOT re-implement any hashing/XDR — that is the whole point of the parity.
 *
 * ── How it loads @zarf/core (verified env: Node 22.13.0, pnpm 10, web's tsx) ──
 * `@zarf/core`'s bare specifier resolves ONLY when the importing module lives
 * inside the web workspace — Node ESM walks up from the *module file's* dir, not
 * cwd — so a static `import '@zarf/core/merkle'` from a script committed under
 * contracts/ FAILS with ERR_MODULE_NOT_FOUND even with cwd=web and NODE_PATH set
 * (NODE_PATH is CommonJS-only). To keep this script committed alongside the
 * contract AND reuse the exact audited source byte-for-byte, we DYNAMICALLY
 * import the merkle/util `.ts` modules by an absolute path computed from this
 * file's own location (override with $ZARF_WEB_DIR). That path points straight
 * at the same `@zarf/core` source the package `exports` map points to
 * (`./lib/merkle/index.ts`, raw .ts, no dist).
 *
 * It MUST be run through web's own `tsx` (esbuild loader) — plain `node` /
 * `--experimental-strip-types` can't load the package's extensionless internal
 * imports (`from './tree'`). tsx must also be invoked with cwd inside web so the
 * transitive `@noble/hashes` / `@stellar/stellar-sdk` deps resolve:
 *
 *   cd /Users/latte/dev/zarf/web && \
 *     /Users/latte/dev/zarf/web/node_modules/.bin/tsx \
 *     /Users/latte/dev/zarf/contracts/soroban/zarf/scripts/lib/merkle-proof-gen.mjs \
 *     --claims /abs/path/claims.json --index 80
 *
 * ── CLI contract ─────────────────────────────────────────────────────────────
 * Input — a claim list `[{ "address": "...", "amount": "..." }, ...]` (array
 * position IS the leaf index; amount is a DECIMAL STRING). Supplied as one of:
 *   --claims <path>        read the JSON array from a file
 *   (no flag)              read the JSON array from stdin (default)
 * The array may also be wrapped as `{ "claims": [...] }` (a built claim-list
 * document); the `claims` field is unwrapped automatically.
 *
 * Mode — what to print:
 *   --index <n>            emit a proof bundle for leaf n (default: 0)
 *   --root-only            emit just { root, rootBare } (seeds wallet-mode create_campaign)
 *   --all                  emit { root, rootBare, leaves:[{index,leaf,proof}] }
 *   --gen-list             ignore input; print a deterministic `[{address,amount},
 *                          …]` claim list (self-contained — NEEDS NO @zarf/core),
 *                          with these knobs:
 *                            --count <N>           rows (default 81)
 *                            --amount <i128>       per-row amount (default 1)
 *                            --seed <s>            filler seed (default
 *                                                  "zarf-airdrop-e2e")
 *                            --claimant <G…>       a REAL claimant address to slot
 *                                                  in (so the e2e can actually sign
 *                                                  the claim: source == claimant)
 *                            --claimant-index <n>  where to slot it (default N-1;
 *                                                  for a ≥81 list that is ≥80)
 *                          Every other row is a deterministic filler `G…` strkey.
 *   --self-test            ignore input; verify byte-parity vs the committed
 *                          fixture (exit 0 on success, non-zero on first drift)
 *   --pretty               pretty-print the JSON output
 *
 * Output — a single JSON object on stdout (everything else goes to stderr):
 *   --root-only : { "root": "0x…", "rootBare": "…64hex…" }
 *   otherwise   : {
 *                   "root":     "0x…",            // 64-hex, 0x-prefixed lowercase
 *                   "index":    n,
 *                   "address":  "G…/C… (normalized, UPPERCASE)",
 *                   "amount":   "…",              // decimal string, echoed back
 *                   "leaf":     "0x…",
 *                   "proof":    ["0x…", "0x…"],   // leaf→root siblings, sorted-pair
 *                   "proofLen": k,
 *                   "rootBare":      "…64hex no 0x…",     // for --merkle_root
 *                   "proofBareJson": "[\"…\",\"…\"]"      // for --proof (bare hex)
 *                 }
 *
 * The `rootBare` / `proofBareJson` fields are pre-formatted for stellar-cli:
 *   - BytesN<32> args (`--merkle_root`, `--salt`) want bare 64-hex, NO 0x prefix.
 *   - Vec<BytesN<32>> (`--proof`) wants a JSON array of bare-hex strings, e.g.
 *     `--proof '["aabb…","ccdd…"]'`; an empty/single-leaf tree is `--proof '[]'`.
 *
 * @module scripts/lib/merkle-proof-gen
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Print to stderr so stdout carries ONLY the JSON result. */
function logErr(...args) {
  process.stderr.write(args.join(" ") + "\n");
}

function die(msg) {
  logErr(`merkle-proof-gen: ${msg}`);
  process.exit(1);
}

/**
 * Locate the `@zarf/core` source tree.
 *
 * Default: this file lives at contracts/soroban/zarf/scripts/lib/ — the repo
 * root is five levels up, and the core lib is web/packages/core/lib. Override
 * the web dir with $ZARF_WEB_DIR if the layout ever moves.
 */
function coreLibDir() {
  if (process.env.ZARF_WEB_DIR) {
    return resolve(process.env.ZARF_WEB_DIR, "packages/core/lib");
  }
  // …/contracts/soroban/zarf/scripts/lib  ->  …/<repo>/web/packages/core/lib
  const repoRoot = resolve(HERE, "../../../../..");
  return resolve(repoRoot, "web/packages/core/lib");
}

/**
 * Dynamically import the audited merkle + address-normalizer modules from the
 * `@zarf/core` source. Returns { buildTree, leafHash, verifyProof,
 * normalizeAirdropAddress }. Requires the `tsx` loader (the package uses
 * extensionless internal imports).
 */
async function loadCore() {
  const lib = coreLibDir();
  const merkleUrl = pathToFileURL(resolve(lib, "merkle/index.ts")).href;
  const addrUrl = pathToFileURL(resolve(lib, "utils/airdropAddress.ts")).href;
  let merkle;
  let addr;
  try {
    merkle = await import(merkleUrl);
    addr = await import(addrUrl);
  } catch (e) {
    die(
      `failed to import @zarf/core from ${lib}: ${e.message}\n` +
        `  run via web's tsx with cwd=web, e.g.\n` +
        `  cd <repo>/web && ./node_modules/.bin/tsx <this script> …`,
    );
  }
  const { buildTree, leafHash, verifyProof } = merkle;
  const { normalizeAirdropAddress } = addr;
  if (!buildTree || !leafHash || !verifyProof || !normalizeAirdropAddress) {
    die(
      "imported @zarf/core but expected exports are missing (version drift?)",
    );
  }
  return { buildTree, leafHash, verifyProof, normalizeAirdropAddress };
}

/** Minimal `--flag value` / `--bool-flag` argv parser (no deps). */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true; // boolean flag
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

// ── self-contained ed25519 strkey encoder (filler rows only) ──────────────────
// A Stellar ed25519 PUBLIC-KEY strkey is base32( version ‖ 32-byte-key ‖ crc16 )
// with version byte 6<<3 = 0x30 ('G') and CRC16-XModem (poly 0x1021, init 0, CRC
// appended little-endian). Used ONLY to mint deterministic FILLER addresses — the
// real claimant is passed through verbatim and only ever hashed by @zarf/core, so
// no leaf depends on this encoder.
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STRKEY_VERSION_ED25519_PUBLIC = 6 << 3; // 0x30 → 'G'

function crc16xmodem(bytes) {
  let crc = 0x0000;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out; // 56 chars for the 35-byte payload; Stellar omits '=' padding
}

/** Encode a 32-byte ed25519 public key as a `G…` strkey. */
function encodeEd25519PublicKey(rawKey32) {
  const payload = new Uint8Array(1 + 32);
  payload[0] = STRKEY_VERSION_ED25519_PUBLIC;
  payload.set(rawKey32, 1);
  const crc = crc16xmodem(payload);
  const full = new Uint8Array(payload.length + 2);
  full.set(payload, 0);
  full[payload.length] = crc & 0xff; // little-endian CRC
  full[payload.length + 1] = (crc >> 8) & 0xff;
  return base32Encode(full);
}

/** One deterministic `G…` strkey for filler row `i` under `seed`. */
function fillerAddress(seed, i) {
  const pk = createHash("sha256").update(`${seed}:${i}`).digest(); // 32 bytes
  return encodeEd25519PublicKey(pk);
}

/**
 * `--gen-list`: print a deterministic `[{address, amount}, …]` claim list of
 * `count` rows. `claimant` (a real address) is slotted at `claimantIndex` so it
 * can actually claim; every other row is a deterministic filler strkey. Emitted
 * in EXACT index order (array position == leaf index). Needs NO @zarf/core, so a
 * non-uppercase `--claimant` is upper-cased here to match the normalizer.
 */
function genList(args, emit) {
  const count = args.count === undefined ? 81 : Number(args.count);
  if (!Number.isInteger(count) || count < 1) {
    die(`--count must be a positive integer, got ${args.count}`);
  }
  const amount = args.amount === undefined ? "1" : String(args.amount);
  if (!/^\d+$/.test(amount) || amount === "0") {
    die(`--amount must be a positive integer decimal string, got ${amount}`);
  }
  const seed = typeof args.seed === "string" ? args.seed : "zarf-airdrop-e2e";

  let claimantIndex;
  if (args["claimant-index"] !== undefined) {
    claimantIndex = Number(args["claimant-index"]);
    if (
      !Number.isInteger(claimantIndex) ||
      claimantIndex < 0 ||
      claimantIndex >= count
    ) {
      die(
        `--claimant-index ${args["claimant-index"]} out of range [0, ${count - 1}]`,
      );
    }
  } else {
    claimantIndex = count - 1; // last index → guarantees ≥80 for a ≥81 list
  }

  // trim + UPPERCASE, mirroring normalizeAirdropAddress (no @zarf/core here).
  const claimant =
    typeof args.claimant === "string"
      ? args.claimant.trim().toUpperCase()
      : undefined;

  const rows = [];
  for (let i = 0; i < count; i++) {
    if (i === claimantIndex && claimant) {
      rows.push({ address: claimant, amount });
    } else {
      rows.push({ address: fillerAddress(seed, i), amount });
    }
  }
  emit(rows);
}

/** Read the claim list from --claims <path> or stdin (default). */
function readClaims(args) {
  let raw;
  if (typeof args.claims === "string") {
    try {
      raw = readFileSync(args.claims, "utf8");
    } catch (e) {
      die(`cannot read --claims file ${args.claims}: ${e.message}`);
    }
  } else {
    try {
      raw = readFileSync(0, "utf8"); // fd 0 = stdin
    } catch (e) {
      die(`cannot read claim list from stdin: ${e.message}`);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    die(`claim list is not valid JSON: ${e.message}`);
  }

  // Accept either a bare array or a { claims: [...] } wrapper document.
  const arr = Array.isArray(parsed) ? parsed : parsed && parsed.claims;
  if (!Array.isArray(arr)) {
    die(
      "claim list must be a JSON array of {address, amount} (or {claims:[…]})",
    );
  }
  if (arr.length === 0) {
    die("claim list is empty (buildTree requires >=1 row)");
  }
  return arr;
}

/**
 * Normalize raw rows into `@zarf/core` `Row`s in EXACT input order (array
 * position IS the contract leaf index — never reorder/sort/dedupe). Address
 * normalization (trim + UPPERCASE) is the caller's job and silent if skipped, so
 * we apply the single shared normalizer; amount is forced to a decimal STRING to
 * preserve the full i128 range (no IEEE-754 loss).
 */
function toRows(claims, normalizeAirdropAddress) {
  return claims.map((c, i) => {
    if (c == null || typeof c !== "object") {
      die(`claim[${i}] is not an object`);
    }
    if (typeof c.address !== "string" || c.address.length === 0) {
      die(`claim[${i}].address must be a non-empty string`);
    }
    if (c.amount === undefined || c.amount === null) {
      die(`claim[${i}].amount is required (decimal string)`);
    }
    const amount = String(c.amount);
    if (!/^-?\d+$/.test(amount)) {
      die(
        `claim[${i}].amount must be an integer decimal string, got ${amount}`,
      );
    }
    return {
      address: normalizeAirdropAddress(c.address), // load-bearing (UPPERCASE)
      amount, // decimal string, full i128 range
    };
  });
}

const bare = (h) => h.replace(/^0x/, "");

/**
 * Byte-parity self-test against the committed Rust-generated fixture. Iterates
 * EVERY case of EVERY tree and asserts root + leaf + full proof ARRAY equality
 * (order + elements) — stricter than the Rust differential (which only folds the
 * proof back into the root). Proves the @zarf/core invocation here reproduces
 * exactly what the contract verifies before any real proof is generated.
 */
function selfTest(core) {
  const { buildTree, leafHash, verifyProof, normalizeAirdropAddress } = core;
  const fixturePath = resolve(
    HERE,
    "../../airdrop/tests/fixtures/merkle-vectors.json",
  );
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch (e) {
    die(`cannot read fixture ${fixturePath}: ${e.message}`);
  }

  let checked = 0;
  for (const tree of fixture.trees) {
    const rows = tree.cases.map((c) => ({
      // Feed the strkey verbatim (already uppercase in the fixture) through
      // the SAME normalizer the producer uses; do NOT pre-decode to bytes.
      address: normalizeAirdropAddress(c.address),
      amount: String(c.amount),
    }));
    const built = buildTree(rows);

    if (built.root !== tree.root) {
      die(
        `self-test FAIL [${tree.name}] root\n` +
          `  expected ${tree.root}\n  got      ${built.root}`,
      );
    }
    for (const c of tree.cases) {
      const leaf = built.leaves[c.index];
      if (leaf !== c.leaf) {
        die(
          `self-test FAIL [${tree.name}] leaf @${c.index}\n` +
            `  expected ${c.leaf}\n  got      ${leaf}`,
        );
      }
      const proof = built.proofs[c.index];
      const sameProof =
        proof.length === c.proof.length &&
        proof.every((p, k) => p === c.proof[k]);
      if (!sameProof) {
        die(
          `self-test FAIL [${tree.name}] proof @${c.index}\n` +
            `  expected ${JSON.stringify(c.proof)}\n` +
            `  got      ${JSON.stringify(proof)}`,
        );
      }
      // Cross-check the single-leaf helper + the verifier agree too.
      const solo = leafHash(
        c.index,
        rows[c.index].address,
        rows[c.index].amount,
      );
      if (solo !== c.leaf || !verifyProof(tree.root, c.leaf, c.proof)) {
        die(`self-test FAIL [${tree.name}] helper/verify @${c.index}`);
      }
      checked++;
    }
  }
  logErr(
    `merkle-proof-gen self-test OK: ${fixture.trees.length} trees, ` +
      `${checked} leaves byte-identical to fixture`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pretty = Boolean(args.pretty);
  const emit = (obj) =>
    process.stdout.write(
      (pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj)) + "\n",
    );

  // gen-list is self-contained (no @zarf/core) — handle it before loadCore so
  // it works even where the tsx/web resolution is unavailable.
  if (args["gen-list"]) {
    genList(args, emit);
    return;
  }

  const core = await loadCore();

  if (args["self-test"]) {
    selfTest(core);
    return;
  }

  const { buildTree, verifyProof, normalizeAirdropAddress } = core;
  const claims = readClaims(args);
  const rows = toRows(claims, normalizeAirdropAddress);

  // buildTree does the whole job in one pass: root + every leaf + every proof.
  let tree;
  try {
    tree = buildTree(rows);
  } catch (e) {
    die(`buildTree failed: ${e.message}`);
  }
  const rootBare = bare(tree.root);

  if (args["root-only"]) {
    emit({ root: tree.root, rootBare });
    return;
  }

  if (args.all) {
    // Verify every proof before shipping the bundle.
    rows.forEach((_, i) => {
      if (!verifyProof(tree.root, tree.leaves[i], tree.proofs[i])) {
        die(
          `self-check FAILED: proof for index ${i} does not reproduce the root`,
        );
      }
    });
    emit({
      root: tree.root,
      rootBare,
      leaves: rows.map((r, i) => ({
        index: i,
        address: r.address,
        amount: r.amount,
        leaf: tree.leaves[i],
        proof: tree.proofs[i],
        proofLen: tree.proofs[i].length,
        proofBareJson: JSON.stringify(tree.proofs[i].map(bare)),
      })),
    });
    return;
  }

  const index = args.index === undefined ? 0 : Number(args.index);
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    die(`--index ${args.index} out of range [0, ${rows.length - 1}]`);
  }

  const leaf = tree.leaves[index];
  const proof = tree.proofs[index];

  // Self-check ON by default (skip only with --no-self-check): the proof MUST
  // reproduce the root, i.e. be exactly what the contract verifies.
  if (!args["no-self-check"] && !verifyProof(tree.root, leaf, proof)) {
    die(
      `self-check FAILED: proof for index ${index} does not reproduce the root`,
    );
  }

  emit({
    root: tree.root,
    index,
    address: rows[index].address,
    amount: rows[index].amount,
    leaf,
    proof,
    proofLen: proof.length,
    // Pre-formatted for stellar-cli (bare hex, no 0x):
    rootBare,
    proofBareJson: JSON.stringify(proof.map(bare)),
  });
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));

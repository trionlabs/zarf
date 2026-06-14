# ADR-0002: Proofs use the non-ZK UltraKeccakHonk flavor

- Status: Accepted as interim (2026-06-12); ZK flavor port planned as a
  separate project before mainnet value

## Context

The browser prover calls bb.js with `{ keccak: true }`
(`web/packages/core/lib/zk/proof.worker.ts`), and the PoC generator sets
`disableZk: true`. bb.js 2.x offers `{ keccak | keccakZK | starknet |
starknetZK }`; the selected flavor is **UltraKeccakHonk without the
zero-knowledge masking rounds**. The on-chain verifier
(`contracts/soroban/verifier/ultrahonk-soroban-verifier`) implements exactly
this non-ZK proof layout and cannot verify the ZK flavor.

## What this means precisely

- The proof is *succinct* and *sound*: it convinces the verifier that the
  prover holds a Google-signed JWT for an email in the distribution without
  publishing those values, and on-chain validation of the 25 public inputs is
  complete.
- The proof is **not formally zero-knowledge**: sumcheck/Gemini evaluations
  are unmasked, so the transcript is a deterministic function of the witness
  (which contains the cleartext email, the JWT bytes, and the epoch secret).
  No practical extraction attack is known — recovering witness data from a
  Honk transcript is a nontrivial cryptanalytic task — but the formal hiding
  guarantee the product copy implies ("without revealing the email") is not
  cryptographically established, and identical witnesses produce identical
  proofs (linkability).

## Decision

1. Ship with the non-ZK flavor for now; treat the gap as a documented,
   bounded risk for a testnet showcase.
2. Keep public copy accurate: say proofs *do not publish* the email, not that
   the proof is "zero-knowledge" in the formal sense.
3. The real fix is a coupled change — prover `{ keccakZK: true }` **and** a
   verifier port to the ZK proof layout (new masking commitments, masked
   sumcheck target, Gemini masking claims in Shplemini). This is XL-sized and
   scheduled as its own project; the differential test harness
   (`adversarial_test.rs`, Phase 2 of the remediation plan) is the acceptance
   gate for that port.

## Consequences

- Any future marketing/security review should reference this ADR before
  claiming formal ZK properties.
- The privacy of the recipient *identity commitment* rests on Pedersen hiding
  and the epoch-secret entropy, not on proof zero-knowledge.

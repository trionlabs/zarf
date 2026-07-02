---
title: FAQ & glossary
description: Quick answers to common questions about claiming, privacy, cost, and networks — plus a plain-language glossary of every Zarf term.
sidebar:
  order: 5
---

Short answers to the questions people ask most, followed by a glossary. For
step-by-step help claiming, see [claim your tokens](/recipients/claim-your-tokens/)
and [troubleshooting](/recipients/troubleshooting/).

## Frequently asked questions

### Do I need a wallet to receive tokens?

No — not to *receive*. That's the point of the email flow: someone can send you
tokens using only your email address. You do need a wallet to *claim* them, but
you can connect or create one at claim time. See
[claim your tokens](/recipients/claim-your-tokens/).

### Is my email stored anywhere, or put on-chain?

No. Your email is never published on-chain, and Zarf's servers never receive your
raw email. It's hashed into the recipient list, and at claim time it stays inside
your browser. Only commitments and a proof go on-chain — see the
[privacy model](/learn/privacy-model/).

### Why does claiming use "Sign in with Google"?

Only to prove you own the email the distribution was sent to. Your browser turns
the Google login into a zero-knowledge proof of email ownership; the email itself
never leaves your browser and is never revealed on-chain. Google isn't told your
wallet or the distribution.

### Do I have to use a specific email account?

Yes. You must sign in with the exact Google account the distribution was created
for. Signing in with a different email will find no allocation.

### What if I lose my PIN?

You can't claim without it, and **Zarf cannot recover or reset it** — it's a
per-recipient secret, not stored on any Zarf server. Contact whoever sent you the
claim link (the distribution creator), since they generated it.

### Can the sender see my wallet address?

They can see that *a* wallet claimed an allocation, along with the amount — claims
and transfers are public on any blockchain. What no one can do, including the
sender, is *prove* that this wallet belongs to you. The link between your email
and your wallet is never revealed. See the [privacy model](/learn/privacy-model/).

### How long does claiming take?

Generating the proof takes roughly **60–90 seconds in your browser** — this is
normal. It's real cryptography running on your device, not a slow server.

### Can I claim on my phone?

Proof generation is memory- and compute-heavy, so a modern **desktop browser** is
the most reliable choice. If claiming stalls or fails, see
[troubleshooting](/recipients/troubleshooting/).

### What does it cost?

On testnet, a ZK claim costs about **0.0225 XLM** — and testnet XLM has no real
value, so it's effectively free to try. Creators separately deposit the tokens
they're distributing; see [costs and funding](/creators/costs-and-funding/).

### Which networks does Zarf run on?

Stellar **testnet** only, today. Mainnet is deliberately gated on a third-party
security audit. See [project status](/resources/project-status/).

### My distribution has a cliff or vesting — when can I claim?

You claim each portion as it unlocks. Nothing is claimable during the cliff;
after that, portions become available on the schedule. See
[vesting claims](/recipients/vesting-claims/).

### I claimed but nothing arrived in my wallet — why?

The most common cause is a missing **trustline**: for non-native Stellar tokens,
your wallet must add a trustline for that token before it can hold it. See
[troubleshooting](/recipients/troubleshooting/).

### Is Zarf audited? Is it safe to use with real funds?

There is no third-party audit yet, and Zarf runs on testnet only. Mainnet is
audit-gated on purpose. Read [trust assumptions](/learn/trust-assumptions/) for
the honest picture before relying on it.

### Can a creator claw back unclaimed tokens?

For email (ZK) distributions, **no** — the vesting contract has no owner
withdraw or sweep, so tokens recipients never claim stay locked in the contract.
Creators should fund accordingly; see
[costs and funding](/creators/costs-and-funding/).

## Glossary

| Term | What it means |
|---|---|
| **Distribution** | A batch of tokens allocated to a set of recipients (by email or by wallet), held and released by a Zarf smart contract. |
| **Vesting** | Releasing tokens gradually over time on a schedule — in scheduled portions rather than all at once. |
| **Cliff** | An initial lock period during which nothing is claimable. The release schedule begins only after the cliff passes. |
| **Claim link** | The URL a recipient opens to claim, pointing at their distribution (for example, `claim.zarf.to/?address=<vesting>`). |
| **PIN** | A per-recipient secret code issued with the claim link. Combined with your email, it identifies your allocation and keeps recipients unlinkable. |
| **Merkle root** | A single hash that commits to the entire recipient list. It's the only representation of the audience that goes on-chain — no emails. |
| **Epoch commitment** | The on-chain marker that records one unlock period as claimed. It prevents the same allocation being claimed twice, and reveals nothing about the recipient. |
| **zkWT** | A Google sign-in token (a JWT) proven in zero-knowledge: it proves Google signed a token for an email in the recipient list, without revealing which email. |
| **JWK** | The public signing keys Google uses to sign login tokens. Zarf mirrors their hashes on-chain (the JWK Registry) so proofs can be checked against genuine Google keys. |

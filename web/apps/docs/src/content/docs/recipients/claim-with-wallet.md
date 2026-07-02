---
title: Claim with a wallet
description: How to claim tokens from a Zarf wallet airdrop at airdrop.zarf.to — connect your wallet, check eligibility, and claim.
sidebar:
  order: 2
---

Some Zarf distributions are **wallet airdrops**: the person running them chose a
list of wallet addresses ahead of time, and if your address is on the list you
can claim. There is no email and no PIN here — being eligible simply means your
wallet address was included when the airdrop was created.

If instead you received an email with a link and a PIN, you want
[claim your tokens](/recipients/claim-your-tokens/) — that is the email flow.

## Goal

Claim your allocation from a wallet airdrop straight to the wallet you connect.

## Before you start

- **Your claim link.** It looks like `https://airdrop.zarf.to/claim?a=…&cid=…`.
  Only ever trust a link on the `airdrop.zarf.to` domain — see
  [staying safe](/recipients/security/).
- **A wallet holding the address that was whitelisted.** Zarf works with
  Freighter, a free browser-extension wallet for Stellar. You must connect the
  exact address the creator added to the airdrop.
- **A little XLM** in that wallet for the network fee (XLM is Stellar's built-in
  coin). Today Zarf runs on Stellar's **test network**, so this is valueless
  test XLM.

## Time & cost

- **About 1 to 2 minutes** — there is no proof-generation wait in the wallet
  flow, so it is quicker than the email flow.
- **A small network fee** in XLM, paid from your wallet when you sign the claim.

<!-- TODO(verify): confirm per-claim fee figure for the wallet airdrop path; the ~0.0225 XLM measurement in the canonical facts is for the ZK (email) claim, not the keccak Merkle airdrop claim. -->

## Steps

### 1. Open your claim link

Click the link, or paste it into your browser. It opens the airdrop claim page
at `airdrop.zarf.to`.

**What you'll see:** the airdrop's claim page. Behind the scenes it loads the
airdrop's recipient list and checks it against what is recorded on-chain, so a
tampered link is caught before you do anything.

<!-- TODO(screenshot): step 1 — airdrop claim landing page -->

### 2. Connect your wallet

Connect Freighter and approve the connection. Make sure the connected address is
the one you expect to be eligible.

**What you'll see:** your wallet address on screen once connected. If your wallet
is set to a different Stellar network than the airdrop, you'll be asked to switch
— for a test-network airdrop you'll see a message like *This airdrop is on
testnet. Switch your wallet and app to testnet to continue.*

<!-- TODO(screenshot): step 2 — connect wallet on airdrop claim page -->

### 3. Check your eligibility

The page tells you whether your connected address is on the airdrop list and how
much you can claim.

**What you'll see:** either your allocation amount, or *You are not eligible for
this airdrop* if your address was not included. Eligibility is fixed by the
creator when they set up the airdrop — Zarf cannot add you to a list you were
left off.

<!-- TODO(screenshot): step 3 — eligibility result -->

### 4. Claim and sign

Select the claim action and approve the transaction in your wallet.

**What you'll see:** a signing prompt from Freighter, then a success
confirmation. Your tokens are transferred to the wallet you connected.

<!-- TODO(screenshot): step 4 — claim confirmation and success -->

## How this differs from the email flow

| | Email distribution | Wallet airdrop |
|---|---|---|
| Where you claim | `claim.zarf.to` | `airdrop.zarf.to` |
| How you prove it's you | Sign in with Google + PIN | Connect the whitelisted wallet |
| What the creator needed | Your email address | Your wallet address |
| Privacy proof step | Yes (~60–90s in your browser) | No |

For a fuller comparison of the two approaches, see
[what is Zarf](/learn/what-is-zarf/).

## If something goes wrong

- **It says you are not eligible** — the connected address probably is not the
  one that was whitelisted. See
  [wallet airdrop problems](/recipients/troubleshooting/#wallet-airdrop-problems).
- **It says the claim window has closed** — the airdrop had a deadline that has
  passed. See
  [wallet airdrop problems](/recipients/troubleshooting/#wallet-airdrop-problems).
- **It warns the link doesn't match, or looks off** — do not proceed; read
  [staying safe](/recipients/security/).
- **Wrong network** — switch Freighter to the network the airdrop is on
  (test network today).

<!-- TODO(verify): the airdrop-claim app UI (web/apps/airdrop-claim/src) is not present in the repo at time of writing; the flow and on-screen messages above are derived from the demo deploy script (web/scripts/deploy_demo_airdrop.ts) and the QA test scenarios (tests/zarf-test-scenarios.html, Suite E). Confirm exact button labels and copy against the app once its source lands. -->

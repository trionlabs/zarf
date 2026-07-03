---
title: Claim your tokens
description: Step-by-step guide to claiming tokens from a Zarf email distribution — sign in, enter your PIN, and receive tokens in your wallet.
sidebar:
  order: 1
---

Someone sent you tokens using Zarf, and you received an email with a link and a
PIN (a short private code). This page walks you through claiming them, start to
finish. You do not need any crypto experience.

## Goal

Turn your claim link and PIN into tokens in a wallet you control.

## Before you start

- **Your claim link.** It looks like `https://claim.zarf.to/?address=…`. Only
  ever trust a link on the `claim.zarf.to` domain — see
  [staying safe](/recipients/security/).
- **Your PIN.** This is the private code that was sent to you (by email or
  message) alongside the link. It cannot be recovered if lost, so keep it handy.
- **The Google account that received the email.** You will sign in with Google
  to prove the email is yours. It must be the same email address the tokens were
  sent to.
- **A wallet.** Zarf works with Freighter, a free browser-extension wallet for
  Stellar (the network Zarf runs on). If you do not have a wallet yet, install
  Freighter first — you will connect it near the end.

## Time & cost

- **About 3 to 5 minutes.** Most of that is a one-time wait while your browser
  builds a private proof, which takes roughly 60 to 90 seconds.
- **A small network fee** paid from your wallet — measured at about
  **0.0225 XLM per claim**. XLM is Stellar's built-in coin. You (the recipient)
  sign and submit the claim from your own wallet, so you pay this fee.

Today Zarf runs on Stellar's **test network**, so the XLM fee uses valueless
test coins.

## Steps

### 1. Open your claim link

Click the link from your email, or paste it into your browser. It opens the
Claim Portal at `claim.zarf.to`.

**What you'll see:** a page titled *Claim Portal* asking you to sign in.

<!-- TODO(screenshot): step 1 — Claim Portal landing page -->

### 2. Sign in with Google

Choose **Sign in with Google** and pick the account that received the email.

**What you'll see:** Google's own sign-in screen. After you finish, the page
shows a green *Verified Account* box with your email address. If it shows the
wrong email, use **Switch Account** and sign in again — you must use the exact
address the tokens were sent to.

<!-- TODO(screenshot): step 2 — Google sign-in screen -->

### 3. Enter your PIN

Type your PIN into the *Access Code* field, then select **Unlock Allocation**.

**What you'll see:** a password-style field with the placeholder *Enter 8-char
PIN*, followed by *Searching Blockchain…* while Zarf privately checks whether you have an
allocation. If your email and PIN match, your allocation appears. If not, you'll
see *No allocation found* — double-check both and try again.

<!-- TODO(screenshot): step 3 — PIN entry and Unlock Allocation button -->

### 4. Review your allocation and pick a period to claim

Your dashboard shows your **Total Allocation**, how much has **unlocked** so far,
and how much is **Claimable Now**. Below that is an *Unlock Schedule* table.

Find a row marked **Ready** and select its **Claim** button.

**What you'll see:** stat cards and a schedule table. Some periods may say
*Locked* (not available yet) or *Claimed* (already taken). Only *Ready* periods
can be claimed. If everything is still locked, your tokens are on a vesting
schedule that has not started releasing yet — see
[vesting claims](/recipients/vesting-claims/).

<!-- TODO(screenshot): step 4 — vesting dashboard and Unlock Schedule table -->

### 5. Connect your wallet

On the *Recipient Wallet* step, select **Connect Wallet** and approve the
connection in Freighter. This is the address your tokens will be sent to.

**What you'll see:** your wallet address displayed on screen, then a
**Confirm & Proceed** button. If no wallet is detected, install Freighter and
reload.

<!-- TODO(screenshot): step 5 — Connect Wallet / Recipient Wallet step -->

### 6. Wait while your browser builds a private proof

This step runs automatically. Your browser proves that you own the email —
without ever showing your email to anyone or linking it to your wallet.

**What you'll see:** a *Securing Identity* screen with a progress ring for about
60 to 90 seconds. Keep the tab open and your device awake. When it finishes it
shows *Proof Successful*.

<!-- TODO(screenshot): step 6 — Securing Identity proof-generation screen -->

### 7. Sign the claim and receive your tokens

On the *Finalize Claim* screen, review the amount, then select
**Claim to this wallet**. Approve the transaction in Freighter.

**What you'll see:** the claim amount and your wallet address, a signing prompt
from Freighter, then a *Transaction Success* message with a **View Explorer**
link. Your tokens arrive in your wallet within moments of network confirmation.

<!-- TODO(screenshot): step 7 — Finalize Claim and success screen -->

If your allocation is spread across several unlock periods, repeat steps 4 to 7
for each period as it becomes *Ready*. See
[vesting claims](/recipients/vesting-claims/) for how that works.

## If something goes wrong

- **You see *No allocation found*** — you may have signed in with the wrong
  Google account, or mistyped your PIN. See
  [wrong Google account](/recipients/troubleshooting/#i-signed-in-with-the-wrong-google-account)
  and [lost or incorrect PIN](/recipients/troubleshooting/#i-lost-my-pin-or-it-is-not-accepted).
- **The proof screen stalls or fails** — see
  [proof generation problems](/recipients/troubleshooting/#proof-generation-fails-or-gets-stuck).
- **The link won't open or is rejected** — see
  [expired or invalid link](/recipients/troubleshooting/#the-claim-link-is-expired-or-invalid).
- **It says already claimed** — see
  [already claimed](/recipients/troubleshooting/#it-says-this-period-is-already-claimed).
- **Tokens don't show up in your wallet** — see
  [my tokens have not arrived](/recipients/troubleshooting/#my-tokens-have-not-arrived).

Want to understand what stays private? Read the
[privacy model](/learn/privacy-model/). Claiming from a wallet-based airdrop
instead? See [claim with a wallet](/recipients/claim-with-wallet/).

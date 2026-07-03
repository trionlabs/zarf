---
title: Staying safe
description: How to recognize a legitimate Zarf claim, avoid phishing, and protect your wallet when claiming tokens.
sidebar:
  order: 5
---

Token claims are a favourite target for scammers. The good news: with Zarf you
can verify a claim yourself, and a real claim never asks for anything secret.
This page shows you what to check.

## The one thing to always verify: the link domain

A Zarf claim always happens on one of exactly two web addresses:

- **`claim.zarf.to`** — email distributions (you sign in and enter a PIN).
- **`airdrop.zarf.to`** — wallet airdrops (you connect a whitelisted wallet).

Before you sign in or connect anything, look at the address bar. If the domain is
not exactly `claim.zarf.to` or `airdrop.zarf.to`, do not trust it. Lookalikes
such as `claim-zarf.to`, `zarf.to.example.com`, or `zarf-claim.io` are **not**
Zarf.

## Zarf itself does not email you — the sender does

Your claim link and PIN are sent to you by **whoever is distributing the
tokens** — a project, an employer, or a community — not by Zarf. So there is no
single official "Zarf sender" address to memorize.

That is exactly why the **link domain** is what matters. Judge a claim by the
domain it points to (above), and if anything about the message feels off,
confirm with the sender through a channel you already trust before clicking.

## What a real claim never asks for

- **Never** enter your wallet's **seed phrase** (also called a recovery phrase)
  or **private key** anywhere. Zarf never asks for it, and no legitimate claim
  ever will. Anyone who does is trying to steal your wallet.
- When you claim, your wallet (Freighter) asks you to **approve a transaction** —
  that is normal and safe. Approving a transaction is not the same as handing
  over your secret key, which never leaves your wallet.
- Zarf never asks you to "sync", "validate", or "restore" your wallet by typing
  secret words into a website.

## What your PIN is for

For email distributions, your PIN is a private code used **only to find and
claim your allocation**. Keep these facts in mind:

- It was sent to you **privately** by the distribution's creator.
- Zarf **never stores your PIN** and cannot recover or reset it — it is not saved
  on any server, for your privacy.
- Do not share it. Anyone with your link and PIN could attempt to claim, though
  the tokens can still only be sent to a wallet whose owner signs the claim.

## What signing in with Google is for

Signing in with Google proves to Zarf that the email address the tokens were
sent to really is yours. That is all it is used for.

- Your **email is never put on-chain** and is never linked to your wallet
  address.
- Zarf does not store or transmit your email to a server — it is used only,
  inside your own browser, to build the private proof.

If you want the full picture of what is and isn't visible, read the
[privacy model](/learn/privacy-model/).

## Quick safety checklist

- The address bar reads exactly `claim.zarf.to` or `airdrop.zarf.to`.
- No one is asking for your seed phrase or private key.
- You are signing in with the Google account the tokens were sent to.
- Your PIN came from a sender you recognize.
- If in doubt, confirm with the sender before you click or sign.

## Reporting something suspicious

Zarf is a showcase project by Trion Labs. If you receive a suspicious message or
spot a fake claim site, you can report it to Trion Labs at
**contact@trionlabs.dev**.

<!-- TODO(verify): confirm the preferred security/abuse reporting address; README lists the general contact contact@trionlabs.dev, but there may be a dedicated disclosure channel. -->

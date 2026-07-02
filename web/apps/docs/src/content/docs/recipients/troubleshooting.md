---
title: Troubleshooting
description: Fixes for common problems when claiming Zarf tokens — sign-in, PINs, proof generation, expired links, and missing tokens.
sidebar:
  order: 4
---

Find your symptom below. Each section explains the likely cause and what to do.
If nothing here helps, contact whoever sent you the distribution — they can
re-check your allocation, and for email distributions they can resend your link
and PIN.

## I signed in but see no allocation

**What you'll see:** *No allocation found. Please check your Email and PIN.*

Zarf finds your tokens only when both your email and your PIN match what the
creator set up. If either is off, nothing is found.

**Fix:**

- Make sure you signed in with the **exact** Google email the tokens were sent
  to (see the next section).
- Re-enter your **PIN** carefully — it is case-sensitive and easy to mistype.
- If both look right and you still see nothing, ask the sender to confirm your
  email address is on the list and that you have the correct PIN.

## I signed in with the wrong Google account

Signing in with a different email than the one the tokens were sent to will also
show *No allocation found*, because that email is not part of the distribution.

**Fix:** on the verified-account box, choose **Switch Account**, then sign in
again with the correct Google email.

## I lost my PIN or it is not accepted

Your PIN was sent to you privately (by email or message) by whoever distributed
the tokens. **Zarf never stores your PIN and cannot recover or reset it** — for
your privacy, it is never saved on any server.

**Fix:**

- Search your inbox and messages for the original claim message.
- If you truly cannot find it, ask the sender to resend it. They keep the PIN
  list and can look yours up or reissue your link.

## Proof generation fails or gets stuck

**What you'll see:** a *Securing Identity* screen that stalls, or a *Generation
Failed* message.

Building the private proof happens entirely in your browser and is
memory-intensive. It works best on a desktop or laptop in an up-to-date browser.

**Fix:**

- Select **Retry Proof** — your eligibility is untouched and no transaction was
  sent, so retrying is safe.
- Switch to a **desktop or laptop** if you were on a phone or tablet, and use a
  current version of Chrome, Edge, Firefox, or Safari.
- Close heavy tabs or other apps to free up memory, keep the tab in the
  foreground, and stop your device from sleeping while it runs.
- If it still fails, wait a minute and try again, or come back later.

## The claim link is expired or invalid

A couple of different things can cause this:

- **A stale sign-in.** If you landed on the page through an old or broken
  sign-in link, you may see a message about a sign-in with no pending flow. Go
  back to your original claim link and sign in fresh from there.
- **A contract that can't be found.** If you typed or pasted an address by hand
  and see *Could not find a valid Zarf Vesting contract*, the address is wrong —
  use the exact link you were sent.

**Fix:** always start from the original `claim.zarf.to` link you received. If it
genuinely no longer works, ask the sender for a fresh one.

## It says this period is already claimed

**What you'll see:** the period is marked *Claimed*, or a claim is rejected as
already claimed.

Each unlock period can be claimed once. If you (or a previous attempt that
actually went through) already claimed it, it cannot be claimed again.

**Fix:** check your wallet — the tokens for that period are likely already
there. If your allocation has other periods, claim those instead; see
[vesting claims](/recipients/vesting-claims/).

## My tokens have not arrived

If the claim succeeded but you do not see the tokens, the most common cause on
Stellar is a **missing trustline** — your wallet has to explicitly opt in to
hold a given token before it can receive it. (Stellar's built-in coin, XLM, does
not need a trustline; most other tokens do.)

**Fix:**

- In Freighter, **add a trustline** for the token you are claiming, then check
  your balance again.
- Use the **View Explorer** link shown after a successful claim to confirm the
  transaction went through.
- If the transaction failed rather than succeeded, re-open your claim link and
  try again.

<!-- TODO(verify): confirm the deployed token(s) require a trustline and that a claim to a trustline-less account fails at transfer; QA fixtures mark recipient-4 as having no USDC trustline (negative case). -->

## It says the distribution is under-funded

**What you'll see:** a warning that the distribution may not hold enough tokens
to cover claims, and that claims may fail until the creator deposits more.

This means the creator has not yet funded the distribution with enough tokens.
It is not something you can fix.

**Fix:** wait, then try again later, or ask the sender to top up the
distribution.

## It mentions a Google signing key

**What you'll see:** a message that Google's current signing key is not
registered yet, and to retry the claim.

Zarf verifies Google sign-ins against a short list of Google's signing keys.
Google rotates these keys periodically, and there can be a brief gap before a
new one is recognized.

**Fix:** wait a little and retry. If it persists, let the sender know so they can
have the key list refreshed.

## My wallet address changed

**What you'll see:** a *Wallet address changed* warning saying the proof was
built for a different wallet.

The private proof is tied to the specific wallet you connected. If you switch
wallets partway through, the old proof no longer matches.

**Fix:** select **Regenerate Proof** to rebuild it for your currently connected
wallet, then claim again.

## Wallet airdrop problems

These apply to wallet airdrops at `airdrop.zarf.to`
(see [claim with a wallet](/recipients/claim-with-wallet/)):

- **You are not eligible for this airdrop** — the connected wallet address was
  not on the creator's list. Connect the exact address that was whitelisted;
  Zarf cannot add you to a list you were left off.
- **This allocation has already been claimed** — the airdrop for your address
  was already taken. Check your wallet balance.
- **The claim window has closed** — the airdrop had a deadline that has passed;
  the creator would need to run a new one.
- **Wrong network** — switch Freighter to the network the airdrop is on (the
  test network today).
- **A warning that the link doesn't match** — do not proceed. Read
  [staying safe](/recipients/security/).

<!-- TODO(verify): airdrop-claim UI copy is derived from tests/zarf-test-scenarios.html Suite E; confirm against the app source once web/apps/airdrop-claim/src exists. -->

## Still stuck?

- Re-read the full flow in [claim your tokens](/recipients/claim-your-tokens/).
- Make sure you are on a legitimate link — [staying safe](/recipients/security/).
- Contact the project or person that distributed the tokens; for email
  distributions they can resend your link and PIN.

---
title: CSV format
description: Prepare a recipient list that create.zarf.to accepts on the first try.
sidebar:
  order: 3
---

The recipient list you upload at [create.zarf.to](https://create.zarf.to) is a
plain CSV with **two columns per row**: an identifier and an amount. This page
describes exactly what the parser accepts, so your first upload is clean.

## The accepted format

```csv
email,amount
alice@example.com,100
bob@example.com,100
charlie@example.com,100
```

That is the shipped sample (`whitelist_sample.csv`). The rules:

- **Two comma-separated columns:** `identifier,amount`. Only the first two
  columns are read — extra columns are ignored.
- **Header row is optional.** If the **first** line contains `email`, `amount`,
  or `number` (case-insensitive), it's treated as a header and skipped.
  `email,amount` works; so does a file with no header at all.
- **Blank lines are skipped.**
- **Whitespace** around each value is trimmed.
- **Encoding:** UTF-8 text.

### Column 1 — the identifier

The identifier can be either:

- an **email address** (validated and normalized), or
- a **Stellar address** (checked for shape here; its full checksum is verified
  later when the transaction is built).

For an **email (ZK) distribution** at create.zarf.to, use **emails** — that's
what the zero-knowledge proof is built around. The parser also recognizes
**Stellar-address** rows at the shape level for the wallet-airdrop creator under
`/airdrop`; see
[Email vs wallet](/creators/email-vs-wallet/) for which flow you're running.

### Column 2 — the amount

- A **positive number** in whole token units (e.g. `100` means 100 tokens, not
  100 base units). It's converted to base units using the token's decimals
  (7 for standard Stellar assets).
- Decimals are allowed (e.g. `12.5`), up to the token's decimal precision.
- Zero, negative, or non-numeric amounts are rejected.

Amounts are **per recipient** — you set the exact amount each row receives.

## The total must match the pool

Before you can launch, the **sum of all row amounts must exactly equal** the
Distribution Pool amount you set on the schedule step. The app compares the
totals at the token's base-unit precision and blocks launch until they match. If
you change the pool, re-check the CSV total.

## One row per recipient

Each email should appear **once**. Duplicate emails are flagged as errors and,
because launch requires zero validation errors, will block deployment. If a
recipient should receive more, give that single row a larger amount rather than
adding a second row.

## Limits

- File must have a **`.csv`** extension.
- Maximum size **5 MB**.
- The file must not be empty.

## Common rejection messages

The uploader reports errors inline. These are the exact messages you may see:

| Message | Cause |
|---|---|
| `Line N: Invalid format (expected email, amount) - "…"` | The row has fewer than two comma-separated columns. |
| `Line N: Invalid amount (must be positive number) - "…"` | The amount isn't a number greater than zero. |
| `Line N: Invalid format (expected email or address) - "…"` | Column 1 is neither a valid email nor a Stellar-address shape. |
| `Duplicate email found: <email> (N occurrences)` | The same email appears on more than one row. |
| `Invalid file type: <name>. Expected .csv file.` | The file doesn't end in `.csv`. |
| `File too large: <X>MB. Maximum size is 5MB.` | The file is over 5 MB. |
| `File is empty` | The file has no content. |

## Checklist

- [ ] Two columns: identifier, amount.
- [ ] Emails for the email (ZK) flow (the parser also accepts Stellar-address rows).
- [ ] Every amount is a positive number in whole token units.
- [ ] No duplicate emails.
- [ ] The amounts sum to your pool amount.
- [ ] `.csv` file, under 5 MB, not empty.

Next: [Vesting design](/creators/vesting-design/) to shape how those amounts
unlock over time.

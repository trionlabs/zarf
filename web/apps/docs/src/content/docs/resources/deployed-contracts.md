---
title: Deployed contracts
description: Zarf's deployed contract addresses per network — the Stellar testnet demo deployment, with explorer links and the mainnet status.
sidebar:
  order: 1
---

Zarf runs on **Stellar testnet** today. Mainnet is **not deployed** — launch is
gated on a third-party security audit. See
[project status](/resources/project-status/).

The values below identify a deployed instance. For how to read these contracts
yourself, see the [integration guide](/developers/integration-guide/); for the
function-by-function reference, see [contracts](/developers/contracts/).

## Testnet — demo deployment

Addresses from `.deploy_ids.env` in the repository root.

| Role | Address |
|---|---|
| Deployer account | `GC5OIRTI6F4ANVHE3T67IA4NBAY2J4L6RR5TBNW46VGQQ6MVLOE3V5BZ` |
| Verifier (UltraHonk) | `CAXCY6Q2YA73NZAYKFUTTOWEPGGJJJ7FSLP5UCS7WRG7MTANPNKXKE5R` |
| JWK Registry | `CCYSJDNGYPEJZQWY57CYPS5G6VIATFT76CAC4BFSKACYA3DFG5DZEAFO` |
| Factory | `CCHGQ5M3TEICETQ7COWZ3GT6KNYJ4IBOAWRFSZWVFBAVAKYFTUS4WFUC` |
| Vesting WASM hash | `c2a4017643956e2e1f801c8ca0e1686bdfe1215fc4ac858ffcf422219ed07263` |
| Asset issuer account | `GDRJK2RZPGNIKIIWMTANQF67LHYW6IYX6VV6ODGXS6BSVVJFBLY3X3PI` |
| Sample token SAC (ZTEST) | `CAWE63OYKCEWNDWCDZATNE7WLEMWFTBGOYSBAZ7YD65QP5XCYIPHEJIQ` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

The Factory does not deploy vesting contracts to fixed addresses — each
distribution is deployed deterministically from its owner and salt. Discover live
distributions with `get_deployment_infos` on the Factory or via the indexer's
`GET /v1/testnet/vestings` endpoint (see the
[integration guide](/developers/integration-guide/)).

<!-- TODO(verify): canonical? .deploy_ids.env lists the addresses above, but the integration kit (presentation/integration/, verified against live contracts 2026-06-30) and the deployed jwk-rotation worker config (web/apps/jwk-rotation/wrangler.jsonc) point at a DIFFERENT set: Factory CDA5N3EH26BBIYRWUNZ4WX7OXWV7YI2XSG4IELWXWDGQA64NJWEN4AWR, Verifier CDVQBNBBQTQCCUBCJLP4BKDLFOXS5WK3J46M2CY6G75JQRJ7BBUAQKY4, JWK Registry CCTN3XSQM2P7CSXY4UOBGE67DA2Q7IZSRICP3ELKGUQDL5666VDCLXXW. Confirm which deployment is canonical for the docs before publishing, and reconcile the two sources. -->

### Explorer

Open any contract or account on the testnet explorer:

```
https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>
https://stellar.expert/explorer/testnet/account/<ACCOUNT_ID>
```

For example, the Factory:
[stellar.expert/explorer/testnet/contract/CCHGQ5M3TEICETQ7COWZ3GT6KNYJ4IBOAWRFSZWVFBAVAKYFTUS4WFUC](https://stellar.expert/explorer/testnet/contract/CCHGQ5M3TEICETQ7COWZ3GT6KNYJ4IBOAWRFSZWVFBAVAKYFTUS4WFUC).
You can also inspect storage and invoke methods from
[Stellar Lab](https://lab.stellar.org).

## Deployed WASM may lag source

The deployed testnet contracts may run **older WASM** than the current source
tree. Contract fixes (TTL extension and a factory footprint fix) were merged on
2026-06-12; a deployed contract stays on whatever WASM it was created with until
it is re-deployed (there is no in-place upgrade path, and the factory's storage
layout would require a migration).

Practical consequences:

- A function present in source may be absent from the deployed interface — for
  example the vesting batch view `claimed_statuses` is in the Rust source but not
  in the live testnet vesting interface. Always confirm against
  `stellar contract info interface` (see the
  [integration guide](/developers/integration-guide/)).
- The deployed JWK registry predates the PR #9 hardening, so it is single-owner
  with single-step ownership transfer and immediate key activation.

## Mainnet

**Not deployed.** Mainnet launch is deliberately gated on a completed
third-party audit — it is a gate, not a delay. See
[project status](/resources/project-status/) and the
[security model](/developers/security-model/).

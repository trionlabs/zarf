# Zarf — Standart Airdrop Aracı: Tasarım Doküman Seti

> Bu klasör, Zarf'ın ZK/e-posta çekirdeğinden **bilinçli olarak ayrı**, klasik **cüzdan-adresi +
> Merkle-claim** airdrop aracının derin-açı tasarım dokümanlarını içerir. Ana plan bir üst dizindedir:
> [`airdrop-tool-design.md`](airdrop-tool-design.md) (karar defteri + mimari + UI özeti + §0
> doğrulama notu).
>
> **Nasıl üretildi:** İki çok-ajanlı workflow (toplam ~20 ajan). Her doküman ilgili Stellar
> `SKILL.md`'leri (`soroban`/`assets`/`dapp`/`data`/`standards`) + repo kaynak kodu okunarak üretildi
> ve **ikinci bir adversarial ajan tarafından repoya karşı skeptikçe doğrulandı/düzeltildi**. Bu
> doğrulama, ilk taslakların (ve ana planın) birkaç maddi iddiasının repo ile çeliştiğini ortaya
> çıkardı — düzeltmeler ana plan §0'a ve ilgili dokümanlara işlendi.
>
> DURUM: Tasarım fazı. Implementasyon (M1: instance kontratı) bekliyor.

---

## Doküman haritası

| # | Doküman | Açı | Güven |
|---|---|---|---|
| — | [`airdrop-tool-design.md`](airdrop-tool-design.md) | **Ana plan** — kararlar, mimari, UI özeti, §0 doğrulama notu | — |
| 01 | [`01-threat-model-security.md`](01-threat-model-security.md) | STRIDE tehdit modeli, korunan invariant'lar, audit-readiness | Yüksek (on-chain) |
| 02 | [`02-contract-spec.md`](02-contract-spec.md) | Factory+instance ABI, hata/event/storage layout, adres türetme | Orta-yüksek |
| 03 | [`03-stellar-soroban-deep.md`](03-stellar-soroban-deep.md) | SAC/trustline + fee-sponsorluk/fee-bump + smart-wallet/passkey + reserve/rent | Orta-yüksek |
| 04 | [`04-standards-sep-alignment.md`](04-standards-sep-alignment.md) | SEP-41/7/1, Claimable Balance karşılaştırması | Orta-yüksek |
| 05 | [`05-economics-cost-model.md`](05-economics-cost-model.md) | Stellar-native maliyet, ölçek ekonomisi, kim-ne-öder | Orta-yüksek |
| 06 | [`06-testing-verification.md`](06-testing-verification.md) | Test matrisi, fuzz/property/differential, formal verification | Orta-yüksek |
| 07 | [`07-ui-ux.md`](07-ui-ux.md) | UI yerleşimi (nerede/neden) + UX akışları + wireframe'ler | Yüksek |
| 08 | [`08-operations-runbook.md`](08-operations-runbook.md) | CI/deploy/env, pin-proxy şema, dormant-kampanya TTL diriltme, runbook | Orta-yüksek |
| 09 | [`09-merkle-data-contract.md`](09-merkle-data-contract.md) | **Normatif** Merkle byte-format + claim-list JSON + Rust↔JS vektör | Orta-yüksek |
| 10 | [`10-indexer-data-model.md`](10-indexer-data-model.md) | Event şeması + dashboard veri modeli + indexer route'ları | Orta-yüksek |

> **Round-2 notu (tamamlandı):** 08–10 üretildi; `01` ve `06` MuxedAddress payout tehdidi + test-vektörü
> için genişletildi. Doğrulama ayrıca şunu netleştirdi: `withdraw_unclaimed`/`deadline`/`locked`/`config()`/
> `create_airdrop` **repo'da henüz yok** — bunlar yeni `zarf/airdrop` crate'inde **önerilen** yüzeydir
> (ana plan §4.4), mevcut kontrat garantisi değil. Dokümanlarda "(önerilen)" diye işaretli.

## Kilitli kararlar (özet — tam liste ana plan §2)

- **Cüzdan-adresi + Merkle-claim**, ZK yok, gizlilik yok — Zarf çekirdeğinden ayrı ürün.
- **Anlık claim, alıcı kendi fee'sini öder.** Pull/Merkle modeli (gönderen fonlar, alıcı çeker).
- **Factory + instance**: iki yeni bağımsız Soroban crate (`zarf/airdrop`, `zarf/airdrop-factory`);
  mevcut verifier/registry/vesting/factory/circuit'e dokunulmaz.
- **`locked` flag'i** (geri-çekme): `locked=true`+deadline → süreye kadar kilit; `locked=true`+deadline=0
  → trustless; `locked=false` → her an çekilebilir. Deadline sonrası her hâlükârda admin çeker.
- **Token**: tek arayüz `token::TokenClient`; v1 = XLM + custom SEP-41, v1.1 = klasik/USDC
  (trustline ön-adımı + issuer-flag denetimi).
- **Host**: pin-proxy/IPFS yeniden kullanım (şema değişikliği gerekir — bkz. aşağıdaki repo-divergence #7).
- **Web**: ayrı `airdrop-create` (3-adım wizard, airtable-grid) + `airdrop-claim` (tek-ekran, ~2 tık).

## Repo-divergence düzeltmeleri (adversarial doğrulamadan)

Doğrulama, repo ile çelişen 9 maddeyi yakaladı; hepsi ana plan [§0](airdrop-tool-design.md)'a
bağlayıcı olarak işlendi. En kritikleri:

1. **Fonlama `transfer_from`/allowance ile** (owner önce factory'ye `approve`), düz `transfer` değil.
2. **Yaprak düz `keccak256`** — repo `recipient_id`'deki BN254 skaler indirgemesi (ZK için) miras alınmaz.
3. **claim = set-before-transfer + açık rollback** + per-claim çift-yönlü balance guard.
4. **MuxedAddress payout** — muxed-claimant tutarlılığı test-vektörüyle pinlenmeli.
5. Factory wasm'ı `include_bytes!` ile gömmez; `with_current_contract(salt)` + `deploy_v2`.
6. **Wizard 3 adım** (4 olan, deploy mikro-stepper'ı).
7. **pin-proxy `validateClaimList` airdrop JSON'unu reddeder** → şema/route güncellenmeli.
8. `claimed_statuses(start,limit)≤80` airdrop kararı (vesting `Vec`+64'ten ayrılır — gerekçelendir).
9. Per-claim fee ~**0.01–0.03 XLM** (eski "~0.001" iyimserdi); trustline reserve/TTL tavanı "doğrulanmalı".

## Açık kararlar (önerimle)

| Konu | Öneri | Not |
|---|---|---|
| **Claim linki: SEP-7 vs web-link** | ✅ **KARAR: düz web-link** (`claim-drop.zarf.to/?a=…&cid=…`). Standart model: link → claim app → cüzdan bağla (Wallets Kit) → cüzdana claim. SEP-7 `tx` *paylaşılan* link olamaz (claim tx alıcıya-özel + canlı simülasyon ister); app-içi cüzdan bağlama zaten Wallets Kit ile. | 04 ve 07 buna uyar. |
| **Per-claim resource fee** | `--sim` ile testnet'te pinle | Şu an ~0.01–0.03 XLM tahmin (yayınlanan profilleme). |
| **Trustline reserve / TTL tavanı sayısı** | Dağıtım anında ağdan doğrula | Skill/repo'da sabit değil. |
| **Yaprak adres-binding** | Kapalı (instance izolasyonu yeterli) | İstenirse 09'da açılır. |
| **Permissionless-execute** | v1 = claimant-auth; v2'de değerlendir | Sponsor/batch claim köprüsü. |
| **Muxed claimant: leaf base mi muxed mı?** | 09'da karara bağlanıyor (öneri: base `G…` pinle) | Tutarlılık vektörü şart. |
| **`amount` JSON tipi** | string (i128 precision) | 09 normatif. |

## Sonraki adımlar

1. ✅ Round-2 tamam — 08–10 yazıldı, 01/06 genişletildi, tablo + ana plan §0 senkron.
2. Açık kararların onayı (özellikle **SEP-7 vs düz web-link** — yukarıdaki tablo).
3. Implementasyon: **M1** = `zarf/airdrop` instance kontratı + testler (02 ABI + 09 veri-sözleşmesi referans).
</content>

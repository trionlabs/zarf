# Zarf Airdrop Tasarim Dokumanlari — Stellar Uyumluluk Denetim Raporu

> **Kapsam:** `plans/airdrop_tool/` altindaki 10 tasarim dokumani (01 tehdit-modeli, 02 kontrat-spec/ABI, 03 Stellar/Soroban deep, 04 SEP-alignment, 05 ekonomi/maliyet, 06 test, 07 UI/UX, 08 ops-runbook, 10 indexer veri-modeli) ve kardes plan `airdrop-tool-design.md`.
> **Gorev tipi:** Uyumluluk denetimi — dokumanlar Stellar skill'lerinin otoriter rehberligi + Soroban/Stellar best-practice ile UYUMLU/TUTARLI mi? Adversarial dogrulama (false-positive elenmis) sonuclari sentezlenmistir.
> **Baglam:** Standart cuzdan-adresi + Merkle-claim airdrop araci (ZK yok, anlik claim, alici-oder fee, factory+instance mimarisi, pin-proxy/IPFS). Claim modeli standarttir: link → claim app → cuzdan bagla (Wallets Kit) → cuzdana claim. Bu beklenen davranistir.
>
> **GENEL VERDICT: UYUMLU.** Dokuman seti Stellar/Soroban skill'leriyle YUKSEK DOGRULUKLA TUTARLIDIR. Tum kritik guvenlik invariant'lari (reinit, overflow, storage-key collision, arbitrary-contract-call, TTL/archival, missing-auth, reentrancy/CEI), deployer mekanigi, transfer_from-allowance fonlama, set-before-transfer + explicit-rollback ve MuxedAddress payout deseni dogru uygulanmistir. Tespit edilen 5 bulgunun TAMAMI citation-rotasyon (yanlis dosya prefix'i / kaymis satir-no) veya tasarim-ici format-tutarliligi kalitesindedir — **hicbiri yanlis teknik iddia, anti-pattern veya kilitli-karar degisikligi DEGILDIR.** Skill'in vermedigi sayisal degerlerin (fee/reserve/TTL) "dogrulanmali" isaretlenmesi gorev kuralina gore DOGRU davranistir, bulgu sayilmamistir. Uydurma citation tespit edilmemistir.

---

## 1. Alan-Bazli Ozet Tablosu

| # | Skill Alani | Denetlenen Doc(lar) | Verdict | Onaylanan | Refute |
|---|-------------|---------------------|---------|:---------:|:------:|
| 1 | **Soroban kontrat denetimi** (security invariant, deployer, fonlama, reentrancy) | 01, 02, 06, 08 | **uyumlu** | 1 (low) | 6 |
| 2 | **Stellar Assets / SAC / trustline / issuer-flags** | 03, 04, 05 | **cogunlukla-uyumlu** | 3 (2 med, 1 low) | 2 |
| 3 | **dApp / cuzdan-baglanti, simulate→assemble, passphrase, claim akisi** | 03, 07, 10 | **cogunlukla-uyumlu** | 2 (1 med, 1 low) | 0 |
| 4 | **Stellar Data** (RPC getEvents/getLedgerEntries/simulate, indexer veri-modeli) | 10 | **uyumlu** | 0 | (sifir-issue; adversarial dogrulandi) |
| 5 | **Stellar Standards** (SEP-41/7/1/23/46/48/10/45, CB vs Soroban-Merkle) | 04 | **cogunlukla-uyumlu** | 1 (low) | 7 |
| | **TOPLAM** | | **UYUMLU** | **7 (3 med, 4 low)** | **15+** |

---

## 2. ONAYLANAN Sorunlar (High → Low)

> Not: Bu doc setinde **high-severity bulgu YOKTUR**. En agir bulgular **med** seviyesindedir ve hepsi citation-integrity (yanlis kaynak) defektidir — teknik icerik mekanik olarak dogrudur.

### MED-1 — Yanlis skill-dosya prefix'i: `op_no_trust`/`op_low_reserve` `data/` yerine `soroban/`'a ait
*(Alan 2 ve 3'te ayni kok-neden; en yuksek oncelikli bulgu — citation kanit-zinciri kirik)*

- **Dokuman:** `plans/airdrop_tool/03-stellar-soroban-deep.md`
  - §1.1.3 (satir 50-53), §4 (satir 218-219), §8 tablo (satir 420, 425); ayrica 03:51, 03:218, 03:235, 03:420, 03:425
- **Problem (DOGRULANDI):** Doc 03, eksik-trustline ve reserve-alti hata kodlarini (`op_no_trust`, `op_low_reserve`) ve "Pitfall #8 Missing Trustline"i `data/SKILL.md:2296-2326`, `data/SKILL.md:2578`, `data/SKILL.md:2580` olarak cite ediyor ve bunlari "ile dogrulanmistir / teyitli" (03:52-53, 03:420) diye isaretliyor. **Olculen gercek:** `wc -l data/SKILL.md` = **546 satir** → 2296-2326/2578/2580 satirlari o dosyada FIZIKSEL OLARAK YOK. `grep` ile `op_no_trust`/`op_low_reserve` `data/SKILL.md`'de HIC yok (yalniz satir 22 trustline-lookup'u assets skill'e yonlendiren bir pointer). Gercek kaynak `soroban/SKILL.md`'de: satir 2302 (`Error: op_no_trust`), 2578 (`| op_no_trust | Missing trustline | ... |`), 2580 (`| op_low_reserve | Below minimum balance | ... |`), Pitfall #8 metni `soroban/SKILL.md:2296` (`### 8. Missing Trustline`).
- **Onemli rafineman:** Iddialarin KENDISI ve **satir-numaralari soroban icin AYNEN dogru** — yalniz `data` dosya prefix'i yanlis. Bu yanlis-iddia degil, **yanlis-kaynak**; okuyucu kaniti `data` skill'inde dogrulayamaz → kanit-zinciri kirik → **med dogru severity.**
- **Skill-ref:** `soroban/SKILL.md:2296-2326` (Pitfall #8), `soroban/SKILL.md:2578` (op_no_trust), `soroban/SKILL.md:2580` (op_low_reserve). `data/SKILL.md` yalniz 546 satir.
- **Fix:** Bes atfi `data/SKILL.md:…` → `soroban/SKILL.md:…` olarak duzelt (satir numaralari aynen kalir; finding'in onerebilecegi "soroban:2300-2330 civari" GEREKSIZ, tam satirlar zaten eslesir). §8 kapanis tablosundaki (03:420, 03:425) `data:2578`/`data:2580` rozetlerini `soroban:2578`/`soroban:2580` yap. **Hizalama notu:** Doc 07:432 ayni konuyu zaten DOGRU yapiyor (op_low_reserve → `soroban/SKILL.md:2287` "Minimum ~1 XLM for base reserve" + reserve'i assets skill'e atif); Doc 03 onunla hizalanmali.

---

### MED-2 — Yanlis skill-attribution: C-address SAC trustline-kacisi `assets:330-333`'e atfedilmis ama o satirlar konuyu vermiyor

- **Dokuman:** `03-stellar-soroban-deep.md` (§1.1.4 satir 61, §3-madde-1 satir 183-184, §8 tablo satir 422), `04-standards-sep-alignment.md` (§5.3 satir 323-324), `05-economics-cost-model.md` (§5 satir 214)
- **Problem (DOGRULANDI):** "C… smart-wallet alici klasik asset icin trustline gerektirmez cunku SAC bakiyeyi kontrat storage'inda tutar" iddiasi `assets/SKILL.md:259-261, 330-333` ile teyitli gosteriliyor. Dogrulama: `assets:330-333` = yalnizca "Use SAC When" karar-maddeleri (DeFi protocols / classic↔smart bridge); kontrat-storage'da bakiye veya C-address trustline-kacisindan HIC bahsetmez. `assets:259-261` = yalnizca "SAC provides Soroban interface for Stellar Assets". assets skill'de tek C… icerigi satir 418-420 (SEP-45 web-auth, konuyla ilgisiz). Iddianin teknik SONUCU gercekte DOGRU (SAC, contract-address bakiyesini classic trustline yerine contract storage'da tutar — **CAP-0046 protokol davranisi**), ANCAK skill bu iddiayi VERMIYOR; "skill-dogrulandi" sinifi yanlis kullanilmis.
- **Skill-ref:** `assets/SKILL.md:330-333` (Use SAC When kararlari), `:259-261` (SAC tanimi), `:418-420` (SEP-45, ilgisiz).
- **Fix:** `assets:330-333` ve `assets:259-261` citation'larini bu iddiadan KALDIR. Iddiayi **"dogrulanmali" (CAP-0046 SAC spec / Stellar docs)** sinifina tasi VEYA "skill-disi-ama-dogru protokol davranisi" olarak acikca etiketle. Maddenin mekanik dogrulugu korunur; yalniz yanlis skill-attribution duzeltilir.

---

### LOW-1 — Root string format celiskisi: 02 §6 "0x'siz" tanimliyor, 08 §5 Secenek A 0x-zorunlu `HEX_32`'yi uyguluyor

- **Dokuman:** `02-contract-spec.md` §6 (satir 699, 716-717) + `08-operations-runbook.md` §5 Secenek A (satir 254-255)
- **Problem (DOGRULANDI):** pin-proxy `HEX_32` regex'i (`web/apps/pin-proxy/src/index.ts:59` → `/^0x[0-9a-fA-F]{64}$/`) `0x` prefix'i ZORUNLU kilar. 02 §6 airdrop claim-list `root`'unu acikca "0x'siz" 64-hex tanimlar (satir 699 yorumu + 716-717 netlestirme). 08 §5 Secenek A taslak validatoru mevcut `HEX_32`'yi airdrop `root` alanina uygular (satir 255) → 0x'siz root `missing_or_invalid_root` ile REDDEDILIR. Ayrica mevcut core `merkleRoot`'un 0x-prefix'li oldugu gercegiyle de ayrisir (iki sema prefix konvansiyonunda farkli).
- **Neden CANLI BUG DEGIL (low):** (a) yeni airdrop yuzeyi repoda henuz YOK; (b) celiski yalniz 08'in NON-tercih edilen Secenek A'sinda; (c) 08 zaten **Secenek B'yi** (ayri `/pin-airdrop` route + kendi `buildAirdropPinAuthMessage`/validatoru, satir 273-290) ONERIR ve bu celiskiyi by-pass eder; (d) 08, Secenek A'nin `validatePinAuth` riskini ayrica satir 266-271'de uyarir. Tasarim-ici format tutarsizligi → **low dogru.**
- **Skill-ref:** `soroban/SKILL.md:1556-1583` (#5 Storage Key Collisions — format-tutarlilik prensibi), `soroban/SKILL.md:1751` "Don't trust client-side validation alone".
- **Fix:** 02 §6 ve 08 §5 (+ uygulanacak yeni airdrop validator regex'i) icin TEK kanonik root string formati sec (0x-prefix'li VEYA prefix'siz) ve her iki dokumanda + yeni `buildAirdropPinAuthMessage`/validatorde aynen kullan. Secenek B secilse bile yeni validatoru, 02 §6 root formatiyla bit-bit eslesen **paylasilan test-vektoru** ile pinle.

---

### LOW-2 — Over-hedge: SAC-transfer-trustlinesiz hata yuzeyi "dogrulanmali" birakilmis ama agentic-payments skill'i zaten cevabi veriyor

- **Dokuman:** `03-stellar-soroban-deep.md` §1.1.3 (satir 54-59 "Acik kalan dar nokta — dogrulanmali"), §8 tablo (satir 420 son hucre)
- **Problem (DOGRULANDI):** Doc, SAC `transfer` trustline yokken cagrildiginda Soroban yuzeyinde `op_no_trust` mu yoksa contract-trap/`Error(Contract,#...)` mi dondurdugunu "testnet'te dogrulanmali" birakmis. Ancak Doc'un kendi onsozu (satir 9) agentic-payments skill'ini dayanak sayar ve `agentic-payments/SKILL.md:223` ("Without a trustline ... the SAC transfer settles into nothing and the request fails with op_no_trust"), `:345` ("Symptom: op_no_trust error during settlement"), `:353-354` zaten AUTHORITATIVE cevabi veriyor. Doc mevcut citation'i kacirmis + gereksiz hedge yapmis. (Kalinti gecerlilik: hedge ozellikle **simulate-time tam ScVal temsiline** dair minik bir kalinti tasir — skill submit/settlement yuzeyini soyler, sim-time ScVal'i degil.)
- **Skill-ref:** `agentic-payments/SKILL.md:223, 345, 353-354`.
- **Fix:** `agentic-payments/SKILL.md:223` (+345/353-354) citation'ini ekle; hedge'i "mekanik+settlement-yuzeyi skill-teyitli; yalniz simulate-time tam ScVal temsili sim ile teyit edilecek" olarak yumusat.

---

### LOW-3 — Doc 07:446 mevcut hashing'i "duz keccak256" gosteriyor; repo BN254-scalar indirgemesi yapiyor

- **Dokuman:** `07-ui-ux.md` (satir 446)
- **Problem (DOGRULANDI):** Doc 07:446 mevcut hashing'i "`factory::recipient_id` = `keccak256(address.to_xdr)`" (`factory/src/lib.rs:118-120`) olarak ozetliyor; ama repo gercegi `contracts/soroban/zarf/factory/src/lib.rs:118-122` → satir 119 `recipient.to_xdr(&env)`, satir 120 `keccak256(...).to_bytes()`, **satir 121 `BnScalar::from_bytes(digest).to_bytes()` (BN254-scalar indirgemesi).** Doc 07 hem "118-120" cite ederek satir 121'i kapsam disi birakiyor hem de "duz keccak256" izlenimi veriyor. Doc 10:690-693 ayni ayrimi DOGRU yapiyor (airdrop leaf'i ham keccak; BN254 indirgemesi "airdrop'a miras gecmez") → iki dokuman arasi kucuk tutarsizlik. Stellar/dapp skill alanini etkilemez → **low dogru.**
- **Skill-ref:** N/A (skill-uyumu degil, repo-sadakat nuansi); repo `factory/src/lib.rs:118-122`.
- **Fix:** 07:446'yi "recipient_id = `BnScalar(keccak256(to_xdr))` — BN254 scalar indirgemeli" bicimine duzelt (araligi 118-122'ye genislet) veya Doc 10:690-693'teki dogru ayrima referans ver; airdrop leaf'inin bu indirgemeyi **DEVRALMADIGINI** (duz keccak) acikca koru.

---

### LOW-4 — Kardes dokumana (`airdrop-tool-design.md`) verilen satir-citation'lari sistematik olarak kaymis

- **Dokuman:** `04-standards-sep-alignment.md` (§2.1 satir 86-87 / airdrop-tool-design.md:262, §3.1 satir 158 / :494,:504, ve `airdrop-tool-design.md`'ye yapilan TUM satir citation'lari)
- **Problem (DOGRULANDI ve KAPSAM GENISLEDI):** Doc 04, kardes plana (`airdrop-tool-design.md`, artik **618 satir**) verdigi satir referanslari kaymis — kardes doc, doc 04 yazildiktan sonra buyutulmus. Spot-check: (1) "kontrat sadece bir `token: Address` tutar" gercekte :321'de (doc 04 :262 diyor; :262 MuxedAddress/leaf-hash notu); (2) claim linki `claim-drop.zarf.to/?a=&cid=` :553'te (doc 04 :494/:504 diyor; wizard satirlari); (3) `transfer(owner,instance,total)` metni :302'de (doc 04 :243 diyor; :243 `withdraw_unclaimed` imzasi); (4) Uniswap/disperse :15 → :15 artik "7 derin-aci dokumani" basligi; (5) "alici fee oder" :24 → :24 alakasiz madde. Sapma sistematik. **KRITIK NOT:** TUM otoriter kontrat-kaynak (factory/vesting/Cargo.toml) ve TUM skill (standards+assets SKILL.md) citation'lari satir-bazinda DOGRU — sapma yalniz akiskan kardes plana atifta.
- **Skill-ref:** `standards/SKILL.md:112` (Step 3: kaynak repoda durumu dogrula — citation-dogrulugu ilkesi).
- **Fix:** `airdrop-tool-design.md`'ye yapilan tum satir referanslarini mevcut dosyaya gore yeniden dogrula (token:Address → :321, claim link → :553, transfer(owner,instance,total) → :302, MerkleDistributor/disperse, alici-oder). **Tercihen** akiskan kardes dokumana satir-numarasi yerine bolum-basligi (§) ile atif yap; satir citation'larini yalniz degismeyen otoriter kaynaklar (kontrat src, SKILL.md) icin sakla.

---

## 3. Refute Edilen (False-Positive) Onemli Bulgular

> Bu adaylar adversarial olarak incelendi ve **bulgu DEGIL** olarak elendi:

- **Ag-/piyasa-bagli sayisal degerler "dogrulanmali" isaretli — bulgu DEGIL.** Per-claim fee (~0.01-0.03 XLM), trustline reserve (~0.5 XLM), base reserve (~1 XLM / 0.5 XLM/subentry), ~180-gun TTL tavani, ~5sn close-time, base fee 100 stroop, ~100 footprint-entry cap — dokumanlar (01 §0/§4.14, 02 §1.1/§8, 03 §8, 05 tum, 06 §8.4/§9.3, 07 §7, 08 §4/§8/§11, 10 §8) bunlari acikca **"dogrulanmali"** veya canonical Stellar fee/reserve dokuman linkiyle (05 §Kaynaklar: CAP-0046-07) isaretliyor. Skill bu degerleri kesin vermez. **Gorev kuralina gore DOGRU davranis.**
- **"UsedRoot/MerkleRootAlreadyUsed eksik" — bulgu DEGIL.** factory:62-66 + :382-407 (`reserve_merkle_root`) proof'un (merkle_root, audience_hash)'e bagli ama kontrat adresine bagli OLMAMASINDAN dogan **ZK-ozel** ihtiyactir. Airdrop'ta ZK proof yok; her instance kendi kokune+bitmap'ine+fonuna sahip (INV-7). 02 §2.6/01 §2/06 §4 kaldirmayi dogru gerekcelendiriyor.
- **"leaf'te BN254 skalar indirgemesi eksik" — bulgu DEGIL.** factory:118-122 ve vesting:521-525 keccak ciktisini `BnScalar`'a indirger; **yalniz ZK devresine baglanmak icin.** Airdrop yapragi duz keccak256 kullanip indirgemeyi atlar — 01 §0.2/§4.2, 02 §5, 04 §6.3, 06 §5(M1) bunu DOGRU tespit ediyor.
- **"deployer API yanlis (with_address)" — bulgu DEGIL.** Dokumanlar (02 §2.5 DUZELTME, 08 §3, 01 §3.6) skill ornegindeki `with_address` formunun repoda OLMADIGINI belirtip `with_current_contract(salt).deploy_v2` ile duzeltiyor — factory:316-332, predict:124-129 ile dogrulandi.
- **"data_format=single-value Claimed'de iki data alaniyla celisir" — bulgu DEGIL.** Dokumanin KENDISI bunu tespit edip "derleme aninda dogrulanmali" diyor (02 §3.4 satir 431-439). Kendi-farkinda.
- **MuxedAddress payout deseni — bulgu DEGIL, dogru tasinmis.** vesting:380-381 `let to: MuxedAddress = (&recipient).into();` + base-balance guard (:383-397) dogrulandi. 02 §3.6, 01 §4.13/INV-11, 06 §14/C11 dogru ele aliyor.
- **SEP iddialari — bulgu DEGIL.** SEP-41=Soroban token interface (standards:46,769 + assets:303-312), claim-link=duz-web-link / SEP-7=opsiyonel-deeplink, SEP-46/48 Active (standards:771/772), SEP-45 Draft (:770, v1 disi) — hepsi skill ile tutarli.
- **standards merkle-distribution referansi — bulgu DEGIL.** `standards/SKILL.md:443` gercekten "merkle distribution" iceriyor; modelin Stellar'da kanonik desen oldugu iddiasi yerinde.
- **Doc 10 (Data alani) — SIFIR issue.** getLatestLedger timestamp DONDURMEZ (data:85-87), getEvents cursor/ledger/txHash skill'de YOK → "SDK'ya karsi dogrulanmali" dogru epistemik, 7-gun getEvents penceresi load-bearing tespiti dogru, getLedgerEntries+popcount alternatifi (data:90-108 + index.ts:809-850) tutarli. Adversarial kontrol yanlis-iddia/anti-pattern/kacirilmis-best-practice bulamadi.

---

## 4. Guclu Yanlar (Dokumanlarin Skill'i Dogru Uyguladigi Yerler)

1. **Repo satir-atiflari olaganustu hassas.** Cite edilen tum kontrat/pin-proxy satirlari gercek koda karsi tek tek dogrulandi ve eslesti: factory `transfer_from`+`checked_add` guard (:206-221), `owner_bound_salt` keccak (:460-464), `with_current_contract(salt).deploy_v2` (:316-332), UsedRoot/`reserve_merkle_root` (:62-66, :382-407), `MAX_PAGE_LIMIT=80` (:27), `range_infos` InvalidLimit (:509-511); vesting set-claimed-before-transfer (:364-366), proof-fail rollback (:368-373), MuxedAddress payout (:380-381), cift-yonlu balance guard (:378-397), transfer-mismatch rollback (:393-396), `recipient_field` BN254 (:521-525), `__constructor` Result (:131-158), TTL re-extend (:399-404); pin-proxy `validateClaimList`/`validatePinAuth`/`buildPinAuthMessage`/`HEX_32` (index.ts:236-253, 260-310, 312-325, 59). **Hicbir uydurma cite yok.**

2. **Skill basitlestirilmis ornekleriyle repo gercegi celistiginde dokumanlar REPO'yu izleyip farki acikca gerekceliyor:** `with_current_contract` vs skill `with_address`; soroban-sdk 26.0.0-rc.1 vs skill 25.0.1; `[cdylib,rlib]` vs skill `[lib,cdylib]`. Otoriter rehberin **repo+skill kesisimi** oldugu dogru yorumlanmis.

3. **Fonlama modeli skill ile birebir hizali.** Allowance-pull `transfer_from` + owner'in factory'ye once `approve` vermesi → skill #1/#3 (`soroban/SKILL.md:1415-1437, 1480-1516`) ve `create_and_fund_vesting` (factory:206-221) ile birebir. 01/06/08 ana plandaki yanlis "duz transfer" modelini duzeltip allowance adimini ayri saldiri/operasyon yuzeyi olarak ele aliyor.

4. **Set-claimed-before-transfer + ACIK rollback invariant'i** (skill "No Classical Reentrancy" `soroban/SKILL.md:1405-1406` + checks-effects-interactions). 01 §4.1, 02 §3.6, 06 C2/C9/T5, 08 §0-A.2 hepsi sessiz atomik-revert'e guvenmiyor; bit'i transfer'dan ONCE set + fail'de geri yaz — vesting:364-397 ile satir-satir esleser.

5. **Tum guvenlik vuln siniflari skill ile tam ortusuyor:** reinit (yalniz `__constructor` → `:1443-1475`), overflow (`checked_*` + `overflow-checks=true` → `:1520-1552`), storage-key collision (typed DataKey → `:1556-1583`), arbitrary-contract-call (`:1480-1516`), TTL/archival (liveness-only restore → `:1618-1644`), missing-auth (`require_auth` ilk satir → `:1415-1437`), upgrade (instance immutable, `update_current_contract_wasm` yok → Scout tetiklenmez → `:1905-1908`).

6. **Issuer-flag gate matrisi skill ile birebir + DOGRU cite:** 03 §1.2 / 04 §7 / 05 §5 tablolari (AUTH_REQUIRED=REDDET, AUTH_REVOCABLE=UYAR, AUTH_CLAWBACK_ENABLED=UYAR, AUTH_IMMUTABLE=bilgilendir) `assets/SKILL.md:174-179` flag tablosu + `soroban/SKILL.md:1692-1705` (Clawback Awareness) ile kelime-kelime esleser. Focus-area'nin en saglam bolumu.

7. **Trustline mekanigi dogru modellenmis:** native XLM trustline gerektirmez, klasik asset gerektirir, SAC transfer otomatik `changeTrust` YAPMAZ, trustline yoksa transfer basarisiz (`assets:42-44`, `:225-239`). Token-tipine gore alici-surtunmesi (native/SEP-41 trustline yok, klasik G… trustline+reserve) dogru.

8. **dApp claim akisi disiplinli:** zorunlu simulate→`assembleTransaction` (`dapp/SKILL.md:288-303` + `soroban/SKILL.md:2380-2393` Pitfall #10), network passphrase (`soroban:2244-2253`, Pitfall #12 `:2433-2456`), Wallets Kit `allowAllModules()`/`kit.signTransaction` (`dapp:188-230`). Standart "link→claim app→cuzdan bagla→claim" modeli gorev baglamiyla uyumlu.

9. **Data/indexer modeli saglam:** getLatestLedger timestamp dondurmez tespiti (data:85-87 + index.ts:864-867), 7-gun getEvents penceresi load-bearing (data:174-179), getLedgerEntries+client-popcount alternatifi (data:90-108 + readClaimedFlags index.ts:809-850), simulate view-okuma (data:110-121 + index.ts:907-929), Hubble/Mercury historical-data yonlendirmesi (data:391-426). sec0 adversarial-dogrulama bolumu bir denetcinin arayacagi 5 skill-celiskisini onceden tespit edip duzeltmis.

10. **Test matrisi skill Part-2 piramidini eksiksiz oruyor** (`soroban:607-612, 1151-1354`); mutation hedefleri (now>deadline→>=, set_claimed silme, guard-rollback silme, require_auth silme, MuxedAddress→duz Address) gercek koddaki kritik satirlara denk; Rust↔JS differential Merkle vektoru "tek-noktadan-kirilma" invariant'i olarak dogru one cikarilmis.

11. **08 ops-runbook "repo-gercegi vs onerilen yuzey" ayrimini bagdacli kiliyor:** §0-A dogrulanmis / §0-B onerilen; `withdraw_unclaimed`/`deadline`/`locked`/`config`'i "repoda YOK, onerilen" isaretlemis; TTL dirilttmede "read yolu extend ETMEZ, tek kesin yol `ExtendFootprintTTLOp`" uyarisi repo (yalniz claim re-extend, vesting:399-404) ile birebir dogru.

12. **Fee-bump/sponsored mod dogru cerceveli:** OZ Relayer (`dapp:643-664`), x402 auth-entry deseni (`agentic-payments:62` "Clients need zero XLM") — varsayilani (alici-oder) DEGISTIRMEDEN opsiyonel v1.1/v2 onerisi olarak konumlanmis.

---

## 5. Dokuman-Bazli Duzeltme Listesi

| Dokuman | Ne degisecek | Bulgu | Oncelik |
|---------|--------------|:-----:|:-------:|
| **03-stellar-soroban-deep.md** | §1.1.3 (50-53), §4 (218-219), §8 tablo (420, 425): `data/SKILL.md:2296-2326/2578/2580` → **`soroban/SKILL.md:`** (satir-no aynen kalir). Doc 07:432 ile hizala. | MED-1 | Yuksek |
| **03 / 04 / 05** | C-address SAC trustline-kacisi iddiasinda `assets:330-333` ve `:259-261` citation'larini KALDIR; "dogrulanmali (CAP-0046)" sinifina tasi. (03 §1.1.4/§3-m1/§8t422, 04 §5.3, 05 §5) | MED-2 | Yuksek |
| **02-contract-spec.md** + **08-operations-runbook.md** | Tek kanonik root string formati sec (0x'li/0x'siz) ve 02 §6 (699,716-717) + 08 §5 + yeni airdrop validator regex'inde aynen kullan; Secenek B validatorunu paylasilan test-vektoru ile pinle. | LOW-1 | Orta |
| **03-stellar-soroban-deep.md** | §1.1.3 (54-59) hedge'ine `agentic-payments/SKILL.md:223` (+345/353-354) citation'ini ekle; hedge'i yalniz "simulate-time ScVal temsili"ne daralt. | LOW-2 | Dusuk |
| **07-ui-ux.md** | 07:446 → "recipient_id = `BnScalar(keccak256(to_xdr))` (BN254 indirgemeli)", aralik 118-122; airdrop leaf'in indirgemeyi DEVRALMADIGINI koru (Doc 10:690-693'e referans). | LOW-3 | Dusuk |
| **04-standards-sep-alignment.md** | `airdrop-tool-design.md`'ye (618 satir) tum satir-citation'larini yeniden dogrula (token:Address→:321, claim-link→:553, transfer(owner,instance,total)→:302, :15/:24/:243). Akiskan kardes dokumana § ile atif yap. | LOW-4 | Dusuk |
| **10-indexer-data-model.md** | Degisiklik gerekmez — **uyumlu** (sifir issue). | — | — |
| **01-threat-model-security.md** | Degisiklik gerekmez — tum invariant/citation dogrulandi. | — | — |
| **06-testing-verification.md** | Degisiklik gerekmez — test matrisi/mutation hedefleri dogrulandi. | — | — |

---

### Kapanis Hukmu

**Verdict: UYUMLU (cogunlukla-uyumlu).** Dort cekirdek kontrat-dokumani (01/02/06/08) "uyumlu", uc Stellar-yuzey dokumani (03/04/05) ve dApp/indexer dokumanlari (07/10) "cogunlukla-uyumlu"dur. Toplam 7 onaylanan bulgunun tamami citation-rotasyon (3 med — yanlis dosya prefix'i / yanlis skill-attribution / kaymis satir-no) veya tasarim-ici format/repo-sadakat nuansi (4 low) kalitesindedir. **Hicbiri yanlis teknik iddia, anti-pattern, kacirilmis kritik best-practice veya kilitli-karar degisikligi DEGILDIR; implementasyon-oncesi citation duzeltmeleri yeterlidir.** Skill'in vermedigi sayisal degerlerin "dogrulanmali" isaretlenmesi gorev kuralina gore dogru davranistir. Uydurma citation tespit edilmemistir.

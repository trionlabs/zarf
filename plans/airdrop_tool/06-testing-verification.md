# Zarf Airdrop Aracı — Test & Doğrulama Stratejisi

> Hedef: `zarf/airdrop` (MerkleAirdrop instance) + `zarf/airdrop-factory` (AirdropFactory)
> iki yeni bağımsız crate'i ve `@zarf/core/lib/merkle` + iki yeni SvelteKit app'i için
> **uçtan-uca, implementation-grade** test matrisi. Soroban skill Part 2'nin test piramidine
> (`unit → local → testnet → mainnet smoke`, `SKILL.md:607-612`) ve mevcut repo test desenlerine
> (`contracts/soroban/zarf/factory/tests/factory.rs`, `.../vesting/tests/vesting.rs`,
> `web/packages/core/lib/domain/claimListBuilder.test.ts`) **birebir** yaslanır.
> En kritik tek invariant: **paylaşılan Rust↔JS Merkle vektörleri** — kontrat ile web aynı
> `(index, address, amount) → leaf → root`'u üretmezse her claim sessizce kırılır.
> Mevcut verifier/registry/vesting/factory/circuit testlerine **dokunulmaz** (risk izolasyonu).
> DURUM: tasarım; ilgili ana plan `plans/airdrop_tool/airdrop-tool-design.md` §11.

> **Reviewer notu (repo'ya karşı doğrulandı):** Bu doküman, taslaktaki üç hatalı çekirdek
> iddiayı düzeltir: (1) fonlama **allowance + `transfer_from`** ile yapılır (doğrudan `transfer`
> değil — `create_and_fund_vesting` içinde `factory/src/lib.rs:206-221`); (2) instance `claim`
> **per-claim `TokenTransferMismatch` guard'ı taşır** (yoktur değil — `vesting/src/lib.rs:378-397`);
> (3) çift-claim koruması yalnız tx-atomikliğine bırakılmaz, claim-guard fail yolunda **açıkça geri
> yazılır** (`vesting/src/lib.rs:368-373, 393-396`). Detay §13. Ek olarak bu sürüm iki yeni bölümle
> genişletildi: **§14 MuxedAddress claimant test-vektörleri** (leaf base-address ile çözülürken
> payout `MuxedAddress`'e gider — `vesting/src/lib.rs:380-381`) ve **§15 paylaşılan differential
> Rust↔JS vektör setinin tam konumu/şeması/üretimi** ([09-merkle-data-contract] ile tek-normatif
> çapraz-referans).

> **Terminoloji uyarısı (yeni-crate hata kodları):** Aşağıdaki `InvalidIndex`, `Expired`,
> `NotYetWithdrawable`, `NothingToWithdraw`, `InvalidDeadline` hata kodları **henüz repoda yok** —
> airdrop crate'i için **önerilen** `#[contracterror]` varyantlarıdır. Repoda mevcut ve doğrulanmış
> kodlar yalnızca: vesting `{InvalidProof, InvalidMerkleRoot, InvalidRecipient, AlreadyClaimed,
> TokenTransferMismatch, TooManyCommitments, …}` (`vesting/src/lib.rs:49-66`) ve factory
> `{NotInitialized, InvalidRecipientCount, InvalidAmount, InvalidLimit, InvalidMerkleRoot,
> InvalidAudience, TokenTransferMismatch, MerkleRootAlreadyUsed}` (`factory/src/lib.rs:35-44`).
> Airdrop crate'i bu konvansiyonu (typed `#[contracterror]` + `Result`, `unwrap`/`panic` yok —
> CLAUDE.md "Conventions") miras alır; yeni kodlar bu desende eklenir.

---

## 1. Test piramidi & araç envanteri

Soroban skill Part 2 piramidini (`SKILL.md` "Testing Pyramid", satır 607-612) aynen
benimsiyoruz; her katmanın bu üründeki karşılığı:

| Katman | Araç | Bu üründe ne | Çalıştırma |
|---|---|---|---|
| Unit (native Rust) | `soroban-sdk` testutils, `Env::default()` | claim/withdraw/bitmap/factory mantığı | `cargo test --manifest-path contracts/soroban/zarf/airdrop/Cargo.toml` |
| Differential (Rust↔JS) | paylaşılan JSON vektör seti | leaf/root byte-eşitliği | her iki suite vektörü tüketir |
| Property | `proptest` + `SorobanArbitrary` | `Σclaim ≤ funded`, idempotent claim | `cargo test` içinde |
| Fuzz | `cargo-fuzz` (nightly) | rastgele `(index, amount, proof)` → panik yok | `cargo +nightly fuzz run` |
| Differential snapshot | `test_snapshots/` (otomatik JSON) | olay/ledger durumu drift'i | `cargo test` yazıp commit |
| Fork | `Env::from_ledger_snapshot_file` | gerçek testnet/mainnet state | manuel/CI-opsiyonel |
| Mutation | `cargo-mutants` | test kalitesi (guard'lar yakalanıyor mu) | `cargo mutants` |
| Resource | `stellar contract invoke --sim-only` | CPU/ledger/byte profili | testnet |
| Web unit | `vitest` | merkle lib, claim-list builder, state machine | `pnpm --dir web -r --if-present test` |
| Formal (aday) | Komet / Certora Sunbeam | claim invariantları | audit fazı (§11) |

**SDK referansı (repo'ya karşı doğrulandı):** vesting/factory ile aynı
`soroban-sdk = "26.0.0-rc.1"`, `default-features = false`, `features = ["alloc"]`; dev'de
ek `"testutils"` — bkz. `contracts/soroban/zarf/vesting/Cargo.toml` ve
`.../factory/Cargo.toml` (her ikisi de bu satırlarla birebir doğrulandı). Hedef `wasm32v1-none`.
Mevcut crate'lerin `[lib]` tipi `crate-type = ["cdylib", "rlib"]`.

> **Düzeltme (taslak hatası):** Fuzz/property için skill `[lib] crate-type = ["lib","cdylib"]`
> öneriyor (`SKILL.md:1169`); repo `["cdylib","rlib"]` kullanıyor. `cargo-fuzz`/`proptest`'in
> instance'ı native register edebilmesi için crate'in `rlib` (veya `lib`) tarafı zaten gerekli —
> repo `rlib` ile bunu sağlıyor; airdrop crate'i de `["cdylib","rlib"]` ile başlamalı, fuzz
> harness'ı `rlib` tarafını import eder. `lib`'e geçmeye gerek yok. (Skill'in fuzz örneği
> `soroban-sdk = "25.0.1"` + sadece `features=["testutils"]` kullanır; airdrop repo-hizalı
> sürümü `26.0.0-rc.1` + `default-features=false, features=["alloc","testutils"]` ile kurar — §7.)

Test fixture'ları için `env.register_stellar_asset_contract_v2(admin)` ve
`token::StellarAssetClient` (mint/approve) / `token::TokenClient` (balance/transfer) kullanılır
(mevcut desen: `factory/tests/factory.rs:53` SAC register, `:247-250` mint+approve).

---

## 2. Instance kontratı (`zarf/airdrop`) — unit test matrisi

Hedef dosya: `contracts/soroban/zarf/airdrop/tests/airdrop.rs`. Ortak kurulum, mevcut
`factory.rs:39-63` `setup()` desenini taklit eden bir yardımcı (`tests/common/mod.rs`,
skill `SKILL.md:1126-1149`):

```rust
fn setup(env: &Env) -> (MerkleAirdropClient, Address /*token_id*/, Address /*admin*/) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    // factory.rs:53 deseni — SAC v2 register, admin = SAC yöneticisi (mint yetkisi)
    let token_asset = env.register_stellar_asset_contract_v2(admin.clone());
    let token_id = token_asset.address();
    let token_admin = token::StellarAssetClient::new(env, &token_id);

    // ağaç: tree.rs paylaşılan vektörlerden (§5/§15) root + claims
    let id = env.register(MerkleAirdrop, (admin.clone(), token_id.clone(),
        VEC.root, /*total*/ 84_200_i128, /*deadline*/ 0_u64, /*locked*/ false));
    // instance'ı doğrudan fonla (factory testten ayrı — burada instance'ı izole sınarız)
    token_admin.mint(&id, &84_200);
    (MerkleAirdropClient::new(env, &id), token_id, admin)
}
```

> **Fonlama notu:** Instance unit testlerinde fonu doğrudan `StellarAssetClient::mint(&id, …)`
> ile basmak en sade yoldur (factory'nin allowance akışını tekrarlamadan). Allowance +
> `transfer_from` akışı **factory** testinde (§4) sınanır; orası `create_airdrop`'un fonlama
> sözleşmesini test eder.

### 2.1 Claim happy/sad matrisi

Her satır bir `#[test]`. Hata yolu mutlaka `try_claim(...)` + tipli `Err` eşleşmesi
ile (mevcut `vesting.rs:760-763, 778-782` deseni — `assert_vesting_error(...)` /
`assert!(result.is_err())`); panik beklemiyoruz.

| # | Test | Senaryo | Beklenen | Doğrulama |
|---|---|---|---|---|
| C1 | `claim_happy_path` | geçerli `(index, addr, amount, proof)` | `Ok(())`; `token.balance(addr)==amount`; `is_claimed(index)==true` | bakiye + bitmap + `Claimed` olayı |
| C2 | `double_claim_rejected` | C1 sonrası aynı index | `Err(AlreadyClaimed)` | ikinci tx bakiyeyi değiştirmez; bitmap hâlâ `true` (`vesting.rs:747` `second_claim_is_rejected_without_double_transfer` deseni; assert seti `:764-766`) |
| C3 | `bad_proof_rejected` | proof'un bir node'u bozuk | `Err(InvalidProof)` | transfer olmaz, bitmap `false` kalır |
| C4 | `wrong_amount_rejected` | doğru index, yanlış amount | `Err(InvalidProof)` | leaf değişir → root tutmaz |
| C5 | `wrong_index_rejected` | başka birinin index'i + kendi adresi | `Err(InvalidProof)` | leaf-binding |
| C6 | `index_out_of_range_rejected` | `index >= recipient_count` (bitmap word yok) | `Err(InvalidIndex)`¹ | overflow/sınır guard |
| C7 | `expired_claim_rejected` | `deadline>0` ve `now>deadline` | `Err(Expired)`¹ | `env.ledger().with_mut(\|l\| l.timestamp = …)` (`vesting.rs:789-790` deseni) |
| C8 | `claim_at_deadline_boundary` | `now == deadline` (sınır: kapanma `>` katı) | `Ok(())` | off-by-one kapanır |
| C9 | `claim_unfunded_instance_rolls_back_guard` | instance bakiyesi < amount | `Err(TokenTransferMismatch)` veya SAC fail; **`is_claimed(index)==false`** | `vesting.rs:770` `insufficient_balance_claim_rolls_back_claim_guard` birebir karşılığı (assert `:780-782`) — guard açıkça geri yazılır |
| C10 | `claim_requires_claimant_auth` | `mock_all_auths` YOK, sadece `claimant` auth | yalnız doğru claimant imzasıyla `Ok`; başka adresle `Err`/auth-panic | `env.mock_auths(&[MockAuth{…}])` (skill `SKILL.md:686-707`, `factory.rs:623` deseni) |
| C11 | `claim_muxed_claimant_resolves_to_base` | claimant muxed `M…` (base `G…`) | `Ok(())`; **leaf base-`G…` ile çözülür**, payout muxed `M…`'e gider, guard base-`G…`'de | §14 — `vesting/src/lib.rs:380-381` MuxedAddress deseni |

¹ Yeni airdrop hata kodu (repoda yok; bkz. üstteki Terminoloji uyarısı).

Zaman kontrolü için skill `SKILL.md:712-735` (`set_timestamp` + before/after); repo deseni
`env.ledger().with_mut(\|ledger\| ledger.timestamp = …)` (`vesting.rs:789-790`).

> **Sıralama & rollback invariantı (C2/C9 birlikte — repo deseniyle hizalandı):**
> Mevcut vesting `claim` çift-claim'i **yalnız tx-atomikliğine bırakmaz**: claim-guard'ı
> transfer'den önce `true` yazar (`vesting/src/lib.rs:364-366`), ama proof/transfer fail yolunda
> guard'ı **açıkça `false`'a geri yazar** (`:368-373` proof-fail, `:393-396` transfer-mismatch).
> Airdrop instance'ı aynı deseni izlemeli: `set_claimed(index)` → transfer → uyuşmazlıkta
> `unset_claimed(index)` + `Err(TokenTransferMismatch)`. C9 bu yüzden iki şeyi birden assert eder:
> `result.is_err()` **ve** `is_claimed(index)==false` (`vesting.rs:780-782` deseni). Bu, "claimed
> kalıp fon gitmeyen" hayalet durumun olmadığını **explicit rollback ile** kanıtlar —
> sessiz atomik-revert varsayımına güvenmez.

### 2.2 `withdraw_unclaimed` matrisi (locked × deadline = 4 kombinasyon + yetki)

Plan §4.4 tablosunu birebir testlere çeviriyoruz. `now` = `env.ledger().timestamp()`,
`T` = deadline. Kural (plan §4.4): `locked && (deadline == 0 || now <= deadline)` ⇒
`NotYetWithdrawable`; aksi halde izinli. (`withdraw_unclaimed`/`NotYetWithdrawable`/`NothingToWithdraw`
**airdrop'a özgü, repoda yok** — vesting custody'yi çekmek yerine deposit/claim ekseninde modeller;
bu matris plan §4.4 spesifikasyonunu test eder, mevcut bir repo fonksiyonunu değil.)

| # | Test | `locked` | `deadline` | `now` vs T | Beklenen |
|---|---|---|---|---|---|
| W1 | `withdraw_unlocked_anytime` | `false` | herhangi | — | `Ok` (her an) |
| W2 | `withdraw_locked_before_deadline_blocked` | `true` | `T>0` | `now <= T` | `Err(NotYetWithdrawable)` |
| W3 | `withdraw_locked_after_deadline_ok` | `true` | `T>0` | `now > T` | `Ok` |
| W4 | `withdraw_trustless_lock_always_blocked` | `true` | `0` | — | `Err(NotYetWithdrawable)` (süresiz kilit) |
| W5 | `withdraw_flexible_unlocked_with_deadline` | `false` | `T>0` | `now > T` | `Ok` (claim kapalı, fon toplanır) |
| W6 | `withdraw_unauthorized_rejected` | herhangi | herhangi | — | yetkisiz `Address` → auth fail; `mock_auths` ile sadece admin imzası (`factory.rs:623` deseni) |
| W7 | `withdraw_nothing_to_withdraw` | `false` | `0` | bakiye 0 | `Err(NothingToWithdraw)` |
| W8 | `withdraw_after_partial_claims` | `true` | `T>0` | `now > T` | kalan = `total − Σclaimed`; `Withdrawn` olayı doğru `amount` |

W2/W4 sınır testi: `now == T` tam üzerinde **`NotYetWithdrawable`** (`now <= T` kuralı),
`now == T+1`'de `Ok`. Boundary off-by-one'ı her iki yönden pinler.

### 2.3 Token-transfer guard & token tipleri

> **Düzeltme (taslak hatası):** Taslak "Instance seviyesinde mismatch guard'ı yoktur" diyordu.
> Bu YANLIŞ: mevcut vesting instance `claim`'i transfer sonrası **hem kontrat hem alıcı**
> bakiyesini `checked_sub`/`checked_add` ile doğrular ve uyuşmazlıkta `TokenTransferMismatch`
> döndürür (`vesting/src/lib.rs:378-397`). Airdrop instance `claim`'i bu **per-claim guard'ı
> taşımalı** — fee-on-transfer/rebasing token'da sessiz eksik-teslimi yakalamak için. Testler
> buna göre.

| # | Test | Token tipi | Kurulum | Beklenen |
|---|---|---|---|---|
| T1 | `claim_native_sac` | native XLM (SAC) | `register_stellar_asset_contract_v2` | C1 happy path eşdeğeri |
| T2 | `claim_mock_sep41` | custom SEP-41 mock | `tests/mocks/sep41.rs` `#[contract]` (mint/balance/transfer) | C1 happy path; trustline yok |
| T3 | `claim_classic_no_trustline_fails` | klasik SAC, alıcı `G…` trustline'sız | SAC fonlu instance, alıcı hesabı trustline kurmamış | `claim` transfer'i fail (skill pitfall #8 `op_no_trust`, `SKILL.md:2296-2327`) → guard geri-alınır, `is_claimed==false` |
| T4 | `claim_smart_wallet_no_trustline_ok` | klasik SAC, alıcı `C…` | SAC bakiyeyi kontrat depolamasında tutar | `Ok` (plan §5: `C…` için trustline gerekmez) |
| T5 | `claim_fee_on_transfer_token_mismatch` | mock fee-on-transfer SEP-41 | instance fee-on-transfer token ile fonlu, `to`'ya `amount−fee` ulaşır | `Err(TokenTransferMismatch)`, guard geri-alınır (`vesting.rs:849` `failed_verifier_does_not_leave_claimed_guard` deseni) |

> **Doğrulanmalı:** T3'te native test-env içinde `op_no_trust`'ın hangi `Error`/host-panic
> biçiminde yüzeye çıktığı SDK 26.0.0-rc.1 SAC testutils davranışına bağlıdır;
> `register_stellar_asset_contract_v2` ile üretilen SAC'ın `G…` alıcıya trustline-yok
> durumunu otomatik modelleyip modellemediği **sürüm-bağımlı**. Testte
> `try_claim(...).is_err()` ile yakalanır; spesifik hata kodu testnet/fork ile doğrulanır
> (§8.2). Plan §5'in "SAC trustline'ı otomatik kurmaz → `op_no_trust`/fail" iddiası `assets`
> skill'e dayanır; instance kontratı bu durumu **üretmez**, sadece SAC'ın hatasını propagate
> eder (ve guard'ı geri alır).

**Mock fee-on-transfer token** (`tests/mocks/fee_on_transfer.rs`): `transfer(from,to,amount)`
çağrısında `to`'ya `amount − fee` yatıran SEP-41 mock. İki yerde kullanılır: instance `claim`
per-claim guard'ı (T5) ve **factory** `create_airdrop` fonlama guard'ı (§4, F4).

### 2.4 Bitmap & sayfalama

| # | Test | Doğrulama |
|---|---|---|
| B1 | `bitmap_word_packing` | index 0, word-sınırı (u64 ise 63/64, u128 ise 127/128) → doğru word/bit; `vesting.rs:626` `claimed_statuses_reports_batch_in_order` deseni |
| B2 | `claimed_statuses_pagination` | `(start, limit)` ile batch okuma sırası korunur |
| B3 | `claimed_statuses_enforces_page_cap` | `limit > MAX_PAGE_LIMIT` → `Err(InvalidLimit)` |
| B4 | `is_claimed_false_for_archived_word` | TTL/archival sonrası entry "yok" sayılmaz, restore edilir (liveness-only; plan §10) |

> **API/cap netleştirmesi (taslak referans hatası):** Taslak `claimed_statuses` için
> vesting batch-cap desenini cite ediyordu. Repoda **iki ayrı desen var**:
> (a) vesting `claimed_statuses(Vec<BytesN<32>>)` — entry-sayısı kapı `MAX_CLAIMED_BATCH=64`
> (`vesting/src/lib.rs:41` tanım, `:297` kontrol), hata `TooManyCommitments` (`:65,:298`);
> test `claimed_statuses_enforces_entry_count_cap` @`vesting.rs:650`;
> (b) factory range-read `(start, limit)` — sayfa kapı `MAX_PAGE_LIMIT=80` (`factory/src/lib.rs:27`
> tanım, `:509` kontrol), hata `InvalidLimit` (`:39,:510`); test
> `range_reads_reject_limits_above_footprint_budget` @`factory.rs:180`. Plan airdrop için
> **(start,limit)+`MAX_PAGE_LIMIT`** sayfalamayı seçmiş; dolayısıyla B3, **factory'nin page-cap
> desenine** (`InvalidLimit @ MAX_PAGE_LIMIT`) yaslanır — vesting'in batch-cap desenine değil.
> `MAX_PAGE_LIMIT` değerini (80) airdrop crate'inde aynen kullan. Bu, vesting'in `MAX_CLAIMED_BATCH=64`
> kararından **bilinçli ayrılıktır** ve gerekçesi: airdrop `claimed_statuses` bir **bitmap range-read**
> (`(start,limit)`) iken vesting'inki bir **epoch-commitment entry listesi** (`Vec<BytesN<32>>`);
> footprint-budget mantığı (range-read entry başına 1 ledger-read; `factory/src/lib.rs:23-27`
> yorumu) factory'nin `MAX_PAGE_LIMIT` desenine birebir uyar (ana plan §0 madde 8; airdrop-tool-design.md §4.6).

### 2.5 Constructor & config

| # | Test | Doğrulama |
|---|---|---|
| K1 | `constructor_sets_config` | `__constructor(admin, token, root, total, deadline, locked)` → `config()` aynısını döner (skill `SKILL.md:119-164`; vesting `__constructor` + `summary()` deseni, `constructor_extends_instance_ttl` @`vesting.rs:695`) |
| K2 | `constructor_rejects_bad_input` | `total <= 0` veya sıfır root → deploy atomik fail (skill `SKILL.md:160-164`; vesting `constructor_rejects_non_canonical_merkle_root` @`vesting.rs:913`, `constructor_rejects_zero_audience_hash` @`:941`) |
| K3 | `events_emitted` | `claim` → `Claimed{to,index,amount}`, `withdraw` → `Withdrawn{to,amount}` — `env.events().all()` (skill `SKILL.md:761-781`) topic+data eşitliği |

> **Not:** Airdrop'un merkle root'u ZK alanına (BN254) bağlı **değildir** (proof yok), bu yüzden
> vesting'in `is_canonical_field` (BN254 modulus, `vesting/src/lib.rs:464-475`) kontrolüne
> **ihtiyaç duymaz**. K2'de root validasyonu yalnız "sıfır-değil" ile sınırlı tutulabilir; bu
> bilinçli sadeleştirme plan §4.1'le tutarlıdır. (Karşıtlık: vesting `validate_initial_root`
> hem zero hem canonical-field kontrolü yapar, `vesting.rs:440-445`.)

---

## 3. Olay & TTL doğrulaması

- **Olaylar:** `Claimed` ve `Withdrawn` her ilgili testte `env.events().all()` ile
  topic + data bazında doğrulanır. (Repo precedent: vesting `Claimed` olayı `#[topic]
  epoch_commitment` + `#[topic] recipient` + `amount` data, `vesting/src/lib.rs:119-127`.)
  Factory `AirdropCreated` için ayrıca `airdrop/owner/token` topic'leri +
  `total_amount/recipient_count/merkle_root/metadata_cid` payload'u kontrol edilir (vesting
  `VestingCreated` deseni `factory/src/lib.rs:69-81`: 3 topic + `total_amount/recipient_count/metadata_cid`).
- **TTL:** `claim`/`withdraw` sonrası instance + ilgili `ClaimedWord(word)` TTL'inin
  `TTL_THRESHOLD` altına inince `TTL_EXTEND_TO`'ya uzatıldığı,
  `env.as_contract(&id, || storage().persistent().get_ttl(&key))` ile (skill `SKILL.md:786-802`;
  repo testi `claim_extends_claimed_entry_and_instance_ttl` @`vesting.rs:672`; uzatma kodu
  `vesting/src/lib.rs:399-404`). Sabitler vesting/factory ile aynı: `DAY_IN_LEDGERS=17_280`,
  `TTL_EXTEND_TO=120*DAY`, `TTL_THRESHOLD=TTL_EXTEND_TO−DAY` (bkz.
  `contracts/soroban/zarf/vesting/src/lib.rs:25-33`, `factory/src/lib.rs:14-22`).
  `MAX_PAGE_LIMIT=80` factory'nin sabit bloğunda (`factory/src/lib.rs:23-27`).

---

## 4. Factory kontratı (`zarf/airdrop-factory`) — test matrisi

Hedef: `contracts/soroban/zarf/airdrop-factory/tests/airdrop_factory.rs`. Mevcut
`factory/tests/factory.rs` neredeyse birebir şablon. **Build sırası:** factory testleri
instance wasm'ı `include_bytes!`/`contractimport!` ile import ettiği için
(`factory/tests/factory.rs:13-14` `include_bytes!`, `:21-25` `contractimport!`)
önce `cargo build --manifest-path contracts/soroban/zarf/airdrop/Cargo.toml --target wasm32v1-none --release`
(vesting↔factory ile aynı bağımlılık; CLAUDE.md "Common commands" notu, ana plan §4 "Build sırası").

> **Not (wasm-gömme — taslak/plan netleştirmesi):** Factory kontratı instance wasm'ını
> **çalışma-zamanında gömmez**; bir `wasm_hash: BytesN<32>` saklar (`VestingWasmHash` DataKey,
> `factory/src/lib.rs:51,101`), wasm ağa **ayrı yüklenir**
> (`env.deployer().upload_contract_wasm(...)`, test `factory.rs:55`) ve deploy
> `deployer().with_current_contract(salt).deploy_v2(wasm_hash, ctor_args)` ile yapılır
> (`factory/src/lib.rs:316-332`); salt **owner+salt** bağlı (`owner_bound_salt`,
> `factory/src/lib.rs:460-464`; ana plan §0 madde 5). Yukarıdaki `include_bytes!`/`contractimport!`
> notu yalnız **testlerin** instance wasm'ını import etme ihtiyacı içindir (deploy fixture'ı için
> gerçek wasm gerekir) — kontrat çalışma-zamanı wasm'ı gömmez.

> **KRİTİK fonlama düzeltmesi (taslak/plan §4.5 hatası):** Taslak ve ana plan §4.5
> `token.transfer(owner, instance, total)` (doğrudan transfer) diyor. **Repo precedent'i farklı:**
> factory `create_and_fund_vesting` (`factory/src/lib.rs:175`) **allowance tabanlı**
> `transfer_from` kullanır — önce owner `approve(owner, factory, amount, expiration)`, sonra factory
> `token_client.transfer_from(&factory_addr, &owner, &instance, &total)`, ardından
> balance-before/after + `checked_add` guard (`factory/src/lib.rs:206-221`; test setup
> `factory.rs:250` `token_client.approve(&owner, &factory_id, &amount, &1000)`). Airdrop factory'si
> bu deseni izlemeli; aksi halde `owner.require_auth()` altında doğrudan `transfer`'in sub-invoke
> auth'u açıkça mock'lanmalı. Testler **allowance akışını** kurar. Çelişki §13'te raporlandı.
> (Not: factory'de iki giriş var — `create_vesting` @`:132` fonlamadan deploy eder,
> `create_and_fund_vesting` @`:175` allowance-pull ile deploy+fonlar; airdrop "deploy+fund"
> akışı ikincisinin karşılığıdır.)

| # | Test | Mevcut karşılık (gerçek satır) | Doğrulama |
|---|---|---|---|
| F1 | `create_airdrop_deploys_and_funds` | `create_and_fund_vesting_consumes_factory_allowance` @`factory.rs:241` | `approve` → `create_airdrop` → `token.balance(instance)==total`; `get_deployment_count()==1` (assert `factory.rs:267-269`) |
| F2 | `deterministic_address` | `same_salt_is_owner_scoped` @`factory.rs:311` | `predict_airdrop_address(owner,salt)` == gerçek deploy adresi (owner-bound salt: `keccak256(owner.to_xdr ‖ salt)`, `factory/src/lib.rs:460-464`); farklı owner/salt → farklı adres |
| F3 | `funding_atomicity_on_failure` | `failed_funding_does_not_track_deployment` @`factory.rs:273` | allowance **yok/yetersiz** → tüm tx revert; `balance(owner)` korunur, `balance(predicted)==0`, `get_deployment_count()==0`, `try_get_deployment(0).is_err()`, registry boş (`factory.rs:299-307` assert seti) |
| F4 | `token_transfer_mismatch` | funding guard (`factory/src/lib.rs:214-221`) | **mock fee-on-transfer token** ile fonla → before/after farkı `total`'dan az → `Err(TokenTransferMismatch)`, deploy izlenmez |
| F5 | `registry_records` | `deployment_record_packs_address_and_cid_into_one_entry` @`factory.rs:138` | `DeploymentAt(n)`, `OwnerDeploymentAt(owner,k)`, metadata CID kayıtlı (tek `DeploymentInfo` entry, `factory/src/lib.rs:83-88`) |
| F6 | `airdrop_created_event` | `creates_vesting_and_tracks_metadata` @`factory.rs:66` (≈ `VestingCreated`) | tüm topic + payload alanları; `recipient_count` **metadata-only**, on-chain leaf-sayısına karşı doğrulanmaz — yalnız "0 değil" kontrolü (`factory/src/lib.rs:79` event payload, `:414-415` `recipient_count==0` reddi) |
| F7 | `same_owner_same_salt_reverts` | `same_owner_same_salt_second_deploy_reverts_without_tracking` @`factory.rs:357` | ikinci aynı-salt deploy revert, registry kirlenmez |
| F8 | `create_requires_owner_auth` | `create_vesting_requires_owner_auth_without_mock_all_auths` @`factory.rs:623` | `mock_all_auths` yokken `owner.require_auth()` zorunlu (`mock_auths` ile; kontrat `factory/src/lib.rs:188`) |
| F9 | `range_read_page_cap` | `range_reads_reject_limits_above_footprint_budget` @`factory.rs:180` | `get_deployments(start,limit)` `limit>MAX_PAGE_LIMIT(=80)` → `Err(InvalidLimit)` (`factory/src/lib.rs:509-511`) |
| F10 | `bad_input_rejected` | input validasyon (`factory/src/lib.rs:409-441`) | `total<=0`→`InvalidAmount` (`:417`), sıfır root→`InvalidMerkleRoot` (`:423-432`), `recipient_count==0`→`InvalidRecipientCount` (`:414`); airdrop'a özel `InvalidDeadline`¹ eklenirse mantık-dışı `deadline` reddi |

¹ Yeni airdrop hata kodu (factory'de yok; üstteki Terminoloji uyarısı).

> **Not (vesting-factory'deki `UsedRoot`/`MerkleRootAlreadyUsed` GEREKMEZ):** Ana plan §4.1 +
> `factory/src/lib.rs:62-67` (DataKey `UsedRoot`), `:382-407` (`reserve_merkle_root`). Vesting'de
> bir ZK proof `(merkle_root, audience_hash)`'e bağlı ama kontrat adresine değil; aynı köklü iki
> kardeş aynı proof'u kabul edebildiği için `UsedRoot` ile kök tekrarı engelleniyor (test
> `duplicate_merkle_root_is_rejected_across_campaigns` @`factory.rs:403`; gerekçe yorumu
> `factory/src/lib.rs:382-393`). Airdrop'ta **ZK proof yok**: her instance kendi köküne + kendi
> claimed-bitmap'ine + kendi fonuna sahip, depolama izole. Bu yüzden airdrop factory'sinde
> "aynı root iki kez" **pozitif** test (`reuse_same_root_allowed`) olarak yazılır — iki bağımsız
> instance, A'nın fonu B'nin proof'uyla çekilemez (farklı kontrat = farklı bakiye).

---

## 5. Paylaşılan Rust↔JS Merkle vektörleri (EN KRİTİK invariant)

Bu, ürünün tek-noktadan-kırılma riskidir: kontrat `keccak256` leaf/node ile JS
`@noble/hashes/sha3` `keccak_256` **byte-bit aynı** olmazsa root tutmaz, hiçbir claim geçmez.

> **Çapraz-referans (TEK NORMATİF KAYNAK):** Vektör dosyasının tam byte-formatı, şeması, üretimi
> ve fiziksel konumu **§15**'te (bu doküman) ve [09-merkle-data-contract] (sibling doküman)
> tarafından **normatif** olarak tanımlanır. §5 bu vektörleri *tüketen* test matrisini verir;
> üretim/şema/konum için tek otorite §15 + 09'dur. İkisi çelişirse 09 normatiftir; bu doküman 09'a
> uyarlanır (drift §15.5'te gate'lenir).

> **Netleştirme (taslak yanıltıcı analojisi):** Mevcut `web/packages/core/lib/crypto/merkleTree.ts`
> **Pedersen/bb.js** (`bb.pedersenHash`, `merkleTree.ts:208,238`; ayrıca `:126,:161,:175`) kullanır
> ve ZK Noir devresine bağlıdır — **keccak değil**. Onun golden-snapshot disiplini
> (`merkleTree.test.ts:29-34`: *"`computeLeaf` ve `computeIdentityCommitment` … on-chain Noir
> circuit ile eşleşmeli. Padding length, hash generator index, field order veya bb.js sürümündeki
> herhangi bir değişiklik her claim'i sessizce kırar."*) doğru **analojidir** ama airdrop merkle'ı
> **yeni ve ayrı** bir modüldür: `@zarf/core/lib/merkle`, saf TS + `@noble/hashes/sha3` keccak256,
> ZK/bb.js bağımlılığı yok. CID-determinizm precedent'i için daha iyi referans
> `claimListBuilder.test.ts:31` ("produces byte-identical output for the same logical input (CID
> stability)").

**Tek kaynak:** `contracts/soroban/zarf/airdrop/tests/vectors/merkle_vectors.json`
(repo'ya commit'lenir, hem Rust hem JS tüketir; tam konum/şema §15):

```jsonc
{
  "format": { "hash": "keccak256",
              "leaf": "0x00 | index_be32 | claimant.to_xdr | amount_be128",
              "node": "0x01 | sorted(L,R)" },
  "cases": [
    { "index": 0, "address": "GABC...7K4Z", "amount": "100000000",
      "leaf": "hex32", "proof": ["hex32", ...] },
    { "index": 1, "address": "CDEF...", "amount": "1", "leaf": "hex32", "proof": [...] }
  ],
  "root": "hex32"
}
```

| # | Test | Taraf | Doğrulama |
|---|---|---|---|
| M1 | `leaf_matches_vector` | Rust | her case için `keccak256(0x00‖index_be‖addr.to_xdr(env)‖amount_be) == case.leaf` |
| M2 | `leaf_matches_vector` | JS | `buildTree`/`computeLeaf` aynı `case.leaf`'i üretir |
| M3 | `root_matches_vector` | Rust + JS | `verify_merkle(root, leaf, proof)` & `verifyProof` her iki tarafta `root` ile `true` |
| M4 | `sorted_node_invariant` | her iki | `node = keccak256(0x01‖sorted(L,R))` — leksikografik sıralama, yön-biti yok (plan §4.3) |
| M5 | `domain_separation` | her iki | bir iç-düğüm hash'i hiçbir geçerli yaprak ile çakışmaz (second-preimage; `0x00`/`0x01` tag) |
| M6 | `gc_address_parity` | her iki | aynı vektör hem `G…` hem `C…` adresi içerir → `to_xdr` ayrımsız (plan §4.3) |
| M7 | `vector_drift_guard` | CI | vektör dosyası değişirse her iki suite kırılır → kasıtlı root değişimi görünür olur |
| M8 | `muxed_leaf_uses_base_xdr` | her iki | muxed `M…` claimant'ın leaf'i **base `G…`** `to_xdr`'ından üretilir → §14 |

> **`to_xdr`/keccak host fonksiyonu uyarısı (taslak hatası düzeltildi):** Taslak M1'i
> `factory::recipient_id` ile "aynı" sayıyordu. **Dikkat:** `recipient_id`
> (`factory/src/lib.rs:118-122`, ve vesting `recipient_field` `vesting/src/lib.rs:521-525`)
> `keccak256(addr.to_xdr)` sonrası `BnScalar::from_bytes(...).to_bytes()` ile **BN254
> alan-indirgemesi** uygular (ZK devresine bağlanmak için — `factory:121`, `vesting:524`).
> Airdrop leaf'i alan-indirgemesine **ihtiyaç duymaz** — yalnız ham `keccak256(0x00‖…)` kullanır.
> M1, repo ile **aynı `keccak256` host fonksiyonunu** (`env.crypto().keccak256`) ve adres için aynı
> `addr.to_xdr(env)` serileştirmesini paylaşır, ama `BnScalar` adımını **içermez**. Bu fark vektör
> testinde açıkça not edilmeli, yoksa "repo ile bire bir aynı" beklentisi yanıltır.

> **Üretim:** vektörler tek otoriteden (`@zarf/core/lib/merkle` `buildTree`) üretilip JSON'a
> yazılır; Rust tarafı **tüketici/doğrulayıcı**dır (her iki taraf bağımsız hesaplar, JSON sadece
> beklenen çıktıyı sabitler). Bir tarafın algoritması kayarsa M1/M3 anında patlar. Tam üretim
> protokolü (script + senkronizasyon + iki kopya disiplini) §15.3-§15.4'te.

---

## 6. Property-based testler (`proptest`)

`SorobanArbitrary` + `proptest` (skill `SKILL.md:1225-1255`). `contracts/soroban/zarf/airdrop`
crate'i zaten `[lib] crate-type = ["cdylib","rlib"]` (repo deseni) → `rlib` tarafı dev-dep
`proptest` ile native register edilebilir.

| # | Property | İfade |
|---|---|---|
| P1 | `sum_claimed_le_funded` | rastgele claim sırası/altküme → `Σ transfer ≤ total` (asla fazla dağıtmaz) |
| P2 | `claim_idempotent` | aynı index iki kez → ikinci `AlreadyClaimed`, bakiye tek-claim değeri |
| P3 | `order_independence` | claim'lerin permütasyonu → aynı final bakiye seti + aynı bitmap |
| P4 | `withdraw_plus_claims_eq_total` | tüm claim + (izinliyse) `withdraw_unclaimed` sonrası instance bakiyesi 0; çıkan toplam = `total` |
| P5 | `bitmap_no_aliasing` | farklı index'ler birbirinin claimed-bit'ini etkilemez (B1'in property versiyonu) |

**Workflow** (skill `SKILL.md:1255`): `cargo-fuzz` ile deep bug avla → `proptest`'e çevirip CI'da
regresyon olarak sabitle.

---

## 7. Fuzz testleri (`cargo-fuzz`)

Skill `SKILL.md:1151-1213`. `contracts/soroban/zarf/airdrop/fuzz/`. Fuzz harness'ı crate'in
`rlib` tarafını import eder; `fuzz/Cargo.toml`'da `soroban-sdk = { version = "26.0.0-rc.1",
default-features = false, features = ["alloc","testutils"] }` (repo SDK sürümüne hizalı; skill
örneği eski `25.0.1`'i gösterir, repo `26.0.0-rc.1` kullanır — §1).

| Hedef | Girdi | İnvariant |
|---|---|---|
| `fuzz_claim` | `(index: u32, amount: i128, proof_bytes: Vec<u8>)` | `try_claim` **asla panik etmez**; yalnızca tipli `Err(...)` veya `Ok` (plan §11) |
| `fuzz_withdraw` | `(locked: bool, deadline: u64, now: u64)` | `try_withdraw_unclaimed` panik yok; sadece `Ok`/tipli `Err` |
| `fuzz_tree_roundtrip` | rastgele `(index, addr, amount)` çoklu | Rust `verify_merkle` × JS paritesi bozulmaz (vektör harness'ı ile) |

Çalıştırma: `cargo +nightly fuzz run fuzz_claim` (macOS'ta `--sanitizer=thread`, skill `SKILL.md:1207-1209`).
İlk crash → minimize → `tests/regressions/` altında `proptest` regresyonuna dönüştür.

---

## 8. Differential snapshot, fork, mutation, resource

### 8.1 Differential snapshots (`test_snapshots/`)
Soroban her testin sonunda `test_snapshots/*.json` yazar (olaylar + final ledger durumu;
skill `SKILL.md:1257-1259`). Mevcut precedent: vesting/factory test_snapshots dizinleri.
**Commit'lenir**; diff = istenmeyen davranış değişikliği. Kritik kullanım: instance kontrat
değişikliğinde claim/withdraw olay sıraları ve bakiye delta'ları review'da görünür olur.

### 8.2 Fork testing
`Env::from_ledger_snapshot_file("snapshot.json")` (skill `SKILL.md:1296-1322`). Akış:
testnet/mainnet'e kampanya deploy → `stellar snapshot create --address C... --output json`
→ gerçek state üzerinde `claim`/`withdraw`. Özellikle **gerçek USDC SAC** ve **gerçek trustline
durumları** (T3/T4) ancak burada kesin doğrulanır. **MuxedAddress payout** (§14) da gerçek SAC'ta
ancak fork ile kesinleşir — native test-env `MuxedAddress` desteği SDK 26.0.0-rc.1'e bağlı, kesin
davranış burada pinlenir. CI-opsiyonel (snapshot dosyası repo'ya iliştirilir), `#[ignore]` ile
manuel (skill Rust integration `SKILL.md:1003` `#[ignore]` deseni).

### 8.3 Mutation testing
`cargo mutants` (skill `SKILL.md:1324-1337`). Her iki crate'te. Hedeflenen mutantlar:
- `now > deadline` → `>=` (C8/W2 boundary CAUGHT etmeli)
- `set_claimed` çağrısının silinmesi (C2 CAUGHT etmeli)
- guard-rollback (`unset_claimed` fail-yolu) silinmesi (C9/T5 CAUGHT etmeli)
- `claimant.require_auth()` silinmesi (C10 CAUGHT etmeli)
- `checked_add`/before-after mismatch guard kaldırılması (F4/T5 CAUGHT etmeli)
- `(&claimant).into()` MuxedAddress dönüşümü → düz `&claimant` (C11/§14 transfer-hedef testi CAUGHT etmeli)

MISSED çıkan her mutant bir test boşluğudur → `mutants.out/diff/` incelenir, test eklenir.

### 8.4 Resource profiling
`stellar contract invoke --sim-only` (skill `SKILL.md:1339-1354`). Ölçülecek:
- `claim` (proof derinliği ~`log2(N)`): 1k / 10k / 100k alıcı için CPU + ledger-read/write.
- `withdraw_unclaimed` ve `create_airdrop` (deploy+fund) tek-tx kaynak bütçesi.

> **Doğrulanmalı (sayısal iddia):** Plan §4.6 "10k alıcı ≈ 80-160 persistent `ClaimedWord` entry"
> diyor; bu rakam **word genişliğine bağlıdır**: `u64` word → 10000/64 ≈ **157** entry; `u128`
> word → ≈ **79** entry. Yani "80-160" aralığı word seçimine göre değişir, sabit değil. Proof
> derinliği (`Vec<BytesN<32>>` uzunluğu ~`ceil(log2(N))`; 100k için ~17) + bitmap okuması tek-tx
> CPU/ledger limitine sığar mı **`--sim-only` ile ölçülmeli**; range-read footprint kapı
> `MAX_PAGE_LIMIT=80`'in network'ün ~100 footprint-entry/tx limitiyle uyumu zaten
> `factory/src/lib.rs:23-27` yorumunda gerekçelendirilmiş. **Per-claim fee ~0.01-0.03 XLM**
> (yayınlanan profilleme; **base fee 100 stroop/op** — repo sabiti değil, ağ parametresi) — sabit
> değil, gerçek değer `--sim-only` çıktısından (resource fee) alınır (ana plan §0 madde 9).
> **Trustline reserve ve ~180g (≈ DAY_IN_LEDGERS·180) TTL tavanı "doğrulanmalı"** — TTL tavanı
> `vesting/src/lib.rs:26-29` yorumunda "~180-day network maximum entry TTL" olarak geçer ama bu bir
> yorum-iddiasıdır, ağ parametresine karşı doğrulanmalı.

---

## 9. Web testleri (`vitest`)

Hedef paketler: `@zarf/core/lib/merkle` (yeni), `web/apps/airdrop-create`, `web/apps/airdrop-claim`.
Mevcut precedent'ler: `domain/claimListBuilder.test.ts`, `utils/cidVerify.test.ts`. (Not: mevcut
`crypto/merkleTree.test.ts` Pedersen/ZK içindir — airdrop merkle'ı için **referans değil, analoji**;
§5.)

### 9.1 Merkle lib (`@zarf/core/lib/merkle/*.test.ts`)

| # | Test | Doğrulama |
|---|---|---|
| WM1 | `leaf_vector` | §5 paylaşılan vektörü tüketir (M2) |
| WM2 | `root_vector` | §5 root paritesi (M3) |
| WM3 | `buildTree_deterministic` | aynı satır seti → aynı root/proofs; satır sırası girişe duyarlı (index = dizi sırası) |
| WM4 | `verifyProof_roundtrip` | her leaf için kendi proof'u `true`, komşunun proof'u `false` |
| WM5 | `amount_i128_be` | `amount` big-endian 16B serileştirme; string↔BigInt sınırı (`claimListBuilder.test.ts:102` "serializes amount as string (not BigInt)" precedent) |
| WM6 | `muxed_base_address_xdr` | muxed `M…` girilirse leaf base `G…` `to_xdr`'ından üretilir (§14; M8 web tarafı) |

### 9.2 Claim-list builder (determinizm + CID)

`claimListBuilder.test.ts:31` "produces byte-identical output for the same logical input
(CID stability)" desenini birebir taklit:

| # | Test | Doğrulama |
|---|---|---|
| WC1 | `byte_identical_output` | aynı mantıksal girdi → byte-bit aynı JSON → aynı CID (claim app linki kararlı) |
| WC2 | `claims_order_stable` | `claims` dizisi deterministik sıralı (index = sıra); `claimListBuilder.test.ts:98-99` sorted-invariant deseni |
| WC3 | `schema_shape` | plan §7 JSON şeması: `v/network/airdrop/token/root/format/claims`; `amount` string, proof hex32 dizisi |
| WC4 | `cid_verify_roundtrip` | `cidVerify.test.ts` deseni — pinlenen içerik CID ile doğrulanır |
| WC5 | `pin_proxy_accepts_airdrop_schema` | pin-proxy `validateClaimList` (güncel) airdrop JSON'unu kabul eder; eski vesting şeması bozulmaz (regresyon) — aşağıdaki not |

> **pin-proxy şema uyumu (yeni — kritik entegrasyon riski; repo'ya karşı doğrulandı):** Mevcut
> pin-proxy `validateClaimList` (`web/apps/pin-proxy/src/index.ts:236-252`) **`merkleRoot`**
> (HEX_32, `:240`) + **boş-olmayan `leaves[]`** (`:243`, her biri HEX_32 `:246`) + **`schedule`**
> (object, `:249`) alanlarını ZORUNLU kılar. Airdrop claim-list'i `root` + `claims[]` (schedule
> **YOK**) şemasını kullanır → mevcut validator airdrop JSON'unu **REDDEDER** (`missing_schedule`
> / `missing_or_empty_leaves`). Bu yüzden ya `validateClaimList` airdrop şemasını ayırt edecek
> şekilde güncellenir ya da **yeni bir route** (`/pin/airdrop`) eklenir. WC5 bu güncelleme
> sonrası airdrop JSON'unun kabul edildiğini + eski vesting şemasının bozulmadığını doğrular.
> **Yol düzeltmesi:** pin-proxy repoda `web/apps/pin-proxy/src/index.ts`'tedir
> (`@zarf/pin-proxy`); taslaktaki `web/workers/pin-proxy/...` yolu **yanlıştır** — repoda
> `web/workers/` dizini yoktur, tüm app/worker'lar `web/apps/` altındadır. Ayrıntı ana plan §0
> madde 7 + [05-economics]/[08-operations].

### 9.3 Claim state machine (`airdropClaimStore`)

Plan §15.3 durum tablosunun her satırı bir test (derived state):

| # | Durum | Beklenen UI/state |
|---|---|---|
| WS1 | eligible + claimable | miktar + Claim butonu aktif |
| WS2 | already claimed | ✓ + explorer linki (on-chain `is_claimed==true`) |
| WS3 | expired | "claim penceresi kapandı" (`deadline` geçmiş) |
| WS4 | not in list | "bu adres listede yok" |
| WS5 | no-trustline (klasik asset) | önce "trustline ekle" adımı (plan §5; T3 web karşılığı) |
| WS6 | wrong network | "cüzdanı … ağına geçir" (`isWrongNetwork`; skill pitfall #12 `SKILL.md:2433-2456`) |
| WS7 | account not funded | "fee + reserve için XLM gerekli" (skill pitfall #7 `SKILL.md:2264-2292`) |
| WS8 | submitting/success | spinner → ✓ + explorer |

Ek: `simulateTransaction → assembleTransaction` zorunluluğu (skill pitfall #10, `SKILL.md:2368-2394`)
ve network-passphrase denetimi (pitfall #6 `SKILL.md:2231-2260` / #12) için birim testler — claim app
asla simülasyonsuz submit etmez.

> **Doğrulanmalı (UI metni):** Plan §15.3 claim ekranında gösterilen fee (örn. "~0.01-0.03 XLM, sen
> ödersin") bir **UI örnek metnidir**, kontrat iddiası değil; gerçek fee ağ koşullarına bağlıdır
> (base fee 100 stroop/op + resource fee) ve claim app simülasyon sonrası `assembleTransaction`'dan
> gelen kaynak ücretini göstermeli (skill sabit bir rakam vermez). Test, gösterilen fee'nin
> simülasyon çıktısından türediğini doğrular, hard-coded sabiti değil.

### 9.4 Create grid validasyonu (`RecipientGrid`)

Plan §15.2 grid. `csvProcessor.ts` `address,amount` reuse (plan §15.2).

| # | Test | Doğrulama |
|---|---|---|
| WG1 | `strkey_checksum` | geçersiz `G…`/`C…` → hücre hatası |
| WG2 | `duplicate_detection` | aynı adres iki kez → ⚠ tekrar |
| WG3 | `amount_positive` | `amount <= 0` → hata; Σ canlı hesabı |
| WG4 | `paste_grid` | Sheets'ten yapıştır → satır parse |
| WG5 | `issuer_flag_gate` | klasik asset seçilince `AUTH_REQUIRED` açık → **reddet**, `auth_clawback_enabled` → **uyar** (plan §5/§15.2; `assets` skill `account.flags`; skill "Clawback Awareness" `SKILL.md:1692-1705`, `auth_clawback_enabled` `:1700`) — mock'lanmış issuer hesabıyla |

---

## 10. CI entegrasyonu

Mevcut `.github/workflows/ci.yml` matrisine iki yeni crate eklenir. Değişiklik noktaları
(satır numaraları repo'ya karşı **kabaca** verilmiştir — `ci.yml` aktif geliştirme altında;
ekleme yapmadan önce ilgili adım grep ile doğrulanmalı):

| ci.yml bölgesi | Mevcut | Ekleme |
|---|---|---|
| toolchain crate listesi | `verifier`, `jwk-registry`, `vesting`, `factory` | `+ contracts/soroban/zarf/airdrop`, `+ .../airdrop-factory` |
| `cargo fmt --check` döngüsü | per-crate | iki crate eklenir |
| `cargo clippy -D warnings` döngüsü | per-crate | iki crate eklenir |
| WASM build adımları | per-crate `--target wasm32v1-none --release` | **önce** `airdrop`, **sonra** `airdrop-factory` (sıra önemli — §4 build bağımlılığı) |
| `cargo test` adımları | per-crate | `Test airdrop` + `Test airdrop-factory` (instance wasm önce build) |
| `cargo audit` döngüsü | per-crate `Cargo.lock` | iki crate `Cargo.lock` eklenir |
| Web unit tests | web dizininden `pnpm -r --if-present test` | yeni `@zarf/core` merkle modülü + iki app suite'i **otomatik** kapsanır (recursive) |
| Svelte app checks | landing/create/claim `check` + worker typecheck | `+ --filter @zarf/airdrop-create check`, `+ --filter @zarf/airdrop-claim check` |
| Build/budget | `build:landing/claim/create` + `check:budget` | `+ build:airdrop-create`, `+ build:airdrop-claim` |
| Drift gates | `check:any`, `check:console` | yeni merkle modülünü kapsar (boundary istisnaları `web/scripts/check-any-allow-list.mjs`) |
| **Vektör senkronizasyon gate** | (yeni) | `check:merkle-vectors` — Rust↔JS vektör kopyaları byte-bit aynı (§15.5) |

> **Web komut düzeltmesi:** CI ve CLAUDE.md `pnpm --dir web …` (veya web dizininden
> `pnpm -r --if-present test`) kullanır. Taslağın `pnpm --dir web -r …` yazımı çalışır ama
> tutarlılık için repo'nun `--dir web --filter @zarf/<app>` / `-r --if-present test` biçimi
> kullanılır.

`cargo-fuzz` ve `cargo-mutants` CI'da ağırdır → ayrı, zamanlanmış (nightly) iş veya manuel
tetikli workflow; PR-blocking değil. Fuzz crash regresyonları normal `cargo test`'e
(`proptest`) düşürülünce her PR'da çalışır.

---

## 11. Formal verification adayları & audit

Soroban skill Part 3 (`SKILL.md:1834-1853`). Bu ürün için aday invariantlar:

- **Komet** (Runtime Verification, Rust-spec, WASM-bytecode; `SKILL.md:1844-1853`): `claim` için
  `claimed_before ⇒ AlreadyClaimed`, `Σ transferred ≤ total`, `withdraw` locked-gate (W2/W4)
  property-test'leri kontrat diliyle yazılır.
- **Certora Sunbeam** (CVLR makroları `cvlr_assert!`/`cvlr_assume!`; `SKILL.md:1836-1842`):
  `withdraw_unclaimed`'in dört güven-modu state-machine'i (plan §4.4) formel olarak;
  "locked & deadline==0 ⇒ asla çekilemez" trustless-lock invariantı.
- Statik analiz: **Scout Soroban** (`cargo scout-audit`; `SKILL.md:1819-1825`) —
  `overflow-check`, `unrestricted-transfer-from`, `unsafe-unwrap`, `dos-unbounded-operation`
  detektörleri. `claimed_statuses` sayfa cap'i (B3) `dos-unbounded` için pozitif kanıt.
  **OpenZeppelin Security Detectors** (`SKILL.md:1827-1831`) `auth_missing`/`unchecked_ft_transfer`
  (C10/T5 ile çakışır).

Bu araç fon tutan (custody) bir kontrat olduğundan, mainnet öncesi en az statik-analiz +
mutation temiz; TVL artarsa Soroban Audit Bank süreci aday (`SKILL.md:1789-1797`).

---

## 12. Kapsam (coverage) checklist

Soroban skill testing checklist (`SKILL.md:1369-1383`) bu ürüne uyarlanmış:

- [ ] Tüm public fonksiyonlar (`claim`, `is_claimed`, `claimed_statuses`, `config`,
      `withdraw_unclaimed`; factory `create_airdrop`, `predict_*`, registry getter'ları) unit-kapsamlı
- [ ] Edge-case: `index=0`, `index=N-1`, word-sınırı (u64:63/64 veya u128:127/128), `amount` min/max,
      boş bitmap, `deadline=0` vs `T>0`, `now==T` boundary
- [ ] Auth: `claim` → `claimant.require_auth()` (C10); `withdraw` → admin-only (W6);
      `create_airdrop` → owner (F8) — `mock_auths` ile, kör `mock_all_auths` değil
- [ ] Hata yolları: `AlreadyClaimed`, `InvalidProof`, `Expired`, `InvalidIndex`,
      `NotYetWithdrawable`, `Unauthorized`, `NothingToWithdraw`, `TokenTransferMismatch`;
      factory `InvalidAmount`, `InvalidMerkleRoot`, `InvalidDeadline`, `InvalidLimit`
      (yeni airdrop kodları repoda yok — bunlar eklenir; bkz. Terminoloji uyarısı)
- [ ] Olaylar: `Claimed`, `Withdrawn`, `AirdropCreated` topic+payload doğrulandı
- [ ] TTL: instance + `ClaimedWord` extend davranışı (`get_ttl`)
- [ ] Token tipleri: native SAC (T1) + mock SEP-41 (T2) + klasik no-trustline fail (T3) +
      smart-wallet ok (T4) + fee-on-transfer mismatch (T5)
- [ ] **Guard-rollback: claim fail yolunda `is_claimed==false` (C9/T5) — repo explicit-rollback deseni**
- [ ] **MuxedAddress claimant: leaf base-`G…` ile çözülür, payout `M…`'e gider, guard base'de (C11/§14)**
- [ ] Cross-contract: factory→instance deploy+fund (allowance/`transfer_from`); instance→token transfer
- [ ] Fuzz: `fuzz_claim`/`fuzz_withdraw` panik-yok
- [ ] Property: `Σclaim ≤ funded`, idempotent, order-independence
- [ ] Mutation: boundary/auth/guard/rollback/MuxedAddress mutantları CAUGHT
- [ ] Differential snapshot'lar commit'li
- [ ] **Paylaşılan Rust↔JS Merkle vektörleri (M1-M8) — kapanmazsa diğer her şey anlamsız (§15)**
- [ ] Web: merkle lib vektör, claim-list builder CID-determinizm, pin-proxy şema kabulü (WC5),
      claim state machine 8 durum, create grid validasyon + issuer-flag gate
- [ ] Integration: testnet deploy → fork test ile gerçek state (T3/T4 USDC + §14 MuxedAddress) doğrulandı
- [ ] Resource: `claim` 1k/10k/100k alıcı kaynak profili tek-tx limitinde (`--sim-only`)

---

## 13. Çelişki / açık nokta raporu

- **FONLAMA MEKANİZMASI (mimari çelişki — çözülmeli):** Ana plan §4.5 ve taslak
  `token.transfer(owner, instance, total)` (doğrudan) diyor; **repo precedent'i allowance +
  `transfer_from`** (`create_and_fund_vesting`, `factory/src/lib.rs:206-221`, test setup
  `factory.rs:250` `approve(...)`). İki seçenek: (a) repo deseniyle hizalan — `create_airdrop`
  allowance tüketir, create app önce `approve` tx'i gönderir (iki tık); (b) doğrudan `transfer` +
  owner'ın sub-invoke auth'unu açıkça gerektir. **Karar plan §4 ile senkronize edilmeli.** Test
  matrisi (F1/F3) şu an **allowance varsayar** (repo precedent) — plan (b)'yi seçerse F1/F3 setup'ı
  `approve` yerine doğrudan-auth mock'una döner. (Ana plan §0 madde 1 allowance-pull'u bağlayıcı
  kabul etti.)

- **Per-claim mismatch guard (taslak hatası düzeltildi):** Taslak "instance seviyesinde mismatch
  guard'ı yoktur" diyordu; vesting instance `claim`'i guard taşır (`vesting/src/lib.rs:378-397`).
  Airdrop instance'ı bu guard'ı **almalı**; alınmazsa T5 anlamsız kalır ve fee-on-transfer
  token'da sessiz eksik-teslim oluşur. Plan §4.2 adım 6 buna göre güncellenmeli.

- **Çift-claim koruması atomik-revert'e bırakılmaz (taslak hatası düzeltildi):** Repo claim-guard'ı
  fail yolunda **açıkça geri yazar** (`vesting/src/lib.rs:368-373, 393-396`); test
  `insufficient_balance_claim_rolls_back_claim_guard` (`vesting.rs:770`) ve
  `failed_verifier_does_not_leave_claimed_guard` (`vesting.rs:849`). Airdrop `claim`'i aynı
  explicit-rollback'i uygulamalı (sadece "Soroban tüm tx'i atomik geri alır"a güvenmek yetersiz —
  özellikle SAC transfer'i `Ok` dönüp eksik teslim ederse tx revert OLMAZ, guard manuel geri-alma
  gerekir).

- **MuxedAddress payout + leaf-base tutarlılığı (yeni — §14):** Repo `claim` transfer hedefini
  `let to: MuxedAddress = (&recipient).into();` ile `MuxedAddress`'e çevirir
  (`vesting/src/lib.rs:380-381`), ama balance guard'ı **base address** (`recipient`) üzerinde ölçer
  (`:379,:383,:388-391`) ve leaf de base address'in `to_xdr`'ından üretilir (`:521-525`). Airdrop
  instance'ı bu deseni aynen taşırsa muxed-`G…` (`M…`) claimant'lar **tek leaf** ile listelenir
  (base `G…`) ve payout muxed memo-taşıyıcı adrese gider. Test-vektörü bunu pinlemeli (§14); aksi
  halde muxed claimant'ın leaf'i ile transfer-hedefi/guard adresi uyuşmazlığı sessiz hata üretir.
  Ana plan §0 madde 4 + §4.3 ile uyumlu.

- **pin-proxy şema reddi + yanlış yol (yeni — entegrasyon engeli):** `validateClaimList`
  (`web/apps/pin-proxy/src/index.ts:236-252`) `merkleRoot`+boş-olmayan `leaves[]`+`schedule`
  zorunlu kıldığı için airdrop `root`/`claims[]` (schedule-yok) şemasını **reddeder**. Validator
  güncellenmeli veya yeni route eklenmeli (WC5 testi). **Taslak yolu `web/workers/pin-proxy/...`
  yanlıştır** — repoda `web/workers/` dizini yok; pin-proxy `web/apps/pin-proxy/`'dedir. Ana plan
  §0 madde 7.

- **C9/T3 SAC hata semantiği:** Native test-env'de SAC `transfer` yetersiz bakiye/no-trustline'da
  hangi exact host-panic/`Error` ile döner — testte `try_*().is_err()` + `is_claimed==false` ile
  yakalanır, kesin kod **testnet/fork'ta doğrulanmalı** (§8.2). `register_stellar_asset_contract_v2`'nin
  `G…` alıcıya trustline-yok durumunu otomatik modelleyip modellemediği SDK 26.0.0-rc.1'e bağlı.

- **Resource @100k alıcı + bitmap entry sayısı (sayısal — doğrulanmalı):** "10k ≈ 80-160 entry"
  word genişliğine bağlı (u64≈157, u128≈79). Tek-tx CPU/ledger limiti `--sim-only` ile ölçülmeli;
  sığmazsa proof derinliği veya word genişliği/`MAX_PAGE_LIMIT` yeniden değerlendirilir. Per-claim
  fee ~0.01-0.03 XLM (base fee 100 stroop/op + resource fee); trustline reserve ve ~180g TTL tavanı
  **"doğrulanmalı"** (ana plan §0 madde 9).

- **Claim fee UI metni (doğrulanmalı):** Plan §15.3 fee metni sabit değil; simülasyon
  çıktısından gösterilmeli (§9.3).

- **Yeni hata kodları (terminoloji):** `InvalidIndex`, `Expired`, `NotYetWithdrawable`,
  `NothingToWithdraw`, `InvalidDeadline`, `Unauthorized` repoda **yoktur** — airdrop crate'i için
  önerilen `#[contracterror]` varyantlarıdır. Repo konvansiyonu (typed error + `Result`,
  `unwrap`/`panic` yok; CLAUDE.md) ile eklenir.

- Ana plan §11 ile bu doküman genel olarak uyumludur; yukarıdaki düzeltmeler dışında çelişki
  tespit edilmedi. Dosya:satır referansları repo'ya karşı düzeltildi (bu sürümde gerçek değerler
  kullanıldı; ci.yml satırları "aktif geliştirme" notuyla kabaca bırakıldı).

---

## 14. MuxedAddress claimant test-vektörü (leaf base-resolution + payout-hedef)

> Repo `claim` payout'u `MuxedAddress`'e gönderir ama leaf/guard **base address** üzerinden çalışır
> (`vesting/src/lib.rs:380-381` transfer, `:379,:383,:388-391` guard, `:521-525` `recipient_field`).
> Muxed-`G…` (`M…`) bir claimant için: (a) leaf base-`G…` ile çözülür, (b) transfer doğru hesaba
> (muxed memo-taşıyıcı) gider, (c) guard base-`G…`'de tutar. Bu bölüm bunu unit + (kesin) fork
> ile pinler. Normatif format §15 + [09-merkle-data-contract].

### 14.0 Repo-doğrulanmış davranış (mekanik)

Vesting `claim` içindeki tam dizi (`vesting/src/lib.rs:378-397`, satır satır doğrulandı):

```rust
let before_recipient_balance = token_client.balance(&recipient);   // BASE G… (vesting:379)
let to: MuxedAddress = (&recipient).into();                        // M… türetimi (vesting:380)
token_client.transfer(&contract_address, &to, &amount);            // payout MUXED'e (vesting:381)
let after_recipient_balance = token_client.balance(&recipient);    // yine BASE G… (vesting:383)
// guard: after_recipient == before_recipient + amount  → değilse TokenTransferMismatch (vesting:388-396)
```

Üç **load-bearing** gerçek:
1. **Leaf base'ten üretilir.** `recipient_field`/leaf `recipient.clone().to_xdr(env)` kullanır
   (`vesting:522`); `recipient` fonksiyon argümanı base `Address`'tir (`claim` imzası `vesting:311`).
   Airdrop leaf'i de `claimant.to_xdr()` (base) — `M…`'in muxed-ID byte'ları leaf'e **girmez**.
2. **Payout muxed'e gider.** `(&recipient).into(): MuxedAddress` SEP/XDR memo-id'yi taşır; SAC
   transfer hedefi muxed'dir (`vesting:380-381`). Base `G…` bakiyesi yine de artar (muxed yalnız
   base+memo'dur; bakiye base hesapta tutulur).
3. **Guard base'te ölçer.** `before/after_recipient_balance` ikisi de base `recipient`
   (`vesting:379,:383`). Yani guard, muxed-id ne olursa olsun base-`G…`'nin `+amount` aldığını
   doğrular.

**Sonuç (airdrop için tasarım kuralı):** Airdrop `claim(index, claimant, amount, proof)` imzasında
`claimant: Address` **base** olarak alınır; leaf base'ten doğrulanır; payout `let to: MuxedAddress =
(&claimant).into();` ile muxed'e gider; guard base'te ölçer. Liste/builder **base `G…`** ile çalışır
— muxed-id claim-tx'inde taşınır, listeye girmez.

### 14.1 Unit testleri (`tests/airdrop.rs`)

`MuxedAddress` testutils üretimi SDK 26.0.0-rc.1'e bağlı (**doğrulanmalı**: native env'de muxed
`Address` oluşturma API'si — yoksa bu testler `#[ignore]` + fork'a taşınır, §14.2). Varsa:

| # | Test | Senaryo | Beklenen | Doğrulama |
|---|---|---|---|---|
| MX1 | `muxed_claim_resolves_leaf_from_base` | claimant base `G…`; leaf base'ten üretilmiş; claim base `Address` ile çağrılır | `Ok(())` | leaf = `keccak256(0x00‖index‖base.to_xdr‖amount)` → root tutar (C1'in muxed-base eşdeğeri) |
| MX2 | `muxed_payout_credits_base_account` | claim sonrası | `token.balance(base_G)==amount`; `is_claimed(index)==true` | payout muxed'e gitse de **base bakiye** artar (guard base'te `+amount`) |
| MX3 | `muxed_id_not_in_leaf` | aynı base'in iki farklı muxed-id'si | her ikisi de **aynı leaf**/aynı proof ile geçerli; ama `index` tek → ikincisi `AlreadyClaimed` | muxed-id leaf'e girmez (base-binding); çift-claim muxed-id ile **bypass edilemez** |
| MX4 | `wrong_base_in_proof_rejected` | leaf base-A için; claim base-B ile | `Err(InvalidProof)` | leaf base'e bağlı → farklı base reddedilir (C5 muxed analojisi) |
| MX5 | `muxed_transfer_target_guard` | mock SEP-41 token: `transfer` çağrısının `to` argümanını kaydet | kaydedilen `to` **muxed** (`M…`); guard yine de base'te `Ok` | transfer-hedefinin muxed olduğunu **explicit** kanıtlar (mutation §8.3 `(&claimant).into()` silme → CAUGHT) |

> **MX3 güvenlik notu:** Muxed-id'nin leaf'e girmemesi **kasıtlıdır ve gereklidir** — aksi halde
> aynı base hesap, farklı muxed-id'lerle aynı index'i tekrar claim edebilir (bitmap base-index'e bağlı
> değil muxed'e bağlı olurdu). MX3 bu çift-claim-bypass'ının **kapalı** olduğunu kanıtlar.

### 14.2 Fork testi (kesin doğrulama — `#[ignore]`)

Native test-env muxed-`Address` ve SAC muxed-transfer semantiğini SDK sürümüne göre **modelleyip
modellemediği belirsiz** (doğrulanmalı). Kesin doğrulama fork ile:

1. Testnet'e airdrop instance deploy + fonla (gerçek USDC SAC veya native).
2. Bir base `G…` için index oluştur; claim-tx'ini **muxed `M…`** destinasyonuyla simüle/gönder
   (`simulateTransaction → assembleTransaction`, skill `SKILL.md:984-988`).
3. `stellar snapshot create --address C... --output json` → `Env::from_ledger_snapshot_file(...)`
   (skill `SKILL.md:1296-1322`) üzerinde:
   - base `G…` bakiyesi `+amount` (memo-id bakiyeyi base'te tutar),
   - `is_claimed(index)==true`,
   - `Claimed` olayının `to`/recipient topic'i (base mi muxed mi — **doğrulanmalı**; tasarım kararı:
     base `G…` yayınla, muxed yalnız transfer-hedefi). (Repo vesting `Claimed.recipient` topic'i base
     `recipient`'i yayınlar, `vesting:406-408` — airdrop için aynı seçim önerilir.)

> **Doğrulanmalı:** (i) native env'de muxed `Address` üretim API'si; (ii) `register_stellar_asset_contract_v2`
> SAC'ının muxed-destination transfer'i base bakiyeye yazıp yazmadığı; (iii) `Claimed.to` topic'inin
> base mi muxed mi olması gerektiği (öneri: base, indexer/dashboard tutarlılığı için). Üçü de fork ile
> kesinleşir; karar [09-merkle-data-contract] + [01-threat-model] ile senkronize edilir.

### 14.3 Web tarafı paritesi

`@zarf/core/lib/merkle` `buildTree`/`computeLeaf` **yalnız base `G…`** kabul eder; muxed `M…`
girişi (varsa create grid'de) **base'e indirgenir** (`@stellar/stellar-sdk` `MuxedAccount`/strkey
çözümü) ve leaf base `to_xdr`'ından üretilir. WM6 testi (§9.1): muxed `M…` girilirse leaf base
`G…`'ninkiyle **byte-bit aynı** olur. Bu, M8 (§5) ile aynı invariantın web tarafıdır; vektör seti
en az bir muxed-derived case içerir (§15.2 `muxedInput` case).

---

## 15. Paylaşılan differential Rust↔JS vektör seti — konum, şema, üretim (TEK NORMATİF KAYNAK)

> Bu bölüm vektör dosyasının **fiziksel konumunu, şemasını ve üretim protokolünü** sabitler.
> [09-merkle-data-contract] ile **tek-normatif** çapraz-referanslıdır: byte-format spesifikasyonu
> 09'da, test-tüketim matrisi §5'te, üretim/senkronizasyon disiplini burada. Çelişirse **09 normatif**;
> bu bölüm 09'a uyarlanır. Vektör seti olmadan §5/§6/§7/§14 anlamsızdır.

### 15.1 İki fiziksel kopya, tek mantıksal kaynak

Vektör JSON'u **iki yerde aynı içerikle** yaşar (her toolchain kendi fixture kökünden okur; cross-dir
import yok — repo deseni: contracts ve web bağımsız toolchain'ler, CLAUDE.md "four independent toolchains"):

| Konum | Tüketen | Repo precedent |
|---|---|---|
| `contracts/soroban/zarf/airdrop/tests/vectors/merkle_vectors.json` | Rust unit/property/fuzz (M1/M3/M4/M5/M6/M8, P*, fuzz_tree) | `contracts/soroban/verifier/tests/zarf/` fixture deseni (bb.js-üretilmiş, repo'ya commit; CLAUDE.md "Test fixtures") |
| `web/packages/core/lib/merkle/__fixtures__/merkle_vectors.json` | JS vitest (M2/M3, WM1/WM2/WM6, WC*) | `web/packages/core/lib/**/__fixtures__` + golden-snapshot deseni (`merkleTree.test.ts`, `claimListBuilder.test.ts`) |

**İki kopya byte-bit aynı olmalı.** Senkronizasyonu bir CI gate korur: `check:merkle-vectors`
(§10 tablosu) iki dosyanın `sha256`'sını karşılaştırır; farklıysa CI kırmızı. Bu, mevcut repo'nun
"tek otoriteden üret, her iki tarafta sabitle" diff-determinizm disiplininin (CLAUDE.md "Test
fixture'ları … regenerate via …") airdrop-merkle karşılığıdır.

> **Neden tek dosya + symlink değil?** Repo dört bağımsız toolchain (CLAUDE.md "four independent
> toolchains"); contracts (`cargo`) ve web (`pnpm`) farklı build-root'lardan çalışır, cross-dir
> fixture import'u kırılgan ve toolchain-bağımlıdır. İki kopya + hash-gate, repo'nun mevcut
> ayrık-toolchain mimarisiyle tutarlıdır.

### 15.2 Şema (normatif taslak — 09 ile hizalı)

```jsonc
{
  "schemaVersion": 1,
  "format": {
    "hash": "keccak256",
    // leaf = keccak256( 0x00 ‖ index_be(4B) ‖ claimant_base.to_xdr() ‖ amount_be(16B) )
    "leaf": "0x00 | index_be32 | base_address.to_xdr | amount_be128",
    // node = keccak256( 0x01 ‖ sorted_lexicographic(L, R) )  — yön-biti yok (OZ-stili)
    "node": "0x01 | sorted(L,R)",
    "addressSerialization": "Address::to_xdr (base; muxed M… → base G… indirgenir)",
    "fieldReduction": "NONE"   // DİKKAT: BN254 indirgemesi YOK (recipient_id'den farkı; §5)
  },
  "cases": [
    { "index": 0, "address": "GABC...7K4Z", "amount": "100000000",
      "leaf": "0x<hex32>", "proof": ["0x<hex32>", "..."] },
    { "index": 1, "address": "CDEF...SMART", "amount": "1",
      "leaf": "0x<hex32>", "proof": ["0x<hex32>", "..."] },           // C… smart-wallet parite (M6)
    { "index": 2, "address": "GMUX...BASE", "amount": "42",
      "muxedInput": "MABC...MEMO",                                    // §14: muxed giriş → base leaf
      "leaf": "0x<hex32>", "proof": ["0x<hex32>", "..."] }            // M8/MX-base
  ],
  "root": "0x<hex32>",
  "recipientCount": 3
}
```

Alan kuralları (09 normatif):
- `address`: her zaman **base** strkey (`G…` veya `C…`); leaf bundan üretilir.
- `muxedInput` (opsiyonel): bir muxed `M…` girişi; web builder bunu base `address`'e indirger,
  leaf base'ten üretilir → §14/WM6/M8 kanıtı.
- `amount`: **string** (BigInt değil) — `claimListBuilder.test.ts:102` precedent; `amount_be(16B)` = `i128` big-endian.
- `leaf`/`proof`/`root`: `0x`-prefixli hex32. Sıralama leksikografik (`node`); proof'ta yön biti yok.
- En az bir `G…`, bir `C…`, bir `muxedInput` case zorunlu (M6 + M8 parite).

### 15.3 Üretim protokolü (tek otorite = web `buildTree`)

Vektörler **tek otoriteden** üretilir; Rust tarafı bağımsız hesaplar ama JSON'u **otoriteyle
karşılaştırır** (her iki taraf da hesaplar; JSON yalnız beklenen çıktıyı dondurur):

```
1. web/packages/core scripts/gen-merkle-vectors.ts
   → @zarf/core/lib/merkle buildTree(rows)  (tek normatif implementasyon)
   → cases[].leaf, cases[].proof, root, recipientCount hesapla
   → JSON'u iki konuma da yaz (15.1); sha256 eşit olduğunu doğrula
2. Rust suite (M1/M3/M4) JSON'u OKUR ama leaf/root'u BAĞIMSIZ yeniden hesaplar:
   keccak256(...) == case.leaf  &&  verify_merkle(root, leaf, proof)
   → biri kayarsa M1/M3 patlar (JSON sadece sabit; iki taraf bağımsız üretir)
3. cargo test (M*) + pnpm test (WM*/WC*) yeşil → vektör commit
```

Bu, `poc/scripts/generateZarfProofForStellar.js`'in airdrop-merkle eşdeğeridir (CLAUDE.md fixture
regenerate notu); fark: ZK/bb.js yok, saf `@noble/hashes/sha3`. Script konumu öneri:
`web/packages/core/scripts/gen-merkle-vectors.ts` (precedent: `web/scripts/*` drift araçları).

> **Üretici ≠ tek doğrulayıcı:** Rust tarafının yalnız "JSON'daki leaf'i okuyup eşitlik kontrolü"
> yapması **yetmez** — leaf'i `keccak256` host fn ile **bağımsız** yeniden hesaplayıp `case.leaf` ile
> karşılaştırmalı (M1). Aksi halde her iki taraf da hatalı JSON'u kabul eder ve drift gizlenir. JSON
> bir *oracle* değil, *donmuş beklenen çıktı*dır.

### 15.4 Tek-implementasyon disiplini

- **Leaf/node hashing tek yerde:** `@zarf/core/lib/merkle/hash.ts` (web) ve airdrop crate `merkle.rs`
  (Rust) — **iki implementasyon, bir spesifikasyon** (15.2/09). Her ikisi de vektörle pinlenir; üçüncü
  bir kopya (örn. claim app içinde ayrı hashing) **yasak** — yalnız `@zarf/core/lib/merkle` import edilir.
- **`amount` serileştirmesi tek yerde:** `i128 → 16B big-endian`; web `claimListBuilder` `amount`'u
  string tutar (`claimListBuilder.test.ts:102`), hashing anında BigInt→16B'ye çevrilir.
- **Adres serileştirmesi:** Rust `Address::to_xdr(env)` (repo `recipient_field` `vesting:522` aynı
  fonksiyonu kullanır); web `@stellar/stellar-sdk` ile aynı XDR byte'ları (muxed → base indirgeme
  dahil). Bu eşitlik M1/M2 + WM6 ile kanıtlanır.

### 15.5 Drift gate'leri (CI)

| Gate | Ne | Kırılırsa |
|---|---|---|
| `check:merkle-vectors` | iki kopya `sha256` eşit (§15.1) | senkron kopmuş — birini diğerine eşitle (PR-blocking) |
| M7 `vector_drift_guard` (§5) | vektör değişirse her iki suite kırılır | kasıtlı root değişimi review'da görünür |
| Rust M1 + JS M2 | bağımsız yeniden-hesap = `case.leaf` | bir tarafın hashing'i kaydı → anında patlar |

> **Tek-noktadan-kırılma kuralı:** Vektör seti ürünün tek-noktadan-kırılma riskidir (§5). Bu üç gate
> (kopya-eşitliği + drift-guard + bağımsız-yeniden-hesap) birlikte, "kontrat ve web farklı root üretir
> → her claim sessizce kırılır" senaryosunu **commit anında görünür** kılar. 09 byte-format değişirse
> bu bölüm + §5/§14 birlikte güncellenir; tek normatif kaynak ihlal edilmez.

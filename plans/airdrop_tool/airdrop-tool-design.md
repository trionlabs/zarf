# Zarf — Standart Airdrop Dağıtım Aracı Tasarım Raporu

> Hedef: Zarf'ın ZK/e-posta gizlilik çekirdeğinden **bilinçli olarak ayrı**, klasik bir
> **cüzdan-adresi + Merkle-claim** airdrop/token-dağıtım aracı. "Airtable gibi" sade liste
> yönetimi, **anlık claim**, **alıcı kendi fee'sini öder**, **yeni bağımsız Soroban kontratı**
> (factory + instance), proof'lar **pin-proxy/IPFS** üzerinden yayımlanır.
> Devre/verifier/vesting kontratlarına ve mevcut Zarf akışına **dokunulmaz** (risk izolasyonu).
> DURUM: Karar verildi (aşağıdaki "Kilitlenen kararlar"), implementasyon bekliyor.
> Token desteği `soroban` + `assets` skilleriyle tartışıldı; sonuç §5'te.

---

## 0. Doğrulama senkronizasyon notu (2026-06-13, çok-ajanlı workflow)

Bu plan, [`plans/airdrop_tool/`](.) altındaki 7 derin-açı dokümanına genişletildi (15-ajanlı,
repo+Stellar-skill grounded, adversarial doğrulanmış). Doğrulama, **bu planın ilk taslağındaki bazı
iddiaların repo ile çeliştiğini** ortaya çıkardı. **Aşağıdaki düzeltmeler bağlayıcıdır** ve ilgili
bölümler güncellendi; derin açıklamalar `plans/airdrop_tool/` dokümanlarındadır:

1. **Fonlama = `transfer_from` (allowance-pull), düz `transfer` DEĞİL.** Repo factory'si
   `token::TokenClient::transfer_from(spender=factory, from=owner, to=instance, amount)` kullanır
   (`contracts/soroban/zarf/factory/src/lib.rs:206-221`); owner **önce factory'ye `approve` (allowance)
   vermek zorundadır**, yoksa fonlama fail eder (test `factory/tests/factory.rs:241`). create app'te bu
   bir **ön-adım**; airdrop-factory da bu deseni izler. → [02-contract-spec], [01-threat-model].
2. **Yaprak = DÜZ `keccak256`; BN254 indirgemesi YOK.** Repo `recipient_id` =
   `BnScalar::from_bytes(keccak256(addr.to_xdr)).to_bytes()` — keccak üstüne **BN254 skaler indirgemesi**
   uygular (`factory/src/lib.rs:118-122`), bu **ZK devresi içindir**. Airdrop yaprağı bu indirgemeyi
   **miras almaz**; ortak olan yalnız `keccak256` host fonksiyonu + `to_xdr` serileştirmesi. → §4.3.
3. **claim = set-before-transfer + AÇIK rollback.** Repo, başarısız transfer/proof'ta claimed-guard'ı
   açıkça `false`'a geri yazar (`vesting/src/lib.rs:368-373,393-396`); atomik-revert'e bırakmaz. Ayrıca
   **per-claim çift-yönlü balance guard** (kontrat− / alıcı+, `vesting:378-397`) instance'ta da olmalı.
4. **MuxedAddress payout:** repo transfer hedefini `MuxedAddress`'e çevirir (`vesting:380-381`);
   muxed-`G…` claimant'ın leaf-hash'i ile transfer-hedefi tutarlılığı test-vektörüyle pinlenmeli.
   → [09-merkle-data-contract], [06-testing].
5. **Factory wasm'ı `include_bytes!` ile GÖMMEZ;** `wasm_hash: BytesN<32>` saklar, wasm ağa ayrı
   yüklenir; deploy `deployer().with_current_contract(salt)` (not `with_address`) +
   `deploy_v2` ile, salt **owner+salt** bağlı (`factory:124-129,315`). → [02-contract-spec].
6. **Wizard 3 adımdır** (Token/Create/Deploy); "4 adım" olan, step-2 içindeki **deploy mikro-stepper'ı**
   (Prepare/Backup/Approvals/Deploy). §15.0'daki "4-adım wizard" buna göre düzeltildi. → [07-ui-ux].
7. **pin-proxy `validateClaimList` mevcut hâliyle airdrop JSON'unu REDDEDER** (`merkleRoot`+boş-olmayan
   `leaves[]`+`schedule` zorunlu, `pin-proxy .../index.ts:236-253`). Airdrop `root`/`claims[]` (schedule
   yok) şeması için **validator güncellenmeli veya yeni route** gerekir. → [05-economics], [08-operations].
8. **claimed_statuses(start,limit)≤MAX_PAGE_LIMIT(80)** airdrop kararıdır; repo vesting
   `claimed_statuses(Vec<BytesN<32>>)≤MAX_CLAIMED_BATCH(64)` kullanır — bitmap-index vs epoch-commitment
   farkından meşru ama **gerekçelendirilmesi gereken** bir ayrılıktır. → [02-contract-spec].
9. **Sayısal işaretler:** per-claim fee ~**0.01–0.03 XLM** (yayınlanan Soroban profillemesi; eski
   "~0.001 XLM" iyimserdi). Trustline reserve "~0.5 XLM" ve ~180g TTL tavanı **"doğrulanmalı"** —
   skill/repo'da sabit değil. → [05-economics].

[02-contract-spec]: 02-contract-spec.md
[01-threat-model]: 01-threat-model-security.md
[09-merkle-data-contract]: 09-merkle-data-contract.md
[06-testing]: 06-testing-verification.md
[07-ui-ux]: 07-ui-ux.md
[05-economics]: 05-economics-cost-model.md
[08-operations]: 08-operations-runbook.md

---

## 1. Konumlandırma — ne olduğu / ne olmadığı

Bu araç, 1. turda konuşulan "normal airdrop tool"un ta kendisi: Uniswap MerkleDistributor /
disperse.app'in Stellar/Soroban karşılığı. Zarf ekosisteminin **ikinci, ayrı ürünü**.

| Boyut | Zarf çekirdek (mevcut) | Bu airdrop aracı (yeni) |
|---|---|---|
| Alıcı tanımlayıcı | E-posta (Google JWT/OIDC) | **Cüzdan adresi (`G…`/`C…`)** |
| Gizlilik | Zincirde kimlik gizli (ZK) | **Yok** — açık liste, normal |
| Dağıtım | Vesting (cliff/lineer) | **Anlık claim** |
| Doğrulama | UltraHonk ZK proof + VK | **Merkle inclusion proof** |
| Fee | (sponsor hedefi) | **Alıcı öder** (claim tx'i alıcı imzalar) |
| Kontrat | verifier+registry+vesting+factory + Noir | **Yeni bağımsız factory+instance**, devre yok |
| Off-chain | claimList + epoch discovery | claimList (proof'lu), pin-proxy/IPFS |
| Hedef kitle | Non-crypto, mahremiyet | **Kripto-yerlisi projeler, hız** |

**Paylaşılan tek şey:** monorepo altyapısı — `@zarf/core` (yeni `merkle` modülü eklenir),
`@zarf/ui` bileşenleri, **pin-proxy** worker'ı, ve indexer pattern'i. Kontrat ve devre tarafına
sıfır dokunuş.

## 2. Kilitlenen kararlar

| # | Karar | Seçim |
|---|---|---|
| 1 | Hak kazanma (eligibility) | **Cüzdan adresi + Merkle** (ZK yok) |
| 2 | Gizlilik | **Yok** — sade/normal dağıtım aracı ("airtable gibi" UX) |
| 3 | Ücret/akış | **Anlık claim, alıcı öder** |
| 4 | Mimari | **Factory + instance** (yeni bağımsız crate'ler) |
| 5 | Güven/geri-çekme | **Kampanya başına `locked` flag'i** (§4.4) |
| 6 | Token | **Her token, tek arayüz**; v1 sürtünmesiz yol = XLM + custom SEP-41 (§5) |
| 7 | Claim-list host | **pin-proxy/IPFS yeniden kullan** |

**Folded varsayımlar** (itiraz olmazsa böyle):
- Ayrı app'ler: `web/apps/airdrop-create` + `web/apps/airdrop-claim`.
- **Testnet-first**, sonra mainnet.
- **Pull/Merkle-claim** modeli v1; push/disperse modu v2.
- Claim'i **alıcı imzalar** (`claimant.require_auth()`); permissionless-execute opsiyonu §10'da not.
- Zarf alt-markası; ayrı domain (öneri: `drop.zarf.to` / `claim-drop.zarf.to`).

## 3. Üst-seviye mimari & akış

Model: **pull / Merkle-claim** (gönderen bir kez fonlar + kök yayınlar, alıcılar kendi fee'leriyle
çeker). "Alıcı öder" + "büyük listelere ölçeklenir" kararlarıyla birebir uyumlu.

```
GÖNDEREN (airdrop-create, "airtable gibi"):
  (addr, amount) tablosu  →  client-side Merkle ağacı (keccak256)  →  root
    →  AirdropFactory.create_airdrop(token, root, total, deadline, locked, salt, cid)
         ├─ factory deterministik salt ile MerkleAirdrop instance'ı deploy eder (deploy_v2 + __constructor)
         └─ transfer_from(spender=factory, owner→instance) ile fonlama (owner ÖNCE factory'ye approve verir; TokenTransferMismatch guard)
    →  proof'lu claim-list JSON'u pin-proxy ile IPFS'e pinle → CID

ALICI (airdrop-claim):
  cüzdan bağla (Stellar Wallets Kit / Freighter)
    →  CID'den JSON çek, kendi (index, amount, proof)'unu bul
    →  [klasik asset ise] gerekiyorsa trustline kur (§5)
    →  MerkleAirdrop.claim(index, addr, amount, proof) tx'ini İMZALA + GÖNDER (fee'yi ÖDER)
    →  kontrat: süre/claimed/proof doğrula → claimed işaretle → token.transfer(instance→addr)

GÖNDEREN (deadline sonrası):  withdraw_unclaimed(to)  → kalan fonu geri al (§4.4 kurallarına göre)
```

Indexer (opsiyonel): `AirdropCreated` + `Claimed` event'lerini izleyip dashboard'a ilerleme
(claimed/total, kalan, son claim'ler) sunar.

## 4. Soroban kontratları (yeni bağımsız crate'ler)

Mevcut `factory`/`vesting` konvansiyonlarını birebir takip eder: `#![no_std]`,
soroban-sdk `26.0.0-rc.1` (`default-features = false`, `["alloc"]`), target `wasm32v1-none`,
`__constructor` ile atomik init, typed `#[contracterror] #[repr(u32)]`, `#[contractevent]`,
`Result` (panik/`unwrap` yok), `keccak256`, TTL sabitleri (`DAY_IN_LEDGERS`/`TTL_EXTEND_TO`/
`TTL_THRESHOLD`), range-read sayfa limiti (`MAX_PAGE_LIMIT`).

İki crate (mevcut vesting↔factory ayrımını yansıtır):
- `contracts/soroban/zarf/airdrop/` — **MerkleAirdrop** instance (kampanya başına bir tane).
- `contracts/soroban/zarf/airdrop-factory/` — **AirdropFactory** (instance wasm'ını embed eder).

> Build sırası (CLAUDE.md notuna eklenir): airdrop-factory testleri için önce airdrop instance
> wasm'ı `--release` derlenmeli (vesting↔factory ile aynı bağımlılık).

### 4.1 AirdropFactory

`zarf-vesting-factory`'nin aynısının hafif türevi: deploy + atomik fonlama + keşif kaydı.

```rust
#[contracterror] #[repr(u32)]
pub enum Error {
    NotInitialized = 1, InvalidAmount = 2, InvalidMerkleRoot = 3,
    InvalidDeadline = 4, TokenTransferMismatch = 5,
}

#[contracttype]
pub enum DataKey {
    AirdropWasmHash,
    DeploymentCount,
    DeploymentAt(u32),                 // DeploymentInfo (range-read: 1 entry/item)
    OwnerDeploymentCount(Address),
    OwnerDeploymentAt(Address, u32),
}

#[contractevent(topics = ["airdrop_created"])]
pub struct AirdropCreated {
    #[topic] pub airdrop: Address,
    #[topic] pub owner: Address,
    #[topic] pub token: Address,
    pub total_amount: i128,
    pub recipient_count: u32,          // sadece event/metadata; on-chain doğrulanmaz
    pub merkle_root: BytesN<32>,
    pub metadata_cid: String,
}

pub fn __constructor(env: Env, airdrop_wasm_hash: BytesN<32>) { /* set + extend ttl */ }

pub fn create_airdrop(
    env: Env, owner: Address, token: Address, merkle_root: BytesN<32>,
    total: i128, deadline: u64, locked: bool, recipient_count: u32,
    salt: BytesN<32>, metadata_cid: String,
) -> Result<Address, Error> {
    owner.require_auth();
    // ÖN-KOŞUL: owner, bu factory'ye token allowance vermiş olmalı (token.approve(owner, factory, total, exp))
    // 1) owner+salt bağlı adres: deployer().with_current_contract(salt).deploy_v2(wasm_hash, ctor_args)
    //    __constructor(owner, token, root, total, deadline, locked)   (wasm ağa AYRI yüklenir; include_bytes! YOK)
    // 2) token.transfer_from(spender=factory, from=owner, to=instance, total); balance-before/after + checked_add → TokenTransferMismatch
    // 3) DeploymentInfo kaydet, AirdropCreated yayınla, TTL extend
}
```

> **Not (vesting-factory'deki `UsedRoot` neden GEREKMEZ):** Zarf'ta bir ZK proof
> `(merkle_root, audience_hash)`'e bağlı ama vesting adresine bağlı **değil**, bu yüzden aynı köklü
> iki kardeş aynı proof'u kabul edebiliyor → `UsedRoot` ile kök tekrarı engelleniyor. Burada **ZK
> proof yok**; her instance kendi köküne + kendi claimed-bitmap'ine + kendi fonuna sahip, depolama
> izole. A instance'ının fonu B'nin proof'uyla çekilemez (farklı kontrat = farklı bakiye). Dolayısıyla
> kök tekrarı serbest bırakılabilir; istenirse yaprak adres-binding ile ekstra sağlamlaştırma §4.3'te.

### 4.2 MerkleAirdrop instance

```rust
#[contracterror] #[repr(u32)]
pub enum Error {
    AlreadyClaimed = 1, InvalidProof = 2, Expired = 3, NotYetWithdrawable = 4,
    Unauthorized = 5, InvalidIndex = 6, NothingToWithdraw = 7,
}

#[contracttype]
pub struct Config {
    pub admin: Address,          // = kampanyayı başlatan (owner)
    pub token: Address,          // SAC veya custom SEP-41 (tek arayüz)
    pub merkle_root: BytesN<32>,
    pub total: i128,
    pub deadline: u64,           // ledger timestamp; 0 = süresiz
    pub locked: bool,            // §4.4
}

#[contracttype]
pub enum DataKey { Config, ClaimedWord(u32) }   // bitmap: word başına u64/u128

#[contractevent(topics = ["claim"])]
pub struct Claimed { #[topic] pub to: Address, pub index: u32, pub amount: i128 }

#[contractevent(topics = ["withdraw"])]
pub struct Withdrawn { #[topic] pub to: Address, pub amount: i128 }

pub fn __constructor(env: Env, admin: Address, token: Address,
    merkle_root: BytesN<32>, total: i128, deadline: u64, locked: bool) { /* set + ttl */ }

pub fn claim(env: Env, index: u32, claimant: Address, amount: i128,
             proof: Vec<BytesN<32>>) -> Result<(), Error> {
    // 1) deadline > 0 && now > deadline  → Expired
    // 2) is_claimed(index)               → AlreadyClaimed
    // 3) leaf = keccak256(0x00 ‖ index_be ‖ claimant.to_xdr ‖ amount_be)   (DÜZ keccak; BN254 indirgemesi YOK)
    //    verify_merkle(root, leaf, proof) → değilse InvalidProof
    // 4) claimant.require_auth()         (alıcı öder; permissionless opsiyonu §10)
    // 5) set_claimed(index)              (transfer'dan ÖNCE)
    // 6) to: MuxedAddress = (&claimant).into();
    //    token::TokenClient::new(&env, &token).transfer(&current_contract, &to, &amount)
    //    çift-yönlü balance guard (kontrat−/alıcı+) → uyuşmazsa TokenTransferMismatch
    // 7) HATA (proof/transfer fail) → set_claimed(index)=false AÇIK rollback (atomik-revert'e güvenme)
    // 8) Claimed{..}.publish(); TTL extend
}

pub fn is_claimed(env: Env, index: u32) -> bool;
pub fn claimed_statuses(env: Env, start: u32, limit: u32) -> Vec<bool>;  // ≤ MAX_PAGE_LIMIT
pub fn config(env: Env) -> Config;
pub fn withdraw_unclaimed(env: Env, to: Address) -> Result<(), Error>;   // §4.4
```

### 4.3 Merkle hashing spesifikasyonu (kontrat ↔ JS birebir aynı)

Repo `keccak256` host fonksiyonunu kullanıyor; aynı host fonksiyonuna + `to_xdr` adres
serileştirmesine yaslanıyoruz — ek bağımlılık yok, JS tarafında `@noble/hashes/sha3` `keccak_256`.
**DİKKAT (doğrulandı):** repo `factory::recipient_id` =
`BnScalar::from_bytes(keccak256(addr.to_xdr)).to_bytes()` — keccak üstüne **BN254 skaler indirgemesi**
uygular (`factory/src/lib.rs:118-122`), çünkü çıktı ZK devresine alan-elemanı olarak girer. **Airdrop
yaprağı bu indirgemeyi MİRAS ALMAZ** — düz `keccak256` çıktısını kullanır. Normatif byte-format
[09-merkle-data-contract](09-merkle-data-contract.md)'tadır (Rust↔JS tek kaynak).

- **Yaprak**: `keccak256(0x00 ‖ index_be(4B) ‖ claimant.to_xdr() ‖ amount_be(16B))`
- **Düğüm**: `keccak256(0x01 ‖ sorted(L, R))`  — `sorted` = leksikografik (OZ-stili; proof'ta
  yön bitine gerek kalmaz)
- Domain-separation tag'leri (`0x00` yaprak / `0x01` düğüm) **second-preimage** saldırısını kapatır
  (bir iç düğüm asla geçerli yaprak gibi görünemez).
- `to_xdr()` ile adres serileştirme `G…` (account), `C…` (contract/smart-wallet) ve muxed `M…`
  adreslerini kapsar. **Muxed dikkat:** payout `MuxedAddress`'e gider (`vesting:380`); leaf-hash ile
  transfer-hedefi tutarlılığı test-vektörüyle pinlenmeli ([06-testing](06-testing-verification.md)).
- **Opsiyonel sağlamlaştırma**: yaprağa instance kontrat adresini de kat
  (`… ‖ contract.to_xdr()`). Adres factory'nin deterministik salt'ından önceden türetilebilir, ama
  ağaç inşası adres-bağımlı hale gelir. Varsayılan: **katma** (instance izolasyonu yeterli, §4.1 notu);
  ihtiyaç olursa aç.

### 4.4 Güven / geri-çekme modeli — `locked` flag'i

Kullanıcı kararı: *"süre bitince kampanya başlatan çekip çekemeyeceğini baştan belirtir; eğer
işaretlerse süre boyunca çekemez; her şekilde deadline sonrası başlatan çekebilir."*

`withdraw_unclaimed(to)` kuralları:

```
admin.require_auth()
let now = env.ledger().timestamp();
if config.locked && (config.deadline == 0 || now <= config.deadline):
    return Err(NotYetWithdrawable)     // "işaretlediyse süre boyunca çekemez"
// aksi halde izinli: (locked && now > deadline)  ||  (!locked)
let bal = token.balance(current_contract);
if bal <= 0 { return Err(NothingToWithdraw) }
token.transfer(current_contract, to, bal)
Withdrawn { to, amount: bal }.publish()
```

İki parametre dört güven modunu zarifçe kapsar:

| `locked` | `deadline` | Davranış | Karşılığı |
|---|---|---|---|
| `false` | herhangi | İstediğinde çekebilir | İptal-edilebilir faucet |
| `true` | `T > 0` | T'ye kadar kilit, sonra çekebilir | **Deadline sonrası geri çekme** (default öneri) |
| `true` | `0` | Hiç çekilemez | **Trustless / geri çekilemez** |
| `false` | `T > 0` | İstediğinde çekebilir + T sonrası claim kapanır | Esnek |

> Not: `deadline > 0` ise `claim` da `now > deadline`'da kapanır (claim penceresi = deadline).
> `deadline == 0` + `locked=false` ⇒ süresiz açık, başlatan istediğinde toplar.

### 4.5 Fonlama & `TokenTransferMismatch` guard

Factory `create_airdrop` içinde atomik fonlama: deploy → `token.transfer(owner, instance, total)`,
transfer öncesi/sonrası instance bakiyesini ölç, fark `total` değilse `TokenTransferMismatch`.
Bu, **fee-on-transfer / rebasing** token'larda sessiz eksik-fonlamayı yakalar (vesting-factory ile
aynı guard). Eksik fonlanmış kampanyada son claim'ciler düşeceği için bu kritik.

### 4.6 Claimed bitmap & TTL

- `ClaimedWord(word)` → `u64`/`u128` maske; `word = index / W`, `bit = index % W`.
  10k alıcı ≈ 80–160 persistent entry. Adres-başına entry'den ucuz, range-read ile batch okunur.
- `claimed_statuses(start, limit)` `MAX_PAGE_LIMIT` (≈80) ile sınırlı — claim app filtreleme için.
- TTL: her `claim`/`withdraw` instance + ilgili `ClaimedWord` TTL'ini `TTL_THRESHOLD` altına
  inince `TTL_EXTEND_TO`'ya uzatır. Uzun süredir uykuda kampanyalar için harici
  `ExtendFootprintTTLOp` runbook'a not (factory ile aynı uyarı).

## 5. Token desteği (soroban + assets skilleriyle tartışıldı)

**Sonuç: kontrat seviyesinde herhangi bir token'ı tek arayüzle kabul et; ürün seviyesinde fazları ayır.**

Soroban standart token arayüzü (`soroban_sdk::token::Client` — `transfer/balance/decimals/…`) üç
durumu **aynı kodla** kapsar; kontrat sadece bir `token: Address` tutar:

| Token tipi | Arayüz | Trustline? | Notlar |
|---|---|---|---|
| **Native XLM** (native SAC) | `token::Client` | **Yok** | En sürtünmesiz; alıcı hesabı sadece var olmalı (min reserve) |
| **Klasik asset** (USDC, SAC) | `token::Client` | **Alıcı `G…` için ZORUNLU** | SAC transfer'i trustline'ı **otomatik kurmaz** → yoksa `op_no_trust`/fail |
| **Custom SEP-41** | `token::Client` | Yok (token kendi bakiyesini yönetir) | Klasik trustline mekanizması devrede değil |

**Klasik asset'lerde dikkat (yalnız USDC vb. için):**
1. **Trustline gate'i**: Alıcı `G…` hesabı, claim'den önce asset'e trustline kurmuş olmalı (her
   trustline subentry reserve ekler — rakam* dağıtım anında doğrulanmalı). Claim app'i claim'den önce
   **trustline-kur adımı** sunmalı. (Alıcı `C…` smart-wallet ise gerek yok — SAC bakiyeyi kontrat
   depolamasında tutar.)
2. **`AUTH_REQUIRED` issuer flag'i açık asset → açık airdrop'u KIRAR**: issuer her trustline'ı tek tek
   yetkilendirmek zorunda; permissionless claim imkânsız. Create app issuer flag'lerini çekip
   (`assets` skill: `account.flags`) bu asset'i **reddetmeli/uyarmalı**.
3. **`AUTH_CLAWBACK_ENABLED` → dağıtılan token issuer tarafından geri alınabilir**. Create app
   yine de bunu uyarı olarak göstermeli (alıcılar için residual risk).
4. **Instance (`C…`) fonlama**: SAC, kontrat adresine bakiyeyi kendi depolamasında tutar → instance'ı
   USDC ile fonlamak için instance'a trustline gerekmez. Sürtünme yalnız **alıcı `G…`** tarafında.

**Fazlama (ürün):**
- **v1 (sürtünmesiz, en iyi test edilen yol):** **native XLM + custom SEP-41**. Trustline/issuer-flag
  derdi yok; claim tek tık.
- **v1.1:** **klasik asset (USDC) desteği** — claim app'e trustline-ön-adımı, create app'e
  issuer-flag denetimi (`AUTH_REQUIRED` reddi, clawback uyarısı). Kontrat değişmez (aynı arayüz).

> Hesap-yokluğu/min-reserve: "alıcı öder" zaten fonlanmış bir XLM hesabı gerektirdiği için (fee +
> reserve), bu ön-koşul modelle tutarlı. Create/claim UI bunu net anlatmalı.

## 6. Paylaşımlı Merkle lib — `@zarf/core/lib/merkle`

- `buildTree(rows: {address, amount}[]) → { root, proofs, leaves }` — kontratla **bit-bit aynı**
  hashing (keccak256, domain tag'leri, XDR adres, big-endian `i128`).
- `verifyProof(root, leaf, proof)` (claim app'te ön-doğrulama).
- **Paylaşılan test vektörleri**: aynı `(index, address, amount) → leaf/root` vektör seti hem Rust
  unit testinde hem JS testinde tüketilir. Bu, Zarf'ın mevcut "byte-determinism/CID kontratı"
  disiplininin (claimListBuilder testleri) aynısı — divergence en büyük bug kaynağı, vektörle pinlenir.
- Bağımlılık: `@noble/hashes/sha3` (`keccak_256`) — saf TS, Workers-uyumlu. `check-any` /
  `check:budget` gate'lerine uyum.

> **Detaylı UI/UX akışı, wireframe'ler, durum tabloları ve kilitlenen UX kararları §15'te.**
> §7–§8 mimari/bileşen özeti, §15 ekran-ekran akış.

## 7. Create app — `web/apps/airdrop-create` ("airtable gibi")

- **Tablo editörü**: kolonlar `address | amount | (status)`; CSV import / yapıştır, satır
  ekle-düzenle-sil, inline validasyon.
- **Validasyon**: Stellar adres formatı (`G…`/`C…`, strkey checksum), duplicate tespiti, miktar > 0,
  toplam (Σ amount) canlı hesabı, decimals farkındalığı (token `decimals()`).
- **Token seçimi**: XLM / custom SEP-41 (v1); USDC vb. klasik (v1.1) — seçilince issuer-flag denetimi
  + trustline/clawback uyarıları (§5).
- **Akış**: client-side ağaç → `create_airdrop` (deploy+fonla) → claim-list JSON'u pin-proxy ile
  pinle → CID + instance adresi göster + paylaşılabilir claim linki (`?cid=…&c=…`).
- Reuse: `@zarf/ui` bileşenleri, mevcut Stellar Wallets Kit entegrasyonu, pin-proxy client.

**Claim-list JSON şeması** (IPFS'te public; proof'lar zararsız — token isolation sağlar):
```jsonc
{
  "v": 1,
  "network": "testnet",
  "airdrop": "C...",            // instance adresi
  "token": "C...",             // SAC/SEP-41 adresi
  "root": "hex32",
  "format": { "hash": "keccak256", "leaf": "0x00|idx|xdr|amount", "node": "0x01|sorted" },
  "claims": [                   // index = dizideki sıra
    { "address": "G...", "amount": "1000000", "proof": ["hex32", ...] }
  ]
}
```

## 8. Claim app — `web/apps/airdrop-claim`

- Cüzdan bağla (Wallets Kit/Freighter) → CID'den JSON çek → kendi adresinin entry+proof'unu bul →
  `is_claimed` ile durum → [klasik asset ise gerekiyorsa trustline kur] → `claim` tx'ini imzala+gönder.
- **Durum mesajları**: "already claimed", "expired (deadline geçti)", "trustline gerekli", "hesap
  fonlanmamış (min reserve)", "bu adres listede yok".
- Network passphrase + cüzdan-ağ uyumu denetimi (soroban skill pitfall #6/#12); tx simülasyonu
  (`simulateTransaction` → `assembleTransaction`) zorunlu (pitfall #10).

## 9. Indexer / dashboard (opsiyonel ama önerilir)

- Mevcut indexer pattern'iyle `AirdropCreated` + `Claimed` event'lerini izle.
- Gönderen paneli: kampanya başına ilerleme (claimed/total, kalan miktar, claim sayısı, son claim'ler),
  deadline geri-sayımı, `withdraw_unclaimed` butonu (kurallar §4.4'e göre aktif/pasif).
- `claimed_statuses` batch view ile claim app "kimler aldı" filtreleme.

## 10. Güvenlik checklist & edge-case'ler

- **Çift-claim**: bitmap `claim` içinde transfer'dan **önce** set edilir; Soroban'da klasik
  cross-contract reentrancy yok ama sıralama yine de claimed-before-transfer.
- **Second-preimage**: yaprak/düğüm domain tag'leri (§4.3).
- **Eksik fonlama**: `TokenTransferMismatch` guard (§4.5) + create'te Σ amount = total zorunlu.
- **Overflow**: tüm aritmetik `checked_*`; `amount > 0`, `total > 0`, `index < recipient_count`.
- **Yetki**: `claim` → `claimant.require_auth()`; `withdraw_unclaimed` → `admin.require_auth()` +
  `locked`/deadline kapısı. Factory `create_airdrop` → `owner.require_auth()`.
- **Storage key collision**: typed `DataKey` enum (soroban skill #5).
- **TTL/archival**: §4.6; archived entry asla "yok" sayılmaz, restore edilir (liveness-only).
- **Trustline/issuer-flag/clawback**: §5 (klasik asset).
- **Network binding**: root + instance ağa bağlı; cross-network replay yok. JSON `network` alanı
  claim app'te cüzdan-ağıyla denetlenir.
- **Front-running / permissionless-execute (karar noktası)**: proof + leaf public; fonlar her
  hâlükârda **leaf adresine** gider → bir başkası senin claim'ini tetiklerse sadece senin yerine fee
  öder (hırsızlık yok, sadece griefing — aslında iyi). Varsayılan: `claimant.require_auth()` zorunlu.
  İstenirse **permissionless-execute** (auth'suz; herkes herhangi bir leaf'i tetikleyip alıcıya
  gönderebilir) → sponsor/batch-claim için açılabilir. Bu, ileride "fee'siz onboarding" köprüsü olur.
- **Reserve/hesap yokluğu**: claim app net uyarır (§8).

## 11. Test stratejisi

**Kontrat (Rust, soroban skill Part 2):**
- Unit: happy-path claim; çift-claim → `AlreadyClaimed`; bozuk proof → `InvalidProof`;
  yanlış amount/index → `InvalidProof`; deadline sonrası claim → `Expired`.
- `withdraw_unclaimed` matrisi: `locked×deadline` dört kombinasyon + `NotYetWithdrawable` + yetkisiz.
- Fonlama: `TokenTransferMismatch` (mock fee-on-transfer token).
- Token tipleri: native SAC + mock SEP-41 (mümkünse mock klasik-SAC trustline-yok senaryosu →
  transfer fail beklenir).
- `claimed_statuses` sayfalama, `MAX_PAGE_LIMIT` sınırı.
- Factory: deploy+fonla atomikliği, deterministik adres, registry kayıtları, event'ler.
- **Paylaşılan Merkle vektörleri** Rust ↔ JS aynı root/leaf üretir (differential).
- Fuzz (`cargo-fuzz`): rastgele `(index, amount, proof)` → panik yok, sadece typed `Err`.

**Web:** Merkle lib birim testleri (vektörler), claim-list builder determinizmi (CID),
claim app durum makinesi (claimed/expired/no-trustline/not-in-list), create validasyonları.

## 12. Yol haritası, milestone'lar & efor

| M | İçerik | Efor |
|---|---|---|
| **M1 — Instance kontratı** | `zarf/airdrop` crate: claim/withdraw/bitmap/config + testler | M |
| **M2 — Factory kontratı** | `zarf/airdrop-factory`: deploy+fonla+registry+event + testler | S–M |
| **M3 — Merkle lib** | `@zarf/core/lib/merkle` + paylaşılan vektörler (Rust↔JS) | S |
| **M4 — Create app** | tablo editörü, ağaç, create_airdrop, pin-proxy yayını | M |
| **M5 — Claim app** | cüzdan, proof bul, claim, (v1.1) trustline akışı | S–M |
| **M6 — Indexer/dashboard** | AirdropCreated/Claimed izleme, ilerleme paneli | S |
| **M7 — CI/deploy** | iki yeni crate'i CI matrisine, iki app'i deploy workflow'una, runbook | S |

Tek track; **kontrat/devre/verifier/vesting değişmez**. Kabaca **M-büyük toplam**.
v1 = XLM + SEP-41 (M1–M6). v1.1 = klasik asset/USDC trustline akışı. v2 = push/disperse +
permissionless-execute.

## 13. Açık kararlar / sonraki onay

Aşağıdaki varsayımlarla ilerliyorum; değiştirmek istersen söyle:
1. **Hashing = keccak256** (repo ile uyumlu) — sha256 tercih edilirse her iki tarafta değişir.
2. **Yaprak adres-binding'i: kapalı** (instance izolasyonu yeterli) — açmak istersen §4.3.
3. **v1 token kapsamı = XLM + custom SEP-41**; USDC/klasik = v1.1.
4. **Claim = claimant-auth** (permissionless-execute v2'ye ertelendi).
5. **Ayrı app'ler + yeni domain**; pin-proxy yeniden kullanılır.
6. **Push/disperse modu = v2.**

## 14. Ek — CLAUDE.md / repo'ya yansıyacak değişiklikler

- `contracts/soroban/zarf/airdrop/` + `airdrop-factory/` (iki yeni bağımsız crate; workspace yok).
- CLAUDE.md "Common commands": airdrop crate test/build satırları + "factory testi için önce instance
  wasm" notu.
- `web/apps/airdrop-create` + `web/apps/airdrop-claim` (SvelteKit); `@zarf/core/lib/merkle` yeni modül.
- Deploy workflow: iki yeni Worker/app + `VITE_*` değişkenleri (factory adresi, pin-proxy URL).
- Runbook: kampanya oluşturma/fonlama + dormant-kampanya TTL uzatma + klasik-asset trustline notu.

## 15. UI Akışı & UX kararları (detay)

Mevcut `web/apps/create` ve `web/apps/claim` akışları haritalandı (2 explore ajanı). Temel içgörü:

> **Zarf claim akışı AĞIR** (Google → PIN → epoch discovery → cüzdan → ZK proof üretimi/yavaş →
> submit, 5 adım/`claimStore` step 1-5). Bu aracın claim'i **TRIVIAL**: Merkle proof anlık üretilir,
> Google/PIN/ZK yok. Claim ~2 tık olmalı — hız ürünün satış argümanı. Create'te mevcut wizard/Zen
> iskeleti korunur, 3 yerde bilinçli ayrılınır.

### 15.0 Mevcut desenden miras / ayrılış

| | Zarf create/claim | Airdrop aracı | Neden |
|---|---|---|---|
| Create iskelet | 3-adım wizard (`WizardSteps`: Token/Create/Deploy) + Zen | **Aynı wizard + Zen** | Tutarlılık, `@zarf/ui` reuse |
| Alıcı girişi | Sadece CSV upload (`DistributionRecipients`) | **Düzenlenebilir grid** + CSV | "Airtable gibi" ask; adres public, PII yok |
| Recipient persist | Redakte (emailler silinir) | **Saklanır** | Adres public → draft/devam serbest |
| Deploy mikro-stepper (step-2 içi) | 4 (Prepare/**Backup**/Approvals/Deploy) | **3 (Backup YOK)** | Sır/PIN yok → yedeklenecek şey yok |
| Schedule micro-step | Vesting (cliff/lineer, `DistributionSchedule`) | **Yok → deadline + `locked`** | Anlık claim; tek zaman ekseni |
| Success | Kontrat adresi (`/wizard/done`) | **Paylaşılabilir link + QR (hero)** | Dağıtım = teslim edilen şey |
| Claim akış | 5-adım stepper (ZK ağır) | **Tek-ekran state machine (~2 tık)** | Merkle proof anlık |
| Claim kimlik | Google + PIN (`authStore`) | **Sadece cüzdan** (`walletStore`) | Adres-tabanlı; `authStore` kullanılmaz |

### 15.1 KİLİTLENEN UX kararları
- **Create modeli = Wizard + grid adımı**: mevcut create app'iyle aynı 3-adım wizard
  (① Token → ② Alıcılar → ③ İncele&Dağıt); "Alıcılar" adımı airtable-grid + kampanya ayarları.
- **Claim girişi = İkisi birden**: cüzdan-first ana yol + küçük "ya da bir adres kontrol et"
  salt-okunur önizleme linki yan yana.

### 15.2 CREATE — adım adım

**① Token** (mevcut `step-0`'ı aynen miras al): SAC/SEP-41 contract ID yapıştır → metadata lookup
(debounce) → trust tier (curated/imported) + imported için acknowledge checkbox → preset chip'ler
(XLM, USDC). **Ek:** klasik asset seçilince issuer-flag denetimi (§5) — `AUTH_REQUIRED` açıksa
**reddet**, clawback açıksa **uyar**. XLM/SEP-41'de sürtünme yok.

**② Alıcılar — "Airtable" grid + kampanya ayarları** (aracın imzası; mevcut create'ten en büyük ayrılış):

```
┌─ Yeni Airdrop ───────────────────────── [Testnet ▾] [Cüzdan] ─┐
│ ① Token ── ● Alıcılar ── ③ İncele & Dağıt                     │
│  Alıcılar (1,240)        [⬆ CSV] [⬇ CSV] [+ Satır] [Yapıştır] │
│  ┌────────────────────────────┬───────────┬────┐             │
│  │ Adres                      │ Miktar    │    │             │
│  ├────────────────────────────┼───────────┼────┤             │
│  │ GABC…7K4Z  ✓               │ 100.00    │ 🗑 │             │
│  │ GD2…       ⚠ checksum      │ 50.00     │ 🗑 │             │
│  │ GABC…7K4Z  ⚠ tekrar        │ 25.00     │ 🗑 │             │
│  └────────────────────────────┴───────────┴────┘             │
│  Σ 84,200 TOKEN · 1,240 alıcı · ⚠ 2 hata                     │
│  Kampanya ⚙  Son tarih:[2026-09-01▾] ○Süresiz [✓]locked      │
│       → "Bitene kadar çekemezsin; sonra kalanı geri alırsın" │
│                                          [Geri] [İncele →]    │
└───────────────────────────────────────────────────────────────┘
```
- **Grid (`RecipientGrid.svelte`)**: Excel/Sheets'ten yapıştır, hücre-bazlı inline validasyon
  (strkey checksum, tekrar, miktar>0), canlı Σ. CSV import/export destekleyici. Mevcut
  `csvProcessor.ts` `address,amount` formatını zaten destekliyor — reuse.
- **Pool alanı YOK**: toplam = Σ miktar (tanım gereği). "Gereken fon" rakamı öne çıkar + bakiye denetimi.
- **deadline + `locked`** (vesting schedule yerine): §4.4'ün 4 güven modu iki kontrolle; `locked`
  altında düz-dil açıklama.
- Persist: liste localStorage'a saklanır (PII redaksiyonu YOK — adres public), draft/devam.

**③ İncele & Dağıt** (mevcut `step-2`'yi miras al, **Backup alt-adımı YOK** → 4 yerine 3):
1. **Hazırla** — Merkle ağacı (keccak256) + claim-list JSON'u `pinService`/pin-proxy ile pinle → CID.
2. **Bağla & Onayla** — `walletStore.requestConnection()`, bakiye ≥ Σ, token approval.
3. **Dağıt & Fonla** — `create_airdrop` (deploy+fonla atomik), mainnet onay kapısı,
   write-ahead-log recovery (mevcut `deployStore` deseni).

**④ Done — paylaşılabilir link hero'su**:
```
   ✓ Airdrop yayında
   ┌──────────────────────────────────────────┐
   │  claim-drop.zarf.to/?a=C…X9&cid=bafy…    │  [Kopyala] [QR]
   └──────────────────────────────────────────┘
   Kontrat: C…X9 · CID: bafy… · 1,240 alıcı
   [ Kampanyalarım ]   [ Linki Paylaş ]
```

**Kampanyalarım dashboard** (mevcut `/distributions`'ı miras al): ilerleme (claimed/total, indexer),
deadline geri-sayımı, durum, **Geri Çek** butonu (§4.4 kurallarına göre aktif/pasif).

### 15.3 CLAIM — tek-ekran state machine

Mevcut claim'in single-route SPA'sini miras al (`?a=<addr>&cid=<cid>`), ama `claimStore` çok sade
(epochs/proof/PIN/email YOK). Giriş = **ikisi birden**: cüzdan-first + "adres kontrol et" önizleme.

```
┌─ TOKEN Airdrop ───────────────────────── [Testnet] ─┐
│  84,200 TOKEN · 312/1,240 alındı · ⏳ 12 gün kaldı  │  ← şeffaflık/aciliyet
│   [ Cüzdan Bağla ]    ya da  [adres kontrol et ▸]   │  ← kimlik=cüzdan, Google YOK
│  bağlanınca (anlık eligibility):                     │
│   ✓ 100.00 TOKEN → GABC…7K4Z                         │
│   [ Claim Et ]  (fee ~0.01–0.03 XLM*, sen ödersin)   │
└──────────────────────────────────────────────────────┘
```
Akış: dağıtımı yükle → cüzdan bağla (veya adres yapıştır-önizle) → JSON'da adresi anlık ara →
Claim (Merkle proof client'ta anlık → `simulateTransaction`→`assembleTransaction` → imzala → gönder)
→ success. ZK spinner yok.

Render edilecek durumlar (`airdropClaimStore` derived):

| Durum | UI |
|---|---|
| Yükleniyor | spinner |
| Cüzdan yok | "Eligibility için cüzdan bağla" + adres-kontrol linki |
| Uygun + claim edilebilir | miktar + **Claim Et** |
| Uygun + **trustline gerekli** (klasik asset) | önce tek-tık "Trustline ekle" (§5), sonra claim |
| Zaten alınmış | ✓ + explorer linki |
| Listede yok | "Bu adres bu airdrop'ta değil" |
| Süre doldu | "Claim penceresi kapandı" |
| Yanlış ağ | "Cüzdanı … ağına geçir" (`isWrongNetwork`) |
| Hesap fonlanmamış | "Fee + reserve için XLM gerekli" |
| Gönderiliyor / Başarılı | buton spinner / ✓ + explorer + paylaş |

**Adres-kontrol-önizleme**: salt-okunur — adres yapıştır → JSON'da ara → "uygun: X TOKEN (claim için
cüzdan bağla)" / "listede yok". Cüzdan gerektirmez; meraklı/ön-kontrol için.

### 15.4 Bileşen & store reuse (sıfır yeni tasarım sistemi)
- **Aynen reuse:** `AppShell`, `PageHeader`, `NetworkToggle`, `ThemeToggle`, `WalletConnectButton`,
  `WalletSelectionModal`, `WalletBadge`, `ZenButton/Card/Input/NumberInput/Select/Checkbox/Alert/
  Spinner/Badge`, `ToastContainer`, `AddressInput`, `Tooltip`.
- **Store reuse:** `walletStore`, `networkStore`, `themeStore` (`@zarf/ui`). `authStore`/Google **YOK**.
- **Yeni:** `RecipientGrid.svelte` (create); sade runes store'lar `campaignStore` (create, mevcut
  `wizardStore`+`deployStore` deseni minus PII-redaksiyon/backup) ve `airdropClaimStore` (claim, mevcut
  `claimStore` minus epochs/proof/PIN); `@zarf/core/lib/merkle`.
- **Stil/pattern:** Zen tokens + Tailwind v4 (mevcut `app.css` deseni), Svelte 5 runes + localStorage.

### 15.5 Öne çıkan UX kararları (özet + neden)
1. Düzenlenebilir grid > CSV-only — airtable ask; adres public.
2. Backup adımı kaldırıldı — sır yok; deploy 4→3.
3. Schedule yerine deadline + `locked` — anlık claim.
4. Claim = tek-ekran ~2 tık — Merkle anlık; hız satış noktası.
5. Paylaşılabilir link + QR = success hero — dağıtım teslim edilen şey.
6. Trustline koşullu inline — sadece klasik asset.
7. Şeffaflık barı (claimed/total + geri sayım) — sosyal kanıt + aciliyet.
8. Claim girişi ikisi birden — cüzdan-first + adres-önizleme.
</content>
</invoke>

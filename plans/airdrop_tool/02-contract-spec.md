# 02 — Kontrat Spesifikasyonu / ABI

> Bu doküman, [`plans/airdrop_tool/airdrop-tool-design.md`](airdrop-tool-design.md) ile kararlaştırılan
> **standalone airdrop aracı**nın (Zarf ZK/e-posta çekirdeğinden **ayrı**, klasik
> **cüzdan-adresi + Merkle-claim** dağıtımcısı) iki yeni Soroban kontratının **tam arayüz
> spesifikasyonudur**: `AirdropFactory` ve `MerkleAirdrop` instance. Her fonksiyon için imza,
> `require_auth` gereksinimi, parametre semantiği, dönüş, pre/post-condition ve atılabilecek
> hata kodları verilir. Merkle byte-formatı (kontrat ↔ JS pin), event şemaları, storage layout,
> bitmap word düzeni, TTL stratejisi ve claim-list JSON şeması **implementation-grade** somutlukta
> tanımlanır. Mevcut `verifier`/`registry`/`vesting`/`factory`/devre kontratlarına **DOKUNULMAZ**;
> ABI doğrudan repo konvansiyonundan ([`zarf/factory/src/lib.rs`](../contracts/soroban/zarf/factory/src/lib.rs),
> [`zarf/vesting/src/lib.rs`](../contracts/soroban/zarf/vesting/src/lib.rs)) türetilir.
> Bu bir tasarım kontratıdır; her Stellar/Soroban iddiası `soroban`+`assets` skill'lerine ve
> repodaki kaynak satırlara dayanır. Sabit-olmayan ağ-seviyesi sayılar (reserve, fee, TTL tavanı)
> açıkça **"doğrulanmalı"** işaretlidir — uydurulmamıştır.
> DURUM: Spesifikasyon kararlaştırıldı, implementasyon bekliyor.

---

## 1. Kapsam, crate'ler ve ortak sabitler

İki yeni bağımsız crate (workspace yok; mevcut dört crate ayrımını yansıtır):

| Crate | Dizin | Rol | Bağımlılık |
|---|---|---|---|
| `zarf-airdrop-soroban` | `contracts/soroban/zarf/airdrop/` | **MerkleAirdrop** instance (kampanya başına bir) | yok (sadece `soroban-sdk`) |
| `zarf-airdrop-factory-soroban` | `contracts/soroban/zarf/airdrop-factory/` | **AirdropFactory** (instance wasm-**hash**'ini tutar) | instance wasm hash'i (ağa ayrı yüklenir) |

> **DÜZELTME — Factory instance wasm'ını `include_bytes!` ile GÖMMEZ.** Repo'da
> `zarf-vesting-factory` instance wasm'ını kendi kontrat kaynağına gömmez; sadece
> `__constructor(env, vesting_wasm_hash: BytesN<32>)` ile verilen **wasm hash**'i instance
> storage'da tutar ([`factory/src/lib.rs:92-104`](../contracts/soroban/zarf/factory/src/lib.rs)) ve
> deploy anında `deploy_v2(wasm_hash, …)`'a geçer ([`factory/src/lib.rs:312,320`](../contracts/soroban/zarf/factory/src/lib.rs)).
> Instance wasm'ı **ağa ayrı yüklenir** (`stellar contract upload` / test ortamında
> `env.deployer().upload_contract_wasm(...)`) ve dönen hash factory deploy'unda argüman olarak
> verilir. `include_bytes!` yalnızca **test harness'ında** geçer
> ([`factory/tests/factory.rs:13-14`](../contracts/soroban/zarf/factory/tests/factory.rs) +
> `upload_contract_wasm` çağrısıyla), factory crate **kaynağında değil**. Airdrop-factory de aynı
> modeli izler: airdrop instance wasm'ı önce yüklenir → hash factory `__constructor`'ına verilir.

**Dağıtım/build sırası:**
1. `zarf/airdrop` instance crate'i `--release` (`wasm32v1-none`) derlenir.
2. Instance wasm ağa yüklenir → `airdrop_wasm_hash` elde edilir.
3. `zarf/airdrop-factory` deploy edilir; `__constructor`'a bu hash verilir.
4. Factory testleri instance wasm'ını `include_bytes!` ile **test ortamına** yükler — bu yüzden
   factory testlerinden önce instance `--release` derlenmiş olmalı
   ([`factory/tests/factory.rs:13-14,55`](../contracts/soroban/zarf/factory/tests/factory.rs) ile
   birebir aynı bağımlılık; `zarf/vesting`↔`zarf/factory` deseni).

Ortak Cargo profili ve toolchain ([`factory/Cargo.toml`](../contracts/soroban/zarf/factory/Cargo.toml) ile aynı):

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = { version = "26.0.0-rc.1", default-features = false, features = ["alloc"] }

[dev-dependencies]
soroban-sdk = { version = "26.0.0-rc.1", default-features = false, features = ["alloc", "testutils"] }

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
panic = "abort"
strip = true
overflow-checks = true

[lints.clippy]
# Soroban kontrat constructor/metotları meşru biçimde çok argüman alır.
too_many_arguments = "allow"
```

> **Çelişki notu (rapor edilir):** Ana plan ve görev kararı "soroban-sdk 26.x" der; repodaki
> dört crate'in **fiili pin'i `26.0.0-rc.1`**'dir
> ([`factory/Cargo.toml:10,13`](../contracts/soroban/zarf/factory/Cargo.toml)). Tutarlılık için iki
> yeni crate de bu tam pin'i kullanır; "26.x" ifadesi `^26` olarak yorumlanmamalı, aksi halde drift
> CI'da yakalanır.

`#![no_std]`, target `wasm32v1-none`, `__constructor` ile atomik init, typed
`#[contracterror] #[repr(u32)]`, `#[contractevent]`, `Result` (panik/`unwrap` yok), `keccak256`.

### 1.1 TTL ve sayfalama sabitleri (vesting/factory'den birebir miras)

[`vesting/src/lib.rs:24-41`](../contracts/soroban/zarf/vesting/src/lib.rs) ve
[`factory/src/lib.rs:13-27`](../contracts/soroban/zarf/factory/src/lib.rs) ile aynı değerler:

```rust
pub const DAY_IN_LEDGERS: u32 = 17_280;              // ~5s ledger kapanışında bir gün
pub const TTL_EXTEND_TO: u32  = 120 * DAY_IN_LEDGERS; // ~120 gün, ~180 günlük ağ tavanının altında
pub const TTL_THRESHOLD: u32  = TTL_EXTEND_TO - DAY_IN_LEDGERS; // günde en çok bir kez rent bump
pub const MAX_PAGE_LIMIT: u32 = 80;  // factory range-read tavanı (footprint girdisi ~100 sınırı)
```

> **`MAX_CLAIMED_BATCH` farkı:** Vesting `claimed_statuses` için ayrı, daha muhafazakâr bir
> `MAX_CLAIMED_BATCH = 64` tavanı tutar ([`vesting/src/lib.rs:34-41`](../contracts/soroban/zarf/vesting/src/lib.rs)),
> çünkü orada giriş `Vec<BytesN<32>>` (commitment başına bir entry) ve claim tooling ekstra okuma
> yığar. Airdrop instance'ının `claimed_statuses`'ı **aralık** (`start, limit`) okur, commitment
> listesi almaz; bu yüzden factory ile aynı `MAX_PAGE_LIMIT = 80` tavanını kullanır (her index ≠ bir
> entry; 128 index/word). Yani airdrop instance'ı için **ayrı bir `MAX_CLAIMED_BATCH` sabiti
> gerekmez** — `MAX_PAGE_LIMIT` yeterli ve tutarlı. (Taslaktaki "MAX_CLAIMED_BATCH=64 instance batch
> tavanı" satırı yanıltıcıydı; airdrop bitmap-aralığı okuduğundan kaldırıldı.)

`DAY_IN_LEDGERS=17_280` sabittir; **~180 günlük maksimum entry TTL** değeri repo yorumundan alıntıdır
([`factory/src/lib.rs:15-22`](../contracts/soroban/zarf/factory/src/lib.rs),
[`vesting/src/lib.rs:26-33`](../contracts/soroban/zarf/vesting/src/lib.rs)) ve ağ-seviyesi tam tavan
**dağıtım anında doğrulanmalı** (testnet/mainnet parametreleri değişebilir).

---

## 2. AirdropFactory — tam ABI

`zarf-vesting-factory`'nin sadeleştirilmiş türevi: deploy + atomik fonlama + keşif kaydı.
**ZK alanları yok** (`verifier`/`jwk_registry`/`audience_hash` çıkarıldı); **`UsedRoot` yok**
(gerekçe §2.6).

### 2.1 Hata enum'u

```rust
#[contracterror] #[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized        = 1,  // instance storage'da beklenen anahtar yok (uninit/archived)
    InvalidRecipientCount = 2,  // recipient_count == 0
    InvalidAmount         = 3,  // total < 0 (fonlamada total == 0 da reddedilir)
    InvalidLimit          = 4,  // range-read limit > MAX_PAGE_LIMIT
    InvalidMerkleRoot     = 5,  // root tüm-sıfır (boş ağaç) — airdrop'ta root daima nonzero
    InvalidDeadline       = 6,  // deadline > 0 && deadline <= now (geçmiş son tarih)
    TokenTransferMismatch = 7,  // fonlama sonrası bakiye != önce + total (fee-on-transfer guard)
}
```

> **Repr doğrulaması (factory ile karşılaştırıldı):** Repo factory enum'u
> ([`factory/src/lib.rs:32-44`](../contracts/soroban/zarf/factory/src/lib.rs)):
> `NotInitialized=1, InvalidRecipientCount=2, InvalidAmount=3, InvalidLimit=4, InvalidMerkleRoot=5,`
> `InvalidAudience=6, TokenTransferMismatch=7, MerkleRootAlreadyUsed=8`.
> Airdrop-factory `1..5` ve `7` slotlarını **birebir** miras alır. **Slot 6**: factory'de
> `InvalidAudience` olan slot, airdrop'ta ZK olmadığından **`InvalidDeadline`** ile yeniden
> kullanılır (bilinçli ayrılış — `InvalidAudience`/`MerkleRootAlreadyUsed` taşınmaz).
> `is_canonical_field` BN254 denetimi de taşınmaz: airdrop root'u bir `keccak256` çıktısıdır, BN254
> scalar değildir ([`factory/src/lib.rs:447-458`](../contracts/soroban/zarf/factory/src/lib.rs)
> sadece ZK alanları için anlamlı). `InvalidMerkleRoot=5` burada **yalnızca tüm-sıfır** kökü
> reddeder.

### 2.2 Storage / DataKey

[`factory/src/lib.rs:46-67`](../contracts/soroban/zarf/factory/src/lib.rs) deseniyle birebir,
ZK alanları çıkarılmış:

```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    AirdropWasmHash,                 // instance (BytesN<32>) — ağa yüklenen instance wasm hash'i
    DeploymentCount,                 // instance (u32)
    DeploymentAt(u32),               // persistent: DeploymentInfo (range-read: 1 entry/item)
    OwnerDeploymentCount(Address),   // persistent (u32)
    OwnerDeploymentAt(Address, u32), // persistent: DeploymentInfo
    MetadataCid(Address),            // persistent: String (airdrop adresi → CID)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeploymentInfo { pub address: Address, pub metadata_cid: String }
```

`DeploymentAt`/`OwnerDeploymentAt` tam `DeploymentInfo` tutar → her range-read item'i **bir** ledger
entry'sine denk gelir ([`factory/src/lib.rs:53-60`](../contracts/soroban/zarf/factory/src/lib.rs)
notuyla aynı footprint hesabı). Saklama tipleri repo ile aynı: `AirdropWasmHash`/`DeploymentCount`
**instance**, geri kalanlar **persistent** ([`factory/src/lib.rs:350-367`](../contracts/soroban/zarf/factory/src/lib.rs)).

### 2.3 Event

```rust
#[contractevent(topics = ["airdrop_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AirdropCreated {
    #[topic] pub airdrop: Address,   // deploy edilen instance
    #[topic] pub owner:   Address,   // kampanya başlatan
    #[topic] pub token:   Address,   // SAC veya custom SEP-41
    pub total_amount:     i128,
    pub recipient_count:  u32,       // sadece metadata; on-chain doğrulanmaz
    pub merkle_root:      BytesN<32>,
    pub deadline:         u64,       // 0 = süresiz
    pub locked:           bool,
    pub metadata_cid:     String,
}
```

`VestingCreated` ([`factory/src/lib.rs:69-81`](../contracts/soroban/zarf/factory/src/lib.rs)) ile aynı
topic-tasarımı (3 indeksli topic: airdrop/owner/token); ek olarak `merkle_root`/`deadline`/`locked`
data alanları indexer'ın kampanya durumunu event'ten kurmasını sağlar (ekstra ledger okuması yok).
Repo'daki `VestingCreated` topic-tasarımı `data_format` belirtmez (çoklu data alanı), bu event de
öyle.

### 2.4 `__constructor`

```rust
pub fn __constructor(env: Env, airdrop_wasm_hash: BytesN<32>)
```

| | |
|---|---|
| **Auth** | yok (deploy anında bir kez çalışır; deploy eden tx imzalar) |
| **Pre** | — |
| **Etki** | `AirdropWasmHash = airdrop_wasm_hash`, `DeploymentCount = 0u32`; instance TTL extend |
| **Dönüş** | `()` — başarısızlık deploy'u atomik düşürür |

`zarf-vesting-factory::__constructor` ([`factory/src/lib.rs:92-104`](../contracts/soroban/zarf/factory/src/lib.rs))
ile aynı, sadece tek wasm-hash argümanı (verifier/registry yok). **Not:** `airdrop_wasm_hash`,
instance wasm'ının ağa **önceden yüklenmiş** olmasıyla elde edilen hash'tir (§1); constructor wasm'ı
gömmez, yalnızca hash'i kaydeder. Repo factory `__constructor`'ı `Result` değil `()` döner ve
validasyon yapmaz — bu desen korunur.

### 2.5 `create_airdrop` (deploy + atomik fonlama)

```rust
pub fn create_airdrop(
    env: Env, owner: Address, token: Address, merkle_root: BytesN<32>,
    total: i128, deadline: u64, locked: bool, recipient_count: u32,
    salt: BytesN<32>, metadata_cid: String,
) -> Result<Address, Error>
```

| | |
|---|---|
| **Auth** | `owner.require_auth()` — **ilk satır** ([`factory/src/lib.rs:188`](../contracts/soroban/zarf/factory/src/lib.rs) deseni). Atomik fonlama `transfer_from` ile owner'ın approve'una dayanır (§2.7). |
| **Parametreler** | `merkle_root`: keccak256 ağaç kökü (§5); `total`: instance'a transfer edilecek (= Σ amount); `deadline`: ledger timestamp, `0`=süresiz; `locked`: geri-çekme kilidi (§3.7); `recipient_count`: event metadata; `salt`: deterministik adres tohumu; `metadata_cid`: claim-list IPFS CID'i. |
| **Pre** | `recipient_count > 0` (yoksa `InvalidRecipientCount`); `total > 0` (yoksa `InvalidAmount`); `merkle_root` nonzero (yoksa `InvalidMerkleRoot`); `deadline == 0 \|\| deadline > now` (yoksa `InvalidDeadline`). |
| **Etki (sıra)** | 1) doğrulamalar; 2) `deployment_salt = keccak256(owner.to_xdr ‖ salt)`; 3) `env.deployer().with_current_contract(deployment_salt).deploy_v2(wasm_hash, (owner, token, root, total, deadline, locked))`; 4) atomik fonlama + `TokenTransferMismatch` guard (§2.7); 5) registry kayıt + `AirdropCreated` publish + TTL extend. |
| **Post** | instance deploy edilmiş + tam `total` fonlanmış; `DeploymentCount += 1`; owner-index güncel; CID kaydedilmiş. |
| **Dönüş** | `Ok(airdrop_address)` — `predict_airdrop_address` ile birebir eşleşir. |
| **Hatalar** | `InvalidRecipientCount`, `InvalidAmount`, `InvalidMerkleRoot`, `InvalidDeadline`, `TokenTransferMismatch`. |

> **DÜZELTME — deployer API.** Repo `deploy_v2`'yi **`with_current_contract(salt)`** üzerinden çağırır
> ([`factory/src/lib.rs:316-332`](../contracts/soroban/zarf/factory/src/lib.rs)); taslaktaki
> `with_address(current_contract, salt)` formu repoda **yoktur** ve bu deployer arayüzü yanlıştır.
> Adres tahmini de aynı API ile: `with_current_contract(salt).deployed_address()`
> ([`factory/src/lib.rs:124-129`](../contracts/soroban/zarf/factory/src/lib.rs)).

> **Karar (vesting-factory'den ayrılış):** Airdrop'ta `create` her zaman **fonlu**dur — vesting'teki
> `create_vesting` (fonsuz) + `create_and_fund_vesting` ikiliği
> ([`factory/src/lib.rs:132,175`](../contracts/soroban/zarf/factory/src/lib.rs)) yerine **tek**
> `create_airdrop` vardır. Gerekçe: anlık-claim airdrop'ta deferred-root/sonradan-deposit akışı yok;
> kampanya ya doğar doğmaz fonlanır ya da olmaz (eksik-fonlanmış kampanyada son claim'ciler düşer).

**Salt türetme** ([`factory/src/lib.rs:460-464`](../contracts/soroban/zarf/factory/src/lib.rs) `owner_bound_salt` ile birebir):

```rust
fn owner_bound_salt(env: &Env, owner: &Address, salt: &BytesN<32>) -> BytesN<32> {
    let mut preimage = owner.clone().to_xdr(env);     // owner XDR
    preimage.extend_from_array(&salt.to_array());     // ‖ salt
    env.crypto().keccak256(&preimage).to_bytes()
}
```

Adres `with_current_contract(deployment_salt).deployed_address()` ile **deploy'dan önce**
hesaplanabilir (create app, CID'i hesaba katmadan instance adresini gösterebilir).

### 2.6 Getter'lar ve range-read sayfalama

`zarf-vesting-factory`'nin getter setini birebir yansıtır
([`factory/src/lib.rs:235-298`](../contracts/soroban/zarf/factory/src/lib.rs)):

```rust
pub fn airdrop_wasm_hash(env: Env) -> Result<BytesN<32>, Error>;
pub fn predict_airdrop_address(env: Env, owner: Address, salt: BytesN<32>) -> Address;
pub fn get_deployment_count(env: Env) -> u32;
pub fn get_deployment(env: Env, index: u32) -> Result<Address, Error>;
pub fn get_deployments(env: Env, start: u32, limit: u32) -> Result<Vec<Address>, Error>;       // limit<=MAX_PAGE_LIMIT
pub fn get_deployment_info(env: Env, index: u32) -> Result<DeploymentInfo, Error>;
pub fn get_deployment_infos(env: Env, start: u32, limit: u32) -> Result<Vec<DeploymentInfo>, Error>;
pub fn get_owner_deployment_count(env: Env, owner: Address) -> u32;
pub fn get_owner_deployment(env: Env, owner: Address, index: u32) -> Result<Address, Error>;
pub fn get_owner_deployments(env: Env, owner: Address, start: u32, limit: u32) -> Result<Vec<Address>, Error>;
pub fn get_owner_deployment_info(env: Env, owner: Address, index: u32) -> Result<DeploymentInfo, Error>;
pub fn get_owner_deployment_infos(env: Env, owner: Address, start: u32, limit: u32) -> Result<Vec<DeploymentInfo>, Error>;
pub fn airdrop_metadata_cid(env: Env, airdrop: Address) -> Result<String, Error>;
```

`predict_airdrop_address` repo'daki `predict_vesting_address`
([`factory/src/lib.rs:124-129`](../contracts/soroban/zarf/factory/src/lib.rs)) ile aynı imza
(`owner, salt`) ve aynı iç mantık (`owner_bound_salt` → `with_current_contract` →
`deployed_address`).

**Sayfalama sözleşmesi** ([`factory/src/lib.rs:503-527`](../contracts/soroban/zarf/factory/src/lib.rs) `range_infos`):
`limit > MAX_PAGE_LIMIT` ⇒ `Err(InvalidLimit)`; `end = min(start.saturating_add(limit), count)`;
aralık boşsa boş `Vec` (hata değil). Tüm getter'lar salt-okuma → `require_auth` **yok**.

> **`UsedRoot` neden GEREKMEZ:** Zarf'ta bir ZK proof `(merkle_root, audience_hash)`'e bağlı ama
> vesting adresine bağlı **değil**, bu yüzden aynı köklü iki kardeş aynı proof'u kabul edebiliyor →
> `UsedRoot` ile kök tekrarı engelleniyor
> ([`factory/src/lib.rs:62-66,382-407`](../contracts/soroban/zarf/factory/src/lib.rs)).
> Burada **ZK proof yok**; her instance kendi köküne + kendi bitmap'ine + kendi fonuna sahip,
> depolama izole. A'nın fonu B'nin proof'uyla çekilemez (farklı kontrat = farklı bakiye). Dolayısıyla
> kök tekrarı **serbest** — `UsedRoot` ve `MerkleRootAlreadyUsed` taşınmaz. İstenirse yaprağa instance
> adresini katarak (§5.4) ekstra izolasyon sağlanır.

### 2.7 Fonlama & `TokenTransferMismatch` guard

`create_and_fund_vesting` ([`factory/src/lib.rs:206-221`](../contracts/soroban/zarf/factory/src/lib.rs))
deseniyle birebir:

```rust
let token_client = token::TokenClient::new(&env, &token);
let before = token_client.balance(&airdrop);
token_client.transfer_from(&env.current_contract_address(), &owner, &airdrop, &total);
let after = token_client.balance(&airdrop);
if after != before.checked_add(total).ok_or(Error::TokenTransferMismatch)? {
    return Err(Error::TokenTransferMismatch);
}
```

`transfer_from` factory'nin owner adına approve'una dayanır (create app, deploy tx'inden önce
`token.approve(owner, factory, total, expiration_ledger)` adımı sunar). Guard **fee-on-transfer /
rebasing** token'larda sessiz eksik-fonlamayı yakalar. `token::TokenClient` `soroban_sdk::token`
arayüzüdür ve SAC ile custom SEP-41'i ayrımsız kapsar — assets skill SAC standart token arayüzünü
`balance/transfer/approve/allowance/decimals/name/symbol` ile listeler (assets SKILL.md "SAC vs
Custom Token Interface").

---

## 3. MerkleAirdrop instance — tam ABI

### 3.1 Hata enum'u

```rust
#[contracterror] #[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    AlreadyClaimed        = 1,  // bu index'in claimed-bit'i set
    InvalidProof          = 2,  // hesaplanan kök != saklanan root (yanlış amount/index/proof dahil)
    Expired               = 3,  // deadline > 0 && now > deadline
    NotYetWithdrawable    = 4,  // locked && (deadline==0 || now<=deadline)
    Unauthorized          = 5,  // (ayrılmış; admin denetimi require_auth ile yapılır)
    InvalidIndex          = 6,  // (ayrılmış; bkz. §3.6 — v1 akışında dönmez)
    NothingToWithdraw     = 7,  // withdraw çağrısında bakiye <= 0
    NotInitialized        = 8,  // config okunamadı (uninit/archived)
    InvalidAmount         = 9,  // amount <= 0 (claim girişi savunması)
    TokenTransferMismatch = 10, // transfer sonrası bakiye beklenenle uyuşmaz
}
```

> Numerik repr ana plandaki `4.2` enum'unu genişletir (orada `1..7`); `NotInitialized=8`,
> `InvalidAmount=9`, `TokenTransferMismatch=10` eklenir (vesting `claim`'inin balance-before/after
> guard'ı [`vesting/src/lib.rs:378-397`](../contracts/soroban/zarf/vesting/src/lib.rs) taşınır).
> Bu, **bağımsız bir crate** olduğundan vesting'in numaralandırmasından farklı olması beklenir
> (vesting: `InvalidProof=1 … AlreadyClaimed=5 …`, [`vesting/src/lib.rs:46-66`](../contracts/soroban/zarf/vesting/src/lib.rs)).
> `Unauthorized=5` numerik slot'u ayrılmış tutulur (admin denetimi `require_auth` ile yapıldığından
> normal akışta dönmez; cross-network/ileride çoklu-admin için rezerve).

### 3.2 Config tipi ve DataKey / storage layout

```rust
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin:       Address,    // = kampanyayı başlatan owner
    pub token:       Address,    // SAC veya custom SEP-41 (tek arayüz)
    pub merkle_root: BytesN<32>, // keccak256 kök
    pub total:       i128,       // başlangıç fonlaması (= Σ amount)
    pub deadline:    u64,        // ledger timestamp; 0 = süresiz
    pub locked:      bool,       // §3.7
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Config,            // instance storage: Config (admin/token/root/total/deadline/locked tek struct)
    ClaimedWord(u32),  // persistent storage: u128 bitmap kelimesi (word = index / 128)
}
```

| Anahtar | Storage tipi | Gerekçe |
|---|---|---|
| `Config` | **instance** | Tek paylaşılan config; instance TTL ile yaşar (vesting `Owner/Token/...` instance kullanır, [`vesting/src/lib.rs:68-81,146-155`](../contracts/soroban/zarf/vesting/src/lib.rs)). |
| `ClaimedWord(word)` | **persistent** | Claim guard'ı arşivlenebilir-ama-restore-edilebilir olmalı (liveness-only); vesting `Claimed(commitment)` persistent kullanır ([`vesting/src/lib.rs:80,279-284`](../contracts/soroban/zarf/vesting/src/lib.rs)). |

> **`Config` tek-struct mı, ayrı anahtarlar mı?** Vesting her alanı ayrı `DataKey` ile tutar
> ([`vesting/src/lib.rs:68-81`](../contracts/soroban/zarf/vesting/src/lib.rs)). Airdrop'ta tüm config
> **deploy'da sabit** ve hiç değişmez (mutator yok), bu yüzden tek `Config` struct'ı **tek instance
> entry** = tek okuma + tek TTL extend; getter `config()` tek read döner. Bilinçli sadeleştirme.

### 3.3 Claimed bitmap — word/bit düzeni (KESİN spec)

- **Kelime genişliği** `W = 128` (`u128`). Soroban `u128` desteklenir, tek entry'de 128 alıcı.
- `word = index / W` (`index >> 7`), `bit = index % W` (`index & 127`).
- **Bit maskesi**: `1u128 << bit`. `is_claimed(index)` ⇔ `(word_value & (1 << bit)) != 0`.
- `ClaimedWord(word)` yok ise tüm bitleri `0` (hiç claim edilmemiş): `get(...).unwrap_or(0u128)`
  ([`vesting/src/lib.rs:279-284`](../contracts/soroban/zarf/vesting/src/lib.rs) `is_claimed`
  `unwrap_or(false)` deseniyle aynı boş-okuma).
- **Set**: `word_value |= 1 << bit`; `persistent().set(&ClaimedWord(word), &word_value)`.
- **Ölçek**: 10k alıcı ⇒ `ceil(10000/128)=79` persistent entry — `MAX_PAGE_LIMIT=80` ile bir
  sayfada okunur; adres-başına entry'den (10k entry) ~127× ucuz. *(aritmetik doğrulandı:
  10000/128 = 78.125 → 79.)*

```rust
const BITMAP_WORD_BITS: u32 = 128;
fn word_bit(index: u32) -> (u32, u32) { (index / BITMAP_WORD_BITS, index % BITMAP_WORD_BITS) }
```

> **Endianness uyarısı:** Bitmap *aritmetik* bir maskedir (`u128`), byte-serileştirme JS tarafına
> sızmaz — claim app yalnız `is_claimed(index)`/`claimed_statuses(...)` view'ları okur, ham word'leri
> yorumlamaz. Endianness yalnızca **Merkle yaprağında** (§5) load-bearing'dir.

### 3.4 Event'ler

```rust
#[contractevent(topics = ["claim"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic] pub to: Address,   // = leaf adresi = fon alıcısı
    pub index:  u32,
    pub amount: i128,
}

#[contractevent(topics = ["withdraw"], data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic] pub to: Address,   // admin'in seçtiği geri-alım hedefi
    pub amount: i128,
}
```

Topic tasarımı vesting `Claimed` ([`vesting/src/lib.rs:119-127`](../contracts/soroban/zarf/vesting/src/lib.rs))
ile hizalı (alıcı `#[topic]`, miktar data; `data_format = "single-value"` kullanımı repodaki
`Claimed`/`Deposited` event'leriyle aynı). `index`'i data'da tutarız ki indexer "kim hangi index'i
aldı" eşlemesini event'ten kursun (bitmap okumadan).

> **Not (data_format):** `data_format = "single-value"` event'in **tek** bir data değeri
> serileştirmesini ister; `Claimed`'de iki data alanı (`index`, `amount`) var. Repo'daki
> `single-value`'lu event'ler (örn. `MerkleRootSet`, `Deposited`) tek data alanına sahiptir
> ([`vesting/src/lib.rs:106-117`](../contracts/soroban/zarf/vesting/src/lib.rs)). Vesting `Claimed`
> ise `single-value` + tek data (`amount`) kullanır ([`vesting/src/lib.rs:119-127`](../contracts/soroban/zarf/vesting/zarf/vesting/src/lib.rs)).
> **Karar:** airdrop `Claimed`'de iki data alanı istendiğinden, ya `data_format` **kaldırılmalı**
> (varsayılan çoklu-alan map'i) ya da `index`/`amount` tek bir `(u32, i128)` data struct'ında
> birleştirilmeli. İmplementasyonda `data_format` niteliği SDK'nın çoklu-alan desteğine göre
> **derleme anında doğrulanmalı** — taslaktaki birebir form garanti değil.

### 3.5 `__constructor`

```rust
pub fn __constructor(
    env: Env, admin: Address, token: Address,
    merkle_root: BytesN<32>, total: i128, deadline: u64, locked: bool,
) -> Result<(), Error>
```

| | |
|---|---|
| **Auth** | yok (deploy anında; factory'nin deploy tx'i atomik) |
| **Pre** | `total > 0` (yoksa `InvalidAmount`); `merkle_root` nonzero — tüm-sıfır root reddedilir (yoksa `InvalidProof`). |
| **Etki** | `Config { admin, token, merkle_root, total, deadline, locked }` instance'a yazılır; instance TTL `TTL_THRESHOLD/TTL_EXTEND_TO` ile extend. |
| **Dönüş** | `Ok(())` — başarısızlık factory'nin `deploy_v2`'sini, dolayısıyla `create_airdrop`'u atomik düşürür. |

`zarf-vesting::__constructor` ([`vesting/src/lib.rs:131-158`](../contracts/soroban/zarf/vesting/src/lib.rs))
deseniyle aynı: validate → set → extend → `Ok(())` (vesting constructor'ı **`Result<(), Error>`**
döner, factory constructor'ından farklı). Factory `total>0`/`deadline`/root denetimini zaten yapar;
constructor bunları **tekrar** doğrular (instance bağımsız deploy edilirse savunma — defense in depth).

### 3.6 `claim`

```rust
pub fn claim(env: Env, index: u32, claimant: Address, amount: i128, proof: Vec<BytesN<32>>)
    -> Result<(), Error>
```

| | |
|---|---|
| **Auth** | `claimant.require_auth()` — alıcı kendi tx fee'sini öder (kilitlenen karar). |
| **Parametreler** | `index`: liste sırası (= bitmap konumu, claim-list JSON'da dizinin sırası); `claimant`: fon alıcısı `G…`/`C…`; `amount`: `i128`, big-endian 16B leaf'e girer (§5); `proof`: kökten yaprağa kardeş hash'ler (`Vec<BytesN<32>>`). |
| **Pre/koşul sırası** | (1) `cfg = config()`; (2) `cfg.deadline > 0 && now > cfg.deadline` ⇒ `Expired`; (3) `amount > 0` (yoksa `InvalidAmount`); (4) `is_claimed(index)` ⇒ `AlreadyClaimed`; (5) `leaf = keccak256(0x00 ‖ index_be32 ‖ claimant.to_xdr ‖ amount_be128)` + `verify_merkle(cfg.merkle_root, leaf, proof)` değilse `InvalidProof`; (6) `claimant.require_auth()`; (7) `set_claimed(index)` (**transfer'dan ÖNCE**); (8) `token.transfer(current_contract, claimant, amount)` + balance-before/after guard, fail ⇒ bit'i geri al + `TokenTransferMismatch`; (9) `Claimed{...}.publish()` + ilgili `ClaimedWord` ve instance TTL extend. |
| **Post** | `index`'in claimed-bit'i set; `amount` token claimant'a transfer edildi; tam-bir `Claimed` event'i. |
| **Dönüş** | `Ok(())`. |
| **Hatalar** | `Expired`, `InvalidAmount`, `AlreadyClaimed`, `InvalidProof`, `TokenTransferMismatch`, `NotInitialized`. |

> **Çift-claim kapanışı:** Bit transfer'dan **önce** set edilir; transfer guard'ı düşerse bit
> geri alınır (vesting [`vesting/src/lib.rs:364-397`](../contracts/soroban/zarf/vesting/src/lib.rs)
> `Claimed(...)=true` → fail → `Claimed(...)=false` rollback deseniyle birebir). Soroban'da klasik
> cross-contract reentrancy yoktur (soroban skill, "No Classical Reentrancy"), ama sıralama yine de
> claimed-before-transfer.
>
> **`InvalidIndex` ne zaman?** Varsayılan: index'i `recipient_count` ile **sınırlamayız** — proof
> doğrulaması zaten yanlış index'i `InvalidProof` ile reddeder (leaf `index`'i içerir). `recipient_count`
> on-chain saklanmadığından (`Config`'de yok, sadece event metadata) ayrı bir `index < N` kontrolü
> ekstra storage gerektirir; **eklenmez**. `InvalidIndex=6` numerik slot'u, ileride bitmap-word
> taşma savunması (`index/128` overflow) için rezerve.

**Transfer guard** (vesting'in iki-taraflı bakiye kontrolü, [`vesting/src/lib.rs:375-397`](../contracts/soroban/zarf/vesting/src/lib.rs)):

```rust
let token_client = token::TokenClient::new(&env, &cfg.token);
let cc = env.current_contract_address();
let (before_c, before_r) = (token_client.balance(&cc), token_client.balance(&claimant));
// Vesting alıcıyı MuxedAddress'e çevirir: let to: MuxedAddress = (&claimant).into();
let to: MuxedAddress = (&claimant).into();
token_client.transfer(&cc, &to, &amount);
if token_client.balance(&cc) != before_c.checked_sub(amount).ok_or(TokenTransferMismatch)?
   || token_client.balance(&claimant) != before_r.checked_add(amount).ok_or(TokenTransferMismatch)? {
    // bit rollback + Err(TokenTransferMismatch)
}
```

> **DÜZELTME/NET — `MuxedAddress`.** Repo vesting `claim`'i transfer'i ham `Address` ile değil,
> `let to: MuxedAddress = (&recipient).into();` dönüşümüyle yapar
> ([`vesting/src/lib.rs:380-381`](../contracts/soroban/zarf/vesting/src/lib.rs)) — bakiye okumaları
> ise düz `&recipient` ile. Airdrop guard'ı bu deseni birebir izler (taslaktaki düz
> `transfer(&cc, &claimant, …)` formu, `MuxedAddress` dönüşümü atlanırsa repo ile satır-satır
> uyumsuz olur). `MuxedAddress` importu `soroban_sdk::{… MuxedAddress …}` ile gelir.

### 3.7 `withdraw_unclaimed`

```rust
pub fn withdraw_unclaimed(env: Env, to: Address) -> Result<(), Error>
```

| | |
|---|---|
| **Auth** | `cfg.admin.require_auth()` ([`vesting/src/lib.rs:430-434`](../contracts/soroban/zarf/vesting/src/lib.rs) `require_owner` deseni). |
| **Pre (kilit kapısı)** | `cfg.locked && (cfg.deadline == 0 \|\| now <= cfg.deadline)` ⇒ `NotYetWithdrawable`. |
| **Pre (bakiye)** | `bal = token.balance(current_contract)`; `bal <= 0` ⇒ `NothingToWithdraw`. |
| **Etki** | `token.transfer(current_contract, to, bal)` + balance-before/after guard; `Withdrawn{to, bal}.publish()`; TTL extend. |
| **Post** | kalan bakiye `to`'ya çekildi (kampanya kuru kalır; claim edilmemiş yapraklar artık karşılıksız). |
| **Dönüş** | `Ok(())`. |
| **Hatalar** | `NotYetWithdrawable`, `NothingToWithdraw`, `TokenTransferMismatch`, `NotInitialized`. |

**Dört güven modu** (iki parametre):

| `locked` | `deadline` | Davranış | Karşılığı |
|---|---|---|---|
| `false` | herhangi | İstediğinde çekebilir | İptal-edilebilir faucet |
| `true` | `T > 0` | T'ye kadar kilit, sonra çekebilir | **Deadline sonrası geri-çekme** (default öneri) |
| `true` | `0` | Hiç çekilemez (`NotYetWithdrawable` daima) | **Trustless / geri-çekilemez** |
| `false` | `T > 0` | İstediğinde çekebilir + T sonrası claim kapanır | Esnek |

> `deadline > 0` ise `claim` da `now > deadline`'da `Expired` döner (claim penceresi = deadline).
> `deadline == 0` + `locked=false` ⇒ süresiz açık, admin istediğinde toplar.

### 3.8 View fonksiyonları

```rust
pub fn config(env: Env) -> Result<Config, Error>;          // tek instance read; NotInitialized
pub fn is_claimed(env: Env, index: u32) -> bool;           // bitmap bit testi; boş word => false
pub fn claimed_statuses(env: Env, start: u32, limit: u32)  // limit <= MAX_PAGE_LIMIT (yoksa InvalidLimit)
    -> Result<Vec<bool>, Error>;
pub fn admin(env: Env) -> Result<Address, Error>;          // kolaylık getter (= config().admin)
pub fn token(env: Env) -> Result<Address, Error>;
pub fn merkle_root(env: Env) -> Result<BytesN<32>, Error>;
```

`claimed_statuses(start, limit)` `start..min(start+limit, ...)` aralığındaki **her index** için bool
döner (bitmap'ten okur). Sözleşme vesting `claimed_statuses`
([`vesting/src/lib.rs:293-305`](../contracts/soroban/zarf/vesting/src/lib.rs)) ile *amaç* olarak
aynıdır, ancak **arayüz farklıdır**: vesting `Vec<BytesN<32>>` (commitment listesi) alır ve
`MAX_CLAIMED_BATCH=64` ile sınırlar; airdrop `(start, limit)` aralığı alır ve `MAX_PAGE_LIMIT=80`
ile sınırlar (factory range-read sözleşmesi — claim app filtreleme/dashboard için). View'lar
salt-okuma → `require_auth` yok. Arşivlenmiş (TTL-bitmiş) word `false` okur, ama on-chain `claim`
restore sonrası yine doğru reddeder (liveness-only).

---

## 4. Storage özeti (instance vs persistent) ve TTL stratejisi

| Kontrat | Anahtar | Tip | Storage | TTL |
|---|---|---|---|---|
| Factory | `AirdropWasmHash`, `DeploymentCount` | `BytesN<32>`, `u32` | instance | her `create` instance TTL extend |
| Factory | `DeploymentAt`, `OwnerDeploymentAt`, `OwnerDeploymentCount`, `MetadataCid` | çeşitli | persistent | yazımda `TTL_THRESHOLD/TTL_EXTEND_TO` |
| Instance | `Config` | `Config` | instance | her `claim`/`withdraw` extend |
| Instance | `ClaimedWord(word)` | `u128` | persistent | dokunulan word her `claim`'de extend |

**TTL stratejisi** ([`vesting/src/lib.rs:399-404,425-428`](../contracts/soroban/zarf/vesting/src/lib.rs) deseni):
her state-değiştiren çağrı (1) `extend_contract_ttl` ile instance+code TTL'ini, (2) yazılan persistent
entry'nin TTL'ini `TTL_THRESHOLD` altına inince `TTL_EXTEND_TO`'ya uzatır:

```rust
fn extend_contract_ttl(env: &Env) {
    env.deployer()
        .extend_ttl(env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
}
// claim içinde:
env.storage().persistent().extend_ttl(&DataKey::ClaimedWord(word), TTL_THRESHOLD, TTL_EXTEND_TO);
```

> Yukarıdaki `extend_contract_ttl` deseni hem factory hem vesting'te **birebir** aynıdır
> ([`factory/src/lib.rs:536-539`](../contracts/soroban/zarf/factory/src/lib.rs),
> [`vesting/src/lib.rs:425-428`](../contracts/soroban/zarf/vesting/src/lib.rs)).

Uzun süredir uykuda kampanyalar (örn. `deadline=0` trustless kilit, yıllarca açık) `TTL_EXTEND_TO`
penceresi (~120 gün) dolmadan **harici `ExtendFootprintTTLOp`** gerektirir — runbook'a not
(factory/vesting ile aynı uyarı, [`factory/src/lib.rs:15-18`](../contracts/soroban/zarf/factory/src/lib.rs),
[`vesting/src/lib.rs:26-29`](../contracts/soroban/zarf/vesting/src/lib.rs)).
Arşivlenen entry asla "yok" sayılmaz; restore edilir (`persistent` survives archival, soroban skill
"Persistent Storage — Survives archival").

---

## 5. Merkle byte-format — KESİN spec (kontrat ↔ JS pin)

Repo `keccak256` kullanır ([`factory::recipient_id`](../contracts/soroban/zarf/factory/src/lib.rs#L118)
= `keccak256(address.to_xdr)`); aynı host fonksiyonuna yaslanırız — ek bağımlılık yok. JS tarafı
`@noble/hashes/sha3` `keccak_256` (saf TS, Workers-uyumlu).

> **Önemli ayrım:** `factory::recipient_id`/`vesting::recipient_field`
> ([`vesting/src/lib.rs:521-525`](../contracts/soroban/zarf/vesting/src/lib.rs)) keccak çıktısını
> `BnScalar::from_bytes(...).to_bytes()` ile **BN254 scalar alanına** indirger (ZK devresiyle
> uyum için). Airdrop'ta **ZK yoktur** → bu BnScalar indirgemesi **uygulanmaz**; leaf/node ham
> `keccak256(...).to_bytes()` çıktısıdır (32B, mod-indirgemesiz). Bu, §2.1'deki "BN254 denetimi
> taşınmaz" kararıyla tutarlıdır.

### 5.1 Yaprak (leaf)

```
leaf = keccak256( 0x00  ‖  index_be(4B)  ‖  claimant.to_xdr()  ‖  amount_be(16B) )
```

| Alan | Boyut | Kodlama |
|---|---|---|
| domain tag | 1B | sabit `0x00` (yaprak) |
| `index` | 4B | **big-endian** `u32` (`index.to_be_bytes()`) |
| `claimant` | değişken | `Address::to_xdr(&env)` — Soroban XDR serileştirmesi; `G…` ve `C…`'yi ayrımsız kapsar |
| `amount` | 16B | **big-endian** `i128` (`amount.to_be_bytes()`); `amount > 0` |

Rust:
```rust
fn leaf(env: &Env, index: u32, claimant: &Address, amount: i128) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &[0x00]));
    buf.append(&Bytes::from_array(env, &index.to_be_bytes()));
    buf.append(&claimant.clone().to_xdr(env));
    buf.append(&Bytes::from_array(env, &amount.to_be_bytes()));
    env.crypto().keccak256(&buf).to_bytes()
}
```

> **`to_xdr()` pin'i load-bearing:** JS, adresi **kontratın gördüğü XDR byte'larıyla aynı** kodlamalı.
> dapp skill'in doğru primitifi: `StellarSdk.Address.fromString(addr).toScVal()` (dapp SKILL.md:311)
> → bu `ScVal`'in XDR'ı (`.toXDR()`) kontratın `Address::to_xdr` çıktısıyla eşleşmeli — **strkey
> decode değil!** Bu, repodaki en büyük bug kaynağı olan byte-divergence riskidir; **paylaşılan test
> vektörleriyle** (§7) pinlenir. (`Address::to_xdr`'ın tam byte düzeni `ScAddress` XDR'ıdır; JS/Rust
> eşleşmesi vektörle **doğrulanmalı**, varsayılmamalı.)

### 5.2 İç düğüm (node)

```
node = keccak256( 0x01  ‖  sorted(L, R) )      // sorted = leksikografik byte sıralaması
```

- Çocuklar **leksikografik** sıralanır (`L <= R` ise `L‖R`, değilse `R‖L`) → OZ-stili; proof'ta
  **yön biti gerekmez** (claim-list JSON proof'ları yalnız kardeş hash dizisidir).
- Domain tag `0x01` (düğüm), yaprak tag'i `0x00`'dan ayrı → **second-preimage** kapatılır (bir iç
  düğüm asla geçerli bir yaprak gibi görünemez).

```rust
fn hash_node(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let (lo, hi) = if a.to_array() <= b.to_array() { (a, b) } else { (b, a) };
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &[0x01]));
    buf.append(&Bytes::from_array(env, &lo.to_array()));
    buf.append(&Bytes::from_array(env, &hi.to_array()));
    env.crypto().keccak256(&buf).to_bytes()
}
```

### 5.3 Proof doğrulama (`verify_merkle`)

```rust
fn verify_merkle(env: &Env, root: &BytesN<32>, leaf: &BytesN<32>, proof: &Vec<BytesN<32>>) -> bool {
    let mut computed = leaf.clone();
    for sibling in proof.iter() { computed = hash_node(env, &computed, &sibling); }
    &computed == root
}
```

Tek-yaprak (proof boş) ağaçta `computed = leaf` → `leaf == root`. Hiç-kalmamış aralık
(odd node promotion) **sorted-pair** stratejisiyle ele alınır: tek kalan düğüm bir üst seviyeye
**kopyalanmadan** taşınır (JS builder bunu birebir uygular; vektörle pinlenir).

### 5.4 Opsiyonel sağlamlaştırma (varsayılan: KAPALI)

Yaprağa instance adresini katmak (`… ‖ contract.to_xdr()`), aynı kökün başka bir instance'da
yeniden kullanımını imkânsızlaştırır. Adres factory'nin deterministik salt'ından önceden türetilir,
ama ağaç inşası adres-bağımlı olur. **Varsayılan kapalı** — instance izolasyonu zaten yeterli (§2.6).
Açılırsa: tag `0x00`'dan sonra `contract.to_xdr()` eklenir; JS ve Rust **birlikte** değişir + vektör
yenilenir. (Plan §13'te "yaprak adres-binding'i kapalı" kararıyla tutarlı.)

---

## 6. claim-list JSON şeması (IPFS'te public)

Proof'lar zararsız — token isolation sağlar (fon her hâlükârda leaf adresine gider).

```jsonc
{
  "v": 1,                          // şema sürümü
  "network": "testnet",            // "testnet" | "mainnet" — claim app cüzdan-ağıyla denetler
  "airdrop": "C...",               // instance kontrat adresi (claim hedefi)
  "token": "C...",                 // SAC/SEP-41 adresi (trustline/decimals için)
  "root": "0x<hex64>",             // keccak256 kök, 0x + 64 hex (pin-proxy HEX_32 + core merkleRoot ile tutarlı)
  "format": {                      // hash sözleşmesinin makine-okunur pini (§5)
    "hash": "keccak256",
    "leaf": "0x00|index_be32|claimant_xdr|amount_be128",
    "node": "0x01|sorted(L,R)",
    "leafBinding": "none"          // "none" | "contract" (§5.4)
  },
  "claims": [                      // index = dizideki sıra (0-tabanlı)
    { "address": "G...", "amount": "1000000", "proof": ["<hex64>", "..."] }
  ]
}
```

Alan sözleşmeleri: `amount` **stringi**ndeki değer token'ın en küçük biriminde (`decimals()`
ölçeklenmiş), `i128` aralığında, `> 0`. `claims[i].index` **örtük**tir = dizinin sırası `i`
(kontrat `claim(index, ...)`'a bu `i` geçer). `root` hesaplanan kökle eşleşmeli; `network` ile
`airdrop`/`token` ağ-bağlamı tutarlı olmalı (cross-network replay yok, root + instance ağa bağlı).
`root`/proof'lar 32B → 64 hex karakter (`<hex64>`); taslaktaki `hex32` etiketi yanıltıcıydı, 32 byte
= 64 hex haneye netleştirildi.

---

## 7. Test vektörü kontratı (Rust ↔ JS differential)

Aynı `(index, address, amount) → leaf` ve `rows → root` vektör seti **hem** Rust unit testinde
**hem** JS testinde tüketilir (Zarf'ın mevcut claimListBuilder byte-determinism disiplini). Önerilen
fixture: `contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json`, web tarafı
`web/packages/core/lib/merkle/__tests__/vectors.json` ile **aynı dosyaya** sembolik bağlanır veya
build-time kopyalanır. Vektör en az şunları kapsar: tek-yaprak ağaç, çift sayıda yaprak, tek sayıda
yaprak (odd promotion), `C…` + `G…` karışık adresler, `amount` sınırları (`1`, `i128::MAX`).
Divergence en büyük bug kaynağıdır; bu fixture **load-bearing**'dir.

---

## 8. Güvenlik & token uyumu özeti (kontrat ABI'sini etkileyen)

| Konu | ABI etkisi | Kaynak |
|---|---|---|
| Çift-claim | bit transfer'dan **önce** set, fail'de rollback | §3.6; vesting [`lib.rs:364-397`](../contracts/soroban/zarf/vesting/src/lib.rs) |
| Second-preimage | yaprak/düğüm domain tag (`0x00`/`0x01`) | §5; soroban skill (input validation) |
| Eksik fonlama | `TokenTransferMismatch` guard | §2.7; factory [`lib.rs:206-221`](../contracts/soroban/zarf/factory/src/lib.rs) |
| Overflow | tüm aritmetik `checked_*`; `amount>0`, `total>0`; profil `overflow-checks = true` | soroban skill "Integer Overflow"; [`factory/Cargo.toml:21`](../contracts/soroban/zarf/factory/Cargo.toml) |
| Storage key collision | typed `DataKey` enum | soroban skill "Storage Key Collisions" |
| Klasik asset (USDC) | **kontrat değişmez** — alıcı `G…` claim'den önce trustline kurmalı; `AUTH_REQUIRED` issuer flag açık asset permissionless claim'i **kırar** (create app reddetmeli); `AUTH_CLAWBACK_ENABLED` uyarısı | assets skill: credit asset trustline gerekli (Asset Types tablosu), flags `AUTH_REQUIRED`/`AUTH_REVOCABLE`/`AUTH_CLAWBACK_ENABLED` (Flag Descriptions), SAC standart token arayüzü |
| Min reserve / hesap yokluğu | "alıcı öder" zaten fonlanmış XLM hesabı gerektirir (fee + base reserve + her trustline için ek reserve) | assets/dapp skill — **tam reserve rakamları (base reserve, trustline reserve) dağıtım anında doğrulanmalı; sabit sayı skill'lerde/repo'da yok** |
| Native XLM vs custom SEP-41 | her ikisi `soroban_sdk::token::Client` ile aynı kod yolundan geçer, trustline yok | assets skill: SAC standart token arayüzü; Asset Types "Native (XLM) — no trustline needed" |

> **Sayısal işaretleme (skeptik):** Taslaktaki "her trustline ~0.5 XLM reserve" ve claim UI'daki
> "fee ~0.001 XLM" gibi rakamlar ne `soroban`/`assets`/`dapp` skill'lerinde ne de repo'da sabit
> olarak bulunur. Bunlar ağ-parametresine bağlıdır (base reserve protokol parametresi, fee piyasa
> koşuluna bağlı) → **dağıtım anında doğrulanmalı**, ABI dokümanında kesin sayı olarak verilmez.
> (Bu rakamlar UI metni olarak `airdrop-claim` app'inde gösterilebilir ama kontrat ABI'sini
> bağlamaz.)

> **`InvalidIndex` ve `Unauthorized` slot'ları** ileride genişleme için rezerve (sırasıyla bitmap-word
> taşma savunması ve çoklu-admin); v1 normal akışında dönmezler.

---

## 9. ABI değişiklik kontrolü (geriye dönük)

- Bu iki kontrat **bağımsız**; mevcut `verifier`/`registry`/`vesting`/`factory`/devre ABI'lerine
  **sıfır dokunuş** — VK-redeploy tetiklenmez (CLAUDE.md load-bearing invariant korunur).
- CLAUDE.md "Common commands" bölümüne eklenecek (ayrı dokümanda işlenir): airdrop crate test/build
  satırları + "factory testi için önce instance wasm `--release`" notu (bu, instance wasm'ının
  test ortamına `include_bytes!`+`upload_contract_wasm` ile yüklenmesi içindir — §1).
- Numerik error repr'ları **dondurulmuştur**: bir kod yayınlandıktan sonra anlamı değişmez; yeni
  hata daima yeni numara alır (mevcut `#[contracterror]` konvansiyonu).
- Dağıtım önkoşulu: factory deploy'undan önce **instance wasm ağa yüklenmeli** ve hash'i factory
  `__constructor`'ına verilmeli (§1). Bu, vesting↔factory ile aynı operasyonel akıştır
  ([`factory/tests/factory.rs:55`](../contracts/soroban/zarf/factory/tests/factory.rs)
  `upload_contract_wasm` deseni).

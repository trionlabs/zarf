# Zarf Airdrop Aracı — Stellar/Soroban Derin Teknik

> Hedef: `plans/airdrop_tool/airdrop-tool-design.md`'de kilitlenen **standart (ZK-siz, cüzdan-adresi + Merkle-claim)
> airdrop aracının** Stellar/Soroban tarafının derin teknik analizi. Bu doküman ürün kararlarını
> **tekrar açmaz** — `claim` mekaniği, `locked`/deadline geri-çekme modeli, iki yeni crate (`zarf/airdrop`
> instance + `zarf/airdrop-factory`) ve mevcut verifier/registry/vesting/factory/devreye **dokunmama**
> kararı sabittir. Burada altı boyutu somutlaştırıyoruz: (a) SAC & trustline, (b) fee modeli & sponsorluk,
> (c) smart wallet / passkey, (d) reserve / min-balance, (e) TTL / rent, (f) pratik tx akışı.
> Her Stellar/Soroban/fee/reserve/SEP iddiası `assets`/`dapp`/`soroban`/`data`/`agentic-payments`
> SKILL.md dosyalarına + repo koduna dayandırılmıştır; emin olunamayan rakamlar **"doğrulanmalı"**
> olarak işaretlenmiştir.
> DURUM: Tasarım kararları sabit; bu doküman implementasyon-öncesi teknik kapanış katmanı.

> **Sürüm/araç tabanı (repo ile pinli):** `soroban-sdk = "26.0.0-rc.1"`, `default-features = false`,
> `features = ["alloc"]` (dev'de ayrıca `"testutils"`) — `contracts/soroban/zarf/factory/Cargo.toml`
> ve `.../vesting/Cargo.toml` ile teyitli. Target `wasm32v1-none`. Release profili: `opt-level = "s"`,
> `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`, `overflow-checks = true`
> (repo `factory/Cargo.toml`; skill'in generic `opt-level = "z"` önerisi **değil** — repo `"s"`
> kullanıyor, ona uyulur).

---

## 1. Token taşıma katmanı: native SAC, klasik SAC (USDC), custom SEP-41

Kontrat seviyesinde **tek arayüz** kararı (`plans/airdrop_tool/airdrop-tool-design.md:257-268`) doğru: `assets`
skill (`assets/SKILL.md:303-313`) SAC'ın standart Soroban token arayüzünü (`transfer`, `balance`,
`decimals`, `name`, `symbol`, `approve`, `allowance`) uyguladığını teyit eder. Instance kontratı
sadece bir `token: Address` tutar, transfer/balance çağrılarını `soroban_sdk::token::Client` üzerinden
yapar (`soroban/SKILL.md:381-391`). Üç token tipinin **aynı kod yolunu** paylaşmasının doğrulaması:

| Token tipi | Adres türetme | `token::Client` | Alıcı `G…` trustline | Kaynak |
|---|---|---|---|---|
| Native XLM (native SAC) | `Asset.native()` | ✓ | **Gerekmez** | `assets/SKILL.md:42-44` (native, no trustline needed) |
| Klasik asset / USDC (SAC) | `asset.contractId(passphrase)` deterministik | ✓ | **ZORUNLU** | `assets/SKILL.md:275-281` (deterministic SAC address); `assets/SKILL.md:42-46` |
| Custom SEP-41 | kendi `C…` adresi | ✓ | Yok (token kendi defterini tutar) | `assets/SKILL.md:303-327` |

### 1.1 Trustline mekaniğinin tam doğrulaması (klasik asset)

`plans/airdrop_tool/airdrop-tool-design.md:267,270-280`'deki trustline iddiaları skill'lerle birebir tutarlı:

1. **Klasik asset trustline gerektirir** — `assets/SKILL.md:42-44` "Credit / Issued by an account,
   **requires trustline**". Alıcı `G…` hesabı, asset'i alabilmek için `changeTrust` operasyonuyla
   önceden trustline kurmuş olmalı (`assets/SKILL.md:225-239`).
2. **Trustline başına reserve** — `assets/SKILL.md:434-438` "Respect trustline limits"; her trustline
   bir hesap-entry'si (subentry) ekler ve base-reserve katından ek reserve kilitler (rakam §4'te).
3. **SAC transfer'i trustline'ı otomatik KURMAZ** — `assets`/`soroban` skill'lerinde SAC'ın
   `transfer`'ının `changeTrust` çağırdığına dair **hiçbir ifade yoktur**; SAC sadece klasik asset'i
   Soroban'a köprüler (`assets/SKILL.md:259-301`). Trustline yoksa transfer hedef `G…` tarafında
   klasik trustline-yokluğu nedeniyle **başarısız olur** — alıcı önce trustline kurmalı.
   - **Hata kodu (doğrulanmış):** Klasik bir ödeme için eksik trustline `op_no_trust` döndürür —
     `soroban/SKILL.md:2296-2326` (Pitfall #8) ve hata-kodu referans tablosu `soroban/SKILL.md:2578`
     ("`op_no_trust` | Missing trustline | Create trustline first") ile **doğrulanmıştır**; draft'taki
     "etiket doğrulanmalı" hedge'i fazla temkinliydi.
   - **Açık kalan dar nokta (doğrulanmalı):** Yukarıdaki `op_no_trust`, klasik `payment`/`changeTrust`
     operasyon yüzeyine aittir. `claim` bir Soroban `invokeHostFunction` çağrısı olduğundan, SAC'ın
     `transfer`'ı trustline yokken çağrıldığında bu çağrının **aynı `op_no_trust` etiketini mi** yoksa
     bir kontrat-trap/`Error(Contract, #…)` yüzeyini mi simülasyonda döndürdüğü testnet'te bir SAC
     transfer simülasyonuyla **doğrulanmalı**; mekanik (transfer'in trustline'sız başarısızlığı) kesin,
     yalnız Soroban hata yüzeyindeki tam temsil doğrulanmalı.
4. **Instance (`C…`) fonlaması trustline GEREKTİRMEZ** — SAC, kontrat (`C…`) bakiyesini kendi
   contract storage'ında tutar (CAP-0046 SAC davranışı; skill-dışı, doğrulanmalı); sürtünme yalnız alıcı `G…`
   tarafındadır. `plans/airdrop_tool/airdrop-tool-design.md:280` ile aynı.

### 1.2 Issuer-flag matrisi (create app gate'i)

`assets/SKILL.md:174-179` flag tablosu, `plans/airdrop_tool/airdrop-tool-design.md:270-278`'deki create-app
denetimini doğrular. Create app, klasik asset seçildiğinde issuer hesabının `flags` alanını
Horizon ile çekmeli (asset stats `flags` döndürür, `assets/SKILL.md:368-381`):

| Issuer flag | Etki | Airdrop'a sonuç | Create app davranışı |
|---|---|---|---|
| `AUTH_REQUIRED` | Trustline'lar issuer onayı ister (`assets/SKILL.md:176`) | Permissionless claim **imkânsız** (her trustline tek tek `setTrustLineFlags` ister, `assets/SKILL.md:183-201`) | **REDDET** |
| `AUTH_REVOCABLE` | Issuer bakiyeleri dondurabilir (`assets/SKILL.md:177`) | Alıcı bakiyesi sonradan dondurulabilir | **UYAR** |
| `AUTH_CLAWBACK_ENABLED` | Issuer token'ı geri alabilir (`assets/SKILL.md:179,204-219`) | Dağıtılan token issuer'a geri çekilebilir (residual risk) | **UYAR** (`soroban/SKILL.md:1692-1705` clawback awareness) |
| `AUTH_IMMUTABLE` | Flag'ler kalıcı (`assets/SKILL.md:178`) | Yukarıdaki riskler sabitlenir | Bilgilendir |

Clawback kontrolü için somut client deseni `soroban/SKILL.md:1697-1704`:
`issuerAccount.flags.auth_clawback_enabled` → true ise uyar/reddet. Bu kontrol klasik-asset için
**Horizon** üzerinden yapılır (RPC `getAccount` yalnız tx-kurulumu için gereken alt-kümeyi döndürür,
`data/SKILL.md:340-342`); issuer flag'leri için `horizon.loadAccount` / `server.assets()` kullanılır.
Create-app v1.1'de bu kontrol zorunlu; v1 kapsamı (native XLM + custom SEP-41) bu gate'lere hiç girmez.

### 1.3 changeTrust + claim atomikliği (claim app çözümü)

Alıcı `G…` + klasik asset durumunda claim app, tek imza deneyiminde iki adımı birleştirmek isteyebilir.
Klasik `changeTrust` bir Horizon-tipi operasyondur (`assets/SKILL.md:225-239`); `claim` ise bir
Soroban `invokeHostFunction` operasyonudur. Submit yolları da ayrıdır: Soroban tx'leri RPC ile,
klasik tx'ler Horizon ile gönderilir (`dapp/SKILL.md:345-394`, `op.type === "invokeHostFunction"`
ayrımı). Pratik çözüm: **iki ardışık tx** —

- önce `changeTrust` (Horizon submit, `dapp/SKILL.md:383-394`),
- sonra `claim` (RPC simulate→assemble→submit, `dapp/SKILL.md:267-303,345-381`).

Claim app durum makinesinde bu "trustline gerekli" → "trustline ekle" → "claim et" sırasıyla zaten
modellenmiş (`plans/airdrop_tool/airdrop-tool-design.md:527`). Tek-Stellar-transaction atomikliği yerine
**idempotent yeniden-denenebilirlik** (trustline kurulduysa adımı atla) hedeflenir.

> Not: Tek bir klasik Stellar transaction'ı teorik olarak `changeTrust` + bir `payment`'ı tek
> imzada taşıyabilir; ancak `claim` bir Soroban host-function olduğundan ve Soroban tx'leri ayrı
> RPC simulate→assemble yolundan geçtiğinden (`dapp/SKILL.md:288-303`), bu araçta tek-tx birleştirme
> **uygulanabilir değildir**. İki-tx + idempotency doğru desendir.

---

## 2. Fee modeli & sponsorluk — "alıcı öder" gerçeği ve opsiyonel sponsored mod

### 2.1 Soroban kaynak/ücret modeli

`soroban/SKILL.md:1339-1341` Soroban'ın **çok-boyutlu kaynak modelini** açıkça listeler: *CPU
instructions, ledger reads/writes, bytes, events, rent*. Bir Soroban tx'inin toplam ücreti iki
bileşenden oluşur:

- **Inclusion fee** (klasik kısım): tx'in ledger'a alınması için teklif; SDK sembolü
  `StellarSdk.BASE_FEE` (`dapp/SKILL.md:249-250` `Operation.payment` örneğinde, `assets/SKILL.md:93`
  ve diğerlerinde sembolik olarak kullanılır). *(100 stroops/op = 0.00001 XLM **sayısal değeri**
  hiçbir skill dosyasında yazılı DEĞİL — skill'ler yalnız `BASE_FEE` sembolünü kullanıyor. Bu rakam
  SDK sabitidir ve mainnet ağ-yükü altında inclusion-fee piyasası değişebilir → **doğrulanmalı**.)*
- **Resource fee**: yukarıdaki kaynak boyutlarının (CPU/read-write/bytes/rent) ölçülen tüketimine
  karşılık gelen ücret. Bu yüzden `claim` tx'inin gerçek ücreti **simülasyonla** belirlenmeli
  (`dapp/SKILL.md:288-303`: simulate → resource estimates → `assembleTransaction`; `data/SKILL.md:117-120`
  `simulation.cost`).

`claim`'in kaynak profili sade: bir `ClaimedWord` persistent entry (read+write), bir SAC
`transfer` cross-contract çağrısı, bir event, instance + word TTL bump. `plans/airdrop_tool/airdrop-tool-design.md:513`'teki
"fee ~0.001 XLM" tahmini büyüklük olarak makul ama **kesin rakam testnet simülasyonuyla doğrulanmalı**
(`soroban/SKILL.md:1343-1353` `--sim-only` ile resource cost ölçümü).

### 2.2 "Alıcı öder" — varsayılan ve gerçek maliyeti

Kilitli karar: claim tx'ini **alıcı imzalar ve fee'sini öder** (`plans/airdrop_tool/airdrop-tool-design.md:24,49,
69`). Bunun ön-koşulu: alıcının `G…` hesabı **zaten var ve fonlu** olmalı — Stellar'da bir tx'in
fee'sini ödeyen kaynak hesabın var olması gerekir (`soroban/SKILL.md:2264-2291`: "Account Not Funded →
Account not found / Status 404"). Yani "alıcı öder" modeli sessizce şu ön-koşulu dayatır: **alıcı
zaten min-reserve + fee kadar XLM'e sahip aktif bir hesaba** sahiptir (§4). Create/claim UI bunu net
anlatmalı (`plans/airdrop_tool/airdrop-tool-design.md:288-289,532`).

### 2.3 Fee-bump / sponsored transaction (KARAR GÖZDEN GEÇİRME — varsayılan değişmez)

`dapp` + `agentic-payments` skill'leri, **fee'siz claim** için somut yollar verir; bu, "alıcı öder"
kararına opsiyonel bir **sponsored mod** eklemek için sağlam zemindir (varsayılanı değiştirmez):

1. **OpenZeppelin Relayer (Stellar Channels Service)** — `dapp/SKILL.md:643-664`: Stellar'ın **native
   fee-bump mekanizmasını** kullanarak gasless tx submit eder; *"users don't need XLM for fees"*.
   Deprecated Launchtube'un yerini alır. Testnet hosted: `https://channels.openzeppelin.com/testnet`
   (API anahtarı `/gen`), production self-host Docker. Submit API (`dapp/SKILL.md:655-660`):
   `client.submitSorobanTransaction({ func, auth })`.
2. **Smart Account Kit gasless** — `dapp/SKILL.md:641` "Gasless Transactions: Optional relayer
   integration for fee sponsoring".
3. **x402/Channels deseni** — `agentic-payments/SKILL.md:62`: client **auth entry'leri imzalar, full
   tx envelope'u değil**; facilitator tx'i birleştirir, fee öder, submit eder → *"Clients need zero
   XLM"*. Airdrop'a doğrudan analoji: alıcı sadece `claim` auth entry'sini imzalar, sponsor tx'i
   gönderir.

**Mimari sonuç (relayer'in `claim` için neden çalıştığı):** `claim`'in zaten
`permissionless-execute`'a yakın bir yapısı var — fonlar her hâlükârda **leaf adresine** gider, bir
başkası tx'i tetiklerse sadece alıcı yerine fee öder, hırsızlık yok (`plans/airdrop_tool/airdrop-tool-design.md:362-366`).
İki uyumlu tasarım:

- **(A) Fee-bump sponsorlu** (`claimant.require_auth()` korunur): sponsor sadece dış fee-bump'ı öder,
  iç auth alıcıya ait kalır → güvenlik aynı, alıcı XLM'siz claim eder.
- **(B) Permissionless-execute** (auth gevşetilir): herkes herhangi bir leaf'i tetikler; fon yine
  leaf'e gider. v2'ye ertelenmiş (`plans/airdrop_tool/airdrop-tool-design.md:366,408,410`).

| Mod | Alıcı XLM ihtiyacı | Üçüncü-parti bağımlılık | Güvenlik | Faz |
|---|---|---|---|---|
| Alıcı öder (varsayılan) | Evet (fee + reserve) | Yok | En basit | **v1** |
| (A) Fee-bump sponsor (OZ Relayer) | **Hayır** | OZ Channels / self-host | `require_auth` korunur | v1.1 opsiyonel |
| (B) Permissionless-execute | Hayır | Sponsor batch'i çalıştıran | auth gevşek, fon yine güvenli | v2 |

**Öneri:** varsayılanı koru (**v1 = alıcı öder**, sürtünmesiz test edilebilir), **(A) fee-bump
sponsorluğunu v1.1 opsiyonel mod** olarak ekle. Trade-off: sponsorlu mod onboarding'i ZK-çekirdek
"sponsor hedefi"yle (`plans/airdrop_tool/airdrop-tool-design.md:24`) hizalar ama OZ Channels'a operasyonel
bağımlılık + API-anahtar yönetimi getirir (Worker secret olarak, `CLAUDE.md` "Worker secrets go
through `wrangler secret`" konvansiyonuyla). Bu, mevcut `pin-proxy`/Worker desenine doğal oturur.

---

## 3. Smart wallet / passkey — C-address alıcılar ve trustline'sız yol

`dapp/SKILL.md:591-669` smart account / passkey desenini sağlar; bu, airdrop için iki avantaj açar:

1. **Trustline-yükünden kaçış (klasik asset için kritik):** Alıcı bir `C…` smart-wallet ise, klasik
   asset SAC bakiyesini **kontrat storage'ında** tutar (CAP-0046 SAC davranışı; skill-dışı, doğrulanmalı) → klasik
   `G…`-hesabı trustline mekanizması **devrede değil** (`plans/airdrop_tool/airdrop-tool-design.md:272-273,280`).
   Yani USDC airdrop'unda `C…` alıcılar §1.3'teki `changeTrust` ön-adımına hiç ihtiyaç duymaz. Bu,
   v1.1 USDC akışını smart-wallet kullanıcıları için v1 kadar sürtünmesiz yapar.
2. **Cüzdansız onboarding:** `dapp/SKILL.md:618-633` passkey ile `createWallet` → `C…` contractId;
   `kit.signAndSubmit(transaction)` ve hatta `kit.transfer(...)`. Bir alıcı hiç cüzdan kurmadan
   passkey ile bir `C…` hesabı yaratıp `claim` çağırabilir. Leaf adresi `to_xdr()` ile `G…`/`C…`
   ayrımsız serileştiği için (`plans/airdrop_tool/airdrop-tool-design.md:204`; `factory::recipient_id`'in
   `recipient.to_xdr(&env)` deseni — `contracts/soroban/zarf/factory/src/lib.rs:118-122`) Merkle
   ağacı `C…` adreslerini doğal kapsar; **create app, smart-wallet adreslerini listeye almak için
   ek değişiklik gerektirmez.**
3. **Gasless köprüsü:** Smart Account Kit'in opsiyonel relayer entegrasyonu (`dapp/SKILL.md:641,
   643-664`) §2.3'teki sponsored modla aynı OZ Relayer'ı kullanır → passkey + gasless claim tek
   pakette.

**SEP-45 bağlantısı:** `assets/SKILL.md:418-420` SEP-0045'in SEP-10'u **contract account'lara
(`C…`) genişlettiğini**, smart-wallet/passkey tabanlı anchor entegrasyonları için gerekli olduğunu
belirtir. Airdrop aracı v1'de SEP-45'e ihtiyaç duymaz (claim kimliği = cüzdan imzası; sunucu-taraflı
auth challenge yok); ancak ileride "claim portalına giriş" veya KYC'li airdrop senaryosunda `C…`
alıcılar için SEP-45 doğru standarttır. Şimdilik **kapsam dışı, gelecek köprüsü olarak not**.

**v1 kapsam kararı:** Smart-wallet/passkey, claim app'te `Stellar Wallets Kit` üzerinden zaten
opsiyonel gelir (`dapp/SKILL.md:188-230` `allowAllModules()`); `plans/airdrop_tool/airdrop-tool-design.md:539-542`
mevcut `walletStore`/Wallets Kit reuse'unu söylüyor. Ekstra passkey-kit (Smart Account Kit)
entegrasyonu **v1.1+** (USDC trustline-kaçış değeriyle birlikte gelmesi mantıklı).

---

## 4. Reserve / min-balance — hesap var olma ön-koşulu

Stellar hesap reserve mekaniği "alıcı öder" kararının görünmeyen ön-koşulu. Skill'lerden doğrulanan:

- **Yeni hesap fonlama (mainnet):** `Operation.createAccount` `startingBalance` ile, yorum:
  *"Minimum ~1 XLM for base reserve"* (`soroban/SKILL.md:2284-2290`). Yani bir `G…` hesabının var
  olması için **~1 XLM base reserve** gerekir (**teyitli**, skill yorumu).
- **Reserve-altı hata kodu:** Eksik reserve `op_low_reserve` döndürür (`soroban/SKILL.md:2580`,
  "`op_low_reserve` | Below minimum balance | Maintain reserve") — **teyitli**.
- **Testnet fonlama:** Friendbot — `https://friendbot.stellar.org?addr=G…`
  (`dapp/SKILL.md:94`, `soroban/SKILL.md:912,2277`, `data/SKILL.md:463`). Testnet-first
  kararıyla (`plans/airdrop_tool/airdrop-tool-design.md:47`) alıcılar Friendbot ile fonlanabilir.
- **Trustline başına ek reserve:** Her trustline bir hesap subentry ekler ve base-reserve katından
  ek reserve kilitler. `plans/airdrop_tool/airdrop-tool-design.md:272` "her trustline ~0.5 XLM reserve" rakamını
  veriyor; bu **0.5 XLM/entry** değeri Stellar base-reserve standardıdır ancak ilgili skill
  dosyalarında **açık sayısal teyit yoktur** → **doğrulanmalı** (resmi Stellar protokolünde base
  reserve = 0.5 XLM/entry, base account = 2×base reserve = 1 XLM; bu rakam resmi dökümanla teyit edilmeli;
  soroban:2287 yalnız "~1 XLM" der, 0.5/entry'yi söylemez).

**Sonuçlar (claim app durum mesajları, `plans/airdrop_tool/airdrop-tool-design.md:531-532`):**

| Durum | Tetikleyici | UI mesajı | Kaynak |
|---|---|---|---|
| Hesap yok / fonlanmamış | `getAccount` 404 (`dapp/SKILL.md:553-557`, `soroban/SKILL.md:2268-2272`) | "Fee + reserve için XLM gerekli" | `soroban/SKILL.md:2264-2291` |
| Trustline reserve yetersiz | klasik asset + reserve < gereken (`op_low_reserve`) | "Trustline için ~0.5 XLM reserve gerekli" | `soroban/SKILL.md:2580`; `plans:272` (rakam doğrulanmalı) |
| Yanlış ağ | cüzdan testnet/mainnet uyumsuz | "Cüzdanı … ağına geçir" | `dapp/SKILL.md:681`, `soroban/SKILL.md:2433-2456` |

**Tasarım gerilimi (raporlanan):** "alıcı öder" + reserve ön-koşulu, **hiç XLM'i olmayan tamamen yeni
alıcıyı** v1'de dışlar. Bunu çözen tek yol sponsored mod (§2.3) veya create app'in claim öncesi alıcı
hesaplarını `createAccount` ile fonlaması (gönderenin maliyeti artar, "alıcı öder" kararıyla çelişir).
Çelişki olarak raporlanıyor: **kripto-yerlisi hedef kitle** (`plans:27`) zaten fonlu hesaplara sahip
varsayımıyla v1 tutarlı; ancak smart-wallet/passkey onboarding'i (§3) bu boşluğu doldurmanın doğru yeri.

---

## 5. TTL / rent — kalıcı entry ömrü, archival, restore, dormant kampanya

Mevcut factory TTL disiplini (`contracts/soroban/zarf/factory/src/lib.rs:13-27`) airdrop crate'lerine
**birebir taşınır** ve sabit isim/değerleri belirler:

```rust
pub const DAY_IN_LEDGERS: u32 = 17_280;            // ~5s ledger, 1 gün
pub const TTL_EXTEND_TO: u32  = 120 * DAY_IN_LEDGERS; // ~120 gün, ~180-gün ağ maksimumu altında
pub const TTL_THRESHOLD: u32  = TTL_EXTEND_TO - DAY_IN_LEDGERS; // günde en çok bir kez rent bump
pub const MAX_PAGE_LIMIT: u32 = 80;                // footprint entry cap (~100) altında headroom
```

Bu değerlerin gerekçesi factory yorumlarında verili (`factory/src/lib.rs:13-27`): TTL hedefi ~120 gün
çünkü ağın entry-başına maksimum TTL'i ~180 gün; `MAX_PAGE_LIMIT=80` çünkü bir tx'in footprint'i
~100 ledger entry ile sınırlı, 80 leaf instance+code entry'lerine headroom bırakır. *(~180 gün ve
~100 entry ağ-parametreleridir; skill'de teyit yok, **doğrulanmalı** — ama factory'de gerekçeli sabit
olarak yerleşik ve kodla teyitli.)*

**Storage tipi seçimi (`soroban/SKILL.md:229-275, 2037-2041`):**

- `Config` (admin/token/root/total/deadline/locked) → **instance storage** (global config,
  `soroban/SKILL.md:233-241, 2038`).
- `ClaimedWord(word)` bitmap → **persistent storage** (kritik kullanıcı durumu; archival sonrası
  restore edilebilir, `soroban/SKILL.md:243-251, 2039, 2183-2184`). **Temporary kullanılmaz** —
  `soroban/SKILL.md:253-261, 2186-2187` temporary'nin archival sonrası **restore edilemediğini** söyler;
  claimed-bit kaybı çift-claim açar, bu yüzden temporary kesinlikle yanlış (OZ detector: "unsafe
  temporary storage", `soroban/SKILL.md:1831`).

**Archival / restore (liveness-only):** `soroban/SKILL.md:243-245` persistent entry'nin archival'dan
**restore edilebildiğini** garanti eder. `plans/airdrop_tool/airdrop-tool-design.md:358` doğru: *"archived entry
asla 'yok' sayılmaz, restore edilir"* — bir `ClaimedWord` arşivlenirse claim tx'i onu restore
footprint'iyle geri getirir; claimed-bit asla "claim edilmemiş" gibi yorumlanmaz.

**TTL bump deseni (`claim`/`withdraw` içinde):** factory'deki `persistent().extend_ttl(&key,
TTL_THRESHOLD, TTL_EXTEND_TO)` çağrı deseni (`factory/src/lib.rs:353,361,364,367,405`) ve
instance için `extend_contract_ttl` (factory:103,369) aynen kullanılır — instance + dokunulan
`ClaimedWord` her claim'de bump edilir. `soroban/SKILL.md:2041` "Extend TTL strategically, not on
every call" uyarısı `TTL_THRESHOLD` eşiğiyle zaten karşılanır (eşik altına inince bump).

**Dormant kampanya bakımı:** Uzun süre claim'siz kalan kampanyada instance + `ClaimedWord` entry'leri
TTL'e doğru ilerler. `factory/src/lib.rs:15-18` yorumu *"a fully dormant factory still needs an
external ExtendFootprintTTLOp before this window lapses"* der. Airdrop runbook'una **dormant-kampanya
TTL uzatma** notu eklenir (`plans/airdrop_tool/airdrop-tool-design.md:254-255,419`): operatör, son tarihi uzak veya
`deadline=0` (süresiz trustless) kampanyalarda her ~120 günden önce `ExtendFootprintTTLOp` ile
instance + ilgili `ClaimedWord` entry'lerini uzatmalı. `withdraw_unclaimed` da bir TTL bump fırsatı
sağlar (deadline sonrası gönderen fonu çekerken).

---

## 6. Pratik tx akışı — passphrase, simulate→assemble, Wallets Kit

### 6.1 Network passphrase & ağ-bağlama

`soroban/SKILL.md:2244-2253` passphrase'leri kesinleştirir; claim app her imza öncesi cüzdan ağıyla
uyumu denetlemeli (`soroban/SKILL.md:1746` "Network passphrase validated before signing"):

| Ağ | Passphrase | RPC | Friendbot |
|---|---|---|---|
| Testnet | `Test SDF Network ; September 2015` (`soroban/SKILL.md:2249-2250`) | `https://soroban-testnet.stellar.org` (`data/SKILL.md:55`) | `https://friendbot.stellar.org` (`data/SKILL.md:463`) |
| Mainnet | `Public Global Stellar Network ; September 2015` (`soroban/SKILL.md:2246-2247`) | Provider-specific (`data/SKILL.md:50-54`) | yok |

JSON `network` alanı (`plans/airdrop_tool/airdrop-tool-design.md:321,360-361`) claim app'te cüzdan-ağıyla denetlenir
→ cross-network replay kapanır (root + instance ağa bağlı, `plans:360`).

### 6.2 Zorunlu simulate → assembleTransaction akışı

`claim` bir Soroban `invokeHostFunction` çağrısı olduğundan, ücret/footprint'i ölçmek için
**simülasyon zorunludur** (`dapp/SKILL.md:288-303`, `soroban/SKILL.md:1747` "Transaction simulation
before submission", `soroban/SKILL.md:2380-2393` Pitfall #10). Akış (`dapp/SKILL.md:267-303,339-381`;
`data/SKILL.md:110-141`):

```ts
import * as StellarSdk from '@stellar/stellar-sdk';

// 1) ScVal argümanları (dapp/SKILL.md:307-330)
//    DİKKAT: proof = Vec<BytesN<32>> → her eleman scvBytes, hepsi scvVec içinde.
//    nativeToScVal(proof, { type: 'bytes' }) YANLIŞ olur (tek bytes objesi üretir).
const proofScVal = StellarSdk.xdr.ScVal.scvVec(
  proof.map((node32: Uint8Array) => StellarSdk.xdr.ScVal.scvBytes(Buffer.from(node32))),
);

const args = [
  StellarSdk.nativeToScVal(index, { type: 'u32' }),
  StellarSdk.Address.fromString(claimant).toScVal(),
  StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' }), // Config.total: i128 ile uyumlu
  proofScVal,                                                  // Vec<BytesN<32>>
];

// 2) tx kur → simulate → assemble (dapp/SKILL.md:281-303)
const account = await rpc.getAccount(claimant);
let tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,            // resource fee assemble ile eklenecek
    networkPassphrase,
  })
  .addOperation(new StellarSdk.Contract(airdropId).call('claim', ...args))
  .setTimeout(180)
  .build();

const sim = await rpc.simulateTransaction(tx);
if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();

// 3) Wallets Kit ile imzala (dapp/SKILL.md:224-228) → RPC submit + poll (dapp/SKILL.md:354-381)
```

`is_claimed(index)` ön-kontrolü tx'siz: `rpc.getLedgerEntries` ile `ClaimedWord` entry'sini okuyup
bit'i çöz (`data/SKILL.md:90-108`, `dapp/SKILL.md:563-589`). Bu, "zaten alınmış" durumunu imza
gerektirmeden gösterir (`plans/airdrop_tool/airdrop-tool-design.md:527`).

### 6.3 Wallets Kit / Freighter

`dapp/SKILL.md:188-230` multi-wallet (`allowAllModules()`, Freighter/LOBSTR/xBull) + `dapp/SKILL.md:110-185`
Freighter doğrudan. `plans/airdrop_tool/airdrop-tool-design.md:539-542` mevcut `WalletConnectButton`/`walletStore`/
Wallets Kit reuse'unu söylüyor — yeni cüzdan entegrasyonu **yok**. Submit yolu Soroban için RPC
(`dapp/SKILL.md:345-381`), klasik `changeTrust` ön-adımı için Horizon (`dapp/SKILL.md:383-394`).

### 6.4 Indexer / dashboard (opsiyonel)

`AirdropCreated` + `Claimed` event'leri için `data/SKILL.md:154-172` `getEvents` (contract + topic
filtresi). **RPC 7-gün history sınırı** (`data/SKILL.md:174-179`) nedeniyle uzun-ömürlü kampanyalarda
event'ler RPC'den kaybolur → dashboard kendi indexer'ına yazmalı veya `getLedgers` Infinite-Scroll
(`data/SKILL.md:176-177`) / Hubble (`data/SKILL.md:391-415`) kullanmalı. `plans/airdrop_tool/airdrop-tool-design.md:75,341-346`
indexer pattern'iyle uyumlu; mainnet'te `getEvents`'i kalıcı store ile beslemek **operasyonel
gereklilik** olarak not edilmeli.

---

## 7. Factory ↔ instance deploy + atomik fonlama (repo koduyla teyit)

`plans/airdrop_tool/airdrop-tool-design.md:126-135,241-246`'daki "deploy + atomik fonla + `TokenTransferMismatch`
guard" deseni mevcut vesting-factory'de **çalışan kodla** doğrulanmış; airdrop-factory aynısını
kullanır. Doğru satır referansları:

- **Deterministik adres + deploy:** `env.deployer().with_current_contract(deployment_salt).deploy_v2(
  wasm_hash, constructor_args)` (`factory/src/lib.rs:316-332`). **Önemli:** salt düz `salt` değil,
  `owner_bound_salt(owner, salt)`'tır (`factory/src/lib.rs:315`); adres `predict_vesting_address` ile
  **önceden türetilebilir** (`factory/src/lib.rs:124-129`, `deployed_address()`). §1.3/§3'teki leaf
  adres-binding opsiyonu için adresin **owner+salt'tan** önceden hesaplanması gerekir (düz salt değil).
  Bu, `soroban/SKILL.md:1959-1981` factory deseninin uygulamasıdır — ancak skill örneği jenerik
  `with_address(current, salt)` kullanır (`soroban/SKILL.md:1976-1977`); **repo `with_current_contract`
  kullanır**, repo deseni esastır.
- **Atomik fonlama + guard (allowance modeli):** `before = token.balance(&instance)` →
  `token.transfer_from(&env.current_contract_address(), &owner, &instance, &total)` →
  `after = token.balance(&instance)`; `after != before.checked_add(total)?` ⇒ `TokenTransferMismatch`
  (`factory/src/lib.rs:206-221`). **Net:** vesting-factory `transfer_from` + **owner allowance**
  kullanıyor (`owner.require_auth()` zaten `create_and_fund_vesting`'in başında, factory:188).
  Airdrop-factory **aynı `transfer_from` + owner-allowance desenini izlemeli** (draft'ın "transfer mi
  transfer_from mi" belirsizliği bu kodla kapanıyor: `transfer_from`). UX sonucu: create app, deploy
  öncesi owner'dan factory'ye **`approve`/allowance** kurar (token approval adımı — `plans:486`'daki
  "token approval" alt-adımı bu yüzden gerekli). Guard, fee-on-transfer/rebasing token'larda sessiz
  eksik-fonlamayı `checked_add` ile yakalar (`plans:241-246`).
- **`__constructor` atomik init:** `soroban/SKILL.md:119-164` ve `plans:173-174` ile aynı —
  re-init/front-running riski yok (`soroban/SKILL.md:121`); başarısız constructor deploy'u atomik
  geri alır (`soroban/SKILL.md:163`).

**`MerkleRootAlreadyUsed` kök-tekrar guard'ı bu araçta GEREKMEZ:** ZK proof yok, her instance kendi
köküne + kendi `ClaimedWord` bitmap'ine + kendi fonuna sahip, storage izole
(`plans/airdrop_tool/airdrop-tool-design.md:138-143`). A instance'ının fonu B'nin proof'uyla çekilemez (farklı
kontrat = farklı SAC bakiyesi, §1.1.4). Vesting-factory'de bu guard'ın **on-chain error adı**
`MerkleRootAlreadyUsed = 8` (`factory/src/lib.rs:43`); `UsedRoot` ise yalnız onu işaretleyen `DataKey`
variant'ıdır (`factory/src/lib.rs:62-66`), `reserve_merkle_root` yardımcısıyla yazılır
(`factory/src/lib.rs:394-407`). İkisi karıştırılmamalı. Gerekçe (proof'un `(merkle_root, audience_hash)`'e
bağlı ama vesting adresine bağlı **olmaması**) factory yorumlarında verili (`factory/src/lib.rs:62-66,
382-393`); airdrop'ta proof olmadığından bu sınıf risk doğmaz. Bu, raporun en önemli güvenlik ayrımı
— `assets`/`soroban` skill'leriyle çelişmez.

---

## 8. Stellar/Soroban açısından kapanış kontrol listesi

| Konu | Karar / değer | Kaynak | Durum |
|---|---|---|---|
| soroban-sdk sürümü | `26.0.0-rc.1` (no_std, alloc; dev+testutils) | `factory/Cargo.toml`, `vesting/Cargo.toml` | ✓ kodla teyitli |
| Token arayüzü | tek `token::Client` (native/SAC/SEP-41) | `assets:303-313`, `soroban:381-391` | ✓ teyitli |
| Klasik asset trustline | alıcı `G…` zorunlu; SAC otomatik kurmaz | `assets:42-44,259-301` | ✓ teyitli; `op_no_trust` etiketi `soroban:2578` ile teyitli (SAC-transfer yüzeyi doğrulanmalı) |
| Issuer flag gate | `AUTH_REQUIRED` reddet, clawback uyar | `assets:174-219`, `soroban:1692-1705` | ✓ teyitli |
| Smart-wallet `C…` trustline-kaçış | SAC bakiye contract storage'da | CAP-0046 (skill-dışı) | protokol-doğru; skill atfı yok |
| Fee modeli | inclusion + resource; simulate zorunlu | `soroban:1339-1341`, `dapp:288-303` | ✓ teyitli (BASE_FEE'nin 100-stroop sayısı skill'de yok → doğrulanmalı) |
| Sponsored mod | OZ Relayer fee-bump / x402 auth-entry | `dapp:643-664`, `agentic-payments:62` | ✓ önerildi (v1.1 opsiyonel, varsayılan değişmez) |
| Reserve | base ~1 XLM; trustline ~0.5 XLM/entry | `soroban:2287`; `soroban:2580`; `plans:272` | base+`op_low_reserve` teyitli; 0.5/entry **doğrulanmalı** |
| Testnet fonlama | Friendbot | `dapp:94`, `data:463` | ✓ teyitli |
| TTL sabitleri | `DAY_IN_LEDGERS`/`TTL_EXTEND_TO`/`TTL_THRESHOLD`/`MAX_PAGE_LIMIT` | `factory/src/lib.rs:13-27` | ✓ kodla teyitli (ağ max ~180g, ~100 entry doğrulanmalı) |
| Storage tipi | Config=instance, ClaimedWord=persistent | `soroban:229-275,2037-2041` | ✓ teyitli (temporary YASAK) |
| Passphrase/simulate/Wallets Kit | testnet/mainnet sabit; simulate→assemble | `soroban:2244-2253`, `dapp:188-303` | ✓ teyitli |
| Deploy+fonla guard | `with_current_contract(owner_bound_salt)`+`deploy_v2`; `transfer_from`+`checked_add` balance-before/after | `factory/src/lib.rs:206-221,315-332` | ✓ kodla teyitli (allowance/`transfer_from` modeli) |
| Kök-tekrar guard gereksiz | `MerkleRootAlreadyUsed`/`UsedRoot` airdrop'ta N/A | `factory/src/lib.rs:43,62-66,394-407`; `plans:138-143` | ✓ teyitli (ZK proof yok = izolasyon yeterli) |
| ScVal proof kodlaması | `Vec<BytesN<32>>` → scvVec(scvBytes…), **`type:'bytes'` değil** | `dapp:307-330` | ✓ düzeltildi (draft kod bug'ı) |

**Doğrulanmalı (testnet/resmi-döküman):** `claim`'in gerçek stroop ücreti (simülasyon); `BASE_FEE`
sayısal değeri (100 stroops / 0.00001 XLM); trustline reserve sayısı (0.5 XLM/entry); ağ maksimum
entry TTL (~180 gün) ve footprint entry cap (~100); SAC `transfer`'in trustline-yokken Soroban
simülasyonunda döndürdüğü tam hata yüzeyi (`op_no_trust` etiketi vs contract-trap). Mekanik ve
büyüklükler skill+repo-koduyla teyitli; yalnız bu nokta-rakamlar/yüzey-temsili resmi parametre
doğrulaması bekliyor.

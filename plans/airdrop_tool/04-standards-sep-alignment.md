# Zarf Airdrop — Standartlar & SEP Hizalama

> Bu doküman, standart (ZK'siz) cüzdan-adresi + Merkle-claim airdrop aracının
> **Stellar Ecosystem Proposal'larına (SEP) ve ekosistem standartlarına** nasıl
> hizalanacağını belirler. Kapsam: claim'in dayandığı token arayüzü (**SEP-41**),
> paylaşılabilir claim linki / cüzdan deeplink'i (**SEP-7**), kampanya & token
> metadata yayını (**SEP-1**), kontrat meta/ABI yayını (**SEP-46/48**), ve
> smart-wallet/auth ilgisi (**SEP-10/45**). Ayrıca **native alternatif** olan klasik
> **Claimable Balance** ile Soroban-Merkle modeli karşılaştırılır; ne zaman hangisinin
> seçileceği gerekçelendirilir. Tüm Stellar/Soroban iddiaları `standards` ve `assets`
> skill'lerine ve repo kaynak dosyalarına dayandırılmıştır; skill'in/repo'nun
> doğrulamadığı wire-format ve fee/reserve ayrıntıları **"doğrulanmalı"** olarak
> işaretlenmiştir.
> KARAR DURUMU: Ana plan (`plans/airdrop_tool/airdrop-tool-design.md`) ile büyük ölçüde uyumlu.
> **İki nokta plan/taslak ile repo arasında çelişiyordu ve düzeltildi** — fonlama
> `transfer_from` (allowance) ile yapılır (§2.2), ve `recipient_id`'deki BN254 alan
> indirgemesi airdrop yaprağına **kopyalanmaz** (§2.1, §6.3). Detaylar ilgili bölümlerde.

---

## 0. Doğrulama temeli (repo + skill kaynakları)

Bu dokümandaki teknik iddialar üç sınıfa ayrıldı:

| Sınıf | Anlamı | İşaret |
|---|---|---|
| **Repo-doğrulandı** | Kaynak dosyada satır-bazında teyit edildi | `file:line` |
| **Skill-doğrulandı** | `standards`/`assets` SKILL.md'de açıkça var | `SKILL.md:line` |
| **Doğrulanmalı** | Skill/repo enumerate etmiyor; canonical spec/dokuman gerekli | **doğrulanmalı** |

Repo'dan teyit edilen sabit gerçekler (bu dokümanın dayanağı):

| Gerçek | Değer | Kaynak |
|---|---|---|
| soroban-sdk pin | **`26.0.0-rc.1`** (dört crate'in tamamı) | `factory/Cargo.toml:10`, `vesting/Cargo.toml:10`, `jwk-registry/Cargo.toml:10`, `ultrahonk-soroban-verifier/Cargo.toml:19` |
| Token client API | **`token::TokenClient`** (`token::Client` alias'ı) | `factory/src/lib.rs:206` |
| Fonlama primitifi | **`transfer_from`** (allowance pattern) | `factory/src/lib.rs:208`; `vesting/src/lib.rs:261` |
| Instance→alıcı payout | `transfer` (kontrat kendinden) | `vesting/src/lib.rs:381` |
| `recipient_id` | `keccak256(addr.to_xdr)` **+ BN254 `BnScalar` indirgemesi** | `factory/src/lib.rs:118–121` |
| TTL sabitleri | `DAY_IN_LEDGERS=17_280`, `TTL_EXTEND_TO=120*DAY`, `TTL_THRESHOLD=TTL_EXTEND_TO-DAY` | `factory/src/lib.rs:14–22` |
| Sayfa limiti | `MAX_PAGE_LIMIT = 80` | `factory/src/lib.rs:27` |
| Testnet passphrase | `Test SDF Network ; September 2015` | `web/packages/core/lib/config/runtime.ts:60` |

> **NOT — KILITLI KARAR vs repo:** KILITLI KARARLAR "soroban-sdk 26.x" der. Repo bunu
> somut olarak **`26.0.0-rc.1`** rc'sine pinler; iki yeni airdrop crate'i de aynı pin'i
> kullanmalı (drift = build kırılması). Bu dokümanda "26.x" yerine repo-pin'i yazılır.

---

## 1. İlgili SEP/standart envanteri (özet tablo)

`standards` skill'inin "High-value SEPs for app developers" (SKILL.md:43–64), "Quick
mapping by use case" (SKILL.md:86–108) ve "Key SEP Standards" (SKILL.md:763–774)
bölümlerinden, bu araca dokunan standartlar:

| Standart | Konu (skill kaynağı) | Bu araçtaki rolü | Uyum seviyesi |
|---|---|---|---|
| **SEP-41** | Soroban token interface (standards SKILL.md:46, 769) | `claim`/`withdraw`'ın çağırdığı tek token arayüzü | **Zorunlu — birebir uy** |
| **SEP-7** | URI scheme / deep-link (standards SKILL.md:20) | Paylaşılabilir claim linki + cüzdan deeplink'i | **Önerilen — opsiyonel deeplink** |
| **SEP-1** | `stellar.toml` (standards SKILL.md:58, 764) | Kampanya/token/uygulama metadata yayını | **Önerilen — yayınla** |
| **SEP-23** | StrKey encoding (standards SKILL.md:57) | `G…`/`C…` adres doğrulama (checksum) | **Zorunlu — istemcide** |
| **SEP-46** | Contract metadata in Wasm — **Active** (standards SKILL.md:47, 771) | Kontrat metadata gömme | **Önerilen — build'de** |
| **SEP-48** | Contract interface specification — **Active** (standards SKILL.md:48, 772) | Kontrat ABI yayını | **Önerilen — build'de** |
| **SEP-10** | Web authentication (standards SKILL.md:56, 99) | Dashboard/indexer auth (opsiyonel) | **İlgisiz-opsiyonel** |
| **SEP-45** | Web auth for contract accounts / `C…` — **Draft** (assets SKILL.md:418; standards SKILL.md:770) | Smart-wallet alıcı auth'u (gelecek) | **İlgili — v1'de değil** |
| **SEP-40** | Oracle interface (standards SKILL.md "Reflector", 152/377) | İlgisiz (fiyat oracle'ı yok) | **İlgisiz** |

> Not: `standards` skill bir **yönlendirme haritasıdır**, governance/status'un nihai
> kaynağı değildir (SKILL.md:35–41). Implementasyon öncesi her SEP'in güncel durumu
> kaynak repodan (`stellar/stellar-protocol/ecosystem`) **doğrulanmalı**. Skill, SEP-46
> ve SEP-48'i **Active** (SKILL.md:771–772), SEP-45'i ise **Draft** (SKILL.md:770)
> olarak işaretler — bu yüzden SEP-45 v1 dışıdır, SEP-46/48 v1'de güvenle eklenebilir.

---

## 2. SEP-41 — Soroban token interface (claim'in çekirdeği)

### 2.1 Neden SEP-41 ve nasıl uyuyoruz

`standards` skill SEP-41'i "Soroban token interface" olarak listeler (SKILL.md:46, 769)
ve "I am building a fungible token" akışında ilk adım olarak gösterir (SKILL.md:88–91).
`assets` skill, SAC'ın bu arayüzü implemente ettiğini açıkça belirtir: `balance`,
`transfer`, `approve`, `allowance`, `decimals`, `name`, `symbol` (assets SKILL.md:303–312).

Airdrop instance kontratı **kendi token'ını implemente etmez**; sadece bir `token: Address`
tutar ve token client üzerinden çağırır. Bu, ana planın §5'iyle birebir aynı: "kontrat
sadece bir `token: Address` tutar" (`airdrop-tool-design.md:262`).

> **API adı düzeltmesi:** Taslak `soroban_sdk::token::Client` yazıyordu. **Repo
> konvansiyonu `token::TokenClient`'tir** (`factory/src/lib.rs:206`:
> `token::TokenClient::new(&env, &token)`). İkisi de aynı tipin takma adıdır
> (`assets` skill `token::Client as TokenClient` import eder, SKILL.md:286); ama yeni
> crate'ler **repo ile tutarlı `token::TokenClient`** kullanmalı.

Kullanılan yüzey **minimaldir** ve hem SAC hem custom SEP-41 token'larda aynıdır:

| Çağrı | Nerede | Amaç | Repo emsali |
|---|---|---|---|
| `transfer(from, to, amount)` | `claim` (instance→alıcı), `withdraw_unclaimed` | tek dağıtım primitifi | `vesting/src/lib.rs:381` |
| **`transfer_from(spender, from, to, amount)`** | factory fonlama (owner→instance) | atomik fonlama (allowance) | `factory/src/lib.rs:208` |
| `balance(id)` | factory `TokenTransferMismatch` guard'ı, `withdraw_unclaimed` | fonlama/kalan doğrulama | `factory/src/lib.rs:207,214` |
| `decimals()` | create app (UI ölçeklemesi) | miktar gösterimi | (istemci) |

`assets` skill SAC adres türetimini doğrular: `asset.contractId(network)` deterministik SAC
adresini verir (assets SKILL.md:278–280), ve Soroban kontratı içinde kullanım
`TokenClient::new(&env, &asset_contract); token.transfer(...)` (assets SKILL.md:285–301).
Bu, hem native XLM SAC'ını hem klasik asset SAC'ını **aynı kodla** kapsar.

> **DÜZELTME — hashing citation ve `recipient_id`:** Taslak claim yaprağı için "repo
> konvansiyonu (keccak256 + `to_xdr`, `factory/src/lib.rs:118–122`) bağlayıcıdır" diyordu.
> **Repo'daki `recipient_id` (`factory/src/lib.rs:118–121`) sadece keccak256 değildir;
> sonunda `BnScalar::from_bytes(digest).to_bytes()` ile BN254 alanına indirger** — çünkü
> bu değer ZK devresine beslenir. Airdrop aracı **ZK'sizdir ve düz keccak256 Merkle
> kullanır**; **BN254 indirgemesini KOPYALAMAMALIDIR**. Paylaşılan konvansiyon yalnız
> `keccak256(addr.to_xdr())` parçasıdır (`factory/src/lib.rs:119–120`); satır 121
> (`BnScalar`) devre-spesifiktir ve airdrop yaprağında **yer almaz**. Bu ayrım §6.3'te
> de düzeltildi.

### 2.2 SEP-41 uyum önerileri

1. **Sadece arayüz üzerinden konuş**: Kontrat hiçbir token-spesifik varsayım yapmaz;
   token client çağrılarının `panic`/host-error döndürmesi (örn. trustline yok) tx'i
   revert eder. `claim` içinde `set_claimed` transfer'dan **önce** olduğu için
   (`airdrop-tool-design.md:183–184`), transfer fail ederse tüm tx atomik olarak geri
   alınır → bitmap kirlenmez.
2. **`decimals()` farkındalığı**: Create app token'ın `decimals()` değerini çekip Σ amount'u
   doğru ölçeklemeli (`airdrop-tool-design.md:310`). Kontrat tarafında miktar ham `i128`'dir;
   ondalık dönüşümü tamamen istemcide.
3. **Fonlama = `transfer_from` (allowance), DÜZELTİLDİ**: Taslak "doğrudan
   `transfer(owner, instance, total)`, `approve`/`allowance` KULLANILMAZ" diyordu — bu
   **repo ile çelişir**. Repo factory fonlamayı `transfer_from` ile yapar
   (`factory/src/lib.rs:208`): factory `spender` olarak çağırır, fonlar `owner`'dan
   instance'a akar; bu **allowance pattern'ini gerektirir** (owner, `create_airdrop`
   tx'inde factory'ye önce `approve` verir — Soroban auth çerçevesinde tek tx içinde
   `__check_auth` ile birlikte). Airdrop-factory de **aynı `transfer_from` + balance
   before/after guard**'ını kullanmalı (vesting-factory ile aynı). Plan'ın §4.5'i
   (`airdrop-tool-design.md:243`) bunu "`token.transfer(owner, instance, total)`" diye
   yanlış tarif ediyor → **plan-çelişkisi: §4.5 `transfer_from` olarak güncellenmeli.**
4. **SEP-48 ile ABI yayını** (önerilen): Build'de kontrat arayüz spesifikasyonu Wasm'a
   gömülür (standards SKILL.md:48), böylece cüzdanlar/explorerlar `claim` imzasını okuyabilir.
   `standards` skill bunu "Contract interface specification (**Active**)" olarak işaretler
   (SKILL.md:772) → v1'de güvenle eklenebilir. **SEP-46** (Contract Meta, Active,
   SKILL.md:771) ile birlikte build-time metadata gömülür.

> **Doğrulanmalı**: SEP-41 arayüzünün `transfer`/`transfer_from` dönüş tipi ve hata
> davranışının pinlenen **`soroban-sdk 26.0.0-rc.1`** `token::TokenClient` imzasıyla bire
> bir eşleştiği build sırasında teyit edilmeli. `assets` skill arayüz adlarını verir
> (`transfer(from,to,amount)`, `balance(id)->i128`, `decimals()->u32`, SKILL.md:303–312)
> ama tam imzalar SDK sürümüne bağlıdır. Repo emsali `i128` miktar + `Address` kullanır
> (`factory/src/lib.rs:206–213`).

---

## 3. SEP-7 — URI scheme / claim linki & cüzdan deeplink'i

### 3.1 İki katmanlı link modeli

Ana plan claim linkini `claim-drop.zarf.to/?a=<addr>&cid=<cid>` olarak tanımlar
(`airdrop-tool-design.md:494, 504`). Bu **uygulama-içi (web) link**'tir ve SEP-7 değildir
— uygulama yönlendirmesidir. Buna ek olarak, "cüzdanda imzala" adımı için **SEP-7 deeplink'i**
opsiyonel olarak üretilebilir. İki katman:

| Katman | Format | Kim tüketir | SEP |
|---|---|---|---|
| **App linki** (varsayılan) | `https://claim-drop.zarf.to/?a=<instance>&cid=<cid>&n=<network>` | Tarayıcı → claim app | — (uygulama) |
| **Cüzdan deeplink'i** (opsiyonel) | `web+stellar:tx?xdr=<base64-xdr>&...` | Freighter/Wallets Kit | **SEP-7** (doğrulanmalı) |

`standards` skill SEP-7'yi "Frontend SEP-7 / SEP-10 flows" başlığı altında `dapp` skill'ine
yönlendirir (SKILL.md:20). Skill SEP-7'nin **varlığını ve deep-link rolünü doğrular** ancak
tam alan grameri (parametre adları, imza alanı, şema öneki) skill içinde **enumerate
edilmemiştir** → aşağıdaki wire-format ayrıntıları **doğrulanmalı**.

### 3.2 Önerilen claim-link URI şeması (uygulama katmanı)

```
https://claim-drop.zarf.to/
  ?a=<airdrop_instance_C...>   # zorunlu: instance adresi (config kaynağı)
  &cid=<bafy...>               # zorunlu: claim-list JSON'unun IPFS CID'i
  &n=testnet|public            # zorunlu: ağ; cüzdan-ağ uyumu için (§5)
```

Tasarım kararları:
- **CID linkin içinde**: claim-list host'u pin-proxy/IPFS (`airdrop-tool-design.md:43, 313`);
  CID immutable + içerik-adresli → linkin işaret ettiği liste değiştirilemez (bütünlük).
- **`a` (instance) on-chain doğruluk kaynağı**: `root`, `token`, `deadline`, `locked`
  değerleri linkten DEĞİL, `config()` çağrısından okunur → zehirli link config'i değiştiremez
  (`airdrop-tool-design.md:190`).
- **`n` (network)** linkte explicit: claim app cüzdan ağıyla karşılaştırır (`isWrongNetwork`,
  `airdrop-tool-design.md:531`); cross-network replay'i kapatır (`airdrop-tool-design.md:360`).
- Proof linkte taşınmaz — alıcının entry'si CID'deki JSON'dan client-side bulunur
  (`airdrop-tool-design.md:516`).

### 3.3 Önerilen cüzdan-deeplink şeması (SEP-7, opsiyonel)

QR/mobil "cüzdanda aç" akışı için, claim tx'inin imzalanmamış XDR'ı SEP-7 `tx` operasyonu
ile sarılabilir:

```
web+stellar:tx
  ?xdr=<URL-encoded base64 tx>                    # claim(index, addr, amount, proof) invoke
  &network_passphrase=Test SDF Network ; September 2015   # ağ açıkça bağlanır (repo testnet passphrase)
  &callback=<url:...>                             # (opsiyonel) imza sonrası dönüş
```

> **Doğrulanmalı (SEP-7 wire-format)**: `web+stellar:` şema öneki, `tx` operasyon adı,
> `xdr` / `network_passphrase` / `callback` parametre adları ve URL-encode kuralları
> **canonical SEP-7 spec'inden** (`stellar-protocol/ecosystem/sep-0007.md`) teyit edilmeli;
> `standards` skill bu alan adlarını inline listelemiyor (yalnız SEP-7'nin deep-link
> standardı olduğunu ima ediyor, SKILL.md:20). Ayrıca Soroban `InvokeHostFunction` tx'lerinin
> SEP-7 `tx`/`pay` ile cüzdan desteğinin sürüme bağlı olduğu **doğrulanmalı**.
> Passphrase değeri (`Test SDF Network ; September 2015`) repo'da doğrulandı
> (`web/packages/core/lib/config/runtime.ts:60`).

**Öneri**: v1'de **app-linki birincil**, SEP-7 deeplink'i ikincil bir "cüzdanda aç"
butonu olarak. Stellar Wallets Kit zaten imza akışını soyutladığı için (Wallets Kit
Freighter/LOBSTR/xBull destekler, standards SKILL.md:241–244) SEP-7 çoğu masaüstü cüzdanda
gereksiz; asıl değeri **mobil cüzdan deeplink'i** ve **QR** için.

---

## 4. SEP-1 — stellar.toml (kampanya & token metadata yayını)

### 4.1 Ne yayınlanır

`assets` skill SEP-1'i token metadata yayını için gösterir: domain'in
`/.well-known/stellar.toml`'ında `[[CURRENCIES]]` bloğu (assets SKILL.md:385–397). Bu araç
**token issuer'ı değildir** (alıcı projenin token'ını dağıtır), ama iki şey için SEP-1
yararlıdır:

1. **Uygulama metadata'sı**: Airdrop aracının kendi domain'i (`claim-drop.zarf.to` /
   `drop.zarf.to`) bir `stellar.toml` yayınlayarak indexer/explorer'lara organizasyon
   bilgisini ve (varsa) factory adresini açar.
2. **Kampanya keşfi** (opsiyonel): Kampanya başlatan, kendi domain'inde airdrop instance
   adresini ve token referansını yayınlayarak claim app'in "bu link gerçek mi?" doğrulamasına
   zemin sağlayabilir.

### 4.2 Örnek `stellar.toml` bloğu

`assets` skill'in `[[CURRENCIES]]` şablonunu (SKILL.md:389–397) ve SEP-1'in standart
`ACCOUNTS`/`DOCUMENTATION` alanlarını temel alarak:

```toml
# /.well-known/stellar.toml  —  claim-drop.zarf.to
# SEP-1 metadata (kaynak: assets SKILL.md:385-397; [[CONTRACTS]] alanları doğrulanmalı)

NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"   # testnet-first; mainnet'te değişir

# Airdrop araç ailesi (uygulama tanıtımı)
[DOCUMENTATION]
ORG_NAME = "Zarf Airdrop"
ORG_URL = "https://claim-drop.zarf.to"
ORG_DESCRIPTION = "Cüzdan-adresi + Merkle-claim airdrop dağıtım aracı"

# Factory + örnek kampanya kontratları (keşif için)
# NOT: [[CONTRACTS]] bloğunun SEP-1'de standartlaştığı DOĞRULANMALI (aşağı bkz.)
[[CONTRACTS]]
name = "AirdropFactory"
address = "C...FACTORY"          # deploy sonrası doldurulur

# Dağıtılan token'ın metadata'sı (yalnız aracın domain'i token issuer'ıysa anlamlı;
# çoğu durumda token'ın KENDİ issuer toml'una atıfta bulun)
[[CURRENCIES]]
code = "TOKEN"
issuer = "G...ISSUER"            # klasik asset ise; SEP-41/SAC ise contract = "C..."
display_decimals = 7
name = "Örnek Airdrop Token"
desc = "Bu kampanyada dağıtılan varlık"
image = "https://.../logo.png"
```

> **Doğrulanmalı (SEP-1)**: `[[CONTRACTS]]` bloğunun ve Soroban-kontrat alanlarının
> canonical SEP-1 spec'inde standartlaştığı (vs. yalnız `[[CURRENCIES]]`/`ACCOUNTS`)
> teyit edilmeli — `assets` skill yalnız `[[CURRENCIES]]` örneğini doğruluyor
> (SKILL.md:389–397). Klasik asset dağıtımında, token'ın metadata'sının **issuer'ın kendi
> toml'undan** okunması doğru pratiktir; airdrop aracı bunu kopyalamak yerine işaret etmeli
> (`assets` skill: "Verify stellar.toml from authoritative source", SKILL.md:443).

### 4.3 Uyum önerisi
- v1: aracın kendi `stellar.toml`'unu yayınla (uygulama tanıtımı + factory keşfi). Düşük efor,
  explorer/indexer entegrasyonunu kolaylaştırır.
- Klasik asset (v1.1) seçildiğinde create app, asset'in **issuer toml'undan** `[[CURRENCIES]]`
  metadata'sını çekip (logo, `display_decimals`) claim app'te gösterebilir — bu, `assets`
  skill'in "Verify stellar.toml from authoritative source" + "Validate asset issuer, not just
  code" pratiklerine uyar (SKILL.md:441–443).

---

## 5. SEP-10 / SEP-45 — auth & smart-wallet contract account ilgisi

### 5.1 Claim auth'u SEP-10/45 GEREKTİRMEZ

Claim akışında kimlik = **cüzdan**, ve alıcı yetkisi **on-chain** `claimant.require_auth()`
ile sağlanır (`airdrop-tool-design.md:182, 355`). Bu, **Soroban auth çerçevesidir** (tx imzası
→ `require_auth`), SEP-10 web-auth değildir. SEP-10 (standards SKILL.md:56, 99) bir **off-chain
challenge-response**'tur; airdrop'un on-chain claim'i için gereksiz katman olur.

Dolayısıyla:
- **`claim` için auth**: tx imzası + `claimant.require_auth()`. SEP-10/45 yok.
- **`withdraw_unclaimed` için auth**: `admin.require_auth()` + `locked`/deadline kapısı
  (`airdrop-tool-design.md:355`).
- **`create_airdrop` için auth**: `owner.require_auth()` (`airdrop-tool-design.md:131, 356`).
  **Ek not:** Fonlama `transfer_from` ile aktığından (§2.2), `owner.require_auth()`'un
  aynı tx içinde token allowance/transfer yetkisini de kapsadığı auth-tree'de garanti
  edilmeli (vesting-factory deseni, `factory/src/lib.rs:208`).

### 5.2 Nerede SEP-10 işe yarar (opsiyonel)
- **Dashboard / indexer**: "Kampanyalarım" panelinde (`airdrop-tool-design.md:499`) sahibe
  özel görünüm için bir backend varsa, SEP-10 ile cüzdan-sahipliği doğrulanabilir. Ama v1
  dashboard salt-okunur on-chain veriyi gösterdiği için (indexer event'leri,
  `airdrop-tool-design.md:341–346`) **auth gerekmez**; herkes kontratı sorgular.

### 5.3 SEP-45 ve `C…` smart-wallet alıcılar
`assets` skill SEP-45'i "Web Auth for Contract Accounts (`C...`)" olarak ve **Draft** olarak
işaretler (assets SKILL.md:418–420; standards SKILL.md:770). İlgisi:
- **Merkle yaprağı zaten `C…`'yi kapsar**: yaprak `claimant.to_xdr()` ile serileştirildiğinden
  (`airdrop-tool-design.md:199, 204`) ve `to_xdr` `G…`/`C…` ayrımı yapmadığından (repo
  `recipient_id`'nin keccak256(`to_xdr`) parçası, `factory/src/lib.rs:119–120`), smart-wallet
  adresleri **kontratta ekstra kod olmadan** claim edebilir. **(Hatırlatma: airdrop yaprağı
  `recipient_id`'deki BN254 indirgemesini KULLANMAZ — §2.1.)**
- **`require_auth` smart-wallet'a delege olur**: `C…` claimant için `require_auth`, hesabın
  kendi `__check_auth`'una düşer (passkey/policy). SEP-45 burada **web-auth** katmanıdır,
  on-chain claim için değil → v1'de **kapsam dışı**, ama mimari onu engellemez.
- **Klasik asset + `C…` avantajı**: `assets` skill SAC'ın bakiyeyi kontrat depolamasında
  tuttuğunu doğrular (SKILL.md:330–333) → smart-wallet alıcılar için **trustline gerekmez**
  (`airdrop-tool-design.md:273, 280`). Bu, klasik asset airdrop'larında `C…` alıcıları
  `G…` alıcılardan daha sürtünmesiz yapar.

> **Sonuç**: v1 = sadece Soroban `require_auth` (SEP-10/45 yok). SEP-45 **Draft** olduğu için
> (standards SKILL.md:770; güncel status implementasyon öncesi doğrulanmalı) ona bağımlılık
> ertelendi; mimari `C…` claimant'ı bugün bile sorunsuz kabul eder.

---

## 6. Native alternatif: Classic Claimable Balances vs Soroban-Merkle airdrop

Bu, "neden kontrat?" sorusunun cevabıdır. Stellar'ın **kontratsız** native airdrop primitifi
**Claimable Balance** (CB) operasyonudur; predicate (koşul) tabanlı, alıcı başına bir ledger
entry. Aşağıda iki model karşılaştırılır.

### 6.1 Trade-off tablosu

| Boyut | Classic Claimable Balance | Soroban Merkle airdrop (bu araç) |
|---|---|---|
| Kontrat gerekir mi | **Hayır** (native operasyon) | **Evet** (factory + instance) |
| Oluşturma maliyeti | **N alıcı = N `CreateClaimableBalance` op + N entry** | **1 deploy + 1 fonlama tx + Merkle kök** (ölçekten bağımsız) |
| Sponsor/rezerv | **Her CB entry'si için base reserve** (yaratıcı sponsorlar) — **doğrulanmalı (rakam)** | **Tek instance + bitmap entry'leri** (alıcı başına değil) |
| Kim fee öder | Yaratıcı (oluştururken) | **Alıcı** (claim tx'ini imzalar, `airdrop-tool-design.md:24`) |
| Ölçek | Büyük listede **N op pratik tavanına** çarpar | **On binlerce alıcı tek tx** (Merkle kök sabit) |
| Claim koşulu | Predicate (zaman/mantıksal) | Merkle inclusion proof |
| Trustline | Alıcı asset'e trustline'lı olmalı (klasik) | Aynı kısıt klasik asset'te (§7); XLM/SEP-41'de yok |
| Geri-çekme | CB'de `claimAnyPredicate`/iki-taraflı predicate gerekir — **doğrulanmalı** | `locked`+`deadline` flag'i (`airdrop-tool-design.md:210–239`) |
| Liste keşfi | On-chain (her CB ayrı entry) | Off-chain CID (IPFS, `airdrop-tool-design.md:43`) |

> **Doğrulanmalı (rezerv/maliyet rakamları)**: "alıcı başına base reserve", CB entry başına
> tam XLM rezerv miktarı ve CB iki-taraflı predicate semantiği `standards`/`assets`
> skill'lerinde **enumerate edilmiyor** → canonical Stellar fee/reserve dokümanından teyit
> edilmeli. Tablo niteliksel trade-off'a dayanır, kesin rakam vermez. (Tarihsel base reserve
> değeri ~0.5 XLM olarak bilinir, ancak **bu değer ağ/protokole bağlı ve doğrulanmalı**.)

### 6.2 Ne zaman hangisi

- **Az alıcı (≈≤ birkaç yüz), basit zaman-koşulu, kontratsız istenir** → **Claimable Balance**
  daha az hareketli parça. Predicate native, ekosistem desteği tam.
- **Çok alıcı / ölçek, "alıcı öder", tek fonlama, programatik dağıtım** → **Soroban-Merkle**
  (bu aracın kararı, `airdrop-tool-design.md:54–55`). N alıcı için N operasyon yerine **tek
  kök**; maliyet ölçekten bağımsız; alıcı kendi fee'sini öder.
- **Karar gerekçesi (plan ile uyumlu)**: Ana plan "büyük listelere ölçeklenir" + "alıcı öder"
  kararlarını verdiği için Merkle modeli seçilmiştir (`airdrop-tool-design.md:54–55`). CB,
  küçük/native kampanyalar için **rakip değil tamamlayıcı** bir alternatiftir; v1 kapsamı dışı.

### 6.3 Disperse / Uniswap-OZ MerkleDistributor karşılığı

Ana plan bu aracı açıkça "Uniswap MerkleDistributor / disperse.app'in Stellar/Soroban
karşılığı" olarak konumlar (`airdrop-tool-design.md:15`). Standart eşlemeler:

| EVM dünyası | Bu araçtaki karşılık | Standart bağ |
|---|---|---|
| Uniswap **MerkleDistributor** (claimed bitmap + proof) | `MerkleAirdrop` instance + `ClaimedWord` bitmap | SEP-41 transfer; keccak256 Merkle |
| **disperse.app** (tek tx çok transfer / push) | v2 push/disperse modu (`airdrop-tool-design.md:399, 410`) | — (push; v1 değil) |
| OZ **MerkleProof** (`sorted(L,R)` leksikografik) | §4.3 düğüm kuralı (`airdrop-tool-design.md:200`) | OZ-stili, yön-biti yok |
| OZ Stellar **merkle distribution** örneği | `soroban-examples` "merkle distribution" (standards SKILL.md:443) referansı | resmi örnek pattern |

> `standards` skill, resmi `soroban-examples`'ın **"merkle distribution"** içerdiğini
> doğrular (SKILL.md:443) → bu, modelin Stellar'da kanonik/desteklenen bir pattern olduğunu
> teyit eder. Implementasyon, hashing ve bitmap ayrıntılarında bu örnekten **referans
> alabilir**.
>
> **Kritik hashing notu:** Airdrop yaprak/düğüm hash'i **düz keccak256 + domain tag
> (`0x00` yaprak / `0x01` düğüm)** olmalı (`airdrop-tool-design.md:199–202`). Repo'nun
> `recipient_id`'si paylaşılan **yalnız** `keccak256(addr.to_xdr())` parçasıdır
> (`factory/src/lib.rs:119–120`); **`BnScalar` BN254 indirgemesi (satır 121) ZK devresine
> özgüdür ve airdrop ağacına KOPYALANMAZ.** Bu, Rust↔JS test-vektörü eşitliği için
> bağlayıcıdır (`airdrop-tool-design.md:296–298`).

---

## 7. Klasik asset (USDC) yolu — `assets` skill'e dayalı SEP uyum kuralları

`assets` skill, klasik asset dağıtımında airdrop'u **kıran/uyaran** issuer-flag'lerini açıkça
listeler (assets SKILL.md:174–179). Bunlar create app'in v1.1 denetimlerini şekillendirir:

| Issuer flag | `assets` etkisi (SKILL.md:176–179) | Airdrop'a etkisi | Create app aksiyonu |
|---|---|---|---|
| `AUTH_REQUIRED` | "Users must get approval before receiving tokens" | Permissionless claim **imkânsız** (issuer her trustline'ı yetkiler) | **Reddet** (`airdrop-tool-design.md:274–276`) |
| `AUTH_REVOCABLE` | "Issuer can freeze user balances" | Dağıtılan bakiye sonradan dondurulabilir | **Uyar** |
| `AUTH_CLAWBACK_ENABLED` | "Issuer can clawback tokens from accounts" | Alıcı token'ı geri alınabilir | **Uyar** (`airdrop-tool-design.md:277–278`) |
| `AUTH_IMMUTABLE` | "Flags cannot be changed (permanent)" | Yukarıdaki durum kalıcı | Uyarıda belirt |

Uyum kuralları (`assets` skill'e dayalı):
1. **Flag denetimi**: Create app, klasik asset seçilince issuer hesabının `flags`'ini çeker
   (`assets` skill: `account.flags` ve asset `stats.flags`, SKILL.md:255, 380) ve yukarıdaki
   tabloya göre reddet/uyar (`airdrop-tool-design.md:453–454`).
2. **Trustline ön-adımı**: `assets` skill trustline'ın `changeTrust` ile kurulduğunu gösterir
   (SKILL.md:226–239) ve SAC'ın transfer sırasında trustline'ı **otomatik kurmadığını** ima
   eder (`airdrop-tool-design.md:267`). Claim app, `G…` alıcılar için claim'den önce
   **"Trustline ekle"** tek-tık adımı sunar (`airdrop-tool-design.md:527`). `C…`
   smart-wallet'ta gerekmez (SAC depolama, §5.3).
3. **`changeTrust` rezervi**: Her trustline ek **base reserve** tüketir (`assets` skill rezerv
   yönetimini önerir, SKILL.md:434–438, ama tam rakamı vermez) → claim app "Fee + reserve için
   XLM gerekli" uyarısı verir (`airdrop-tool-design.md:532`). **Doğrulanmalı**: trustline
   başına tam rezerv (plan ~0.5 XLM yazıyor, `airdrop-tool-design.md:272`, ama skill rakamı
   doğrulamıyor) canonical fee/reserve dokümanından teyit edilmeli.
4. **Stellar.toml doğrulama**: `assets` skill "Verify stellar.toml from authoritative source"
   ve "Validate asset issuer, not just code" pratiklerini önerir (SKILL.md:441–443) → create
   app asset'i issuer toml'undan doğrular, yalnız koda güvenmez.

---

## 8. Toplu uyum kararları & "neye uyalım" özeti

| Karar | Seçim | Faz | Gerekçe (kaynak) |
|---|---|---|---|
| Token arayüzü | **SEP-41** (`token::TokenClient`) birebir | v1 | claim'in tek primitifi (assets SKILL.md:303–312; `factory/src/lib.rs:206`) |
| Fonlama primitifi | **`transfer_from` + balance guard** | v1 | repo konvansiyonu (`factory/src/lib.rs:208`); plan §4.5 güncellenmeli |
| Kontrat ABI yayını | **SEP-48** Wasm interface spec | v1 | "Active" (standards SKILL.md:772) |
| Kontrat meta | **SEP-46** | v1 (opsiyonel) | "Active" (standards SKILL.md:771) |
| Adres doğrulama | **SEP-23 StrKey** checksum (istemci) | v1 | `G…`/`C…` validasyon (standards SKILL.md:57) |
| Claim linki | **App-link** `?a=&cid=&n=` (uygulama) | v1 | CID immutable, config on-chain (§3.2) |
| Cüzdan deeplink | **SEP-7** `web+stellar:tx` (opsiyonel/mobil-QR) | v1.x | deeplink standardı (standards SKILL.md:20) — wire-format doğrulanmalı |
| Metadata | **SEP-1 stellar.toml** (uygulama + factory) | v1 | keşif (assets SKILL.md:385–397); `[[CONTRACTS]]` doğrulanmalı |
| Auth | Soroban `require_auth` — **SEP-10 yok** | v1 | on-chain auth yeterli (§5.1) |
| Smart-wallet `C…` | Merkle yaprağı kapsar; **SEP-45 ertelendi** | v1 kabul / SEP-45 sonra | Draft (standards SKILL.md:770) |
| Native alternatif | **Claimable Balance küçük/native için**; bu araç ölçek için | — | trade-off (§6) |
| Hashing | **Düz keccak256 + domain tag**, BN254 indirgemesi YOK | v1 | `factory/src/lib.rs:119–120` (yalnız keccak parçası) |

### 8.1 Açık doğrulama listesi (implementasyon öncesi)
- [ ] SEP-7 `web+stellar:tx` parametre grameri + Soroban `InvokeHostFunction` deeplink desteği
      — canonical `sep-0007.md` (skill inline doğrulamıyor).
- [ ] SEP-1 `[[CONTRACTS]]` bloğunun standart alanları — canonical `sep-0001.md` (skill yalnız
      `[[CURRENCIES]]` örneği veriyor, assets SKILL.md:389–397).
- [ ] SEP-45 güncel status (Draft→?) — `stellar-protocol/ecosystem` (standards SKILL.md:35–41, 770).
- [ ] Claimable Balance entry rezervi + trustline başına rezerv (~0.5 XLM, plan değeri) ve base
      fee — canonical fee/reserve dokümanı (skill rakamı doğrulamıyor).
- [ ] SEP-41 `transfer`/`transfer_from`/`balance` tam imzaları — pinlenen
      **`soroban-sdk 26.0.0-rc.1`** `token::TokenClient` (repo emsali `factory/src/lib.rs:206–214`).

### 8.2 Repo-çelişkisi olarak rapor edilenler (KILITLI KARARLAR'a dokunmaz, plan/taslak düzeltmesi)
1. **soroban-sdk sürümü**: KILITLI KARAR "26.x"; repo somut pin **`26.0.0-rc.1`**. Yeni
   crate'ler bu rc'yi kullanmalı (`*/Cargo.toml:10`).
2. **Fonlama primitifi**: Taslak/plan §4.5 "doğrudan `transfer(owner, instance, total)`" diyor;
   repo `transfer_from` (allowance) kullanır (`factory/src/lib.rs:208`). Plan §4.5 + taslak
   §2.2-madde-3 düzeltildi.
3. **Hashing citation**: `factory/src/lib.rs:118–122` aralığı BN254 `BnScalar` indirgemesi
   (satır 121) içerir; bu ZK-spesifiktir. Airdrop düz keccak256 kullanmalı; paylaşılan parça
   yalnız satır 119–120'dir.
4. **Token client adı**: `token::Client` → repo `token::TokenClient` (`factory/src/lib.rs:206`).

> Bu dört madde **kod yazmadan önce** plan/taslakta düzeltilmeli; geri kalan tüm hizalama
> kararları `standards` + `assets` skill'leri ve repo konvansiyonlarıyla
> (`factory/src/lib.rs`, `vesting/src/lib.rs`) dayanaklıdır.

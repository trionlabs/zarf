# Zarf Airdrop Aracı — Tehdit Modeli & Güvenlik

> Kapsam: Zarf'ın ZK/e-posta gizlilik çekirdeğinden **bilinçli olarak ayrılmış**, klasik
> **cüzdan-adresi + Merkle-claim** airdrop aracının tehdit modeli. Mimari: `zarf/airdrop`
> (instance) + `zarf/airdrop-factory` (yeni, bağımsız Soroban crate'leri; workspace yok) +
> `airdrop-create` / `airdrop-claim` SvelteKit app'leri + pin-proxy/IPFS + opsiyonel indexer.
> **ZK YOK, gizlilik YOK**; claim anlık, alıcı kendi fee'sini öder. Mevcut
> verifier/registry/vesting/factory/circuit'e **dokunulmaz**. Bu doküman STRIDE çerçevesini,
> saldırı yüzeyi envanterini, korunan invariant'ları, somut saldırı senaryolarını + azaltımlarını
> ve audit-hazırlık checklist'ini verir.
>
> **Toolchain (repo konvansiyonu, doğrulandı):** `soroban-sdk = "26.0.0-rc.1"`
> (`default-features = false`, `features = ["alloc"]`), target `wasm32v1-none`, `#![no_std]`.
> Tüm Stellar/Soroban/SEP iddiaları `soroban` + `assets` skill'lerine **ve repo kaynak koduna**
> dayandırılmıştır; doğrulanamayan sayısal değerler **"doğrulanmalı"** olarak işaretlenmiştir.
>
> **Yeni/öneri bileşen uyarısı (doğrulandı):** `airdrop-create` / `airdrop-claim` app'leri,
> `@zarf/core/lib/merkle` modülü ve `@noble/hashes` bağımlılığı **repoda henüz yok** (mevcut app'ler
> `web/apps/{create,claim}` ZK-vesting içindir; `web/packages/core/package.json`'da `@noble/hashes`
> bulunmadı). Bu doküman bunları **ileriye dönük tasarım** olarak ele alır. Repoda var olan ve burada
> atıf verilen şeyler gerçektir (vesting/factory kontratları, pin-proxy, mevcut Pedersen
> `lib/crypto/merkleTree.ts`).

---

## 0. Adversarial-review düzeltme notu (önce oku)

Bu doküman, taslağı repoya karşı satır-satır denetleyerek düzeltildi. **Kilitli kararlarla çelişmeyen
ama repoyla çelişen iki maddi bulgu** öne çıkarılır; geri kalan azaltımlar bunlara göre yeniden yazıldı:

1. **Fonlama `transfer` değil, `transfer_from` (allowance-pull) ile yapılır.** Repo factory'si
   `create_and_fund_vesting` içinde `token_client.transfer_from(spender=factory, from=owner,
   to=instance, total)` çağırır (`contracts/soroban/zarf/factory/src/lib.rs:208-213`, balance-guard
   `:214-221`). Bu, owner'ın **factory'ye önceden `approve` (allowance) vermesini** gerektirir;
   allowance yoksa fonlama **başarısız olur** (testler: `factory/tests/factory.rs:240-270`
   `create_and_fund_vesting_consumes_factory_allowance` allowance'ı tüketir; `:272-308`
   `failed_funding_does_not_track_deployment` "funding without allowance unexpectedly succeeded"
   guard'ı, assert `:299-302`). Taslağın "owner→instance basit `transfer`" modeli **yanlıştı**;
   airdrop tasarımı bu repo desenini birebir izlemeli ve allowance adımı bir saldırı-yüzeyi maddesi
   olarak ele alınmalı (§3.6, §4.3, §4.10).

2. **Repo `recipient_id` = düz `keccak256(to_xdr)` DEĞİL; üstüne BN254 skaler indirgemesi var.**
   `recipient_id` / `recipient_field`, `BnScalar::from_bytes(keccak256(addr.to_xdr)).to_bytes()`
   uygular (`factory/src/lib.rs:118-122`, `vesting/src/lib.rs:521-525`) — bu indirgeme **ZK devresi
   içindir** (alan elemanı olması gerekir). Airdrop yaprağı **düz keccak** kullanır (indirgeme YOK).
   Dolayısıyla "yaprak repo `recipient_id` ile birebir aynı" iddiası **yanlıştı**: aynı olan şey
   *host fonksiyonu* (`env.crypto().keccak256`, `factory/src/lib.rs:120`) ve *XDR adres
   serileştirmesi* (`to_xdr`); BN254 indirgemesi airdrop tarafında **bilinçli olarak yoktur** (§4.2).

Bu revizyonda ek olarak **üç tehdit yüzeyi açıkça sahiplenildi**: (a) repo payout'unun
`MuxedAddress`'e gitmesi (`vesting/src/lib.rs:380-381`) → muxed-claimant leaf/transfer tutarlılık
invariant'ı (§3.1, §3.2, INV-11, §4.13); (b) var-olmayan (unfunded) `G…` claimant'ın claim davranışı
+ reserve/auth kesişimi (§3.5, §4.14); (c) CID-tahrifi + create-app XSS ile yanlış-instance
yönlendirmesi (§3.2, §3.4, §4.15). Default skeptik tutum: emin olunmayan ağ sabitleri (footprint
~100-entry cap, base/trustline reserve, ~180g TTL tavanı, sponsored-reserve reçetesi, per-claim fee)
**"doğrulanmalı"** olarak bırakıldı — bunlar ne skill'de ne repoda kesin sayıyla mevcuttur.

---

## 1. Güven sınırları & saldırı yüzeyi envanteri

Sistemde dört güven bölgesi var. Saldırgan, `soroban` skill'inin "Core Principle"ında
(SKILL.md:1390-1396) varsaydığı gibi **tüm fonksiyon argümanlarını, tx sıralamasını/zamanlamasını ve
imza gerektirmeyen tüm hesapları** kontrol eder; ayrıca **bizim arayüzümüzü taklit eden kontratlar
deploy edebilir** (SKILL.md:1396).

| # | Bileşen | Bölge | Güven | Saldırgan kontrolü |
|---|---|---|---|---|
| A1 | `zarf/airdrop-factory` (on-chain) | on-chain | yüksek (kod denetlenir) | tüm public arg'lar: `token`, `merkle_root`, `total`, `deadline`, `locked`, `recipient_count`, `salt`, `metadata_cid` |
| A2 | `zarf/airdrop` instance (on-chain) | on-chain | yüksek | `claim(index, claimant, amount, proof)` arg'ları; `withdraw_unclaimed`'in `to`'su |
| A3 | `token` kontratı (SAC / SEP-41) | on-chain | **düşük** (keyfi adres) | malicious token kodu, fee-on-transfer, clawback, AUTH_REQUIRED |
| B1 | `airdrop-create` app | off-chain/client | orta | ağaç inşası, claim-list JSON, CID üretimi, `approve` adımı |
| B2 | `airdrop-claim` app | off-chain/client | orta | proof seçimi, tx oluşturma, ağ seçimi |
| C1 | pin-proxy worker + IPFS/Pinata | off-chain | düşük | JSON içeriği değiştirilebilir/erişilemez yapılabilir (ama §3.5 sertleştirmesi var) |
| C2 | indexer (opsiyonel) | off-chain | düşük (yalnız okuma) | event yorumu; **fon hareketi yetkisi yok** |
| D | alıcı/owner cüzdanları | uç | dışsal | kendi anahtarları |

Kilit mimari avantaj: **fonlar yalnız instance kontratının bakiyesinde durur** ve dışarı çıkışın
TEK yolu `claim` (proof + bitmap kapısı) ve `withdraw_unclaimed` (`admin.require_auth()` + `locked`
kapısı). Factory fonu **transit olarak** elinde tutmaz: deploy'dan sonra `owner→instance`
fonlamasını **allowance-pull** ile yapar (`transfer_from`, `factory/src/lib.rs:208-213`).
Off-chain bileşenler (B/C) **kasa anahtarı taşımaz**; en kötü hâlde griefing/yanlış-yönlendirme
yaparlar, hırsızlık yapamazlar — çünkü on-chain kapılar client'a güvenmez (`soroban`
SKILL.md:1751 "Don't trust client-side validation alone"). **İstisna (bu revizyonda netleşti):**
off-chain bileşenler **yanlış instance adresine yönlendirme** (CID-tahrifi / XSS) ile kullanıcıyı
*saldırganın kontrol ettiği bir kontrata* claim/approve ettirebilir — bu, on-chain invariant'ları
kırmadan **kullanıcı fonunu yanlış hedefe** akıtabilen tek vektördür ve §4.15'te ayrı ele alınır.

---

## 2. Korunan invariant'lar (on-chain)

Bu invariant'lar kontratın güvenlik sözleşmesidir; her test ve audit bunları hedef alır.

| INV | İfade | Nerede zorlanır |
|---|---|---|
| INV-1 | **Σ(claim edilen) + withdraw ≤ fonlanan** — bir instance kendi bakiyesinden fazlasını ödeyemez | token kontratının kendi bakiye kontrolü + `claim` öncesi bitmap |
| INV-2 | **Her `index` en fazla bir kez** claim edilir | `ClaimedWord` bitmap; set **transfer'dan ÖNCE** |
| INV-3 | **Bir proof yalnız kendi `merkle_root`'una karşı geçerli** | `verify_merkle(config.merkle_root, leaf, proof)` |
| INV-4 | **Yaprak ↔ (index, claimant, amount) tek-eşlemeli**; second-preimage yok | domain-tag'li `keccak256` (0x00 yaprak / 0x01 düğüm) |
| INV-5 | **`withdraw_unclaimed` yalnız `admin`** ve `locked` semantiğine uyar | `admin.require_auth()` + deadline/locked kapısı |
| INV-6 | **`deadline>0` sonrası `claim` kapalı** | `now > deadline ⇒ Expired` |
| INV-7 | **A instance'ının fonu B'nin proof'uyla çekilemez** (instance izolasyonu) | her instance ayrı kontrat = ayrı bakiye + ayrı bitmap |
| INV-8 | **Aritmetik taşmaz**; `amount>0`, `total>0`, `index` geçerli aralıkta | `checked_add` (repo deseni `factory/src/lib.rs:217`), `#[contracterror]` |
| INV-9 | **Fonlama tam**: instance, `total` kadar (fee-on-transfer eksiği yok) | balance-before/after `TokenTransferMismatch` guard (`factory/src/lib.rs:214-221`) |
| INV-10 | **Cross-network replay yok** | merkle_root + instance adresi ağa bağlı; client'ta `network` denetimi |
| INV-11 | **Muxed-tutarlılık**: bir `claimant`'ın leaf-hash'i, ödeme yapılan hesabın **temel (base) `G…`/`C…`** kimliğine bağlanır; muxed varyant (`M…` / id'li) ne **ekstra hak** verir ne de fonu **başka bir base-hesaba** yöneltir | leaf preimage'inde base `Address.to_xdr()`; payout `MuxedAddress` olsa da bakiye base-hesapta hareket eder (`vesting/src/lib.rs:379,383-397` balance-guard) |

> **`UsedRoot` neden GEREKMEZ (repodan bilinçli farkımız):** Zarf çekirdeğinde ZK proof
> `(merkle_root, audience_hash)`'e bağlı ama **vesting adresine bağlı değil**, bu yüzden aynı köklü
> iki kardeş aynı proof'u kabul edebiliyor → factory `reserve_merkle_root` ile kök tekrarını
> engelliyor (fonksiyon `factory/src/lib.rs:382-407`, kontrol `:399-401`, hata return `:400`;
> `Error::MerkleRootAlreadyUsed = 8` discriminant'ı error enum'da **satır 43**; `DataKey::UsedRoot`
> `factory/src/lib.rs:62-66`). **Burada ZK proof yok.** Merkle proof sadece `config.merkle_root`'a
> karşı doğrulanır (INV-3) ve fon **o instance'ın bakiyesinden** çıkar (INV-7). Aynı kökle iki
> instance deploy edilse bile her biri kendi fonunu, kendi bitmap'ini tutar; A'nın proof'u B'nin
> fonuna erişemez. Dolayısıyla `UsedRoot` kaldırılabilir — bu bilinçli ve güvenli bir
> sadeleştirmedir. (İstenirse §6'daki yaprak adres-binding ekstra sağlamlaştırmadır.)

---

## 3. STRIDE tehdit modeli

### 3.1 Spoofing (kimlik taklidi)

| Tehdit | Vektör | Azaltım |
|---|---|---|
| Başkasının yerine claim edip fonu çalma | saldırgan `claim(index, victim_addr, amount, proof)` çağırır | Fon **her hâlükârda leaf'teki `claimant`'a** gider (INV-4); ayrıca varsayılan `claimant.require_auth()` zorunlu — repo vesting'i bunu claim'in **ilk satırında** yapar (`vesting/src/lib.rs:313`). Saldırgan en fazla **kurban yerine fee öder** — hırsızlık değil, hatta lehte (§4.4) |
| Sahte token kontratı (interface taklidi) | owner `create_airdrop(token=malicious)` | `soroban` SKILL.md:1480-1516 (#3 "Arbitrary Contract Calls"): instance keyfi token'a güvenir ama **risk owner'a aittir** (kendi airdrop'u). Alıcı tarafı create-app'in token-trust tier'ı + claim-app'in instance/token adres doğrulamasıyla korunur (§5) |
| Sahte factory / sahte instance linki | phishing claim linki `?a=C…&cid=…` | claim-app **instance adresini** doğrular: CID'deki JSON'un `airdrop`/`token` alanları = link'teki `a` parametresi = on-chain `config()` ile çapraz denetlenir (`soroban` SKILL.md:1752 "Verify contract addresses against known deployments"); ayrıntı §4.15 |
| Yanlış ağ üzerinde imza | cüzdan mainnet, app testnet | `soroban` SKILL.md:2433-2456 (#12 Network Mismatch): claim-app `getNetwork()` ile cüzdan-ağ uyumunu zorlar; JSON `network` alanı denetlenir (INV-10) |
| **Allowance hedefi taklidi (yeni)** | owner yanlış spender'a `approve` verir | Fonlama `transfer_from`'la **factory'nin allowance'ını** tüketir; create-app, `approve`'un spender'ını **on-chain factory adresine** (env'den) sabitlemeli — kullanıcı keyfi spender girmemeli (§4.10) |
| **Muxed-adres ile claim taklidi (yeni)** | saldırgan, leaf'te base `G…` olan bir alıcıyı **muxed varyantıyla** (`M…` veya `G…` + memo-id) çağırmayı / muxed bir adresi leaf gibi sunmayı dener | Leaf preimage **base `Address.to_xdr()`** üzerinden tanımlanır; airdrop ağacı muxed kimlikleri yaprak olarak **listelemez** (create-app validasyonu strkey'i base `G…`/`C…`'ye normalize eder). Payout `MuxedAddress`'e gitse de (`vesting/src/lib.rs:380-381`) bakiye **base-hesapta** hareket eder ve balance-guard base-hesabın `+amount`'ını doğrular (`vesting/src/lib.rs:383-397`) → muxed varyant ne ekstra hak verir ne de fonu başka hesaba yöneltir (INV-11; ayrıntı §4.13) |

### 3.2 Tampering (kurcalama)

| Tehdit | Vektör | Azaltım |
|---|---|---|
| IPFS JSON kurcalama | C1 saldırganı proof/amount'u değiştirir | **On-chain merkle_root nihai otorite**: kurcalanmış proof `verify_merkle` testinden geçemez (INV-3). En fazla DoS (geçersiz claim) — fon güvende |
| CID yanlış-eşleme | claim link'te yanlış CID | claim-app CID içeriğinin `root` alanını **on-chain `config().merkle_root`** ile karşılaştırır; uyuşmazsa reddeder (§4.15) |
| **Sahte instance adresi enjeksiyonu (yeni)** | C1 sahte claim-list servis eder **veya** create-app DOM'una XSS ile sahte `a=C…` yazılır → kullanıcı saldırgan kontratına `claim`/`approve` eder | İki yönlü çapraz-bağ: (1) claim-app, link `a` ↔ JSON `airdrop` ↔ on-chain `config().merkle_root`'u zorlar; (2) create-app, instance adresini **kullanıcı-girişinden değil**, `create_airdrop` dönüş değerinden / `AirdropCreated` event'inden alır (asla URL/DOM'dan). pin-proxy **owner-imzalı, root'a-bağlı pin auth** ile yetkisiz/sahte pinlemeyi engeller (`pin-proxy` `validatePinAuth`, `web/apps/pin-proxy/src/index.ts:260-310`). Ayrıntı §4.15 |
| Pin-istek kurcalama (yeni) | C1 → owner'ın pinlediği gövdeyi değiştirir | pin-proxy **SEP-53 owner-imzalı auth** ister: imza `owner ‖ merkleRoot ‖ bodyHash(sha256) ‖ issuedAt`'e bağlı (`web/apps/pin-proxy/src/index.ts:298-303`, `buildPinAuthMessage` `:312-325`); gövde değişirse sunucu `bodyHash`'i yeniden hesaplar ve uyuşmazsa 401 `body_hash_mismatch` (`:288-291`) |
| Second-preimage Merkle | iç düğümü "yaprak" gibi sunma | domain-tag (`0x00`/`0x01`) — bir iç düğüm asla geçerli yaprak olamaz (INV-4); repo `keccak256` host fonksiyonu (`factory/src/lib.rs:120`) |
| **Muxed leaf-format kurcalaması (yeni)** | saldırgan yaprağa base yerine muxed serileştirme koyup iki ayrı geçerli yaprak (base + muxed) üretmeyi dener | Normatif leaf-format **tek bir kanonik base serileştirme** dayatır (create-app + kontrat aynı `to_xdr` base biçimi). Muxed varyant ayrı bir yaprak üretmez çünkü ağaçta yok; üretilse bile transfer base-hesaba gider (INV-11). Test: muxed/base ikilisi için tek root (`vesting:380-381` davranışı pinlenir) |
| Storage key collision | tip karışması ile state bozma | `soroban` SKILL.md:1556-1583 (#5): typed `#[contracttype] enum DataKey { Config, ClaimedWord(u32) }` (repo deseni `vesting/src/lib.rs:68-81` typed `DataKey`) |
| Bitmap word çakışması | `index` aritmetiği hatası | `word = index / W`, `bit = index % W`; word başına ayrı persistent entry; sınır testleri |

### 3.3 Repudiation (inkâr)

| Tehdit | Azaltım |
|---|---|
| "Claim olmadı / fonlama olmadı" inkârı | `#[contractevent]` `Claimed{to,index,amount}`, `Withdrawn{to,amount}`, factory `AirdropCreated{...}` (repo `VestingCreated` deseni `factory/src/lib.rs:69-81`; vesting `Claimed` `vesting/src/lib.rs:119-127`). Tüm denetlenebilir state değişikliği event basar (`soroban` checklist SKILL.md:1727) |
| İlerleme/iddia uyuşmazlığı | indexer event'leri okuyup claimed/total sunar; on-chain `is_claimed` / `claimed_statuses` ile çapraz doğrulanabilir (repo `vesting/src/lib.rs:279-305`) |
| Pin-istek inkârı (yeni) | pin-proxy auth imzası owner pubkey'ine + `issuedAt`'e bağlı (5 dk pencere, `PIN_AUTH_MAX_AGE_MS`, `web/apps/pin-proxy/src/index.ts:57,281`) → kim hangi root'u pinledi izlenebilir |

### 3.4 Information Disclosure (bilgi sızıntısı)

Bu araçta **gizlilik bir hedef değil** (kilitli karar). Liste public, proof'lar zararsız.

| Tehdit | Değerlendirme |
|---|---|
| Alıcı adres + miktar listesi public (IPFS) | **Beklenen davranış** — açık dağıtım aracı; proof'lar token izolasyonu sayesinde zararsız (INV-7) |
| PII sızıntısı | **Yok** — Zarf çekirdeğinin aksine e-posta/Google yok; tanımlayıcı sadece `G…`/`C…` adresi. create-app PII redaksiyonu yapmaz (gerekmez); liste localStorage'a saklanabilir |
| **Yanıltıcı içerik sızdırma / sosyal-mühendislik (yeni)** | Public liste + public claim-link **saldırganın kendi sahte airdrop'unu meşru görünümle dağıtmasını** kolaylaştırır: aynı şema, sahte `airdrop`/`token` ile sahte CID üretip kurbanı yanlış instance'a yönlendirir. Bu bir *bilgi-sızıntısı* değil, **bilginin kötüye kullanımıdır**; teknik azaltım §4.15'tedir (link `a` ↔ JSON ↔ on-chain üçlü-bağ + create-app origin izolasyonu). claim-app, gösterdiği token'ın gerçek `name/symbol/issuer`'ını on-chain `config().token`'dan çekip uyarmalı |
| Kasıtsız sır commit'i | CLAUDE.md konvansiyonu: secret commit edilmez, Worker secret'ları `wrangler secret`. pin-proxy `PINATA_JWT` **var değil, secret'tır**: `wrangler.jsonc:41-45` yorumu bunu açıkça belgeler (`wrangler secret put PINATA_JWT`); kodda `env.PINATA_JWT` yalnız runtime'da okunur (`src/index.ts:150,159`) |

### 3.5 Denial of Service

| Tehdit | Vektör | Azaltım |
|---|---|---|
| TTL/archival ile liveness kaybı | dormant kampanya entry'leri arşivlenir | `soroban` SKILL.md:1618-1644 (#7): her `claim`/`withdraw` TTL'i `TTL_THRESHOLD` altına inince `TTL_EXTEND_TO`'ya uzatır. Repo sabitleri: `DAY_IN_LEDGERS = 17_280`, `TTL_EXTEND_TO = 120 * DAY_IN_LEDGERS` (~120 gün), `TTL_THRESHOLD = TTL_EXTEND_TO - DAY_IN_LEDGERS` (`factory/src/lib.rs:13-22`; ayrıca `vesting/src/lib.rs:24-33`). Repo yorumu "~180-day network maximum entry TTL" der (`factory:15-16`) ama bu tavan **doğrulanmalı**. **Archived = "yok" değil, restore edilebilir** (liveness-only, fon kaybı değil) |
| Unbounded loop / sayfa şişmesi | aşırı sayfa/`limit` | Factory `MAX_PAGE_LIMIT = 80` (`factory/src/lib.rs:27`) ile sınırlı; `range_infos` `limit > MAX_PAGE_LIMIT ⇒ Err(InvalidLimit)` döner (`factory/src/lib.rs:509-511`). Repo yorumu footprint entry cap'ini "~100" ağ sınırı diye not eder (`factory/src/lib.rs:23-26`) → **doğrulanmalı: kesin ağ üst sınırı**. Repo vesting ise `claimed_statuses(Vec<BytesN<32>>) ≤ MAX_CLAIMED_BATCH(64)` kullanır (`vesting/src/lib.rs:41,293-305`, kontrol `:297-299`, `Error::TooManyCommitments`); airdrop'un bitmap-index'li `(start,limit)≤80` deseni meşrudur ama bu ayrılık **gerekçelendirilmeli** (vesting commitment-vektörü alır, airdrop bitmap-aralığı; iki farklı veri modeli) |
| IPFS erişilemezliği | C1 JSON'u kaldırır | **Fon güvende** (on-chain claim IPFS'e bağlı değil; proof tek başına yeterli). Birden çok pin/gateway + create-app proof'u indirilebilir tutar; ileri seviye: proof'u tx hazırlık anında client'ta yeniden üretme. pin-proxy okuma yolu zaten 3 gateway dener (`src/index.ts:60-64,189`) |
| pin-proxy flood / abuse | saldırgan worker'ı doldurur | pin-proxy zaten sertleştirilmiş: **IP + owner rate-limiter** (`PIN_IP_LIMITER` = 10 istek/60s, `PIN_OWNER_LIMITER` = 5 istek/60s; `wrangler.jsonc:16-30`, uygulama `src/index.ts:98-111`), **gövde boyutu cap'i** (`MAX_BODY_BYTES`, default 1 MiB, `src/index.ts:113-130`), **CID path-traversal validasyonu** (`validateCid`, `src/index.ts:363-376`), **`ALLOWED_ORIGINS` CORS** (`buildCorsHeaders`, `:378-396`, eşleşmeyen origin asla `*` değil), **5 dk replay penceresi** (`:281`) |
| Resource limit aşımı | büyük proof / büyük tx | claim-app `simulateTransaction → assembleTransaction` zorunlu (`soroban` SKILL.md:2368-2394, #10) — kaynaklar simülasyonla bağlanır |
| Owner-DoS (fee saldırısı) | yok | claim'i **alıcı imzalar ve fee öder**; owner'ın fee maruziyeti sadece tek seferlik create/approve/fund |
| **Unfunded-claimant claim hatası (yeni)** | leaf'te listeli `G…` **on-chain'de henüz var olmuyor** (hesap oluşturulmamış) | `claimant.require_auth()` var-olmayan bir hesap için **imzalanamaz/doğrulanamaz** ve native ödemede hedef hesabın varlığı + min-reserve gerekir → claim **başarısız**. Bu **fon kaybı değil**, bir UX/liveness griefing'idir: index claim'lenmemiş kalır (set-before-transfer rollback'i, §4.1) ve alıcı hesabını fonlayınca tekrar deneyebilir. claim-app **net uyarı** + sponsored-reserve alternatifi (§4.14). **Doğrulanmalı:** base account reserve güncel değeri (`soroban` SKILL.md:2287 "Minimum ~1 XLM for base reserve") |

### 3.6 Elevation of Privilege (yetki yükseltme)

| Tehdit | Azaltım |
|---|---|
| Yetkisiz `withdraw_unclaimed` | `admin.require_auth()` (INV-5); `soroban` SKILL.md:1415-1437 (#1 Missing Authorization). Repo eşdeğeri owner-gated yazımlar `vesting/src/lib.rs:430-434` (`require_owner`) |
| `locked` kilidini atlama | `withdraw_unclaimed` kapısı: `locked && (deadline==0 || now<=deadline) ⇒ NotYetWithdrawable` |
| Re-initialization | `__constructor` (Protocol 22+) — yalnız deploy anında çalışır, upgrade'de değil (`soroban` SKILL.md:159-163, kural #3). Repo deseni: factory `__constructor` `factory/src/lib.rs:92-104`, vesting `__constructor` `vesting/src/lib.rs:131-158`. **Ayrı `initialize` yok ⇒ #2 reinit saldırısı (SKILL.md:1443-1475) kapalı** |
| Upgrade kötüye kullanımı | **Instance immutable** (upgrade entrypoint YOK) — `soroban` SKILL.md:1905-1908 "If immutable, do not expose upgrade capability". `update_current_contract_wasm` çağrısı **repoda yok** (grep teyidi: `contracts/soroban/zarf` altında sıfır eşleşme) ⇒ Scout `unprotected-update-current-contract-wasm` tetiklenmez. (Repo factory yorumu da upgrade yolu olmadığını söyler; `factory/src/lib.rs:54-56` "there is no upgrade path".) |
| Factory salt squatting | `owner_bound_salt = keccak256(owner.to_xdr ‖ salt)` (`factory/src/lib.rs:460-464`): adres owner'a bağlanır, başkası owner'ın adresini önceden işgal edemez (§4.10) |
| Deploy mekaniği | Deploy `env.deployer().with_current_contract(owner_bound_salt).deploy_v2(wasm_hash, ctor_args)` ile yapılır (`factory/src/lib.rs:316-332`, salt türetimi `:315`). wasm **`include_bytes!` ile gömülmez**; factory yalnız `vesting_wasm_hash: BytesN<32>` saklar (`factory/src/lib.rs:96,101`) ve wasm ağa **ayrı yüklenir**. Adres `predict_vesting_address` ile önceden türetilebilir (`:124-129`) |
| **Allowance kötüye kullanımı / front-run (yeni)** | owner factory'ye `approve` verir; fonlama `transfer_from` ile çeker (`factory/src/lib.rs:208-213`). Riskler: (a) allowance `expiration_ledger`'ı çok kısaysa fonlama tx'i süre dışı kalır → `create_and_fund_vesting` revert; (b) artık allowance bir saldırı yüzeyi DEĞİL çünkü `transfer_from`'u yalnız factory'nin kendi funding akışı (owner-auth altında, `:188`) çağırır — başka entrypoint allowance'ı tüketmez. create-app `approve(owner, factory, total, exp)`'ı tek tx-bundle'da fonlama çağrısından hemen önce göndermeli (allowance leftover bırakmamalı). Test referansı: `factory/tests/factory.rs:240-308`. |

---

## 4. Saldırı senaryoları & azaltımlar (derinlemesine)

### 4.1 Double-claim (çift talep)
**Senaryo:** Alıcı aynı `index`'i iki kez claim etmeye çalışır (paralel tx veya retry).
**Azaltım:** Güvenlik açısından kritik invariant **set-claimed-before-transfer**'dır (INV-2). Repo
vesting `claim`'i şu sırayı uygular: **(1) `recipient.require_auth()` (İLK satır, `vesting:313`)
(2) public-input/pubkey/root/recipient/unlock/audience/jwt kontrolleri (3) `is_claimed` kontrolü
(`:358`) (4) `set Claimed=true` (`:364-366`) (5) `verify_proof` (`:368`) (6) `transfer` (`:381`)
(7) event (`:406`)**. Önerilen airdrop sırası ise **deadline → is_claimed → verify_merkle →
require_auth → set_claimed → transfer → event** olabilir; auth'un **konumu** (en başta mı, set'ten
hemen önce mi) bir tasarım tercihidir, **kritik olan** flag'in transfer'dan **önce** set edilmesi ve
başarısızlıkta geri alınmasıdır. Soroban'da klasik cross-contract reentrancy yok (`soroban`
SKILL.md:1405-1406), ama yine de checks-effects-interactions garanti edilir. İki tx aynı ledger'a
girse bile ikincisi `AlreadyClaimed` döner.
**Test:** happy-path + ikinci claim `AlreadyClaimed`.

> **Not (transfer-fail rollback'i):** Repo vesting `claim`'i, flag'i transfer'dan önce set edip
> proof **veya** transfer doğrulaması (`TokenTransferMismatch`) başarısızsa **açıkça `false`'a geri
> yazar** — proof fail'inde `vesting/src/lib.rs:368-373`, transfer-guard fail'inde `:393-396`;
> atomik-revert'e güvenmez. Airdrop instance'ı da bu deseni izlemeli: aksi hâlde başarısız bir
> transfer index'i kalıcı "claimed" bırakıp **liveness kaybına** yol açar (fon hâlâ kontratta ama o
> index bir daha denenemez). Ek olarak repo, **çift-yönlü per-claim balance guard** uygular
> (kontrat `−amount`, alıcı `+amount`; `vesting/src/lib.rs:378-397`) → airdrop instance'ı bunu da
> almalı.

### 4.2 Second-preimage Merkle saldırısı
**Senaryo:** Saldırgan bir iç düğümün hash'ini "yaprak" gibi sunup, hiç var olmayan bir
(index, amount) için geçerli proof üretmeye çalışır.
**Azaltım:** Domain ayrımı — yaprak `keccak256(0x00 ‖ index_be(4) ‖ claimant.to_xdr ‖ amount_be(16))`,
düğüm `keccak256(0x01 ‖ sorted(L,R))` (INV-4). Tag farkı, hiçbir iç düğümün geçerli bir yaprak
ön-görüntüsü olamayacağını garanti eder. `sorted` (leksikografik, OZ-stili) proof'ta yön biti
gereksinimini kaldırır. `to_xdr()` serileştirmesi `G…`/`C…` ayrımını kapsar (repoyla **aynı host
fonksiyonu ve XDR**; `factory/src/lib.rs:118-122` — ama repo `recipient_id`'deki BN254 skaler
indirgemesi airdrop yaprağında **YOK**, çünkü ZK alan-elemanı kısıtı burada geçerli değil).
**Test:** iç-düğüm-as-yaprak denemesi `InvalidProof`.

### 4.3 Fee-on-transfer / eksik fonlama
**Senaryo:** Owner fee-on-transfer veya rebasing bir token seçer; instance `total`'dan az fonlanır →
son claim'ciler `op_underfunded`/insufficient ile düşer (INV-1/INV-9 ihlali).
**Azaltım:** Factory funding akışında **balance-before/after** guard, repo `create_and_fund_vesting`
desenini birebir izler: `token_client.transfer_from(factory, owner, instance, total)` çağrılır
(`factory/src/lib.rs:208-213`); `after_balance != before_balance.checked_add(total) ⇒
TokenTransferMismatch` (`:214-221`) ve deploy **atomik geri alınır** (test:
`failed_funding_does_not_track_deployment`, `factory/tests/factory.rs:272-308` →
`get_deployment_count == 0`). Ayrıca create-app `Σ amount == total` zorunlu kılar.
**Önkoşul (kritik):** Fonlama `transfer_from` olduğu için owner **önce factory'ye `approve`**
vermeli; allowance yoksa fonlama başarısız (test guard: "funding without allowance unexpectedly
succeeded", `factory/tests/factory.rs:299-302`).
**Test:** mock fee-on-transfer token ile `TokenTransferMismatch`; allowance'sız create → fail.

### 4.4 Front-running / permissionless-execute / griefing
**Senaryo:** Saldırgan, mempool'da gördüğü `claim`'i kendisi tetikler.
**Analiz:** proof + leaf public ve fon **her hâlükârda leaf adresine** gider (INV-4). Bir başkası
senin claim'ini tetiklerse **sadece senin yerine fee öder** — hırsızlık yok, aslında **lehte
griefing**.
**Karar (kilitli):** varsayılan `claimant.require_auth()` zorunlu (front-running yüzeyini de kapatır;
repo `vesting/src/lib.rs:313` deseni).
**Opsiyon:** ileride auth'suz **permissionless-execute** (herkes herhangi leaf'i tetikler) —
sponsor/batch claim ve "fee'siz onboarding" köprüsü olur; bu **fonksiyonel bir genişletme**, güvenlik
zafiyeti değil (fon yine leaf'e gider). v2'ye ertelendi. (Not: permissionless-execute açılırsa
unfunded-claimant'ı sponsor üçüncü taraf besleyebilir — §4.14 ile kesişir.)

### 4.5 Malicious / keyfi token kontratı çağrısı
**Senaryo:** `token` adresi saldırgan kontratı; `transfer` çağrısında reentrancy/yan-etki dener
(`soroban` SKILL.md:1480-1516, #3).
**Azaltım:** (a) Token'ı **owner seçer**; risk owner'ındır (kendi kampanyası). (b) Soroban'da
delegatecall yok + klasik reentrancy yok (SKILL.md:1402-1406) → token kontratı bizim state'imizi
yeniden-giremez; bitmap zaten transfer'dan önce set'li. (c) Alıcı koruması: claim-app instance/token
adresini on-chain config ile doğrular + token trust-tier uyarısı (curated/imported, §5). (d) `claim`
yan-etkileri token çağrısından **sonra** state yazmaz (event hariç). Allowlist (SKILL.md:1496-1509)
ürün gereği uygulanmaz ("herhangi token" kararı) — bunun yerine **create-tarafı uyarı + alıcı-tarafı
doğrulama**.

### 4.6 Reentrancy-adjacent
**Senaryo:** Klasik EVM reentrancy denemesi.
**Azaltım:** Yapısal olarak engelli — `soroban` SKILL.md:1398-1410 "Soroban Security Advantages":
delegatecall yok, klasik cross-contract reentrancy yok. Self-reentrancy nadiren sömürülebilir; yine de
**checks-effects-interactions**: bitmap (effect) transfer'dan (interaction) önce.

### 4.7 TTL / archival (liveness-only)
**Senaryo:** Uzun süre uykuda kampanyanın `Config`/`ClaimedWord` entry'leri arşivlenir; alıcı claim
edemez sanır.
**Azaltım:** Archived entry **silinmez, restore edilir** (`soroban` SKILL.md:1642-1644 "Archived data
can be restored, but requires transaction"); fon kaybı yok, sadece bir restore tx gerekir. Steady
traffic her claim'de TTL uzatır (repo `TTL_THRESHOLD` / `TTL_EXTEND_TO`, `vesting/src/lib.rs:399-404`,
`factory/src/lib.rs:19-22`). Tam-dormant kampanya için **harici `ExtendFootprintTTLOp`** runbook'a not
(repo `factory/src/lib.rs:16-18` ile aynı uyarı: "a fully dormant factory still needs an external
ExtendFootprintTTLOp").

### 4.8 IPFS tamper + CID doğrulama
**Senaryo:** Pinlenen JSON değiştirilir/kaldırılır.
**Azaltım:** §3.2 — on-chain `merkle_root` nihai otorite; kurcalanmış proof `verify_merkle`'dan
geçmez. claim-app: JSON `root` ↔ on-chain `config().merkle_root` çapraz denetimi + JSON
`airdrop`/`token` ↔ link/config denetimi. İçerik-adresli CID zaten byte-determinizm sağlar; pin-proxy
okuma yolu gateway içeriğini CID'e karşı doğrular (`verifyCidAgainstBytes`, `src/index.ts:204-208`,
`mismatch` → reddet). pin-proxy yazma ucunda **owner-imzalı, root'a-bağlı pin auth** (§3.2/§3.3)
yetkisiz pinlemeyi engeller. En kötü hâl: **DoS** (geçersiz/erişilemez liste), hırsızlık değil.
(Sahte-içerik *yönlendirme* riski ayrıca §4.15'te ele alınır.)

### 4.9 Klasik-asset clawback / AUTH_REQUIRED rug (v1.1)
**Senaryo (klasik asset, ör. USDC):** Issuer flag'leri airdrop'u manipüle eder.
**Azaltımlar (`assets` SKILL.md:151-220, "Best Practices > Security" 426-444 + `soroban`
SKILL.md:1681-1705):**
- **AUTH_REQUIRED** açık → issuer her trustline'ı tek tek yetkilendirmeli (`assets` SKILL.md:181-201,
  `setTrustLineFlags`) → permissionless claim imkânsız. create-app issuer flag'lerini çekip
  (`account.flags`, `assets` SKILL.md:255 `is_authorized`, 374-380 flags) bu asset'i **reddeder**.
- **AUTH_CLAWBACK_ENABLED** açık → dağıtılan token issuer'ca geri alınabilir. create-app **uyarı**
  gösterir (`assets` SKILL.md:441 "Be cautious of assets with clawback enabled").
- **Trustline gate'i:** SAC transfer'i trustline'ı **otomatik kurmaz** → alıcı `G…` trustline'sızsa
  `op_no_trust` (`soroban` SKILL.md:2296-2327, #8). claim-app **trustline-ekle ön-adımı** sunar
  (`changeTrust`, `assets` SKILL.md:224-238). Her trustline ek base-reserve kilitler
  (**doğrulanmalı: güncel per-trustline reserve değeri** — skill kesin rakam vermez; base account
  reserve "~1 XLM" `soroban` SKILL.md:2287). `C…` smart-wallet'ta gerek yok (SAC bakiyeyi
  kontrat depolamasında tutar, `assets` SKILL.md:283-301).
- **Instance fonlama:** SAC, kontrat adresine bakiyeyi kendi depolamasında tutar → instance'ı USDC
  ile fonlamak için instance'a trustline gerekmez; sürtünme yalnız alıcı `G…` tarafında.
**v1 kararı:** native XLM + custom SEP-41 (trustline/issuer-flag derdi yok). Klasik asset = v1.1.

### 4.10 Factory salt squatting, deterministik adres & allowance
**Senaryo:** Saldırgan, kurbanın gelecekteki instance adresini önceden işgal/önden-deploy etmeye
çalışır.
**Azaltım:** `owner_bound_salt = keccak256(owner.to_xdr ‖ salt)` (`factory/src/lib.rs:460-464`) →
deterministik adres **owner'a bağlanır**; farklı owner aynı salt'la farklı adres üretir (test:
`same_salt_is_owner_scoped`, `factory/tests/factory.rs:310+`). Funding entrypoint'i başında
`owner.require_auth()` (`factory/src/lib.rs:145` create-only, `:188` create-and-fund). Adres
`env.deployer().with_current_contract(owner_bound_salt).deployed_address()` ile önceden tahmin
edilebilir (repo `predict_vesting_address`, `factory/src/lib.rs:124-129`) — front-run riski yoktur
çünkü salt owner-bağlı. Çakışan salt yeniden deploy denemesi host tarafından reddedilir.
**Allowance ek-notu:** Fonlama `transfer_from`'a dayandığı için create-app, owner'ın
`approve(owner, factory, total, exp)`'ını **factory adresine sabitlemeli** (kullanıcı keyfi spender
girmemeli) ve fonlama çağrısıyla **aynı imza oturumunda** göndermeli; aksi hâlde dış aktör boşta
allowance göremez (allowance owner→factory'ye özeldir) ama **leftover allowance** iyi hijyen için
sıfırlanmalı.

### 4.11 Cross-network replay
**Senaryo:** testnet root/proof'unu mainnet'te yeniden kullanma.
**Azaltım:** root + instance adresi ağa bağlı (farklı ağ = farklı kontrat); claim-app JSON `network`
alanını cüzdan-ağıyla denetler (INV-10); ağ passphrase doğrulaması (`soroban` SKILL.md:2231-2259, #6).

### 4.12 Overflow / underflow
**Senaryo:** `amount`/`total` aritmetiğiyle bakiye kontrolünü atlatma (`soroban`
SKILL.md:1520-1552, #4).
**Azaltım:** tüm aritmetik `checked_*` (repo `checked_add`, `factory/src/lib.rs:217`; `checked_sub`
+ `checked_add` balance-guard `vesting/src/lib.rs:386,390`); `release` profilinde
`overflow-checks = true` (`soroban` SKILL.md:106). Girdi validasyonu: `amount>0`, `total>0`,
`index < recipient_count`. Typed `Err`, panic yok (CLAUDE.md konvansiyonu; repo `validate_metadata`
`factory/src/lib.rs:409-421`).

### 4.13 Muxed-adres payout & leaf-tutarlılığı (yeni)
**Senaryo:** Repo payout'u, transfer hedefini bir `MuxedAddress`'e çevirir:
`let to: MuxedAddress = (&recipient).into(); token_client.transfer(&contract, &to, &amount)`
(`vesting/src/lib.rs:380-381`). Airdrop instance'ı bu deseni miras alacaksa **"saldırgan kendi
adresinin muxed varyantıyla claim deneyebilir mi?"** sorusu ortaya çıkar:
(a) muxed-`G…` (yani `M…`/memo-id taşıyan) bir claimant'ın leaf-hash'i, base-adresle **aynı mı
çözülür**? (b) transfer **doğru base-hesaba mı** gider?
**Analiz & azaltım (INV-11):**
- **Leaf tek-kaynak base'tir.** Airdrop ağacı, create-app validasyonunda strkey'i **base `G…`/`C…`'ye
  normalize ederek** kurulur; leaf preimage `claimant.to_xdr()`'in **base** biçimini kullanır. Bir
  `MuxedAddress`, base + bir `u64` memo-id'dir; aynı base'in **sonsuz muxed varyantı** vardır ama
  hepsi **tek bir base kimliğine** çözülür. Dolayısıyla muxed varyantla yapılan bir `claim` denemesi,
  leaf base'ine eşlenmediği sürece **`InvalidProof`** alır; eşleniyorsa zaten o base'in meşru claim'idir.
- **Payout base-bakiyede hareket eder.** `MuxedAddress` Stellar semantiğinde **yönlendirme/memo**
  amaçlıdır; bakiye **base hesabında** artar. Repo'nun çift-yönlü balance-guard'ı tam da base
  `recipient`'in `+amount`'ını doğrular (`vesting/src/lib.rs:379,383-397`), muxed wrapper'ın değil →
  muxed varyant fonu **başka bir hesaba kaçıramaz**.
- **Sonuç:** Muxed varyant **ne ekstra hak** (her base zaten bir leaf), **ne yanlış-yönlendirme** verir.
  Risk, yalnızca **leaf-format kanonik base'i dayatmazsa** (örn. create-app muxed serileştirmeyi
  yaprağa koyarsa) ortaya çıkar → bu durumda base ve muxed iki ayrı yaprak görünür, kullanıcı
  kafa karışıklığı/çift-listeleme olur. **Azaltım:** normatif leaf-format **kanonik base `to_xdr`**
  dayatır; create-app muxed girişi base'e indirger veya reddeder.
**Tutarlılık invariant'ı (INV-11) test edilmeli:** Rust↔JS paylaşılan vektör seti, **(base addr) →
leaf** ve **(aynı base'in muxed varyantıyla yapılan claim) → transfer base-hesaba** eşitliğini
pinlemeli. **Karar:** v1 airdrop leaf-format'ı yalnız **base** kabul eder; muxed payout repo deseni
gereği desteklenir ama hak/eşleme **base** üzerindendir.

### 4.14 Unfunded (var-olmayan) claimant (yeni)
**Senaryo:** Liste, henüz **on-chain'de oluşturulmamış** bir `G…` claimant içerir (hiç fonlanmamış,
hesap kaydı yok). Alıcı `claim(index, addr, amount, proof)` tx'ini göndermek ister.
**Davranış:**
- **Auth tarafı:** varsayılan `claimant.require_auth()` (§4.4) var-olmayan bir hesap için
  imzalanamaz/çözülemez; kaynak hesabı yoksa tx **claim başlamadan düşer**.
- **Native ödeme tarafı:** native XLM transfer hedefi var olmayan bir hesaba düşerse
  **`op_no_account`/insufficient-reserve** sınıfı hata; hedef hesap **min base reserve** taşımalıdır
  (**doğrulanmalı:** güncel base account reserve, skill "~1 XLM" der, `soroban` SKILL.md:2287).
  SAC/klasik asset için ayrıca trustline gerekir (§4.9).
- **Sonuç:** Bu **fon kaybı değildir** (INV-1/INV-7 korunur): set-before-transfer rollback'i (§4.1)
  index'i `claimed=false` bırakır; alıcı hesabını **fonlayıp** (friendbot/exchange/transfer) tekrar
  claim edebilir. Net etki **liveness/UX** sınıfıdır.
**Azaltımlar:**
1. **claim-app net uyarı:** "Hesap fonlanmamış — fee + reserve için XLM gerekli" durumu render edilir.
   Mümkünse `getAccount` 404'ünü yakalayıp claim butonunu **bloke et** + nasıl fonlanacağını anlat.
2. **Sponsored-reserve alternatifi (not):** Stellar **sponsored reserves** (CAP-0033) ile owner veya
   üçüncü taraf, alıcının base-reserve'ünü sponsorlayabilir → "fee'siz onboarding" deneyimi. Bu,
   **permissionless-execute** (§4.4) + sponsor-bundle ile birleşince claim'i tamamen sponsor edilebilir
   kılar. **Durum:** v2 fonksiyonel genişletme; v1'de yalnız UX-uyarı. (Sponsored-reserve operasyon
   detayları **doğrulanmalı**; ne `soroban`/`assets` skill'i ne repo bu konuda kesin reçete vermez.)
3. **DoS/UX kesişimi:** Saldırgan, bir kampanyaya **kasıtlı olarak unfunded adresler** koyduramaz
   (listeyi owner kurar); ama owner *kazara* unfunded alıcı koyabilir. Bu, on-chain bir zafiyet değil,
   create-app'in **"alıcıların hesapları var mı?" uyarısı** ile yumuşatılması gereken bir veri-kalitesi
   meselesidir (opsiyonel ön-kontrol; pahalı olabilir, batch `getAccount`).

### 4.15 CID-tahrifi & yanlış-instance yönlendirmesi (açıkça sahiplenilen tehdit, yeni)
**Bu, off-chain bileşenlerin on-chain invariant'ları kırmadan kullanıcıya zarar verebildiği TEK
sınıftır ve açıkça sahiplenilir.** İki vektör:

**(V1) Sahte claim-list servisi / CID-tahrifi:** Saldırgan, meşru görünen ama `airdrop`/`token`
alanları **kendi kontratına** işaret eden bir claim-list JSON üretip pinler ve kurbanı
`?a=<saldırgan_C…>&cid=<sahte>` linkiyle yönlendirir. Kurban claim/approve ederse fonunu (veya
approve'unu) **saldırganın kontratına** verir. Burada Zarf'ın on-chain kapıları kurbanı korumaz —
çünkü kurban *baştan yanlış kontrata* yetki verir.

**(V2) create-app XSS → sahte instance adresi:** create-app DOM'una enjekte edilen script,
"yayınlanan" instance adresini/claim-linkini **değiştirip** owner'a sahte bir adres gösterir; owner
bu linki dağıtırsa tüm alıcılar saldırgan kontratına yönlendirilir. Aynı şekilde, instance adresini
**URL/DOM'dan okuyan** bir create-app, enjekte edilmiş bir `a=` ile kandırılabilir.

**Azaltımlar:**
- **Üçlü çapraz-bağ (claim-app):** Link `a` (instance) ⇄ JSON `airdrop`/`token` ⇄ on-chain
  `config()` zorunlu eşitlenir; biri uyuşmazsa **claim reddedilir** ve token'ın gerçek `name/symbol/
  issuer`'ı on-chain `config().token`'dan çekilip gösterilir (sahte token'ı görünür kılar, §3.4).
  On-chain `config().merkle_root` ile JSON `root` çakışmazsa reddedilir (§4.8).
- **Origin izolasyonu (create-app):** Instance adresi **yalnızca** funding/create çağrısının dönüş
  değerinden veya `AirdropCreated` event'inden alınır — **asla** URL/DOM/localStorage'dan; tx
  simülasyon sonucu doğrulanır. **Strict CSP** + raw HTML enjeksiyonu yok (Svelte default escaping) +
  drift gate'leri (no raw `console.*`, `@zarf/core/utils/log`).
- **pin-proxy owner-imzalı pin auth + CID-bağ:** Pin, owner'ın **SEP-53 imzasını** gerektirir; imza
  `owner ‖ merkleRoot ‖ bodyHash(sha256) ‖ issuedAt`'e bağlıdır (`buildPinAuthMessage`,
  `web/apps/pin-proxy/src/index.ts:312-325`) ve gövde-hash sunucu tarafında yeniden hesaplanıp
  doğrulanır (`:288-291`, `body_hash_mismatch`). Yani **yetkisiz bir taraf owner adına root pinleyemez**
  ve pinlenen gövde imzalanan gövdeden farklı olamaz. İçerik-adresli CID, byte-determinizm garantiler
  → aynı CID = aynı bytes.
- **Kullanıcı-eğitimi katmanı (residual):** V1'in bir kısmı saf **sosyal-mühendislik**tir
  (saldırgan kendi linkini dağıtır); teknik kapı, kurbanın **meşru** Zarf claim-app'inde linki
  açtığında üçlü-bağın onu uyarması ve token kimliğinin görünür olmasıdır. Tam koruma için
  "doğrulanmış kampanya" rozet/registry (opsiyonel indexer destekli) v2'ye not.

**Önemli sınır:** Bu azaltımlar kurbanı **kendi cüzdanında imzaladığı yanlış-kontrat** işleminden
ancak claim-app onu *meşru Zarf arayüzünde* açarsa korur. Saldırganın tamamen kendi klonladığı bir
arayüzde imzalatması, herhangi bir dApp için geçerli olan kalıcı bir ekosistem-riskidir (cüzdan
tx-önizlemesi son savunmadır; `soroban` SKILL.md:1748 "Clear display of all operation details").

### 4.16 pin-proxy şema uyumsuzluğu (route/şema güncellemesi — yeni)
**Bulgu (doğrulandı):** Mevcut pin-proxy `validateClaimList`, gövdede **`merkleRoot` (hex32,
`HEX_32` regex) + boş-olmayan `leaves[]` (hex32) + `schedule` nesnesi** zorunlu kılar
(`web/apps/pin-proxy/src/index.ts:236-253`; sırasıyla `missing_or_invalid_merkleRoot`,
`missing_or_empty_leaves`, `invalid_leaf`, `missing_schedule` redleri). Bu, **vesting/ZK**
claim-list şemasıdır. Airdrop'un `root` + `claims[]` (proof'lu, **`schedule` yok**) şeması bu
validatörden **geçemez** → `missing_schedule` ile **reddedilir**.
**Etki (güvenlik):** Mevcut hâliyle airdrop create-app **pinleyemez**; "geçici çözüm" olarak airdrop
JSON'unu vesting şemasına zorlamak, auth-imzasının `merkleRoot`'a bağlanması (`:298-303`,
`validatePinAuth` çağrısı body.merkleRoot ile, `:141`) sayesinde **yanlış bir root'a imza** atmaya
yol açabilir. **Karar:** pin-proxy'ye **ayrı bir airdrop route'u (veya şema-ayrımlı validator)**
eklenmeli; airdrop auth-imzası airdrop `root`'una bağlanmalı. Güvenlik açısından kritik nokta:
**imzalanan root = pinlenen gövdedeki root = on-chain root** zinciri kopmamalı (§4.15 üçlü-bağın
off-chain ucu).

---

## 5. Off-chain & client güvenliği

`soroban` "Client-Side Checklist" (SKILL.md:1744-1753) tabanlı:

- **Network passphrase** imzadan önce doğrulanır; **simülasyon zorunlu** (`simulateTransaction →
  assembleTransaction`, #10 SKILL.md:2368-2394).
- **Operasyon detayları net gösterilir** (miktar, alıcı, instance, `approve` tutarı; SKILL.md:1748);
  yüksek-değer create için onay kapısı (SKILL.md:1747). claim-app, hedef token'ın **on-chain
  `name/symbol/issuer`'ını** gösterir (sahte token'ı görünür kılar, §3.4/§4.15).
- **Contract adresleri bilinen deployment'lara karşı doğrulanır** (SKILL.md:1752): factory adresi
  `VITE_*` env'den, instance adresi config'den **ve create'te yalnız tx-dönüşünden / event'inden**
  (URL/DOM'dan değil, §4.15), `approve` spender'ı = factory adresi (§4.10).
- **Token trust-tier** (create-app): curated (XLM/USDC) vs imported — imported için acknowledge
  checkbox (`assets` SKILL.md:441 "Validate asset issuer, not just code").
- **Unfunded-claimant durumu** claim-app'te ayrı render edilir + claim bloke (§4.14); klasik-asset'te
  trustline ön-adımı (§4.9).
- **pin-proxy** (mevcut, sertleştirilmiş): `PINATA_JWT` **secret'tır, var değil** (kullanım
  `src/index.ts:150,159`; `wrangler.jsonc:41-45` yorumu `wrangler secret put` belgeler); **SEP-53
  owner-imzalı auth** root+gövde-hash'e bağlı (`src/index.ts:298-309`), **gövde-hash sunucuda yeniden
  doğrulanır** (`:288-291`), **5 dk replay penceresi** (`:281`), **IP+owner rate-limit** (10/60s +
  5/60s, `wrangler.jsonc:16-30`), **1 MiB gövde cap'i** (`:113-130`), **CID path-traversal
  validasyonu** (`:363-376`), **`ALLOWED_ORIGINS` CORS** (`:378-396`). **Airdrop için şema/route
  güncellemesi gerekir** (§4.16). pin-proxy'nin **fon yetkisi yoktur**; ele geçirilse bile
  §4.8/§4.15 (DoS + yönlendirme, ama owner-imza kapısıyla sınırlı) çerçevesinde kalır.
- **Drift gate'leri** (CLAUDE.md): **planlanan** `@zarf/core/lib/merkle` (airdrop) saf TS olacak —
  keccak için `@noble/hashes/sha3` `keccak_256` (**bu bağımlılık repoda henüz yok**; eklenmesi
  gerekir). Mevcut ZK `lib/crypto/merkleTree.ts` ise **Pedersen via Aztec's Barretenberg**'tir
  (dosya başlığı doğrulandı) → **ayrı modül, çakışma yok**. Raw `console.*` yok
  (`@zarf/core/utils/log`, dosya `web/packages/core/lib/utils/log.ts`), `any` yok — Rust↔JS
  **paylaşılan test vektörleri** divergence'ı pinler (en büyük bug kaynağı: hash uyuşmazlığı ve
  muxed/base leaf-format ayrımı, INV-11/§4.13).

---

## 6. Opsiyonel sağlamlaştırma: yaprak adres-binding

Varsayılan **kapalı** (instance izolasyonu yeterli, §2 `UsedRoot` notu). Açılırsa yaprak preimage'ine
instance kontrat adresi eklenir:
`keccak256(0x00 ‖ index_be ‖ claimant.to_xdr ‖ amount_be ‖ contract.to_xdr)`.
Adres factory'nin deterministik salt'ından önceden türetilebilir (repo `predict_vesting_address`
deseni, `factory/src/lib.rs:124-129`), ama ağaç inşası adres-bağımlı olur (kampanya adresi ağaç
inşasından önce bilinmeli — yani salt + owner önceden sabitlenmeli). Etkisi: aynı kökü iki instance'a
kopyalama saldırı yüzeyi **kavramsal olarak** da kapanır ve §4.15-V1'in "sahte-instance + aynı liste"
varyantını da zorlaştırır (liste yalnız o adres için geçerli olur). Karar: ihtiyaç doğarsa aç; v1'de
gereksiz (INV-7 zaten fon izolasyonu sağlar). Not: bu binding'de de `claimant` **base** olarak
serileştirilir (muxed değil; INV-11).

---

## 7. Audit-readiness checklist & residual risk

### 7.1 Hazırlık (Soroban Audit Bank — STRIDE + Audit Readiness)
`soroban` SKILL.md:1789-1853 referans alınarak:

| Adım | Araç / kaynak | Hedef |
|---|---|---|
| STRIDE tehdit modeli | bu doküman (§3) | Audit Bank ön-koşulu ("STRIDE threat modeling framework + Audit Readiness Checklist") |
| Statik analiz | **Scout** (`cargo scout-audit`): `overflow-check`, `unsafe-unwrap`, `set-contract-storage`, `unrestricted-transfer-from`, `dos-unbounded-operation`, `unprotected-update-current-contract-wasm` (SKILL.md "Key detectors") | CI SARIF gate |
| Statik analiz #2 | **OZ Soroban Security Detectors**: `auth_missing`, `unchecked_ft_transfer`, improper TTL, contract panics, unsafe temp storage | tamamlayıcı tarama |
| Formal/property | **Komet** property testleri + **Certora Sunbeam** (CVLR, WASM-seviyesi) | INV-1..INV-11 ispatı |
| Fuzz | `cargo-fuzz` + `SorobanArbitrary` (SKILL.md:1151-1213): rastgele `(index, amount, proof)` → panik yok, sadece typed `Err` | claim/withdraw kritik yol |
| Differential | Rust↔JS paylaşılan Merkle vektörleri (base + muxed/base tek-root, §4.13) + `test_snapshots` commit'i (SKILL.md:1257-1293) | hash + muxed-tutarlılık determinizmi |
| Mutation | `cargo-mutants` (SKILL.md:1324-1337) | test kalitesi (CAUGHT) |
| Veridise checklist | Veridise security checklist | manuel review rehberi |
| Manuel audit | OtterSec/Veridise/Coinspect (Partner Audit Firms); SCF-funded ise Audit Bank **%5 co-pay** | Critical/High taraması |

> **`unrestricted-transfer-from` özel notu:** Fonlama `transfer_from`'a dayandığı için Scout bu
> detektörü tetikleyebilir. Repo deseni bunu **owner-auth + balance-guard + factory-spender** ile
> bilinçli kullanır (`factory/src/lib.rs:188-221`); audit notuna "kasıtlı, owner-bound allowance" diye
> gerekçelendirme eklenmeli.

### 7.2 Soroban-spesifik kod checklist (SKILL.md:1719-1741)
- [ ] `claim` → `claimant.require_auth()`; `withdraw_unclaimed` → `admin.require_auth()`; `create_airdrop` → `owner.require_auth()` (repo: `vesting:313`, `vesting:430-434`, `factory:145,188`)
- [ ] `__constructor` atomik init; ayrı `initialize` yok ⇒ reinit imkânsız (`factory:92-104`, `vesting:131-158`)
- [ ] Fonlama `transfer_from` + balance-guard; owner→factory allowance ön-adımı create-app'te (§4.3)
- [ ] Token çağrısı: owner-riski + alıcı-tarafı doğrulama (allowlist ürün gereği uygulanmaz, bilinçli)
- [ ] Tüm aritmetik `checked_*`; `overflow-checks = true`
- [ ] Typed `DataKey` enum; key collision yok (`vesting:68-81`, `factory:46-67`)
- [ ] Kritik veri TTL'i proaktif uzatılır (`TTL_THRESHOLD`/`TTL_EXTEND_TO`)
- [ ] Tüm public girdi valide; bounded range-read (`MAX_PAGE_LIMIT`=80; vesting `MAX_CLAIMED_BATCH`=64 ayrılığı gerekçelendirildi, §3.5)
- [ ] Denetlenebilir state için event (`Claimed`/`Withdrawn`/`AirdropCreated`)
- [ ] Transfer-fail **açık** rollback: `set_claimed=false` proof/transfer fail'inde (§4.1, `vesting:368-373,393-396`)
- [ ] **Çift-yönlü per-claim balance guard** (kontrat−/alıcı+) → `TokenTransferMismatch` (§4.1, `vesting:378-397`)
- [ ] **Leaf-format kanonik base** (`to_xdr` base; muxed indirgenir/reddedilir) → INV-11 (§4.13)
- [ ] Instance **immutable** (upgrade entrypoint yok); deploy `deploy_v2` + ayrı yüklenen `wasm_hash` (`factory:316-332`)
- [ ] **claim-app üçlü-bağ** (link `a` ⇄ JSON ⇄ on-chain config) + token kimlik gösterimi (§4.15)
- [ ] **create-app origin izolasyonu**: instance adresi yalnız tx-dönüşünden, URL/DOM'dan değil (§4.15)
- [ ] **pin-proxy airdrop şema/route** + airdrop-root'a bağlı owner-imzası (§4.16)
- [ ] **Unfunded-claimant** durumu claim-app'te bloke + uyarı (§4.14)

### 7.3 Residual risk (kabul edilen / izlenen)
| Risk | Durum | Not |
|---|---|---|
| Owner kötü-niyetli token seçer | **kabul** | Risk owner'a ait; alıcı create/claim uyarılarıyla korunur |
| Klasik-asset clawback (v1.1) | **kabul + uyarı** | Issuer-kaynaklı; airdrop kontratı önleyemez (`soroban` SKILL.md:1692-1704) |
| IPFS erişilemezliği | **izlenir** | Liveness/DoS; fon güvende. Çoklu pin + client-side proof yeniden-üretimi azaltır |
| **CID-tahrifi / sahte-instance yönlendirmesi** | **kabul + teknik+UX azaltım** | claim-app üçlü-bağ + create-app origin izolasyonu + pin owner-imzası (§4.15); saf sosyal-mühendislik artık-risktir, cüzdan tx-önizlemesi son savunma |
| **create-app XSS** | **izlenir** | Strict CSP + Svelte escaping + instance adresinin tx-dönüşünden alınması (§4.15); pentest kapsamına alınmalı |
| **Unfunded-claimant claim hatası** | **izlenir (UX)** | Fon kaybı yok; claim-app bloke+uyarı, sponsored-reserve v2 (§4.14) |
| Dormant kampanya archival | **runbook** | Harici `ExtendFootprintTTLOp` gerekebilir (liveness-only) |
| Allowance `expiration_ledger` hatası | **izlenir** | Çok kısa exp → fonlama tx'i süre dışı; create-app exp'i tx-pencereye uygun set etmeli (§4.10) |
| **pin-proxy airdrop şema uyumsuzluğu** | **aksiyon gerek** | `validateClaimList` airdrop JSON'unu reddeder (`:236-253`); ayrı route/şema şart (§4.16) |
| `MAX_PAGE_LIMIT` / footprint cap'i | **doğrulanmalı** | Repo 80 seçti; "~100 entry/tx" ağ sınırı kesin değerle teyit edilmeli (`factory/src/lib.rs:23-26`) |
| Per-trustline & base-account reserve | **doğrulanmalı** | Güncel base/per-trustline reserve değeri mainnet/testnet için teyit edilmeli (skill kesin rakam vermez; "~1 XLM" SKILL.md:2287) |
| TTL ~180g ağ üst sınırı | **doğrulanmalı** | `TTL_EXTEND_TO=120g`'in altında kaldığı varsayımı; repo yorumu (`factory:15-16`) "~180-day" der, kesin ağ tavanı teyit edilmeli |
| Per-claim fee (~0.01-0.03 XLM) | **doğrulanmalı** | Yayınlanan profilleme iddiası; repo/skill'de kesin değer yok, base fee 100 stroop/op'tan türetilmeli ve mainnet-ölçümü ile teyit edilmeli |
| Muxed/base leaf-format ayrımı | **test-pinlenir** | INV-11 vektörü (§4.13) Rust↔JS aynı root + base-payout doğrulamalı |
| Permissionless-execute + sponsored-reserve | **ertelendi (v2)** | Güvenlik zafiyeti değil; fee'siz onboarding köprüsü (§4.4/§4.14) |

### 7.4 Bug bounty / izleme (post-deploy)
- **OZ Monitor** (Stellar alpha, `soroban` SKILL.md "Security Monitoring"): instance event'lerini
  Prometheus/Grafana ile izle (anormal claim hacmi, beklenmedik withdraw, **sahte-instance imzalama
  girişimleri** için sapma alarmı).
- SDF kapsamı: **Immunefi — Stellar Core** stellar-core/SDK/RPC içindir (SKILL.md:1772-1779);
  **bu uygulama kapsam dışı** — kendi sorumluluğumuzda audit + monitoring. create/claim app'leri
  **HackerOne — Web Applications** kapsamına (90-gün remediation, SKILL.md) benzer bir pentest
  disiplini (XSS/CSP, §4.15) ile ele alınmalı. (Not: **Immunefi — OpenZeppelin on Stellar** yalnız OZ
  kütüphanesi içindir, bizim kodumuz değil.)

---

## 8. Özet

Tehdit modelinin omurgası tek bir yapısal gerçeğe dayanır: **fon yalnız instance bakiyesinde durur ve
dışarı iki kapıdan çıkar** — `claim` (proof + bitmap, INV-2/3/4) ve `withdraw_unclaimed` (admin +
locked, INV-5). Off-chain bileşenler (create/claim/pin-proxy/indexer) kasa anahtarı taşımaz; en kötü
hâlleri **griefing/DoS** ya da **yanlış-instance yönlendirmesidir** (§4.15) — bunların hiçbiri
fonlanan miktar üzerindeki on-chain invariant'ları kırmaz, ancak CID-tahrifi/XSS sınıfı **kullanıcıyı
yanlış kontrata imzalatabilir** ve bu yüzden claim-app üçlü-bağı + create-app origin izolasyonu +
pin owner-imzası ile **açıkça sahiplenilip** azaltılır. Soroban'ın yapısal avantajları (delegatecall
yok, klasik reentrancy yok, opt-in auth) tüm bir saldırı sınıfını baştan kapatır; geri kalanı repo'nun
kanıtlanmış desenleriyle zorlanır: **allowance-pull + balance-guard'lı atomik fonlama** (`transfer_from`,
`factory/src/lib.rs:208-221`), **owner-bound salt + ayrı-yüklenen `wasm_hash` deploy_v2**
(`:316-332,460-464`), **set-before-transfer + açık rollback + çift-yönlü per-claim guard**
(`vesting:364-397`), **muxed-payout'a rağmen base-leaf tutarlılığı** (INV-11, `vesting:380-381`),
**typed error/event**, **`checked_*` aritmetik**, **TTL sabitleri** (`factory:13-27`). ZK ve
`UsedRoot`'un kasıtlı yokluğu — instance izolasyonu sayesinde — bir zafiyet değil, doğru
sadeleştirmedir. Kalan risklerin tümü ya **owner-riski** (kötü token seçimi, allowance hijyeni,
unfunded liste), ya **issuer-riski** (clawback/AUTH_REQUIRED, v1.1'de uyarı/reddetme ile yönetilir),
ya **liveness** (IPFS/archival/unfunded-claimant), ya da **client-bütünlüğü** (CID/XSS, teknik+UX
azaltım + cüzdan tx-önizlemesi son savunma) sınıfındadır. Sayısal ağ sabitleri (footprint cap, base/
trustline reserve, TTL tavanı, sponsored-reserve, per-claim fee) bilinçli olarak **"doğrulanmalı"**
bırakılmıştır.

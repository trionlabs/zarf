# Zarf Airdrop Aracı — Ekonomi & Maliyet Modeli (Stellar-native)

> Hedef: Standart (ZK olmayan) **cüzdan-adresi + Merkle-claim** airdrop aracının
> Stellar-yerli **maliyet ve ekonomi** modeli. Soroban'ın çok-boyutlu kaynak modeli
> (CPU komutu / ledger okuma-yazma / byte / event / **rent**) üzerine oturur
> (`soroban/SKILL.md:1341`). Temel ilke **pull/Merkle**: gönderen **bir kez** fonlar + kök
> yayınlar, **her alıcı kendi claim tx fee'sini öder** (kilitli karar). Bu, push/disperse'e
> göre gönderen maliyetini O(N)'den ~O(1)'e indirir — aracın ana ekonomik satış argümanı.
> DURUM: tasarım. **Taban ağ sabitleri** (base fee, base reserve) doğrulandı; **per-işlem Soroban
> resource fee** rakamları (claim/create) hâlâ testnet `--sim` ile pinlenmeli (aşağıda "⚠ sim ile
> doğrula" ile işaretli). İki yeni crate, `withdraw` kapısı ve token kapsamı **henüz implemente
> değil** (plan aşaması).

---

## 1. Maliyet birimleri ve sabitler (neye dayanıyoruz)

Stellar/Soroban fee ve rent modeli **stroops** cinsinden hesaplanır (1 XLM = 10,000,000 stroops).
Soroban tx fee'si iki ana parçaya ayrılır; **resource fee** ayrıca iade-edilebilir / iade-edilemez
alt-bileşenlere bölünür:

| Bileşen | Ne kapsar | İade? | Kaynak / dayanak |
|---|---|---|---|
| **Inclusion fee** | Tx'in ledger'a girmesi; op başına `BASE_FEE` taban + tıkanıklık | hayır | `dapp/SKILL.md:249` (`fee: StellarSdk.BASE_FEE`); taban = **100 stroops/op = 0.00001 XLM** (ağ varsayılanı, doğrulandı) |
| **Resource — non-refundable** | CPU komutu + okunan/yazılan byte + tx boyutu (imzalar dahil) | hayır | `soroban/SKILL.md:1341`; CAP-0046-07 fee modeli |
| **Resource — refundable** | rent (TTL) + event byte + dönüş değeri byte | evet (kullanılmayan kısım iade) | aynı; "refunds only for Events & Return Value Size and Ledger Space Rent" |

> **Önemli sim yorumu:** Bir `claim`'in CPU + okuma/yazma byte + tx-size kısmı **iade edilmez**;
> rent + event kısmı önce tutulur, kullanılmayanı **iade edilir**. `--sim` çıktısı bu yüzden
> bir "tavan" verir; gerçek tahsilat genelde biraz altında. Per-claim bütçe tavandan planlanmalı.

Repodan **doğrulanan** sabitler (bu araç da bunları miras alır):

| Sabit | Değer | Konum |
|---|---|---|
| `DAY_IN_LEDGERS` | `17_280` ledger/gün (⇒ **~5 sn/ledger**) | `factory/src/lib.rs:14`, `vesting/src/lib.rs:25` |
| `TTL_EXTEND_TO` | `120 * DAY_IN_LEDGERS` = 2,073,600 ledger (**~120 gün**, ~180-gün ağ tavanının güvenle altında) | `factory/src/lib.rs:19`, `vesting/src/lib.rs:30` |
| `TTL_THRESHOLD` | `TTL_EXTEND_TO - DAY_IN_LEDGERS` (~119 gün) | `factory/src/lib.rs:22`, `vesting/src/lib.rs:33` |
| `MAX_PAGE_LIMIT` | `80` (range-read tavanı; **byte değil ledger ENTRY** cinsinden, ~100 footprint-entry/tx ağ sınırından türetilmiş) | `factory/src/lib.rs:23-27` |
| Hashing (factory) | `BnScalar::from_bytes(keccak256(addr.to_xdr)).to_bytes()` | `factory/src/lib.rs:118-122` (`recipient_id`) |
| soroban-sdk | **`26.0.0-rc.1`** (`default-features = false`, `["alloc"]`) | `factory`/`vesting`/`jwk-registry` `Cargo.toml` |

> **5 sn/ledger** çıkarımı: `soroban/SKILL.md:269` "~1 day at 5s ledgers" yorumu `17_280 = 86400/5`
> ile birebir tutarlı. Tüm gün↔ledger dönüşümleri buna dayanır.

> **Hashing inceliği (taslaktaki yanlış mirasın düzeltilmesi):** Factory `recipient_id`
> **düz keccak değildir** — `keccak256(addr.to_xdr)` çıktısını `BnScalar` ile **BN254 skaler alanına
> indirger** (`factory/src/lib.rs:121`), çünkü o digest **ZK devresine** girer. Airdrop aracı **bu
> indirgemeyi MİRAS ALMAZ**: airdrop yaprağı düz `keccak256(0x00 ‖ index_be ‖ claimant.to_xdr ‖
> amount_be)`'tir (plan §4.3, ZK yok). Yani "aynı host fonksiyonu (keccak256)" doğru, ama "aynı
> `recipient_id` şeması" yanlış olur — bilinçli ayrışma. Maliyet açısından fark ihmal edilebilir
> (bir keccak + bir alan indirgemesi vs. bir keccak), ama spesifikasyon olarak ayrı.

### Doğrulanan taban ağ sabitleri (artık "⚠" değil)

| Ağ sabiti | Değer | Not |
|---|---|---|
| **Base fee (inclusion)** | **100 stroops/op = 0.00001 XLM** | Tıkanıklıkta surge ile artar; taban bu |
| **Base reserve** | **0.5 XLM / subentry** | Trustline, offer, signer, data entry her biri +0.5 XLM |
| **Hesap mutlak min bakiye** | **1 XLM** = `(2 + 0) × 0.5` | Subentry başına +0.5 XLM |

> Bu üç değer **güncel ağ varsayılanı** olarak doğrulandı (Stellar fee/reserve dokümantasyonu) —
> taslaktaki "⚠ doğrulanmalı" işaretleri kaldırıldı. **Per-işlem Soroban resource fee** (claim/create
> mutlak stroop'ları) ise hâlâ `--sim` ile pinlenmeli; aşağıdaki tablolarda işaretli.

---

## 2. Birim maliyetler (işlem başına)

İki yeni crate (`zarf/airdrop` instance + `zarf/airdrop-factory`, plan §4) ve dört on-chain eylem var.
Mertebe tahminleri, **yayınlanan Soroban profillemesine** dayandırılmıştır (token transfer/swap/deposit
gibi durum-değiştiren gerçek tx'lerde **ortalama resource fee ~215,000–261,000 stroops ≈ 0.021–0.026
XLM**; en yüksek ~0.0092 USD). Claim, bunlardan daha hafif (tek transfer + bir word yazımı) ama
**Merkle proof CPU'su** ekler.

| Eylem | Kim öder | Sıklık | Maliyet kalemleri | Mertebe tahmini (⚠ sim ile doğrula) |
|---|---|---|---|---|
| **Factory deploy** (wasm **upload** + factory instantiate) | Operatör (tek sefer) | 1× (ömür boyu) | **instance wasm byte upload** (≤64 KB, asıl ağır kalem) + factory instance rent | bir kerelik; ~on(lar) XLM mertebesi olabilir, wasm boyutuna bağlı |
| **`create_airdrop`** (instance deploy + atomik fonlama) | Gönderen | kampanya başına 1× | `deploy_v2` (wasm **tekrar yüklenmez** — embed'li hash) + instance entry oluşturma + `Config` yazımı + `token.transfer(owner→instance)` + `AirdropCreated` event + TTL extend | **~0.03–0.1 XLM resource ⚠** + fonlanan miktar (§5) |
| **`claim`** | **Alıcı** | alıcı başına 1× | proof doğrulama CPU (keccak, `⌈log2 N⌉` düğüm) + `ClaimedWord` 1 word oku/yaz + `Config` oku + `token.transfer` + `Claimed` event + TTL extend | **~0.01–0.03 XLM ⚠** (profillemeyle uyumlu; claim app "~0.001 XLM" metni **iyimser**, aşağı §10) |
| **`withdraw_unclaimed`** | Gönderen/admin | ≤1× (kurallara göre) | bakiye oku + `token.transfer(instance→to)` + `Withdrawn` event + auth | ~claim mertebesi (~0.01–0.03 XLM) ⚠ |

> **Önemli düzeltme — `create_airdrop` wasm yüklemez:** Tek-seferlik **ağır** maliyet, instance
> WASM'ının zincire **upload** edilmesidir (factory deploy aşamasında, ~64 KB sözleşme tavanı).
> `create_airdrop` ise factory'nin embed ettiği `wasm_hash` ile `deploy_v2` yapar → **wasm byte'ı
> tekrar yüklenmez**, sadece yeni instance entry + `Config` + fonlama transferi maliyeti kalır.
> Taslaktaki "wasm byte upload (resource)" her create'e atfedilmesi bu yüzden yanlış olurdu; ayrıştırıldı.

**Önemli ekonomik gözlem:** `claim` maliyeti **N'den ~bağımsız sabittir** — proof uzunluğu
`⌈log2 N⌉` düğümle büyür (100K alıcıda bile ~17 keccak). Alıcı-başı fee ölçekle **artmaz**. Tek
nüans: bir `ClaimedWord`'ün **ilk** claim'i o word entry'sini **yazar** (pahalı yol), aynı word'e
düşen sonraki claim'ler yalnız bir bit set eder — sim profili bu iki yolu ayırmalı (§9). Tüm O(N)
yük, alıcılara dağıtılmış claim fee'leri olarak parçalanır; gönderen yalnızca sabit `create_airdrop`
+ fonlamayı taşır.

> **`recipient_count` on-chain doğrulanmaz:** factory'de `recipient_count` yalnızca event/metadata'dır
> (plan §4.1; mevcut `VestingCreated.recipient_count` ile aynı desen) — kontrat onu doğrulamaz, dolayısıyla
> per-create maliyete katkısı yoktur ve `index < recipient_count` sınırı **kontratta zorlanmaz** (yalnız
> off-chain create app + bitmap aralığı). Bu, maliyet açısından create'i N'den bağımsız tutar.

---

## 3. Rent / TTL maliyeti (kampanya ömrü boyunca toplam)

Instance kontratının persistent state'i archival'a karşı canlı tutulmalı (`soroban/SKILL.md:1618`).
İki tür entry:

1. **`Config` (instance storage)** — 1 entry (admin, token, root, total, deadline, locked).
2. **`ClaimedWord(word)` (persistent bitmap)** — claim'ler oldukça **tembel (lazy)** oluşur; her
   `W`-bitlik word ilk claim'inde yazılır. Plan §4.6: `word = index / W`, `bit = index % W`.

**Bitmap entry sayısı = `⌈N / W⌉`** (W = word genişliği; u64→64, u128→128 bit/word):

| N (alıcı) | `ClaimedWord` (W=64) | `ClaimedWord` (W=128) | Yorum |
|---|---|---|---|
| 1,000 | 16 | 8 | adres-başına entry'den çok ucuz |
| 10,000 | 157 | 79 | plan satır 251: "10k ≈ 80–160 entry" |
| 100,000 | 1,563 | 782 | W=128 ile <800 entry |

> Kritik incelik: bitmap entry'leri **claim olunca** yazılır, dağıtım anında değil. Hiç claim
> edilmeyen kampanyada yalnızca `Config` rent öder. **Toplam rent ≈ (claim oranı) × `⌈N/W⌉` word ×
> word-rent + Config-rent**, kampanya ömrü / `TTL_EXTEND_TO` (120 gün) periyodu başına.

**Rent maliyeti modeli (kampanya ömrü `L` gün için):**

```
TTL extend sayısı ≈ ⌈ L / 120 ⌉            (her TTL_EXTEND_TO = ~120 gün)
toplam_rent ≈ extend_sayısı × ( config_word_rent + yazılı_ClaimedWord_sayısı × word_rent )
```

Her `claim`/`withdraw` zaten `TTL_THRESHOLD` altına inince TTL'i `TTL_EXTEND_TO`'ya **otomatik
uzattığı** için (plan §4.6; `factory/src/lib.rs:353-369` deseni — `persistent().extend_ttl(key,
TTL_THRESHOLD, TTL_EXTEND_TO)` + `extend_contract_ttl`), **aktif** kampanyalarda ekstra rent tx
gerekmez — uzatma claim fee'sine gömülüdür (alıcı öder, rent kısmı **refundable** bileşende). Ekstra
rent tx yalnızca **uzun süre uykuda** (claim gelmeyen) kampanyalarda, harici `ExtendFootprintTTLOp`
ile gerekir (plan satır 255) — bunu **operatör** ödeyebilir (runbook'a not).

| Senaryo | TTL'i kim taşır | Rent maliyeti |
|---|---|---|
| Aktif kampanya (düzenli claim) | Alıcılar (claim fee'sine gömülü, refundable kısım) | Gönderen için **ek 0** |
| Uykuda kampanya, < 120 gün | Kimse (TTL henüz dolmaz) | 0 |
| Uykuda kampanya, > 120 gün | Operatör/gönderen (`ExtendFootprintTTLOp`) | extend başına ~küçük XLM ⚠ |

> **Optimizasyon kaldıracı:** `TTL_EXTEND_TO = 120 gün` (repo default). Kısa kampanyalarda
> (deadline < 120 gün) **tek extend yeterli**; uzun/süresiz (`deadline=0`, trustless kilit)
> kampanyalarda 120 günde bir extend birikir. Süresiz + locked kampanyalar için runbook'ta
> "yıllık ~3× extend" bütçesi planlanmalı ⚠.

---

## 4. IPFS pinleme maliyeti (claim-list host)

Claim-list JSON pin-proxy üzerinden **Pinata**'ya pinlenir (`web/apps/pin-proxy/src/index.ts:55`
`PINATA_PIN_URL = …/pinJSONToIPFS`, `:156` fetch; plan §7). Bu **off-chain** maliyettir, **operatör**
taşır.

> **YENİ TESPİT EDİLEN BLOKER — pin-proxy şema doğrulayıcısı airdrop JSON'ını REDDEDER.** Mevcut
> `validateClaimList` (`index.ts:236-253`) gövdede **`merkleRoot` (string), boş-olmayan `leaves[]`
> ve `schedule` nesnesi** ZORUNLU kılıyor. Airdrop'un JSON şeması (plan §7) `root` + `claims[]`
> kullanıyor, **`schedule` yok** → mevcut validator airdrop claim-list'ini `400 invalid_claim_list`
> (`reason: "missing_schedule"` / `"missing_or_empty_leaves"`) ile **reddeder**. Yani pin-proxy
> yeniden kullanımı "olduğu gibi" çalışmaz; **`validateClaimList` airdrop şemasını da kabul edecek
> şekilde genişletilmeli** (ya da airdrop için ayrı bir route/şema). Boyut limitiyle birlikte ikinci
> somut pin-proxy işi — §10'da çelişki olarak raporlanır.

**JSON boyutu (claim başına ~proof + adres + amount):** her entry ≈ `address` (56 char G…) +
`amount` (string) + `proof` (`⌈log2 N⌉` × 64-hex). Kaba tahmin:

| N | proof düğümü (`⌈log2 N⌉`) | ~entry boyutu | ~toplam JSON | pin-proxy limiti |
|---|---|---|---|---|
| 1,000 | 10 | ~0.8 KB | **~0.8 MB** | default `MAX_BODY_BYTES` = **1 MiB** (`index.ts:113`) ✔ |
| 10,000 | 14 | ~1.1 KB | **~11 MB** | **1 MiB limiti AŞILIR** → limit yükseltilmeli ⚠ |
| 100,000 | 17 | ~1.4 KB | **~140 MB** | gateway cap 8 MiB (`MAX_GATEWAY_RESPONSE_BYTES`, `index.ts:65`) AŞILIR → **parçalama/farklı host** gerekir |

> **Gerçek kısıt:** mevcut pin-proxy default'u **1 MiB body** (`const maxBytes = … || 1_048_576`,
> `index.ts:113`) ve okuma gateway'i **8 MiB** cap'li (`MAX_GATEWAY_RESPONSE_BYTES`, `index.ts:65`).
> **10K+ alıcıda claim-list JSON bu limitleri aşar.** Çözümler (öncelik sırasıyla):
> 1. **Proof'ları JSON'dan çıkar**, client-side yeniden hesapla: JSON yalnızca `[(address, amount)]`
>    tutar, claim app ağacı tarayıcıda kurar → entry boyutu ~70 byte'a düşer (10K ≈ **0.7 MB**,
>    100K ≈ **7 MB**, hâlâ gateway cap'e yakın).
> 2. **Sayfalama / shard**: JSON'u N parçaya böl, manifest CID + shard CID'leri.
> 3. **`MAX_BODY_BYTES`'ı kampanya boyutuna göre yükselt** (Pinata plan limiti dahilinde).
>
> **Öneri:** v1'de claim-list **proof'suz** yayımlansın (yukarıdaki #1); proof anlık client'ta
> üretilir (plan §6 `buildTree`/`verifyProof` — **bu fonksiyonlar repo'da henüz yok**, yeni
> `@zarf/core/lib/merkle` modülünde planlanıyor; mevcut `@zarf/core/lib/crypto/merkleTree.ts`
> **Pedersen/Barretenberg** kullanıyor, keccak DEĞİL — airdrop için ayrı bir modül gerekecek). Bu,
> 100K'yı 7 MB'a indirir ve "proof public → zararsız" gözlemiyle (plan satır 317) çelişmez.
> **Bu, planın §7 JSON şemasında `proof` alanını opsiyonel yapan bir netleştirme + pin-proxy
> `validateClaimList` güncellemesi gerektirir — çelişki olarak işaretliyorum.**

**Pinata para maliyeti:** Pinata `PinSize` döner (`index.ts:178-179` → `{ cid, size }`); ücretlendirme
plan-bazlı (GB-depolama + istek), skill'lerde sayısal yok ⚠. Mertebe: birkaç MB pin = ücretsiz/cüzi
katmanda.

---

## 5. Reserve maliyetleri ve kilitlenen fon

Üç ayrı "kilitli XLM" kavramı var; karıştırılmamalı:

| Reserve türü | Tutar | Kim öder | Notlar / dayanak |
|---|---|---|---|
| **Airdrop fonu (lock)** | `Σ amount` (token) | Gönderen | `create_airdrop`'ta instance'a atomik transfer; `TokenTransferMismatch` guard (plan §4.5). Token ≠ XLM ise XLM değil, **o token** kilitlenir |
| **Alıcı trustline reserve** | **0.5 XLM / trustline** (base reserve, doğrulandı) | **Alıcı** | Yalnız **klasik asset** (USDC vb.); native XLM ve custom SEP-41'de **yok** (plan §5 tablosu, `assets/SKILL.md:226-239` changeTrust) |
| **Alıcı hesap min reserve** | **1 XLM** taban (hesap var olmalı) | Alıcı | "Alıcı öder" zaten fonlanmış XLM hesabı gerektirir (plan satır 288-289); claim app uyarır |

**Token-tipine göre alıcı sürtünmesi (plan §5):**

- **Native XLM** (native SAC): trustline **yok**, ekstra reserve **yok**. En ucuz alıcı yolu.
- **Custom SEP-41**: trustline mekanizması devrede değil, bakiye kontrat depolamasında. Ekstra
  reserve **yok**.
- **Klasik asset (USDC, SAC)**: alıcı `G…` için trustline **zorunlu** + **0.5 XLM reserve**
  (`assets/SKILL.md:224-239` changeTrust). `C…` smart-wallet alıcıda gerek yok (SAC bakiyeyi kontrat
  depolamasında tutar). **`AUTH_REQUIRED` issuer flag'i = permissionless airdrop'u kırar**
  (plan §5, `assets/SKILL.md:174-180`) → create app reddetmeli; **`AUTH_CLAWBACK_ENABLED` = dağıtılan
  token issuer'ca geri alınabilir** → uyar.

> v1 = XLM + SEP-41 seçimi (kilitli karar) bilinçli olarak **trustline reserve'ünü 0'a indirir** →
> alıcı yalnız claim fee (~0.01–0.03 XLM ⚠) öder. v1.1 (klasik/USDC) alıcıya **+0.5 XLM trustline
> reserve** ekler.

### 5.1 KİM NE ÖDER (özet matris)

| Maliyet kalemi | Gönderen | Alıcı | Operatör |
|---|---|---|---|
| Factory deploy + wasm upload (tek sefer) | — | — | ✅ |
| `create_airdrop` resource fee (~0.03–0.1 XLM ⚠) | ✅ | — | — |
| Airdrop fonu (`Σ amount`) | ✅ | — | — |
| IPFS pinleme (Pinata) | — | — | ✅ (pin-proxy ana hesabı) |
| `claim` tx fee (~0.01–0.03 XLM ⚠) | — | ✅ | — |
| Trustline reserve (0.5 XLM, yalnız klasik) | — | ✅ | — |
| `withdraw_unclaimed` fee (~0.01–0.03 XLM ⚠) | ✅ | — | — |
| Uyuyan kampanya TTL extend | ✅ veya — | — | ✅ (opsiyonel) |
| Indexer/dashboard altyapısı | — | — | ✅ |

---

## 6. Ölçek ekonomisi: 1K / 10K / 100K alıcı

Varsayımlar: v1 token (XLM/SEP-41, trustline reserve = 0), claim fee ≈ **0.02 XLM** orta tahmin
(⚠ sim ile pinle; profillemeyle uyumlu, taslaktaki 0.002'den **bir mertebe yukarı düzeltildi**),
`create_airdrop` resource ≈ **0.05 XLM** ⚠, W=128 bitmap, claim oranı %100.

| Metrik | 1,000 | 10,000 | 100,000 |
|---|---|---|---|
| **Gönderen on-chain maliyet** (fon hariç) | ~0.05 XLM | ~0.05 XLM | ~0.05 XLM |
| **Gönderen IPFS** (proof'suz JSON) | <1 MB | ~0.7 MB | ~7 MB |
| **`ClaimedWord` entry** (W=128) | 8 | 79 | 782 |
| **Tüm claim fee'leri toplamı** (alıcılar öder) | ~20 XLM | ~200 XLM | ~2,000 XLM |
| **Alıcı-başı maliyet** | ~0.02 XLM | ~0.02 XLM | ~0.02 XLM |
| **Gönderen-başı (toplam / N)** | ~0.00005 XLM | ~0.000005 XLM | ~0.0000005 XLM |

**Sonuç:** Gönderen on-chain maliyeti **N'den bağımsız** (~0.05 XLM + fon). Toplam ağ maliyeti
(~0.02·N) **alıcılara dağıtılır**; her alıcı yalnız kendi fee'sini öder. IPFS dışında gönderenin
marjinal alıcı maliyeti ~sıfır. (Mutlak claim fee'si sim ile ±2-3× oynayabilir; oran-sonuçları
değişmez.)

### 6.1 `MAX_PAGE_LIMIT` ile etkileşim

`claimed_statuses(start, limit)` range-read'i `MAX_PAGE_LIMIT = 80` ile sınırlı
(`factory/src/lib.rs:23-27`, plan §4.6). Bu **claim/durum sorgusunu etkilemez** (claim tek index
okur), yalnızca dashboard'ın "kimler aldı" görünümünü sayfalar:

- 100K alıcı / 80 = **1,250 sayfa** range-read → indexer event'leri (`Claimed`) tercih edilmeli
  (`data/SKILL.md:153-172` `getEvents`), bitmap range-read yalnız spot-kontrol için.
- `MAX_PAGE_LIMIT` **byte değil ledger ENTRY** cinsinden (footprint ~100 entry/tx ağ sınırı, kod
  yorumu `factory/src/lib.rs:23-26`). Public API `bool` listesi döndüğü için 80 bool/çağrı; bitmap
  **word** okuması (1 word = 128 bit) iç optimizasyon olarak çok daha verimli olsa da dış API bunu
  bool'a açar.

> **Not (RPC 7-gün penceresi):** `getEvents` ile ilerleme izleme RPC'de **~7 günlük** geçmişle
> sınırlı (`data/SKILL.md:174-179`). Uzun kampanyalarda dashboard, event'leri **kendi indexer'ında**
> biriktirmeli (plan §9) — RPC `getEvents`'i yalnız taze tarama için kullan; tarihsel için bitmap
> spot-okuma veya Hubble/Galexie.

### 6.2 push/disperse vs pull/Merkle — maliyet karşılaştırması

| Boyut | **Push / disperse** (gönderen tüm fee) | **Pull / Merkle** (alıcı kendi fee, **seçilen**) |
|---|---|---|
| Gönderen tx sayısı | **O(N)** (batch'lenmiş bile N transfer) | **O(1)** (1 create_airdrop) |
| Gönderen fee | ~`N × transfer_fee` (100K ≈ 2,000+ XLM, ~0.02 XLM/transfer ⚠) | ~0.05 XLM + fon |
| Alıcı fee | 0 (gönderen ödedi) | ~0.02 XLM/alıcı ⚠ |
| On-chain yazım | N balance entry yazımı (anında) | tembel `⌈N/W⌉` word (claim oldukça) |
| Hak kazanmayan alıcılar | **fon yine de gönderilir** (israf) | yalnız claim edenler tüketir → **kullanılmayan fon geri çekilir** (§4.4 withdraw) |
| Liste boyutu | gönderen tutmaz | IPFS'te public liste |

> Pull modelin ekonomik üstünlüğü ikiyönlü: (1) gönderen maliyeti O(N)→O(1); (2) **claim edilmeyen
> bakiye geri çekilebilir** (`withdraw_unclaimed`, plan §4.4) → push'taki "ölü adrese gönderilen
> fon" israfı yok. Bedeli: alıcı kendi fee+reserve'ünü taşır (kilitli karar; "kripto-yerlisi hız"
> hedefiyle uyumlu, plan §1).

---

## 7. İş modeli / fiyatlandırma seçenekleri (opsiyonel)

Araç bir protokol-fee'si **gerektirmez**; v1 ücretsiz olabilir. İstenirse `create_airdrop`'a
opsiyonel fee enjekte edilir (kontrat değişikliği gerektirir, v1.x):

| Model | Mekanik | Artı / Eksi |
|---|---|---|
| **Yüzde fee** | `create_airdrop`'ta `fee_bps × total` → `fee_receiver`'a transfer | Ölçekle gelir; büyük kampanyada caydırıcı; token-cinsinden tahsilat (her token ayrı) |
| **Sabit fee (XLM)** | create başına sabit XLM → `fee_receiver` | Basit, öngörülebilir; küçük kampanyada orantısız |
| **Hibrit** | sabit taban + küçük bps, cap'li | Adil ama karmaşık |
| **Fee yok (v1)** | yalnız ağ fee'si | En sürtünmesiz; gelir yok |

Uygulama notu: fee, factory `create_airdrop` içinde **fonlamadan önce** kesilirse `Σ amount` ile
fonlanan miktar tutarsızlaşır → `TokenTransferMismatch` guard'ı (plan §4.5; `factory/src/lib.rs:206-221`
desenindeki balance-before/after) ile çakışmamak için fee **ayrı bir
`token.transfer(owner → fee_receiver)`** olarak modellenmeli; `total` yalnız instance'a giden kısmı
ifade etmeli. `fee_receiver` + `fee_bps` factory `__constructor`'ında saklanır (instance/admin
değişmez kalır).

> v1 default önerisi: **fee yok**. Fiyatlandırma ileri faza ertelenir; eklenirse yukarıdaki "ayrı
> transfer" deseni guard'ı bozmadan uygular.

---

## 8. Optimizasyon kaldıraçları

| Kaldıraç | Etki | Karar |
|---|---|---|
| **Bitmap word genişliği** (u64 vs u128) | Entry sayısını **2×** azaltır (100K: 1,563→782) → rent ↓ | **u128 öner** (W=128); tek word'de daha çok bit, claim başına aynı 1 yazım |
| **TTL stratejisi** | Kısa kampanya = 1 extend; süresiz = periyodik | deadline'a göre extend; `TTL_EXTEND_TO=120g` repo default'u kullan, süresiz için runbook bütçesi |
| **Claim-list proof'suz** | JSON'u **~15×** küçültür (100K: 140MB→7MB) | v1'de **proof client-side** (§4 öneri) — pin-proxy 1MiB/8MiB limitlerini karşılar; **ANCAK `validateClaimList` airdrop şemasını kabul edecek şekilde güncellenmeli** (§4 bloker) |
| **Batch / permissionless-execute** | Sponsor tek tx'te çok claim tetikler → alıcı fee'siz onboarding | v2 (plan §10); ekonomik olarak "operatör claim fee'sini üstlenir"; OZ Relayer/Channels fee-bump opsiyonu (`dapp/SKILL.md:643-664`) |
| **Indexer-first dashboard** | `getEvents` (`data/SKILL.md:153`) ile ilerleme; bitmap range-read'den kaçın | `MAX_PAGE_LIMIT=80` + RPC 7-gün sınırını dolanır |
| **Native XLM tercih (v1)** | Alıcı trustline reserve'ünü **0.5 XLM → 0** | v1 token kapsamı kararı zaten bunu sağlar |

---

## 9. Rakamların doğrulanması (yöntem)

Mutlak Soroban **resource fee** rakamları **deploy öncesi testnet simülasyonuyla** pinlenmeli (taban
ağ sabitleri — base fee 100 stroops, base reserve 0.5 XLM — zaten doğrulandı, §1):

1. **Resource fee ölçümü**: `create_airdrop` ve `claim`'i `stellar contract invoke --sim-only`
   (`soroban/SKILL.md:1345-1354`) veya `rpc.simulateTransaction` (`data/SKILL.md:111-121`,
   `simulation.cost`) ile çağır → CPU komutu + okuma/yazma byte + byte → fee. İade-edilebilir
   (rent/event/return) ve iade-edilemez kısmı **ayrı raporla** (§1).
2. **Sıcak vs soğuk bitmap word**: claim fee'sini iki yolda ayrı ölç — (a) bir word'ün **ilk** claim'i
   (word entry **yazılır**, pahalı), (b) aynı word'e düşen **ikinci** claim (yalnız bit set). "N'den
   bağımsız ama word-ilk-yazımı pahalı" nüansı ancak böyle doğrulanır.
3. **Ölçek profili**: claim fee'sini N=1K/10K/100K (farklı proof uzunluğu `⌈log2 N⌉`) için ayrı ölç →
   "N'den bağımsız" hipotezini doğrula.
4. **Rent ölçümü**: bir `ClaimedWord` ve `Config` entry için `extend_ttl` maliyetini ölç → §3
   formülünü gerçek byte-rent ile doldur.
5. **`create_airdrop` ayrıştırma**: deploy(instance entry) + `Config` yazımı + transfer + event'i ayrı
   ölç; wasm upload'ın **yalnız factory deploy'da bir kez** olduğunu teyit et (create'te tekrar yok).
6. **Pinata**: gerçek `PinSize` ve plan limitlerini (`index.ts:178-179`) ölçek senaryolarıyla doğrula.

> Bu doküman **model ve mertebeleri** verir; production fee tablosu (§2) yukarıdaki sim çıktısıyla
> CI'da bir fixture olarak pinlenmeli (Zarf'ın "byte-determinism" disiplini, plan §6 ile uyumlu).

---

## 10. Tespit edilen çelişkiler / netleştirmeler

1. **Per-claim fee tahmini bir mertebe düşüktü (kritik):** plan/claim app "~0.001 XLM" gösteriyor
   (plan satır **513**, taslakta yanlışlıkla 514 denmişti). Yayınlanan Soroban profillemesi
   durum-değiştiren gerçek tx'lerde **ortalama ~215k–261k stroops ≈ 0.021–0.026 XLM** veriyor;
   Merkle-proof + bitmap word yazımı + transfer + event yapan bir claim bu mertebede beklenmeli.
   Bu doküman per-claim için **~0.01–0.03 XLM** kullanıyor. **Netleştirme:** claim app "~0.001 XLM"
   metni iyimser; **sim çıktısıyla güncellenmeli** (yine de alıcı için ihmal edilebilir tutar). ⚠
2. **pin-proxy `validateClaimList` şema uyuşmazlığı (yeni bloker):** mevcut validator (`index.ts:236-253`)
   `merkleRoot`/`leaves[]`/`schedule` zorunlu kılıyor; airdrop JSON'ı `root`/`claims[]` + `schedule
   yok` → **reddedilir**. pin-proxy yeniden kullanımı validator güncellemesi gerektirir. **Çelişki
   olarak raporlanır.**
3. **Claim-list JSON boyutu vs pin-proxy limiti:** plan §7 JSON şeması her entry'de `proof` tutar; bu
   10K+ alıcıda `MAX_BODY_BYTES`=1 MiB (`index.ts:113`) ve gateway 8 MiB (`index.ts:65`) limitlerini
   **aşar**. **Netleştirme önerisi:** `proof` opsiyonel + v1'de client-side üret (yeni
   `@zarf/core/lib/merkle`; mevcut `crypto/merkleTree.ts` Pedersen/Barretenberg, **keccak değil** →
   yeni modül şart). **Çelişki olarak raporlanır.**
4. **Hashing mirası yanlış ifade ediliyordu:** factory `recipient_id` =
   `BnScalar::from_bytes(keccak256(to_xdr)).to_bytes()` (`factory/src/lib.rs:118-122`) — keccak'ı
   BN254 alanına indirger (ZK için). Airdrop yaprağı **düz keccak256** (plan §4.3), indirgeme **yok**.
   "keccak256 host fonksiyonunu paylaşıyoruz" doğru; "aynı `recipient_id` şeması" yanlış olur.
   **Netleştirme** (maliyet etkisi ihmal edilebilir).
5. **Base reserve / trustline reserve = 0.5 XLM, base fee = 100 stroops, hesap floor = 1 XLM:** taslak
   bunları "⚠ doğrulanmalı" bırakmıştı; **güncel ağ varsayılanı olarak doğrulandı** (§1) — işaretler
   kaldırıldı. Çelişki değil, doğrulama. ✔
6. **`create_airdrop` wasm yüklemez:** taslak "wasm byte upload (resource)"u her create'e atfediyordu;
   gerçekte wasm upload **yalnız factory deploy'da bir kez** (`deploy_v2` embed'li hash kullanır).
   Per-create resource buna göre düşürüldü. **Düzeltme.**

---

## Kaynaklar

- Stellar fee/reserve: [Transaction Fees, Minimum Balances, and Surge Pricing](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) — base fee 100 stroops/op (0.00001 XLM), base reserve 0.5 XLM/subentry, hesap min 1 XLM.
- Soroban fee modeli (refundable/non-refundable, 6 kaynak boyutu): [Stellar blog — Soroban's Fee Structure](https://stellar.org/blog/developers/sorobans-fee-structure-contributes-stellar-network-scalability), [CAP-0046-07](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-07.md).
- Gerçek tx fee profillemesi (~215k–261k stroops ort.): [Cheesecake Labs — How Much Do Soroban Fees Cost?](https://cheesecakelabs.com/blog/how-much-do-soroban-fees-cost/).
- Repo: `contracts/soroban/zarf/factory/src/lib.rs` (TTL sabitleri, `recipient_id`, fonlama guard'ı), `web/apps/pin-proxy/src/index.ts` (limitler + `validateClaimList`), `plans/airdrop_tool/airdrop-tool-design.md`.

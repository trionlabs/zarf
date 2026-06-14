# Zarf Airdrop Aracı — Indexer & Dashboard Veri Modeli

> Hedef: Standart (ZK olmayan) **cüzdan-adresi + Merkle-claim** airdrop aracının
> **indexer + dashboard veri modeli** ve **event-şema** sözleşmesi. Ana plan §9'un
> ([`airdrop-tool-design.md:401-407`](airdrop-tool-design.md)) implementation-grade açılımıdır:
> hangi event'ler ingest edilir, kampanya/claim ilerleme kayıtları nasıl türetilir, hangi route'lar
> hangi cache stratejisiyle servis edilir, dashboard'un tükettiği **tam JSON şekli** nedir.
> Tasarım, mevcut `web/apps/indexer` worker'ının `withEdgeCache` + RPC-`simulate` desenini
> ([`indexer/src/index.ts:321-376,907-929`](../web/apps/indexer/src/index.ts)) ve
> [02-contract-spec](02-contract-spec.md)'in event/ABI şemasını **birebir** miras alır.
> Her Stellar/RPC iddiası `data`+`soroban` skill'lerine ve repo satırlarına dayanır; ağ-seviyesi
> ya da piyasa-bağlı sayılar açıkça **"doğrulanmalı"** işaretlidir. Mevcut
> `verifier`/`registry`/`vesting`/`factory` kontratlarına ve mevcut indexer route'larına
> **DOKUNULMAZ** — iki yeni route-ailesi + yeni handler'lar eklenir.
> DURUM: Tasarım kararlaştırıldı, implementasyon bekliyor.

---

## 0. Bu sürümde düzeltilen iddialar (adversarial doğrulama)

İlk taslaktaki indexer file:line atıflarının neredeyse tamamı repoya karşı **doğru** çıktı
([`indexer/src/index.ts`](../web/apps/indexer/src/index.ts) 1195 satır). Aşağıdaki beş madde
**düzeltildi** çünkü `data`/`soroban` skill'leriyle çelişiyordu veya kanıtlanamadı:

| # | İddia (taslak) | Bulgu | Düzeltme |
|---|---|---|---|
| 1 | `now = latestLedger.timestamp` (status için), kaynak "data skill getLatestLedger" | `getLatestLedger` skill'de **`{ id, sequence, protocolVersion }`** döner — **timestamp alanı yok** ([`data/SKILL.md:86-87`](../../.claude/skills/data/SKILL.md)) | §3.4/§4.1/§7.1: `now`, ledger **kapanış-zamanı** kaynağından alınır (RPC ledger meta / son tx `createdAt`); kaynak **doğrulanmalı** işaretli |
| 2 | `getEvents` yanıtı `cursor` ile sayfalanır ("data skill RPC getEvents") | data SKILL'in Get Events örneği ([`data/SKILL.md:153-172`](../../.claude/skills/data/SKILL.md)) **cursor göstermez**; `### Pagination` ([`data/SKILL.md:316`](../../.claude/skills/data/SKILL.md)) **Horizon**'a ait, RPC getEvents'e değil | §2.4/§5.2/§9: getEvents sayfalama **"doğrulanmalı (SDK getEvents dönüş tipi)"** |
| 3 | `ClaimRow.ledger`/`txHash` = "data skill getTransaction.ledger" | getEvents örnek döngüsü yalnız `event.topic, event.value` okur ([`data/SKILL.md:169-171`](../../.claude/skills/data/SKILL.md)); item'in `.ledger`/tx-hash taşıdığı **skill'de gösterilmez** (`getTransaction` ayrı metot) | §3.2: alanlar **"SDK getEvents item tipi, doğrulanmalı"** |
| 4 | `scValToNative` decode kaynağı `data/SKILL.md:169-171` | O satırlar **event-print döngüsü**; `scValToNative` örneği Get Ledger Entries'te ([`data/SKILL.md:104-106`](../../.claude/skills/data/SKILL.md)) | Atıf **104-106**'ya düzeltildi |
| 5 | "Symbol limited to 32 chars" = `soroban/SKILL.md:64` | Satır 64 = "No string type…"; doğru satır **65** ([`soroban/SKILL.md:65`](../../.claude/skills/soroban/SKILL.md)) | Atıf **65**'e düzeltildi |

DOGRULANMIS REPO GERCEKLERI (transfer_from fonlama, BN254-siz keccak yaprak, set_claimed-before-transfer
+ iki-taraflı guard, MuxedAddress payout, factory `wasm_hash` gömmez, `claimed_statuses(start,limit)`
vs vesting `Vec<BytesN<32>>`, pin-proxy şema çatışması) dokümanda zaten doğru yansıtılmıştı; gerekçeleri
korundu.

---

## 1. Kapsam, kaynak ve mevcut indexer ile ilişki

İki ürün katmanını besleriz:

| Tüketici | İhtiyaç | Veri kaynağı |
|---|---|---|
| **Create app dashboard** ("Kampanyalarım") | Owner'ın kampanya listesi + her birinin claim ilerlemesi | Factory registry (range-read) + instance config + `Claimed` event'leri |
| **Claim app** | Tek kampanya progress barı (claimed/total, kalan, son-N) + "kimler aldı" | Instance `config()`/`claimed_statuses` + `Claimed` event'leri |

**İki veri-okuma stratejisi** (her ikisi de `data` skill'e dayanır):

1. **`simulateTransaction` ile view-okuma** (mevcut indexer'ın **ana** deseni,
   [`indexer/src/index.ts:907-929`](../web/apps/indexer/src/index.ts)): factory getter'ları ve instance
   `config()`/`claimed_statuses` salt-okuma view'larıdır → uygun bir kaynak hesapla simüle edilir,
   `retval` decode edilir. Tarihsel-pencereden bağımsız, **anlık** durum verir.
2. **`getEvents` ile event-akışı** (yeni; `data` skill "Get Events",
   [`data/SKILL.md:153-172`](../../.claude/skills/data/SKILL.md)): `AirdropCreated`/`Claimed`/`Withdrawn`
   event'lerini ledger-aralığıyla çeker → "son-N claim", "claim sayısı zaman serisi", kampanya keşfi
   için. **RPC `getEvents` yalnızca ~7 günlük geçmişi kapsar** (`data` skill "RPC Limitations",
   [`data/SKILL.md:174-179`](../../.claude/skills/data/SKILL.md)) — bu, modelin **load-bearing**
   kısıtıdır (§6.3).

> **İlke (mevcut indexer ile tutarlı):** Indexer **durduğunda UI on-chain'e fallback eder**
> (fail-open). Mevcut create/claim app'leri zaten her view'ı doğrudan RPC'den okuyabiliyor; indexer
> yalnızca **cache + fan-out azaltma + event-aggregation** katmanıdır, tek-doğruluk-kaynağı değil.
> Bu, mevcut worker'ın "browsers call this worker instead of each repeating the same RPC simulations"
> amacıyla ([`indexer/src/index.ts:3-5`](../web/apps/indexer/src/index.ts)) birebir aynıdır.

---

## 2. Event şemaları — ingest sözleşmesi (topics + data ayrımı)

Üç event'in tam şekli [02-contract-spec §2.3, §3.4](02-contract-spec.md)'ten gelir. Indexer'ın
**topics**'i filtre/eşleme için, **data**'yı alan-çıkarımı için kullanması kritik olduğundan ayrımı
burada netleştiriyoruz.

### 2.1 `AirdropCreated` (factory yayar)

```rust
#[contractevent(topics = ["airdrop_created"])]
pub struct AirdropCreated {
    #[topic] pub airdrop: Address,   // topic[1] — deploy edilen instance
    #[topic] pub owner:   Address,   // topic[2] — kampanya başlatan
    #[topic] pub token:   Address,   // topic[3] — SAC/SEP-41
    pub total_amount:    i128,       // data
    pub recipient_count: u32,        // data — metadata; on-chain doğrulanmaz
    pub merkle_root:     BytesN<32>, // data
    pub deadline:        u64,        // data — 0 = süresiz
    pub locked:          bool,       // data
    pub metadata_cid:    String,     // data
}
```

| | Topics | Data |
|---|---|---|
| **Eşleme anahtarı** | `["airdrop_created", airdrop, owner, token]` | — |
| **Indexer kullanımı** | `topic[1]=airdrop` kampanya PK; `topic[2]=owner` per-owner index; `topic[3]=token` token-gruplama | `total_amount`, `recipient_count`, `merkle_root`, `deadline`, `locked`, `metadata_cid` → kampanya kaydının **tamamı tek event'ten** kurulur (ekstra ledger okuması yok, [02-contract-spec §2.3](02-contract-spec.md)) |

`Symbol` topic `"airdrop_created"` 15 karakter < 32 → tek topic'e sığar (`soroban` skill "Symbol limited
to 32 characters", [`soroban/SKILL.md:65`](../../.claude/skills/soroban/SKILL.md)). Topic-tasarımı repo
`VestingCreated` ([`factory/src/lib.rs:69-81`](../contracts/soroban/zarf/factory/src/lib.rs)) ile aynı
3-indeksli yapıyı izler.

### 2.2 `Claimed` (instance yayar)

```rust
#[contractevent(topics = ["claim"])]
pub struct Claimed {
    #[topic] pub to: Address,   // topic[1] — fon alıcısı = leaf adresi
    pub index:  u32,            // data
    pub amount: i128,           // data
}
```

| | Topics | Data |
|---|---|---|
| **Eşleme anahtarı** | `["claim", to]` + event'in `contractId`'si = instance adresi | — |
| **Indexer kullanımı** | `contractId` → hangi kampanya; `topic[1]=to` → "kim aldı" | `index` (bitmap konumu, bitmap okumadan eşleme), `amount` → progress aggregation |

> **`data_format` uyarısı (02-contract-spec §3.4'ten taşınır):** `Claimed`'de **iki** data alanı
> (`index`, `amount`) var; SDK'nın `data_format = "single-value"` ile çoklu-alan desteği **derleme
> anında doğrulanmalı** ([02-contract-spec §3.4](02-contract-spec.md)). Indexer parser'ı bu
> yüzden **iki olası şekle** dayanıklı olmalı: (a) iki ayrı ScVal map alanı; (b) tek `(u32, i128)`
> tuple/struct data. Decode katmanı (`scValToNative`, `data` skill Get Ledger Entries örneği
> [`data/SKILL.md:104-106`](../../.claude/skills/data/SKILL.md)) ikisini de ele alır (§4.2).

### 2.3 `Withdrawn` (instance yayar)

```rust
#[contractevent(topics = ["withdraw"])]
pub struct Withdrawn {
    #[topic] pub to: Address,   // topic[1] — admin'in seçtiği geri-alım hedefi
    pub amount: i128,           // data
}
```

Indexer kullanımı: kampanyanın **terminal** durumunu işaretler (`withdrawn`); dashboard "Geri Çek"
butonunu pasif/tamamlandı'ya çevirir. `contractId` → kampanya eşlemesi.

### 2.4 RPC `getEvents` filtre taslağı

`data` skill "Get Events" ([`data/SKILL.md:153-172`](../../.claude/skills/data/SKILL.md)) deseniyle,
topic'in **ilk** elemanı (event adı Symbol'ü) ile filtreleme:

```typescript
const events = await new rpc.Server(cfg.rpcUrl).getEvents({
    startLedger,                       // cursor: son işlenen + 1 (§5.2 — kaynak doğrulanmalı)
    filters: [
        {
            type: 'contract',
            contractIds: [instanceAddress],                         // tek kampanya
            topics: [[xdr.ScVal.scvSymbol('claim').toXDR('base64'), '*']],  // ["claim", <to>]
        },
    ],
});
```

Kampanya keşfi için `contractIds = [factoryAddress]`, `topics = [[scvSymbol('airdrop_created'), '*','*','*']]`.
`'*'` wildcard = "herhangi bir topic"; skill'in örnek filtresinde `["*", scvSymbol(...)]` formuyla
gösterilir ([`data/SKILL.md:163`](../../.claude/skills/data/SKILL.md)).

> **Sayfalama uyarısı (doğrulanmalı):** Taslaktaki "yanıt `cursor`'ı ile bir sonraki sayfa"
> iddiası `data` skill'de **RPC getEvents için belgeli değil** — skill'in Get Events örneği
> ([`data/SKILL.md:153-172`](../../.claude/skills/data/SKILL.md)) yanıt cursor'ı göstermez ve
> `### Pagination` bölümü ([`data/SKILL.md:316`](../../.claude/skills/data/SKILL.md)) **Horizon**'a
> aittir. `getEvents` dönüş tipindeki cursor/`latestLedger` alanları **SDK sürümüne karşı
> doğrulanmalı** (gerçek `@stellar/stellar-sdk` `getEvents` yanıtı `cursor`/`latestLedger` taşır,
> ama bu skill'de kanıtlanmaz → varsayım değil, kontrol).

---

## 3. Veri modeli — türetilen kayıtlar

Indexer **stateless edge-cache** modelinde çalışır (mevcut worker gibi: kalıcı DB yok, her okuma
RPC'ye gider, cevap Cloudflare edge'inde cache'lenir, [`indexer/src/index.ts:14-20,321-376`](../web/apps/indexer/src/index.ts)).
Aşağıdaki "kayıtlar" **response-shape**'lerdir, bir veritabanı tablosu değil. (İleride Durable Object /
KV ile event-aggregation eklenirse §6.3 notu.)

### 3.1 Kampanya kaydı (factory registry + instance config mirror)

```typescript
interface AirdropCampaign {
    airdrop: string;            // instance C… (PK) — AirdropCreated.topic[1]
    owner: string;             // G…/C… — topic[2]
    token: string;             // SAC/SEP-41 — topic[3]
    tokenSymbol: string | null;// instance token.symbol() (opsiyonel, indexer enrich)
    tokenDecimals: number | null;
    totalAmount: string;       // i128 → string (bigint güvenliği) — total_amount data
    recipientCount: number;    // u32 — recipient_count (metadata; on-chain doğrulanmaz)
    merkleRoot: `0x${string}`; // 32B = 64 hex — merkle_root data
    deadline: string;          // u64 ledger-timestamp → string; "0" = süresiz
    locked: boolean;           // geri-çekme kilidi
    metadataCid: string | null;// claim-list IPFS CID — metadata_cid data
    status: 'active' | 'expired' | 'withdrawn'; // türetilmiş (§3.4)
    fetchedAt: number;
}
```

- `totalAmount`/`deadline` **string** olarak servis edilir (mevcut indexer `tokenBalance`/`balance`'ı
  `.toString()` ile string döner, [`indexer/src/index.ts:621,670`](../web/apps/indexer/src/index.ts) —
  JS `number` `i128`/`u64`'ü taşıyamaz).
- `tokenSymbol`/`tokenDecimals` mevcut `readVestingContract`'ın token-metadata enrich deseniyle
  doldurulur ([`indexer/src/index.ts:706-735`](../web/apps/indexer/src/index.ts), token sembol/decimals
  enrich `719-728`); başarısızsa `null` (token display metadata opsiyonel, aynı bloktaki `catch`).

### 3.2 Claim ilerleme kaydı

```typescript
interface ClaimProgress {
    airdrop: string;
    totalAmount: string;          // config'ten (= Σ amount)
    recipientCount: number;       // config event metadata'sından
    claimedCount: number;         // claimed bit sayısı (claimed_statuses popcount)
    claimedAmount: string;        // Σ claimed amount (bitmap × claim-list; §3.3)
    remainingAmount: string;      // totalAmount - claimedAmount (string-bigint)
    claimedFraction: number;      // claimedCount / recipientCount (0..1, görsel bar)
    contractBalance: string;      // token.balance(instance) — canlı bakiye
    recentClaims: ClaimRow[];     // son-N (§3.3), zaman-azalan
    fetchedAt: number;
}

interface ClaimRow {
    to: string;          // Claimed.topic[1]
    index: number;       // Claimed.index
    amount: string;      // Claimed.amount → string
    ledger: number;      // event item'inin ledger'ı — SDK getEvents item tipi, doğrulanmalı
    txHash: string;      // event'in tx hash'i (explorer linki) — getEvents item tipi, doğrulanmalı
}
```

> **`ClaimRow.ledger`/`txHash` (doğrulanmalı):** `data` skill'in Get Events örnek döngüsü yalnız
> `event.topic, event.value` okur ([`data/SKILL.md:169-171`](../../.claude/skills/data/SKILL.md));
> event item'inin `.ledger`/tx-hash alanlarını **göstermez**. (Skill `getTransaction` dönüşünde
> `ledger: number` belgeler, [`data/SKILL.md:147-150`](../../.claude/skills/data/SKILL.md), ama bu
> ayrı bir metottur.) Gerçek `@stellar/stellar-sdk` getEvents item'i `ledger`+`txHash`/`id` taşır;
> yine de **SDK sürümüne karşı doğrulanmalı** — varsayılmaz. `txHash` yoksa explorer linki `id`/ledger
> üzerinden kurulur.

> **`claimedCount` iki yoldan doğrulanabilir:** (a) `claimed_statuses(0, recipientCount)` view'ından
> popcount (bitmap-doğru, **anlık**, [02-contract-spec §3.8](02-contract-spec.md)); (b) distinct
> `Claimed` event sayısı (event-doğru ama ~7g penceresi). **Birincil = (a)** (bitmap monoton, tam);
> event yalnızca `recentClaims` için. `recipientCount > MAX_PAGE_LIMIT(80)` ise
> `claimed_statuses` **sayfalanır** (§5.1).

### 3.3 `claimedAmount` ve son-N claim

`claimedAmount` **on-chain config'te tutulmaz** — config yalnız `total`'ı (Σ amount) tutar
([02-contract-spec §3.2](02-contract-spec.md)); claim edilen miktarın koşan toplamı kontratta
yoktur. İki yaklaşım:

| Yöntem | Doğruluk | Kısıt |
|---|---|---|
| **Event-toplam** (`Σ Claimed.amount`) | ~7g pencere içindeyse tam | RPC `getEvents` 7g geçmişi ([`data/SKILL.md:176`](../../.claude/skills/data/SKILL.md)) → eski kampanyada eksik |
| **Bitmap × claim-list** (`claimed_statuses` popcount + IPFS claim-list amount'larını topla) | **Tam** (pencereden bağımsız) | claim-list JSON gerekir (CID'den; §4.3) |

> **Karar:** `claimedAmount` için **bitmap × claim-list** birincil (pencere-bağımsız); claim-list her
> zaman IPFS'te ve indexer onu zaten `/v1/ipfs/:cid/claim-list` ile servis ediyor (§4.3). `recentClaims`
> için **event** (son-N = en yeni ledger'lar, pencere içinde garanti). Böylece "kalan miktar" doğru,
> "son aktivite" akışı taze.
>
> Claim-list'in `claims[i].amount`'u **leaf'in amount'uyla aynıdır** (kontrat leaf'i
> `keccak256(0x00 ‖ index_be32 ‖ claimant.to_xdr ‖ amount_be128)`,
> [02-contract-spec §5.1](02-contract-spec.md)), bu yüzden bitmap'te set olan index'lerin
> claim-list amount'larını toplamak doğru `claimedAmount`'u verir.

### 3.4 Türetilmiş `status`

```
now = en son ledger'ın KAPANIŞ ZAMANI (ledger close-time) — kaynak doğrulanmalı (aşağı bkz.)
if Withdrawn event görüldü                       → 'withdrawn'
elif deadline != 0 && now > deadline             → 'expired'
else                                             → 'active'
```

> **DÜZELTME (load-bearing) — `now` kaynağı:** Taslaktaki `now = latestLedger.timestamp
> (data skill getLatestLedger)` **yanlıştı**: `getLatestLedger` `data` skill'de
> **`{ id, sequence, protocolVersion }`** döner — **`timestamp` alanı yoktur**
> ([`data/SKILL.md:86-87`](../../.claude/skills/data/SKILL.md)). `deadline` bir **ledger-timestamp**
> (Unix saniye) olduğundan karşılaştırma için **ledger kapanış-zamanı** gerekir; bu, sequence'ten
> türemez. Kaynak seçenekleri (**dağıtımda doğrulanmalı**): (a) RPC ledger meta'sının `closeTime`/
> `created_at` alanı; (b) son işlenen tx'in `getTransaction` ledger meta'sı; (c) `getLatestLedger`
> SDK sürümünde timestamp döndürüyorsa onu kullan — ama skill bunu garanti etmediğinden **kontrol
> edilmeli**. Pratik kestirme: status `'expired'` salt-UI bir ipucudur (gerçek kapı on-chain
> `claim`'in `Expired` denetimidir), bu yüzden `now` için ~ledger-yaklaşık bir kapanış-zamanı
> yeterlidir; kesin gating kontrata bırakılır.

`deadline`/`locked` semantiği [02-contract-spec §3.7 "Dört güven modu"](02-contract-spec.md)
ile aynı; dashboard "Geri Çek" butonunun aktif/pasif'i **bu status + locked**'tan türetilir (kontrat
`withdraw_unclaimed` kapısının ayna mantığı, salt UI; gerçek kapı on-chain).

---

## 4. Route'lar (mevcut `withEdgeCache` deseni)

Mevcut worker'ın route-iskeletine ([`indexer/src/index.ts:178-295`](../web/apps/indexer/src/index.ts))
**airdrop ailesi** eklenir. Ağ segmenti mevcut `getNetworkConfig` ile çözülür
([`indexer/src/index.ts:1044-1068`](../web/apps/indexer/src/index.ts)); `cached(ttl, produce, extra)`
helper'ı aynen kullanılır ([`indexer/src/index.ts:156-160`](../web/apps/indexer/src/index.ts)).

| Route | Handler | Cache TTL | Kaynak |
|---|---|---|---|
| `GET /v1/:network/airdrop/:addr/progress` | `handleAirdropProgress` | `CACHE_TTL_PROGRESS` (kısa, §5.2) | `config()` + `claimed_statuses` + `getEvents` + claim-list |
| `GET /v1/:network/airdrop/:addr/config` | `handleAirdropConfig` | `CACHE_TTL_SUMMARY` (60s) | `config()` view |
| `GET /v1/:network/factory/:addr/campaigns` | `handleFactoryCampaigns` | `CACHE_TTL_LIST` (60s) | factory range-read |
| `GET /v1/:network/owners/:owner/airdrops` | `handleOwnerAirdrops` | `CACHE_TTL_LIST` (60s) | factory owner range-read |
| `GET /v1/ipfs/:cid/claim-list` | `handleClaimListExtract` | `CACHE_TTL_IMMUTABLE` (1y) | IPFS (CID-verified) |

> **`/factory/:addr/campaigns` vs env-factory:** Görev, `/v1/factory/:addr/campaigns` formunu ister.
> Mevcut worker'ın factory adresi **env'den** gelir (URL'de değil,
> [`indexer/src/index.ts:50-61,1050-1052`](../web/apps/indexer/src/index.ts)). İki uyumlu seçenek:
> (a) URL'deki `:addr`'ı **doğrula → env'deki konfigüre factory ile eşleşmeli**, eşleşmezse
> `400 factory_not_configured` (cache-poisoning / yanlış-factory'yi keser); (b) çok-factory desteği
> isteniyorsa `:addr` cache-key'e folded edilir (mevcut `predict` route'unun `cfg.factoryAddress`'i
> cache-key'e katması gibi, [`indexer/src/index.ts:220-227`](../web/apps/indexer/src/index.ts)).
> **Öneri = (a)** (v1 tek-factory); `:addr` cache-key güvenliği için yine de folded edilir.

### 4.1 `/v1/:network/airdrop/:addr/progress` — dashboard'un ana endpoint'i

```typescript
async function handleAirdropProgress(addr, cfg, corsHeaders): Promise<Response> {
    assertAddress(addr, 'airdrop address');               // mevcut helper, indexer:1076
    const cfgScVal = await simulate(cfg, addr, 'config'); // instance config() view, indexer:907
    const config = parseAirdropConfig(cfgScVal);          // §4.2
    const now = await getLedgerCloseTime(cfg);            // status için — kaynak doğrulanmalı (§3.4)

    const [statuses, recent, contractBalance] = await Promise.all([
        readClaimedStatuses(cfg, addr, config.recipientCount), // sayfalı popcount (§5.1)
        readRecentClaims(cfg, addr, RECENT_CLAIM_LIMIT),       // getEvents son-N
        getTokenBalance(cfg, config.token, addr),              // mevcut helper, indexer:737
    ]);

    const claimedCount = popcount(statuses);
    // claimedAmount: bitmap × claim-list (pencere-bağımsız, §3.3) — CID'den amount tablosu
    const amountByIndex = await loadClaimAmounts(config.metadataCid); // §4.3, opsiyonel
    const claimedAmount = sumClaimedAmounts(statuses, amountByIndex);

    return json({ /* ClaimProgress (§3.2) */ }, 200, corsHeaders);
}
```

> `recipientCount` `config()`'ten **gelmez** (Config'de yok, [02-contract-spec §3.2](02-contract-spec.md)):
> ya `AirdropCreated` event metadata'sından ya da claim-list `claims.length`'inden alınır. İkisi
> **çapraz-doğrulanmalı** (event metadata on-chain garanti değil, §8). `readClaimedStatuses` için bir
> üst-sınır `recipientCount` gerekir; bu yüzden progress handler önce kampanya kaydını (event/claim-list)
> çözmelidir.

### 4.2 Config decode (mevcut `parseVestingSummary` deseni)

`config()` bir `Config` struct'ı döner; mevcut `scMap`/`scMapField`/`scString`/`bytesToHex`
yardımcılarıyla ([`indexer/src/index.ts:931-986,1101-1103`](../web/apps/indexer/src/index.ts)) decode
edilir:

```typescript
function parseAirdropConfig(value: xdr.ScVal): AirdropConfig {
    const f = scMap(value, 'airdrop config');
    return {
        admin: StellarSdkAddress.fromScVal(scMapField(f, 'admin')).toString(),
        token: StellarSdkAddress.fromScVal(scMapField(f, 'token')).toString(),
        merkleRoot: bytesToHex(scValToNative(scMapField(f, 'merkle_root'))),  // 0x… 64hex
        total: scValToBigInt(scMapField(f, 'total')).toString(),
        deadline: scValToBigInt(scMapField(f, 'deadline')).toString(),
        locked: Boolean(scValToNative(scMapField(f, 'locked'))),
    };
}
```

`Config` alan adları [02-contract-spec §3.2](02-contract-spec.md): `admin/token/merkle_root/total/deadline/locked`
(`recipient_count` **yoktur**). `claimed_statuses(start, limit)` `Vec<bool>` döner → `scValToNative` →
`boolean[]`.

### 4.3 `/v1/ipfs/:cid/claim-list` — claim-list extraction

Mevcut `/v1/ipfs/:cid` ve `/v1/ipfs/:cid/email-hashes` aynı CID-doğrulamalı çekme deseniyle
([`indexer/src/index.ts:195-205,451-458,559-579`](../web/apps/indexer/src/index.ts)); yeni handler
[claim-list JSON şemasını](02-contract-spec.md) ([02-contract-spec §6](02-contract-spec.md)) çıkarır:

```typescript
async function handleClaimListExtract(rawCid, corsHeaders): Promise<Response> {
    const cid = validateCid(decodeSegment(rawCid));            // mevcut, indexer:1135
    const { data, verification } = await fetchIpfsJson(cid);   // mevcut, CID-verified, indexer:993
    const doc = data as Partial<AirdropClaimList>;
    // hafif şema kontrolü (yapı; tam Merkle doğrulaması claim app'te)
    const claims = Array.isArray(doc.claims)
        ? doc.claims.map((c, i) => ({ index: i, address: c.address, amount: c.amount }))
        : [];
    return json(
        { v: doc.v, network: doc.network, airdrop: doc.airdrop, token: doc.token,
          root: doc.root, recipientCount: claims.length, claims, fetchedAt: Date.now() },
        200,
        withVerificationMarker(corsHeaders, verification),     // mevcut, indexer:460-465
    );
}
```

`proof[]`'ı kasıtlı **dışarıda bırakır** (dashboard'un "kim/ne kadar" tablosu için proof gereksiz;
hafif payload). `index = dizinin sırası i` ([02-contract-spec §6](02-contract-spec.md): "index =
dizideki sıra"). CID content-addressed → **immutable TTL** (mevcut IPFS route'larıyla aynı,
[`indexer/src/index.ts:196`](../web/apps/indexer/src/index.ts)).

> **pin-proxy şema çatışması (ana plan §0.7 + 02-contract-spec'ten taşınır):** Mevcut `validateClaimList`
> ([`pin-proxy/src/index.ts:236-253`](../web/apps/pin-proxy/src/index.ts)) `merkleRoot` + boş-olmayan
> `leaves[]` + `schedule` **zorunlu** kılar → airdrop'un `root` + `claims[]` (schedule **yok**, leaves
> yerine `claims`) şemasını **REDDEDER**. **Bu indexer extraction route'unu etkilemez** (indexer
> salt-okur, pin yapmaz), ama **pin tarafı** için: ya `validateClaimList` airdrop şemasını tanıyacak
> şekilde genişletilmeli ya da ayrı bir `validateAirdropClaimList`/route eklenmeli (operasyon
> dokümanında işlenir). Extraction handler yine de **savunmacı** olmalı (eksik/bozuk alan → boş
> `claims`, `200`; JSON tümden parse edilemiyorsa `fetchIpfsJson` zaten `502 ipfs_gateway_error`
> döndürür, [`indexer/src/index.ts:1003-1007`](../web/apps/indexer/src/index.ts)).

### 4.4 `/v1/:network/factory/:addr/campaigns` ve owner listesi

Mevcut `handleAllVestings`/`handleOwnerVestings` ([`indexer/src/index.ts:387-439`](../web/apps/indexer/src/index.ts))
deseninin **bire-bir** kopyası, sadece getter adları airdrop-factory ABI'sine
([02-contract-spec §2.6](02-contract-spec.md)) çevrilir: `get_deployment_count` →
`get_deployment_infos(start, limit)`; owner için `get_owner_deployment_count` →
`get_owner_deployment_infos(owner, start, limit)`. Range-read chunk'lama mevcut
`fetchDeploymentInfoRanges` ([`indexer/src/index.ts:692-704`](../web/apps/indexer/src/index.ts)) ile aynı.

> **`FACTORY_RANGE_LIMIT` (40) korunur:** Mevcut worker page'i 40 ile sınırlar
> ([`indexer/src/index.ts:124-131`](../web/apps/indexer/src/index.ts)): **mevcut deployed factory'de**
> her `DeploymentInfo` **İKİ** ledger entry'si (`DeploymentAt` + `MetadataCid`) okur, simüle footprint
> ~100 entry ile sınırlı (40×2 + instance + code = 82). Airdrop `DeploymentInfo` ise **1 entry/item**
> ([02-contract-spec §2.2](02-contract-spec.md), `DeploymentAt` tam struct'ı tek entry'de tutar),
> yani 80'lik sayfa = ~82 entry < 100 sınır → airdrop-factory için `FACTORY_RANGE_LIMIT`'i **80'e
> çıkarmak güvenli**. Mevcut worker yorumu da bunu söyler: "Factories built from the current contract
> source pack address+cid into ONE entry per item and cap pages at 80; 40 stays valid for both layouts"
> ([`indexer/src/index.ts:128-130`](../web/apps/indexer/src/index.ts)). Kod paylaşımı için 40
> muhafazakâr tutulabilir; tercih **implementasyonda netleşir** (her iki değer de geçerli; 40 = ekstra
> RPC çağrısı, 80 = daha az tur).

Campaigns response her item'i `config()` ile enrich **etmez** (liste hafif kalır); dashboard her
kart için ayrıca `/airdrop/:addr/progress` çeker (mevcut `handleAllVestings`'in sadece `{address,
metadataCid}` döndürmesi gibi, [`indexer/src/index.ts:392-400`](../web/apps/indexer/src/index.ts)).

---

## 5. Sayfalama ve `claimed_statuses` okuma

### 5.1 Bitmap aralık-okuma (`MAX_PAGE_LIMIT=80`)

`claimed_statuses(start, limit)` `limit <= MAX_PAGE_LIMIT(80)` zorunlu kılar
([02-contract-spec §3.8](02-contract-spec.md)); `recipientCount > 80` ise indexer **chunk'lar**:

```typescript
async function readClaimedStatuses(cfg, addr, recipientCount): Promise<boolean[]> {
    const out: boolean[] = [];
    for (let start = 0; start < recipientCount; start += AIRDROP_PAGE_LIMIT /*80*/) {
        const limit = Math.min(AIRDROP_PAGE_LIMIT, recipientCount - start);
        const scv = await simulate(cfg, addr, 'claimed_statuses', [scU32(start), scU32(limit)]);
        out.push(...(scValToNative(scv) as boolean[]));
    }
    return out;
}
```

> **Neden `claimed_statuses(start,limit)` ≠ vesting'in `Vec<BytesN<32>>`'i:** Airdrop bitmap
> **aralık** okur (her index ≠ bir entry; 128 index/word), bu yüzden vesting'in `MAX_CLAIMED_BATCH=64`
> commitment-tavanı ([`vesting/src/lib.rs:41,293-301`](../contracts/soroban/zarf/vesting/src/lib.rs))
> yerine factory range-read `MAX_PAGE_LIMIT=80` ([`factory/src/lib.rs:24-27`](../contracts/soroban/zarf/factory/src/lib.rs))
> kullanılır ([02-contract-spec §1.1, §3.8](02-contract-spec.md)). Vesting `claimed_statuses`'ı
> `Vec<BytesN<32>>` commitment listesi alır ve `MAX_CLAIMED_BATCH` ile sınırlar; airdrop `(start,limit)`
> aralığı alır. **Bu, doğrulanmış bir repo gerçeğidir** (vesting'in batch-tavanı ZK commitment
> tooling'i içindir; airdrop bitmap-aralığı okuduğundan ayrı bir `MAX_CLAIMED_BATCH` sabitine gerek
> yok). Indexer'ın okuma birimi de bu yüzden **bool-aralığı**, commitment-seti değil.
>
> **Alternatif (daha az RPC):** Mevcut worker'ın `readClaimedFlags`'i
> ([`indexer/src/index.ts:809-835`](../web/apps/indexer/src/index.ts)) `getLedgerEntries` ile
> persistent entry'leri **tek** çağrıda okur. Airdrop bitmap word'leri (`ClaimedWord(u32)` → `u128`,
> [02-contract-spec §3.2-3.3](02-contract-spec.md)) da `getLedgerEntries` ile toplu okunup
> client'ta popcount edilebilir → büyük kampanyada `simulate`-başına-sayfa yerine tek RPC (10k alıcı =
> 79 word, [02-contract-spec §3.3](02-contract-spec.md); `ceil(10000/128)=79` doğrulandı).
> Tasarım ikisini de destekler; **büyük listede `getLedgerEntries`+popcount tercih edilir** (`data`
> skill "Get Ledger Entries", [`data/SKILL.md:90-108`](../../.claude/skills/data/SKILL.md)).
> `getLedgerEntries` yolu, contract `ClaimedWord(u32)` enum-tuple'ının ledger-key'ini
> `readClaimedFlags`'in `claimedLedgerKey` deseni gibi ScVec([Symbol, payload]) ile kurmayı gerektirir
> ([`indexer/src/index.ts:837-850`](../web/apps/indexer/src/index.ts)).

### 5.2 `getEvents` cursor/pagination ve ledger-aralığı

`recentClaims` için `getEvents` `startLedger`'dan ileri okunur. Son-N için **en yeni** event'ler
gerektiğinden:

- `startLedger = max(latestLedger - LOOKBACK_LEDGERS, kampanya-oluşturma-ledger'ı)`. `LOOKBACK_LEDGERS`
  ~7g penceresinin altında tutulur: örn. `DAY_IN_LEDGERS × 6 = 103_680` ledger
  (`DAY_IN_LEDGERS=17_280`, [`factory/src/lib.rs:14`](../contracts/soroban/zarf/factory/src/lib.rs));
  7g penceresi = `17_280 × 7 = 120_960` ledger olduğundan 103_680 güvenle pencere içindedir. **7g üstü
  kesinlik için event'e güvenilmez** → `claimedAmount` bitmap×claim-list'ten (§3.3).
- **Sayfalama (doğrulanmalı):** `data` skill RPC `getEvents` için yanıt-cursor'ı belgelemez (§2.4
  uyarısı); gerçek SDK getEvents yanıtı bir `cursor`/`latestLedger` taşır ve `endLedger`/`cursor`
  ile ileri sayfalanabilir — bu **SDK sürümüne karşı doğrulanmalı**, varsayılmamalı. Sonuçlar
  ledger-artan döndüğünden son-N için ya tüm pencere taranıp sondan N alınır ya da cursor ile ileri
  gidilir. Büyük kampanyada bu pahalı → **`recentClaims` opsiyonel ve cache'li** (§6).

> **7g sınırı load-bearing:** `getEvents` 7 günden eski event'i **vermez**
> ([`data/SKILL.md:176`](../../.claude/skills/data/SKILL.md)). Kalıcı "tüm claim geçmişi" gerekiyorsa
> kendi-indexer / Mercury / SubQuery / Hubble gerekir ([`data/SKILL.md:387-426`](../../.claude/skills/data/SKILL.md))
> — v1 kapsamı **dışı** (§6.3). v1'de "son-N claim" 7g penceresiyle yeterli; "toplam ilerleme" zaten
> bitmap'ten (pencere-bağımsız).

---

## 6. Cache stratejisi

Mevcut worker'ın **volatiliteye göre TTL** modelini ([`indexer/src/index.ts:134-149`](../web/apps/indexer/src/index.ts))
airdrop endpoint'lerine uygularız. Yeni sabitler mevcut isimlendirmeyle:

```typescript
const CACHE_TTL_CLAIM_LIST    = CACHE_TTL_IMMUTABLE; // 31_536_000 — CID content-addressed
const CACHE_TTL_CAMPAIGN_LIST = CACHE_TTL_LIST;      // 60 — registry listing (yeni kampanya eklenebilir)
const CACHE_TTL_CONFIG        = CACHE_TTL_SUMMARY;   // 60 — config deploy'da sabit ama balance enrich volatil
const CACHE_TTL_PROGRESS      = 10;                  // claimed monoton ARTAR → kısa
const CACHE_TTL_PROGRESS_DONE = CACHE_TTL_CLAIMED_TRUE; // 3_600 — claimed==recipientCount/withdrawn (terminal)
```

| Endpoint | Volatilite | TTL | Gerekçe |
|---|---|---|---|
| `/ipfs/:cid/claim-list` | **Hiç (immutable)** | 1 yıl | CID değişmez içerik → mevcut IPFS route'larıyla aynı ([`indexer/src/index.ts:135,196`](../web/apps/indexer/src/index.ts)) |
| `/airdrop/:addr/config` | Deploy'da sabit | 60s | Config hiç değişmez (mutator yok, [02-contract-spec §3.2](02-contract-spec.md)); 60s mevcut `CACHE_TTL_SUMMARY` ile uyumlu güvenlik marjı ([`indexer/src/index.ts:137`](../web/apps/indexer/src/index.ts)) |
| `/factory/:addr/campaigns`, `/owners/:owner/airdrops` | Yeni kampanya eklenir | 60s | Mevcut `CACHE_TTL_LIST` ([`indexer/src/index.ts:136,234`](../web/apps/indexer/src/index.ts)) |
| `/airdrop/:addr/progress` | **Monoton artan** | **10s** (terminal'de 3600s) | claimed-bit asla geri dönmez ama sık değişir; mevcut `CACHE_TTL_CLAIMED_FALSE=10` mantığı ([`indexer/src/index.ts:142`](../web/apps/indexer/src/index.ts)) |

### 6.1 Progress: monoton-artan → koşullu TTL

Mevcut worker `claimedResponseTtl(bodyText)` ile **gövdeye bakarak** TTL seçer
([`indexer/src/index.ts:378-385`](../web/apps/indexer/src/index.ts)): `claimed==true` kalıcı (1h),
`false` kısa (10s). Aynı deseni progress'e uygularız:

```typescript
function progressResponseTtl(bodyText: string): number {
    try {
        const p = JSON.parse(bodyText) as { status?: string; claimedCount?: number; recipientCount?: number };
        // Terminal: withdrawn ya da herkes claim etti → uzun cache (artık değişmez)
        if (p.status === 'withdrawn' || (p.claimedCount != null && p.claimedCount >= (p.recipientCount ?? Infinity)))
            return CACHE_TTL_PROGRESS_DONE; // 3600
        return CACHE_TTL_PROGRESS;          // 10 — hâlâ akıyor
    } catch { return 0; }
}
```

`cached(progressResponseTtl, …)` mevcut `claimedResponseTtl` ile birebir aynı imzayla geçer
(`ttl: number | ((bodyText: string) => number)`, [`indexer/src/index.ts:157,325,349`](../web/apps/indexer/src/index.ts)).

### 6.2 `?refresh=1` ve fail-open

- **`?refresh=1`** mevcut bypass'ı aynen geçerli ([`indexer/src/index.ts:330-331,372-374`](../web/apps/indexer/src/index.ts)):
  claim app, kullanıcı claim ettikten **hemen sonra** `/progress?refresh=1` ile barı zorla tazeler
  (10s TTL'i beklemeden). Refresh cevabı browser HTTP cache'ine **`no-store`** ile gider (mevcut davranış).
- **Fail-open:** Hata cevapları **asla cache'lenmez** (`fresh.status !== 200` → cache atlanır,
  [`indexer/src/index.ts:346`](../web/apps/indexer/src/index.ts)); indexer 500/502 dönerse UI doğrudan
  RPC'ye düşer (§1 ilkesi). Rate-limit (429) ve `network_not_configured` (500) mevcut error-path'larla
  aynı şekilde ele alınır ([`indexer/src/index.ts:170-176,296-307`](../web/apps/indexer/src/index.ts)).

### 6.3 v1 stateless sınırı vs kalıcı-indexer (gelecek)

| | v1 (önerilen) | v2 (gerekirse) |
|---|---|---|
| Mimari | **Stateless edge-cache** (mevcut worker gibi, DB yok) | Durable Object / D1 / KV ile event-aggregation |
| `claimedAmount` 7g üstü | bitmap × claim-list (pencere-bağımsız) ✓ | event-ledger'ı kalıcı yazılır |
| "Tüm claim geçmişi" zaman serisi | **Yok** (sadece son-N, 7g) | Kalıcı tablo / Hubble-BigQuery ([`data/SKILL.md:391-400`](../../.claude/skills/data/SKILL.md)) |
| Maliyet | ~0 (edge cache) | KV/DO ücreti + cron-poll |

v1 **stateless yeterlidir**: progress bitmap'ten tam, son-N event 7g'den taze, kampanya listesi
range-read'den. Kalıcı zaman-serisi (claim-rate grafiği, tüm-zaman lider tablosu) **v2** — `data` skill
üçüncü-parti indexer'ları (Mercury/SubQuery, [`data/SKILL.md:417-426`](../../.claude/skills/data/SKILL.md))
ya da kendi cron-poll'lu KV'si ile.

---

## 7. Dashboard'un tükettiği tam JSON şekilleri

### 7.1 `GET /v1/testnet/airdrop/C…/progress`

```jsonc
{
  "airdrop": "CABC…X9",
  "token": "CDEF…U2",
  "tokenSymbol": "USDC",
  "tokenDecimals": 7,
  "totalAmount": "84200000000000",     // i128, en küçük birim, string
  "recipientCount": 1240,              // event metadata / claim-list (config'te YOK)
  "claimedCount": 312,
  "claimedAmount": "21040000000000",   // bitmap × claim-list (§3.3)
  "remainingAmount": "63160000000000", // totalAmount - claimedAmount
  "claimedFraction": 0.2516,           // 312/1240 (görsel bar)
  "contractBalance": "63160000000000", // token.balance(instance) canlı
  "deadline": "1788307200",            // u64 ledger-timestamp; "0" = süresiz
  "locked": true,
  "status": "active",                  // active | expired | withdrawn (now=ledger close-time, §3.4)
  "recentClaims": [
    { "to": "GABC…7K4Z", "index": 41, "amount": "100000000", "ledger": 58123901, "txHash": "a1b2…" }
  ],
  "fetchedAt": 1718280000000
}
```

> `recentClaims[].ledger`/`txHash` getEvents item alanlarıdır; SDK sürümüne karşı **doğrulanmalı**
> (§3.2). `status`'ün `expired`'a geçişi için kullanılan `now`, `getLatestLedger`'dan **gelmez**
> (timestamp alanı yok); ledger kapanış-zamanı kaynağı **doğrulanmalı** (§3.4).

### 7.2 `GET /v1/testnet/factory/C…/campaigns`  (ve `/owners/G…/airdrops`)

```jsonc
{
  "campaigns": [
    { "address": "CABC…X9", "metadataCid": "bafy…" }
    // hafif liste — kart başına /airdrop/:addr/progress ayrıca çekilir
  ],
  "total": 7,
  "fetchedAt": 1718280000000
}
```

> Şekil mevcut `handleAllVestings`'in `{vestings:[{address,metadataCid}], total, fetchedAt}` çıktısıyla
> ([`indexer/src/index.ts:392-403`](../web/apps/indexer/src/index.ts)) **birebir aynı kalıp**
> (`vestings`→`campaigns`). Owner listesi de aynı şekil; `total` registry'deki gerçek sayı (sayfa-kesik
> değil, mevcut `handleOwnerVestings` gibi, `total: deployments.length` [`indexer/src/index.ts:433`](../web/apps/indexer/src/index.ts)).

### 7.3 `GET /v1/ipfs/bafy…/claim-list`

```jsonc
{
  "v": 1,
  "network": "testnet",
  "airdrop": "CABC…X9",
  "token": "CDEF…U2",
  "root": "9f3c…<hex64>",              // 32B = 64 hex (02-contract-spec §6)
  "recipientCount": 1240,
  "claims": [
    { "index": 0, "address": "GABC…7K4Z", "amount": "1000000" }
    // proof[] kasıtlı dışarıda — dashboard tablosu için gereksiz
  ],
  "fetchedAt": 1718280000000
}
```

### 7.4 `GET /v1/testnet/airdrop/C…/config`

```jsonc
{
  "admin": "GOWNER…", "token": "CDEF…U2",
  "merkleRoot": "0x9f3c…", "total": "84200000000000",
  "deadline": "1788307200", "locked": true,
  "fetchedAt": 1718280000000
}
```

Tüm cevaplar `fetchedAt: Date.now()` taşır (mevcut worker'ın her handler'ında olduğu gibi,
[`indexer/src/index.ts:399,475`](../web/apps/indexer/src/index.ts)) — UI "X sn önce güncellendi" +
stale-tespiti için.

---

## 8. Güvenlik, doğrulama ve geriye-dönük uyum

| Konu | Karar | Kaynak |
|---|---|---|
| Adres/CID doğrulaması | Mevcut `assertAddress`/`validateCid`/`validateHex32` aynen ([`indexer/src/index.ts:1076,1121,1135`](../web/apps/indexer/src/index.ts)) | indexer reuse |
| CID-bytes doğrulama | claim-list IPFS'ten `verifyCidAgainstBytes` ile authenticate (mevcut, [`indexer/src/index.ts:1027`](../web/apps/indexer/src/index.ts)); doğrulanamazsa `UNVERIFIED_HEADER` → TTL kısaltılır ([`indexer/src/index.ts:350-352`](../web/apps/indexer/src/index.ts)) | indexer reuse |
| CORS | Mevcut `buildCorsHeaders` (allow-list, asla `*`, [`indexer/src/index.ts:1166-1183`](../web/apps/indexer/src/index.ts)) | indexer reuse |
| Rate-limit | Mevcut `REQUEST_LIMITER` per-IP ([`indexer/src/index.ts:170-176`](../web/apps/indexer/src/index.ts)); progress fan-out (sayfalı `claimed_statuses` + `getEvents`) yüksek → limiter **kritik** | indexer reuse + uyarı |
| Factory `:addr` doğrulaması | env-factory ile eşleşmeli ya da cache-key'e folded (§4) | yeni |
| `recipientCount` güveni | **On-chain doğrulanmaz** (event metadata, [02-contract-spec §2.3](02-contract-spec.md)); `claimedFraction` paydası olarak kullanılır ama "toplam fon" için `total`/`contractBalance` esastır | 02-contract-spec |
| Mevcut route'lar | **Sıfır değişiklik** — airdrop ailesi ek; vesting/factory/ipfs route'ları korunur | bu doküman |
| ABI invariant | İki yeni kontrat bağımsız → VK-redeploy tetiklenmez ([02-contract-spec §9](02-contract-spec.md), CLAUDE.md invariant) | CLAUDE.md |

> **`recipientCount` paydası tuzağı:** `claimedFraction = claimedCount / recipientCount` paydası
> event-metadata'dan gelir ve on-chain garanti değildir. Owner yanlış `recipient_count` yayınlarsa bar
> yanıltır → dashboard ayrıca **`contractBalance`/`total`** mutlak değerlerini göstermeli (fon esaslı
> doğruluk). claim-list'ten türetilen `recipientCount` (§4.3 `claims.length`) event'tekiyle
> çapraz-doğrulanabilir. (`recipientCount` `config()`'te bulunmaz, [02-contract-spec §3.2](02-contract-spec.md).)

> **Fonlama modeli (doğrulanmış repo gerçeği):** Kampanya fonlaması düz `transfer` değil,
> **`transfer_from` allowance-pull**'dur: factory `spender`, owner `from`, instance `to`
> (`token::TokenClient::transfer_from(spender=factory, from=owner, to=instance, total)`,
> [`factory/src/lib.rs:206-221`](../contracts/soroban/zarf/factory/src/lib.rs)). Owner deploy'dan önce
> factory'ye `approve` verir. Indexer salt-okuyucu olduğundan bunu **gözlemler** (event'ten `total`,
> `token.balance(instance)`'tan canlı bakiye), **uygulamaz**; ama dashboard "fonlama bekliyor / eksik
> fonlama" durumunu `contractBalance < total` ile gösterebilir.

> **Claim atomikliği (doğrulanmış repo gerçeği):** Kontrat `claim`'de `set_claimed`'i **transfer'dan
> ÖNCE** yapar ve transfer guard'ı düşerse bit'i **açıkça geri alır** (`set=false` rollback,
> [`vesting/src/lib.rs:360-397`](../contracts/soroban/zarf/vesting/src/lib.rs) deseni); atomik-revert'e
> güvenmez. Payout `MuxedAddress`'e gider (`let to: MuxedAddress = (&claimant).into()`,
> [`vesting/src/lib.rs:380-381`](../contracts/soroban/zarf/vesting/src/lib.rs)). İki-taraflı (kontrat-/
> alıcı+) balance guard uyuşmazsa `TokenTransferMismatch`. Indexer bunu doğrudan kullanmaz; ama
> "committed bir `Claimed` event'i kesindir" varsayımı (mevcut `readClaimedFlags` notu,
> [`indexer/src/index.ts:801-808`](../web/apps/indexer/src/index.ts)) bu rollback semantiğine dayanır:
> `false` yazımları yalnız **revert eden** tx'lerin hata yollarında olur, kalıcı `Claimed` event'i =
> başarılı claim.

> **Yaprak = düz keccak256 (doğrulanmış repo gerçeği):** Airdrop leaf'i `keccak256(...)`'in **ham**
> çıktısıdır; vesting/factory'deki BN254 scalar indirgemesi (`BnScalar::from_bytes(...).to_bytes()`,
> [`vesting/src/lib.rs` recipient_field](../contracts/soroban/zarf/vesting/src/lib.rs)) airdrop'a
> **miras geçmez** ([02-contract-spec §5](02-contract-spec.md)). Indexer'ı doğrudan ilgilendirmez
> (Merkle proof doğrulaması claim app'te), ama claim-list `format` alanı bu sözleşmeyi pinler.

> **Sayısal işaretleme (skeptik):** Dashboard "per-claim fee ~0.01–0.03 XLM" gibi metinler gösterebilir
> ([05-economics](05-economics-cost-model.md); ana plan §0.9), ama bunlar **ağ-/piyasa-bağlı**
> ve indexer veri modelini bağlamaz — yalnız UI metni. Base fee `100 stroop/op` (`BASE_FEE`,
> [`indexer/src/index.ts:913-915`](../web/apps/indexer/src/index.ts) simulate fee'si) bir protokol
> tabanıdır, ama gerçek ücret piyasa-bağlıdır. Trustline reserve, base reserve ve ~180 günlük TTL
> tavanı ([`factory/src/lib.rs:15-22`](../contracts/soroban/zarf/factory/src/lib.rs) yorum-alıntısı)
> gibi ağ-parametreleri **dağıtım anında doğrulanmalı** ([02-contract-spec §1.1, §8](02-contract-spec.md));
> bu doküman bunları kesin sayı olarak vermez.

---

## 9. Implementasyon notları (özet)

1. Yeni route ailesi `web/apps/indexer/src/index.ts`'e eklenir; mevcut `withEdgeCache`/`simulate`/
   `getNetworkConfig`/`scMap*`/IPFS yardımcıları **aynen** kullanılır — yeni bağımlılık yok.
2. `getEvents` ilk kez bu worker'a girer (mevcut kod yalnız `simulate`+`getLedgerEntries` kullanıyor,
   [`indexer/src/index.ts:907-929,822`](../web/apps/indexer/src/index.ts)); `rpc.Server(cfg.rpcUrl).getEvents({...})`
   `data` skill desenine dayanır ([`data/SKILL.md:153-172`](../../.claude/skills/data/SKILL.md)).
   **getEvents yanıt cursor'ı/`ledger`/`txHash` alanları SDK sürümüne karşı doğrulanmalı** (§2.4, §3.2,
   §5.2 — skill bunları belgelemez).
3. `progressResponseTtl` mevcut `claimedResponseTtl` deseninin kopyasıdır
   ([`indexer/src/index.ts:378-385`](../web/apps/indexer/src/index.ts)).
4. **`now`/status:** `getLatestLedger` timestamp döndürmediğinden ([`data/SKILL.md:86-87`](../../.claude/skills/data/SKILL.md)),
   `status='expired'` için ledger kapanış-zamanı kaynağı seçilmeli ve **doğrulanmalı** (§3.4); kesin
   `Expired` gating zaten on-chain `claim`'dedir.
5. pin-proxy `validateClaimList` airdrop şeması için genişletilir/yeni-route alır
   ([`pin-proxy/src/index.ts:236-253`](../web/apps/pin-proxy/src/index.ts)) — bu **ayrı dokümanda**
   işlenir; indexer extraction route'u pin'den bağımsız (salt-okur).
6. v1 stateless yeterli; kalıcı zaman-serisi v2 (Durable Object/KV veya Mercury/Hubble, §6.3).
7. Drift gate'leri: worker'da `console.*` mevcut kodda `console.warn/error` ile geçer
   ([`indexer/src/index.ts:305,422`](../web/apps/indexer/src/index.ts) — worker'lar `@zarf/core/utils/log`
   gate'inden muaf, CLAUDE.md "app/component code"); yeni kod aynı tarzı izler. `check:any` için boundary
   decode'lar `scValToNative` etrafında tiplenir.

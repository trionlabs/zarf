# Zarf Airdrop Aracı — Operasyon & Deploy Runbook

> Hedef: `zarf/airdrop` (instance) + `zarf/airdrop-factory` (factory) iki yeni
> bağımsız crate'i ve `airdrop-create` + `airdrop-claim` SvelteKit app'lerini
> **üretime taşımak ve canlı tutmak** için operasyon prosedürleri. Bu doküman ana
> planın **§12-M7** ve **§14** maddelerini karşılar: CI matrisi, deploy sırası,
> pin-proxy engelinin çözümü, kampanya operasyonu, **dormant-kampanya TTL diriltme**
> (kritik), monitoring, incident-response ve testnet→mainnet cutover checklist'i.
> Format `docs/runbooks/circuit-redeploy-cutover.md`'den miras alınır; her Stellar
> iddiası `soroban`/`dapp`/`data` skill'lerine + repoya dayandırılır.
> ZK/verifier/registry/vesting çekirdeğine **dokunulmaz** (risk izolasyonu, §1).

---

## 0. Doğrulama notu — repo-gerçeği vs. önerilen yüzey (BAĞLAYICI)

Bu runbook iki katmanı **net ayırır**, çünkü karıştırılırsa operatör mevcut kontratta
olmayan bir davranışa güvenir:

**A) Repo'da DOĞRULANMIŞ gerçekler** (mevcut `factory`/`vesting` koduna birebir bakıldı):

1. **Fonlama = `transfer_from` (allowance-pull), düz `transfer` DEĞİL.** Repo factory'si
   `token::TokenClient::transfer_from(spender=factory, from=owner, to=instance, total)`
   kullanır (`contracts/soroban/zarf/factory/src/lib.rs:206-213`). Owner **`create_and_fund_vesting`'ten
   ÖNCE** factory'ye SEP-41 `approve` (allowance) vermek **zorundadır**. Pozitif test
   `factory/tests/factory.rs:241` (`create_and_fund_vesting_consumes_factory_allowance`,
   `approve` `:250`); allowance **eksik** senaryosu ayrı bir testtir:
   `failed_funding_does_not_track_deployment` (`factory.rs:272-307`) — pull fail eder, bakiye 0
   kalır, deployment **track edilmez**. airdrop-factory bu deseni miras alır → §4.
2. **claim atomik-revert'e güvenmez; AÇIK rollback yapar.** Sıra: `set Claimed=true`
   (`vesting:364-366`) → `verify_proof` başarısızsa `Claimed=false` geri yazılır
   (`vesting:368-373`) → transfer + per-claim **çift-yönlü balance guard**
   (`vesting:378-397`); fark `amount` değilse `Claimed=false` geri yazılır (`:393-395`) ve
   `TokenTransferMismatch` döner. Bu, monitoring'de "claimed işaretli ama transfer yok"
   alarmını **gereksiz** kılar (§7).
3. **Payout `MuxedAddress`'e gider:** `let to: MuxedAddress = (&recipient).into();
   token_client.transfer(&contract_address, &to, &amount)` (`vesting:380-381`).
4. **Factory wasm'i GÖMMEZ:** `wasm_hash: BytesN<32>` saklar, instance wasm'ı ağa AYRI
   yüklenir; deploy `deployer().with_current_contract(salt).deploy_v2(wasm_hash, args)`
   (`factory:316-332`); salt **owner+salt bağlı** (`keccak256(owner.to_xdr || salt)`,
   `factory:460-464`).
5. **Proof, instance adresine değil `(merkle_root, audience_hash)`'e bağlıdır**
   (`factory:62-66,382-393`); aynı root'lu iki kampanya aynı proof'u kabul eder. Factory bunu
   `UsedRoot` rezervasyonuyla kapatır (`reserve_merkle_root`, `factory:394-407`):
   factory-oluşturulmuş iki kampanya **asla** bir root paylaşamaz. airdrop-factory bunu miras
   alır → §1 izolasyon, §6 Adım 1.
6. **TTL sabitleri:** `DAY_IN_LEDGERS=17_280`, `TTL_EXTEND_TO=120×DAY (=2_073_600)`,
   `TTL_THRESHOLD=TTL_EXTEND_TO−DAY` (`factory:14-22`, vesting'de aynen `vesting:25-33`).
   `MAX_PAGE_LIMIT=80` **factory range-read** kapasitesidir (`factory:27`); `MAX_CLAIMED_BATCH=64`
   **vesting claimed-status batch** kapasitesidir (`vesting:41`) — ikisi farklı.
7. **Toolchain:** `soroban-sdk=26.0.0-rc.1` (`default-features=false`, `["alloc"]`),
   target `wasm32v1-none` (CLAUDE.md; `ci.yml:26`).

**B) Bu runbook'un ÖNERDİĞİ, repo'da HENÜZ OLMAYAN yüzey** (ana plan §4.4; yeni
`zarf/airdrop` crate'inde uygulanacak):

- `withdraw_unclaimed` / `Withdrawn` event'i, `deadline`, `locked` bayrağı, `config()` getter'ı
  ve `create_airdrop(...)` imzası **mevcut repo vesting+factory'sinde YOKTUR** (kod tarandı:
  `vesting/src/lib.rs`'de `withdraw`/`deadline`/`locked`/`config` eşleşmesi yok). Repo factory'si
  yalnızca `create_vesting` ve `create_and_fund_vesting(owner, token, salt, name, description,
  merkle_root, audience_hash, recipient_count, total_amount, metadata_cid)` sunar
  (`factory:132-187`). Bu runbook'ta bu öğeler her geçtiğinde **"(önerilen)"** işaretlidir;
  operatör bunları mevcut kontrat garantisi sanmamalı.

---

## 1. Kapsam ve izolasyon

| Boyut | Zarf çekirdek (mevcut, DOKUNULMAZ) | Airdrop aracı (bu runbook) |
|---|---|---|
| Crate'ler | `verifier`, `jwk-registry`, `vesting`, `factory` | **`zarf/airdrop`**, **`zarf/airdrop-factory`** (önerilen) |
| Web | `create`, `claim`, `landing`, Workers | **`airdrop-create`**, **`airdrop-claim`** + pin-proxy reuse |
| Toolchain | `soroban-sdk=26.0.0-rc.1`, `wasm32v1-none` | **aynı** (`default-features=false`, `["alloc"]`) |
| Off-chain | claim-list (merkleRoot+leaves+schedule) | claim-list (**root+claims[]**, schedule yok) → §5 |

Airdrop deploy hattı çekirdek deploy hattıyla **kesişmez**: ayrı wasm hash'ler, ayrı factory
adresi, ayrı `VITE_*` değişkenleri. Bir kampanyanın hatası diğer ürünü etkilemez. Çekirdekten
miras alınan kritik bir güvenlik invariantı: proof instance adresine değil
`(merkle_root, audience_hash)`'e bağlıdır; airdrop-factory **mutlaka** `UsedRoot` tarzı root
rezervasyonunu (`factory:394-407`) miras almalı, yoksa aynı root'lu iki kampanya aynı proof'u
kabul eder (§0-A.5).

---

## 2. CI — iki yeni crate'i matrise ekleme

Mevcut `.github/workflows/ci.yml` `soroban` job'ı **döngü** ile crate listesi gezer
(rustfmt `ci.yml:40-47`, clippy `:51-57`, audit `:127-133`). Airdrop crate'leri **aynı desene**
eklenir; tek özel kural **build sırası**.

### 2.1 Build sırası (kritik — vesting↔factory ile aynı bağımlılık)

`airdrop-factory` testleri, instance wasm'ını `deploy_v2(wasm_hash, …)` üzerinden tükettiği için
(repo factory'sinde `deploy_vesting` aynı şekilde `VestingWasmHash` okur, `factory:312-332`)
**önce `zarf/airdrop` `--release` derlenmeli**, sonra factory testi koşar. Bu, repo'daki "factory
test needs the vesting wasm built first" notunun (CLAUDE.md) airdrop ikizi:

```
1) cargo build --manifest-path contracts/soroban/zarf/airdrop/Cargo.toml \
       --target wasm32v1-none --release            # ÖNCE instance wasm
2) cargo build --manifest-path contracts/soroban/zarf/airdrop-factory/Cargo.toml \
       --target wasm32v1-none --release            # sonra factory wasm
3) cargo test  --manifest-path contracts/soroban/zarf/airdrop-factory/Cargo.toml
```

> Not: Repo'da `factory` testleri, derlenmiş `vesting` wasm'ına `tests/`'ten erişir (build
> adımı `ci.yml:62-66` tüm Zarf wasm'larını `--release` üretir, test adımları sonra koşar
> `:71-78`). Airdrop ikizinde **build adımına instance'ı factory'den ÖNCE** koymak yeterli.

### 2.2 `ci.yml` `soroban` job'ına eklenecek diff

| Adım (mevcut, `ci.yml`) | Airdrop eklemesi |
|---|---|
| Rustfmt döngüsü (`:40-47`) | iki crate path'ini listeye ekle (`--check`) |
| Clippy döngüsü (`:51-57`) | iki crate path'i (`--all-targets -- -D warnings`) |
| "Build Zarf contract WASMs" (`:62-66`) | **instance ÖNCE**, sonra factory (yukarıdaki sıra) |
| Test adımları (`:68-78`) | "Test airdrop instance" + "Test airdrop factory" (factory **build sonrası**) |
| `cargo-audit` döngüsü (`:127-133`) | iki crate'in `Cargo.lock`'unu listeye ekle |

> Not: `rust-cache` workspaces listesi (`ci.yml:32-36`) yalnızca dört çekirdek crate'i içerir;
> airdrop crate'leri eklenirse buraya da iki path eklenir (yoksa cache miss, fonksiyonel sorun değil).
> `audit` adımı `continue-on-error: true` ile çalışır (`ci.yml:125`); airdrop crate'leri aynı
> triaj politikasını miras alır. Clippy/rustfmt **bloklayıcı** kalır — airdrop kodu da
> `-D warnings` temiz olmalı (CLAUDE.md: `unwrap`/`panic` yok, typed `#[contracterror]` + `Result`).

### 2.3 Web tarafı CI (mevcut `web` job, `ci.yml:149-237`)

İki yeni app mevcut check/build/budget/smoke adımlarına eklenir:

```yaml
# "Check Svelte apps" (ci.yml:195-199) altına:
pnpm --dir web --filter @zarf/airdrop-create check
pnpm --dir web --filter @zarf/airdrop-claim  check
# "Build … app" blokları (ci.yml:218-225) — iki build hedefi ekle
# check:budget (ci.yml:227-228) + smoke:routes (ci.yml:235-236) otomatik kapsar
```

CI `VITE_*` env'i halihazırda testnet defaultlarını set ediyor (`ci.yml:155-159`,
`VITE_STELLAR_TESTNET_FACTORY_ADDRESS` dahil); airdrop app'leri için **çekirdekten ayrı** bir
**`VITE_STELLAR_TESTNET_AIRDROP_FACTORY_ADDRESS`** placeholder'ı (`ci.yml:159` deseni) eklenmeli.
`check:any`/`check:console`/`check:budget` drift gate'leri (`ci.yml:208-212,227-228`) iki app'i de
otomatik kapsar.

> Not (doğrulanmalı): Merkle hashing için `@noble/hashes/sha3` saf-TS'tir ve teorik olarak
> `check:budget`'ı kırmamalı; ancak bundle bütçesi gerçek değerlerle build sonrası ölçülür
> (`check:budget` manifest + immutable asset gerektirir, `ci.yml:217` notu) — bu yüzden gerçek
> etki **build çıktısında doğrulanmalı**, baştan "kırmaz" varsayılamaz.

---

## 3. Deploy mimarisi — wasm upload → factory deploy → kampanya

Factory wasm'ı **embed etmez**; `wasm_hash: BytesN<32>` saklar, instance wasm'ı ağa **ayrı**
yüklenir, deploy `deployer().with_current_contract(salt).deploy_v2(...)` ile yapılır
(repo deseni: `factory:316-332`; salt = `keccak256(owner.to_xdr || salt)`, `factory:460-464`).
Üç katmanlı sıra:

```
A) instance WASM'ı ağa yükle (bir kez / wasm değişince):
   stellar contract upload --wasm target/wasm32v1-none/release/zarf_airdrop.wasm \
     --source <deployer> --network <net>           # → AIRDROP_WASM_HASH (BytesN<32>)

B) factory'yi deploy et (bir kez / ağ başına):
   stellar contract deploy  --wasm target/wasm32v1-none/release/zarf_airdrop_factory.wasm \
     --source <deployer> --network <net> -- --airdrop_wasm_hash <AIRDROP_WASM_HASH>
                                                   # → AIRDROP_FACTORY_ADDRESS (C…)

C) kampanya başına (operatör veya UI):
   approve(owner→factory)  →  create_airdrop(...)  →  pin claim-list  →  link/QR   (§6)
```

`stellar contract upload` ile `deploy`'un **ayrı** komutlar olduğu skill'de doğrulanmıştır
(`soroban` skill, "Upload contract code (separate from deployment)", skill `:924-929`). Factory
`__constructor` ile atomik init olur; `soroban` skill kuralları (skill `:160-164`): ad tam
`__constructor`, dönüş `()`, başarısızlıkta deploy **atomik fail eder**. (Repo çekirdek
factory'sinin constructor'ı `(verifier, jwk_registry, vesting_wasm_hash)` alır, `factory:92-104`;
airdrop-factory constructor imzası **önerilen** olarak `(airdrop_wasm_hash, …)` olacaktır.)

### 3.1 Web app deploy (Cloudflare/SvelteKit)

İki app mevcut `create`/`claim` build hattını miras alır. Gereken `VITE_*` (build-time, public):

| Değişken | Anlam | Kaynak |
|---|---|---|
| `VITE_STELLAR_DEFAULT_NETWORK` | `testnet`/`mainnet` | GitHub vars (mevcut, `ci.yml:156`) |
| `VITE_STELLAR_<NET>_RPC_URL` | RPC endpoint | mainnet = provider-specific (`data` skill `:50-55`; SDF mainnet RPC sağlamaz) |
| `VITE_STELLAR_<NET>_HORIZON_URL` | trustline/balance lookup | `data` skill endpoint tablosu (`:183-189`) |
| `VITE_STELLAR_<NET>_AIRDROP_FACTORY_ADDRESS` | factory `C…` (B adımı çıktısı) | deploy sonrası set |
| `VITE_PIN_PROXY_URL` | pin-proxy worker origin | mevcut worker (§5) |

> **Yeni `wrangler secret` GEREKMEZ.** Claim-list **public**'tir (proof'lar zararsız — token
> isolation, ana plan §4.1/§10). pin-proxy'nin Pinata JWT'si zaten **mevcut** secret'tir
> (`pin-proxy/src/index.ts:12-13,30` `PINATA_JWT`, `wrangler secret put`); airdrop için yeni sır
> eklenmez. mainnet RPC URL'i **sır değil var**'dır (`dapp` skill `:68-75`, `data` skill `:50-55`:
> provider-specific public endpoint).

---

## 4. Kontrat ön-koşulu — allowance (her kampanya, atlanırsa fonlama fail)

Repo factory'si fonlamayı **`transfer_from`** ile çeker (`factory:206-213`); bu, owner'ın
**önceden** factory'ye SEP-41 `approve` (allowance) vermesini şart koşar. Repo testleri bunu
iki yönden pinler:

- **Pozitif:** `create_and_fund_vesting_consumes_factory_allowance` (`factory.rs:241`),
  `token_client.approve(&owner, &factory_id, &amount, &1000)` (`:250`) → fonlama başarılı,
  bakiye `amount` (`:267`).
- **Negatif (allowance YOK):** `failed_funding_does_not_track_deployment` (`factory.rs:272-307`)
  → `approve` çağrılmaz, `try_create_and_fund_vesting` **err** döner (`:299-302`), owner bakiyesi
  korunur, predicted instance bakiyesi 0, deployment **track edilmez** (`:303-307`).

Operasyonel kural (airdrop-factory'nin fonlu create varyantı, repo `create_and_fund_vesting`
şablonunu izler):

```
# create_airdrop'tan (önerilen funded variant) ÖNCE, owner imzasıyla:
token.approve(from=owner, spender=AIRDROP_FACTORY_ADDRESS,
              amount=Σ(claims.amount), expiration_ledger=<yakın gelecek>)
```

- `amount` **tam olarak** kampanya total'i (= Σ claim miktarı) olmalı; create app bunu canlı
  Σ'dan hesaplar.
- `expiration_ledger` SEP-41 allowance'ın **ledger-bazlı** süresidir (repo testinde `&1000`,
  `factory.rs:250`). create app'in approve+create adımları arasındaki süreyi kapsayacak kadar
  ileri olmalı. Pratik dönüşüm: `DAY_IN_LEDGERS=17_280` → ~5 sn close varsayımıyla ~720
  ledger/saat (**close-time varsayımı doğrulanmalı**; ağ close-time değişirse oran kayar).
  Allowance süresi fonlamadan dolarsa fonlama fail eder → kullanıcıya net hata (§6 kontrol).
- Atomik fonlama guard'ı: factory `transfer_from` öncesi/sonrası instance bakiyesini ölçer,
  fark `total` değilse `TokenTransferMismatch` (`factory:214-221`). **fee-on-transfer/rebasing**
  token'larda sessiz eksik-fonlamayı yakalar; eksik-fonlanmış kampanyada son claim'ciler
  düşeceği için kritik.

---

## 5. pin-proxy ENGELİ — airdrop şemasını kabul ettirme (somut değişiklik)

Mevcut `validateClaimList` (`pin-proxy/src/index.ts:236-253`) **zarf-çekirdek şemasını** zorlar:
`merkleRoot` (`HEX_32`, `:240`) + **boş-olmayan** `leaves[]` (`:243`) + `schedule` (obje, `:249`)
**zorunlu**. Airdrop claim-list'i `root` + `claims[]` taşır, **`schedule` yoktur** → **mevcut
validator REDDEDER** (`missing_or_empty_leaves`; ya da alan adı `root` ise zaten
`missing_or_invalid_merkleRoot`). Router (`:81-87`) yalnızca `/pin`, `/ipfs/`, `/health` tanır.
İki çözüm; **B önerilir**.

### Seçenek A — validator'ı çok-şemalı yap (tek `/pin` route)

`validateClaimList`'i bir **ayrım (discriminator)** ile genişlet: `schedule` varsa eski şema,
`claims` varsa airdrop şeması.

```ts
// pin-proxy/src/index.ts:236 civarı — somut taslak
export function validateClaimList(body: unknown): string | null {
    if (!body || typeof body !== 'object') return 'not_an_object';
    const obj = body as Record<string, unknown>;
    const root = obj.merkleRoot ?? obj.root;            // her iki şema da kök taşır
    if (typeof root !== 'string' || !HEX_32.test(root)) return 'missing_or_invalid_root';

    if (Array.isArray(obj.claims)) {                    // AIRDROP şeması
        if (obj.claims.length === 0) return 'empty_claims';
        // her claim: { address: 'G…/C…', amount: '<i128 string>', proof: hex32[] }
        return null;                                    // schedule ARANMAZ
    }
    // …mevcut zarf-çekirdek dalı (leaves[] + schedule) aynen korunur…
}
```

> **Dikkat (A'nın asıl riski):** `validatePinAuth` imzayı **`merkleRoot` alanı üzerinden**
> doğrular (`pin-proxy:263,298-303` — `buildPinAuthMessage(:312-325)` mesaja `merkleRoot:<…>`
> satırı koyar; çağrı `handlePin:141` `body.merkleRoot` geçer). Airdrop dalında body `root`
> taşıyorsa `merkleRoot` `undefined` olur → imza mesajı bozulur → `body_hash_mismatch`/
> `invalid_signature`. A'yı seçersen `handlePin`, `validatePinAuth` ve `buildPinAuthMessage`'in
> hepsi kök alanını şemaya göre seçmeli; bu çok dokunuş = regresyon riski.

### Seçenek B — ayrı `/pin-airdrop` route (ÖNERİLEN, izolasyon)

Çekirdek `/pin` koduna **dokunmadan** yeni route ekle (`pin-proxy:81-87` router deseni):

```ts
if (url.pathname === '/pin-airdrop' && request.method === 'POST')
    return handleAirdropPin(request, env, corsHeaders);   // ayrı validator + auth(root)
```

`handleAirdropPin`, `handlePin`'in (`:93-180`) kopyası olur; tek farklar: (1) airdrop validator
(root+claims[], schedule yok), (2) auth `obj.root` üzerinden imzalanır (kendi
`buildAirdropPinAuthMessage`'i). Rate-limit (`PIN_IP_LIMITER`/`PIN_OWNER_LIMITER`, `:98-111`),
body-limit (`:113-130`), Pinata-pin (`:154-179`) ve okuma tarafındaki CID-doğrulama
(`handleIpfsRead:182-234`, `verifyCidAgainstBytes:204`) aynen tüketilir. **Avantaj:** çekirdek
pin akışına sıfır regresyon; CLAUDE.md "drift-gated" disiplinine uygun.

> Okuma tarafı (`GET /ipfs/:cid`, `:182-234`) zaten **şemadan bağımsız** JSON döner — her iki
> seçenekte de değişiklik gerekmez. airdrop-create `VITE_PIN_PROXY_URL` + yeni path'i kullanır.

---

## 6. Kampanya runbook (her airdrop için, sırayla)

> Not: 4–7. adımlardaki `create_airdrop`, `deadline`, `locked`, `withdraw_unclaimed`
> **(önerilen)** yüzeydir (§0-B). Mevcut repo funded create'i `create_and_fund_vesting`'tir ve
> `deadline`/`locked` parametresi yoktur; airdrop instance bunları yeni crate'te uygular.

| Adım | İşlem | Doğrulama / hata kapısı |
|---|---|---|
| 1. Liste | (address, amount) → client-side Merkle (keccak256) → `root` | strkey checksum, tekrar yok, amount>0, **Σ=total** canlı; aynı root iki kampanyada kullanılamaz (factory `UsedRoot`, `factory:394-407` → `MerkleRootAlreadyUsed`) |
| 2. Token | XLM/SEP-41 (SAC) seç; klasik asset ise issuer-flag denetimi | `auth_clawback_enabled`/auth-required → **uyar/reddet** (`assets`/`soroban` skill clawback notu, soroban `:1694-1705`) |
| 3. Approve | `token.approve(owner→factory, Σ, exp_ledger)` (owner imzalar) | §4; allowance = tam Σ, exp yeterince ileri (ledger-bazlı) |
| 4. Create | `create_airdrop(...)` **(önerilen funded variant)** | simüle et (`simulateTransaction`→`assembleTransaction`, `dapp` skill `:289-301`); `TokenTransferMismatch`'e dikkat |
| 5. **Fon doğrula** | RPC ile instance bakiyesi = total mı? | `getLedgerEntries`/SAC balance (`data` skill `:90-108`); **Σ(claims)=balance** olmalı |
| 6. Pin | claim-list JSON'u `/pin-airdrop`'a POST → CID | §5; owner-imzalı pin-auth (root üzerinden) |
| 7. Yayınla | `claim-drop…/?a=<instance C…>&cid=<CID>` linki + QR | network alanı JSON'da; claim app cüzdan-ağıyla denetler |

**Fonlama doğrulaması (Adım 5) zorunlu**: factory atomik guard'ı (`factory:214-221`) geçse bile,
operatör **bağımsız** olarak `balance(instance) == total == Σ(claims[].amount)` denkliğini RPC'den
teyit etmeli. Üç sayı eşit değilse kampanya **yayınlanmamalı** (son claim'ciler düşer).

---

## 7. Monitoring (indexer / OpenZeppelin Monitor)

İki sinyal kaynağı; kampanya başına ilerleme + sağlık. Repo vesting'in yayınladığı event
`Claimed { epoch_commitment, recipient, amount }` (`vesting:406-411`); factory'nin event'i
`VestingCreated`/`vesting_created` (`factory:69-81`). Airdrop instance, ana plan §9'a göre
`AirdropCreated`/`Claimed` analoglarını yayınlayacaktır **(önerilen)**.

**Event indexer:** `getEvents` ile contract topic filtresi (`data` skill `:153-172`). Not: RPC
çoğu metodda **7-günlük** pencere (`data` skill `:176`) → kalıcı ilerleme için kendi store'una yaz.

| Metrik | Kaynak | Alarm eşiği |
|---|---|---|
| claimed/total ilerleme | `Claimed` event sayısı / kampanya recipient sayısı | — (bilgi) |
| kalan bakiye | RPC `balance(instance)` (`getLedgerEntries`, `data` skill `:90-108`) | beklenen ≠ gerçek → araştır |
| deadline geri-sayım **(önerilen alan)** | `config.deadline` − `getLatestLedger().timestamp` | <7 gün → operatöre bildir (yalnız airdrop instance `deadline` uygularsa) |
| **TTL kalan** | `getLedgerEntries` entry TTL (instance + Claimed/Config entry'leri) | `< 7×DAY_IN_LEDGERS` → §8 diriltme |

> **OpenZeppelin Monitor (Stellar alpha)** ile self-hosted izleme kurulabilir (Docker +
> Prometheus/Grafana; `soroban` skill "Security Monitoring", skill `:1862-1867`). Önerilen
> kurallar: (a) `Claimed.amount` ani sapma, (b) beklenmeyen `Withdrawn` **(yalnız önerilen
> withdraw uygulanırsa)**, (c) TTL-yaklaşıyor alarmı. Not: "claimed işaretli ama transfer yok"
> alarmına **gerek yok** — kontrat açık rollback yapar (`vesting:368-373,393-396`), yarım-durum
> oluşmaz.

**TTL alarmı kritik**: TTL'in `TTL_THRESHOLD` (`TTL_EXTEND_TO − DAY_IN_LEDGERS`, `vesting:33`/
`factory:22`) altına inmesi normal (her `claim` invocation'ı `Claimed` entry'sini ve instance'ı
re-extend eder, `vesting:399-404`); ama **dormant** kampanyada hiç `claim` gelmez → TTL serbest
düşer. Monitor bunu yakalayıp §8'i tetiklemeli.

> Sayfalama notu: claim-status sorgulamada `claimed_statuses(Vec<BytesN<32>>)` ≤ `MAX_CLAIMED_BATCH`
> (64) (`vesting:293-305`) — bu bir **(epoch_commitment listesi)** batch'idir, `(start,limit)`
> aralık-okuması DEĞİL. Factory tarafındaki `(start,limit)` aralık-okuması ayrı bir API'dir ve
> `MAX_PAGE_LIMIT` (80) ile sınırlıdır (`factory:243-257,509-511`). airdrop range-read kararı,
> entry-sayımlı kapasite mantığını (her item = bir persistent footprint entry) miras alır.

---

## 8. DORMANT-KAMPANYA TTL DİRİLTME (kritik prosedür)

**Problem.** Airdrop persistent entry'leri (`Config`, her `Claimed(commitment)`) ~120 günlük TTL
ile yaşar (`TTL_EXTEND_TO = 120 × DAY_IN_LEDGERS`, `vesting:30`/`factory:19`). Repo vesting'de
TTL re-extend **yalnızca `claim` içinde** olur (`vesting:399-404`: ilgili `Claimed` entry'si +
instance). **Read-only veya withdraw yolunda TTL extend YOKTUR.** Bu yüzden uzun uykuda hiç
`claim` gelmezse entry'ler **archival'a düşer**. Archived persistent entry **kaybolmaz**
(restore edilebilir; `soroban` skill "Persistent: survives archival, can be restored",
skill `:244-246`), ama **diriltme operasyonu olmadan** geç gelen alıcı claim edemez → fon fiilen
erişilemez. Bu, factory koddaki uyarının (`factory:16-18`: "a fully dormant factory still needs
an external ExtendFootprintTTLOp") airdrop instance'ı için **birebir** geçerli olmasıdır.

**Periyodik TTL-bakım prosedürü.**

```
SEÇENEK 1 — ucuz on-chain dokunuş (yalnızca instance TTL-extend yapan bir metoda dokunursan):
  DİKKAT: repo vesting'de yalnızca `claim` re-extend eder; `is_claimed`/`claimed_statuses`/
  `metadata_cid` READ yolları extend ETMEZ (kod tarandı). Yani bir durum-okuma çağrısı
  TTL'i UZATMAZ — meğer airdrop instance bilinçli olarak bir read metoduna extend_ttl koysun.
  Bu yüzden Seçenek 1 yalnızca yeni airdrop crate'i bu extend'i eklerse (ana plan §4.6, önerilen)
  geçerlidir; mevcut repo davranışına güvenME.

SEÇENEK 2 — ExtendFootprintTTLOp (mevcut kodla TEK kesin yol):
  stellar contract extend \
    --id <AIRDROP_INSTANCE> \
    --key-xdr <Config + her Claimed(commitment) ledger key> \
    --ledgers-to-extend <≈ 120*DAY_IN_LEDGERS = 2_073_600> \
    --durability persistent --source <maintainer> --network <net>
  → instance kod entry'si + tüm persistent veri entry'leri için TTL uzatır.
```

**Bakım takvimi (önerilen):**

| Kampanya tipi | TTL-bakım sıklığı | Yöntem |
|---|---|---|
| `deadline > 0`, yakın (<120g) **(önerilen alan)** | gerek yok | deadline'da `withdraw_unclaimed` kapatır (önerilen) |
| `deadline > 0`, uzak (>120g) **(önerilen alan)** | her ~90g | Seçenek 2 (Seçenek 1 yalnız instance read-extend eklenmişse) |
| **`locked=true, deadline=0`** (trustless, **önerilen**) | **her ~90g, kalıcı** | **Seçenek 2 (ExtendFootprintTTLOp), zorunlu** |

> **Archived'a düştüyse (diriltme):** entry archive olmuşsa, claim/extend'den önce
> `RestoreFootprintOp` ile geri yüklenir (rent ödenir), ardından TTL extend edilir. Restore de bir
> transaction'dır ve fee + rent gerektirir; bu maliyet trustless kampanyanın operatörü tarafından
> üstlenilmeli (alıcı üstlenemez — footprint restore edilmeden claim simüle olmaz). **Bu yüzden
> Seçenek 2 periyodik bakımı archival'ı baştan önlemek için tercih edilir.** Net `ledgers-to-extend`
> tavanı (~180g network max entry TTL) **doğrulanmalı** — `factory:16` "~180-day network maximum"
> der ama bu repo-yorumudur, hedef ağ sürümünde teyit et.

---

## 9. Incident-response (mevcut `docs/runbooks/` deseni)

`circuit-redeploy-cutover.md`'nin "hard gate + geri-uyum" disiplinini miras alır. Senaryo bazlı:

| Olay | Belirti | Müdahale |
|---|---|---|
| **Eksik fonlama** | Adım 5'te `balance ≠ Σ` | kampanyayı yayınlama; allowance/total'i düzelt, yeni salt ile yeniden create (salt owner-bağlı, `factory:460-464`) |
| **Yanlış token / clawback** | issuer clawback ile token'ı geri aldı | residual risk (uyarı verilmişti, §6 Adım 2); yeni kampanya farklı asset ile; alıcıları bilgilendir |
| **Dormant → archival** | claim simülasyonu footprint-not-found | §8 `RestoreFootprintOp` + extend; sonra alıcıya tekrar dene |
| **pin-proxy/CID erişilemez** | claim app JSON çekemiyor | okuma çok-gateway'li (`IPFS_READ_GATEWAYS`, `pin-proxy:60-64`); operatör CID'i yedek pin'e yeniden pinler (root değişmez, CID içerik-adresli) |
| **Yanlış ağ linki** | alıcı mainnet cüzdanla testnet linkinde | JSON `network` alanı + claim app ağ denetimi (ana plan §8); link `net` parametresi; `dapp` skill "Network mismatch" UX (skill `:681`) |
| **Factory wasm hatası** | yeni instance'lar bozuk | yeni instance wasm upload → factory'yi yeni `airdrop_wasm_hash` ile yeniden deploy (eski kampanyalar etkilenmez, kendi koduna pinli) |

**Kural (cutover runbook'tan miras):** mainnet'te herhangi bir `create` **önce testnet'te aynı
parametrelerle** koşulmadan yapılmaz; her create'ten önce `simulateTransaction` zorunlu
(`dapp` skill pitfall: simülasyon→assemble, skill `:289-301`). Withdraw kuralları **(önerilen
`locked×deadline` matrisi)** operatör panelinde **aktif/pasif** doğru render edilmeli (yanlış
buton = yanlış beklenti) — ancak bu yalnızca airdrop instance withdraw'ı uyguladığında geçerlidir.

---

## 10. Testnet → mainnet cutover checklist

`circuit-redeploy-cutover.md` formatını miras alır (hard-gate'li, sıralı).

**Ön-koşullar (kod):**
- [ ] CI yeşil: airdrop instance + factory `cargo test`/clippy/fmt/build (`wasm32v1-none`), build sırası doğru (§2.1).
- [ ] Web: `airdrop-create`/`airdrop-claim` `check`/`build`/`budget`/`smoke` geçer; `check:any`/`check:console` temiz.
- [ ] Paylaşılan Merkle vektörleri Rust↔JS **aynı root/leaf** üretir (differential test, ana plan §11) — divergence = sessiz claim fail.
- [ ] pin-proxy `/pin-airdrop` (veya çok-şemalı validator) testnet'te root+claims[] JSON'unu kabul ediyor (§5); auth **root** üzerinden doğru.

**Testnet doğrulama:**
- [ ] instance wasm upload → `AIRDROP_WASM_HASH` kaydedildi.
- [ ] factory deploy → `AIRDROP_FACTORY_ADDRESS` kaydedildi; `VITE_…_TESTNET_AIRDROP_FACTORY_ADDRESS` set.
- [ ] Uçtan uca: approve → create (funded) → fon doğrula (`balance=total`) → pin → claim (alıcı imzalar; per-claim fee **doğrulanmalı**, §11) → `is_claimed=true`.
- [ ] çift-claim → `AlreadyClaimed` (`vesting:358-360`); bozuk proof → verify_proof err + Claimed rollback (`vesting:368-373`); `deadline` sonrası → (önerilen `Expired`); withdraw matrisi (önerilen) 4 mod.
- [ ] **GATE — TTL bakımı:** §8 `ExtendFootprintTTLOp` testnet'te bir kez koşuldu; entry TTL `TTL_EXTEND_TO`'ya çıktı (`getLedgerEntries` ile teyit).

**Mainnet cutover (gate'ler geçtikten sonra):**
- [ ] mainnet RPC URL provider'dan alındı (`VITE_STELLAR_MAINNET_RPC_URL`; SDF mainnet RPC sağlamaz, `data` skill `:50-55`).
- [ ] instance wasm upload (mainnet) → hash → factory deploy (mainnet) → `VITE_…_MAINNET_AIRDROP_FACTORY_ADDRESS`.
- [ ] **Yeni `wrangler secret` YOK** doğrulandı (claim-list public; Pinata JWT mevcut, `pin-proxy:12-13,30`).
- [ ] İlk mainnet kampanyası **küçük total + yakın deadline + `locked=false`** ile smoke (riskli trustless modu sonraya — yalnız bu modlar airdrop instance'ta uygulandıysa).
- [ ] Monitoring devrede: indexer/`Claimed` izleme + TTL alarmı (§7); trustless kampanyalar için §8 bakım takvimi planlandı.
- [ ] Rollback planı: factory wasm hatası → yeni hash ile yeniden deploy; eski kampanyalar kendi koduna pinli, etkilenmez.

---

## 11. Sayısal işaretler ve "doğrulanmalı" notları

| Büyüklük | Değer | Kaynak / durum |
|---|---|---|
| `DAY_IN_LEDGERS` | 17_280 | `factory:14` / `vesting:25` (sabit) ✓ |
| `TTL_EXTEND_TO` | `120 × DAY_IN_LEDGERS` (=2_073_600) | `factory:19` / `vesting:30` (sabit) ✓ |
| `TTL_THRESHOLD` | `TTL_EXTEND_TO − DAY_IN_LEDGERS` | `factory:22` / `vesting:33` (sabit) ✓ |
| `MAX_PAGE_LIMIT` | 80 (entry, byte değil) — **factory range-read** | `factory:23-27,509-511` (sabit) ✓ |
| `MAX_CLAIMED_BATCH` | 64 (entry) — **vesting claimed-status batch** | `vesting:34-41,297` (sabit) ✓ |
| Base fee | 100 stroop/op | **Stellar protokol bilgisi** (skill-kaynaklı DEĞİL); `dapp`/`assets` skill yalnız `StellarSdk.BASE_FEE` sabitini kullanır (dapp `:249,282`), 100 stroop demez |
| Per-claim fee | ~0.01–0.03 XLM | **doğrulanmalı** — skill/repo'da yok; hedef ağda `--sim` ile profil çıkarılmalı |
| Network max entry TTL | ~180 gün | **doğrulanmalı** — `factory:16` repo-yorumu (hedef ağ sürümü) |
| Trustline reserve | ~0.5 XLM | **doğrulanmalı** — skill/repo'da sabit değil |
| `expiration_ledger` ~+720 ledger/saat | DAY/24 = 720 | aritmetik tutarlı; **~5 sn close varsayımı doğrulanmalı** |
| `soroban-sdk` | `26.0.0-rc.1` (`default-features=false`, `["alloc"]`) | CLAUDE.md ✓ |
| Target | `wasm32v1-none` | CLAUDE.md / `ci.yml:26` ✓ |

> "doğrulanmalı" büyüklükler deploy öncesi hedef ağda `stellar contract invoke --sim` (resource
> profiling, `soroban` skill `:1339-1354`) ile teyit edilmeli. Uydurma rakam tutulmadı; emin
> olunamayan her değer açıkça işaretli.

---

## 12. CLAUDE.md'ye yansıyacak değişiklikler (özet)

- "Common commands → Contracts": `zarf/airdrop` + `zarf/airdrop-factory` test/build satırları;
  **"factory testi için önce airdrop instance wasm `--release`"** notu (vesting↔factory ile aynı).
- "Common commands → Web": `airdrop-create`/`airdrop-claim` `check`/`build` satırları.
- "Load-bearing invariants": **Merkle hashing kontrat↔JS bit-bit aynı** olmalı (paylaşılan vektör);
  divergence en büyük sessiz-bug kaynağı. Ayrıca: proof `(merkle_root, audience_hash)`'e bağlı,
  instance'a değil → airdrop-factory **`UsedRoot` rezervasyonunu** (`factory:394-407`) miras almalı.
- Bu runbook'a (`docs/runbooks/08-operations-runbook.md`) kampanya akışı + **TTL diriltme** linki.

# Zarf Airdrop Aracı — UI/UX Derin: Yerleşim, Gerekçe, Akış

> Hedef: "UI nerede yaşar, neden orada, UX nasıl" sorusunu uçtan uca yanıtlamak.
> İki ayrı SvelteKit app (`web/apps/airdrop-create` + `web/apps/airdrop-claim`),
> `@zarf/ui` bileşen/Zen-token reuse'ü, mevcut `create`/`claim` desenlerinden **bilinçli
> miras + üç noktada ayrılış**. Bu doküman ana planın §15'ini
> (`plans/airdrop_tool/airdrop-tool-design.md:421`) **temel alır ve genişletir** — tekrar etmez. Her
> Stellar/Soroban iddiası `dapp` SKILL'e ya da repo dosyasına dayanır; SKILL'de geçmeyen
> sayısal değerler **"doğrulanmalı"** ile işaretlenir.
> Ürün: ZK/e-posta çekirdeğinden AYRI, cüzdan-adresi + Merkle-claim aracı. ZK yok, gizlilik yok.

> **Doğrulama notu (adversarial review).** Bu sürümde taslaktaki birkaç repo-iddiası
> düzeltildi. En kritik olanı: mevcut **`WizardSteps` 3 adımlıdır** (`Token/Create/Deploy`,
> `WizardSteps.svelte:6-10`), 4 değil; "4 adım" olan şey **`step-2` içindeki deploy
> mikro-stepper'ıdır** (`Prepare/Backup/Approvals/Deploy`, `wizard/step-2/+page.svelte:106`).
> "Backup'ı sil → 4→3" indirgemesi **bu mikro-stepper'a** aittir, wizard'a değil. Ayrıntılar §3, §7.

---

## 1. Yerleşim & mimari — UI nerede yaşar, neden orada

### 1.1 İki ayrı app, tek monorepo

UI iki bağımsız SvelteKit uygulamasına bölünür, ikisi de `web/apps/` altında, mevcut
`create`/`claim` ile aynı seviyede (doğrulandı: `web/apps/` = `claim, create, indexer,
jwk-rotation, landing, pin-proxy`; airdrop app'leri henüz yok):

| App | Konum | Kullanıcı | Oturum modeli | Deploy hedefi |
|---|---|---|---|---|
| **airdrop-create** | `web/apps/airdrop-create` | Gönderen (kampanya sahibi) | Cüzdan + localStorage draft | `drop.zarf.to` |
| **airdrop-claim** | `web/apps/airdrop-claim` | Alıcı | Cüzdan (oturumsuz, URL-parametrik) | `claim-drop.zarf.to` |

**Neden ayrı app (mevcut Zarf'taki `create`/`claim` ikilisini yansıtır):**

1. **Blast-radius / risk izolasyonu.** Create app, alıcı listesi + cüzdan-imzalı fonlama
   içerir; claim app herkese açık, yüksek-trafik, anonim bir uçtur. Ayrı bundle =
   create tarafındaki bir regression claim'i düşürmez. Mevcut repo de tam olarak bunu
   yapıyor (`apps/create` ↔ `apps/claim` ayrı SvelteKit projeleri, doğrulandı).
2. **Bağımsız deploy.** Claim app, kampanya yayına alındıktan sonra **değişmemeli** (linkler
   dağıtıldı); create app ise iterasyona açık. Ayrı Cloudflare Pages deploy hattı ikisini
   bağımsız sürümler.
3. **Farklı oturum modeli.** Create = "gönderen + cüzdan + kalıcı draft" (localStorage'da
   liste saklanır — adres public, PII yok). Claim = "alıcı + cüzdan, oturum yok" — durum
   tamamen URL'den ve cüzdandan türer. İki modeli tek app'te taşımak, mevcut `claim`
   app'inin taşıdığı `authStore` (Google/PIN) bağımlılığını da getirirdi; bu araçta
   **`authStore` hiç yüklenmez** (§2).
4. **Bundle ağırlığı.** Create app, RecipientGrid + CSV + Merkle ağaç-inşası taşır; claim
   app sadece proof-arama + tek tx imzalar. Ayrı bundle, claim'i hafif tutar — claim'in
   satış argümanı hız (ana plan §15, `plans/airdrop_tool/airdrop-tool-design.md:425-428`).

### 1.2 Domain stratejisi — neden ayrı subdomain

Ana plan `drop.zarf.to` / `claim-drop.zarf.to` öneriyor (`plans/airdrop_tool/airdrop-tool-design.md:50`).
Ayrı subdomain'in UX gerekçesi:

- **Zarf core'dan güven/karışıklık ayrımı.** Zarf çekirdeği "gizlilik + ZK" sözü verir;
  bu araç vermez (açık liste). Aynı host altında iki güven modeli kullanıcıyı yanıltır.
  `drop.*` alt-markası "bu klasik airdrop" sinyalini net verir.
- **Phishing yüzeyi.** Claim linkleri sosyal medyada dağıtılır; sabit, tanınır bir
  `claim-drop.zarf.to` host'u, kullanıcının "doğru yerdeyim" doğrulamasını kolaylaştırır.
- **Origin izolasyonu.** Create ve claim'in farklı host'u, bir create-XSS'inin claim
  storage/wallet-izin defterine erişememesini sağlar. Wallet izni origin-bazlı saklanır;
  ayrı origin = ayrı izin yüzeyi.

### 1.3 Route yapısı

**Create (wizard, mevcut `create` route iskeletini miras alır** —
`apps/create/src/routes/wizard/step-{0,1,2}/+page.svelte` ve `wizard/done/+page.svelte`
doğrulandı):

```
web/apps/airdrop-create/src/routes/
  +layout.svelte                 # AppShell + WalletSelectionModal + ToastContainer (claim layout deseni)
  +page.svelte                   # giriş / "Kampanyalarım" yönlendirme
  wizard/
    +layout.svelte               # WizardSteps progress barı (mevcut wizard/+layout.svelte:8)
    step-0/+page.svelte          # ① Token
    step-1/+page.svelte          # ② Alıcılar (RecipientGrid) + kampanya ayarları
    step-2/+page.svelte          # ③ İncele & Dağıt (deploy mikro-stepper: 3 alt-adım)
    done/+page.svelte            # paylaşılabilir link hero'su
  distributions/+page.svelte     # Kampanyalarım dashboard (mevcut /distributions miras)
```

> **DÜZELTME.** Mevcut `WizardSteps` **3 etiketli**: `Token / Create / Deploy`
> (`WizardSteps.svelte:6-10`). Biz etiketleri `Token / Alıcılar / İncele & Dağıt` yaparız
> ama URL şemasını (`step-0/1/2`) ve self-hiding progress-bar mantığını
> (`WizardSteps.svelte:17` → `isDonePage`; `done` sayfasında bar gizlenir) **aynen**
> koruruz. `progressbar` ARIA bloğu `WizardSteps.svelte:51-55`'te. **Not:** `wizardStore`
> step-bounds 0..3'tür ve `done` index 3 = terminal "done" durumudur, ama progress barı
> 3 görünür adım gösterir ve `done`'da gizlenir (`wizard/done/+page.svelte:23-27`).
> Dashboard route'u mevcut repo'da `/distributions`'dır (`campaigns` değil); aynı adı ya da
> `campaigns`'i seçmek serbest, ama **mevcut miras `/distributions`**'tır.

**Claim (tek route, state machine —** mevcut `claim` app tek `+page.svelte`'dir,
`apps/claim/src/routes/+page.svelte`, doğrulandı):

```
web/apps/airdrop-claim/src/routes/
  +layout.svelte                 # AppShell (authStore YOK — claim layout'tan auth satırı çıkar)
  +page.svelte                   # tek-ekran state machine; ?a=<airdrop>&cid=<cid>[&addr=<önizleme>]
```

URL kontratı: `a` = instance kontrat adresi (`C…`), `cid` = pin-proxy claim-list CID'i.
Mevcut claim context'i URL'de `?address=` ile tutuyor ve değişince store'u resetliyor
(`apps/claim/src/routes/+page.svelte:140` `importedAddress` derived; `:149` reset yorumu /
`:154` `claimStore.reset()`); biz aynı deseni `?a=`/`?cid=` ikilisiyle uygularız.
Opsiyonel `&addr=` = salt-okunur adres-önizleme (§3.4).

---

## 2. Bileşen & store reuse haritası

**Sıfır yeni tasarım sistemi.** `@zarf/ui` envanteri (doğrulandı —
`packages/ui/lib/components/{ui,wallet,layout,brand}`):

| Katman | Aynen reuse | Kaynak |
|---|---|---|
| Shell/nav | `AppShell`, `ZarfNavbar`, `NetworkToggle`, `ThemeToggle` | `components/layout` |
| UI primitifleri | `ZenAlert/Badge/Button/Card/Checkbox/Divider/Input/NumberInput/Radio/Select/Spinner`, `PageHeader`, `AddressInput`, `Tooltip`, `ToastContainer` | `components/ui` (15 dosya doğrulandı) |
| Cüzdan | `WalletConnectButton`, `WalletSelectionModal`, `WalletBadge` | `components/wallet` |
| Store | `walletStore`, `networkStore`, `themeStore`, `toastStore` | `lib/stores` |

> **DÜZELTME.** `components/ui/` altındaki 15 dosyanın hepsi "Zen" ön-ekli değil; `PageHeader`,
> `AddressInput`, `Tooltip`, `ToastContainer` ön-eksizdir. "15 Zen primitifi" yerine
> "15 UI-bileşeni" doğrudur. `ZenRadio` ve `ZenDivider` mevcut (doğrulandı) — taslakta
> eksik sayılmıştı.

**KULLANILMAZ:** `authStore.svelte.ts` (`packages/ui/lib/stores`). Mevcut claim layout
`authStore.restoreGmailSession(...)` **çağırıyor** (`apps/claim/src/routes/+layout.svelte:21`,
doğrulandı); bizim claim layout'ta bu satır **silinir**. Bu, "kimlik = cüzdan, Google YOK"
kararının tek somut kod farkıdır.

**Yeni bileşen/store (minimum):**

| Yeni artefakt | Konum | Türetildiği desen |
|---|---|---|
| `RecipientGrid.svelte` | `apps/airdrop-create/src/lib/components/` | `DistributionRecipients.svelte` (CSV-only) → grid'e evrilir |
| `campaignStore.svelte.ts` | `apps/airdrop-create/src/lib/stores/` | `wizardStore` + `deployStore` **eksi** PII-redaksiyon/backup |
| `airdropClaimStore.svelte.ts` | `apps/airdrop-claim/src/lib/stores/` | `claimStore` **eksi** epochs/proof/PIN/email |
| `@zarf/core/lib/merkle` | `packages/core/lib/merkle` | yeni; kontratla bit-bit aynı hashing (ana plan §6) |

> **DİKKAT (yeni — taslakta yoktu).** `@zarf/core`'da **zaten bir Merkle modülü var**:
> `packages/core/lib/crypto/merkleTree.ts` (+ `merkleResultAdapter.ts`), mevcut ZK/vesting
> akışına ait. Airdrop için yeni `lib/merkle` modülü **bilinçli olarak ayrıdır** — yaprak
> formatı farklı (keccak256 + domain-tag + XDR adres + big-endian `i128`, ana plan §4.3 / §6).
> Mevcut `crypto/merkleTree.ts` **reuse edilmez**; karıştırılmaması için ayrı isim/yol.

`walletStore` API'si doğrulandı: `requestConnection()` (`walletStore.svelte.ts:207`),
`address` getter (`:308`), `isConnected` getter (`:311`), `isWrongNetwork` getter (`:340`,
derived `:71`). Yanlış-ağ tespiti hazır — claim app `isWrongNetwork`'ü doğrudan tüketir (§4).

`pinService` (CID üreten pin-proxy client'ı, `apps/create/src/lib/services/pinService.ts`;
`pinClaimList()` export'u `:145`) create app'e taşınır. **Not:** `pinService`, pin isteğini
**owner-imzalı auth header** ile gönderir (`pinService.ts:72`, auth digest'i `sha256` —
bu Merkle keccak'tan bağımsızdır). Claim app **yazmaz**; CID'den okumak için yalnız `fetch`
(IPFS gateway) kullanır.

**campaignStore'un wizardStore'dan ayrılışı (file:line referanslı, doğrulandı):**
- `wizardStore.redactForStorage()` (`wizardStore.svelte.ts:88`) → **kaldırılır.** Adres
  public, redakte edilecek PII yok; liste tam haliyle saklanır (ana plan §15
  "Recipient persist → Saklanır", `plans/airdrop_tool/airdrop-tool-design.md:436`).
- `editingVestingDuration`/`editingCliffDate` editing-state'leri
  (`wizardStore.svelte.ts:72`, `:75`) → **kaldırılır;** yerine `deadline:u64` + `locked:bool`.
- `moveDistributionToLaunched`/`cancelDistribution` state-makinesi
  (`wizardStore.svelte.ts:165`, `:181`) → **korunur** (Kampanyalarım dashboard'u için).

---

## 3. Ekran-ekran UX akışı — miras + ayrılış

Mevcut desenden **üç bilinçli ayrılış** (ana plan §15 tablosunu genişletir):

| Boyut | Zarf create/claim (mevcut) | Airdrop aracı | Dosya kanıtı |
|---|---|---|---|
| Alıcı girişi | CSV upload (`DistributionRecipients`) | **Düzenlenebilir grid** + CSV | `DistributionRecipients.svelte:59` (`handleFileUpload`) |
| Deploy mikro-stepper | 4 (Prepare/**Backup**/Approvals/Deploy) | **3 (Backup YOK)** | `wizard/step-2/+page.svelte:106`; `deploy/DeployStep2Backup.svelte` → silinir |
| Schedule | Vesting micro-step | **deadline + `locked`** | `steps/DistributionSchedule.svelte`, `VestingTimeline.svelte` → çıkar |
| Success | Kontrat adresi | **Link + QR hero** | `wizard/done/+page.svelte:88` (kontrat adresi gösterir) → link-hero'ya |
| Claim | 5-adım ZK stepper | **Tek-ekran ~2 tık** | `claim/steps/ClaimStep{1..5}*.svelte`; `claimStore.svelte.ts:212` (`currentStep < 5`) → tek ekrana |

> **DÜZELTME (önemli).** Taslak "deploy alt-adım 4 (Prepare/Backup/Connect/Deploy)" diyordu.
> Mevcut **rendered etiketler** `Prepare / Backup / Approvals / Deploy`'dır
> (`wizard/step-2/+page.svelte:106`). "Connect" yalnızca **bileşen dosya adında** geçer
> (`DeployStep3Connect.svelte`); ekranda görünen etiket **"Approvals"**. Backup'ı silmek
> 4→3 indirgemesini verir; **bu indirgeme wizard'a değil, bu mikro-stepper'a aittir.**

### 3.1 CREATE ① Token (step-0)

Mevcut `step-0`'ı **aynen miras al**: SAC/SEP-41 contract ID yapıştır → metadata lookup
(debounce, `tokenMetadata.ts`) → trust-tier (curated/imported) + imported için acknowledge
checkbox → preset chip'ler (`TokenPickerModal.svelte`). **Tek ek:** klasik asset seçilince
issuer-flag denetimi (v1.1, ana plan §5) — `AUTH_REQUIRED` açıksa **reddet**, clawback açıksa
**uyar** (issuer flag'leri `assets` skill: `account.flags` ile çekilir). v1'de (XLM + custom
SEP-41) sürtünme yok.

```
┌─ Yeni Airdrop ──────────────────────────── [Testnet ▾] [Cüzdan] ─┐
│  ● Token ── ② Alıcılar ── ③ İncele & Dağıt                       │
│                                                                   │
│  Token  [ C… contract ID yapıştır            ]  veya  ▸ XLM ▸ USDC│
│  ┌─ ✓ TOKEN (curated) ─────────────────────┐                     │
│  │  decimals: 7 · supply: 100,000,000       │                     │
│  └──────────────────────────────────────────┘                     │
│  (imported ise)  [✓] Bu tokenı kendim doğruladım                 │
│                                          [İptal] [İleri →]         │
└───────────────────────────────────────────────────────────────────┘
```

### 3.2 CREATE ② Alıcılar — "Airtable" grid (step-1, aracın imzası)

En büyük ayrılış. Mevcut `DistributionRecipients` yalnız CSV upload sunuyor
(`handleFileUpload`, `DistributionRecipients.svelte:59`); biz **düzenlenebilir grid'e**
evirir, CSV import/export'u destekleyici tutarız.

> **Önemli nüans (taslakta gizliydi).** Mevcut `DistributionRecipients` **e-posta-merkezli**:
> derived `csvTotal` (`:29`), duplicate tespiti `duplicateEmails` `r.email` üzerinden
> (`:38`), satır görünümü `row.email` (`:376`). Bizim grid bunu **adres-merkezli**'ye
> çevirir (`duplicateAddresses`). Yine de altyapı uygundur çünkü **`csvProcessor.ts` zaten
> `address,amount` formatını destekliyor** (`csvProcessor.ts:5-6` docstring; `:94-95`
> `isValidAddressShape` dalı; `normalizeAddress` `:30`). `parseCSV` hem email hem adres
> kabul eder (`:90` / `:94`) — adres dalı reuse edilir.

```
┌─ Yeni Airdrop ───────────────────────────── [Testnet ▾] [Cüzdan] ─┐
│  ① Token ── ● Alıcılar ── ③ İncele & Dağıt                        │
│  Alıcılar (1,240)         [⬆ CSV] [⬇ CSV] [+ Satır] [Yapıştır]    │
│  ┌────────────────────────────┬───────────┬────┐                  │
│  │ Adres                      │ Miktar    │    │                  │
│  ├────────────────────────────┼───────────┼────┤                  │
│  │ GABC…7K4Z  ✓               │ 100.00    │ 🗑 │  ← satır geçerli  │
│  │ GD2…       ⚠ checksum      │  50.00    │ 🗑 │  ← strkey hata    │
│  │ GABC…7K4Z  ⚠ tekrar        │  25.00    │ 🗑 │  ← duplicate      │
│  │ +                          │           │    │  ← boş satır ekle │
│  └────────────────────────────┴───────────┴────┘                  │
│  Σ 84,200 TOKEN · 1,240 alıcı · ⚠ 2 hata                          │
│  ─────────────────────────────────────────────────────────────    │
│  Kampanya ⚙  Son tarih:[2026-09-01 ▾]  ○ Süresiz   [✓] locked     │
│    locked + son tarih → "Son tarihe kadar fonu çekemezsin; sonra  │
│                          kalanı geri alabilirsin."                │
│  Gereken fon: 84,200 TOKEN · Bakiyen: 90,000 ✓                    │
│                                            [← Geri] [İncele →]     │
└────────────────────────────────────────────────────────────────────┘
```

**Grid (`RecipientGrid.svelte`) davranışı:**
- **Yapıştır:** Excel/Sheets'ten tab/virgül ayrımlı yapıştırma → satırlara açılır
  (`csvProcessor.normalizeAddress`, `csvProcessor.ts:30` reuse).
- **Hücre-bazlı inline validasyon:** strkey **shape** kontrolü
  (`@zarf/core/utils/addressShape`'in `isValidAddressShape`'i; bu **shape/regex-grade**'tir,
  StrKey checksum'ı *tam olarak* doğrulamaz — tam checksum tx-build'de yakalanır,
  `csvProcessor.ts:16-22` yorumu), miktar>0 (`csvProcessor.ts:84`), duplicate tespiti
  (mevcut `duplicateEmails` deseni → `duplicateAddresses`, `DistributionRecipients.svelte:38`).
- **Canlı Σ:** mevcut `csvTotal` derived'i (`DistributionRecipients.svelte:29`) reuse.
- **Pool alanı YOK:** mevcut `PoolAmountInput.svelte` + budget over/under mantığı
  (`DistributionRecipients.svelte:32-34`) **çıkarılır** — toplam tanım gereği = Σ miktar.
  Yerine "Gereken fon" + bakiye denetimi.
- **deadline + `locked`:** `DistributionSchedule.svelte`/`VestingTimeline.svelte` yerine
  iki kontrol; `locked` altında ana plan §4.4'ün dört güven modunun düz-dil özeti.

### 3.3 CREATE ③ İncele & Dağıt + Done

Mevcut `step-2`'yi miras al, **deploy mikro-stepper'ından Backup adımını sil** (4→3;
`deploy/DeployStep2Backup.svelte` artefaktı kaldırılır — sır/PIN yok, yedeklenecek şey yok):

1. **Hazırla** — `@zarf/core/lib/merkle.buildTree()` (keccak256) → claim-list JSON →
   `pinService.pinClaimList()` ile pinle → CID. Mevcut `deployStore`'un WAL/recovery deseni
   (`deployStore.svelte.ts:39` "restored from the WAL" yorumu; `:128` `this.load(dist.id)`
   recovery çağrısı) korunur.
2. **Bağla & Onayla** — `walletStore.requestConnection()` (`walletStore.svelte.ts:207`),
   bakiye ≥ Σ denetimi, token approval/auth.
3. **Dağıt & Fonla** — `create_airdrop` (deploy+fonla atomik, ana plan §4.1); mainnet onay
   kapısı. `dapp` SKILL: invoke → `simulateTransaction` → `assembleTransaction` → imzala →
   submit zorunlu (`dapp/SKILL.md:290-302`).

```
   ✓ Airdrop yayında
   ┌──────────────────────────────────────────────┐
   │  claim-drop.zarf.to/?a=C…X9&cid=bafy…         │  [Kopyala] [⬛ QR]
   └──────────────────────────────────────────────┘
   Kontrat: C…X9 · CID: bafy… · 1,240 alıcı · Σ 84,200 TOKEN
   [ Kampanyalarım ]   [ Linki Paylaş ]
```

> **Not.** Mevcut `wizard/done/+page.svelte` yalnız `deployStore.contractAddress`'i gösterir
> (`:88`) ve `?a=`/`?cid=` linki taşımaz. Bizim done sayfası bu kutuyu **paylaşılabilir
> link + QR hero'suna** çevirir (§6). `copyToClipboard` deseni (`:33-38`) reuse edilir.

**Kampanyalarım dashboard** (mevcut `/distributions` miras): ilerleme (claimed/total, indexer
event'lerinden — ana plan §9), deadline geri-sayımı, **Geri Çek** butonu (ana plan §4.4
kurallarına göre aktif/pasif).

### 3.4 CLAIM — tek-ekran state machine

Mevcut 5-adım ZK stepper (`claim/steps/ClaimStep1..5`; `claimStore.svelte.ts:212`
`currentStep < 5`) → **tek ekran**. Mevcut claim'in single-route + URL-context +
reset-on-change deseni (`apps/claim/src/routes/+page.svelte:140` importedAddress; `:149`/`:154`
reset) korunur; `claimStore`'un epochs/proof/PIN/email karmaşası **atılır**
(`claimStore.svelte.ts:23` "MASTER SALT and Epoch Secrets" yorumu — bu araçta yok).

```
┌─ TOKEN Airdrop ───────────────────────────────── [Testnet] ─┐
│  84,200 TOKEN · 312/1,240 alındı · ⏳ 12 gün kaldı           │ ← şeffaflık barı
│  ───────────────────────────────────────────────────────    │
│   [ Cüzdan Bağla ]     ya da   [ bir adres kontrol et ▸ ]    │ ← kimlik = cüzdan
│                                                              │
│  (bağlanınca, anlık eligibility):                            │
│   ✓ Uygun:  100.00 TOKEN  →  GABC…7K4Z                       │
│   [ Claim Et ]        fee ≈ küçük bir XLM (sen ödersin) ⓘ    │ ← kesin fee: doğrulanmalı
└──────────────────────────────────────────────────────────────┘
```

**Akış:** dağıtımı yükle (`?cid=`) → cüzdan bağla (veya adres yapıştır-önizle) → JSON'da
adresi anlık ara → Merkle proof client'ta anlık (`@zarf/core/lib/merkle.verifyProof`) →
`simulateTransaction` → `assembleTransaction` → imzala → submit → success. **ZK spinner yok.**
`dapp` SKILL: Soroban tx submit + poll deseni (`dapp/SKILL.md:354-381`).

**Adres-kontrol-önizleme (`&addr=`):** salt-okunur — adres yapıştır → JSON'da ara →
"uygun: X TOKEN (claim için cüzdan bağla)" / "listede yok". Cüzdan gerektirmez; meraklı/
ön-kontrol için. `AddressInput` bileşeni reuse.

---

## 4. Tüm claim durumları tablosu

`airdropClaimStore` derived'lerinden render edilen durum makinesi. Mevcut claim'in
durum-mesajı disiplinini (ana plan §8) genişletir:

| Durum | Tetik | UI | Kaynak |
|---|---|---|---|
| `loading` | CID fetch / JSON parse sürüyor | `ZenSpinner` + "Kampanya yükleniyor" | — |
| `no-wallet` | cüzdan bağlı değil | "Eligibility için cüzdan bağla" + adres-kontrol linki | `walletStore.isConnected` (`:311`) |
| `eligible / claimable` | adres listede, claimed değil | miktar + **Claim Et** | kontrat `is_claimed`=false |
| `needs-trustline` | klasik asset + alıcı `G…`'de trustline yok | önce tek-tık "Trustline ekle", sonra claim | ana plan §5; v1.1 |
| `already-claimed` | `is_claimed(index)`=true | ✓ + explorer linki | kontrat `is_claimed` |
| `not-in-list` | adres JSON'da yok | "Bu adres bu airdrop'ta değil" | client-side arama |
| `expired` | `deadline>0 && now>deadline` | "Claim penceresi kapandı" | kontrat `Expired` |
| `wrong-network` | cüzdan ağı ≠ kampanya ağı | "Cüzdanı … ağına geçir" | `walletStore.isWrongNetwork` (`:340`) |
| `underfunded` | hesap min-reserve/fee'siz | "Fee + reserve için XLM gerekli" | hesap-yokluğu; reserve değeri **doğrulanmalı** |
| `submitting` | tx imzalandı, RPC poll | buton spinner + "Onay bekleniyor" | `dapp/SKILL.md:367-372` |
| `success` | tx SUCCESS | ✓ + explorer + paylaş | `dapp/SKILL.md:373` |
| `tx-error` | simülasyon/submit hatası | hata mesajı + "Tekrar dene" | `dapp/SKILL.md:292,362` |

**Önemli ayrım — `not-in-list` vs `expired` vs `wrong-network`:** üçü de "claim
edemezsin" ama nedenleri farklı; tek bir generic hata göstermek kullanıcıyı kör eder.
`wrong-network` özellikle kritik çünkü kullanıcı doğru listede ama yanlış ağda — mesaj
**eylem-yönlü** olmalı ("cüzdanını Testnet'e geçir"). `walletStore.isWrongNetwork` zaten
bu sinyali veriyor (`walletStore.svelte.ts:340`); `dapp` SKILL UX checklist'i de "Network
mismatch (wallet on wrong network)" maddesini ayrı listeler (`dapp/SKILL.md:681`).

---

## 5. Edge-case, erişilebilirlik, mobil, i18n, hata-durum

### 5.1 Erişilebilirlik (a11y)
- **Wizard progress:** mevcut `WizardSteps.svelte:51-55` `role="progressbar"` +
  `aria-valuetext` ("Step 2 of 3: Alıcılar", `:55`) taşıyor — RecipientGrid wizard'ında
  **aynen korunur**.
- **Grid klavye gezinmesi:** RecipientGrid hücreleri arasında Tab/ok-tuşu navigasyonu,
  her hücre `aria-invalid` + `aria-describedby` ile inline hata bağlar. Satır-sil butonu
  `aria-label="Satırı sil: GABC…"`.
- **Skip-link:** mevcut claim layout `<a href="#main" class="skip-link">` taşıyor
  (`apps/claim/src/routes/+layout.svelte:27`) — iki app'te de korunur.
- **Claim durum-değişimi:** `aria-live="polite"` bölge; `loading→eligible→success`
  geçişleri ekran-okuyucuya duyurulur. Spinner-only durumlar görsel + metinsel.
- **Renk-bağımsızlık:** ✓/⚠ ikonları metin etiketiyle eşlenir (sadece renge dayanmaz).

### 5.2 Mobil
- Claim app **mobil-first**: link sosyal medyadan tek tıkla açılır; tek-ekran + tek-buton
  zaten dar viewport'a uygun. Şeffaflık barı tek satıra sığar, gerekirse alt-alta kırılır.
- Create grid masaüstü-ağırlıklı (binlerce satır düzenleme); mobilde CSV-import yoluna
  yönlendir + grid'i yatay-scroll'lu salt-okunur özet göster.
- QR success-hero mobilde **cihazlar-arası köprü**: masaüstünde oluştur, telefonda
  QR'ı okutarak claim test et.

### 5.3 i18n
- Türkçe-first (mevcut plans dokümanları Türkçe); kullanıcı-yüzü string'ler i18n-hazır
  sözlüğe (anahtar→metin) toplanır, hard-code değil. Adres/CID/miktar gibi teknik
  değerler çevrilmez. Tarih/sayı biçimleri locale-duyarlı (`toLocaleString`; mevcut
  `formatAmount`, `DistributionRecipients.svelte:53`).

### 5.4 Hata-durum mesajları (doğrulama matrisi)
- **Create:** "⚠ checksum" (strkey shape geçersiz), "⚠ tekrar" (duplicate), "miktar > 0
  olmalı" (`csvProcessor.ts:84`), "Σ ≠ toplam" (fonlama uyumsuzluğu — kontrat
  `TokenTransferMismatch`'i öncesinde client-side yakalanır, ana plan §4.5), "bakiye yetersiz".
- **Claim:** §4 tablosundaki her durum eylem-yönlü tek cümle. `dapp` SKILL UX checklist'i
  kanıt: "User rejected signing / Insufficient XLM for fees / Account not funded / Network
  mismatch / Transaction timeout" (`dapp/SKILL.md:676-682`) — beşi de ayrı mesaj.

### 5.5 Edge-case'ler (UI tarafı)
- **Bozuk/erişilemez CID:** claim app "Kampanya verisi yüklenemedi" + retry; pin-proxy
  IPFS gateway down ise alternatif gateway denenir.
- **JSON ağı ≠ cüzdan ağı:** JSON `network` alanı (ana plan §7 şeması) cüzdan-ağıyla
  denetlenir → `wrong-network` durumu.
- **Zaten-bağlı cüzdan, farklı adres:** kullanıcı cüzdan hesabını değiştirirse eligibility
  yeniden hesaplanır (reaktif `$derived`).
- **Çift-submit koruması:** `submitting` sırasında Claim butonu disabled
  (`dapp/SKILL.md:683` "Prevent double-submission").

---

## 6. Paylaşılabilir link + QR success-hero gerekçesi

Mevcut create app'in success ekranı **kontrat adresini** gösteriyor
(`wizard/done/+page.svelte:88`); biz bunu **paylaşılabilir link + QR hero'suna** çeviririz.
Gerekçe:

1. **Dağıtım = teslim edilen şey.** Bir airdrop'un çıktısı kontrat adresi değil,
   **alıcıların ulaşabileceği bir link**tir. Gönderenin tek bir sonraki eylemi var:
   linki paylaş. Hero, o eylemi ekranın merkezine koyar.
2. **Link kendi-kendine yeten context taşır.** `?a=<airdrop>&cid=<cid>` ile claim app,
   sıfır backend olmadan kampanyayı tam yükler — IPFS'ten JSON, zincirden `is_claimed`.
   Bu, "off-chain host = pin-proxy/IPFS" kararıyla (ana plan §7) bütünleşir.
3. **QR = çevrimdışı/cihazlar-arası dağıtım.** Etkinliklerde, sunum slaytlarında,
   fiziksel materyalde QR okutmak link kopyalamaktan üstün; mobil-claim akışını besler (§5.2).
4. **Şeffaflık barıyla simetri.** Claim ekranındaki "312/1,240 alındı · ⏳ 12 gün" barı
   (§3.4) sosyal-kanıt + aciliyet üretir; success-hero'daki link o barı dağıtıma sokar.
   İkisi birlikte "oluştur → paylaş → claim" döngüsünü tek üründe kapatır.

---

## 7. Açık not / doğrulanması gerekenler

- **Fee (claim tx'i) kesin değeri** ve **trustline reserve değeri** okunan `dapp` SKILL'de
  geçmiyor. `dapp` SKILL yalnız `BASE_FEE` sembolünü kullanır (`dapp/SKILL.md:249,282`) ve
  "Insufficient XLM for fees" checklist maddesini taşır (`:679`); **sayısal fee/reserve yok.**
  - Taslaktaki **"fee ~0.001 XLM"** → kaynaksız tahmin. (Bilgi: Stellar `BASE_FEE` = 100
    stroop = 0.00001 XLM/op tabandır, ama **Soroban tx fee'si kaynak kullanımıyla değişir**;
    kesin değer simülasyondan gelir.) UI'da sayı vermek yerine **"küçük bir XLM ücreti
    (sen ödersin)"** + tooltip'te simülasyondan gelen canlı değer göster. **Doğrulanmalı.**
  - Taslaktaki **"trustline reserve ~0.5 XLM"** → `dapp` SKILL'de yok. Stellar'da base
    reserve subentry başına 0.5 XLM'dir (protokol sabiti) ama bu **`assets` skill'in
    alanı**dır, okunan dapp SKILL'de doğrulanmadı. `soroban/SKILL.md:2287` yalnız
    "Minimum ~1 XLM for base reserve" gibi gevşek bir yorum taşır. UI metni sayı yerine
    muğlak tutulup canlı değer tooltip'te verilebilir. **Doğrulanmalı (kaynak: `assets` skill).**
- **Fee-siz onboarding köprüsü (gelecek):** `dapp` SKILL OpenZeppelin Relayer /
  fee-sponsorship (`dapp/SKILL.md:643-664`) ve passkey smart-account
  (`dapp/SKILL.md:591-633`) sunuyor. Ana plan §10'daki "permissionless-execute" v2
  kararıyla birleşince, claim UI ileride "fee'siz claim" rozeti gösterebilir — bu dokümanda
  **kapsam dışı**, sadece UI-genişleme noktası olarak işaretlenir.
- **Kilitli kararlarla çelişki bulunamadı.** Ayrı app, ayrı domain, claim=cüzdan, authStore
  yok, deadline+locked, Merkle-anlık — hepsi repo desenleriyle tutarlı. Tek somut uyumsuzluk:
  mevcut claim layout'unun `authStore.restoreGmailSession` çağrısı
  (`apps/claim/src/routes/+layout.svelte:21`) — bu araçta o satır silinerek giderilir (§2).
- **soroban-sdk sürümü:** repo `26.0.0-rc.1`'e pinli (`contracts/soroban/zarf/factory/Cargo.toml:10`),
  KILITLI KARARLAR'daki "26.x" ile tutarlı. Hashing kararı (`keccak256`) repo ile uyumlu:
  `factory::recipient_id` = `BnScalar(keccak256(address.to_xdr))` — BN254-indirgemeli (`factory/src/lib.rs:118-122`, ZK için); airdrop yaprağı bu indirgemeyi **DEVRALMAZ** (düz keccak256, bkz. [09](09-merkle-data-contract.md));
  factory `deploy_v2` kullanıyor (`:319`) — ana plan §4.1 ile uyumlu.

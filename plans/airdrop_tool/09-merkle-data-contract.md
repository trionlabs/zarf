# 09 — Merkle & Claim-list Veri Sözleşmesi (Normatif)

> Standalone airdrop aracının (Zarf ZK çekirdeğinden ayrı, cüzdan-adresi + Merkle-claim dağıtımcısı) tek normatif byte-format kaynağıdır. `@zarf/core/lib/merkle` (TS) ile `zarf-airdrop-soroban` (Rust) bit-bit aynı baytları üretir. [`02-contract-spec.md`](02-contract-spec.md) §5 ile çelişirse bu doküman geçerlidir. Ağ-seviyesi sabit-olmayan sayılar "doğrulanmalı" işaretlidir. DURUM: kararlaştırıldı, implementasyon bekliyor.

## 1. Neden tek normatif kaynak

Kontrat ile off-chain hesaplayıcı aynı baytları üretmek zorunda (Zarf'ın CID byte-determinism disiplini — [`web/packages/core/lib/domain/claimListBuilder.ts`](../../web/packages/core/lib/domain/claimListBuilder.ts): *"Determinism is load-bearing: same input MUST produce byte-identical JSON"*).

| Taraf | Dil | Rol | Primitif |
|---|---|---|---|
| `zarf-airdrop-soroban::claim` | Rust no_std wasm32v1-none | doğrular | `env.crypto().keccak256` |
| `@zarf/core/lib/merkle` | TS Workers-uyumlu | üretir | `@noble/hashes/sha3 keccak_256` |

Divergence: en iyi her claim `InvalidProof`; en kötü yanlış kök kabul. Doküman dondurur: yaprak/düğüm düzeni (§3-4), adres-XDR JS karşılığı (§3.3), paylaşılan vektör (§7).

> **ÖNCÜL (farklı leaf):** `claimListBuilder` Zarf vesting'tedir; e-posta yapraklarını `hashEmail` (BN254) ile üretir, şeması `merkleRoot`/`leaves`/`schedule`/`commitments`'tır. Airdrop bu kodu YENİDEN KULLANMAZ — adres-yaprağı + farklı şema. Ortak olan yalnız determinism disiplini.

## 2. Hash = keccak256, BN254 indirgemesi YOK

Repo keccak256 host fn kullanır ([`factory:120`](../../contracts/soroban/zarf/factory/src/lib.rs), [`vesting:523`](../../contracts/soroban/zarf/vesting/src/lib.rs)). JS: saf-TS `@noble/hashes/sha3 keccak_256`.

> **BAĞIMLILIK NOTU.** `@noble/hashes` bugün `web/packages/core/package.json`'da KAYITLI DEĞİL (mevcut: `@stellar/stellar-sdk ^15.1.0`, `@stellar/freighter-api ^6.0.1`). Yeni bağımlılık; `check:budget`/bundle etkisi doğrulanmalı.

> **DOĞRULANMIŞ AYRIM (load-bearing).** `factory:118-122` recipient_id: `recipient.to_xdr` → `keccak256(...).to_bytes()` → `BnScalar::from_bytes(digest).to_bytes()` (BN254 SKALER İNDİRGEMESİ; ZK devresi için). Aynı kalıp `vesting:521-525` recipient_field'da. **Airdrop yaprağı bu indirgemeyi MİRAS ALMAZ** — ham `keccak256(...).to_bytes()` (32B, mod-indirgemesiz). Ortak yalnız keccak256 + to_xdr. `BnScalar::from_bytes`'i airdrop yaprağına taşımak BUG'dır. Karşıt yön: airdrop root'u ham keccak, BN254 değil; `factory:447-458` `is_canonical_field` BN254-modulus denetimi airdrop'a TAŞINMAZ ([02](02-contract-spec.md) §2.1).

sha256 değil: repo zaten keccak'ta; geçiş olursa iki taraf birlikte değişir + vektörler yenilenir.

## 3. Yaprak — KESİN

```
leaf = keccak256( 0x00 ‖ index_be(4B) ‖ claimant.to_xdr() ‖ amount_be(16B) )
```

| Alan | Boyut | Kodlama |
|---|---|---|
| domain tag | 1B | `0x00` (yaprak); second-preimage (§4) |
| index | 4B | big-endian u32 `to_be_bytes()` |
| claimant | değişken | `Address::to_xdr(&env)` ScAddress XDR; G…/C… ayrımsız |
| amount | 16B | big-endian i128 `to_be_bytes()`, >0 |

### 3.1 Rust
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
to_xdr deseni: `factory:119`, `vesting:522`; salt'ta da `owner.clone().to_xdr(env)` (`factory:461`).

### 3.2 TypeScript
```ts
import { keccak_256 } from '@noble/hashes/sha3';
import { Address } from '@stellar/stellar-sdk';
function u32be(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, false); return b; }
function i128be(amount: bigint) { const b = new Uint8Array(16); let v = amount < 0n ? (1n<<128n)+amount : amount; for (let i=15;i>=0;i--){b[i]=Number(v&0xffn);v>>=8n;} return b; }
function addressXdr(strkey: string) { return Address.fromString(strkey).toScVal().toXDR(); } // strkey-decode DEĞİL
function leaf(index, claimant, amount) { return keccak_256(concat([Uint8Array.of(0x00), u32be(index), addressXdr(claimant), i128be(amount)])); }
```

### 3.3 to_xdr JS karşılığı — strkey-decode DEĞİL (en kritik pin)

`Address::to_xdr` = ScAddress XDR (union: account/contract ScVal), çıplak ed25519 key DEĞİL.

> **DOĞRULANMIŞ (dapp skill).** `StellarSdk.Address.fromString(address).toScVal()` ([dapp SKILL.md:311](../../.claude/skills/dapp/SKILL.md)) → `.toXDR()` kontratın `Address::to_xdr` çıktısıyla eşleşir. (dapp SKILL.md:262,302 `.toXDR()`'ı **transaction** üzerinde gösterir — API kanıtı, ScVal örneği değil; ScVal örneği :311.) `StrKey.decodeEd25519PublicKey`/`rawPublicKey()` KULLANILMAZ — XDR sarmalamasını atlar, divergence.

Tam byte düzeni SDK sürümüne bağlı (`@stellar/stellar-sdk ^15.1.0`); varsayılmaz, §7 vektörüyle DOĞRULANIR. SDK major değişirse XDR baytları doğrulanmalı.

### 3.4 amount — JSON'da string

JSON `number` IEEE-754 double, ~2^53 üzeri precision kaybı → REDDEDİLDİ. `string` → BigInt, tam i128 → SEÇİLDİ. En-küçük-birim (`decimals()`), i128, >0. amount<=0 → `InvalidAmount` ([02](02-contract-spec.md) §3.1 enum `InvalidAmount=9`).

## 4. İç düğüm ve proof — KESİN

```
node = keccak256( 0x01 ‖ sorted(L, R) )   // leksikografik
```
Çocuklar leksikografik sıralı (OZ stili) → proof'ta YÖN BİTİ GEREKMEZ (`Vec<BytesN<32>>`). Tag `0x01` (düğüm) ≠ `0x00` (yaprak) → second-preimage kapatılır.

```rust
fn hash_node(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let (lo, hi) = if a.to_array() <= b.to_array() { (a, b) } else { (b, a) };
    let mut buf = Bytes::new(env);
    buf.append(&Bytes::from_array(env, &[0x01]));
    buf.append(&Bytes::from_array(env, &lo.to_array()));
    buf.append(&Bytes::from_array(env, &hi.to_array()));
    env.crypto().keccak256(&buf).to_bytes()
}
fn verify_merkle(env: &Env, root: &BytesN<32>, leaf: &BytesN<32>, proof: &Vec<BytesN<32>>) -> bool {
    let mut computed = leaf.clone();
    for sibling in proof.iter() { computed = hash_node(env, &computed, &sibling); }
    &computed == root
}
```

Proof tipi: kontratta `Vec<BytesN<32>>`; JSON'da 64-hex `0x`-siz (§6.1).

> **NET — proof sırası.** [02](02-contract-spec.md) §3.6 proof'u "kökten yaprağa" diye GEVŞEK tarifler; `verify_merkle` leaf'ten yukarı taşıdığından GERÇEK sıra **yapraktan köke**dir (`proof[0]`=yaprağın kardeşi). Çelişkide bu doküman geçerlidir. Sorted-pair sayesinde yön-bitsiz, ama dizi sıralıdır; §7 pinler.

Tek-yaprak (proof `[]`): `leaf==root`. Odd promotion: tek düğüm kopyalanmadan üst seviyeye taşınır (sorted-pair doğal kapsar); §7'de tek-sayı vektörüyle pinlenir.

## 5. Muxed kararı — base G… pinle, muxed yalnız transfer-hedef şekeri

```rust
// vesting:380-381
let to: MuxedAddress = (&recipient).into();
token_client.transfer(&contract_address, &to, &amount);
```
Bakiye okumaları düz `&recipient` (`vesting:378-383`). MuxedAddress importu `soroban_sdk::{… MuxedAddress …}` (`vesting:5`).

> **NORMATİF KARAR.** Yaprak DAİMA base `G…`/`C…` hash'ler (`claimant.to_xdr()`). MuxedAddress yalnız transfer hedef-tipi şekeri (`vesting:380`); leaf-binding'e girmez.

Gerekçe: (1) claim girdisi `recipient: Address` (base), Muxed ondan `.into()` türetilir; (2) muxed = base + 8B memo-id, sonsuz varyant → divergence riski; (3) airdrop'ta memo-routing gereksiz. Tutarlılık vektörü ŞART ([06](06-testing-verification.md)): yaprak base-XDR ile, transfer base'e gider. Claim-list §6 `address`'i base'e zorlar; `M…` create-app'te reddedilir.

## 6. claim-list JSON — kanonik şema

```jsonc
{
  "v": 1,
  "network": "testnet",
  "airdrop": "C...",
  "token": "C...",
  "root": "<hex64>",               // keccak256, 32B=64 hex, 0x-siz, küçük harf
  "format": { "hash": "keccak256", "leaf": "0x00|index_be32|claimant_xdr|amount_be128", "node": "0x01|sorted(L,R)", "leafBinding": "none" },
  "claims": [ { "address": "G...", "amount": "1000000", "proof": ["<hex64>", "..."] } ]
}
```

- `claims[i].index` örtük = `i` (0-tabanlı). Ayrı `index` alanı yazılmaz.
- `address` base strkey (`G…`/`C…`); `M…` reddedilir (§5).
- `amount` string, i128, >0.
- `proof[]` 64-hex `0x`-siz; tek-yaprak `[]`.
- `root` 64-hex (taslaktaki `hex32` yanıltıcıydı: 32B=64 hex).
- `format` makine-okunur pin; eşleşmezse reddedilir.

### 6.1 pin-proxy validateClaimList UYUM NOTU

> **DOĞRULANMIŞ ÇELİŞKİ.** Validator airdrop JSON'unu REDDEDER ([`web/apps/pin-proxy/src/index.ts:236-253`](../../web/apps/pin-proxy/src/index.ts) — `apps/`, `workers/` değil):
> ```ts
> export function validateClaimList(body: unknown): string | null {
>   if (!body || typeof body !== 'object') return 'not_an_object';
>   const obj = body as Record<string, unknown>;
>   if (typeof obj.merkleRoot !== 'string' || !HEX_32.test(obj.merkleRoot)) return 'missing_or_invalid_merkleRoot';
>   if (!Array.isArray(obj.leaves) || obj.leaves.length === 0)             return 'missing_or_empty_leaves';
>   if (obj.leaves.some((leaf) => typeof leaf !== 'string' || !HEX_32.test(leaf))) return 'invalid_leaf';
>   if (!obj.schedule || typeof obj.schedule !== 'object')                 return 'missing_schedule';
>   return null;
> }
> ```
> `merkleRoot` (bizde `root`), boş-olmayan `leaves[]` (bizde `claims[]`), `schedule` (airdrop'ta YOK) zorunlu → airdrop reddedilir.

> **EK DOĞRULANMIŞ DETAY — hex uyuşmaz.** `HEX_32` (`index.ts:59`) = `/^0x[0-9a-fA-F]{64}$/` → Zarf `0x`-PREFIX'li. Airdrop §6 `root`/`proof` `0x`-siz. KARAR: airdrop `0x`-siz kalır (BytesN konvansiyonu); yeni validator `/^[0-9a-fA-F]{64}$/`. Zarf'ın `HEX_32`'sine dokunulmaz.

**Çözüm** (taşınır: [05](05-economics-cost-model.md) + operasyon notları — *NB: ayrı `08-operations-runbook.md` repoda henüz YOK; airdrop plan dizini 01-07 + README*):
1. **Yeni route** (önerilen): `POST /pin/airdrop-claimlist` + `validateAirdropClaimList` (`root`/`claims[]`, `0x`-siz, `schedule` yok). Zarf route'una dokunmaz.
2. Discriminated union: tek route, `v`/`format`'a göre dallan (regresyon riski).

KARAR: seçenek 1 ("Zarf çekirdeğine sıfır dokunuş").

## 7. Paylaşılan test-vektör seti (Rust ↔ JS differential)

| Konum | İçerik |
|---|---|
| `contracts/soroban/zarf/airdrop/tests/fixtures/merkle-vectors.json` | kanonik (üretilen) |
| `web/packages/core/lib/merkle/__tests__/vectors.json` | aynı dosya (symlink veya build-time kopya + hash gate) |

Vektör bir kez üretilir, iki taraf TÜKETİR (hiçbiri "beklenen"i hesaplamaz). `claimListBuilder.test.ts` disiplini. Workspace yok (CLAUDE.md: dört bağımsız toolchain) → symlink. `web/packages/core/lib/merkle` dizini MEVCUT DEĞİL (yeni oluşturulur).

### 7.2-7.3 Şema + edge'ler
Cases: single-recipient (proof `[]`), two-recipients-G-and-C, odd-count, amount sınırları (`1`, `i128::MAX=170141183460469231731687303715884105727`). Edge'ler: 1-alıcı (`leaf==root`); 2-alıcı G+C; odd promotion; amount sınırları (16B BE); muxed-base (§5); amount=0/negatif (builder reddeder + `InvalidAmount`); boş ağaç (root tüm-sıfır → `__constructor` `InvalidProof`, [02](02-contract-spec.md) §3.5).

Differential akış: Rust `merkle-vectors.json` okur → `leaf`/`verify_merkle` → byte-eşitlik; JS aynı dosya → `buildTree` karşılaştırır.

### 7.4 Üretim aracı
Tek-yönlü: Rust binary/`#[ignore]` test gerçek host-keccak256 + gerçek `Address::to_xdr` ile gözlemlenen değerleri yazar (Rust üretir, JS uyar). `Env::default()` + testutils native (soroban SKILL.md "Unit Testing — runs natively"). JSON commit edilir (bb.js fixture disiplini).

## 8. @zarf/core/lib/merkle — public API
```ts
export interface Row { address: string; amount: string; }
export interface Tree { root: string; leaves: string[]; proofs: string[][]; }  // hex64, 0x-siz
export function buildTree(rows: Row[]): Tree;
export function leafHash(index: number, address: string, amount: string): string;
export function verifyProof(root: string, leaf: string, proof: string[]): boolean;
export function buildClaimList(meta: ClaimListMeta, rows: Row[]): ClaimListJson;
```
`buildTree` kontratla bit-bit aynı: keccak256, tag'ler, `Address.fromString(addr).toScVal().toXDR()`, BE i128, `0x`-siz çıktı. Bağımlılık: `@noble/hashes/sha3` (YENİ — §2) + `@stellar/stellar-sdk ^15.1.0`. `check:any`/`check:budget` uyumu ([`check-any-allow-list.mjs`](../../web/scripts/check-any-allow-list.mjs)).

## 9. Invariant özeti — değişirse İKİ TARAF birlikte

| # | Invariant | Bozulursa |
|---|---|---|
| 1 | keccak256, BN254 indirgemesi YOK (§2) | root divergence |
| 2 | Yaprak = `0x00‖index_be32‖to_xdr‖amount_be128` (§3) | yanlış yaprak |
| 3 | Adres XDR = `toScVal().toXDR()` (§3.3) | sessiz byte divergence (en büyük risk) |
| 4 | amount string, BE i128 (§3.4) | precision kaybı |
| 5 | Düğüm = `0x01‖sorted(L,R)`, yön-bitsiz; dizi yapraktan köke (§4) | proof sırası bozulur |
| 6 | Yaprak base hash'ler; muxed yalnız transfer (§5) | memo-id divergence |
| 7 | `claims[i].index` = örtük `i` (§6) | bitmap kayması |
| 8 | Paylaşılan vektör, Rust üretir/JS uyar (§7) | drift CI'da kaçar |

> Herhangi biri değişirse Rust + `@zarf/core/lib/merkle` + `merkle-vectors.json` ATOMİK güncellenir. Ağ-seviyesi sayılar kapsam dışı, [05](05-economics-cost-model.md)'te "dağıtım anında doğrulanmalı": per-claim fee (~0.01-0.03 XLM yayınlanan profilleme, kesin değil), base fee (100 stroop/op nominal), trustline base-reserve, ~180g entry-TTL tavanı (repo yorumu: `factory:15-18`, `vesting:26-29`) — hepsi ağ-parametresine bağlı, repo/skill'de bağlayıcı sabit yok.

# ID: 004 - State Management with Svelte 5 Runes

## 1. Metadata

- **ID:** 004
- **Title:** Global State Stores with Svelte 5 Runes
- **Type:** Feature
- **Priority:** Critical
- **Effort:** 6 hours (actual)
- **Status:** ✅ Completed (2025-12-24)
- **Dependencies:** 003 (Utility Migration)
- **Persistence:** localStorage (wizard, claim), sessionStorage (wallet)

### 1.1. Stack Verification (2025 Standard)

- [ ] Svelte 5 (Runes): Using `$state()`, `$derived()` in `.svelte.ts` files
- [x] Tailwind v4: N/A (No UI)
- [x] OKLCH Colors: N/A (No styling)
- [ ] Biome Ready: Lint & Format check passes
- [x] ZK Compatibility: Stores prepared for Web Worker communication

---

## 2. Problem Analysis

### Current State

POC uses local component state (`let variable = $state()`) scattered across 919-line `App.svelte`. State is managed through:

- Svelte 5 `$state()` runes (local scope)
- No global state management
- localStorage used directly in components for persistence
- State reset functions scattered throughout

This approach **does not scale** for multi-page SvelteKit app where:

- Wizard state must persist across 6 route changes
- Claim flow needs dashboard → flow mode transition
- Wallet state must be accessible globally
- Theme selection affects entire app

### Pain Points

1. **No State Sharing:** Each page would recreate wallet connection logic
2. **Lost Context:** Navigating `/wizard` → `/claim` loses wizard progress
3. **Duplication:** Same localStorage keys managed in multiple places
4. **Type Safety:** No interfaces for state shape, leading to runtime errors
5. **Testing:** Impossible to test state logic in isolation

### Desired State

**Clean, typed, reactive global stores** using Svelte 5 Runes architecture:

- `wizardStore.svelte.ts` - Wizard form data (6 steps)
- `claimFlowStore.svelte.ts` - Claim flow state (5 steps)
- `walletStore.svelte.ts` - Wallet connection & account
- `themeStore.svelte.ts` - Theme selection (Nord/Wireframe)

Each store should:

- Expose **read-only derived state** via getters
- Provide **explicit mutation methods** (no direct state access)
- Persist to localStorage/sessionStorage automatically
- Restore state on app load
- Provide reset/clear methods
- Be fully typed with interfaces

### Impact Analysis

**Frontend:**

- All pages can reactively access global state
- Navigation between pages preserves context
- Theme changes apply instantly across app

**Contracts/Circuits:**

- No impact

**Security:**

- Sensitive data (JWT, proofs) never persisted
- Wallet address in sessionStorage (cleared on tab close)
- CSV data stored as serialized JSON (no raw files)

### Scope Decisions

**Included:**

- 4 global stores with Runes architecture
- localStorage/sessionStorage persistence
- Type interfaces for all state shapes
- Restore logic on app mount
- Reset/clear utilities

**Excluded:**

- Undo/redo functionality (future enhancement)
- State snapshots/versioning
- Server-side persistence (future backend integration)

---

## 3. Technical Design

### Architecture: Reactive Stores with Encapsulation

**File Structure:**

```
web/src/lib/stores/
├── wizardStore.svelte.ts
├── claimFlowStore.svelte.ts
├── walletStore.svelte.ts
└── themeStore.svelte.ts
```

### Pattern: Svelte 5 Runes Store

```typescript
// Template for store architecture
import { browser } from '$app/environment';

// State interface
interface MyState {
  data: string;
  step: number;
}

// Internal state (private)
let state = $state<MyState>({
  data: '',
  step: 1
});

// Derived values (public, read-only)
const isComplete = $derived(state.step === 5);

// Mutation methods (public)
export function setData(newData: string) {
  state.data = newData;
  persist();
}

// Persistence
function persist() {
  if (browser) {
    localStorage.setItem('my-store', JSON.stringify(state));
  }
}

// Restore on load
function restore() {
  if (browser) {
    const saved = localStorage.getItem('my-store');
    if (saved) {
      state = JSON.parse(saved);
    }
  }
}

// Public API
export const myStore = {
  // Getters (read-only)
  get data() { return state.data; },
  get step() { return state.step; },
  get isComplete() { return isComplete; },
  
  // Actions (mutations)
  setData,
  nextStep: () => state.step++,
  reset: () => { state = { data: '', step: 1 }; },
  
  // Lifecycle
  restore
};
```

### Warnings

- **SSR Hydration:** Always guard `localStorage`/`sessionStorage` with `if (browser)` check
- **BigInt Serialization:** Merkle roots must be converted to string before `JSON.stringify()`
- **Circular References:** CSV file objects cannot be stored, only parsed data
- **Race Conditions:** Multiple tabs editing wizard simultaneously could conflict (accepted limitation)
- **Memory Leaks:** Large CSV data (1000+ rows) stored in memory - monitor performance

### Logic Pattern

❌ **Wrong: Direct State Export**

```typescript
// Anti-pattern
export let wizardData = $state({ step: 1 });
// Problem: External code can mutate directly, no validation
```

✅ **Right: Encapsulated with Methods**

```typescript
// Correct pattern
let data = $state({ step: 1 });
export const wizard = {
  get step() { return data.step; },
  nextStep() { 
    if (data.step < 6) data.step++; 
  }
};
```

---

## 4. Pre-Dev: Affected Files & Functions

### New Files to Create

| File Path | Purpose | Key Exports |
|-----------|---------|-------------|
| `web/src/lib/stores/wizardStore.svelte.ts` | Wizard form state | `wizardStore`, `WizardState` interface |
| `web/src/lib/stores/claimFlowStore.svelte.ts` | Claim flow state | `claimFlowStore`, `ClaimFlowState` interface |
| `web/src/lib/stores/walletStore.svelte.ts` | Wallet connection | `walletStore`, `WalletState` interface |
| `web/src/lib/stores/themeStore.svelte.ts` | Theme selection | `themeStore` |
| `web/src/lib/stores/types.ts` | Shared types | State interfaces |

---

## 5. Implementation Steps

### Step 1: Create Store Types (30 min)

**File:** `web/src/lib/stores/types.ts`

```typescript
import type { Address } from 'viem';

// Wizard Types
export interface TokenDetails {
  distributionName: string;
  iconUrl: string | null;
  tokenAddress: Address | null;
  totalAmount: string;
}

export interface Schedule {
  cliffEndDate: string; // ISO date string
  distributionDurationMonths: number;
}

export interface Recipient {
  email: string;
  amount: number;
  leafIndex?: number;
  salt?: string;
}

export interface WizardState {
  currentStep: number; // 1-6
  tokenDetails: TokenDetails;
  schedule: Schedule;
  recipients: Recipient[];
  csvFilename: string | null;
  regulatoryRules: string[]; // IDs of selected rules
  merkleRoot: string | null;
  deployedContractAddress: Address | null;
  txHash: string | null;
}

// Claim Flow Types
export type ClaimStep = 1 | 2 | 3 | 4 | 5;

export interface ClaimableDistribution {
  id: string;
  name: string;
  projectIcon: string;
  status: 'vesting' | 'claimable' | 'claimed';
  totalAmount: number;
  claimedAmount: number;
  nextUnlockDate: string;
}

export interface SelectedTranche {
  date: string;
  amount: number;
  index: number;
}

export interface ClaimFlowState {
  mode: 'dashboard' | 'claiming'; // UI mode
  currentStep: ClaimStep;
  selectedDistribution: ClaimableDistribution | null;
  selectedTranche: SelectedTranche | null;
  targetWallet: Address | null;
  zkProof: string | null;
  publicInputs: any | null;
  claimTxHash: string | null;
}

// Wallet Types
export interface WalletState {
  address: Address | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
}

// Theme Types
export type Theme = 'nord' | 'wireframe';
```

### Step 2: Wizard Store (2 hours)

**File:** `web/src/lib/stores/wizardStore.svelte.ts`

```typescript
import { browser } from '$app/environment';
import type { WizardState, TokenDetails, Schedule, Recipient } from './types';
import type { Address } from 'viem';

const STORAGE_KEY = 'zarf_wizard_state';

// Initial state
const initialState: WizardState = {
  currentStep: 1,
  tokenDetails: {
    distributionName: '',
    iconUrl: null,
    tokenAddress: null,
    totalAmount: ''
  },
  schedule: {
    cliffEndDate: '',
    distributionDurationMonths: 12
  },
  recipients: [],
  csvFilename: null,
  regulatoryRules: [],
  merkleRoot: null,
  deployedContractAddress: null,
  txHash: null
};

// Internal state
let state = $state<WizardState>(structuredClone(initialState));

// Derived values
const canProceedFromStep1 = $derived(
  state.tokenDetails.distributionName.length >= 3 &&
  state.tokenDetails.tokenAddress !== null &&
  parseFloat(state.tokenDetails.totalAmount) > 0
);

const canProceedFromStep2 = $derived(
  state.schedule.cliffEndDate !== '' &&
  state.schedule.distributionDurationMonths > 0
);

const canProceedFromStep3 = $derived(
  state.recipients.length > 0
);

const isComplete = $derived(
  state.currentStep === 6 && state.deployedContractAddress !== null
);

// Persistence
function persist() {
  if (!browser) return;
  try {
    // Don't store deployed contract (that's final state)
    const toSave = { ...state };
    if (state.currentStep === 6) {
      // Wizard complete, clear storage
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.warn('Failed to persist wizard state:', error);
  }
}

// Restore
function restore() {
  if (!browser) return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate structure before applying
      if (parsed.currentStep && parsed.tokenDetails) {
        state = parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to restore wizard state:', error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Actions
function setTokenDetails(details: Partial<TokenDetails>) {
  state.tokenDetails = { ...state.tokenDetails, ...details };
  persist();
}

function setSchedule(schedule: Partial<Schedule>) {
  state.schedule = { ...state.schedule, ...schedule };
  persist();
}

function setRecipients(recipients: Recipient[], filename: string) {
  state.recipients = recipients;
  state.csvFilename = filename;
  persist();
}

function setMerkleRoot(root: string) {
  state.merkleRoot = root;
  persist();
}

function setRegulatoryRules(rules: string[]) {
  state.regulatoryRules = rules;
  persist();
}

function nextStep() {
  if (state.currentStep < 6) {
    state.currentStep++;
    persist();
  }
}

function previousStep() {
  if (state.currentStep > 1) {
    state.currentStep--;
    persist();
  }
}

function goToStep(step: number) {
  if (step >= 1 && step <= 6) {
    state.currentStep = step;
    persist();
  }
}

function setDeploymentResult(contractAddress: Address, txHash: string) {
  state.deployedContractAddress = contractAddress;
  state.txHash = txHash;
  state.currentStep = 6;
  persist(); // This will actually clear storage since step === 6
}

function reset() {
  state = structuredClone(initialState);
  if (browser) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Public API
export const wizardStore = {
  // Getters (read-only via getters)
  get currentStep() { return state.currentStep; },
  get tokenDetails() { return state.tokenDetails; },
  get schedule() { return state.schedule; },
  get recipients() { return state.recipients; },
  get csvFilename() { return state.csvFilename; },
  get regulatoryRules() { return state.regulatoryRules; },
  get merkleRoot() { return state.merkleRoot; },
  get deployedContractAddress() { return state.deployedContractAddress; },
  get txHash() { return state.txHash; },
  
  // Derived
  get canProceedFromStep1() { return canProceedFromStep1; },
  get canProceedFromStep2() { return canProceedFromStep2; },
  get canProceedFromStep3() { return canProceedFromStep3; },
  get isComplete() { return isComplete; },
  
  // Actions
  setTokenDetails,
  setSchedule,
  setRecipients,
  setMerkleRoot,
  setRegulatoryRules,
  setDeploymentResult,
  nextStep,
  previousStep,
  goToStep,
  reset,
  
  // Lifecycle
  restore
};
```

### Step 3: Claim Flow Store (1.5 hours)

**File:** `web/src/lib/stores/claimFlowStore.svelte.ts`

```typescript
import { browser } from '$app/environment';
import type { ClaimFlowState, ClaimableDistribution, SelectedTranche, ClaimStep } from './types';
import type { Address } from 'viem';

const STORAGE_KEY = 'zarf_claim_flow';

// Initial state
const initialState: ClaimFlowState = {
  mode: 'dashboard',
  currentStep: 1,
  selectedDistribution: null,
  selectedTranche: null,
  targetWallet: null,
  zkProof: null,
  publicInputs: null,
  claimTxHash: null
};

let state = $state<ClaimFlowState>(structuredClone(initialState));

// Derived
const isInClaimFlow = $derived(state.mode === 'claiming');
const canGenerateProof = $derived(
  state.selectedTranche !== null && state.targetWallet !== null
);
const isClaimComplete = $derived(state.claimTxHash !== null);

// Persistence (more aggressive clearing for security)
function persist() {
  if (!browser) return;
  try {
    // Don't persist sensitive data (proofs, txHash)
    const toSave: Partial<ClaimFlowState> = {
      mode: state.mode,
      currentStep: state.currentStep,
      selectedDistribution: state.selectedDistribution,
      selectedTranche: state.selectedTranche,
      targetWallet: state.targetWallet
      // zkProof and claimTxHash intentionally excluded
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.warn('Failed to persist claim flow:', error);
  }
}

function restore() {
  if (!browser) return;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...initialState, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to restore claim flow:', error);
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

// Actions
function enterClaimFlow(distribution: ClaimableDistribution) {
  state.mode = 'claiming';
  state.currentStep = 1;
  state.selectedDistribution = distribution;
  persist();
}

function exitClaimFlow() {
  reset();
}

function selectTranche(tranche: SelectedTranche) {
  state.selectedTranche = tranche;
  persist();
}

function setTargetWallet(address: Address) {
  state.targetWallet = address;
  persist();
}

function setZKProof(proof: string, publicInputs: any) {
  state.zkProof = proof;
  state.publicInputs = publicInputs;
  // Don't persist proofs
}

function setClaimTxHash(txHash: string) {
  state.claimTxHash = txHash;
  state.currentStep = 5;
  // Don't persist tx hash
}

function nextStep() {
  if (state.currentStep < 5) {
    state.currentStep++;
    persist();
  }
}

function previousStep() {
  if (state.currentStep > 1) {
    state.currentStep--;
    persist();
  }
}

function reset() {
  state = structuredClone(initialState);
  if (browser) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export const claimFlowStore = {
  // Getters
  get mode() { return state.mode; },
  get currentStep() { return state.currentStep; },
  get selectedDistribution() { return state.selectedDistribution; },
  get selectedTranche() { return state.selectedTranche; },
  get targetWallet() { return state.targetWallet; },
  get zkProof() { return state.zkProof; },
  get publicInputs() { return state.publicInputs; },
  get claimTxHash() { return state.claimTxHash; },
  
  // Derived
  get isInClaimFlow() { return isInClaimFlow; },
  get canGenerateProof() { return canGenerateProof; },
  get isClaimComplete() { return isClaimComplete; },
  
  // Actions
  enterClaimFlow,
  exitClaimFlow,
  selectTranche,
  setTargetWallet,
  setZKProof,
  setClaimTxHash,
  nextStep,
  previousStep,
  reset,
  
  // Lifecycle
  restore
};
```

### Step 4: Wallet Store (1 hour)

**File:** `web/src/lib/stores/walletStore.svelte.ts`

```typescript
import { browser } from '$app/environment';
import type { WalletState } from './types';
import type { Address } from 'viem';

// No persistence for wallet (session-based)
const initialState: WalletState = {
  address: null,
  isConnected: false,
  isConnecting: false,
  chainId: null
};

let state = $state<WalletState>(structuredClone(initialState));

// Derived
const isWrongNetwork = $derived(
  state.isConnected && state.chainId !== 11155111 // Sepolia
);

// Actions
function setConnecting(value: boolean) {
  state.isConnecting = value;
}

function setConnected(address: Address, chainId: number) {
  state.address = address;
  state.isConnected = true;
  state.isConnecting = false;
  state.chainId = chainId;
}

function setDisconnected() {
  state = structuredClone(initialState);
}

function updateChainId(chainId: number) {
  state.chainId = chainId;
}

export const walletStore = {
  // Getters
  get address() { return state.address; },
  get isConnected() { return state.isConnected; },
  get isConnecting() { return state.isConnecting; },
  get chainId() { return state.chainId; },
  
  // Derived
  get isWrongNetwork() { return isWrongNetwork; },
  
  // Actions
  setConnecting,
  setConnected,
  setDisconnected,
  updateChainId
};
```

### Step 5: Theme Store (30 min)

**File:** `web/src/lib/stores/themeStore.svelte.ts`

```typescript
import { browser } from '$app/environment';
import type { Theme } from './types';

const STORAGE_KEY = 'zarf_theme';
const initialTheme: Theme = 'nord';

let currentTheme = $state<Theme>(initialTheme);

function persist(theme: Theme) {
  if (browser) {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function restore() {
  if (!browser) return;
  const saved = localStorage.getItem(STORAGE_KEY) as Theme;
  if (saved === 'nord' || saved === 'wireframe') {
    currentTheme = saved;
    document.documentElement.setAttribute('data-theme', saved);
  }
}

function setTheme(theme: Theme) {
  currentTheme = theme;
  persist(theme);
}

export const themeStore = {
  get current() { return currentTheme; },
  setTheme,
  restore
};
```

### Step 6: Integration Testing (1 hour)

Create test page: `routes/test/stores/+page.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { wizardStore } from '$lib/stores/wizardStore.svelte';
  import { claimFlowStore } from '$lib/stores/claimFlowStore.svelte';
  import { walletStore } from '$lib/stores/walletStore.svelte';
  import { themeStore } from '$lib/stores/themeStore.svelte';
  
  onMount(() => {
    wizardStore.restore();
    claimFlowStore.restore();
    themeStore.restore();
  });
  
  function testWizard() {
    wizardStore.setTokenDetails({
      distributionName: 'Test Distribution',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      totalAmount: '1000000'
    });
    console.log('Step 1 validation:', wizardStore.canProceedFromStep1);
  }
  
  function testTheme() {
    themeStore.setTheme(themeStore.current === 'nord' ? 'wireframe' : 'nord');
  }
</script>

<div class="p-8">
  <h1>Store Testing</h1>
  
  <section>
    <h2>Wizard Store</h2>
    <p>Step: {wizardStore.currentStep}</p>
    <p>Can proceed from step 1: {wizardStore.canProceedFromStep1}</p>
    <button onclick={testWizard}>Test Wizard</button>
    <button onclick={wizardStore.nextStep}>Next Step</button>
    <button onclick={wizardStore.reset}>Reset</button>
  </section>
  
  <section>
    <h2>Wallet Store</h2>
    <p>Connected: {walletStore.isConnected}</p>
    <p>Address: {walletStore.address || 'None'}</p>
  </section>
  
  <section>
    <h2>Theme Store</h2>
    <p>Current: {themeStore.current}</p>
    <button onclick={testTheme}>Toggle Theme</button>
  </section>
</div>

<style>
  section {
    margin: 2rem 0;
    padding: 1rem;
    border: 1px solid var(--fallback-bc);
  }
</style>
```

---

## 6. Acceptance Criteria

- [ ] 4 stores created with Svelte 5 Runes architecture
- [ ] All stores export typed read-only getters
- [ ] All stores provide explicit mutation methods
- [ ] Wizard store persists to localStorage
- [ ] Claim flow store persists to sessionStorage (no sensitive data)
- [ ] Wallet store does not persist (session-only)
- [ ] Theme store persists and applies on load
- [ ] All stores have `restore()` method
- [ ] Test page demonstrates all store functionality
- [ ] `pnpm run check` passes with zero errors
- [ ] No direct state mutations possible from external code

---

## 7. Testing Checklist

### Wizard Store

- **Scenario 1:** Fill step 1 → `canProceedFromStep1` = true
- **Scenario 2:** Refresh page → State restored from localStorage
- **Scenario 3:** Complete wizard → localStorage cleared
- **Scenario 4:** Reset wizard → State back to initial

### Claim Flow Store

- **Scenario 1:** Select distribution → Mode changes to 'claiming'
- **Scenario 2:** Generate proof → Proof stored in memory (not persisted)
- **Scenario 3:** Close tab → sessionStorage cleared, proof lost
- **Scenario 4:** Exit flow → State resets

### Wallet Store

- **Scenario 1:** "Connect" → isConnecting = true
- **Scenario 2:** Connected → Address populated
- **Scenario 3:** Wrong network (Mainnet) → isWrongNetwork = true
- **Scenario 4:** Disconnect → State resets

### Theme Store

- **Scenario 1:** Change theme → `data-theme` attribute updates
- **Scenario 2:** Refresh page → Theme persists
- **Scenario 3:** Clear localStorage → Defaults to 'nord'

---

## 8. Post-Development Report

- **Status:** Not Started
- **Pull Request:** N/A
- **Modified Files:** N/A
- **Created Files:** N/A
- **Technical Notes:** N/A

---

## 9. Review & Feedback

- **Reviewer:** TBD
- **Date:** TBD
- **Critical Findings:** N/A
- **Minor Suggestions:** N/A
- **Resolution:** N/A

---

## 10. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-24 | AI Agent | Initial backlog creation |

---
.

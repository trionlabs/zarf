# 🗺️ Zarf Web Application - Architectural Roadmap

> **Project Goal:** Migrate POC functionality to production-ready SvelteKit app with clean architecture, ZK privacy, and premium UX.

**Status:** Planning ✅ → Implementation 🚧  
**Timeline:** ~3-4 weeks (6 major phases)  
**Stack:** Svelte 5 (Runes), SvelteKit 2, Tailwind v4 (Oxide), DaisyUI v5, Noir ZK, Foundry

---

## 📐 Project Structure (Final State)

```
web/
├── _backlogs/                    # Project SSoT (All backlogs live here)
│   ├── __backlogs_index.md       # Master index (roadmap tracker)
│   ├── __backlog_template.md     # Standard template
│   ├── 001-project-foundation.md # ✅ Completed
│   ├── 002-core-ui-components.md # ✅ Completed
│   ├── 003-utility-migration.md  # 🚧 Phase 1
│   ├── 004-state-stores.md       # 🚧 Phase 1
│   ├── 005-landing-page.md       # 📋 Phase 2
│   ├── 006-wizard-foundation.md  # 📋 Phase 3
│   ├── 007-wizard-completion.md  # 📋 Phase 3
│   ├── 008-claim-portal.md       # 📋 Phase 4
│   └── 009-distributions.md      # 📋 Phase 5
│
├── docs/                         # Technical documentation
│   ├── svelte5_guide.md
│   ├── tailwind_v4_guide.md
│   ├── glassmorphism_v4.md
│   └── ui_pages/                 # UI/UX specs (from product)
│       ├── 01_landing_page.md
│       ├── 02_wizard_page.md
│       ├── 03_claim_page.md
│       └── 04_distributions_page.md
│
├── src/
│   ├── lib/
│   │   ├── auth/                 # Authentication utilities
│   │   │   └── googleAuth.ts
│   │   │
│   │   ├── crypto/               # ZK and cryptographic utilities
│   │   │   ├── jwtProver.ts
│   │   │   └── merkleTree.ts
│   │   │
│   │   ├── csv/                  # CSV processing
│   │   │   └── csvProcessor.ts
│   │   │
│   │   ├── contracts/            # Blockchain interaction
│   │   │   ├── wallet.ts
│   │   │   └── contracts.ts
│   │   │
│   │   ├── workers/              # Web Workers (ZK compute)
│   │   │   ├── zkProver.worker.ts
│   │   │   └── merkleProof.worker.ts
│   │   │
│   │   ├── stores/               # Global state (.svelte.ts)
│   │   │   ├── wizardStore.svelte.ts
│   │   │   ├── claimFlowStore.svelte.ts
│   │   │   ├── walletStore.svelte.ts
│   │   │   └── themeStore.svelte.ts
│   │   │
│   │   └── components/
│   │       ├── ui/               # Atomic (dumb) components
│   │       │   ├── GlassPanel.svelte
│   │       │   ├── Button.svelte
│   │       │   ├── Input.svelte
│   │       │   ├── Badge.svelte
│   │       │   └── Modal.svelte
│   │       │
│   │       ├── wizard/           # Wizard-specific components
│   │       │   ├── WizardCard.svelte
│   │       │   ├── WizardNavBar.svelte
│   │       │   └── MobileStepIndicator.svelte
│   │       │
│   │       ├── claim/            # Claim-specific components
│   │       │   ├── ClaimableItem.svelte
│   │       │   ├── ClaimTimeline.svelte
│   │       │   └── ZKProofProgress.svelte
│   │       │
│   │       └── distributions/    # Distributions components
│   │           ├── DistributionCard.svelte
│   │           └── StatusBadge.svelte
│   │
│   └── routes/
│       ├── +layout.svelte        # Global layout (header, background)
│       ├── +page.svelte          # Landing page (/)
│       │
│       ├── wizard/
│       │   ├── +page.svelte      # Wizard container
│       │   └── components/
│       │       ├── TokenDetailsForm.svelte      # Step 1
│       │       ├── ScheduleForm.svelte          # Step 2
│       │       ├── RecipientsForm.svelte        # Step 3
│       │       ├── RegulatorySettings.svelte    # Step 4
│       │       ├── ReviewForm.svelte            # Step 5
│       │       └── DeployForm.svelte            # Step 6
│       │
│       ├── claim/
│       │   ├── +page.svelte      # Claim dashboard + flow
│       │   └── components/
│       │       ├── ClaimTimeline.svelte         # Step 1
│       │       ├── WalletForm.svelte            # Step 2
│       │       ├── ComplianceCheck.svelte       # Step 3
│       │       ├── ReviewForm.svelte            # Step 4
│       │       └── PrivateClaimForm.svelte      # Step 5
│       │
│       └── distributions/
│           ├── +page.svelte      # Distributions list
│           └── components/
│               ├── DistributionItem.svelte
│               └── StatusBadge.svelte
│
├── static/                       # Static assets
│   └── background.png
│
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## 🎯 Development Phases

### **Phase 0: Foundation** ✅ (Completed)

**Backlogs:** 001, 002  
**Duration:** Completed  
**Scope:**

- SvelteKit + Tailwind v4 + DaisyUI setup
- Theme system (Nord + Wireframe)
- Core UI components (GlassPanel, Button, Input, Badge, Modal)

---

### **Phase 1: Core Infrastructure** 🚧 (Current)

**Backlogs:** 003, 004  
**Duration:** 2-3 days  
**Scope:**

1. **Utility Migration** (003)
   - Migrate 6 utility modules from `poc/src/lib/` to `web/src/lib/`
   - Convert `.js` → `.ts` with strict typing
   - Add JSDoc documentation
   - Unit test coverage

2. **State Management** (004)
   - Create Svelte 5 stores using Runes
   - `wizardStore.svelte.ts` - Wizard state & validation
   - `claimFlowStore.svelte.ts` - Claim flow state
   - `walletStore.svelte.ts` - Wallet connection & account
   - localStorage persistence strategy

**Deliverables:**

- All POC utilities migrated and typed
- 4 global stores with clean APIs
- Zero runtime errors on `pnpm check`

---

### **Phase 2: Landing Page** 📋

**Backlog:** 005  
**Duration:** 1 day  
**Scope:**

- Hero section with ZKVest branding
- "Start Wizard" CTA button
- Background integration
- SEO meta tags
- Mobile responsive

**Acceptance:**

- User can navigate to `/wizard` via CTA
- Perfect Lighthouse score (Performance 95+)
- Works on mobile/tablet/desktop

---

### **Phase 3: Wizard (Distribution Creation)** 📋

**Backlogs:** 006, 007  
**Duration:** 5-6 days  
**Scope:**

#### **3A: Wizard Foundation** (006)

- Wizard shell architecture
  - WizardCard container
  - WizardNavBar (desktop sidebar)
  - MobileStepIndicator (mobile progress)
- Step navigation logic
- State persistence (localStorage)
- Steps 1-2 implementation:
  - **Step 1:** Token Details (name, icon, address, amount)
  - **Step 2:** Schedule (cliff date, duration)

#### **3B: Wizard Completion** (007)

- Steps 3-6 implementation:
  - **Step 3:** Recipients (CSV upload, drag-drop, validation)
  - **Step 4:** Regulatory Settings (compliance rules selection)
  - **Step 5:** Review (data summary, validation)
  - **Step 6:** Deploy (contract deployment, tx tracking)
- CSV processing integration
- Merkle tree generation
- Contract deployment flow
- Error handling & retry logic

**Acceptance:**

- User can complete entire wizard flow
- CSV parsing works with 1000+ entries
- Contract deploys successfully on testnet
- State persists across page refresh
- All validations trigger correctly

---

### **Phase 4: Claim Portal** 📋

**Backlog:** 008  
**Duration:** 5-6 days  
**Scope:**

#### **Dashboard Mode**

- List of claimable distributions
- Card-based UI with status badges
- Filter by status (Vesting, Claimable, Claimed)
- Empty state design

#### **Claim Flow (5 Steps)**

- **Step 1:** Timeline & Selection (visual calendar, tranche selection)
- **Step 2:** Wallet Selection (connect wallet, select recipient address)
- **Step 3:** Compliance Check (ZK proof generation via Web Worker)
- **Step 4:** Review (amount, fee estimation, confirmation)
- **Step 5:** Private Claim (submit proof, tx tracking, success state)

#### **ZK Integration**

- Move proof generation to Web Worker
- Progress UI (proving state)
- Error recovery (retry mechanism)
- Front-running protection (wallet binding)

**Acceptance:**

- User can claim tokens privately
- ZK proof generates without freezing UI (Web Worker)
- Transaction succeeds on testnet
- Privacy preserved (no email leak on-chain)
- Gas estimation accurate

---

### **Phase 5: Distributions Management** 📋

**Backlog:** 009  
**Duration:** 2-3 days  
**Scope:**

- Admin dashboard for project owners
- List all deployed distributions
- Status tracking (Active, Paused, Ended, Not Started)
- Key metrics display:
  - Total locked
  - Total claimed
  - Recipients count
  - Next unlock date
- Glass panel design (matches Figma)
- Empty state for new users

**Acceptance:**

- Owner can view all their distributions
- Metrics update in real-time (or on refresh)
- "Create New" CTA navigates to wizard
- Responsive on all devices

---

### **Phase 6: Polish & Production Readiness** 📋

**Backlog:** 010  
**Duration:** 2-3 days  
**Scope:**

- **Performance:**
  - Code splitting
  - Image optimization
  - Bundle size analysis
- **Accessibility:**
  - ARIA labels
  - Keyboard navigation
  - Screen reader testing
- **SEO:**
  - Meta tags for all pages
  - Open Graph images
  - Sitemap generation
- **Error Boundaries:**
  - Global error handler
  - User-friendly error messages
- **Analytics:**
  - Event tracking (optional)
- **Final QA:**
  - Cross-browser testing (Chrome, Firefox, Safari)
  - Mobile testing (iOS, Android)
  - E2E test suite (Playwright)

---

## 📊 Progress Tracking

| Phase | Status | Backlogs | Progress | ETA |
|-------|--------|----------|----------|-----|
| **0. Foundation** | ✅ Done | 001-002 | 100% | Completed |
| **1. Infrastructure** | 🚧 In Progress | 003-004 | 0% | Dec 26 |
| **2. Landing** | 📋 Planned | 005 | 0% | Dec 27 |
| **3. Wizard** | 📋 Planned | 006-007 | 0% | Jan 2 |
| **4. Claim** | 📋 Planned | 008 | 0% | Jan 8 |
| **5. Distributions** | 📋 Planned | 009 | 0% | Jan 11 |
| **6. Polish** | 📋 Planned | 010 | 0% | Jan 14 |

**Overall Progress:** 2/10 backlogs completed (20%)

---

## 🎓 Engineering Principles

Every backlog and every line of code must follow:

1. **U-A-P-C-B-I-V-C Workflow** (Understand → Analyze → Plan → Critic → Backlog → Implement → Verify → Commit)
2. **Svelte 5 Runes** (No `export let`, use `$state`, `$derived`, `$props`)
3. **Tailwind v4 CSS-First** (No `tailwind.config.js`, all tokens in `@theme`)
4. **OKLCH Colors** (No hex/rgb, use `oklch()`)
5. **Worker-First ZK** (Any computation >16ms must be in Web Worker)
6. **Strict Typing** (No `any`, all props have interfaces)
7. **Clean Markup** (No logic in HTML, use `$derived`)
8. **Zen Minimal Aesthetic** (Nord + Glassmorphism v4)

---

## 🔗 Key References

- **Workflow:** `.agent/workflows/dev.md`
- **FE Rules:** `.agent/rules/fe-rules.md`
- **Backlog Template:** `web/_backlogs/__backlog_template.md`
- **UI Specs:** `web/docs/ui_pages/`
- **Legacy Code:** `poc/src/` (reference only, do not import)

---

## 🚀 Next Action

**Now:** Create Backlog 003 (Utility Migration)  
**Command:** Review and approve this roadmap, then proceed to detailed backlog creation.

---

_Last Updated: 2025-12-24_  
_Version: 1.0_

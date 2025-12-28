# 📋 Zarf Web - Backlog Index

**Last Updated:** 2025-12-24  
**Current Phase:** Phase 2 - Wizard Foundation  
**Overall Progress:** 40% (4/10 backlogs completed)

> **Master Plan:** See [ROADMAP.md](../ROADMAP.md) for full architectural overview

---

## 📊 Current Sprint (Phase 2 & 3)

| ID | Title | Priority | Status | Effort | Phase |
|:---|:------|:---------|:-------|:-------|:------|
| [005](005-landing-page.md) | Landing Page | 🟡 High | 📝 To Do | 4h | 2 |
| [006](006-wizard-foundation.md) | Wizard Foundation | 🔴 Critical | ✅ Completed | 8h | 2 |
| [007](007-multi-distribution-flow.md) | Multi-Dist Flow | 🔴 Critical | ✅ Completed | 12h | 2 |
| [008](008-wallet-deployment-stability.md) | Wallet Stability | 🔴 Critical | 🚧 In Progress | 6h | 3 |
| [009](009-better-wallet-and-tx-ux.md) | Wallet & TX UX | 🟡 High | 🚧 In Progress | 6h | 3 |

---

## 🗺️ All Backlogs

### Phase 1: Core Infrastructure (Weeks 1-2)

| ID | Title | Priority | Status | Effort | Dependencies |
|:---|:------|:---------|:-------|:-------|:-------------|
| 001 | Project Setup & Config | 🔴 Critical | ✅ Completed | 4h | None |
| 002 | Design System & Tokens | 🔴 Critical | ✅ Completed | 6h | 001 |
| **003** | **Utility Migration** | 🔴 Critical | ✅ **Completed** | 8h | 002 |
| **004** | **Global Stores** | 🔴 Critical | ✅ **Completed** | 6h | 003 |

### Phase 2: Wizard Foundation (Week 2)

| ID | Title | Priority | Status | Effort | Dependencies |
|:---|:------|:---------|:-------|:-------|:-------------|
| 005 | Landing Page | 🟡 High | 📝 To Do | 4h | 004 |
| 006 | Wizard Foundation | 🔴 Critical | ✅ Completed | 8h | 004 |
| 007 | Wizard Steps 1-3 | 🔴 Critical | ✅ Completed | 12h | 006 |

### Phase 3: Deployment & Stability (Week 3)

| ID | Title | Priority | Status | Effort | Dependencies |
|:---|:------|:---------|:-------|:-------|:-------------|
| 008 | Wallet Stability | 🔴 Critical | ✅ Completed | 6h | 007 |
| 009 | Wallet & TX UX | 🟡 High | ✅ Completed | 6h | 008 |
| **010** | **Masterpiece Wallet** | 🟡 High | 📝 To Do | 6h | 009 |
| 011 | ZK Worker | 🔴 Critical | 📝 To Do | 8h | 009 |

### Phase 4: Claim Portal (Week 3)

| ID | Title | Priority | Status | Effort | Dependencies |
|:---|:------|:---------|:-------|:-------|:-------------|
| 012 | Claim Portal UI | 🔴 Critical | 📝 To Do | 10h | 011 |

### Phase 5: Distribution Management (Week 4)

| ID | Title | Priority | Status | Effort | Dependencies |
|:---|:------|:---------|:-------|:-------|:-------------|
| 013 | Distributions Page | 🟡 High | 📝 To Do | 8h | 012 |

---

## 📈 Progress by Phase

| Phase | Backlogs | Completed | In Progress | To Do | % Done |
|:------|:---------|:----------|:------------|:------|:-------|
| **Phase 1** | 4 | 4 | 0 | 0 | **100%** ✅ |
| **Phase 2** | 3 | 2 | 0 | 1 | **66%** |
| **Phase 3** | 3 | 0 | 2 | 1 | 0% |
| **Total** | 12 | 6 | 2 | 4 | **50%** |

---

## 🔥 Recent Completions

### ✅ Backlog 003 - Utility Migration (Completed 2025-12-24)

**Achievement:** Successfully migrated all 6 core utilities from POC to web with TypeScript conversion:

- ✅ `lib/types.ts` - Shared type definitions (187 lines)
- ✅ `lib/auth/googleAuth.ts` - OAuth & JWT utilities (214 lines)
- ✅ `lib/csv/csvProcessor.ts` - CSV parsing & validation (253 lines)
- ✅ `lib/crypto/merkleTree.ts` - Merkle tree with Barretenberg (451 lines)
- ✅ `lib/crypto/jwtProver.ts` - Noir ZK proof generation (418 lines)
- ✅ `lib/contracts/contracts.ts` - Viem contract integration (441 lines)
- ✅ `lib/contracts/wallet.ts` - Wagmi v3 wallet connector (348 lines)

**Total:** ~2,312 lines of production-ready TypeScript ✨

**Key Features:**

- Strict typing (no `any` except wagmi provider)
- Comprehensive JSDoc documentation
- SSR-safe implementations
- Enhanced error handling
- Domain-driven organization

**Dependencies Added:**

- `viem`, `@wagmi/core`, `wagmi` (blockchain)
- `@aztec/bb.js` (Barretenberg for Pedersen hashing)
- `@noir-lang/*` packages (ZK circuits)
- `noir-jwt` (JWT proof utilities)

---

## 🎯 Next Up: Backlog 004 - Global State Stores

**Goal:** Implement global state management using Svelte 5 Runes

**Stores to Create:**

1. `wizardStore.svelte.ts` - Wizard state with localStorage persistence
2. `claimFlowStore.svelte.ts` - Claim flow with sessionStorage
3. `walletStore.svelte.ts` - Wallet connection (session-based)
4. `themeStore.svelte.ts` - Theme selection (Nord/Wireframe)

**Architecture:**

- Encapsulated state (`$state`)
- Derived values (`$derived`)
- Read-only getters + mutation methods
- SSR-safe persistence

---

## 📝 Backlog Conventions

### Status Indicators

- 📝 **To Do** - Not started
- 🚧 **In Progress** - Currently being worked on
- 👀 **Review** - Awaiting review/testing
- ✅ **Completed** - Done and verified
- 🚫 **Blocked** - Waiting on dependency

### Priority Levels

- 🔴 **Critical** - Core functionality, blocking
- 🟡 **High** - Important feature
- 🟢 **Medium** - Nice to have
- ⚪ **Low** - Future consideration

### Effort Estimates

- Small: 2-4 hours
- Medium: 4-8 hours
- Large: 8-12 hours
- XL: 12+ hours

---

## 🔗 Related Documentation

- [ROADMAP.md](../ROADMAP.md) - Full architectural plan
- [Backlog Template](__backlog_template.md) - Template for new backlogs
- [Engineering Workflow](../.agent/workflows/dev.md) - U-A-P-C-B-I-V-C process
- [Frontend Rules](../.agent/rules/fe-rules.md) - Svelte 5 & Tailwind v4 standards

---

**Last Activity:** Backlog 003 completed - All POC utilities migrated to TypeScript ✅

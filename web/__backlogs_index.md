# Zarf Frontend Backlog Index

> **Roadmap:** See `ROADMAP.md` for architectural overview and timeline.

## 📊 Progress Tracker

**Phase 0: Foundation** ✅ Completed  
**Phase 1: Infrastructure** 🚧 In Progress (0%)  
**Overall:** 2/10 backlogs completed (20%)

---

## 🗂️ Backlog Registry

| ID | Title | Priority | Status | Phase | Effort |
|----|-------|----------|--------|-------|--------|
| 001 | Project Foundation & Design System | Critical | ✅ Completed | 0 | - |
| 002 | Core UI Component Library | Critical | ✅ Completed | 0 | - |
| 003 | Utility Migration from POC | Critical | 📋 Backlog | 1 | 2-3 days |
| 004 | Global State Stores (Runes) | Critical | 📋 Backlog | 1 | 2 days |
| 005 | Landing Page | High | 📋 Planned | 2 | 1 day |
| 006 | Wizard Foundation (Steps 1-2) | Critical | 📋 Planned | 3 | 3 days |
| 007 | Wizard Completion (Steps 3-6) | Critical | 📋 Planned | 3 | 3-4 days |
| 008 | Claim Portal (Private Claims) | Critical | 📋 Planned | 4 | 5-6 days |
| 009 | Distributions Dashboard | High | 📋 Planned | 5 | 2-3 days |
| 010 | Production Polish & QA | Medium | 📋 Planned | 6 | 2-3 days |

---

## 📁 Backlog Files

- `__backlog_template.md` - Standard template
- `001-project-foundation.md` - SvelteKit setup ✅
- `002-core-ui-components.md` - Atomic components ✅
- `003-utility-migration.md` - POC utilities to TypeScript
- `004-state-stores.md` - Svelte 5 Runes stores
- `005-landing-page.md` - (To be created)
- `006-wizard-foundation.md` - (To be created)
- `007-wizard-completion.md` - (To be created)
- `008-claim-portal.md` - (To be created)
- `009-distributions.md` - (To be created)
- `010-production-polish.md` - (To be created)

---

## 🎯 Current Sprint

**Focus:** Phase 1 - Core Infrastructure  
**Active Backlogs:** 003, 004  
**Goal:** Migrate all POC utilities and implement global state management

**Next Up:** Phase 2 - Landing Page (Backlog 005)

## 🚨 Critical Tech Debt (Detected 2025-12-24)
- [ ] **Worker Migration:** Move ZK proof generation to `web/src/lib/workers/` to prevent main thread blocking. (Ref: @FE_DEV.md Section 4.1)
# ID: 006 - Wizard 3-Column Layout with Context Panel

## 1. Metadata

- ID: 006
- Title: Wizard 3-Column Layout with Live Preview Panel
- Type: Refactor
- Priority: High
- Effort: 4-6 hours
- Status: Backlog
- Dependencies: 001 (Project Foundation)
- Persistence: Local (wizardStore)

### 1.1. Stack Verification (2025 Standard)

- [ ] Svelte 5 (Runes): No `export let`, using `$state`, `$derived`, `$props`.
- [ ] Tailwind v4: CSS-first theme, no `tailwind.config.js` logic.
- [ ] OKLCH Colors: All color values use `oklch()` format (no hex/rgb/hsl).
- [ ] Biome Ready: Lint & Format check.
- [ ] ZK Compatibility: N/A for this backlog

## 2. Problem Analysis

- Current State: 
  - Wizard uses 2-column layout (sidebar + content)
  - Sidebar takes ~200px but only shows 4 steps
  - Form content is cramped in the middle
  - No real-time preview of user inputs
  - Right side of screen is completely unused

- Pain Points:
  - Inefficient use of horizontal space
  - No visual feedback as user fills form
  - No validation status visibility
  - Vesting schedule lacks visual timeline

- Desired State:
  - 3-column layout: Steps | Form | Context Panel
  - Live preview showing token stats, timeline, validation
  - Responsive design (mobile: bottom sheet, tablet: drawer)
  - Better space utilization on all screen sizes

- Impact Analysis:
  - Frontend: Major layout restructure, new components
  - Contracts/Circuits: None
  - Security: None

- Scope Decisions:
  - Included: 
    - 3-column desktop layout
    - Context panel with live stats, timeline, validation
    - Mobile responsive (bottom sheet pattern)
    - Tablet responsive (collapsible drawer)
  - Excluded:
    - Wizard flow changes (step order remains same)
    - Form field changes
    - Backend integration

## 3. Technical Design

- Warnings: 
  - Context panel should NOT block form interaction
  - Mobile bottom sheet must not cause layout shift
  - Timeline SVG must scale properly

- Logic Pattern:
  - Wrong: Putting context panel inside each step page (duplicated code)
  - Right: Context panel in layout.svelte, reading from wizardStore

## 4. Pre-Dev: Affected Files & Functions

- `web/src/routes/wizard/+layout.svelte` -> Main layout: Restructure to 3-column grid
- `web/src/lib/components/wizard/ContextPanel.svelte` -> New: Live preview component
- `web/src/lib/components/wizard/VestingTimeline.svelte` -> New: Visual timeline SVG
- `web/src/lib/components/wizard/ValidationStatus.svelte` -> New: Checklist component
- `web/src/lib/components/wizard/MobilePreviewSheet.svelte` -> New: Bottom sheet for mobile
- `web/src/routes/wizard/step-1/+page.svelte` -> Minor: Remove internal max-width constraints

## 5. Implementation Steps

### Phase 1: Layout Restructure (Desktop)

1. [ ] Update `+layout.svelte` to use CSS Grid: `grid-cols-[180px_1fr_280px]`
2. [ ] Shrink sidebar width from 200px to 180px
3. [ ] Add right column placeholder for context panel
4. [ ] Adjust main content area padding

### Phase 2: Context Panel Components

5. [ ] Create `ContextPanel.svelte` container component
6. [ ] Create `StatsPanel.svelte` - Token name, recipients count, total tokens
7. [ ] Create `VestingTimeline.svelte` - SVG visual timeline with markers
8. [ ] Create `ValidationStatus.svelte` - Checklist of required fields

### Phase 3: Live Reactivity

9. [ ] Connect ContextPanel to wizardStore via `$derived`
10. [ ] Add auto-update when form fields change
11. [ ] Show real-time validation status

### Phase 4: Mobile Responsiveness

12. [ ] Add `lg:hidden` horizontal stepper for mobile
13. [ ] Hide sidebar on mobile (`hidden lg:flex`)
14. [ ] Create `MobilePreviewSheet.svelte` - Bottom sheet pattern
15. [ ] Add swipe-up gesture support
16. [ ] Sticky footer with "Next Step" button on mobile

### Phase 5: Tablet Responsiveness

17. [ ] Add collapsible drawer for context panel (768-1279px)
18. [ ] Toggle button in header for drawer
19. [ ] Overlay backdrop when drawer open

### Phase 6: Polish

20. [ ] Add fade-in animations for panels
21. [ ] Test all breakpoints
22. [ ] Ensure accessibility (keyboard nav, screen reader)

## 6. Acceptance Criteria

- [ ] Desktop: 3-column layout visible and functional
- [ ] Context panel updates live as user types
- [ ] Vesting timeline shows correct dates based on input
- [ ] Validation status shows check/X for each field
- [ ] Mobile: Bottom sheet works with swipe gesture
- [ ] Tablet: Drawer collapses/expands correctly
- [ ] No horizontal scroll on any breakpoint
- [ ] All existing wizard functionality preserved

## 7. Testing Checklist

- Scenario 1: Enter token name -> Stats panel shows name immediately
- Scenario 2: Enter invalid address -> Validation shows error
- Scenario 3: Set cliff date + duration -> Timeline updates
- Scenario 4: Resize to mobile -> Layout switches to single column
- Scenario 5: Swipe up bottom sheet -> Preview visible
- Environments: Chrome, Safari, Firefox; Desktop, Tablet, Mobile

## 8. Post-Development Report

- Status: Backlog
- Pull Request: [TBD]
- Modified Files: [TBD]
- Created Files: [TBD]
- Technical Notes: [TBD]

## 9. Review & Feedback

- Reviewer: [TBD]
- Date: [TBD]
- Critical Findings: [TBD]
- Minor Suggestions: [TBD]
- Resolution: [TBD]

## 10. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2024-12-24 | AI | Initial backlog created |

---

## Visual Reference

### Desktop (1280px+)
```
┌────────┬────────────────────────────┬─────────────────┐
│ STEPS  │         MAIN FORM          │  CONTEXT PANEL  │
│ 180px  │         ~500px             │     280px       │
│        │                            │                 │
│ ① Conf │  Configuration             │  📊 Stats       │
│ ② Dist │  [Form fields...]          │  ⏳ Timeline    │
│ ③ Depl │                            │  ✅ Validation  │
│ ④ Done │           [Next →]         │                 │
└────────┴────────────────────────────┴─────────────────┘
```

### Mobile (<768px)
```
┌──────────────────────────┐
│ ① ─ ② ─ ③ ─ ④           │
├──────────────────────────┤
│ Configuration            │
│ [Form fields...]         │
├──────────────────────────┤
│ 📊 Preview      [↑]      │
│     [Next Step →]        │
└──────────────────────────┘
```

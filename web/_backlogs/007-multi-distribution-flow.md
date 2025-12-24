# ID: 007 - Multi-Distribution Flow Refactor

## 1. Metadata

- ID: 007
- Title: Multi-Distribution Flow Refactor
- Type: Refactor
- Priority: High
- Effort: 2 Days
- Status: In-Progress
- Dependencies: 004 (Stores)
- Persistence: Local

### 1.1. Stack Verification (2025 Standard)

- [ ] Svelte 5 (Runes): No `export let`, using `$state`, `$derived`, `$props`.
- [ ] Tailwind v4: CSS-first theme, no `tailwind.config.js` logic.
- [ ] OKLCH Colors: All color values use `oklch()` format (no hex/rgb/hsl).
- [ ] Biome Ready: Lint & Format check.
- [ ] ZK Compatibility: N/A for this UI flow.

## 2. Problem Analysis

- Current State: The wizard currently assumes a 1:1 relationship between the session and a single distribution (Token -> 1 Distribution -> Deploy).
- Pain Points: Users often need to create multiple vesting schedules (e.g., Team, Investors, Advisors) for the same token in one go. The current flow forces them to restart the wizard for each one.
- Desired State:
    1. **Step 0 (Start Here):** Enter Token Address & Fetch Metadata.
    2. **Step 1 (Builder):** Create multiple distributions. Each distribution has its own Name, Vesting Schedule, Whitelist, and Regulatory Settings.
    3. **Step 2 (Review):** Review the "basket" of distributions before deployment.
- Impact Analysis:
  - Frontend: Major refactor of `wizardStore` data structure and `step-1` UI logic.
  - Contracts/Circuits: N/A (UI only for now, deployment logic will need to loop later).
  - Security: Ensure CSV data for multiple distributions doesn't leak/mix.

## 3. Technical Design

- **Store Structure Change:**
  - Move `schedule`, `recipients`, `distributionAmount`, `distributionName` out of the root level and into a `Distribution` interface.
  - Add `distributions: Distribution[]` to the store.
  - `tokenDetails` stays at root.
- **UI Logic:**
  - `step-0`: Validates token & fetches metadata.
  - `step-1`: Displays list of added distributions. Has a "Create Distribution" action that opens a form (Modal or Slide-over) to configure a single distribution.
  - `step-2`: Read-only view of the `distributions` array.

## 4. Pre-Dev: Affected Files & Functions

- `src/lib/stores/types.ts` -> Update `WizardState` and create `Distribution` type.
- `src/lib/stores/wizardStore.svelte.ts` -> Refactor state to hold `distributions` array. Update getters/actions.
- `src/routes/wizard/step-0/+page.svelte` -> Move Token Input logic here.
- `src/routes/wizard/step-1/+page.svelte` -> Convert to "Builder Dashboard". Add "Add Distribution" sub-flow.
- `src/routes/wizard/step-2/+page.svelte` -> Convert to "Basket Review".

## 5. Implementation Steps

1. **Refactor Types:** Update `types.ts` to support multi-distribution structure.
2. **Refactor Store:** Update `wizardStore` to match new types. Add `addDistribution`, `removeDistribution`, `updateDistribution`.
3. **Update Step 0:** Implement Token Entry & Metadata Fetching.
4. **Update Step 1:**
    - Build "Distribution List" view.
    - Build "Create Distribution" form (Name, Vesting, Whitelist, Regulatory).
    - detailed validation for the sub-form.
5. **Update Step 2:** Implement Summary View.
6. **Verify:** Test creating multiple distributions and reviewing them.

## 6. Acceptance Criteria

- [ ] User enters Token ID at Step 0 and clicks Start.
- [ ] User lands on Step 1 and sees empty list.
- [ ] User clicks "Create Distribution" and fills out: Name, Vesting, Whitelist, Regulatory.
- [ ] User saves distribution; it appears in the list.
- [ ] User can add a second distribution.
- [ ] User proceeds to Step 2 and sees both distributions summarized.
- [ ] Total token amount matches sum of all distributions.

## 7. Testing Checklist

- Scenario 1: Add 1 distribution -> Review.
- Scenario 2: Add 2 distributions -> Review.
- Scenario 3: Delete a distribution from Step 1 list.
- Scenario 4: Edit a distribution (optional, if scope permits).

## 8. Post-Development Report

- Status: In-Progress

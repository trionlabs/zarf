# 🎨 Zarf Front-End Engineering & UI/UX Standards (2025)

**Focus:** Master-level Svelte 5 implementation, DaisyUI v5 theming, and High-Performance Logic.
**Philosophy:** The UI is a direct reflection of state. Use built-in, battle-tested components.
**Status:** Primary Source of Truth (SSoT) for Zarf Frontend.

---

## 🚀 1. Lifecycle: Engineering Workflow (U-A-P-C-B-I-V-C)

We do not "just code." Every change follows the **U-A-P-C-B-I-V-C** progression to ensure logic correctness and privacy preservation.

1. **Understand:** Deep-dive into the ZK context. Does this affect the Circuit or Public Inputs?
2. **Analyze:** Map affected files. Identify dependencies (Noir, Solidity, or UI).
3. **Plan:** Draft an Implementation Plan.
4. **Critic:** Self-audit the plan for Data Leakage (e.g., salt leaks) and Performance.
5. **Backlog:** Register the task in `web/_backlogs/` using the approved template (`__backlog_template.md`).
6. **Implement:** Code according to the "Mastery Standards" below.
7. **Verify:** Run `pnpm check`, `nargo test`, and `forge test`.
8. **Commit:** Atomic commits with conventional types.

---

## ⚡ 2. Core: Svelte 5 Mastery (Runes Engineering)

### 2.1 The "Derived-First" Rule

* **Principle:** 90% of your logic should be `$derived`.
* **Constraint:** Never use `$effect` to sync two local states. Use `$derived` to compute the UI representation of raw data.
* **Clean Markup:** Never use logical operators (`&&`, `||`) directly in HTML templates. Move them to a `$derived` variable (e.g., `{#if canSubmit}` instead of `{#if !loading && valid}`).

### 2.2 Reactivity Standards

* **`$state()`**: Use for all reactive data. Favor `$state.raw()` for large immutable objects (like WASM modules) to optimize performance.
* **`$derived()`**: **Logic Workhorse.** Use for anything that can be calculated from state. Use `$derived.by(() => { ... })` for complex validation or filtering logic.
* **`$props()`**: Destructure props with explicit types (No `any`) and defaults. `let { data, status }: Props = $props();`
* **`$effect()`**: Use strictly for external side-effects (e.g., `canvas` rendering, `localStorage`, `IntersectionObserver`). **Never** use to synchronize state.

### 2.3 State Encapsulation (`.svelte.ts`)

* **Pattern:** Move complex UI logic (modals, dropdowns, form states) into `.svelte.ts` files.
* **Encapsulation:** Use `get` syntax to expose state as read-only. Only expose specific mutation functions to ensure unidirectional data flow.

---

## 🎨 3. Styling: DaisyUI v5 + Tailwind CSS v4 (MANDATORY)

### 3.1 ⚠️ CRITICAL: DaisyUI Components Only

**Zarf uses ONLY DaisyUI's built-in components and themes. NO custom UI components.**

| Rule | Description |
|------|-------------|
| ❌ **FORBIDDEN** | Creating custom `Button.svelte`, `Input.svelte`, `Modal.svelte`, `Card.svelte` wrappers |
| ❌ **FORBIDDEN** | Custom color definitions in `app.css` (e.g., `--color-primary`, `--color-canvas`) |
| ❌ **FORBIDDEN** | Custom shadow utilities (e.g., `shadow-glass`, `--shadow-glass`) |
| ❌ **FORBIDDEN** | Custom glassmorphism recipes or blur effects |
| ✅ **REQUIRED** | Use native DaisyUI classes: `btn`, `btn-primary`, `input`, `card`, `modal`, `badge` |
| ✅ **REQUIRED** | Use DaisyUI built-in themes via `@plugin "daisyui" { themes: ... }` |
| ✅ **REQUIRED** | Use DaisyUI semantic colors: `bg-base-100`, `text-base-content`, `bg-primary`, `text-error` |

### 3.2 The Minimal `app.css`

Your `app.css` should be **extremely minimal** - ideally under 10 lines:

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: nord --default, wireframe;
}
```

**That's it.** No `@theme` blocks, no custom colors, no custom shadows. DaisyUI handles everything.

### 3.3 Theme Selection

* **Approved Themes:** `nord` (default), `wireframe` (alternative)
* **Theme Switching:** Use DaisyUI's `theme-controller` class on radio/checkbox inputs
* **HTML Setup:** `<html data-theme="nord">` in `app.html`

### 3.4 Component Usage Examples (STRICT)

**Why Strict?** DaisyUI themes handle borders and shadows differently.

* `Nord` uses **shadows** for depth.
* `Wireframe` uses **black borders** for structure.
* **Custom CSS breaks this logic.**

```html
<!-- ✅ CORRECT: Pure DaisyUI -->
<!-- The theme automatically decides if this needs a border or a shadow -->
<div class="card bg-base-100 shadow-xl">
    <div class="card-body">
        <h2 class="card-title">Distribution Settings</h2>
        
        <!-- Standard inputs automatically inherit theme focus states -->
        <input type="text" class="input input-bordered w-full" />
        
        <div class="card-actions justify-end">
             <button class="btn btn-primary">Save</button>
        </div>
    </div>
</div>

<!-- ❌ WRONG: Custom wrapper or "Utility Soup" -->
<!-- This forces a style that looks broken in 'Wireframe' theme -->
<div class="rounded-2xl border border-gray-200 shadow-lg p-6 bg-white">
     <h2 class="text-xl font-bold">Settings</h2>
     <!-- Wrappers hide implementation and break global theme updates -->
     <Input label="Email" />
     <Button variant="primary">Save</Button>
</div>

<!-- ❌ WRONG: Custom Glass Components -->
<GlassPanel class="p-8">...</GlassPanel>
```

### 3.5 Allowed Custom Components

Only **layout** and **domain-specific** components are allowed:

| Location | Purpose | Examples |
|----------|---------|----------|
| `lib/components/layout/` | Page structure, navigation | `ThemeSelector.svelte`, `Navbar.svelte`, `Footer.svelte` |
| `lib/components/domain/` | ZK/Business logic UI | `ProofStatus.svelte`, `WalletConnect.svelte`, `IdentityCard.svelte` |

**Never create generic UI wrappers.** Use DaisyUI directly.

---

## ⚙️ 4. Performance & Architecture

### 4.1 Resilience & ZK Patterns

* **Worker Isolation:** ZK Proof generation (ACVM + Barretenberg) **MUST** run in `web/src/lib/workers/`. Any computation taking >16ms moves to a Worker.
* **Visible States:** Proving flow must handle 3 states:
    1. **Idle:** Button active.
    2. **Proving:** `<span class="loading loading-spinner"></span>` + "Generating ZK Proof..." (Main thread free).
    3. **Error/Success:** Clear, recoverable feedback using DaisyUI `alert` component.
* **No Optimistic UI:** For ZK proofs, never assume success. Wait for the worker response.

### 4.2 Component Engineering

* **Snippets over Slots:** Use `{#snippet children()}` and `{@render children()}`. This provides better type safety and flexibility than the legacy `<slot />` system.
* **Project Structure:**

  ```
  lib/
  ├── components/
  │   ├── layout/     # ThemeSelector, Navbar, Footer
  │   └── domain/     # ZK-specific components
  ├── stores/         # Global state (.svelte.ts)
  ├── workers/        # Noir WASM proof generation
  └── utils.ts        # cn() helper, etc.
  ```

* **Static Rendering:** Use `onMount` to guard any logic that requires `window` or `document` to prevent hydration mismatches.

---

## 🛠️ 5. Backlog Strategy: Technical SSoT

* **Location:** Feature-specific backlogs live in `web/_backlogs/`.
* **Index:** Refer to `web/__backlogs_index.md` for the current roadmap status.
* **Stack Verification:** Every backlog must explicitly check:
  * [ ] No `export let` (Runes check).
  * [ ] No `tailwind.config.js` dependency.
  * [ ] No custom UI component wrappers.
  * [ ] Uses only DaisyUI built-in components.
  * [ ] WASM Prover moved to Web Worker.
* **Revision History:** Track design shifts and user feedback directly in the backlog file.

---

## ✅ 6. Quality & Review Checklist

Before declaring a UI task "Done", you must answer:

1. **DaisyUI Compliance:** Am I using ONLY DaisyUI classes? (No custom `Button.svelte`, etc.)
2. **Logic Check:** Did I remove all `&&` logic from the HTML? (Moved to `$derived`).
3. **Type Check:** Are all props typed? (No `any`).
4. **Runes:** Is reactivity explicit and optimized? (Using `$state.raw` for big objects?).
5. **Theme Compatibility:** Does the component look correct in both `nord` and `wireframe` themes?
6. **ZK Safety:** If this triggers a proof, is the main thread unblocked?
7. **Security:** Are there any console logs of private inputs?

---

## 🚫 7. Anti-Patterns (Immediate Block)

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| `<Button variant="primary">` | Custom wrapper | `<button class="btn btn-primary">` |
| `--color-primary: oklch(...)` | Custom color | Use DaisyUI theme colors |
| `shadow-glass`, `glass-panel` | Custom effects | Use DaisyUI's `glass` class or none |
| `bg-canvas`, `text-text-muted` | Custom tokens | Use `bg-base-100`, `text-base-content/70` |
| Main thread ZK proof | Performance killer | Move to Web Worker |
| `$: double = count * 2;` | Legacy reactivity | `let double = $derived(count * 2);` |
| `export let data;` | Legacy props | `let { data } = $props();` |
| `on:click` | Legacy events | `onclick` |

---

*Reference Guides:*

* `web/docs/svelte5_guide.md`
* `web/docs/tailwind_v4_guide.md`
* `web/docs/vite_updates.md`
* [DaisyUI Components](https://daisyui.com/components/)
* [DaisyUI Themes](https://daisyui.com/docs/themes/)

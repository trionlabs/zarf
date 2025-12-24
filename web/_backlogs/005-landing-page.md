# ID: 005 - Landing Page

## 1. Metadata

- **ID:** 005
- **Title:** Landing Page (Marketing Homepage)
- **Type:** Feature
- **Priority:** High
- **Effort:** 4 hours
- **Status:** ✅ Completed (2025-12-24)
- **Dependencies:** 004 (State Stores)
- **Route:** `/` (root)

### 1.1. Stack Verification (2025 Standard)

- [ ] Svelte 5 (Runes): Using `$state()`, `$derived()` in components
- [ ] DaisyUI Only: NO custom components, ONLY DaisyUI classes
- [ ] Nord/Wireframe: Compatible with BOTH themes
- [ ] Mobile Responsive: Works on all screen sizes
- [ ] TypeScript: Zero `any` types

---

## 2. Problem Analysis

### Current State

No landing page exists. Navigating to `/` shows default SvelteKit welcome page.

### Pain Points

1. **No Entry Point:** Users don't know what Zarf is or what they can do
2. **No Call-to-Action:** No clear path to Create Distribution or Claim Tokens
3. **No Branding:** No visual identity or value proposition

### Desired State

**Clean, professional landing page** with:

- Hero section explaining Zarf
- 2 primary CTAs (Create Distribution / Claim Tokens)
- Feature highlights (ZK Privacy, No KYC, Vesting)
- Footer with links

**Design Principles:**

- ✅ Pure DaisyUI components
- ✅ Nord/Wireframe theme compatible
- ✅ Mobile-first responsive
- ✅ Fast loading (no heavy assets)
- ✅ SEO-friendly (proper meta tags)

### Impact Analysis

**Frontend:**

- Entry point for all users
- Drives traffic to `/wizard` and `/claim`
- First impression of Zarf

**Contracts/Circuits:**

- No impact

**Security:**

- No sensitive data on landing page

### Scope Decisions

**Included:**

- Hero section with headline + subtitle
- 2 CTA buttons (Create / Claim)
- 3 feature cards (Privacy, No KYC, Vesting)
- Footer with links
- Theme selector
- Mobile responsive layout

**Excluded:**

- Blog/News section (future)
- Documentation links (future)
- Analytics integration (Phase 6)
- Animations (keeping it simple)

---

## 3. Technical Design

### Architecture: Single-Page Layout

```
routes/
└── +page.svelte          # Landing page
```

### Component Structure

```svelte
<script lang="ts">
  import { themeStore } from '$lib/stores/themeStore.svelte';
  import { onMount } from 'svelte';
  
  onMount(() => {
    themeStore.restore();
  });
</script>

<div class="min-h-screen flex flex-col">
  <!-- Hero Section -->
  <section class="hero min-h-screen">
    <div class="hero-content text-center">
      <!-- Headline + CTAs -->
    </div>
  </section>
  
  <!-- Features Section -->
  <section class="py-20">
    <div class="container mx-auto">
      <!-- 3 Feature Cards -->
    </div>
  </section>
  
  <!-- Footer -->
  <footer class="footer footer-center p-10 mt-auto">
    <!-- Links + Theme Toggle -->
  </footer>
</div>
```

### DaisyUI Components to Use

| Component | Usage |
|-----------|-------|
| `hero` | Hero section container |
| `btn btn-primary` | "Create Distribution" CTA |
| `btn btn-secondary` | "Claim Tokens" CTA |
| `card` | Feature cards |
| `footer` | Footer section |
| `swap` | Theme toggle |

### Warnings

- **NO Custom Components:** Use DaisyUI directly, no `<Hero />` or `<FeatureCard />` wrappers
- **NO Hardcoded Colors:** Use semantic DaisyUI colors only (`bg-base-100`, `text-primary`, etc.)
- **NO Graphics:** Keep it text-based for now, no SVG illustrations
- **Theme Testing:** Must look good in BOTH Nord AND Wireframe

---

## 4. Pre-Dev: Affected Files & Functions

### New Files to Create

| File Path | Purpose |
|-----------|---------|
| `routes/+page.svelte` | Landing page component |
| `routes/+page.ts` | Page metadata (SEO) |
| `lib/components/layout/ThemeToggle.svelte` | Theme switcher component |

### Types

No new types needed (using existing stores).

---

## 5. Implementation Steps

### Step 1: Create Page Metadata (15 min)

**File:** `routes/+page.ts`

```typescript
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
  return {
    title: 'Zarf - Privacy-Preserving Token Distribution',
    description: 'Create token distributions with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs. No KYC required.',
  };
};
```

### Step 2: Create Theme Toggle Component (30 min)

**File:** `lib/components/layout/ThemeToggle.svelte`

```svelte
<script lang="ts">
  import { themeStore } from '$lib/stores/themeStore.svelte';
  import { onMount } from 'svelte';
  
  onMount(() => {
    themeStore.restore();
  });
  
  function handleToggle() {
    themeStore.toggleTheme();
  }
</script>

<label class="swap swap-rotate">
  <input 
    type="checkbox" 
    checked={themeStore.current === 'wireframe'}
    onchange={handleToggle}
    aria-label="Toggle theme"
  />
  
  <!-- Sun icon (nord theme) -->
  <svg class="swap-on fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
  </svg>
  
  <!-- Moon icon (wireframe theme) -->
  <svg class="swap-off fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/>
  </svg>
</label>
```

### Step 3: Create Landing Page (2 hours)

**File:** `routes/+page.svelte`

```svelte
<script lang="ts">
  import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
  
  const features = [
    {
      title: '🔒 Zero-Knowledge Privacy',
      description: 'Claim tokens without revealing your email. Built with Noir ZK circuits.',
    },
    {
      title: '✅ No KYC Required',
      description: 'Privacy-first distribution. Only email verification needed.',
    },
    {
      title: '📅 Built-in Vesting',
      description: 'Configure cliff periods and vesting schedules. All on-chain.',
    },
  ];
</script>

<svelte:head>
  <title>Zarf - Privacy-Preserving Token Distribution</title>
  <meta name="description" content="Create token distributions with built-in vesting and privacy-preserving claims using Zero-Knowledge proofs." />
</svelte:head>

<div class="min-h-screen flex flex-col">
  <!-- Hero Section -->
  <section class="hero min-h-screen bg-base-200">
    <div class="hero-content text-center">
      <div class="max-w-2xl">
        <h1 class="text-5xl font-bold">
          Privacy-Preserving Token Distribution
        </h1>
        <p class="py-6 text-xl">
          Create vesting schedules and enable private token claims using Zero-Knowledge proofs. 
          No KYC. No compromises.
        </p>
        
        <div class="flex gap-4 justify-center flex-wrap">
          <a href="/wizard" class="btn btn-primary btn-lg">
            Create Distribution
          </a>
          <a href="/claim" class="btn btn-secondary btn-lg">
            Claim Tokens
          </a>
        </div>
        
        <div class="mt-8">
          <div class="badge badge-outline">Powered by Noir & Aztec</div>
          <div class="badge badge-outline ml-2">Deployed on Ethereum</div>
        </div>
      </div>
    </div>
  </section>
  
  <!-- Features Section -->
  <section class="py-20">
    <div class="container mx-auto px-4">
      <h2 class="text-3xl font-bold text-center mb-12">Why Zarf?</h2>
      
      <div class="grid md:grid-cols-3 gap-8">
        {#each features as feature}
          <div class="card shadow-xl">
            <div class="card-body">
              <h3 class="card-title">{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>
  
  <!-- Footer -->
  <footer class="footer footer-center p-10 bg-base-200 text-base-content mt-auto">
    <nav>
      <div class="grid grid-flow-col gap-4">
        <a href="/wizard" class="link link-hover">Create Distribution</a>
        <a href="/claim" class="link link-hover">Claim Tokens</a>
        <a href="/distributions" class="link link-hover">My Distributions</a>
      </div>
    </nav>
    
    <aside class="flex items-center gap-4">
      <p>© 2025 Zarf - Privacy-First Token Distribution</p>
      <ThemeToggle />
    </aside>
  </footer>
</div>
```

### Step 4: Test Both Themes (30 min)

1. Navigate to `http://localhost:5174/`
2. Verify Nord theme appearance
3. Toggle to Wireframe theme
4. Verify Wireframe theme appearance
5. Test mobile responsiveness (resize browser)
6. Test CTA links (should navigate to `/wizard` and `/claim`)

### Step 5: SEO & Meta Tags (30 min)

Update `app.html` with proper meta tags:

```html
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Privacy-preserving token distribution with Zero-Knowledge proofs" />
  <meta name="keywords" content="token distribution, vesting, zero knowledge, privacy, blockchain" />
  %sveltekit.head%
</head>
```

---

## 6. Acceptance Criteria

- [ ] Landing page displays at `/` route
- [ ] Hero section with headline and 2 CTAs visible
- [ ] 3 feature cards display below hero
- [ ] Theme toggle in footer works (Nord ↔ Wireframe)
- [ ] Both themes look visually appealing
- [ ] Mobile responsive (works on 375px width)
- [ ] CTA links navigate to correct routes
- [ ] No custom components (DaisyUI only)
- [ ] No hardcoded colors (semantic classes only)
- [ ] TypeScript check passes (0 errors)
- [ ] SEO meta tags present

---

## 7. Testing Checklist

### Visual Testing

- **Scenario 1:** Nord theme → Hero section readable, CTAs visible
- **Scenario 2:** Wireframe theme → Clean contrast, no visual glitches
- **Scenario 3:** Mobile (375px) → Single column layout, CTAs stack vertically
- **Scenario 4:** Tablet (768px) → Feature cards in grid
- **Scenario 5:** Desktop (1920px) → Content centered, proper spacing

### Functional Testing

- **Scenario 1:** Click "Create Distribution" → Navigate to `/wizard`
- **Scenario 2:** Click "Claim Tokens" → Navigate to `/claim`
- **Scenario 3:** Toggle theme → Theme switches, persists on reload
- **Scenario 4:** Footer links → Navigate to correct pages

---

## 8. Post-Development Report

- **Status:** In Progress
- **Completion Date:** TBD
- **Actual Effort:** TBD
- **Modified Files:** TBD
- **Technical Notes:** TBD

---

## 9. Review & Feedback

- **Reviewer:** TBD
- **Date:** TBD
- **Findings:** TBD

---

## 10. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-24 | AI Agent | Initial backlog creation |

---

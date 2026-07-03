// ─── Brand copy seam ────────────────────────────────────────────────────────
// Single source of truth for all hardcoded brand COPY (display strings). This
// is the static-copy counterpart to the runtime brand values that flow from
// `wrangler.jsonc` vars → `+page.server.ts` load data (`brand.name`/`brand.handle`).
//
// Two kinds of brand data:
//   • Runtime (name, handle) — read from env via load data, threaded as props
//     so a single deploy can change them without a rebuild. Components that
//     receive `data` use those.
//   • Static copy (tagline, hero lines, OG strings, support email) — seeded
//     here. Components without load data (Hero, Logo, Mark, admin head) import
//     this module directly. `scripts/setup.mjs` fills the `${...}` placeholders
//     below at generation time.
//
// Keep `${...}` placeholders LITERAL — the setup generator substitutes them.
export const brand = {
  name: 'Zarf',
  handle: 'zarfto',
  tagline: 'ZK airdrops on Stellar. Get on the beta list.',
  hero: {
    eyebrow: 'Beta access',
    headlinePre: 'Private airdrops,',
    headlineAccent: 'land',
    headlinePost: 'ready to',
    sub: 'Zarf delivers ZK-private token distributions on Stellar — straight to an email address. Follow, share, and claim your beta tester spot.',
    ctaLabel: 'Get beta access'
  },
  og: {
    title: 'Zarf — Early Access',
    description: 'Private ZK airdrops on Stellar. Land on Zarf and claim your beta tester spot.'
  },
  supportEmail: 'hello@zarf.to'
} as const;

export type Brand = typeof brand;

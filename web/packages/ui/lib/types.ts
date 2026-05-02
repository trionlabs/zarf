/**
 * `@zarf/ui` re-exports domain types from `@zarf/core`.
 *
 * Domain types are owned by core. This file exists so existing
 * `import type { ... } from '@zarf/ui/types'` imports keep working
 * during the consolidation, but it MUST NOT declare any new types.
 *
 * If you find yourself wanting to add a type here, put it in
 * `@zarf/core` instead and re-export from here.
 */
export type * from '@zarf/core';

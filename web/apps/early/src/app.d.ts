/// <reference types="@cloudflare/workers-types" />

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        OAUTH_STATE: KVNamespace;
        ASSETS: Fetcher;

        /** Gate selector: 'email' (default-safe) | 'x-follow' | 'email+x'. */
        GATE_MODE?: string;
        /** Brand display name (waitlist copy). */
        BRAND_NAME?: string;
        /** Brand X/social handle (no @). */
        BRAND_HANDLE?: string;
        /** Canonical site domain (used in copy / links). */
        SITE_DOMAIN?: string;
        /** Comma-separated admin email allowlist (secondary email-mode admin path). */
        ADMIN_EMAILS?: string;
        /** Signing secret for the email-mode admin cookie (M1); compared in /admin/login. */
        ADMIN_KEY?: string;
        /** '1' to expose /design-system in prod builds. */
        SHOW_DESIGN_SYSTEM?: string;

        TWITTER_CLIENT_ID?: string;
        TWITTER_CLIENT_SECRET?: string;
        TWITTER_REDIRECT_URI?: string;
        /** App-only bearer token for /2/users/:id/followers — used by run-verify. */
        TWITTER_BEARER_TOKEN?: string;
        /** Numeric X user id for @zarfto (target of the follower query). */
        BRAND_X_USER_ID?: string;
        BRAND_X_USERNAME?: string;
        /** Comma-separated list of numeric X user IDs (immutable; used by isAdmin). */
        ADMIN_X_USER_IDS?: string;
        /**
         * Set to the literal lowercase string 'true' in .dev.vars only to opt
         * into the mock OAuth flow. MUST be paired with TWITTER_CLIENT_ID +
         * TWITTER_CLIENT_SECRET set to the MOCK_CLIENT_ID / MOCK_CLIENT_SECRET
         * sentinel literals from `src/lib/server/env.ts`. The runtime
         * checkMockOAuthSanity helper returns a non-ok result if any are out
         * of sync (including any non-lowercase truthy variant), and the
         * route handlers log + return 500. Never wrangler secret put in prod.
         */
        ALLOW_MOCK_OAUTH?: string;
      };
      context: ExecutionContext;
      caches: CacheStorage & { default: Cache };
    }

    interface Locals {
      user: import('$lib/server/db').Subject | null;
      sessionId: string | null;
    }
  }
}

export {};

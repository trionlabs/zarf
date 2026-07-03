// Fail-fast validation for required env.
import { dev } from '$app/environment';

export type TwitterRequiredEnv = {
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  TWITTER_REDIRECT_URI: string;
};

export function missingTwitterEnv(env: Partial<TwitterRequiredEnv> | undefined): string[] {
  if (!env) return ['platform.env'];
  const keys: (keyof TwitterRequiredEnv)[] = [
    'TWITTER_CLIENT_ID',
    'TWITTER_CLIENT_SECRET',
    'TWITTER_REDIRECT_URI'
  ];
  return keys.filter((k) => !env[k] || env[k]?.length === 0);
}

// Sentinel values that gate the mock OAuth flow. Intentionally long and
// self-labelling so they cannot plausibly be picked as placeholder
// credentials by an operator, and any `grep` against a production secret
// dump surfaces them loudly. ALL THREE conditions must hold for the mock
// branch to fire:
//   - ALLOW_MOCK_OAUTH === 'true' (exact lowercase)
//   - TWITTER_CLIENT_ID === MOCK_CLIENT_ID
//   - TWITTER_CLIENT_SECRET === MOCK_CLIENT_SECRET
//
// If any drift, checkMockOAuthSanity returns a non-ok result; route
// handlers log the reason and return a generic 500 instead of throwing,
// so internal state cannot leak through a future custom handleError.
export const MOCK_CLIENT_ID = '__template_mock_oauth_local_only_do_not_use_in_prod__';
export const MOCK_CLIENT_SECRET =
  '__template_mock_oauth_local_only_do_not_use_in_prod_secret__';

type MockOAuthEnv = {
  ALLOW_MOCK_OAUTH?: string;
  TWITTER_CLIENT_ID?: string;
  TWITTER_CLIENT_SECRET?: string;
};

// True only when the full sentinel pair is present AND the build is a dev
// build (SEC-2). Use this everywhere the mock branch is gated — never test
// ALLOW_MOCK_OAUTH or TWITTER_CLIENT_ID in isolation, since either alone is a
// misconfiguration window.
//
// `dev` from `$app/environment` is hard-compiled to `false` in any
// `vite build` / deployed Cloudflare Worker bundle. This makes mock OAuth
// IMPOSSIBLE in production: even a misconfigured prod secret
// (`ALLOW_MOCK_OAUTH=true` + the sentinel literals) can never enter the mock
// branch, because `dev` is statically false there. The sentinel checks remain
// as a second, independent line of defence for dev hygiene.
export function isMockOAuthEnabled(env: MockOAuthEnv): boolean {
  return (
    dev &&
    env.ALLOW_MOCK_OAUTH === 'true' &&
    env.TWITTER_CLIENT_ID === MOCK_CLIENT_ID &&
    env.TWITTER_CLIENT_SECRET === MOCK_CLIENT_SECRET
  );
}

export type MockOAuthSanityResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'id-mismatch' | 'secret-mismatch' | 'both-mismatch' | 'invalid-flag-format';
    };

// First-request sanity check on the mock OAuth opt-in. SvelteKit + the
// Cloudflare adapter has no boot hook that survives module-top-level
// throws, so this is invoked at the top of each handler that opts into
// the mock branch.
//
// Returns a result rather than throwing — the caller emits diagnostics
// via logServerError (server-side only) and returns a generic 500 via
// apiError. Nothing internal-state-shaped flows into the response body,
// even if a custom handleError is added later.
//
// Cases:
//   - ALLOW_MOCK_OAUTH unset / '' / 'false'           → ok (mock disabled)
//   - ALLOW_MOCK_OAUTH === 'true' + full sentinel pair → ok (mock fires)
//   - ALLOW_MOCK_OAUTH === 'true' + sentinel drift     → fail (which side)
//   - ALLOW_MOCK_OAUTH set to a truthy-looking typo    → fail (invalid-flag-format)
//     ('TRUE', 'True', '1', 'yes', 'on' all look like they meant to enable
//      mock but don't match the exact-lowercase contract — surface loudly
//      so the contributor sees their typo instead of being silently routed
//      to the real OAuth path.)
export function checkMockOAuthSanity(env: MockOAuthEnv): MockOAuthSanityResult {
  const raw = env.ALLOW_MOCK_OAUTH;
  if (raw === undefined || raw === '' || raw === 'false') {
    return { ok: true };
  }
  if (raw !== 'true') {
    return { ok: false, reason: 'invalid-flag-format' };
  }
  const idOk = env.TWITTER_CLIENT_ID === MOCK_CLIENT_ID;
  const secretOk = env.TWITTER_CLIENT_SECRET === MOCK_CLIENT_SECRET;
  if (idOk && secretOk) return { ok: true };
  if (!idOk && !secretOk) return { ok: false, reason: 'both-mismatch' };
  if (!idOk) return { ok: false, reason: 'id-mismatch' };
  return { ok: false, reason: 'secret-mismatch' };
}

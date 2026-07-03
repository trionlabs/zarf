import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TwitterEnvLike } from '$lib/server/oauth';
import {
  twitterClient,
  newOAuthHandshake,
  TWITTER_USER_SCOPES,
  buildTwitterAuthorizationURL
} from '$lib/server/oauth';
import { apiError, ERROR_CODES, logServerError } from '$lib/server/errors';
import { missingTwitterEnv, isMockOAuthEnabled, checkMockOAuthSanity } from '$lib/server/env';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

// __Host- prefix: browser-enforced Secure + path=/ + no Domain attribute.
const STATE_COOKIE = '__Host-zarf_early_oauth_state';
// 600s (was 300): a slower human completing the X consent screen shouldn't
// lose the handshake. Governs both the KV entry TTL and the state cookie
// maxAge below (kept in lockstep).
const STATE_TTL_SECONDS = 600;

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: in any non-X mode this route is 404 — never 500 on missing
  // X config. The gate is the safety lever; the env checks are secondary.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  const missing = missingTwitterEnv(env);
  if (missing.length > 0) {
    logServerError('auth.twitter.start', ERROR_CODES.CONFIG_MISSING, { missing });
    return apiError(ERROR_CODES.CONFIG_MISSING, 500, 'server misconfigured');
  }

  // First-request sanity check on the mock OAuth opt-in. Returns a result
  // instead of throwing — full diagnostics flow into the server log, the
  // client gets a generic 500. No internal-state strings can leak through
  // a future custom handleError because nothing is ever thrown here.
  const sanity = checkMockOAuthSanity(env);
  if (!sanity.ok) {
    logServerError('auth.twitter.start', ERROR_CODES.CONFIG_MISSING, {
      msg: 'mock OAuth sanity check failed',
      reason: sanity.reason
    });
    return apiError(ERROR_CODES.CONFIG_MISSING, 500, 'server misconfigured');
  }

  const { state, codeVerifier } = newOAuthHandshake();

  try {
    await env.OAUTH_STATE.put(
      `oauth_states:${state}`,
      JSON.stringify({
        codeVerifier,
        createdAt: Math.floor(Date.now() / 1000)
      }),
      { expirationTtl: STATE_TTL_SECONDS }
    );
  } catch (e) {
    logServerError('auth.twitter.start', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'state persistence failed');
  }

  event.cookies.set(STATE_COOKIE, state, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS
  });

  // Mock branch fires only when the full sentinel pair (ALLOW_MOCK_OAUTH=true
  // + MOCK_CLIENT_ID + MOCK_CLIENT_SECRET) is present. ID-only check would be
  // a single-misconfig window — a prod deploy that accidentally inherited a
  // dev TWITTER_CLIENT_ID would skip real OAuth.
  if (isMockOAuthEnabled(env)) {
    // Dev-only multi-user testing: thread a numeric mock_uid through to the
    // callback so the referral flow can be exercised with distinct mock users.
    // Only reachable behind isMockOAuthEnabled (dev + sentinel pair), so this
    // can never widen prod behaviour.
    const mockUid = event.url.searchParams.get('mock_uid');
    const mockUidParam = mockUid && /^\d{1,4}$/.test(mockUid) ? `&mock_uid=${mockUid}` : '';
    throw redirect(302, `/api/auth/twitter/callback?code=mock_code&state=${state}${mockUidParam}`);
  }

  const url = buildTwitterAuthorizationURL(
    twitterClient(env as unknown as TwitterEnvLike),
    state,
    codeVerifier,
    TWITTER_USER_SCOPES
  );
  
  throw redirect(302, url.toString());
};

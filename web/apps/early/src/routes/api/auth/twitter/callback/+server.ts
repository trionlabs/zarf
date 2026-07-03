import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TwitterEnvLike } from '$lib/server/oauth';
import { twitterClient, fetchTwitterProfile } from '$lib/server/oauth';
import {
  rotateSession,
  upsertTwitterUser,
  linkEmailSignupToX,
  findUserByReferralCode,
  setReferredByIfUnset
} from '$lib/server/db';
import { readRefCookie } from '$lib/server/referral';
import { setSessionCookie, timingSafeEqual } from '$lib/server/session';
import { apiError, ERROR_CODES, logServerError } from '$lib/server/errors';
import { missingTwitterEnv, isMockOAuthEnabled, checkMockOAuthSanity } from '$lib/server/env';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

const STATE_COOKIE = '__Host-zarf_early_oauth_state';

type StateRecord = {
  codeVerifier: string;
  createdAt: number;
};

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: callback is 404 in any non-X mode (mirrors the start route).
  const gateMode = resolveGateMode(env);
  if (!gateAllowsX(gateMode)) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }
  const missing = missingTwitterEnv(env);
  if (missing.length > 0) {
    logServerError('auth.twitter.callback', ERROR_CODES.CONFIG_MISSING, { missing });
    return apiError(ERROR_CODES.CONFIG_MISSING, 500, 'server misconfigured');
  }

  // First-request sanity check on the mock OAuth opt-in. Mirrors the start
  // handler — both routes opt into the mock branch, both must run the check.
  const sanity = checkMockOAuthSanity(env);
  if (!sanity.ok) {
    logServerError('auth.twitter.callback', ERROR_CODES.CONFIG_MISSING, {
      msg: 'mock OAuth sanity check failed',
      reason: sanity.reason
    });
    return apiError(ERROR_CODES.CONFIG_MISSING, 500, 'server misconfigured');
  }

  const url = event.url;
  const errParam = url.searchParams.get('error');
  if (errParam) {
    throw redirect(302, `/?error=${encodeURIComponent(ERROR_CODES.OAUTH_DENIED)}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'missing code or state');
  }

  const stateCookie = event.cookies.get(STATE_COOKIE) ?? '';
  // Clear the cookie unconditionally — it's single-use. Cleaner than waiting
  // until after validation; prevents replay attempts from succeeding twice.
  // __Host- prefix requires Secure on every Set-Cookie, including deletion.
  event.cookies.delete(STATE_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });

  if (!timingSafeEqual(stateCookie, state)) {
    logServerError('auth.twitter.callback', ERROR_CODES.STATE_MISMATCH, {
      cookiePresent: stateCookie.length > 0
    });
    return apiError(ERROR_CODES.STATE_MISMATCH, 400);
  }

  const stateKey = `oauth_states:${state}`;
  const rawStored = await env.OAUTH_STATE.get(stateKey);
  // One-time use: consume the KV entry regardless of downstream success.
  await env.OAUTH_STATE.delete(stateKey);
  if (!rawStored) {
    return apiError(ERROR_CODES.STATE_EXPIRED, 400);
  }

  let stored: StateRecord;
  try {
    stored = JSON.parse(rawStored) as StateRecord;
  } catch {
    return apiError(ERROR_CODES.BAD_REQUEST, 400, 'invalid state payload');
  }

  let profile;
  if (isMockOAuthEnabled(env)) {
    // Multi-user mock: a numeric mock_uid threaded from the start route yields a
    // distinct id/username so the referral graph can be exercised locally. Mock
    // sybil signals are fixed constants (real values come from /2/users/me).
    const mockUid = url.searchParams.get('mock_uid');
    const uidOk = mockUid && /^\d{1,4}$/.test(mockUid);
    profile = {
      id: uidOk ? '90000000' + mockUid : '123456789',
      username: uidOk ? 'mock_user_' + mockUid : 'mock_user',
      name: uidOk ? 'Mock User ' + mockUid : 'Mock User',
      avatar_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
      followers_count: 42,
      account_created_at: '2019-01-01T00:00:00.000Z'
    };
  } else {
    try {
      const tokens = await twitterClient(env as unknown as TwitterEnvLike).validateAuthorizationCode(
        code,
        stored.codeVerifier
      );
      profile = await fetchTwitterProfile(tokens.accessToken());
    } catch (e) {
      logServerError('auth.twitter.callback', ERROR_CODES.OAUTH_FAILED, e);
      return apiError(ERROR_CODES.OAUTH_FAILED, 502, 'token exchange or /users/me failed');
    }
  }

  try {
    const { user, isNew } = await upsertTwitterUser(env.DB, profile);

    // Referral capture — INSERT-ONLY. The callback runs on every re-auth, so
    // crediting a referrer unconditionally would let a user who signed up
    // organically days ago retroactively pay a referrer just by clicking a /r
    // link and re-logging-in. Gating on isNew closes that. First-touch cookie +
    // self-referral guard live in referral.ts / setReferredByIfUnset.
    if (isNew) {
      const refCode = readRefCookie(event.cookies);
      if (refCode) {
        const referrer = await findUserByReferralCode(env.DB, refCode);
        if (referrer && referrer.id !== user.id) {
          await setReferredByIfUnset(env.DB, user.id, referrer.id);
        }
      }
    }

    // M3: link the same human across tables. If this browser already has an
    // email-kind session, attach the X id to that email_signups row so the
    // person counts ONCE in admin stats + CSV. If no email session is present,
    // leave x_user_id NULL (unlinked is acceptable — still on the list via
    // twitter_users).
    if (gateMode === 'email+x' && event.locals.user?.kind === 'email') {
      await linkEmailSignupToX(env.DB, event.locals.user.id, user.x_user_id);
    }

    // rotateSession kills every session row for this X subject, regardless of
    // which cookie the browser presented. The cookie value is no longer
    // load-bearing for rotation correctness. xUserId = twitter_users.id.
    const session = await rotateSession(env.DB, { kind: 'x', xUserId: user.id });
    setSessionCookie(event.cookies, session.id);

    throw redirect(302, '/');
  } catch (e) {
    // Re-throw SvelteKit redirects unchanged. Anything else is a real error.
    if (
      e instanceof Response ||
      (typeof e === 'object' && e !== null && 'status' in e && 'location' in e)
    ) {
      throw e;
    }
    logServerError('auth.twitter.callback', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'persistence failed');
  }
};

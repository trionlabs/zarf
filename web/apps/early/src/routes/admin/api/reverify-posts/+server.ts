import type { RequestHandler } from './$types';
import { isAdmin } from '$lib/server/admin';
import { loadPostsForReverify, bulkClearPostVerified } from '$lib/server/db';
import { verifyPost } from '$lib/server/oembed';
import { recordAuditEvent } from '$lib/server/audit';
import { apiError, apiOk, ERROR_CODES, logServerError } from '$lib/server/errors';
import { resolveGateMode, gateAllowsX } from '$lib/server/gate';

export const prerender = false;

// Re-check every already-verified post via oEmbed (free, no auth, no rate
// limit) and revoke verification for any that no longer pass — deleted,
// de-linked, or now author-mismatched. Structure mirrors run-verify: gate 404 →
// env → admin re-auth (the signed session cookie IS the auth; no HMAC) → read
// set → short-circuit on empty → work → single audit. run-verify has no
// per-call rate cap, so neither does this (oEmbed is free).
const CONCURRENCY = 5;

// oEmbed outcomes that mean the post no longer qualifies → clear verification.
// oembed_unavailable (5xx/network) and bad_request are TRANSIENT and never
// clear — a temporary provider hiccup must not revoke a legitimate verification.
const CLEAR_CODES = new Set(['post_not_found', 'post_wrong_author', 'post_missing_link']);

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  // FIRST statement: posts only exist in the X funnel — 404 in any non-X mode
  // (mirrors run-verify), before any config/auth work.
  if (!gateAllowsX(resolveGateMode(env))) return new Response('not found', { status: 404 });
  if (!env) {
    return apiError(ERROR_CODES.PLATFORM_UNAVAILABLE, 500, 'platform bindings missing');
  }

  const user = event.locals.user;
  if (!isAdmin(user, env.ADMIN_X_USER_IDS, env.ADMIN_EMAILS)) {
    return apiError(ERROR_CODES.UNAUTHORIZED, 403, 'admin only');
  }

  let posts;
  try {
    posts = await loadPostsForReverify(env.DB);
  } catch (e) {
    logServerError('admin.reverify-posts', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'reverify query failed');
  }

  if (posts.length === 0) {
    await recordAuditEvent(env.DB, {
      adminId: user!.id,
      action: 'post_reverify_sweep',
      ip: event.getClientAddress(),
      userAgent: event.request.headers.get('user-agent'),
      detail: { checked: 0, cleared: 0, transient: 0 }
    });
    return apiOk({ checked: 0, cleared: 0, transient: 0 });
  }

  const clearIds: string[] = [];
  let transient = 0;

  // Real oEmbed re-check (no mock opt), 5 at a time. Promise.allSettled so one
  // rejected promise (verifyPost already folds network errors into
  // oembed_unavailable, so this is purely defensive) can't abort the sweep — a
  // rejection is counted transient and never clears.
  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    const chunk = posts.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((p) => verifyPost(p.post_url, p.username))
    );
    settled.forEach((r, idx) => {
      if (r.status === 'rejected') {
        transient++;
        return;
      }
      const result = r.value;
      if (result.ok) return; // still valid — keep verified
      if (CLEAR_CODES.has(result.code)) {
        clearIds.push(chunk[idx].id);
      } else {
        transient++; // oembed_unavailable / bad_request → leave verified
      }
    });
  }

  try {
    if (clearIds.length > 0) {
      await bulkClearPostVerified(env.DB, clearIds);
    }
  } catch (e) {
    logServerError('admin.reverify-posts', ERROR_CODES.INTERNAL, e);
    return apiError(ERROR_CODES.INTERNAL, 500, 'bulk clear failed');
  }

  await recordAuditEvent(env.DB, {
    adminId: user!.id,
    action: 'post_reverify_sweep',
    ip: event.getClientAddress(),
    userAgent: event.request.headers.get('user-agent'),
    detail: { checked: posts.length, cleared: clearIds.length, transient }
  });

  return apiOk({ checked: posts.length, cleared: clearIds.length, transient });
};

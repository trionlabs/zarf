// Share-post verification via Twitter/X oEmbed (publish.twitter.com).
//
// SECURITY MODEL (every rule below is a deliberate decision — do not relax):
//   1. The raw user string NEVER reaches fetch. We parse it, allowlist the
//      host, match the path against a strict regex, extract handle + id
//      ourselves, and RECONSTRUCT a canonical URL. This closes SSRF and
//      oEmbed query-param-injection vectors — an attacker can't smuggle a
//      `?url=` payload or a redirect target through the user field.
//   2. Authorship is proven by author_url (the oEmbed provider's authoritative
//      author), NEVER author_name (a display name that anyone can spoof).
//      The cheap path-handle check is a pre-filter; author_url is the gate.
//   3. Campaign match is a decoded-text substring check (host OR hashtag),
//      resilient to t.co wrapping and display-URL truncation. Exact path
//      matching is brittle and intentionally NOT used.
//   4. rawUrl is never logged.
import { ERROR_CODES, logServerError } from './errors';

// The campaign host we require the shared tweet to reference.
export const CAMPAIGN_HOST = 'early.zarf.to';
// Alternate accepted campaign signal (lowercased): the campaign hashtag.
const CAMPAIGN_HASHTAG = '#landedonzarf';

// Hosts we accept a tweet URL from. URL parsing lowercases the host, so these
// are compared case-insensitively.
const ALLOWED_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'mobile.x.com'
]);

// /<handle>/status/<id> (or the legacy /statuses/ form). Handle is X's
// 1–15 char [A-Za-z0-9_] rule; id is all digits. Optional trailing slash.
const STATUS_PATH_RE = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d+)\/?$/;

const OEMBED_TIMEOUT_MS = 5000;

export type VerifyResult =
  | { ok: true; postId: string; canonicalUrl: string; authorHandle: string }
  | {
      ok: false;
      code:
        | 'post_not_found'
        | 'post_wrong_author'
        | 'post_missing_link'
        | 'oembed_unavailable'
        | 'bad_request';
    };

type OEmbedResponse = {
  url?: unknown;
  author_url?: unknown;
  html?: unknown;
};

// Minimal HTML entity decoder — enough to normalize oEmbed html so the
// campaign substring check sees decoded text. &amp; is decoded LAST so we
// never re-introduce an entity by decoding an escaped ampersand too early.
function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_m, d: string) => {
      const cp = Number(d);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Strip tags, decode entities, lowercase — the normalized text we scan for the
// campaign signal.
function normalizeHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).toLowerCase();
}

// First non-empty path segment of a URL, lowercased. Used to read the handle
// out of author_url. Returns null if the value isn't a parseable URL with a
// leading path segment.
function firstPathSegment(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const seg = parsed.pathname.split('/').filter((s) => s.length > 0)[0];
  return seg ? seg.toLowerCase() : null;
}

export async function verifyPost(
  rawUrl: string,
  sessionUsername: string,
  opts?: { mock?: boolean }
): Promise<VerifyResult> {
  // (1) Parse + host allowlist + strict path match. Anything off-shape is a
  // bad_request; the raw string is discarded here.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, code: 'bad_request' };
  }
  if (!ALLOWED_HOSTS.has(parsed.host.toLowerCase())) {
    return { ok: false, code: 'bad_request' };
  }
  const m = STATUS_PATH_RE.exec(parsed.pathname);
  if (!m) {
    return { ok: false, code: 'bad_request' };
  }
  const handle = m[1];
  const id = m[2];

  // Reconstruct the canonical URL — the ONLY string that ever reaches fetch.
  const canonicalUrl = `https://twitter.com/${handle}/status/${id}`;
  const wantHandle = sessionUsername.toLowerCase();

  // Cheap author pre-filter: the URL's handle must be the session user's. This
  // fails fast before any network call. The authoritative author check against
  // author_url still runs after fetch (a retweet-style URL path can lie).
  if (handle.toLowerCase() !== wantHandle) {
    return { ok: false, code: 'post_wrong_author' };
  }

  // MOCK MODE: dev-only. Skip the network entirely so local multi-user mock
  // funnels run E2E (and still exercise the UNIQUE(post_id) write path). The
  // author pre-filter above already applied.
  if (opts?.mock === true) {
    return { ok: true, postId: id, canonicalUrl, authorHandle: handle };
  }

  // (2) Fetch oEmbed with a hard 5s timeout and no redirect following.
  const oembedUrl =
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(canonicalUrl)}` +
    `&omit_script=1&dnt=true&hide_thread=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(oembedUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
  } catch (e) {
    // Network error / abort / redirect-refused: transient. Does NOT burn the
    // caller's rate-limit quota. Never log rawUrl.
    logServerError('oembed.verify', ERROR_CODES.OEMBED_UNAVAILABLE, e);
    return { ok: false, code: 'oembed_unavailable' };
  } finally {
    clearTimeout(timer);
  }

  // (3) Status mapping. 5xx = our-infra/transient → oembed_unavailable (no
  // quota burn). Any other non-OK (404 deleted, 403 protected, gone) is
  // attributable to the post → post_not_found.
  if (!res.ok) {
    // 5xx = our-infra/transient. 429 = the unauthenticated oEmbed endpoint is
    // rate-limiting us (common under a launch spike) — treat as transient too so
    // a genuinely-shareable post isn't rejected as post_not_found AND the user's
    // 10/24h verify quota isn't burned on our provider's throttle.
    if (res.status >= 500 || res.status === 429) {
      return { ok: false, code: 'oembed_unavailable' };
    }
    return { ok: false, code: 'post_not_found' };
  }

  let data: OEmbedResponse;
  try {
    data = (await res.json()) as OEmbedResponse;
  } catch {
    // 200 with an unparseable body: treat as transient infra hiccup.
    return { ok: false, code: 'oembed_unavailable' };
  }

  // A well-formed oEmbed carries a string url + author_url. Missing/error body
  // → the post can't be resolved.
  if (typeof data.author_url !== 'string' || typeof data.url !== 'string') {
    return { ok: false, code: 'post_not_found' };
  }

  // (4) Authoritative author check via author_url (NEVER author_name).
  const authorHandle = firstPathSegment(data.author_url);
  if (!authorHandle || authorHandle !== wantHandle) {
    return { ok: false, code: 'post_wrong_author' };
  }

  // (5) Campaign match on decoded, tag-stripped, lowercased html.
  const text = typeof data.html === 'string' ? normalizeHtml(data.html) : '';
  if (!text.includes(CAMPAIGN_HOST) && !text.includes(CAMPAIGN_HASHTAG)) {
    return { ok: false, code: 'post_missing_link' };
  }

  // (6) postId from the canonical url the provider returned, falling back to
  // the id we extracted.
  const idMatch = data.url.match(/\/status\/(\d+)/);
  const postId = idMatch ? idMatch[1] : id;

  return { ok: true, postId, canonicalUrl, authorHandle };
}

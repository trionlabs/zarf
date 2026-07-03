import { json } from '@sveltejs/kit';

// Codes are stable string identifiers for clients. Add new ones at the
// bottom; never repurpose.
export const ERROR_CODES = {
  PLATFORM_UNAVAILABLE: 'platform_unavailable',
  CONFIG_MISSING: 'config_missing',
  BAD_REQUEST: 'bad_request',
  STATE_MISMATCH: 'state_mismatch',
  STATE_EXPIRED: 'state_expired',
  OAUTH_DENIED: 'oauth_denied',
  OAUTH_FAILED: 'oauth_failed',
  CONFLICT: 'conflict',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  INTERNAL: 'internal',
  RATE_LIMITED: 'rate_limited',
  POST_NOT_FOUND: 'post_not_found',
  POST_WRONG_AUTHOR: 'post_wrong_author',
  POST_MISSING_LINK: 'post_missing_link',
  POST_ALREADY_USED: 'post_already_used',
  OEMBED_UNAVAILABLE: 'oembed_unavailable',
  INVALID_WALLET: 'invalid_wallet',
  EMAIL_TAKEN: 'email_taken',
  WALLET_TAKEN: 'wallet_taken',
  STEP_LOCKED: 'step_locked',
  INVALID_SIGNATURE: 'invalid_signature',
  CHALLENGE_EXPIRED: 'challenge_expired',
  CONSENT_REQUIRED: 'consent_required'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorBody = {
  error: ErrorCode;
  message?: string;
};

const STATUS_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

export function apiError(code: ErrorCode, status: number, message?: string): Response {
  const body: ErrorBody = message ? { error: code, message } : { error: code };
  return json(body, { status, headers: STATUS_HEADERS });
}

export function apiOk<T extends Record<string, unknown>>(payload: T): Response {
  return json(payload, { headers: STATUS_HEADERS });
}

// Emit a stable, greppable line. `cause` may be an Error or arbitrary value.
export function logServerError(scope: string, code: ErrorCode, cause: unknown): void {
  const detail =
    cause instanceof Error
      ? { name: cause.name, message: cause.message, stack: cause.stack }
      : { value: cause };
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      code,
      ts: new Date().toISOString(),
      ...detail
    })
  );
}

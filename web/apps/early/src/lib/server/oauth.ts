import { Twitter, generateState, generateCodeVerifier } from 'arctic';

// X moved OAuth 2.0 authorize from twitter.com/i/oauth2/authorize to
// x.com/i/oauth2/authorize on 2026-04-15. The old host now 400s. arctic
// 2.3.4 still emits the legacy host, so we rewrite it here. The token
// endpoint (api.twitter.com/2/oauth2/token) is unaffected.
export function buildTwitterAuthorizationURL(
  client: Twitter,
  state: string,
  codeVerifier: string,
  scopes: string[]
): URL {
  const url = client.createAuthorizationURL(state, codeVerifier, scopes);
  if (url.hostname === 'twitter.com') {
    url.hostname = 'x.com';
  }
  return url;
}

export type TwitterEnvLike = {
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  TWITTER_REDIRECT_URI: string;
};

export function twitterClient(env: TwitterEnvLike): Twitter {
  return new Twitter(env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET, env.TWITTER_REDIRECT_URI);
}

export function newOAuthHandshake(): { state: string; codeVerifier: string } {
  return { state: generateState(), codeVerifier: generateCodeVerifier() };
}

// Regular user signup. We never call X API on their behalf afterwards;
// verification is via reverse lookup against @zarfto's followers list.
// The access token is discarded immediately after the /2/users/me call.
export const TWITTER_USER_SCOPES = ['users.read', 'tweet.read'];

export type TwitterProfile = {
  id: string; // numeric X user id
  username: string;
  name?: string;
  avatar_url?: string;
  // Sybil signals pulled at login (funnel expansion). Optional so mock/dev and
  // any future partial-field response degrade gracefully to null in the DB.
  followers_count?: number;
  account_created_at?: string; // ISO 8601 (X `created_at`)
};

// Fetch the authenticated X user's profile via /2/users/me. Caller MUST
// discard the access token after this call (do not persist it).
export async function fetchTwitterProfile(accessToken: string): Promise<TwitterProfile> {
  const url =
    'https://api.x.com/2/users/me?user.fields=id,username,name,profile_image_url,public_metrics,created_at';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`x /2/users/me ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: {
      id?: string;
      username?: string;
      name?: string;
      profile_image_url?: string;
      public_metrics?: { followers_count?: number };
      created_at?: string;
    };
  };
  const d = body.data;
  if (!d?.id || !d?.username) {
    throw new Error('x /2/users/me missing id or username');
  }
  return {
    id: d.id,
    username: d.username,
    name: d.name,
    avatar_url: d.profile_image_url,
    followers_count: d.public_metrics?.followers_count,
    account_created_at: d.created_at
  };
}

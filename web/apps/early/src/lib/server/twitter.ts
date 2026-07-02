const X_FOLLOWERS_URL = 'https://api.x.com/2/users';
const PAGE_SIZE = 1000;

export async function fetchAllFollowers(
  bearerToken: string,
  twitterUserId: string
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  const MAX_PAGES = 100; // safety ceiling (100k followers)

  while (pagesFetched < MAX_PAGES) {
    const url = new URL(`${X_FOLLOWERS_URL}/${twitterUserId}/followers`);
    url.searchParams.set('max_results', String(PAGE_SIZE));
    url.searchParams.set('user.fields', 'id');
    if (cursor) {
      url.searchParams.set('pagination_token', cursor);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` }
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`x followers ${res.status}: ${txt.slice(0, 200)}`);
    }

    const body = (await res.json()) as {
      data?: { id?: string }[];
      meta?: { next_token?: string; result_count?: number };
    };

    const data = body.data ?? [];
    for (const u of data) {
      if (u.id) {
        ids.push(u.id);
      }
    }

    pagesFetched += 1;
    cursor = body.meta?.next_token ?? null;
    if (!cursor) {
      break;
    }
  }

  return ids;
}

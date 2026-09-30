// Stateful MyAnimeList API + OAuth mock (official API shapes) for tests.

export type MockListEntry = {
  id: number;
  title: string;
  status: string;
  score: number;
  num_episodes_watched: number;
  updated_at: string;
};

export function createMalMock(options: { base?: string } = {}) {
  const base = options.base ?? "http://mal.test";
  const state = {
    list: new Map<number, MockListEntry>(),
    patches: [] as { id: number; body: Record<string, string> }[],
    tokenRequests: [] as Record<string, string>[],
    validAccessTokens: new Set<string>(["access-1"]),
    refreshFails: false,
    issued: 1,
    user: { id: 4242, name: "mock_mal_user" },
    codes: new Map<string, string>(), // code -> expected verifier
  };

  function setEntry(id: number, title: string, status: string, score: number, watched: number) {
    state.list.set(id, { id, title, status, score, num_episodes_watched: watched, updated_at: new Date().toISOString() });
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith("/authorize")) {
      // Simulates the user approving: redirect back with a code bound to the PKCE challenge.
      const code = `code-${state.codes.size + 1}`;
      state.codes.set(code, url.searchParams.get("code_challenge") ?? "");
      const redirect = new URL(url.searchParams.get("redirect_uri")!);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
      return new Response(null, { status: 302, headers: { Location: redirect.toString() } });
    }

    if (path.endsWith("/token")) {
      const form = Object.fromEntries(new URLSearchParams(await request.text()));
      state.tokenRequests.push(form);
      if (form.grant_type === "authorization_code") {
        if (state.codes.get(form.code) !== form.code_verifier) return json({ error: "invalid_grant" }, 400);
        state.codes.delete(form.code);
      } else if (form.grant_type === "refresh_token") {
        if (state.refreshFails) return json({ error: "invalid_grant" }, 400);
      } else {
        return json({ error: "unsupported_grant_type" }, 400);
      }
      state.issued++;
      const access = `access-${state.issued}`;
      state.validAccessTokens.add(access);
      return json({ token_type: "Bearer", expires_in: 3600, access_token: access, refresh_token: `refresh-${state.issued}` });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!state.validAccessTokens.has(token)) return json({ error: "invalid_token" }, 401);

    if (path.endsWith("/users/@me")) return json({ id: state.user.id, name: state.user.name });

    if (path.endsWith("/users/@me/animelist")) {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const all = [...state.list.values()];
      const page = all.slice(offset, offset + limit);
      return json({
        data: page.map((entry) => ({
          node: { id: entry.id, title: entry.title, main_picture: null, media_type: "tv", num_episodes: 0 },
          list_status: { status: entry.status, score: entry.score, num_episodes_watched: entry.num_episodes_watched, updated_at: entry.updated_at },
        })),
        paging: offset + limit < all.length ? { next: `${base}/v2/users/@me/animelist?offset=${offset + limit}` } : {},
      });
    }

    let match = path.match(/\/anime\/(\d+)\/my_list_status$/);
    if (match && request.method === "PATCH") {
      const id = Number(match[1]);
      const body = Object.fromEntries(new URLSearchParams(await request.text()));
      state.patches.push({ id, body });
      const existing = state.list.get(id);
      const entry: MockListEntry = {
        id,
        title: existing?.title ?? `Anime ${id}`,
        status: body.status ?? existing?.status ?? "plan_to_watch",
        score: body.score !== undefined ? Number(body.score) : (existing?.score ?? 0),
        num_episodes_watched: body.num_watched_episodes !== undefined ? Number(body.num_watched_episodes) : (existing?.num_episodes_watched ?? 0),
        updated_at: new Date().toISOString(),
      };
      state.list.set(id, entry);
      return json({ status: entry.status, score: entry.score, num_episodes_watched: entry.num_episodes_watched, updated_at: entry.updated_at, is_rewatching: false });
    }

    match = path.match(/\/anime\/(\d+)$/);
    if (match) {
      const entry = state.list.get(Number(match[1]));
      return json({
        id: Number(match[1]),
        ...(entry
          ? { my_list_status: { status: entry.status, score: entry.score, num_episodes_watched: entry.num_episodes_watched, updated_at: entry.updated_at } }
          : {}),
      });
    }

    return json({ error: "not_found" }, 404);
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(typeof input === "string" ? input : input.href, init);
    return handle(request);
  }) as typeof fetch;

  return { state, setEntry, fetch: fetchImpl, handle, endpoints: { authorizeUrl: `${base}/v1/oauth2/authorize`, tokenUrl: `${base}/v1/oauth2/token`, apiBaseUrl: `${base}/v2` } };
}

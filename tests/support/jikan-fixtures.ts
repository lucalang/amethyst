// Deterministic Jikan v4 fixtures: a small franchise with pagination, relation
// cycles, crossovers, a non-trackable music video, unknown metadata and a
// missing related entry. Shared by unit tests and the E2E mock server.

type Anime = Record<string, unknown> & { mal_id: number };

const img = (id: number) => ({
  jpg: { image_url: `https://cdn.myanimelist.net/images/anime/fixture/${id}.jpg`, large_image_url: `https://cdn.myanimelist.net/images/anime/fixture/${id}l.jpg` },
  webp: { image_url: `https://cdn.myanimelist.net/images/anime/fixture/${id}.webp`, large_image_url: `https://cdn.myanimelist.net/images/anime/fixture/${id}l.webp` },
});

const rel = (relation: string, ...entries: [number, string, string?][]) => ({
  relation,
  entry: entries.map(([mal_id, name, type = "anime"]) => ({ mal_id, type, name, url: `https://myanimelist.net/${type}/${mal_id}` })),
});

export const FIXTURE_ROOT_ID = 1001;

export const fixtureAnime: Record<number, Anime> = {
  1001: {
    mal_id: 1001,
    url: "https://myanimelist.net/anime/1001",
    images: img(1001),
    title: "Fixture Saga",
    title_english: "Fixture Saga",
    type: "TV",
    episodes: 26,
    status: "Finished Airing",
    aired: { from: "2010-04-01T00:00:00+00:00", to: "2010-09-30T00:00:00+00:00", string: "Apr 2010 to Sep 2010" },
    score: 8.4,
    synopsis: "A deterministic test franchise.",
    year: 2010,
    genres: [{ name: "Action" }],
    studios: [{ name: "Fixture Studio" }],
    relations: [
      rel("Sequel", [1002, "Fixture Saga Season 2"]),
      rel("Side Story", [1003, "Fixture Saga OVA"]),
      rel("Other", [2001, "Crossover Special With Another Show"]),
      rel("Character", [2002, "Guest Appearance Series"]),
      rel("Adaptation", [5, "Fixture Saga (manga)", "manga"]),
    ],
  },
  1002: {
    mal_id: 1002,
    images: img(1002),
    title: "Fixture Saga Season 2",
    type: "TV",
    episodes: null,
    status: "Currently Airing",
    aired: { from: "2012-01-01T00:00:00+00:00", to: null, string: "Jan 2012 to ?" },
    relations: [
      rel("Prequel", [1001, "Fixture Saga"]),
      rel("Sequel", [1004, "Fixture Saga: The Movie"]),
      rel("Summary", [1005, "Fixture Saga Recap"]),
      rel("Side Story", [1006, "Fixture Saga Opening Theme"]),
    ],
  },
  1003: {
    mal_id: 1003,
    images: img(1003),
    title: "Fixture Saga OVA",
    type: "OVA",
    episodes: 2,
    status: "Finished Airing",
    aired: { from: "2011-01-01T00:00:00+00:00" },
    relations: [rel("Parent Story", [1001, "Fixture Saga"])],
  },
  1004: {
    mal_id: 1004,
    images: img(1004),
    title: "Fixture Saga: The Movie",
    type: "Movie",
    episodes: 1,
    status: "Finished Airing",
    aired: { from: "2014-07-01T00:00:00+00:00" },
    relations: [rel("Prequel", [1002, "Fixture Saga Season 2"]), rel("Side Story", [1007, "Fixture Saga Mystery Short"])],
  },
  1005: {
    mal_id: 1005,
    images: img(1005),
    title: "Fixture Saga Recap",
    type: "Special",
    episodes: 1,
    status: "Finished Airing",
    aired: { from: "2012-12-24T00:00:00+00:00" },
    relations: [rel("Full Story", [1002, "Fixture Saga Season 2"])],
  },
  1006: {
    mal_id: 1006,
    images: img(1006),
    title: "Fixture Saga Opening Theme",
    type: "Music",
    episodes: 1,
    relations: [],
  },
  1007: {
    mal_id: 1007,
    images: null,
    title: "Fixture Saga Mystery Short",
    type: null,
    episodes: null,
    relations: [rel("Sequel", [1008, "Fixture Saga Lost Entry"])],
  },
  // 1008 intentionally missing (404) to exercise missing metadata.
  2001: { mal_id: 2001, images: img(2001), title: "Crossover Special With Another Show", type: "Special", episodes: 1, relations: [] },
  2002: { mal_id: 2002, images: img(2002), title: "Guest Appearance Series", type: "TV", episodes: 12, relations: [] },
};

function episodes(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => {
    const n = from + index;
    return { mal_id: n, title: n === 7 ? null : `Episode title ${n}`, title_japanese: null, aired: `2010-04-${String((n % 28) + 1).padStart(2, "0")}T00:00:00+00:00`, filler: n === 13, recap: n === 20 };
  });
}

/** Episode pages keyed by `${malId}:${page}`. 1001 spans two pages. */
export const fixtureEpisodes: Record<string, { pagination: { last_visible_page: number; has_next_page: boolean }; data: unknown[] }> = {
  "1001:1": { pagination: { last_visible_page: 2, has_next_page: true }, data: episodes(1, 20) },
  "1001:2": { pagination: { last_visible_page: 2, has_next_page: false }, data: episodes(21, 26) },
  "1002:1": { pagination: { last_visible_page: 1, has_next_page: false }, data: episodes(1, 3) },
  "1003:1": { pagination: { last_visible_page: 1, has_next_page: false }, data: [] },
  "2002:1": { pagination: { last_visible_page: 1, has_next_page: false }, data: episodes(1, 12) },
};

export const fixtureCharacters: Record<number, unknown[]> = {
  1001: [
    { character: { mal_id: 501, name: "Protagonist, Test", images: { webp: { image_url: "https://cdn.myanimelist.net/images/characters/fixture/501.webp" } } }, role: "Main", favorites: 900 },
    { character: { mal_id: 502, name: "Rival, Test", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/characters/fixture/502.jpg" } } }, role: "Main", favorites: 500 },
    { character: { mal_id: 503, name: "Mentor, Test", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/questionmark_23.gif" } } }, role: "Supporting", favorites: 20 },
  ],
  1002: [],
};

export type FixtureFetchOptions = {
  /** Status overrides consumed in order for a path, e.g. {"/anime/1002/full": [429]}. */
  failures?: Record<string, { status: number; retryAfter?: string }[]>;
};

/** Fetch implementation that serves fixtures for `${base}/...` Jikan paths. */
export function createFixtureFetch(base: string, options: FixtureFetchOptions = {}) {
  const calls: string[] = [];
  const failures = Object.fromEntries(Object.entries(options.failures ?? {}).map(([key, list]) => [key, [...list]]));

  const handler = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const path = url.pathname.replace(new URL(base).pathname.replace(/\/$/, ""), "");
    calls.push(`${path}${url.search}`);
    const failure = failures[path]?.shift();
    if (failure) {
      return new Response(JSON.stringify({ status: failure.status, message: "fixture failure" }), {
        status: failure.status,
        headers: failure.retryAfter ? { "Retry-After": failure.retryAfter } : {},
      });
    }
    return routeFixture(path, url.searchParams);
  };
  return { fetch: handler as typeof fetch, calls };
}

export function routeFixture(path: string, params: URLSearchParams): Response {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  let match = path.match(/^\/anime\/(\d+)\/full$/);
  if (match) {
    const anime = fixtureAnime[Number(match[1])];
    return anime ? json({ data: anime }) : json({ status: 404, message: "Not Found" }, 404);
  }
  match = path.match(/^\/anime\/(\d+)\/episodes$/);
  if (match) {
    const page = fixtureEpisodes[`${match[1]}:${params.get("page") ?? "1"}`];
    if (page) return json(page);
    return fixtureAnime[Number(match[1])] ? json({ pagination: { last_visible_page: 1, has_next_page: false }, data: [] }) : json({ status: 404 }, 404);
  }
  match = path.match(/^\/anime\/(\d+)\/characters$/);
  if (match) {
    const characters = fixtureCharacters[Number(match[1])];
    return characters ? json({ data: characters }) : json({ data: [] });
  }
  if (path === "/anime") {
    const q = (params.get("q") ?? "").toLowerCase();
    const data = Object.values(fixtureAnime).filter((anime) => String(anime.title).toLowerCase().includes(q));
    return json({ pagination: { last_visible_page: 1, has_next_page: false }, data });
  }
  return json({ status: 404, message: "Unknown fixture route" }, 404);
}

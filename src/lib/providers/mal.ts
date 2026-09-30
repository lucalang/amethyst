// Official MyAnimeList API v2 client (user list read/write). Requires OAuth.
import { z } from "zod";
import { ProviderError, requestWithRetry, type HttpDeps } from "./http.ts";

export const MAL_PROVIDER = "mal";

export const MAL_ENDPOINTS = {
  authorizeUrl: "https://myanimelist.net/v1/oauth2/authorize",
  tokenUrl: "https://myanimelist.net/v1/oauth2/token",
  apiBaseUrl: "https://api.myanimelist.net/v2",
};

export const WATCH_STATUSES = ["watching", "completed", "on_hold", "dropped", "plan_to_watch"] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];

/** 401 invalid_token: refresh the access token (or reconnect if refresh fails). */
export class MalUnauthorizedError extends Error {
  constructor() {
    super("MyAnimeList rejected the access token");
    this.name = "MalUnauthorizedError";
  }
}

const listStatusSchema = z.object({
  status: z.enum(WATCH_STATUSES).nullish(),
  score: z.number().int().min(0).max(10).nullish(),
  num_episodes_watched: z.number().int().nonnegative().nullish(),
  updated_at: z.string().nullish(),
});

export type MalListStatus = {
  status: WatchStatus;
  score: number;
  watched: number;
  updatedAt: string | null;
};

function toListStatus(value: z.infer<typeof listStatusSchema>): MalListStatus {
  return {
    status: value.status ?? "plan_to_watch",
    score: value.score ?? 0,
    watched: value.num_episodes_watched ?? 0,
    updatedAt: value.updated_at ?? null,
  };
}

const listPageSchema = z.object({
  data: z.array(
    z.object({
      node: z.object({
        id: z.number().int().positive(),
        title: z.string(),
        main_picture: z.object({ medium: z.string().nullish(), large: z.string().nullish() }).nullish(),
        media_type: z.string().nullish(),
        num_episodes: z.number().int().nullish(),
      }),
      list_status: listStatusSchema,
    }),
  ),
  paging: z.object({ next: z.string().nullish() }).nullish(),
});

export type MalListEntry = {
  malId: number;
  title: string;
  imageUrl: string | null;
  mediaType: string | null;
  numEpisodes: number | null;
  listStatus: MalListStatus;
};

const meSchema = z.object({ id: z.number().int().positive(), name: z.string() });
const detailSchema = z.object({ id: z.number().int().positive(), my_list_status: listStatusSchema.nullish() });

export const MAL_LIST_PAGE_SIZE = 1000;

export interface MalApi {
  getMe(accessToken: string): Promise<{ id: number; name: string }>;
  getAnimeListPage(accessToken: string, offset: number): Promise<{ entries: MalListEntry[]; hasNext: boolean }>;
  getMyListStatus(accessToken: string, malId: number): Promise<MalListStatus | null>;
  updateMyListStatus(
    accessToken: string,
    malId: number,
    update: { status: WatchStatus; score: number; num_watched_episodes: number },
  ): Promise<MalListStatus>;
}

export function createMalApi(options: { apiBaseUrl?: string; http: HttpDeps; maxInlineWaitMs?: number }): MalApi {
  const base = (options.apiBaseUrl ?? MAL_ENDPOINTS.apiBaseUrl).replace(/\/+$/, "");

  async function call(path: string, accessToken: string, init: RequestInit = {}): Promise<unknown> {
    const response = await requestWithRetry(
      `${base}${path}`,
      { ...init, headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers } },
      options.http,
      { provider: MAL_PROVIDER, maxInlineWaitMs: options.maxInlineWaitMs },
    );
    if (response.status === 401) throw new MalUnauthorizedError();
    if (response.status === 404) return null;
    if (response.status === 403) {
      // MAL answers 403 when it detects request floods; treat as retryable.
      throw new ProviderError("MyAnimeList refused the request (403)", MAL_PROVIDER, 403, true);
    }
    if (!response.ok) {
      throw new ProviderError(`MyAnimeList responded ${response.status}`, MAL_PROVIDER, response.status, response.status >= 500);
    }
    return response.json();
  }

  return {
    async getMe(accessToken) {
      return meSchema.parse(await call("/users/@me", accessToken));
    },
    async getAnimeListPage(accessToken, offset) {
      const params = new URLSearchParams({
        fields: "list_status,num_episodes,media_type",
        limit: String(MAL_LIST_PAGE_SIZE),
        offset: String(offset),
        nsfw: "true",
      });
      const page = listPageSchema.parse(await call(`/users/@me/animelist?${params.toString()}`, accessToken));
      return {
        entries: page.data.map(({ node, list_status }) => ({
          malId: node.id,
          title: node.title,
          imageUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
          mediaType: node.media_type ?? null,
          numEpisodes: node.num_episodes ?? null,
          listStatus: toListStatus(list_status),
        })),
        hasNext: Boolean(page.paging?.next),
      };
    },
    async getMyListStatus(accessToken, malId) {
      const body = await call(`/anime/${malId}?fields=my_list_status`, accessToken);
      if (body === null) return null;
      const detail = detailSchema.parse(body);
      return detail.my_list_status ? toListStatus(detail.my_list_status) : null;
    },
    async updateMyListStatus(accessToken, malId, update) {
      const form = new URLSearchParams({
        status: update.status,
        score: String(update.score),
        num_watched_episodes: String(update.num_watched_episodes),
      });
      const body = await call(`/anime/${malId}/my_list_status`, accessToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      return toListStatus(listStatusSchema.parse(body));
    },
  };
}

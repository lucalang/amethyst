import { MAL_ENDPOINTS } from "../providers/mal.ts";
import type { WorkerConfig } from "./run.ts";

/** Build worker configuration from environment variables (Deno.env or process.env). */
export function workerConfigFromEnv(get: (name: string) => string | undefined, workerId: string): WorkerConfig {
  const value = (name: string) => {
    const raw = get(name);
    return raw && raw.trim() !== "" ? raw.trim() : undefined;
  };
  const clientId = value("MAL_CLIENT_ID");
  return {
    workerId,
    budgetMs: Number(value("WORKER_BUDGET_MS") ?? 50_000),
    jikanBaseUrl: value("JIKAN_BASE_URL") ?? "https://api.jikan.moe/v4",
    // Jikan allows 3 req/s and 60 req/min; ~1.1s spacing stays under both.
    jikanIntervalMs: Number(value("JIKAN_INTERVAL_MS") ?? 1_100),
    malIntervalMs: Number(value("MAL_INTERVAL_MS") ?? 500),
    mal: clientId
      ? {
          clientId,
          clientSecret: value("MAL_CLIENT_SECRET"),
          tokenUrl: value("MAL_TOKEN_URL") ?? MAL_ENDPOINTS.tokenUrl,
          apiBaseUrl: value("MAL_API_BASE_URL") ?? MAL_ENDPOINTS.apiBaseUrl,
        }
      : null,
    encryptionKey: value("TOKEN_ENCRYPTION_KEY") ?? null,
  };
}

import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Best-effort nudge so the Edge Function picks up new work immediately instead
 * of waiting for the next cron tick. Never required for correctness.
 */
export async function pokeWorker(): Promise<void> {
  const env = serverEnv();
  if (!env.WORKER_URL || !env.WORKER_SECRET) return;
  try {
    await fetch(env.WORKER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WORKER_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source: "app" }),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
  } catch {
    // The cron schedule will pick the work up.
  }
}

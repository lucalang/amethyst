/**
 * Node runner for the same worker code the Edge Function executes.
 *   npm run worker          # poll every 5s (local development)
 *   npm run worker:once     # process due work once and exit
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY from .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { workerConfigFromEnv } from "../src/lib/worker/config";
import { runWorker } from "../src/lib/worker/run";

const once = process.argv.includes("--once");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  process.exit(1);
}

const db = createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const config = workerConfigFromEnv((name) => process.env[name], `node-${process.pid}`);
const deps = {
  fetch: globalThis.fetch.bind(globalThis),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

async function tick() {
  const report = await runWorker(db, config, deps);
  if (report.jobs.length || report.outbox.length) console.log(new Date().toISOString(), JSON.stringify(report));
}

async function main() {
  if (once) return tick();
  console.log(`worker ${config.workerId} polling (Ctrl+C to stop)`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error("worker tick failed:", error instanceof Error ? error.message : error);
    }
    await deps.sleep(5_000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

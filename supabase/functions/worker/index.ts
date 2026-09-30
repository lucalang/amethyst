// Durable worker for franchise imports, MAL list pulls and the MAL outbox.
// Invoked by pg_cron (see migrations/*_worker_schedule.sql) and optionally
// poked by the app after enqueueing work. Authenticated with WORKER_SECRET.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types.ts";
import { timingSafeEqualString } from "../../../src/lib/sync/crypto.ts";
import { workerConfigFromEnv } from "../../../src/lib/worker/config.ts";
import { runWorker } from "../../../src/lib/worker/run.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const secret = Deno.env.get("WORKER_SECRET") ?? "";

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const authorization = request.headers.get("authorization") ?? "";
  if (secret.length < 32 || !timingSafeEqualString(authorization, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Worker misconfigured", { status: 500 });

  const db = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const config = workerConfigFromEnv((name) => Deno.env.get(name), `edge-${crypto.randomUUID()}`);

  const work = runWorker(db, config, {
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  })
    .then((report) => console.log(JSON.stringify({ worker: config.workerId, jobs: report.jobs.length, outbox: report.outbox.length })))
    .catch((error) => console.error("worker run failed", error instanceof Error ? error.message : "unknown error"));

  EdgeRuntime.waitUntil(work);
  return Response.json({ accepted: true }, { status: 202 });
});

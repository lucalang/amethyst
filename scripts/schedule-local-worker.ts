/**
 * Enables the pg_cron → Edge Function worker schedule on the LOCAL stack by
 * storing the worker URL and secret in Supabase Vault. Hosted projects set
 * the same two Vault secrets in the SQL editor (see README).
 *   npm run worker:schedule:local
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("supabase/.env", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const secret = env.WORKER_SECRET;
if (!secret || !/^[A-Za-z0-9_-]{32,}$/.test(secret)) {
  console.error("supabase/.env must define WORKER_SECRET (openssl rand -hex 32).");
  process.exit(1);
}

// From inside the database container the API gateway is reachable as supabase_kong_<project>.
const workerUrl = "http://supabase_kong_archive:8000/functions/v1/worker";
const sql = `
  select vault.create_secret('${workerUrl}', 'archive_worker_url')
    where not exists (select 1 from vault.secrets where name = 'archive_worker_url');
  select vault.update_secret(id, '${secret}') from vault.secrets where name = 'archive_worker_secret';
  select vault.create_secret('${secret}', 'archive_worker_secret')
    where not exists (select 1 from vault.secrets where name = 'archive_worker_secret');
`;
execFileSync("docker", ["exec", "-i", "supabase_db_archive", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
  input: sql,
  stdio: ["pipe", "ignore", "inherit"],
});
console.log("Local worker schedule enabled (pg_cron invokes the Edge Function every minute when work is due).");

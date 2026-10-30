import { execFileSync, spawn } from "node:child_process";
import { createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign as cryptoSign } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  DEMO_RETENTION_HOURS,
  ENABLED_DEMO_SPECS,
  VERSION_HISTORY_CATALOG,
  type EnabledDemoSpec,
} from "../src/lib/version-history";

const REPO_ROOT = path.resolve(__dirname, "..");
const DEMO_ROOT = process.env.AMETHYST_DEMO_ROOT || "/tmp/amethyst-version-demos";
const BIN_DIR = path.join(DEMO_ROOT, "bin");
const KEYS_DIR = path.join(DEMO_ROOT, "keys");
const WORKTREES_DIR = path.join(DEMO_ROOT, "worktrees");
const RUNTIME_DIR = path.join(DEMO_ROOT, "runtime");
const LOGS_DIR = path.join(DEMO_ROOT, "logs");

const LOCAL_DB_CONTAINER = "supabase_db_archive";
const LOCAL_REST_CONTAINER = "supabase_rest_archive";
const LOCAL_DB_HOST = "127.0.0.1";
const LOCAL_DB_PORT = 54322;

type DemoKeyMaterial = {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey & { kid: string; alg: string; use: string; key_ops: string[] };
  hs256Secret: string;
  cookieSecret: string;
  anonToken: string;
  serviceRoleToken: string;
};

type RuntimePidState = {
  sha: string;
  shortSha: string;
  port: number;
  nextPort: number;
  postgrestPort: number;
  dbName: string;
  postgrestPid: number;
  nextPid: number;
  gatewayPid: number;
  startedAt: string;
};

function ensureDirectories() {
  for (const dir of [DEMO_ROOT, BIN_DIR, KEYS_DIR, WORKTREES_DIR, RUNTIME_DIR, LOGS_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

function signEs256Jwt(payload: Record<string, unknown>, privateJwk: JsonWebKey, kid: string): string {
  const header = { alg: "ES256", typ: "JWT", kid };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = createPrivateKey({ key: privateJwk as never, format: "jwk" });
  const sig = cryptoSign("SHA256", Buffer.from(signingInput, "utf8"), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

function ensureDemoKeys(): DemoKeyMaterial {
  ensureDirectories();
  const keyFile = path.join(KEYS_DIR, "demo-jwt.json");
  if (existsSync(keyFile)) {
    return JSON.parse(readFileSync(keyFile, "utf8")) as DemoKeyMaterial;
  }

  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateJwk = privateKey.export({ format: "jwk" });
  const exportedPub = publicKey.export({ format: "jwk" });
  const kid = "demo-es256-1";
  const publicJwk = {
    ...exportedPub,
    kid,
    use: "sig",
    alg: "ES256",
    key_ops: ["verify"],
  };
  const hs256Secret = `demo-hs256-secret-${randomBytes(24).toString("hex")}`;
  const cookieSecret = `demo-cookie-secret-${randomBytes(24).toString("hex")}`;
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;

  const anonToken = signEs256Jwt(
    { iss: "amethyst-demo", role: "anon", exp, iat: Math.floor(Date.now() / 1000) },
    privateJwk,
    kid,
  );
  const serviceRoleToken = signHs256Jwt(
    { iss: "amethyst-demo", role: "service_role", exp, iat: Math.floor(Date.now() / 1000) },
    hs256Secret,
  );

  const material: DemoKeyMaterial = {
    privateJwk,
    publicJwk,
    hs256Secret,
    cookieSecret,
    anonToken,
    serviceRoleToken,
  };
  writeFileSync(keyFile, JSON.stringify(material, null, 2), { encoding: "utf8", mode: 0o600 });
  return material;
}

function ensurePostgrestBinary(): string {
  ensureDirectories();
  const binPath = path.join(BIN_DIR, "postgrest");
  if (existsSync(binPath)) return binPath;
  console.log("[demos] Extracting standalone PostgREST binary from local container...");
  execFileSync("docker", ["cp", `${LOCAL_REST_CONTAINER}:/bin/postgrest`, binPath], { stdio: "inherit" });
  chmodSync(binPath, 0o755);
  return binPath;
}

function runLocalPsql(database: string, sql: string) {
  execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function queryLocalPsql(database: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-t", "-A", "-U", "postgres", "-d", database, "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function buildBaseBootstrapSql(dbName: string): string {
  return `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

ALTER DATABASE ${dbName} SET search_path TO public, extensions;
ALTER ROLE authenticator IN DATABASE ${dbName} SET search_path TO public, extensions;
ALTER ROLE authenticated IN DATABASE ${dbName} SET search_path TO public, extensions;
ALTER ROLE anon IN DATABASE ${dbName} SET search_path TO public, extensions;
ALTER ROLE service_role IN DATABASE ${dbName} SET search_path TO public, extensions;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz DEFAULT now(),
  raw_app_meta_data jsonb DEFAULT '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT ALL ON TABLE auth.users TO postgres, service_role;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid(), auth.role() TO public, anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts,1)-1];
END
$$;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE storage.buckets, storage.objects TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO public, anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE,
  secret text
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
GRANT USAGE ON SCHEMA vault TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA vault TO postgres, service_role;

CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY,
  schedule text,
  command text,
  jobname text UNIQUE,
  active boolean DEFAULT true
);
CREATE OR REPLACE FUNCTION cron.schedule(p_name text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION cron.alter_job(
  job_id bigint,
  schedule text DEFAULT null,
  command text DEFAULT null,
  database text DEFAULT null,
  username text DEFAULT null,
  active boolean DEFAULT null
) RETURNS void LANGUAGE sql AS $$ SELECT; $$;
GRANT USAGE ON SCHEMA cron TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cron TO postgres, service_role;

CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(
  url text,
  body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
GRANT USAGE ON SCHEMA net TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres, service_role;

CREATE SCHEMA IF NOT EXISTS realtime;
GRANT USAGE ON SCHEMA realtime TO postgres, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
`;
}

function buildDemoHelperRpcsSql(sha: string, migrationCount: number): string {
  return `
CREATE TABLE IF NOT EXISTS public._demo_meta (
  sha text PRIMARY KEY,
  migration_count integer NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public._demo_meta FROM public, anon, authenticated;
GRANT ALL ON TABLE public._demo_meta TO service_role;
TRUNCATE TABLE public._demo_meta;
INSERT INTO public._demo_meta (sha, migration_count) VALUES ('${sha}', ${migrationCount});

CREATE OR REPLACE FUNCTION public._demo_provision_user(p_user_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (p_user_id, p_email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated', 'email', p_email)::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM public.ensure_profile();
  RETURN jsonb_build_object('id', p_user_id, 'email', p_email);
END;
$$;

CREATE OR REPLACE FUNCTION public._demo_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM storage.objects WHERE owner = p_user_id OR name LIKE p_user_id::text || '/%';
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._demo_user_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entries integer := 0;
  v_nodes integer := 0;
  v_tasks integer := 0;
BEGIN
  IF to_regclass('public.entries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.entries WHERE user_id = $1' INTO v_entries USING p_user_id;
  END IF;
  IF to_regclass('public.workspace_nodes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.workspace_nodes WHERE user_id = $1' INTO v_nodes USING p_user_id;
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.tasks WHERE user_id = $1' INTO v_tasks USING p_user_id;
  END IF;
  RETURN jsonb_build_object('entries', v_entries, 'nodes', v_nodes, 'tasks', v_tasks);
END;
$$;

CREATE OR REPLACE FUNCTION public._demo_record_storage_object(
  p_user_id uuid,
  p_bucket text,
  p_name text,
  p_mime text,
  p_size integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES (p_bucket, p_bucket, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO storage.objects (bucket_id, name, owner, owner_id, metadata)
  VALUES (
    p_bucket,
    p_name,
    p_user_id,
    p_user_id::text,
    jsonb_build_object('mimetype', p_mime, 'size', p_size)
  )
  ON CONFLICT (bucket_id, name) DO UPDATE
    SET metadata = EXCLUDED.metadata, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public._demo_provision_user(uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._demo_delete_user(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._demo_user_counts(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._demo_record_storage_object(uuid, text, text, text, integer) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._demo_provision_user(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._demo_delete_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._demo_user_counts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._demo_record_storage_object(uuid, text, text, text, integer) TO service_role;
`;
}

function sanitizeMigrationSqlForDemo(sql: string): string {
  return sql
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_cron\s*;/gi, "-- pg_cron stubbed in demo database")
    .replace(/create\s+extension\s+if\s+not\s+exists\s+pg_net[^;]*;/gi, "-- pg_net stubbed in demo database");
}

function prepareDemoDatabase(spec: EnabledDemoSpec, forceReset = false) {
  if (!/^[a-z0-9_]+$/.test(spec.dbName) || !spec.dbName.startsWith("demo_")) {
    throw new Error(`Refusing to touch non-demo database name: ${spec.dbName}`);
  }

  const migrations = execFileSync("git", ["ls-tree", "--name-only", spec.sha, "supabase/migrations/"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter((line) => line.endsWith(".sql"))
    .sort();

  const dbExists =
    queryLocalPsql("postgres", `SELECT 1 FROM pg_database WHERE datname = '${spec.dbName}';`) === "1";

  if (dbExists && !forceReset) {
    try {
      const currentSha = queryLocalPsql(spec.dbName, "SELECT sha FROM public._demo_meta LIMIT 1;");
      if (currentSha === spec.sha) {
        console.log(`[demos] Database ${spec.dbName} already migrated for ${spec.shortSha} (${migrations.length} migrations).`);
        return;
      }
    } catch {
      // Recreate below
    }
  }

  console.log(`[demos] Initializing isolated database ${spec.dbName} for ${spec.shortSha} (${migrations.length} migrations)...`);
  if (dbExists) {
    runLocalPsql(
      "postgres",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${spec.dbName}' AND pid <> pg_backend_pid();
       DROP DATABASE IF EXISTS ${spec.dbName};`,
    );
  }
  runLocalPsql("postgres", `CREATE DATABASE ${spec.dbName};`);
  runLocalPsql(spec.dbName, buildBaseBootstrapSql(spec.dbName));

  for (const migPath of migrations) {
    const rawSql = execFileSync("git", ["show", `${spec.sha}:${migPath}`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const cleanedSql = `SET search_path TO public, extensions;\n${sanitizeMigrationSqlForDemo(rawSql)}`;
    runLocalPsql(spec.dbName, cleanedSql);
  }

  runLocalPsql(spec.dbName, buildDemoHelperRpcsSql(spec.sha, migrations.length));
  console.log(`[demos] Database ${spec.dbName} ready.`);
}

function patchWorktreeForDemoIsolation(worktreeDir: string, spec: EnabledDemoSpec) {
  const cookieName = `sb-demo-${spec.shortSha}-auth-token`;

  for (const relPath of ["src/lib/supabase/server.ts", "src/lib/supabase/proxy.ts"]) {
    const full = path.join(worktreeDir, relPath);
    if (!existsSync(full)) continue;
    const src = readFileSync(full, "utf8");
    if (!src.includes("cookieOptions:")) {
      const patched = src.replace(
        "cookies: {",
        `cookieOptions: { name: "${cookieName}" },\n      cookies: {`,
      );
      writeFileSync(full, patched, "utf8");
    }
  }

  const clientPath = path.join(worktreeDir, "src/lib/supabase/client.ts");
  if (existsSync(clientPath)) {
    const src = readFileSync(clientPath, "utf8");
    if (!src.includes("cookieOptions")) {
      const patched = src.replace(
        "createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
        `createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookieOptions: { name: "${cookieName}" } })`,
      );
      writeFileSync(clientPath, patched, "utf8");
    }
  }

  const startupPath = path.join(worktreeDir, "src/lib/startup.ts");
  if (existsSync(startupPath)) {
    const src = readFileSync(startupPath, "utf8");
    const patched = src.replace(
      'STARTUP_COOKIE = "archive-started"',
      `STARTUP_COOKIE = "archive-started-demo-${spec.shortSha}"`,
    );
    writeFileSync(startupPath, patched, "utf8");
  }
}

function prepareWorktreeAndBuild(spec: EnabledDemoSpec, keys: DemoKeyMaterial, forceRebuild = false) {
  const worktreeDir = path.join(WORKTREES_DIR, spec.shortSha);
  const buildIdPath = path.join(worktreeDir, ".next-demo", "BUILD_ID");
  const stampPath = path.join(worktreeDir, ".demo-build-sha");

  if (!forceRebuild && existsSync(buildIdPath) && existsSync(stampPath)) {
    const builtSha = readFileSync(stampPath, "utf8").trim();
    if (builtSha === spec.sha) {
      console.log(`[demos] Build for ${spec.shortSha} already up to date at ${worktreeDir}/.next-demo.`);
      return;
    }
  }

  console.log(`[demos] Extracting clean source tree for ${spec.shortSha} into ${worktreeDir}...`);
  if (existsSync(worktreeDir)) {
    rmSync(worktreeDir, { recursive: true, force: true });
  }
  mkdirSync(worktreeDir, { recursive: true });

  const tarArchive = execFileSync("git", ["archive", "--format=tar", spec.sha], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync("tar", ["-xf", "-", "-C", worktreeDir], { input: tarArchive });

  patchWorktreeForDemoIsolation(worktreeDir, spec);

  // Hardlink-copy node_modules so Turbopack sees files inside the worktree root without duplicating disk blocks
  try {
    execFileSync("cp", ["-al", path.join(REPO_ROOT, "node_modules"), path.join(worktreeDir, "node_modules")]);
  } catch {
    symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(worktreeDir, "node_modules"), "dir");
  }

  const sanitizedEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_DIST_DIR: ".next-demo",
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${spec.port}/__demo/supabase`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.anonToken,
    SUPABASE_SERVICE_ROLE_KEY: keys.serviceRoleToken,
    APP_URL: `http://localhost:${spec.port}`,
    ATTACHMENT_STORAGE: "supabase",
  };

  console.log(`[demos] Building Next.js bundle for ${spec.shortSha} (${spec.milestone})...`);
  execFileSync(path.join(worktreeDir, "node_modules", ".bin", "next"), ["build"], {
    cwd: worktreeDir,
    env: sanitizedEnv,
    stdio: "inherit",
  });

  writeFileSync(stampPath, `${spec.sha}\n`, "utf8");
  console.log(`[demos] Built ${spec.shortSha} successfully.`);
}

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkHttpReady(url: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHttpReady(url: string, attempts = 40, delayMs = 250): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await checkHttpReady(url)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function stopDemo(spec: EnabledDemoSpec) {
  const pidFile = path.join(RUNTIME_DIR, `${spec.shortSha}.pid.json`);
  if (existsSync(pidFile)) {
    try {
      const state = JSON.parse(readFileSync(pidFile, "utf8")) as RuntimePidState;
      for (const pid of [state.gatewayPid, state.nextPid, state.postgrestPid]) {
        if (isProcessAlive(pid)) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {}
        }
      }
    } catch {}
    rmSync(pidFile, { force: true });
  }
}

async function startDemo(spec: EnabledDemoSpec, keys: DemoKeyMaterial) {
  const pidFile = path.join(RUNTIME_DIR, `${spec.shortSha}.pid.json`);
  if (existsSync(pidFile)) {
    try {
      const existing = JSON.parse(readFileSync(pidFile, "utf8")) as RuntimePidState;
      if (
        isProcessAlive(existing.gatewayPid) &&
        isProcessAlive(existing.nextPid) &&
        isProcessAlive(existing.postgrestPid) &&
        (await checkHttpReady(`http://127.0.0.1:${spec.port}/__demo/status`))
      ) {
        console.log(`[demos] ${spec.shortSha} (${spec.milestone}) is already running on http://localhost:${spec.port}`);
        return;
      }
    } catch {}
    stopDemo(spec);
  }

  const postgrestBin = ensurePostgrestBinary();
  const worktreeDir = path.join(WORKTREES_DIR, spec.shortSha);
  if (!existsSync(path.join(worktreeDir, ".next-demo", "BUILD_ID"))) {
    throw new Error(`Demo ${spec.shortSha} is not built yet. Run: npm run demos -- prepare ${spec.shortSha}`);
  }

  const catalogEntry = VERSION_HISTORY_CATALOG.find((c) => c.sha === spec.sha);
  const jwtSecretJson = JSON.stringify({
    keys: [
      keys.publicJwk,
      {
        kty: "oct",
        k: base64UrlEncode(Buffer.from(keys.hs256Secret, "utf8")),
        alg: "HS256",
      },
    ],
  });

  // 1. Start dedicated PostgREST for demo_<shortSha>
  const postgrestChild = spawn(postgrestBin, [], {
    cwd: DEMO_ROOT,
    detached: true,
    stdio: "ignore",
    env: {
1      NODE_ENV: "production",
      PATH: process.env.PATH,
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(spec.postgrestPort),
      PGRST_DB_URI: `postgresql://authenticator:postgres@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${spec.dbName}`,
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: jwtSecretJson,
    },
  });
  postgrestChild.unref();

  // 2. Start historical Next.js production server on loopback nextPort
  const nextBin = path.join(worktreeDir, "node_modules", ".bin", "next");
  const nextChild = spawn(nextBin, ["start", "-p", String(spec.nextPort), "-H", "127.0.0.1"], {
    cwd: worktreeDir,
    detached: true,
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-demo",
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${spec.port}/__demo/supabase`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.anonToken,
      SUPABASE_SERVICE_ROLE_KEY: keys.serviceRoleToken,
      APP_URL: `http://localhost:${spec.port}`,
      ATTACHMENT_STORAGE: "supabase",
    },
  });
  nextChild.unref();

  // 3. Start Demo Isolation Gateway on spec.port
  const gatewayConfigPath = path.join(RUNTIME_DIR, `${spec.shortSha}-gateway.json`);
  writeFileSync(
    gatewayConfigPath,
    JSON.stringify(
      {
        sha: spec.sha,
        shortSha: spec.shortSha,
        milestone: spec.milestone,
        eraSummary: spec.eraSummary,
        commitDate: catalogEntry?.commitDate ?? "2026-10-01",
        releaseDate: catalogEntry?.releaseDate ?? null,
        port: spec.port,
        nextPort: spec.nextPort,
        postgrestPort: spec.postgrestPort,
        dbName: spec.dbName,
        retentionHours: spec.retentionHours,
        defaultPath: spec.defaultPath,
        mainAppOrigin: process.env.MAIN_APP_ORIGIN || "http://localhost:3000",
        demoRoot: DEMO_ROOT,
        privateJwk: keys.privateJwk,
        publicJwk: keys.publicJwk,
        cookieSecret: keys.cookieSecret,
        anonToken: keys.anonToken,
        serviceRoleToken: keys.serviceRoleToken,
      },
      null,
      2,
    ),
    "utf8",
  );

  const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const gatewayScript = path.join(REPO_ROOT, "scripts", "version-demo-gateway.ts");
  const gatewayChild = spawn(tsxBin, [gatewayScript, gatewayConfigPath], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
    },
  });
  gatewayChild.unref();

  const pidState: RuntimePidState = {
    sha: spec.sha,
    shortSha: spec.shortSha,
    port: spec.port,
    nextPort: spec.nextPort,
    postgrestPort: spec.postgrestPort,
    dbName: spec.dbName,
    postgrestPid: postgrestChild.pid ?? 0,
    nextPid: nextChild.pid ?? 0,
    gatewayPid: gatewayChild.pid ?? 0,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(pidFile, JSON.stringify(pidState, null, 2), "utf8");

  const ok = await waitForHttpReady(`http://127.0.0.1:${spec.port}/__demo/status`);
  if (!ok) {
    throw new Error(`Demo gateway for ${spec.shortSha} did not become ready on port ${spec.port}.`);
  }
  await waitForHttpReady(`http://127.0.0.1:${spec.nextPort}/login`);
  console.log(`[demos] Started ${spec.shortSha} (${spec.milestone}) -> http://localhost:${spec.port}`);
}

function resolveSpecs(targetArg: string | undefined, extraFlags: Record<string, string>): EnabledDemoSpec[] {
  if (extraFlags.sha) {
    const fullSha = extraFlags.sha.trim().toLowerCase();
    const existing = ENABLED_DEMO_SPECS.find((s) => s.sha === fullSha || s.shortSha === fullSha);
    if (existing) return [existing];
    if (!/^[0-9a-f]{40}$/.test(fullSha)) {
      throw new Error(`--sha must be a full 40-character hexadecimal commit SHA.`);
    }
    const port = Number(extraFlags.port || 4109);
    const shortSha = fullSha.slice(0, 7);
    return [
      {
        sha: fullSha,
        shortSha,
        milestone: extraFlags.milestone || `Custom Demo ${shortSha}`,
        eraSummary: `Custom prepared historical demo for commit ${shortSha}.`,
        port,
        nextPort: port + 100,
        postgrestPort: port + 200,
        dbName: `demo_${shortSha}`,
        retentionHours: DEMO_RETENTION_HOURS,
        defaultPath: extraFlags.defaultPath || "/",
        features: ["Custom prepared milestone demo"],
        containedIntegrations: ["Isolated local demo database and storage"],
      },
    ];
  }

  if (!targetArg || targetArg === "all") {
    return [...ENABLED_DEMO_SPECS];
  }
  const normalized = targetArg.trim().toLowerCase();
  const matched = ENABLED_DEMO_SPECS.filter(
    (s) => s.sha === normalized || s.shortSha === normalized || s.sha.startsWith(normalized),
  );
  if (matched.length === 0) {
    throw new Error(
      `No enabled demo spec matches "${targetArg}". Enabled short SHAs: ${ENABLED_DEMO_SPECS.map((s) => s.shortSha).join(", ")}`,
    );
  }
  return matched;
}

function parseFlags(argv: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function printStatus() {
  console.log("SHA      | Port | DB            | Built | Running | Milestone");
  console.log("---------+------+---------------+-------+---------+------------------------------------------");
  for (const spec of ENABLED_DEMO_SPECS) {
    const worktreeDir = path.join(WORKTREES_DIR, spec.shortSha);
    const built = existsSync(path.join(worktreeDir, ".next-demo", "BUILD_ID"));
    const running = await checkHttpReady(`http://127.0.0.1:${spec.port}/__demo/status`, 800);
    console.log(
      `${spec.shortSha.padEnd(8)} | ${String(spec.port).padEnd(4)} | ${spec.dbName.padEnd(13)} | ${(built ? "yes" : "no").padEnd(5)} | ${(running ? "online" : "stopped").padEnd(7)} | ${spec.milestone}`,
    );
  }
}

async function main() {
  ensureDirectories();
  const { positional, flags } = parseFlags(process.argv.slice(2));
  const command = positional[0] || "status";
  const target = positional[1];

  if (command === "status") {
    await printStatus();
    return;
  }

  const specs = resolveSpecs(target, flags);
  const keys = ensureDemoKeys();

  if (command === "prepare") {
    ensurePostgrestBinary();
    const force = flags.force === "true";
    for (const spec of specs) {
      prepareDemoDatabase(spec, force);
      prepareWorktreeAndBuild(spec, keys, force);
    }
    return;
  }

  if (command === "start") {
    for (const spec of specs) {
      await startDemo(spec, keys);
    }
    return;
  }

  if (command === "stop") {
    for (const spec of specs) {
      stopDemo(spec);
      console.log(`[demos] Stopped ${spec.shortSha}.`);
    }
    return;
  }

  if (command === "reset-db") {
    for (const spec of specs) {
      prepareDemoDatabase(spec, true);
      const storageDir = path.join(DEMO_ROOT, "storage", spec.shortSha);
      if (existsSync(storageDir)) rmSync(storageDir, { recursive: true, force: true });
      const visitorsFile = path.join(DEMO_ROOT, "state", `${spec.shortSha}-visitors.json`);
      if (existsSync(visitorsFile)) rmSync(visitorsFile, { force: true });
      console.log(`[demos] Reset database and visitor state for ${spec.shortSha}.`);
    }
    return;
  }

  console.error(`Unknown command "${command}". Supported: prepare | start | stop | status | reset-db`);
  process.exit(1);
}

void main().catch((err) => {
  console.error("[demos] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

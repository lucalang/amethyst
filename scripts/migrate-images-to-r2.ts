/**
 * Copy uploaded images from Supabase Storage (bucket note-attachments) to the private R2 bucket.
 *
 *   npm run images:migrate                     # dry run: inventory, broken references, estimated download
 *   npm run images:migrate -- --apply          # copy + verify + record (resumable; safe to re-run)
 *   npm run images:migrate -- --apply --limit 20 --concurrency 4
 *   npm run images:migrate -- --verify         # re-download every recorded R2 copy and compare checksums
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and the R2_* variables (.env.local).
 * Supabase originals are only read, never changed or deleted. Each copied object is verified
 * (size, MD5 checked by R2 on write, SHA-256 of a fresh R2 download) before its manifest row in
 * public.attachment_objects is marked verified, which is what switches its delivery to R2.
 * A JSONL report of every object is written to .r2-migration/.
 */
import { createHash } from "node:crypto";
import { mkdirSync, appendFileSync } from "node:fs";
import { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, findImageEmbeds, isUploadedImagePath, isValidAttachmentName, resolveImageSrc, uploadedImageName } from "../src/lib/attachments";
import type { Database } from "../src/lib/supabase/database.types";

type InventoryRow = Database["public"]["Functions"]["attachment_inventory"]["Returns"][number];
type Status = "copied" | "already" | "verified" | "invalid" | "collision" | "failed";
type Result = { key: string; status: Status; reason?: string; bytes?: number; sha256?: string };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(`--${name}`);
  const value = index === -1 ? NaN : Number(args[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};
const APPLY = flag("apply");
const VERIFY = flag("verify");
const CONCURRENCY = Math.min(option("concurrency", 4), 8);
const LIMIT = option("limit", Infinity);
const RETRIES = 3;
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class QuotaError extends Error {}

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const supabase = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function r2(): { client: S3Client; bucket: string } | null {
  const keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
  if (!keys.every((key) => process.env[key]?.trim())) return null;
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT?.trim() || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 1,
  });
  return { client, bucket: env("R2_BUCKET") };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const hash = (algorithm: "md5" | "sha256", data: Buffer) => createHash(algorithm).update(data).digest("hex");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusOf = (error: unknown) =>
  error instanceof S3ServiceException ? error.$metadata.httpStatusCode : Number((error as { status?: unknown; statusCode?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode) || undefined;
const transient = (error: unknown) => {
  const status = statusOf(error);
  return status === undefined || status === 429 || status >= 500;
};

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof QuotaError || attempt >= RETRIES || !transient(error)) throw error;
      console.warn(`  retry ${attempt}/${RETRIES - 1} ${label}: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(500 * 2 ** attempt);
    }
  }
}

async function inventory(): Promise<InventoryRow[]> {
  const rows: InventoryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc("attachment_inventory").range(from, from + PAGE - 1);
    if (error) throw new Error(`Inventory failed: ${error.message}${error.code === "PGRST202" ? " (apply migration 20261101000100_r2_attachments first)" : ""}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** Image references saved in account data, as "<user>/<name>" keys, plus direct Supabase Storage links. */
async function references() {
  const keys = new Map<string, string>();
  let storageLinks = 0;
  const add = (userId: string, value: string | null, where: string) => {
    if (!value) return;
    if (value.includes("/storage/v1/")) storageLinks++;
    if (isUploadedImagePath(value)) keys.set(`${userId}/${uploadedImageName(value)}`, where);
  };
  const entries = await selectAll<{ user_id: string; cover_url: string | null; banner_url: string | null }>((a, b) => supabase.from("entries").select("user_id, cover_url, banner_url").order("id").range(a, b));
  for (const row of entries) {
    add(row.user_id, row.cover_url, "entry cover");
    add(row.user_id, row.banner_url, "entry banner");
  }
  const collections = await selectAll<{ user_id: string; banner_url: string | null }>((a, b) => supabase.from("collections").select("user_id, banner_url").order("id").range(a, b));
  for (const row of collections) add(row.user_id, row.banner_url, "collection banner");
  const users = await selectAll<{ id: string; avatar_url: string | null }>((a, b) => supabase.from("users").select("id, avatar_url").order("id").range(a, b));
  for (const row of users) add(row.id, row.avatar_url, "avatar");
  const fan = await selectAll<{ user_id: string; image_url: string | null }>((a, b) => supabase.from("home_fan_items").select("user_id, image_url").order("id").range(a, b));
  for (const row of fan) add(row.user_id, row.image_url, "Home artwork");
  const notes = await selectAll<{ user_id: string; content: string }>((a, b) => supabase.from("workspace_nodes").select("user_id, content").eq("kind", "note").order("id").range(a, b));
  for (const row of notes) {
    if (row.content.includes("/storage/v1/")) storageLinks++;
    for (const line of row.content.split("\n")) {
      for (const embed of findImageEmbeds(line)) add(row.user_id, resolveImageSrc(embed.target), "note embed");
    }
  }
  return { keys, storageLinks };
}

function parseKey(row: InventoryRow): { userId: string; name: string } | string {
  const slash = row.object_name.indexOf("/");
  const userId = row.object_name.slice(0, slash);
  const name = row.object_name.slice(slash + 1);
  if (slash < 0 || !UUID.test(userId) || !isValidAttachmentName(name)) return "not a <user id>/<image name> key the app can serve";
  if (!row.content_type || !(row.content_type in ATTACHMENT_TYPES)) return `unsupported content type ${row.content_type ?? "(none)"}`;
  if (row.size_bytes === null || row.size_bytes > MAX_ATTACHMENT_BYTES) return "missing or oversized size metadata";
  if (row.origin === "r2") return "collision: the same name is also an R2 upload";
  return { userId, name };
}

async function downloadLegacy(key: string): Promise<Buffer> {
  return withRetry(`download ${key}`, async () => {
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).download(key);
    if (error) {
      const status = statusOf(error);
      if (status === 402 || status === 429 || /quota|exceed|restrict/i.test(error.message)) {
        throw new QuotaError(`Supabase refused the download (${status ?? "?"}: ${error.message}). This looks like a quota or plan restriction; stopping.`);
      }
      throw Object.assign(new Error(`download failed: ${error.message}`), { status });
    }
    return Buffer.from(await data.arrayBuffer());
  });
}

async function readR2(store: NonNullable<ReturnType<typeof r2>>, key: string) {
  const object = await store.client.send(new GetObjectCommand({ Bucket: store.bucket, Key: key }));
  const body = Buffer.from(await object.Body!.transformToByteArray());
  return { body, contentType: object.ContentType ?? "", etag: (object.ETag ?? "").replaceAll('"', ""), sha256: object.Metadata?.sha256 };
}

async function copyOne(store: NonNullable<ReturnType<typeof r2>>, row: InventoryRow): Promise<Result> {
  const key = row.object_name;
  const parsed = parseKey(row);
  if (typeof parsed === "string") return { key, status: parsed.startsWith("collision") ? "collision" : "invalid", reason: parsed };
  if (row.r2_state === "verified" && row.manifest_size === row.size_bytes) return { key, status: "already" };

  try {
    const data = await downloadLegacy(key);
    if (data.length !== row.size_bytes) return { key, status: "failed", reason: `downloaded ${data.length} bytes, metadata says ${row.size_bytes}` };
    const md5 = hash("md5", data);
    const sha256 = hash("sha256", data);
    const legacyEtag = (row.etag ?? "").replaceAll('"', "");
    if (/^[0-9a-f]{32}$/.test(legacyEtag) && legacyEtag !== md5) return { key, status: "failed", reason: "download does not match the Supabase checksum" };

    await withRetry(`upload ${key}`, async () => {
      try {
        await store.client.send(
          new PutObjectCommand({
            Bucket: store.bucket,
            Key: key,
            Body: data,
            ContentType: row.content_type!,
            ContentLength: data.length,
            ContentMD5: Buffer.from(md5, "hex").toString("base64"),
            IfNoneMatch: "*",
            Metadata: { sha256, source: "supabase" },
          }),
        );
      } catch (error) {
        // Already there from an earlier run: fine if identical, never overwritten otherwise.
        if (statusOf(error) !== 412) throw error;
        const head = await store.client.send(new HeadObjectCommand({ Bucket: store.bucket, Key: key }));
        if (head.ContentLength !== data.length || (head.ETag ?? "").replaceAll('"', "") !== md5) {
          throw Object.assign(new Error("collision: R2 already holds different content under this key"), { status: 409 });
        }
      }
    });

    const stored = await withRetry(`verify ${key}`, () => readR2(store, key));
    if (stored.body.length !== data.length || hash("sha256", stored.body) !== sha256 || stored.contentType !== row.content_type) {
      return { key, status: "failed", reason: "R2 copy does not match (size, SHA-256 or content type)" };
    }

    const { error } = await supabase.from("attachment_objects").upsert(
      {
        user_id: parsed.userId,
        name: parsed.name,
        origin: "supabase",
        r2_state: "verified",
        content_type: row.content_type!,
        size_bytes: data.length,
        md5,
        sha256,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name" },
    );
    if (error) return { key, status: "failed", reason: `copied and verified, but the manifest update failed: ${error.message}` };
    return { key, status: "copied", bytes: data.length, sha256 };
  } catch (error) {
    if (error instanceof QuotaError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { key, status: message.startsWith("collision") ? "collision" : "failed", reason: message };
  }
}

async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>, onDone: (result: R, done: number) => void) {
  let next = 0;
  let done = 0;
  let stop: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (!stop && next < items.length) {
        const item = items[next++];
        try {
          onDone(await worker(item), ++done);
        } catch (error) {
          stop = error;
        }
      }
    }),
  );
  if (stop) throw stop;
}

function summarize(results: Result[]) {
  const counts = results.reduce<Record<string, number>>((all, result) => ({ ...all, [result.status]: (all[result.status] ?? 0) + 1 }), {});
  console.log(`\nSummary: ${Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(", ") || "nothing to do"}`);
  const problems = results.filter((result) => result.status === "failed" || result.status === "collision" || result.status === "invalid");
  for (const problem of problems) console.log(`  ${problem.status.toUpperCase()} ${problem.key}: ${problem.reason}`);
  return problems.length;
}

async function main() {
  const store = r2();
  const rows = await inventory();
  const totalBytes = rows.reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
  const verified = rows.filter((row) => row.r2_state === "verified" && row.manifest_size === row.size_bytes);
  const pending = rows.filter((row) => !verified.includes(row));
  const pendingBytes = pending.reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
  const { count: r2Uploads } = await supabase.from("attachment_objects").select("*", { count: "exact", head: true }).eq("origin", "r2").eq("r2_state", "verified");

  console.log(`Legacy Supabase objects: ${rows.length} (${mb(totalBytes)})`);
  console.log(`  verified in R2: ${verified.length}; still to copy: ${pending.length} (${mb(pendingBytes)} of one-time Supabase download)`);
  console.log(`Images uploaded straight to R2: ${r2Uploads ?? 0}`);

  if (!APPLY && !VERIFY) {
    const { keys, storageLinks } = await references();
    const known = new Set(rows.map((row) => row.object_name));
    const manifest = await selectAll<{ user_id: string; name: string }>((a, b) => supabase.from("attachment_objects").select("user_id, name").eq("origin", "r2").order("user_id").order("name").range(a, b));
    for (const row of manifest) known.add(`${row.user_id}/${row.name}`);
    const missing = [...keys].filter(([key]) => !known.has(key));
    console.log(`Saved references to uploaded images: ${keys.size}; missing from both stores: ${missing.length}`);
    for (const [key, where] of missing) console.log(`  MISSING ${key} (${where})`);
    console.log(`Direct Supabase Storage links saved in data: ${storageLinks}`);
    for (const row of pending) {
      const parsed = parseKey(row);
      if (typeof parsed === "string") console.log(`  CANNOT COPY ${row.object_name}: ${parsed}`);
    }
    if (!store) console.log("\nR2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET); --apply needs it.");
    else {
      try {
        await store.client.send(new HeadBucketCommand({ Bucket: store.bucket }));
        console.log("\nR2 bucket reachable with the configured credentials.");
      } catch (error) {
        console.log(`\nR2 bucket check failed (${statusOf(error) ?? "network"}). Check the bucket name and token scope.`);
      }
    }
    console.log("Dry run only: nothing was downloaded, copied or changed.");
    return;
  }

  if (!store) throw new Error("R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  mkdirSync(".r2-migration", { recursive: true });
  const report = `.r2-migration/${VERIFY ? "verify" : "copy"}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const results: Result[] = [];
  const record = (result: Result, done: number, total: number) => {
    results.push(result);
    appendFileSync(report, `${JSON.stringify({ ...result, at: new Date().toISOString() })}\n`);
    console.log(`[${done}/${total}] ${result.status} ${result.key}${result.bytes ? ` (${mb(result.bytes)})` : ""}${result.reason ? ` - ${result.reason}` : ""}`);
  };

  if (VERIFY) {
    const manifest = await selectAll<{ user_id: string; name: string; size_bytes: number; md5: string | null; sha256: string | null; content_type: string }>((a, b) =>
      supabase.from("attachment_objects").select("user_id, name, size_bytes, md5, sha256, content_type").eq("r2_state", "verified").order("user_id").order("name").range(a, b),
    );
    const work = manifest.slice(0, LIMIT);
    await pool(
      work,
      async (row): Promise<Result> => {
        const key = `${row.user_id}/${row.name}`;
        try {
          const stored = await withRetry(`read ${key}`, () => readR2(store, key));
          const sha256 = hash("sha256", stored.body);
          const ok = stored.body.length === row.size_bytes && hash("md5", stored.body) === row.md5 && (!row.sha256 || sha256 === row.sha256) && stored.contentType === row.content_type;
          return { key, status: ok ? "verified" : "failed", reason: ok ? undefined : "R2 object differs from the manifest", bytes: stored.body.length };
        } catch (error) {
          return { key, status: "failed", reason: statusOf(error) === 404 ? "missing in R2" : error instanceof Error ? error.message : String(error) };
        }
      },
      (result, done) => record(result, done, work.length),
    );
    console.log(`Verified manifest rows: ${work.length} of ${manifest.length}; legacy objects: ${rows.length}, verified copies of them: ${verified.length}.`);
  } else {
    const work = pending.slice(0, LIMIT);
    console.log(`Copying ${work.length} object(s) with concurrency ${CONCURRENCY}…`);
    try {
      await pool(work, (row) => copyOne(store, row), (result, done) => record(result, done, work.length));
    } catch (error) {
      if (!(error instanceof QuotaError)) throw error;
      console.error(`\nSTOPPED: ${error.message}`);
      process.exitCode = 2;
    }
  }

  const problems = summarize(results);
  console.log(`Report: ${report}`);
  if (problems) process.exitCode ||= 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

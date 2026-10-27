import "server-only";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverEnv } from "@/lib/env";

/** Delivery URLs are signed per window, so an unchanged image keeps one URL (and one browser cache entry). */
const SIGN_WINDOW_SECONDS = 2 * 60 * 60;
const URL_LIFETIME_SECONDS = 2 * SIGN_WINDOW_SECONDS;
/** A cached redirect always expires this long before its signature. */
const REDIRECT_MARGIN_SECONDS = 5 * 60;
const UPLOAD_URL_SECONDS = 10 * 60;

type R2 = { client: S3Client; bucket: string };
let cached: R2 | null | undefined;

function r2(): R2 | null {
  if (cached !== undefined) return cached;
  const env = serverEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) return (cached = null);
  const client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    // Path-style keeps every bucket URL on one origin, which is what the CSP allows.
    forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // Default SDK checksums would be signed into presigned URLs and break browser uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return (cached = { client, bucket: env.R2_BUCKET });
}

export const r2Configured = () => r2() !== null;

/** Where new uploads go: R2 only after the explicit ATTACHMENT_STORAGE=r2 cutover. */
export const uploadTarget = (): "r2" | "supabase" => (serverEnv().ATTACHMENT_STORAGE === "r2" && r2Configured() ? "r2" : "supabase");

/** The only key format: callers pass the verified session user and a validated attachment name. */
export const objectKey = (userId: string, name: string) => `${userId}/${name}`;

function required(): R2 {
  const value = r2();
  if (!value) throw new Error("R2 is not configured.");
  return value;
}

/** A one-time browser upload that cannot overwrite, change type or change size. */
export async function presignUpload(key: string, contentType: string, size: number) {
  const { client, bucket } = required();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size, IfNoneMatch: "*" }),
    { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(["content-type"]) },
  );
  return { url, headers: { "Content-Type": contentType, "If-None-Match": "*" } };
}

/**
 * A read URL that is identical for the whole signing window and valid for twice that long.
 * `maxAge` is how long a redirect to it may be cached: always shorter than the signature.
 * `cors` signs a separate URL for CORS-mode loads (3D textures), so a cached non-CORS response
 * without Access-Control headers is never reused for them.
 */
export async function presignDownload(key: string, cors: boolean) {
  const { client, bucket } = required();
  const now = Date.now();
  const windowStart = Math.floor(now / 1000 / SIGN_WINDOW_SECONDS) * SIGN_WINDOW_SECONDS;
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseCacheControl: `private, max-age=${URL_LIFETIME_SECONDS}, immutable`,
      ...(cors ? { ResponseContentDisposition: "inline" } : {}),
    }),
    { expiresIn: URL_LIFETIME_SECONDS, signingDate: new Date(windowStart * 1000) },
  );
  const maxAge = windowStart + URL_LIFETIME_SECONDS - Math.ceil(now / 1000) - REDIRECT_MARGIN_SECONDS;
  return { url, maxAge };
}

/** Stored object metadata, or null when it does not exist. */
export async function headObject(key: string) {
  const { client, bucket } = required();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: head.ContentLength ?? -1, contentType: head.ContentType ?? "", etag: (head.ETag ?? "").replaceAll('"', "") };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
    throw error;
  }
}

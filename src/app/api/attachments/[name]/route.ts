import { NextResponse } from "next/server";
import { ATTACHMENT_BUCKET, isValidAttachmentName } from "@/lib/attachments";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { headObject, objectKey, presignDownload, r2Configured } from "@/lib/r2";

type Params = { params: Promise<{ name: string }> };

const SIGNED_URL_SECONDS = 60 * 60;

async function attachmentName(params: Params["params"]) {
  const { name: raw } = await params;
  try {
    const name = decodeURIComponent(raw);
    return isValidAttachmentName(name) ? name : null;
  } catch {
    return null;
  }
}

const notFound = () => apiError(404, "not_found", "Image not found.");

/**
 * Serve an image from the signed-in user's own folder via a short-lived signed URL.
 * Verified R2 copies load from R2; files without one load from the legacy Supabase bucket.
 */
export async function GET(request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const name = await attachmentName(params);
  if (!name) return notFound();

  const { data: row, error } = await ctx.supabase.from("attachment_objects").select("origin, r2_state").eq("user_id", ctx.userId).eq("name", name).maybeSingle();
  if (error) return dbError(error, "Could not load the image.");
  if (row?.r2_state === "verified") {
    if (!r2Configured()) return apiError(503, "storage_unavailable", "Image storage is not configured. Please try again later.");
    const cors = new URL(request.url).searchParams.has("cors");
    const { url, maxAge } = await presignDownload(objectKey(ctx.userId, name), cors);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": `private, max-age=${maxAge}`, Vary: "Cookie" } });
  }
  if (row?.origin === "r2") return notFound();

  const { data, error: signError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(objectKey(ctx.userId, name), SIGNED_URL_SECONDS);
  if (signError || !data?.signedUrl) return notFound();

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // Shorter than the signature, so a cached redirect never points at an expired URL.
    headers: { "Cache-Control": "private, max-age=1800", Vary: "Cookie" },
  });
}

/** Confirm a finished browser upload to R2 after checking the stored object. */
export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const name = await attachmentName(params);
  if (!name || !r2Configured()) return notFound();

  const { data: row, error } = await ctx.supabase.from("attachment_objects").select("origin, r2_state, size_bytes, content_type").eq("user_id", ctx.userId).eq("name", name).maybeSingle();
  if (error) return dbError(error, "Could not confirm the upload.");
  if (!row || row.origin !== "r2") return notFound();
  if (row.r2_state === "verified") return jsonResponse({ name });

  const stored = await headObject(objectKey(ctx.userId, name));
  if (!stored) return apiError(409, "upload_missing", "The image did not finish uploading. Try again.");
  if (stored.size !== row.size_bytes || stored.contentType !== row.content_type || !/^[0-9a-f]{32}$/.test(stored.etag)) {
    console.error("attachment confirm mismatch");
    return apiError(422, "upload_mismatch", "The uploaded image could not be verified. Try again.");
  }
  const { data: confirmed, error: confirmError } = await ctx.supabase.rpc("confirm_attachment", { p_name: name, p_size: stored.size, p_md5: stored.etag });
  if (confirmError) return dbError(confirmError, "Could not confirm the upload.");
  if (!confirmed) return apiError(409, "conflict", "The upload could not be confirmed. Try again.");
  return jsonResponse({ name });
}

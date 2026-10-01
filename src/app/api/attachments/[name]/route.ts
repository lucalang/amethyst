import { NextResponse } from "next/server";
import { ATTACHMENT_BUCKET, isValidAttachmentName } from "@/lib/attachments";
import { apiError, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ name: string }> };

const SIGNED_URL_SECONDS = 60 * 60;

/** Serve an embedded note image from the signed-in user's own folder via a short-lived signed URL. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { name: raw } = await params;
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return apiError(404, "not_found", "Image not found.");
  }
  if (!isValidAttachmentName(name)) return apiError(404, "not_found", "Image not found.");

  const { data, error } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(`${ctx.userId}/${name}`, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return apiError(404, "not_found", "Image not found.");

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // Shorter than the signature, so a cached redirect never points at an expired URL.
    headers: { "Cache-Control": "private, max-age=1800", Vary: "Cookie" },
  });
}

import { z } from "zod";
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, isValidAttachmentName, withSuffix } from "@/lib/attachments";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { objectKey, presignUpload, uploadTarget } from "@/lib/r2";

const MAX_NAME_ATTEMPTS = 50;

const body = z.object({
  name: z.string().max(200).refine(isValidAttachmentName, "Not a valid image file name."),
  contentType: z.enum(Object.keys(ATTACHMENT_TYPES) as [string, ...string[]]),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});

/** Reserve a free file name in the caller's folder and say where to upload it. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, body);
  if ("response" in parsed) return parsed.response;
  const { name: base, contentType, size } = parsed.data;
  if (base.slice(base.lastIndexOf(".") + 1).toLowerCase() !== ATTACHMENT_TYPES[contentType]) {
    return apiError(422, "invalid_input", "The file name does not match the image type.");
  }

  const target = uploadTarget();
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const name = attempt ? withSuffix(base, attempt) : base;
    if (!isValidAttachmentName(name)) break;
    const { data: reserved, error } = await ctx.supabase.rpc("reserve_attachment", { p_name: name, p_content_type: contentType, p_size: size, p_origin: target });
    if (error) return dbError(error, "Could not prepare the upload.");
    if (!reserved) continue;
    const upload = target === "r2" ? await presignUpload(objectKey(ctx.userId, name), contentType, size) : null;
    return jsonResponse({ name, upload });
  }
  return apiError(409, "conflict", "Could not find a free file name for this image.");
}

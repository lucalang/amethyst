"use client";

import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, pastedImageName, sanitizeAttachmentName, withSuffix } from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";

export type ImageSource = "paste" | "file";

/** Upload an image to the account's private folder and return its stored file name (unique per account). */
export async function uploadImage(file: File, source: ImageSource): Promise<string> {
  const extension = ATTACHMENT_TYPES[file.type];
  if (!extension) throw new Error(`“${file.name || "This file"}” is not a supported image. Use PNG, JPEG, GIF, WebP, AVIF or BMP.`);
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${file.name || "This image"}” is larger than 10 MB.`);

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Your session expired. Sign in again to add images.");

  // Clipboard images are usually just "image.png"; name them like Obsidian does.
  const generic = !file.name || /^image\.\w+$/i.test(file.name);
  const base = source === "paste" || generic ? pastedImageName(extension) : sanitizeAttachmentName(file.name, extension);
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = attempt ? withSuffix(base, attempt) : base;
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(`${userId}/${name}`, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (!error) return name;
    const status = (error as { statusCode?: string | number }).statusCode;
    if (String(status) !== "409" && !/exists|duplicate/i.test(error.message)) throw new Error(`Could not upload the image: ${error.message}`);
  }
  throw new Error("Could not find a free file name for this image.");
}

"use client";

import { apiFetch } from "@/lib/api-client";
import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, attachmentUrl, pastedImageName, sanitizeAttachmentName } from "@/lib/attachments";

export type ImageSource = "paste" | "file";

type Ticket = { name: string; upload: { url: string; headers: Record<string, string> } | null };

/** Upload an image to the account's private folder and return its stored file name (unique per account). */
export async function uploadImage(file: File, source: ImageSource): Promise<string> {
  const extension = ATTACHMENT_TYPES[file.type];
  if (!extension) throw new Error(`“${file.name || "This file"}” is not a supported image. Use PNG, JPEG, GIF, WebP, AVIF or BMP.`);
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`“${file.name || "This image"}” is larger than 10 MB.`);

  // Clipboard images are usually just "image.png"; name them like Obsidian does.
  const generic = !file.name || /^image\.\w+$/i.test(file.name);
  const base = source === "paste" || generic ? pastedImageName(extension) : sanitizeAttachmentName(file.name, extension);
  // The server reserves a free name ("… 1.png" on collisions); retry only if the name was taken meanwhile.
  for (let attempt = 0; attempt < 3; attempt++) {
    const ticket = await apiFetch<Ticket>("/api/attachments", { method: "POST", json: { name: base, contentType: file.type, size: file.size } });
    if (ticket.upload) {
      let response: Response;
      try {
        response = await fetch(ticket.upload.url, { method: "PUT", headers: ticket.upload.headers, body: file });
      } catch {
        throw new Error("Could not reach image storage. Check your connection and try again.");
      }
      if (response.status === 412) continue;
      if (!response.ok) throw new Error(`Could not upload the image (storage error ${response.status}).`);
      await apiFetch(attachmentUrl(ticket.name), { method: "POST" });
      return ticket.name;
    }

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error("Your session expired. Sign in again to add images.");
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(`${userId}/${ticket.name}`, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (!error) return ticket.name;
    const status = (error as { statusCode?: string | number }).statusCode;
    if (String(status) !== "409" && !/exists|duplicate/i.test(error.message)) throw new Error(`Could not upload the image: ${error.message}`);
  }
  throw new Error("Could not find a free file name for this image.");
}

import { apiError, dbError } from "@/lib/http";
import { MAX_VIEWER_PRESETS } from "@/lib/viewer-looks";

/** Friendly messages for a duplicate name and the per-account preset limit. */
export function presetError(error: { code?: string; message: string }) {
  if (error.code === "23505") return apiError(409, "conflict", "You already have a preset with that name.");
  if (error.code === "P0001") return apiError(422, "rejected", `You can save up to ${MAX_VIEWER_PRESETS} presets. Delete one to make room.`);
  return dbError(error);
}

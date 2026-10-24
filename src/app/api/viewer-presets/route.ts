import { z } from "zod";
import { jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { presetNameSchema, readViewerLook, viewerLookSchema } from "@/lib/viewer-looks";
import { presetError } from "./errors";

const createSchema = z.object({ name: presetNameSchema, look: viewerLookSchema }).strict();

/** Save a named 3D Showcase preset for the signed-in account. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase
    .from("viewer_presets")
    .insert({ name: parsed.data.name, look: parsed.data.look })
    .select("id, name, look")
    .single();
  if (error) return presetError(error);
  return jsonResponse({ preset: { id: data.id, name: data.name, look: readViewerLook(data.look) } }, { status: 201 });
}

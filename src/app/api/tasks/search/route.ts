import { apiError, dbError, jsonResponse, requireApiUser } from "@/lib/http";
import { taskSearchSchema } from "@/lib/validation/tasks";

const SNIPPET_RADIUS = 60;

function snippet(notes: string, needle: string): string {
  const flat = notes.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return flat.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(flat.length, at + needle.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/**
 * Notes search. Titles and steps are already on the client, so only tasks whose notes
 * contain the query are read here, and only a short excerpt is returned.
 */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = taskSearchSchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) return apiError(422, "invalid_input", "Search for 1 to 100 characters.");
  const pattern = `%${parsed.data.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("id, notes")
    .eq("has_notes", true)
    .ilike("notes", pattern)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return dbError(error, "Could not search notes.");
  return jsonResponse({ matches: data.map((row) => ({ id: row.id, snippet: snippet(row.notes, parsed.data) })) });
}

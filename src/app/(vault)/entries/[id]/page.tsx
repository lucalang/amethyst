import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";
import { entryPath } from "@/lib/collections";
import { requireUser } from "@/lib/supabase/auth";

// Workspaces moved under their collection (/anime/…, /games/…); keep old links working.
export default async function LegacyEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { file }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const { data: entry } = await ctx.supabase.from("entries").select("id, kind").eq("id", id).maybeSingle();
  if (!entry) notFound();
  const query = typeof file === "string" ? `?file=${encodeURIComponent(file)}` : "";
  permanentRedirect(`${entryPath(entry)}${query}`);
}

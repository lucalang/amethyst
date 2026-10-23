import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { entryPath } from "@/lib/collections";
import { resolveEntry } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Old /<collection id>/<entry id> links now live at /entries/<slug>, wherever the entry moved.
export default async function LegacyEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { file }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const entry = await resolveEntry(await requireUser(), id);
  if (!entry) notFound();
  redirect(`${entryPath(entry)}${typeof file === "string" ? `?file=${encodeURIComponent(file)}` : ""}`);
}

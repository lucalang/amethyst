import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { collectionPath } from "@/lib/collections";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Old /<collection id> and /anime-style links now live at /collections/<slug>.
export default async function LegacyLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ collection: param }, query] = await Promise.all([params, searchParams]);
  const collections = await loadCollections(await requireUser());
  const isId = z.uuid().safeParse(param).success;
  const collection = collections.find((item) => (isId ? item.id === param : item.legacy_slug === param));
  if (!collection) {
    if (!isId) redirect("/");
    notFound();
  }
  const preserved = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") preserved.set(key, value);
    else if (Array.isArray(value)) for (const item of value) preserved.append(key, item);
  }
  redirect(`${collectionPath(collection)}${preserved.size ? `?${preserved}` : ""}`);
}

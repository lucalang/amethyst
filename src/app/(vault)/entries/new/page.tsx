import { redirect } from "next/navigation";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

export default async function LegacyNewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await searchParams;
  const collections = await loadCollections(await requireUser());
  const legacy = kind === "game" ? "games" : kind === "anime" ? "anime" : kind === "custom" ? "other" : null;
  const collection = collections.find((item) => item.legacy_slug === legacy) ?? collections[0];
  redirect(collection ? `/${collection.id}/new` : "/");
}

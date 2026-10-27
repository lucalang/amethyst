import { redirect } from "next/navigation";
import { collectionPath } from "@/lib/collections";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

export default async function LegacyShowcaseSettingsPage() {
  const collections = await loadCollections(await requireUser());
  redirect(collections[0] ? collectionPath(collections[0]) : "/");
}

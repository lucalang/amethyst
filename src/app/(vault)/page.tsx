import { redirect } from "next/navigation";
import { LibraryBig } from "lucide-react";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { PageContainer } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/media/empty-state";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

export default async function VaultHome() {
  const collections = await loadCollections(await requireUser());
  if (collections.length) redirect(`/${collections[0].id}`);
  return <PageContainer><EmptyState icon={LibraryBig} title="No categories yet" description="Your archive is empty." action={<NewCategoryButton />} /></PageContainer>;
}

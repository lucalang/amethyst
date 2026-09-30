import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FranchiseView, type FranchiseTab } from "@/components/franchise/franchise-view";
import { loadFranchise } from "@/lib/data/franchise";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";

const TABS = ["arcs", "movies", "specials", "characters"] as const;

export const metadata: Metadata = { title: "Franchise" };

export default async function FranchisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const data = await loadFranchise(ctx, id);
  if (!data) notFound();
  const tab = TABS.find((value) => value === query.tab) ?? "arcs";
  return <FranchiseView key={data.entry.id} data={data} initialTab={tab as FranchiseTab} imageHosts={allowedImageHosts()} />;
}

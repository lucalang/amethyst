import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { NewEntryForm } from "./new-entry-form";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const { kind } = await searchParams;
  return (
    <PageContainer>
      <PageHeader title="New entry" description="Track a game or anything else with notes, Markdown tabs and checklists." />
      <NewEntryForm defaultKind={kind === "custom" ? "custom" : "game"} imageHosts={allowedImageHosts()} />
    </PageContainer>
  );
}

import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { ENTRY_KINDS, type EntryKind } from "@/lib/validation/entries";
import { NewEntryForm } from "./new-entry-form";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const { kind } = await searchParams;
  const defaultKind = ENTRY_KINDS.includes(kind as EntryKind) ? (kind as EntryKind) : "anime";
  return (
    <PageContainer>
      <PageHeader title="New entry" description="Name it, add artwork, and organize everything else in its own workspace of folders, notes and checklists." />
      <NewEntryForm defaultKind={defaultKind} imageHosts={allowedImageHosts()} />
    </PageContainer>
  );
}

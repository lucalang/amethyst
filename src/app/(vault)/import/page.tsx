import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { ImportCenter } from "@/components/media/import-center";
import { JOB_COLUMNS, type JobView } from "@/lib/jobs";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const { data } = await ctx.supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("kind", "franchise_import")
    .order("created_at", { ascending: false })
    .limit(25);

  return (
    <PageContainer>
      <PageHeader
        title="Import from MyAnimeList"
        description="Search by title, or paste a MyAnimeList anime ID or URL. Related works are discovered from provider relations; coverage and gaps are reported after import."
      />
      <ImportCenter
        initialJobs={(data ?? []) as unknown as JobView[]}
        initialQuery={typeof params.q === "string" ? params.q : ""}
        targetEntryId={typeof params.into === "string" ? params.into : undefined}
      />
    </PageContainer>
  );
}

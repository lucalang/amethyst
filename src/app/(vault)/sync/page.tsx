import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { SyncCenter } from "@/components/sync/sync-center";
import { loadSyncData } from "@/lib/data/sync";
import { malConfig } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "MyAnimeList sync" };

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "MyAnimeList connected. Your list is being pulled for review; nothing is written to MyAnimeList yet." },
  denied: { tone: "error", text: "Authorization was cancelled on MyAnimeList." },
  invalid_state: { tone: "error", text: "That authorization link expired or was already used. Start again." },
  exchange_failed: { tone: "error", text: "MyAnimeList did not accept the authorization. Try connecting again." },
  not_configured: { tone: "error", text: "MyAnimeList is not configured on this server." },
};

export default async function SyncPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUser();
  const [data, params] = await Promise.all([loadSyncData(ctx), searchParams]);
  const notice = typeof params.mal === "string" ? NOTICES[params.mal] : undefined;
  return (
    <PageContainer>
      <PageHeader
        title="MyAnimeList sync"
        description="Status, score and watched-episode counts for MAL-linked anime. Games, arcs, checklists and private notes never leave this archive, and nothing is ever deleted from MyAnimeList."
      />
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mb-6 rounded-md border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-jade/40 bg-jade/5" : "border-coral/40 bg-coral/5"}`}
        >
          {notice.text}
        </p>
      ) : null}
      <SyncCenter data={data} configured={malConfig() !== null} />
    </PageContainer>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { LiveDemoRuntimeState } from "@/app/api/version-history/route";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { VersionHistoryBrowser } from "@/components/version-history/version-history-browser";
import { requireUser } from "@/lib/supabase/auth";
import { ENABLED_DEMO_SPECS } from "@/lib/version-history";

export const metadata: Metadata = { title: "Version history" };

async function loadInitialDemoStates(): Promise<Record<string, LiveDemoRuntimeState>> {
  const cookieStore = await cookies();
  const entries = await Promise.all(
    ENABLED_DEMO_SPECS.map(async (spec): Promise<[string, LiveDemoRuntimeState]> => {
      const demoUrl = `http://localhost:${spec.port}${spec.defaultPath}`;
      const visitorCookieVal = cookieStore.get(`amethyst_demo_vid_${spec.shortSha}`)?.value;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        const res = await fetch(`http://127.0.0.1:${spec.port}/__demo/status`, {
          method: "GET",
          headers: visitorCookieVal
            ? { Cookie: `amethyst_demo_vid_${spec.shortSha}=${encodeURIComponent(visitorCookieVal)}` }
            : undefined,
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          return [
            spec.sha,
            { sha: spec.sha, shortSha: spec.shortSha, port: spec.port, online: false, demoUrl, hasWorkspace: false, expiresAt: null },
          ];
        }
        const data = (await res.json()) as { hasWorkspace?: boolean; expiresAt?: string | null };
        return [
          spec.sha,
          {
            sha: spec.sha,
            shortSha: spec.shortSha,
            port: spec.port,
            online: true,
            demoUrl,
            hasWorkspace: Boolean(data.hasWorkspace),
            expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
          },
        ];
      } catch {
        return [
          spec.sha,
          { sha: spec.sha, shortSha: spec.shortSha, port: spec.port, online: false, demoUrl, hasWorkspace: false, expiresAt: null },
        ];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return Object.fromEntries(entries);
}

export default async function VersionHistoryPage() {
  await requireUser();
  const initialDemos = await loadInitialDemoStates();

  return (
    <EntranceScope>
      <PageContainer className="max-w-5xl">
        <PageHeader
          title="Version history"
          description="Every retained commit in Amethyst's repository, with interactive fresh-account demos for prepared milestones."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/whats-new">
                <Megaphone aria-hidden className="size-3.5 text-amethyst" />
                What’s new
              </Link>
            </Button>
          }
        />
        <VersionHistoryBrowser initialDemos={initialDemos} />
      </PageContainer>
    </EntranceScope>
  );
}

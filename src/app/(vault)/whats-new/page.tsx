import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MarkUpdatesSeen } from "@/components/layout/whats-new";
import { VersionHistoryLinkButton } from "@/components/version-history/version-history-browser";
import { CHANGELOG, formatChangeDate, releasePath } from "@/lib/changelog";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";
import { HighlightList, KindLegend, ReleaseGlyph, ReleaseNotice, kindCounts } from "./release-ui";

export const metadata: Metadata = { title: "What’s new" };

export default async function WhatsNewPage() {
  await requireUser();
  return (
    <EntranceScope>
      <PageContainer className="max-w-5xl">
        <MarkUpdatesSeen />
        <PageHeader
          title="What’s new"
          description="The latest changes to Amethyst at a glance. Open any update for its full notes."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <VersionHistoryLinkButton />
              <KindLegend />
            </div>
          }
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <ol aria-label="Updates, newest first" className="min-w-0">
            {CHANGELOG.map((release, index) => (
              <li key={release.id} className="enter" style={{ "--enter-index": Math.min(index, 4) + 1 } as React.CSSProperties}>
                <article
                  id={release.id}
                  aria-labelledby={`${release.id}-title`}
                  className={cn("grid scroll-mt-24 gap-x-8 gap-y-3 py-8 sm:grid-cols-[8.5rem_minmax(0,1fr)]", index > 0 && "border-t border-white/[0.07]", index === 0 && "pt-0")}
                >
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                    <ReleaseGlyph icon={release.icon} className="size-9 sm:size-10" />
                    <div className="text-xs leading-5 text-muted-foreground">
                      <time dateTime={release.date} className="block font-medium text-foreground/80">
                        {formatChangeDate(release.date)}
                      </time>
                      {index === 0 ? <span className="font-semibold tracking-wide text-amethyst uppercase">Latest</span> : <span>{kindCounts(release.highlights)}</span>}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h2 id={`${release.id}-title`} className="text-xl font-bold tracking-tight text-balance md:text-2xl">
                      <Link href={releasePath(release.id)} className="rounded outline-none hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring">
                        {release.title}
                      </Link>
                    </h2>
                    <p className="mt-1.5 max-w-2xl text-[15px] leading-6 text-pretty text-foreground/80">{release.intro}</p>
                    {release.notice ? (
                      <div className="mt-4 max-w-2xl">
                        <ReleaseNotice>{release.notice}</ReleaseNotice>
                      </div>
                    ) : null}
                    <HighlightList highlights={release.highlights} className="mt-5 max-w-2xl" />
                    <Link
                      href={releasePath(release.id)}
                      className="group mt-5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-amethyst underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Read full update
                      <span className="sr-only">: {release.title}</span>
                      <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ol>
          <nav aria-label="All updates" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">All updates</p>
              <ol className="max-h-[calc(100dvh-9rem)] space-y-0.5 overflow-y-auto border-l border-white/[0.08]">
                {CHANGELOG.map((release) => (
                  <li key={release.id}>
                    <a
                      href={`#${release.id}`}
                      className="-ml-px block border-l border-transparent py-1.5 pl-3 text-xs leading-snug text-muted-foreground outline-none hover:border-amethyst hover:text-foreground focus-visible:border-amethyst focus-visible:text-foreground"
                    >
                      <span className="block tabular-nums text-muted-foreground/70">{formatChangeDate(release.date, "short")}</span>
                      <span className="line-clamp-2">{release.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </div>
      </PageContainer>
    </EntranceScope>
  );
}

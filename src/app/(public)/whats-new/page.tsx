import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MarkUpdatesSeen } from "@/components/layout/whats-new";
import { VersionHistoryLinkButton } from "@/components/version-history/version-history-browser";
import { CHANGELOG, formatChangeDate, releasePath } from "@/lib/changelog";
import { HighlightList, KindLegend, ReleaseGlyph, ReleaseNotice, kindCounts, previewHighlights } from "./release-ui";

export const metadata: Metadata = { title: "What’s new" };

export default async function WhatsNewPage() {
  return (
    <EntranceScope>
      <PageContainer className="max-w-5xl">
        <MarkUpdatesSeen />
        <PageHeader
          title="What’s new"
          icon={Megaphone}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <VersionHistoryLinkButton />
              <KindLegend />
            </div>
          }
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <ol aria-label="Updates, newest first" className="grid min-w-0 gap-4">
            {CHANGELOG.map((release, index) => {
              const preview = previewHighlights(release.highlights);
              return (
                <li key={release.id} className="enter" style={{ "--enter-index": Math.min(index, 4) + 1 } as React.CSSProperties}>
                {release.aliases?.map((alias) => <span key={alias} id={alias} aria-hidden="true" />)}
                <article
                  id={release.id}
                  aria-labelledby={`${release.id}-title`}
                  className="ui-panel grid scroll-mt-24 gap-x-8 gap-y-3 p-5 sm:grid-cols-[8.5rem_minmax(0,1fr)] md:p-6"
                  data-glow={index === 0 ? "" : undefined}
                >
                  <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                    <ReleaseGlyph icon={release.icon} hero={index === 0} />
                    <div className="text-xs leading-5 text-muted-foreground">
                      <time dateTime={release.date} className="block font-medium text-foreground/80">
                        {formatChangeDate(release.date)}
                      </time>
                      {index === 0 ? (
                        <span className="ui-pill mt-1" data-tone>
                          <span aria-hidden className="ui-dot" />
                          Latest
                        </span>
                      ) : (
                        <span>{kindCounts(preview)}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h2 id={`${release.id}-title`} className="text-xl font-bold tracking-tight text-balance md:text-2xl">
                      <Link href={releasePath(release.id)} className="rounded outline-none transition-colors hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring">
                        {release.title}
                      </Link>
                    </h2>
                    {release.notice ? (
                      <div className="mt-4 max-w-2xl">
                        <ReleaseNotice>{release.notice}</ReleaseNotice>
                      </div>
                    ) : null}
                    {preview.length ? <HighlightList highlights={preview} className="mt-5 max-w-2xl" /> : null}
                    <Link
                      href={releasePath(release.id)}
                      className="group mt-5 inline-flex items-center gap-1.5 rounded-full border border-amethyst/35 bg-amethyst/10 px-3 py-1 text-sm font-medium text-amethyst outline-none transition-colors hover:bg-amethyst/18 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Read full update
                      <span className="sr-only">: {release.title}</span>
                      <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </Link>
                  </div>
                </article>
                </li>
              );
            })}
          </ol>
          <nav aria-label="All updates" className="hidden lg:block">
            <div className="sticky top-24">
            <div className="ui-panel p-3">
              <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">All updates</p>
              <ol className="max-h-[calc(100dvh-10rem)] space-y-0.5 overflow-y-auto">
                {CHANGELOG.map((release) => (
                  <li key={release.id}>
                    <a
                      href={`#${release.id}`}
                      className="block rounded-lg border-l-2 border-transparent py-1.5 pr-2 pl-2.5 text-xs leading-snug text-muted-foreground outline-none transition-colors hover:border-amethyst hover:bg-amethyst/[0.07] hover:text-foreground focus-visible:border-amethyst focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block tabular-nums text-muted-foreground/70">{formatChangeDate(release.date, "short")}</span>
                      <span className="line-clamp-2">{release.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
            </div>
          </nav>
        </div>
      </PageContainer>
    </EntranceScope>
  );
}

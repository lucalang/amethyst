import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MarkUpdatesSeen } from "@/components/layout/whats-new";
import { CHANGE_KINDS, LATEST_CHANGE_ID, findRelease, formatChangeDate, releasePath } from "@/lib/changelog";
import { HighlightList, KIND_META, NoteTopic, ReleaseGlyph, ReleaseNotice, toneStyle } from "../release-ui";

type Props = { params: Promise<{ release: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findRelease((await params).release);
  return { title: found ? `${found.release.title} · What’s new` : "What’s new" };
}

const navLink = "inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export default async function ReleasePage({ params }: Props) {
  const found = findRelease((await params).release);
  if (!found) notFound();
  const { release, newer, older } = found;
  return (
    <EntranceScope>
      <PageContainer className="max-w-3xl">
        {release.id === LATEST_CHANGE_ID ? <MarkUpdatesSeen /> : null}
        <Link href={`/whats-new#${release.id}`} className={navLink}>
          <ArrowLeft aria-hidden className="size-4" />
          All updates
        </Link>
        <header className="ui-hero enter mt-6 pb-8">
          <div className="flex items-center gap-3">
            <ReleaseGlyph icon={release.icon} hero />
            <time dateTime={release.date} className="ui-pill">
              {formatChangeDate(release.date)}
            </time>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{release.title}</h1>
          {release.notice ? (
            <div className="mt-5">
              <ReleaseNotice>{release.notice}</ReleaseNotice>
            </div>
          ) : null}
          <div className="ui-panel mt-7 p-4 md:p-5" data-glow>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">At a glance</h2>
            <HighlightList highlights={release.highlights} />
          </div>
        </header>
        {CHANGE_KINDS.map((kind, index) => {
          const notes = release.details[kind];
          if (!notes?.length) return null;
          const meta = KIND_META[kind];
          return (
            <section
              key={kind}
              aria-labelledby={`${kind}-heading`}
              className="ui-panel enter mb-4 p-5 md:p-6"
              data-glow
              style={{ ...toneStyle(meta.tone), "--enter-index": index + 1 } as CSSProperties}
            >
              <h2 id={`${kind}-heading`} className="mb-6 flex items-center gap-3 text-lg font-bold tracking-tight">
                <span aria-hidden className="ui-icon ui-icon-sm">
                  <meta.icon className="size-3.5" />
                </span>
                {meta.section}
              </h2>
              <div className="space-y-7">
                {notes.map((note, index) => (
                  <NoteTopic key={`${note.title}-${index}`} note={note} />
                ))}
              </div>
            </section>
          );
        })}
        <nav aria-label="More updates" className="mt-6 grid gap-3 sm:grid-cols-2">
          {newer ? (
            <Link href={releasePath(newer.id)} className="ui-card group min-w-0 px-4 py-3">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft aria-hidden className="size-3" /> Newer
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold transition-colors group-hover:text-(--tone)">{newer.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {older ? (
            <Link href={releasePath(older.id)} className="ui-card group min-w-0 px-4 py-3 text-left sm:text-right">
              <span className="flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
                Older <ArrowRight aria-hidden className="size-3" />
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold transition-colors group-hover:text-(--tone)">{older.title}</span>
            </Link>
          ) : null}
        </nav>
      </PageContainer>
    </EntranceScope>
  );
}

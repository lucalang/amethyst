import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MarkUpdatesSeen } from "@/components/layout/whats-new";
import { CHANGE_KINDS, LATEST_CHANGE_ID, findRelease, formatChangeDate, releasePath } from "@/lib/changelog";
import { requireUser } from "@/lib/supabase/auth";
import { HighlightList, KIND_META, NoteTopic, ReleaseGlyph, ReleaseNotice } from "../release-ui";

type Props = { params: Promise<{ release: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = findRelease((await params).release);
  return { title: found ? `${found.release.title} · What’s new` : "What’s new" };
}

const navLink = "inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export default async function ReleasePage({ params }: Props) {
  await requireUser();
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
        <header className="enter mt-6 border-b border-white/[0.07] pb-8">
          <div className="flex items-center gap-3">
            <ReleaseGlyph icon={release.icon} className="size-10" />
            <time dateTime={release.date} className="text-sm text-muted-foreground">
              {formatChangeDate(release.date)}
            </time>
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-balance md:text-4xl">{release.title}</h1>
          <p className="mt-3 text-base leading-7 text-pretty text-foreground/80">{release.intro}</p>
          {release.notice ? (
            <div className="mt-5">
              <ReleaseNotice>{release.notice}</ReleaseNotice>
            </div>
          ) : null}
          <h2 className="mt-7 mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">At a glance</h2>
          <HighlightList highlights={release.highlights} />
        </header>
        {CHANGE_KINDS.map((kind) => {
          const notes = release.details[kind];
          if (!notes?.length) return null;
          const meta = KIND_META[kind];
          return (
            <section key={kind} aria-labelledby={`${kind}-heading`} className="enter border-b border-white/[0.07] py-8 last-of-type:border-b-0">
              <h2 id={`${kind}-heading`} className="mb-6 flex items-center gap-2.5 text-lg font-bold tracking-tight">
                <span aria-hidden className={`grid size-7 place-items-center rounded-full ring-1 ${meta.tone}`}>
                  <meta.icon className="size-3.5" />
                </span>
                {meta.section}
              </h2>
              <div className="space-y-7">
                {notes.map((note) => (
                  <NoteTopic key={note.title} note={note} />
                ))}
              </div>
            </section>
          );
        })}
        <nav aria-label="More updates" className="mt-4 grid gap-3 border-t border-white/[0.07] pt-6 sm:grid-cols-2">
          {newer ? (
            <Link href={releasePath(newer.id)} className="group min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft aria-hidden className="size-3" /> Newer
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium group-hover:text-amethyst">{newer.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {older ? (
            <Link href={releasePath(older.id)} className="group min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-right">
              <span className="flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
                Older <ArrowRight aria-hidden className="size-3" />
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium group-hover:text-amethyst">{older.title}</span>
            </Link>
          ) : null}
        </nav>
      </PageContainer>
    </EntranceScope>
  );
}

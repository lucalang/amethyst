import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, CalendarClock, FileText, Gem, History, LibraryBig, ListChecks, Pin, PlayCircle, type LucideIcon } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { NewEntryButton } from "@/components/home/new-entry-button";
import { UpcomingTasks } from "@/components/home/upcoming-tasks";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { EmptyState } from "@/components/media/empty-state";
import { MediaImage } from "@/components/media/media-image";
import { PosterCard } from "@/components/media/poster-card";
import { loadHome, type HomeCollection, type HomeContinue } from "@/lib/data/home";
import { entryProgress } from "@/lib/progress/library";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const INNER = "mx-auto w-full max-w-[88rem] px-4 md:px-6";
const POSTER_GRID = "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

const enterIndex = (index: number) => ({ "--enter-index": index }) as CSSProperties;

function Section({ id, title, icon: Icon, index, action, children }: { id: string; title: string; icon: LucideIcon; index: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="border-t border-white/[0.06]">
      <div className={cn(INNER, "enter py-7 md:py-9")} style={enterIndex(index)}>
        <div className="mb-5 flex min-h-9 flex-wrap items-center justify-between gap-3">
          <h2 id={`${id}-heading`} className="flex items-center gap-2.5 text-base font-semibold tracking-normal">
            <Icon aria-hidden className="size-4 text-amethyst" />
            {title}
          </h2>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function ContinueCard({ item }: { item: HomeContinue }) {
  const { entry, file } = item;
  const progress = entryProgress(entry);
  const FileIcon = file?.kind === "checklist" ? ListChecks : FileText;
  return (
    <Link
      href={item.href}
      className="group/continue flex max-w-3xl min-w-0 items-center gap-4 rounded-lg border border-white/[0.08] bg-surface/60 p-3 pr-4 transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/40 hover:bg-amethyst/[0.05] hover:shadow-[0_18px_40px_-24px_rgb(165_124_255/0.7)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 sm:gap-5 sm:pr-5"
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-md border border-border bg-surface", entry.coverShape === "square" ? "size-20" : "h-24 w-16")}>
        <MediaImage src={entry.coverUrl} alt="" fallbackLabel={entry.title} priority />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-muted-foreground">{item.collectionName}</span>
        <span className="mt-0.5 block truncate text-base font-semibold transition-colors group-hover/continue:text-amethyst">{entry.title}</span>
        <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-foreground/80">
          {file ? <>
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-amethyst/80" />
            <span className="truncate">{file.name}</span>
          </> : <span className="text-muted-foreground">Workspace</span>}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
          {progress.total ? `${progress.done}/${progress.total} ${progress.label}` : "No tasks yet"}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-amethyst sm:flex">
        Continue
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover/continue:translate-x-0.5" />
      </span>
    </Link>
  );
}

function CollectionCard({ collection }: { collection: HomeCollection }) {
  return (
    <Link
      href={`/${collection.id}`}
      title={collection.name}
      className="group/collection flex h-full min-w-0 items-center gap-4 rounded-lg border border-white/[0.08] bg-surface/50 p-3 transition-[border-color,background-color,translate,box-shadow] duration-200 outline-none hover:-translate-y-0.5 hover:border-amethyst/40 hover:bg-amethyst/[0.05] hover:shadow-[0_18px_40px_-24px_rgb(165_124_255/0.7)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 motion-reduce:hover:translate-y-0"
    >
      {collection.previews.length ? (
        <span aria-hidden className="flex h-16 shrink-0 items-end">
          {collection.previews.map((preview, index) => (
            <span
              key={preview.id}
              className={cn(
                "relative overflow-hidden rounded-md border border-black bg-surface ring-1 ring-white/[0.1]",
                preview.coverShape === "square" ? "size-12" : "h-16 w-11",
                index > 0 && "-ml-4",
              )}
              style={{ zIndex: collection.previews.length - index }}
            >
              <MediaImage src={preview.coverUrl} alt="" fallbackLabel={preview.title} className="text-xs" />
            </span>
          ))}
        </span>
      ) : (
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-md border border-dashed border-white/[0.12] text-amethyst/70">
          <LibraryBig className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium transition-colors group-hover/collection:text-amethyst">{collection.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {collection.entryCount.toLocaleString("en")} {collection.entryCount === 1 ? "entry" : "entries"}
        </span>
      </span>
      <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground/40 transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-amethyst" />
    </Link>
  );
}

export default async function HomePage() {
  const ctx = await requireUser();
  const home = await loadHome(ctx);
  const categories = home.collections.map(({ id, name }) => ({ id, name }));
  let index = 0;

  return (
    <EntranceScope>
      <section aria-labelledby="home-heading" className={cn(INNER, "pt-7 pb-6 md:pt-10 md:pb-8")}>
        <div className="enter flex flex-wrap items-center justify-between gap-4" style={enterIndex(index++)}>
          <div className="flex min-w-0 items-center gap-3.5">
            <span aria-hidden className="brand-gem grid size-11 shrink-0 place-items-center rounded-lg bg-amethyst/15 text-amethyst ring-1 ring-amethyst/40">
              <Gem className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Amethyst <span className="text-amethyst">Archives</span>
              </p>
              <h1 id="home-heading" className="text-2xl leading-tight font-semibold tracking-normal md:text-3xl">Home</h1>
            </div>
          </div>
          {home.collections.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <NewCategoryButton />
              <NewEntryButton collections={categories} />
            </div>
          ) : null}
        </div>
      </section>

      {home.collections.length === 0 ? (
        <div className={cn(INNER, "enter pb-6")} style={enterIndex(index++)}>
          <EmptyState
            icon={LibraryBig}
            title="Start your archive"
            description="Create a category, then add entries with notes and checklists to it."
            action={<NewCategoryButton />}
          />
        </div>
      ) : <>
        <section aria-label="Archive overview" className="border-t border-white/[0.06]">
          <dl className={cn(INNER, "enter grid grid-cols-3 py-5 md:py-6")} style={enterIndex(index++)}>
            {[
              { label: home.counts.collections === 1 ? "Category" : "Categories", value: home.counts.collections },
              { label: home.counts.entries === 1 ? "Entry" : "Entries", value: home.counts.entries },
              { label: home.counts.files === 1 ? "Workspace file" : "Workspace files", value: home.counts.files },
            ].map((stat, position) => (
              <div key={stat.label} className={cn("min-w-0", position > 0 && "border-l border-white/[0.06] pl-4 md:pl-8")}>
                <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums md:text-3xl">{stat.value.toLocaleString("en")}</dd>
              </div>
            ))}
          </dl>
        </section>

        {home.continueEntry ? (
          <Section id="continue" title="Continue where you left off" icon={PlayCircle} index={index++}>
            <ContinueCard item={home.continueEntry} />
          </Section>
        ) : null}

        {home.recent.length ? (
          <Section id="recent" title="Recently opened" icon={History} index={index++}>
            <ul aria-label="Recently opened" className={POSTER_GRID}>
              {home.recent.map((entry) => (
                <li key={entry.id}><PosterCard entry={entry} /></li>
              ))}
            </ul>
          </Section>
        ) : null}

        {home.counts.entries > 0 ? (
          <Section id="pinned" title="Pinned" icon={Pin} index={index++}>
            {home.pinned.length ? (
              <ul aria-label="Pinned entries" className={POSTER_GRID}>
                {home.pinned.map((entry) => (
                  <li key={entry.id}><PosterCard entry={entry} /></li>
                ))}
              </ul>
            ) : (
              <Hint>Nothing pinned yet. Use the pin button on an entry&apos;s cover to keep it here.</Hint>
            )}
          </Section>
        ) : null}

        <Section
          id="categories"
          title="Your categories"
          icon={LibraryBig}
          index={index++}
          action={home.collections.length > 1 ? <ArrangeCollectionsButton collections={categories} /> : null}
        >
          <ul aria-label="Your categories" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {home.collections.map((collection) => (
              <li key={collection.id} className="min-w-0"><CollectionCard collection={collection} /></li>
            ))}
          </ul>
        </Section>

        <Section id="tasks" title="Upcoming tasks" icon={CalendarClock} index={index++}>
          {home.tasks.length ? <UpcomingTasks tasks={home.tasks} /> : <Hint>No open tasks with due dates.</Hint>}
        </Section>
      </>}
    </EntranceScope>
  );
}

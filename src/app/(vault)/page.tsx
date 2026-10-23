import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, CalendarClock, Check, FileText, Gem, History, Layers, LibraryBig, ListChecks, Pin, PlayCircle, type LucideIcon } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { NewEntryButton } from "@/components/home/new-entry-button";
import { UpcomingTasks } from "@/components/home/upcoming-tasks";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MediaImage } from "@/components/media/media-image";
import { PosterCard } from "@/components/media/poster-card";
import { ProgressMeter } from "@/components/media/progress-meter";
import { loadHome, type HomeCollection, type HomeContinue, type HomeData, type HomePreview } from "@/lib/data/home";
import { loadPreferences } from "@/lib/data/preferences";
import type { LibraryCategory } from "@/lib/collections";
import { entryProgress } from "@/lib/progress/library";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const INNER = "mx-auto w-full max-w-[88rem] px-4 md:px-6";
const POSTER_GRID = "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
const PINNED_GRID = "grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

const enterIndex = (index: number) => ({ "--enter-index": index }) as CSSProperties;

function Section({
  id,
  title,
  description,
  icon: Icon,
  index,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  index: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <div className={cn(INNER, "enter py-8 md:py-11")} style={enterIndex(index)}>
        <div className="mb-6 flex min-h-9 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="flex items-center gap-2.5 text-lg font-semibold tracking-tight md:text-xl">
              <span aria-hidden className="grid size-7 place-items-center rounded-md bg-amethyst/[0.12] ring-1 ring-amethyst/25">
                <Icon className="size-3.5 text-amethyst" />
              </span>
              {title}
            </h2>
            {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-3.5 text-sm text-muted-foreground">{children}</p>;
}

function ContinueCard({ item }: { item: HomeContinue }) {
  const { entry, file } = item;
  const progress = entryProgress(entry);
  const FileIcon = file?.kind === "checklist" ? ListChecks : FileText;
  return (
    <Link
      href={item.href}
      className="group/continue relative flex w-full max-w-2xl min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-white/[0.1] bg-black/45 p-3 pr-4 backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/50 hover:bg-amethyst/[0.07] hover:shadow-[0_22px_48px_-24px_rgb(165_124_255/0.8)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 sm:gap-5 sm:pr-5"
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-surface shadow-[0_12px_28px_-12px_rgb(0_0_0/0.9)]", entry.coverShape === "square" ? "size-24" : "h-28 w-[4.75rem]")}>
        <MediaImage src={entry.coverUrl} alt="" fallbackLabel={entry.title} priority className="transition-[scale] duration-700 group-hover/continue:scale-105" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-amethyst">
          <PlayCircle aria-hidden className="size-3.5" />
          Continue where you left off
        </span>
        <span className="mt-1 block truncate text-lg leading-snug font-semibold transition-colors group-hover/continue:text-amethyst">{entry.title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-foreground/75">
          {file ? <>
            <FileIcon aria-hidden className="size-3.5 shrink-0 text-amethyst/80" />
            <span className="truncate">{file.name}</span>
            <span aria-hidden className="text-muted-foreground/60">·</span>
          </> : null}
          <span className="truncate text-muted-foreground">{item.collectionName}</span>
        </span>
        {progress.total ? (
          <ProgressMeter done={progress.done} total={progress.total} label={progress.label} className="mt-2.5 max-w-xs" />
        ) : (
          <span className="mt-2 block text-xs text-muted-foreground">No tasks yet</span>
        )}
      </span>
      <ArrowRight aria-hidden className="hidden size-5 shrink-0 text-amethyst transition-transform group-hover/continue:translate-x-1 sm:block" />
    </Link>
  );
}

/** Center first, then alternating left and right. */
const FAN_SLOTS = [0, -1, 1, -2, 2];

function CoverFan({ covers }: { covers: HomePreview[] }) {
  return (
    <div aria-hidden className="relative mx-auto hidden h-80 w-full max-w-[26rem] md:block">
      <div className="absolute inset-x-6 bottom-2 h-24 rounded-full bg-amethyst/25 blur-3xl" />
      {covers.map((cover, index) => {
        const slot = FAN_SLOTS[index];
        return (
          <Link
            key={cover.id}
            href={cover.href}
            tabIndex={-1}
            className={cn(
              "home-fan-card absolute bottom-6 left-1/2 overflow-hidden rounded-lg border border-white/[0.12] bg-surface shadow-[0_24px_48px_-16px_rgb(0_0_0/0.95)]",
              cover.coverShape === "square" ? "size-40" : "h-56 w-[9.5rem]",
            )}
            style={
              {
                "--fan-x": `${slot * 4.6}rem`,
                "--fan-r": `${slot * 7}deg`,
                "--fan-y": `${Math.abs(slot) * 0.9}rem`,
                "--fan-i": index,
                "--fan-z": 10 - Math.abs(slot),
              } as CSSProperties
            }
          >
            <MediaImage src={cover.coverUrl} alt="" fallbackLabel={cover.title} priority={index < 3} />
          </Link>
        );
      })}
    </div>
  );
}

function Hero({ home, categories }: { home: HomeData; categories: LibraryCategory[] }) {
  const firstName = home.displayName.split(/\s+/)[0] ?? "";
  const fresh = home.counts.entries === 0;
  const backdrop = home.continueEntry?.bannerUrl ?? home.continueEntry?.entry.coverUrl ?? home.showcase[0]?.coverUrl ?? null;
  const showFan = home.showcase.length > 0;
  const subline = !home.collections.length
    ? "Your archive is ready. Start with a collection, a shelf for anything you want to keep track of."
    : fresh
      ? "Your first collection is waiting. Add an entry with cover art to bring it to life."
      : home.continueEntry
        ? "Pick up where you left off, or wander through what you've been collecting."
        : "Everything you're collecting, gathered in one place.";

  return (
    <section aria-labelledby="home-heading" className="relative isolate overflow-hidden border-b border-white/[0.06]">
      <div aria-hidden className="absolute inset-0 -z-10">
        {backdrop ? <MediaImage src={backdrop} alt="" priority className="scale-110 opacity-30 blur-2xl saturate-150" /> : null}
        <div className="absolute inset-0 bg-[radial-gradient(55%_85%_at_12%_0%,rgb(165_124_255/0.26),transparent_70%),radial-gradient(40%_70%_at_88%_15%,rgb(244_114_168/0.13),transparent_70%)]" />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/55 to-black" />
      </div>
      <div className={cn(INNER, "grid items-center gap-8 py-9 md:py-12", showFan && "md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_26rem]")}>
        <div className="enter min-w-0" style={enterIndex(0)}>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gem aria-hidden className="size-3.5 text-amethyst" />
            Amethyst <span className="-ml-1 text-amethyst">Archives</span>
          </p>
          <h1 id="home-heading" className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance md:text-4xl">
            {fresh ? "Welcome" : "Welcome back"}
            {firstName ? <>
              ,{" "}
              <span className="bg-linear-to-r from-[#c9b0ff] via-amethyst to-rose bg-clip-text text-transparent">{firstName}</span>
            </> : null}
          </h1>
          <p className="mt-2.5 max-w-xl text-base text-pretty text-foreground/70">{subline}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {home.collections.length ? <>
              <NewEntryButton collections={categories} className="h-10 px-4" />
              <NewCategoryButton className="h-10 px-4" />
            </> : (
              <NewCategoryButton label="Create your first collection" className="h-10 border-amethyst/50 bg-amethyst/15 px-4 text-foreground hover:bg-amethyst/25" />
            )}
          </div>
          {home.continueEntry ? (
            <div className="mt-7">
              <ContinueCard item={home.continueEntry} />
            </div>
          ) : null}
        </div>
        {showFan ? <CoverFan covers={home.showcase} /> : null}
      </div>
    </section>
  );
}

function GettingStarted({ home, index }: { home: HomeData; index: number }) {
  const hasCollections = home.collections.length > 0;
  const steps = [
    { title: "Create a collection", text: "Collections are your shelves: games, books, films, or anything else.", done: hasCollections },
    { title: "Add entries with cover art", text: "Upload artwork or paste an image link; covers make Home come alive.", done: false },
    { title: "Write notes & checklists", text: "Every entry has a workspace with Markdown notes and checklists that track progress.", done: false },
  ];
  const active = steps.findIndex((step) => !step.done);
  return (
    <Section id="start" title="Getting started" description="Three small steps to make this archive yours." icon={Gem} index={index}>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, position) => {
          const current = position === active;
          return (
            <li
              key={step.title}
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative flex gap-3.5 rounded-xl border p-4",
                current ? "border-amethyst/40 bg-amethyst/[0.06] shadow-[0_18px_44px_-28px_rgb(165_124_255/0.9)]" : "border-white/[0.07] bg-surface/40",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  step.done ? "bg-amethyst text-amethyst-foreground" : current ? "ring-1 ring-amethyst text-amethyst" : "ring-1 ring-white/15 text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-3.5" /> : position + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", !step.done && !current && "text-foreground/75")}>
                  {step.title}
                  {step.done ? <span className="sr-only"> (done)</span> : null}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{step.text}</span>
                {current && position === 1 ? (
                  <span className="mt-3 block">
                    <NewEntryButton collections={home.collections} label="Add your first entry" />
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function CollectionCard({ collection }: { collection: HomeCollection }) {
  return (
    <Link
      href={`/${collection.id}`}
      title={collection.name}
      className="group/collection flex h-full min-w-0 items-start gap-4 rounded-xl border border-white/[0.08] bg-surface/50 p-4 transition-[border-color,background-color,translate,box-shadow] duration-200 outline-none hover:-translate-y-0.5 hover:border-amethyst/40 hover:bg-amethyst/[0.05] hover:shadow-[0_18px_40px_-24px_rgb(165_124_255/0.7)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 motion-reduce:hover:translate-y-0"
    >
      {collection.previews.length ? (
        <span aria-hidden className="flex h-24 shrink-0 items-end">
          {collection.previews.map((preview, index) => (
            <span
              key={preview.id}
              className={cn(
                "relative overflow-hidden rounded-md border border-black bg-surface ring-1 ring-white/[0.1] transition-[rotate,translate] duration-300",
                preview.coverShape === "square" ? "size-[4.5rem]" : "h-24 w-16",
                index > 0 && "-ml-6",
                index === 1 && "group-hover/collection:translate-x-1",
                index === 2 && "group-hover/collection:translate-x-2",
              )}
              style={{ zIndex: collection.previews.length - index }}
            >
              <MediaImage src={preview.coverUrl} alt="" fallbackLabel={preview.title} className="text-xs" />
            </span>
          ))}
        </span>
      ) : (
        <span aria-hidden className="grid h-24 w-16 shrink-0 place-items-center rounded-md border border-dashed border-white/[0.12] text-amethyst/70">
          <LibraryBig className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 self-center">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-base font-semibold transition-colors group-hover/collection:text-amethyst">{collection.name}</span>
          <ArrowUpRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-amethyst" />
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
          {collection.entryCount.toLocaleString("en")} {collection.entryCount === 1 ? "entry" : "entries"}
        </span>
        {collection.description ? (
          <span className="mt-2 line-clamp-2 text-sm break-words whitespace-pre-line text-foreground/70">{collection.description}</span>
        ) : null}
      </span>
    </Link>
  );
}

export default async function HomePage() {
  const ctx = await requireUser();
  const [home, preferences] = await Promise.all([loadHome(ctx), loadPreferences(ctx)]);
  const { pinStyle } = preferences;
  const categories = home.collections.map(({ id, name, description }) => ({ id, name, description }));
  const hasEntries = home.counts.entries > 0;
  let index = 1;

  return (
    <EntranceScope>
      <Hero home={home} categories={categories} />

      {!hasEntries ? <GettingStarted home={home} index={index++} /> : null}

      {hasEntries ? (
        <Section id="pinned" title="Pinned favorites" icon={Pin} index={index++}>
          {home.pinned.length ? (
            <ul aria-label="Pinned entries" className={PINNED_GRID}>
              {home.pinned.map((entry, position) => (
                <li key={entry.id}><PosterCard entry={entry} pinStyle={pinStyle} priority={position < 5} /></li>
              ))}
            </ul>
          ) : (
            <Hint>
              Nothing pinned yet.{" "}
              {pinStyle === "clean"
                ? "Use the menu beside an entry's title, or More in an entry's toolbar, to keep favorites here."
                : "Use the pin button on an entry's cover, or More in an entry's toolbar, to keep favorites here."}
            </Hint>
          )}
        </Section>
      ) : null}

      {home.recent.length ? (
        <Section id="recent" title="Recently opened" icon={History} index={index++}>
          <ul aria-label="Recently opened" className={POSTER_GRID}>
            {home.recent.map((entry) => (
              <li key={entry.id}><PosterCard entry={entry} pinStyle={pinStyle} /></li>
            ))}
          </ul>
        </Section>
      ) : null}

      {home.collections.length ? (
        <Section
          id="collections"
          title="Your collections"
          icon={LibraryBig}
          index={index++}
          action={home.collections.length > 1 ? <ArrangeCollectionsButton collections={categories} /> : null}
        >
          <ul aria-label="Your collections" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.collections.map((collection) => (
              <li key={collection.id} className="min-w-0"><CollectionCard collection={collection} /></li>
            ))}
          </ul>
        </Section>
      ) : null}

      {hasEntries ? (
        <Section id="tasks" title="Upcoming tasks" icon={CalendarClock} index={index++}>
          {home.tasks.length ? <UpcomingTasks tasks={home.tasks} /> : <Hint>No open tasks with due dates. Add a due date to a checklist task to see it here.</Hint>}
        </Section>
      ) : null}

      {hasEntries ? (
        <Section id="glance" title="At a glance" icon={Layers} index={index++}>
          <dl className="grid grid-cols-3 rounded-xl border border-white/[0.07] bg-surface/30 px-4 py-5 md:px-6">
            {[
              { label: home.counts.collections === 1 ? "Collection" : "Collections", value: home.counts.collections },
              { label: home.counts.entries === 1 ? "Entry" : "Entries", value: home.counts.entries },
              { label: home.counts.files === 1 ? "Workspace file" : "Workspace files", value: home.counts.files },
            ].map((stat, position) => (
              <div key={stat.label} className={cn("min-w-0", position > 0 && "border-l border-white/[0.06] pl-4 md:pl-8")}>
                <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums md:text-3xl">{stat.value.toLocaleString("en")}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </EntranceScope>
  );
}

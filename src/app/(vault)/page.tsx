import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Award, CalendarClock, Check, FileText, Gem, History, Layers, LibraryBig, ListChecks, Pin, PlayCircle, Sparkles, type LucideIcon } from "lucide-react";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { CoverFan } from "@/components/home/cover-fan";
import { CustomizeHomeButton, HomeCustomizeProvider, HomeSections } from "@/components/home/home-customizer";
import { NewEntryButton } from "@/components/home/new-entry-button";
import { ArcadeMarquee } from "@/components/home/arcade-marquee";
import { UpcomingTasks } from "@/components/home/upcoming-tasks";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { MediaImage } from "@/components/media/media-image";
import { PosterCard } from "@/components/media/poster-card";
import { ProgressMeter } from "@/components/media/progress-meter";
import { accentStyle } from "@/lib/collection-identity";
import { loadHome, type HomeCollection, type HomeContinue, type HomeData, type HomeFeaturedEntry } from "@/lib/data/home";
import { loadAchievementCards } from "@/lib/data/achievements";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { loadPreferences } from "@/lib/data/preferences";
import { loadCoinBalance } from "@/lib/data/shop";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import type { HomeSectionId } from "@/lib/preferences";
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
      <div className={cn(INNER, "enter py-6 md:py-8")} style={enterIndex(index)}>
        <div className="mb-4 flex min-h-9 flex-wrap items-end justify-between gap-3">
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
      className="group/continue relative flex w-full max-w-2xl min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-white/[0.1] bg-black/45 p-3 pr-4 backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/50 hover:bg-amethyst/[0.07] hover:shadow-[0_22px_48px_-24px_rgb(var(--accent-rgb)/0.8)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 sm:gap-5 sm:pr-5"
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-surface shadow-[0_12px_28px_-12px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))]", entry.coverShape === "square" ? "size-20" : "h-24 w-16")}>
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
          <span className="mt-2 block truncate text-xs text-muted-foreground">No {progress.label} yet</span>
        )}
      </span>
      <ArrowRight aria-hidden className="hidden size-5 shrink-0 text-amethyst transition-transform group-hover/continue:translate-x-1 sm:block" />
    </Link>
  );
}

function defaultGreeting(home: HomeData) {
  const firstName = home.displayName.split(/\s+/)[0] ?? "";
  return `${home.counts.entries === 0 ? "Welcome" : "Welcome back"}${firstName ? `, ${firstName}` : ""}`;
}

function Hero({ home, categories, greeting }: { home: HomeData; categories: LibraryCategory[]; greeting: string }) {
  const firstName = home.displayName.split(/\s+/)[0] ?? "";
  const fresh = home.counts.entries === 0;
  const fanArt = home.fan.flatMap((item) => (item.kind === "image" ? [item.url] : item.coverUrl ? [item.coverUrl] : []));
  const backdrop = home.continueEntry?.bannerUrl ?? home.continueEntry?.entry.coverUrl ?? fanArt[0] ?? null;
  const showFan = fanArt.length > 0;
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
        <div className="absolute inset-0 bg-[radial-gradient(55%_85%_at_12%_0%,rgb(var(--accent-rgb)/0.26),transparent_70%),radial-gradient(40%_70%_at_88%_15%,rgb(var(--rose-rgb)/0.13),transparent_70%)]" />
        <div className="absolute inset-0 bg-linear-to-b from-black/20 via-black/55 to-black" />
      </div>
      <div className={cn(INNER, "grid items-center gap-6 py-7 md:gap-8 md:py-9", showFan && "md:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:grid-cols-[minmax(0,1fr)_29rem] xl:grid-cols-[minmax(0,1fr)_32rem]")}>
        <div className="enter min-w-0" style={enterIndex(0)}>
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gem aria-hidden className="size-3.5 text-amethyst" />
            Amethyst <span className="-ml-1 text-amethyst">Archives</span>
          </p>
          <div className="mt-2 flex items-center gap-3 md:gap-4">
            {home.displayName || home.avatarUrl ? (
              <ProfileAvatar name={home.displayName} src={home.avatarUrl} className="size-11 shrink-0 text-base ring-2 ring-white/10 md:size-14 md:text-lg" />
            ) : null}
            <h1 id="home-heading" className="min-w-0 text-3xl leading-tight font-semibold tracking-tight text-balance break-words md:text-4xl">
              {greeting ? greeting : <>
                {fresh ? "Welcome" : "Welcome back"}
                {firstName ? <>
                  ,{" "}
                  <span className="bg-linear-to-r from-(--primary-hi) via-amethyst to-rose bg-clip-text text-transparent">{firstName}</span>
                </> : null}
              </>}
            </h1>
          </div>
          {home.motto ? <p className="mt-2 max-w-xl text-sm italic text-pretty break-words text-foreground/60">“{home.motto}”</p> : null}
          <p className="mt-2 max-w-xl text-base text-pretty text-foreground/70">{subline}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {home.collections.length ? <>
              <NewEntryButton collections={categories} className="h-10 px-4" />
              <NewCategoryButton className="h-10 px-4" />
            </> : (
              <NewCategoryButton label="Create your first collection" className="h-10 border-amethyst/50 bg-amethyst/15 px-4 text-foreground hover:bg-amethyst/25" />
            )}
            <CustomizeHomeButton />
          </div>
          {home.continueEntry ? (
            <div className="mt-5">
              <ContinueCard item={home.continueEntry} />
            </div>
          ) : null}
        </div>
        {showFan ? <CoverFan items={home.fan} className="mx-auto max-w-md md:max-w-none" /> : null}
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
                current ? "border-amethyst/40 bg-amethyst/[0.06] shadow-[0_18px_44px_-28px_rgb(var(--accent-rgb)/0.9)]" : "border-white/[0.07] bg-surface/40",
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
  const accent = accentStyle(collection.accentColor);
  return (
    <Link
      href={collectionPath(collection)}
      title={collection.name}
      style={accent}
      className={cn(
        "group/collection relative isolate flex h-full min-w-0 items-start gap-4 overflow-hidden rounded-xl border bg-surface/50 p-4 transition-[border-color,background-color,translate,box-shadow] duration-200 outline-none hover:-translate-y-0.5 focus-visible:ring-2 motion-reduce:hover:translate-y-0",
        accent
          ? "border-[var(--ca-line)] hover:border-[var(--ca)] hover:bg-[var(--ca-soft)] hover:shadow-[0_18px_40px_-24px_var(--ca-glow)] focus-visible:border-[var(--ca)] focus-visible:ring-[var(--ca)]"
          : "border-white/[0.08] hover:border-amethyst/40 hover:bg-amethyst/[0.05] hover:shadow-[0_18px_40px_-24px_rgb(var(--accent-rgb)/0.7)] focus-visible:border-amethyst focus-visible:ring-amethyst/50",
      )}
    >
      {collection.bannerUrl ? (
        <span aria-hidden className="absolute inset-0 -z-10">
          <MediaImage src={collection.bannerUrl} alt="" className="opacity-35 transition-opacity duration-300 group-hover/collection:opacity-45" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
        </span>
      ) : null}
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
        <span aria-hidden className={cn("grid h-24 w-16 shrink-0 place-items-center rounded-md border border-dashed", accent ? "border-[var(--ca-line)] text-[var(--ca)]" : "border-white/[0.12] text-amethyst/70")}>
          <CollectionIcon icon={collection.icon} className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 self-center">
        <span className="flex items-start justify-between gap-2">
          <span className={cn("flex min-w-0 items-center gap-2 text-base font-semibold transition-colors", accent ? "group-hover/collection:text-[var(--ca)]" : "group-hover/collection:text-amethyst")}>
            {collection.icon && collection.previews.length ? (
              <CollectionIcon icon={collection.icon} className={cn("size-4 shrink-0", accent ? "text-[var(--ca)]" : "text-amethyst")} />
            ) : null}
            <span className="truncate">{collection.name}</span>
          </span>
          <ArrowUpRight aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5", accent ? "group-hover/collection:text-[var(--ca)]" : "group-hover/collection:text-amethyst")} />
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

function FeaturedEntry({ featured }: { featured: HomeFeaturedEntry }) {
  const { entry } = featured;
  const progress = entryProgress(entry);
  const backdrop = featured.bannerUrl ?? entry.coverUrl;
  return (
    <Link
      href={featured.href}
      className="group/featured relative isolate flex min-w-0 items-end gap-5 overflow-hidden rounded-xl border border-white/[0.08] bg-surface/40 p-4 transition-[border-color,box-shadow] duration-200 outline-none hover:border-amethyst/45 hover:shadow-[0_26px_60px_-30px_rgb(var(--accent-rgb)/0.8)] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50 sm:p-6 md:min-h-60 md:gap-7 md:p-7"
    >
      <span aria-hidden className="absolute inset-0 -z-10">
        {backdrop ? (
          <MediaImage src={backdrop} alt="" className={featured.bannerUrl ? "opacity-55 transition-[scale] duration-700 group-hover/featured:scale-[1.02]" : "scale-110 opacity-35 blur-2xl"} />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgb(var(--accent-rgb)/0.22),transparent_60%)]" />
        )}
        <span className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />
      </span>
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-lg border border-white/[0.1] bg-surface shadow-[0_22px_50px_-20px_rgb(var(--shadow-rgb)/calc(0.95*var(--shadow-alpha)))]",
          entry.coverShape === "square" ? "size-28 md:size-40" : "h-36 w-24 md:h-52 md:w-36",
        )}
      >
        <MediaImage src={entry.coverUrl} alt="" fallbackLabel={entry.title} />
      </span>
      <span className="min-w-0 flex-1 pb-1">
        <span className="block truncate text-[11px] font-semibold tracking-[0.16em] text-amethyst uppercase">{featured.collectionName}</span>
        <span className="mt-1.5 line-clamp-2 text-xl leading-tight font-semibold tracking-tight break-words transition-colors group-hover/featured:text-amethyst md:text-3xl">{entry.title}</span>
        {progress.total ? (
          <ProgressMeter done={progress.done} total={progress.total} label={progress.label} className="mt-3 max-w-xs" />
        ) : (
          <span className="mt-2 block truncate text-xs text-muted-foreground">No {progress.label} yet</span>
        )}
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/85">
          Open workspace <ArrowRight aria-hidden className="size-4 text-amethyst transition-transform group-hover/featured:translate-x-1" />
        </span>
      </span>
    </Link>
  );
}

function FeaturedImage({ url, caption }: { url: string; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-white/[0.08] bg-surface/40">
      <div className="relative aspect-[16/9] md:aspect-[21/8]">
        <MediaImage src={url} alt={caption || "Featured image"} />
      </div>
      {caption ? <figcaption className="border-t border-white/[0.06] px-4 py-3 text-sm break-words text-foreground/80">{caption}</figcaption> : null}
    </figure>
  );
}

export default async function HomePage() {
  const ctx = await requireUser();
  const preferences = await loadPreferences(ctx);
  const chosen = preferences.homeFeatured;
  const home = await loadHome(ctx, chosen?.kind === "entry" ? chosen.entryId : null);
  const showAchievements = preferences.homeSections.some((section) => section.id === "achievements" && !section.hidden);
  const [achievementCards, coinBalance] = await Promise.all([loadAchievementCards(ctx), loadCoinBalance(ctx).catch(() => null)]);
  const { pinStyle } = preferences;
  const categories = home.collections.map(({ id, slug, name, description }) => ({ id, slug, name, description }));
  const hasEntries = home.counts.entries > 0;
  const featuredMissing = chosen?.kind === "entry" && !home.featured;
  let index = 1;

  const builders: Record<HomeSectionId, (index: number) => ReactNode> = {
    featured: (position) =>
      chosen?.kind === "image" ? (
        <Section id="featured" title="Featured" icon={Sparkles} index={position}>
          <FeaturedImage url={chosen.url} caption={chosen.caption} />
        </Section>
      ) : home.featured ? (
        <Section id="featured" title="Featured" icon={Sparkles} index={position}>
          <FeaturedEntry featured={home.featured} />
        </Section>
      ) : null,
    pinned: (position) =>
      hasEntries ? (
        <Section id="pinned" title="Pinned favorites" icon={Pin} index={position}>
          {home.pinned.length ? (
            <ul aria-label="Pinned entries" className={PINNED_GRID}>
              {home.pinned.map((entry, slot) => (
                <li key={entry.id}><PosterCard entry={entry} pinStyle={pinStyle} priority={slot < 5} /></li>
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
      ) : null,
    recent: (position) =>
      home.recent.length ? (
        <Section id="recent" title="Recently opened" icon={History} index={position}>
          <ul aria-label="Recently opened" className={POSTER_GRID}>
            {home.recent.map((entry) => (
              <li key={entry.id}><PosterCard entry={entry} pinStyle={pinStyle} /></li>
            ))}
          </ul>
        </Section>
      ) : null,
    collections: (position) =>
      home.collections.length ? (
        <Section
          id="collections"
          title="Your collections"
          icon={LibraryBig}
          index={position}
          action={home.collections.length > 1 ? <ArrangeCollectionsButton collections={categories} /> : null}
        >
          <ul aria-label="Your collections" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {home.collections.map((collection) => (
              <li key={collection.id} className="min-w-0"><CollectionCard collection={collection} /></li>
            ))}
          </ul>
        </Section>
      ) : null,
    tasks: (position) =>
      hasEntries ? (
        <Section id="tasks" title="Upcoming tasks" icon={CalendarClock} index={position}>
          {home.tasks.length ? <UpcomingTasks tasks={home.tasks} /> : <Hint>No open tasks with due dates. Add a due date to a checklist task to see it here.</Hint>}
        </Section>
      ) : null,
    glance: (position) =>
      hasEntries ? (
        <Section id="glance" title="At a glance" icon={Layers} index={position}>
          <dl className="grid grid-cols-3 rounded-xl border border-white/[0.07] bg-surface/30 px-4 py-5 md:px-6">
            {[
              { label: home.counts.collections === 1 ? "Collection" : "Collections", value: home.counts.collections },
              { label: home.counts.entries === 1 ? "Entry" : "Entries", value: home.counts.entries },
              { label: home.counts.files === 1 ? "Workspace file" : "Workspace files", value: home.counts.files },
            ].map((stat, slot) => (
              <div key={stat.label} className={cn("min-w-0", slot > 0 && "border-l border-white/[0.06] pl-4 md:pl-8")}>
                <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums md:text-3xl">{stat.value.toLocaleString("en")}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null,
    achievements: (position) => {
      const earnedIds = new Set(achievementCards.filter((item) => item.earnedAt).map((item) => item.id));
      const earned = ACHIEVEMENTS.filter((item) => earnedIds.has(item.id)).slice(0, 6);
      return showAchievements ? (
        <Section
          id="achievements"
          title="Earned achievements"
          icon={Award}
          index={position}
          action={<Link href="/achievements" className="text-sm font-medium text-amethyst underline-offset-4 hover:underline">View all</Link>}
        >
          {earned.length ? (
            <ul className="grid gap-x-6 gap-y-3 border-y border-white/[0.08] py-3 sm:grid-cols-2 lg:grid-cols-3">
              {earned.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                  <AchievementBadge achievement={item} earned size={26} />
                  <span className="min-w-0 truncate font-medium">{item.name}</span>
                </li>
              ))}
            </ul>
          ) : <Hint>No achievements earned yet. Your milestones will appear here.</Hint>}
        </Section>
      ) : null;
    },
  };

  const gettingStarted = !hasEntries ? <GettingStarted home={home} index={index++} /> : null;
  const nodes: Partial<Record<HomeSectionId, ReactNode>> = {};
  for (const section of preferences.homeSections) {
    const node = builders[section.id](index);
    if (!node) continue;
    nodes[section.id] = node;
    if (!section.hidden) index += 1;
  }

  return (
    <EntranceScope>
      <HomeCustomizeProvider>
        <Hero home={home} categories={categories} greeting={preferences.homeGreeting} />

        {gettingStarted}

        <HomeSections
          layout={preferences.homeSections}
          nodes={nodes}
          greeting={preferences.homeGreeting}
          defaultGreeting={defaultGreeting(home)}
          featured={chosen}
          featuredTitle={home.featured?.entry.title ?? null}
          featuredMissing={featuredMissing}
          fan={home.fan}
          collections={home.collections.map(({ id, name, icon, coverCount }) => ({
            id,
            name,
            icon: <CollectionIcon icon={icon} className="size-3.5" />,
            coverCount,
          }))}
        />

        <div className={cn(INNER, "grid max-w-3xl gap-3 pt-2 pb-10 sm:grid-cols-2 md:pb-12")}>
          <ArcadeMarquee balance={coinBalance} />
          <Link
            href="/achievements"
            prefetch={false}
            className="group/achievements flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-surface/40 px-4 py-3 transition-colors outline-none hover:border-amethyst/45 hover:bg-amethyst/[0.06] focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-amethyst/50"
          >
            <span aria-hidden className="grid size-9 shrink-0 place-items-center">
              <AchievementBadge achievement={{ icon: "Medal", group: "Discovery" }} earned={achievementCards.some((item) => item.earnedAt)} size={36} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Achievements</span>
              <span className="block truncate text-xs text-muted-foreground">
                {achievementCards.filter((item) => item.earnedAt).length} of {ACHIEVEMENTS.length} medals in your cabinet
              </span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-amethyst transition-transform group-hover/achievements:translate-x-0.5" />
          </Link>
        </div>
      </HomeCustomizeProvider>
    </EntranceScope>
  );
}

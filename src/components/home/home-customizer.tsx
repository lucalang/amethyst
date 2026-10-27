"use client";

import { createContext, Fragment, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  History,
  ImageIcon,
  Layers,
  LibraryBig,
  Loader2,
  Pin,
  Search,
  Sparkles,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useSaveSettings } from "@/app/(vault)/settings/setting-controls";
import { ChangedBadge, ResetIconButton } from "@/app/(vault)/settings/reset-button";
import { FanEditor, type FanCollection } from "@/components/home/fan-editor";
import { ImageUrlField } from "@/components/media/image-url-field";
import { MediaImage } from "@/components/media/media-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { CoverShape } from "@/lib/cover-shape";
import type { FanItem } from "@/lib/home-fan";
import {
  HIDDEN_BY_DEFAULT,
  HOME_SECTION_IDS,
  MAX_FEATURED_CAPTION_LENGTH,
  MAX_GREETING_LENGTH,
  type HomeFeatured,
  type HomeSection,
  type HomeSectionId,
  type Settings,
  type SettingsPatch,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

const INNER = "mx-auto w-full max-w-[88rem] px-4 md:px-6";

const SECTION_META: Record<HomeSectionId, { title: string; icon: LucideIcon }> = {
  featured: { title: "Featured", icon: Sparkles },
  pinned: { title: "Pinned favorites", icon: Pin },
  recent: { title: "Recently opened", icon: History },
  collections: { title: "Your collections", icon: LibraryBig },
  tasks: { title: "Upcoming tasks", icon: CalendarClock },
  glance: { title: "At a glance", icon: Layers },
  achievements: { title: "Earned achievements", icon: Award },
  myDay: { title: "My Day", icon: Sun },
};

const DEFAULT_LAYOUT: HomeSection[] = HOME_SECTION_IDS.map((id) => ({ id, hidden: HIDDEN_BY_DEFAULT.includes(id) }));

type CustomizeState = { customizing: boolean; setCustomizing: (value: boolean) => void };
const CustomizeContext = createContext<CustomizeState>({ customizing: false, setCustomizing: () => {} });

export function HomeCustomizeProvider({ children }: { children: ReactNode }) {
  const [customizing, setCustomizing] = useState(false);
  return <CustomizeContext.Provider value={{ customizing, setCustomizing }}>{children}</CustomizeContext.Provider>;
}

export function CustomizeHomeButton({ className }: { className?: string }) {
  const { customizing, setCustomizing } = useContext(CustomizeContext);
  return (
    <Button
      id="customize-home-button"
      type="button"
      variant="ghost"
      aria-expanded={customizing}
      aria-controls="customize-home"
      onClick={() => {
        setCustomizing(!customizing);
        if (!customizing) requestAnimationFrame(() => document.getElementById("customize-home-heading")?.focus());
      }}
      className={cn("h-10 gap-2 px-3 text-muted-foreground hover:bg-amethyst/[0.08] hover:text-foreground [&_svg]:text-amethyst", className)}
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      {customizing ? "Customizing…" : "Customize Home"}
    </Button>
  );
}

/** Local copy of one setting that follows the server value and saves each change. */
function useLocalSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const save = useSaveSettings();
  const [local, setLocal] = useState(value);
  const [shown, setShown] = useState(value);
  if (JSON.stringify(shown) !== JSON.stringify(value)) {
    setShown(value);
    setLocal(value);
  }
  function commit(next: Settings[K]) {
    const previous = local;
    setLocal(next);
    void save({ [key]: next } as SettingsPatch).then((ok) => {
      if (!ok) setLocal(previous);
    });
  }
  return [local, setLocal, commit] as const;
}

/**
 * Home sections in the saved order. "Customize Home" adds a panel for the greeting, the featured
 * item and the section order/visibility; changes save to the account as they are made.
 */
export function HomeSections({
  layout,
  nodes,
  greeting,
  defaultGreeting,
  featured,
  featuredTitle,
  featuredMissing,
  fan,
  collections,
}: {
  layout: HomeSection[];
  /** Rendered sections; missing ids have nothing to show right now. */
  nodes: Partial<Record<HomeSectionId, ReactNode>>;
  greeting: string;
  defaultGreeting: string;
  featured: HomeFeatured;
  featuredTitle: string | null;
  featuredMissing: boolean;
  fan: FanItem[];
  collections: FanCollection[];
}) {
  const { customizing, setCustomizing } = useContext(CustomizeContext);
  const [sections, setSections, commitSections] = useLocalSetting("homeSections", layout);
  const isDefault = JSON.stringify(sections) === JSON.stringify(DEFAULT_LAYOUT);

  return (
    <>
      {customizing ? (
        <section id="customize-home" aria-labelledby="customize-home-heading" className={cn(INNER, "pt-6 md:pt-8")}>
          <div className="rounded-xl border border-amethyst/30 bg-[linear-gradient(160deg,rgb(var(--accent-rgb)/0.07),transparent_60%)] p-4 shadow-[0_24px_60px_-36px_rgb(var(--accent-rgb)/0.8)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="customize-home-heading" tabIndex={-1} className="flex items-center gap-2.5 text-lg font-semibold tracking-tight outline-none">
                  <SlidersHorizontal aria-hidden className="size-4 text-amethyst" />
                  Customize Home
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Changes save to your account as you make them.</p>
              </div>
              <Button
                type="button"
                className="h-9 gap-2 px-4"
                onClick={() => {
                  setCustomizing(false);
                  requestAnimationFrame(() => document.getElementById("customize-home-button")?.focus());
                }}
              >
                <Check aria-hidden className="size-4" /> Done
              </Button>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <GreetingEditor greeting={greeting} defaultGreeting={defaultGreeting} />
                <FeaturedEditor featured={featured} featuredTitle={featuredTitle} missing={featuredMissing} />
                <FanEditor fan={fan} collections={collections} />
              </div>
              <SectionArranger
                sections={sections}
                available={(id) => Boolean(nodes[id])}
                onPreview={setSections}
                onCommit={commitSections}
                featuredMissing={featuredMissing}
                changed={!isDefault}
                onReset={() => commitSections(DEFAULT_LAYOUT)}
              />
            </div>
          </div>
        </section>
      ) : null}
      {sections.map((section) => (section.hidden || !nodes[section.id] ? null : <Fragment key={section.id}>{nodes[section.id]}</Fragment>))}
    </>
  );
}

function GreetingEditor({ greeting, defaultGreeting }: { greeting: string; defaultGreeting: string }) {
  const save = useSaveSettings();
  const [value, setValue] = useState(greeting);
  const [shown, setShown] = useState(greeting);
  if (shown !== greeting) {
    setShown(greeting);
    setValue(greeting);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string, delay = 700) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ homeGreeting: next.trim() }), delay);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-6 items-center gap-2">
        <Label htmlFor="home-greeting">Greeting</Label>
        {value ? (
          <>
            <ChangedBadge />
            <ResetIconButton label="the greeting" defaultLabel={defaultGreeting} onReset={() => update("", 0)} />
          </>
        ) : null}
      </div>
      <Input
        id="home-greeting"
        value={value}
        maxLength={MAX_GREETING_LENGTH}
        placeholder={defaultGreeting}
        onChange={(event) => update(event.target.value)}
        aria-describedby="home-greeting-hint"
        className="h-10 min-w-0"
      />
      <p id="home-greeting-hint" className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>Leave empty to keep “{defaultGreeting}”.</span>
        <span className="tabular-nums">
          {value.length}/{MAX_GREETING_LENGTH}
        </span>
      </p>
    </div>
  );
}

type EntryResult = { id: string; title: string; collectionName: string; coverUrl: string | null; coverShape: CoverShape };

function FeaturedEditor({ featured, featuredTitle, missing }: { featured: HomeFeatured; featuredTitle: string | null; missing: boolean }) {
  const [current, , commit] = useLocalSetting("homeFeatured", featured);
  const [mode, setMode] = useState<"entry" | "image">(featured?.kind === "image" ? "image" : "entry");
  const [editing, setEditing] = useState(!featured);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [chosenTitle, setChosenTitle] = useState<string | null>(null);
  const modeName = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["entry-search", debounced],
    queryFn: ({ signal }) => apiFetch<{ entries: EntryResult[] }>(`/api/entries?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: editing && mode === "entry",
    staleTime: 30_000,
  });

  const shownTitle = current?.kind === "entry" ? (chosenTitle ?? featuredTitle) : null;

  return (
    <fieldset className="space-y-3">
      <legend className="flex min-h-6 items-center gap-2 text-sm font-medium">
        Featured
        {current ? (
          <>
            <ChangedBadge />
            <ResetIconButton
              label="the featured item"
              defaultLabel="nothing featured"
              onReset={() => {
                commit(null);
                setChosenTitle(null);
                setEditing(true);
              }}
            />
          </>
        ) : null}
      </legend>
      {current ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-black/30 p-2.5">
          {current.kind === "image" ? (
            <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded border border-white/[0.08] bg-surface">
              <MediaImage src={current.url} alt="" />
            </span>
          ) : (
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded border border-amethyst/25 bg-amethyst/[0.08] text-amethyst">
              <Sparkles className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1 text-sm">
            {current.kind === "image" ? (
              <>
                <span className="block font-medium">Custom image</span>
                <span className="block truncate text-xs text-muted-foreground">{current.caption || "No caption"}</span>
              </>
            ) : missing && !chosenTitle ? (
              <span className="flex items-start gap-1.5 text-amber-200">
                <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                The featured entry was deleted, so the section is hidden. Choose another or reset it.
              </span>
            ) : (
              <>
                <span className="block text-xs text-muted-foreground">Entry</span>
                <span className="block truncate font-medium">{shownTitle ?? "Selected entry"}</span>
              </>
            )}
          </span>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-expanded={editing} onClick={() => setEditing(!editing)}>
            Change
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Feature one entry or an image of your own. The section stays hidden until you pick something.</p>
      )}

      {editing ? (
        <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.015] p-3">
          <div role="radiogroup" aria-label="Feature" className="inline-flex rounded-md border border-white/[0.1] p-0.5">
            {(["entry", "image"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  mode === option ? "bg-amethyst/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input type="radio" name={modeName} value={option} checked={mode === option} onChange={() => setMode(option)} className="sr-only" />
                {option === "entry" ? <Sparkles aria-hidden className="size-3.5" /> : <ImageIcon aria-hidden className="size-3.5" />}
                {option === "entry" ? "An entry" : "An image"}
              </label>
            ))}
          </div>

          {mode === "entry" ? (
            <div className="space-y-2">
              <Label htmlFor="featured-search" className="sr-only">
                Search entries
              </Label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="featured-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your entries" className="h-10 pl-9" maxLength={100} />
              </div>
              {results.isPending ? (
                <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" /> Searching…
                </p>
              ) : results.isError ? (
                <p role="alert" className="py-2 text-xs text-rose">
                  Couldn’t search entries. Try again.
                </p>
              ) : results.data.entries.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">{debounced ? "No entries match." : "No entries yet."}</p>
              ) : (
                <ul aria-label="Entries" className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {results.data.entries.map((entry) => {
                    const selected = current?.kind === "entry" && current.entryId === entry.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            commit({ kind: "entry", entryId: entry.id });
                            setChosenTitle(entry.title);
                            setEditing(false);
                          }}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-3 rounded-md border px-2 py-1.5 text-left transition-colors outline-none hover:border-amethyst/40 hover:bg-amethyst/[0.06] focus-visible:ring-2 focus-visible:ring-ring",
                            selected ? "border-amethyst/50 bg-amethyst/[0.08]" : "border-transparent",
                          )}
                        >
                          <span className={cn("relative shrink-0 overflow-hidden rounded-sm bg-surface", entry.coverShape === "square" ? "size-9" : "h-11 w-[1.85rem]")}>
                            <MediaImage src={entry.coverUrl} alt="" fallbackLabel={entry.title} className="text-[9px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{entry.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{entry.collectionName}</span>
                          </span>
                          {selected ? <Check aria-hidden className="size-4 shrink-0 text-amethyst" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const url = String(data.get("featuredUrl") ?? "").trim();
                const caption = String(data.get("featuredCaption") ?? "").trim();
                if (!url) {
                  setImageError("Add an image link or upload an image.");
                  return;
                }
                setImageError(null);
                commit({ kind: "image", url, caption });
                setEditing(false);
              }}
            >
              <ImageUrlField
                id="featured-image"
                name="featuredUrl"
                label="Image"
                hint="Paste a link or upload a wide image."
                defaultValue={current?.kind === "image" ? current.url : ""}
                error={imageError ?? undefined}
                shape="banner"
              />
              <div className="space-y-1.5">
                <Label htmlFor="featured-caption">Caption (optional)</Label>
                <Input id="featured-caption" name="featuredCaption" defaultValue={current?.kind === "image" ? current.caption : ""} maxLength={MAX_FEATURED_CAPTION_LENGTH} className="h-10" />
              </div>
              <Button type="submit" className="h-9 gap-2 px-4">
                <ImageIcon aria-hidden className="size-4" /> Use this image
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}

function SectionArranger({
  sections,
  available,
  onPreview,
  onCommit,
  featuredMissing,
  changed,
  onReset,
}: {
  sections: HomeSection[];
  available: (id: HomeSectionId) => boolean;
  onPreview: (sections: HomeSection[]) => void;
  onCommit: (sections: HomeSection[]) => void;
  featuredMissing: boolean;
  changed: boolean;
  onReset: () => void;
}) {
  const [dragId, setDragId] = useState<HomeSectionId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const dragStart = useRef<string>("");

  function relocate(list: HomeSection[], id: HomeSectionId, target: number) {
    const from = list.findIndex((item) => item.id === id);
    const to = Math.max(0, Math.min(list.length - 1, target));
    if (from < 0 || from === to) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  function announce(list: HomeSection[], id: HomeSectionId) {
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) setAnnouncement(`${SECTION_META[id].title}, position ${index + 1} of ${list.length}.`);
  }

  function move(id: HomeSectionId, delta: number, focus: "button" | "handle") {
    const index = sections.findIndex((item) => item.id === id);
    const next = relocate(sections, id, index + delta);
    if (next === sections) return;
    onCommit(next);
    announce(next, id);
    requestAnimationFrame(() => {
      const button = document.getElementById(`home-section-${id}-${delta < 0 ? "up" : "down"}`) as HTMLButtonElement | null;
      if (focus === "button" && button && !button.disabled) button.focus();
      else document.getElementById(`home-section-${id}-handle`)?.focus();
    });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, id: HomeSectionId) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    dragStart.current = JSON.stringify(sections);
    setDragId(id);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>, id: HomeSectionId) {
    if (dragId !== id || !listRef.current) return;
    let target = 0;
    for (const row of listRef.current.querySelectorAll<HTMLElement>("[data-section-id]")) {
      if (row.dataset.sectionId === id) continue;
      const rect = row.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) target += 1;
    }
    const next = relocate(sections, id, target);
    if (next !== sections) onPreview(next);
  }

  function onPointerEnd(id: HomeSectionId) {
    if (dragId !== id) return;
    setDragId(null);
    announce(sections, id);
    if (JSON.stringify(sections) !== dragStart.current) onCommit(sections);
  }

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, id: HomeSectionId) {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(id, -1, "handle");
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(id, 1, "handle");
    }
  }

  return (
    <div className="lg:order-first">
      <div className="flex min-h-6 items-center gap-2">
        <h3 id="home-sections-label" className="text-sm font-medium">
          Sections
        </h3>
        {changed ? (
          <>
            <ChangedBadge />
            <ResetIconButton label="the section layout" defaultLabel="original order, all shown" onReset={onReset} />
          </>
        ) : null}
      </div>
      <p id="home-sections-instructions" className="mt-1 text-xs text-muted-foreground">
        Drag a row by its handle, use the arrows, or focus a handle and press the arrow keys. The order is the same on every screen size.
      </p>
      <ol ref={listRef} aria-labelledby="home-sections-label" className={cn("mt-3 space-y-1.5", dragId && "select-none")}>
        {sections.map((section, index) => {
          const meta = SECTION_META[section.id];
          const dragging = dragId === section.id;
          const empty = !available(section.id);
          const status = section.hidden
            ? "Hidden"
            : empty
              ? section.id === "featured"
                ? featuredMissing
                  ? "Entry deleted"
                  : "Nothing featured"
                : "Nothing to show yet"
              : null;
          return (
            <li
              key={section.id}
              data-section-id={section.id}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md border py-1 pr-1 pl-1 transition-[background-color,border-color,box-shadow,opacity] duration-150",
                dragging ? "relative z-10 border-amethyst/45 bg-amethyst/[0.1] shadow-lg shadow-black/50" : "border-white/[0.07] bg-black/30",
              )}
            >
              <button
                type="button"
                id={`home-section-${section.id}-handle`}
                aria-label={`Reorder ${meta.title}`}
                aria-describedby="home-sections-instructions"
                className={cn(
                  "grid size-9 shrink-0 touch-none place-items-center rounded text-muted-foreground transition-colors outline-none hover:bg-amethyst/[0.08] hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring",
                  dragging ? "cursor-grabbing text-amethyst" : "cursor-grab",
                )}
                onPointerDown={(event) => onPointerDown(event, section.id)}
                onPointerMove={(event) => onPointerMove(event, section.id)}
                onPointerUp={() => onPointerEnd(section.id)}
                onPointerCancel={() => onPointerEnd(section.id)}
                onLostPointerCapture={() => onPointerEnd(section.id)}
                onKeyDown={(event) => onHandleKey(event, section.id)}
              >
                <GripVertical aria-hidden className="size-4" />
              </button>
              <span aria-hidden className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <meta.icon aria-hidden className={cn("ml-1 size-3.5 shrink-0", section.hidden ? "text-muted-foreground/50" : "text-amethyst/80")} />
              <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", section.hidden && "text-muted-foreground")}>
                {meta.title}
                {status ? <span className="ml-2 text-xs font-normal text-muted-foreground">· {status}</span> : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn("pointer-coarse:size-9", section.hidden ? "text-muted-foreground" : "text-amethyst")}
                aria-label={`Show ${meta.title}`}
                aria-pressed={!section.hidden}
                title={section.hidden ? "Show section" : "Hide section"}
                onClick={() => {
                  onCommit(sections.map((item) => (item.id === section.id ? { ...item, hidden: !item.hidden } : item)));
                  setAnnouncement(`${meta.title} ${section.hidden ? "shown" : "hidden"}.`);
                }}
              >
                {section.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
              <Button
                id={`home-section-${section.id}-up`}
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                aria-label={`Move ${meta.title} up`}
                title="Move up"
                disabled={index === 0}
                onClick={() => move(section.id, -1, "button")}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                id={`home-section-${section.id}-down`}
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                aria-label={`Move ${meta.title} down`}
                title="Move down"
                disabled={index === sections.length - 1}
                onClick={() => move(section.id, 1, "button")}
              >
                <ArrowDown aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

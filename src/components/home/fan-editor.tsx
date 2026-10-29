"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GripVertical, ImageIcon, Layers, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { ChangedBadge, ResetIconButton } from "@/app/(vault)/settings/reset-button";
import { CoverFan } from "@/components/home/cover-fan";
import { ImageUrlField } from "@/components/media/image-url-field";
import { MediaImage } from "@/components/media/media-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { CoverShape } from "@/lib/cover-shape";
import { fanItemInput, fanKey, MAX_FAN_ITEMS, type FanItem } from "@/lib/home-fan";
import { cn } from "@/lib/utils";
import { artworkUrl } from "@/lib/validation/entries";

export type FanCollection = { id: string; name: string; icon: ReactNode; coverCount: number };
type EntryResult = { id: string; title: string; collectionName: string; coverUrl: string | null; coverShape: CoverShape; frame: string | null };

// Saves run one after another so a slow request can never overwrite a newer order.
let saving: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<void>) {
  saving = saving.then(task);
}

const itemTitle = (item: FanItem) => (item.kind === "entry" ? item.title : "Your image");
const itemArt = (item: FanItem) => (item.kind === "entry" ? item.coverUrl : item.url);
const itemShape = (item: FanItem) => (item.kind === "entry" ? item.coverShape : item.shape);

function relocate(list: FanItem[], key: string, target: number) {
  const from = list.findIndex((item) => item.key === key);
  const to = Math.max(0, Math.min(list.length - 1, target));
  if (from < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Customize Home: the hand-picked artwork of the cover fan, its order and a live preview. */
export function FanEditor({ fan, collections }: { fan: FanItem[]; collections: FanCollection[] }) {
  const router = useRouter();
  const [items, setItems] = useState(fan);
  const [shown, setShown] = useState(fan);
  if (JSON.stringify(shown) !== JSON.stringify(fan)) {
    setShown(fan);
    setItems(fan);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const dragStart = useRef("");
  const pending = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  function commit(next: FanItem[], message?: string) {
    const previous = items;
    setItems(next);
    if (message) setAnnouncement(message);
    pending.current += 1;
    enqueue(async () => {
      try {
        await apiFetch("/api/home-fan", { method: "PUT", json: { items: next.map(fanItemInput) } });
      } catch (error) {
        toast.error(`Couldn’t save the cover fan: ${errorMessage(error)}`);
        setItems(previous);
      } finally {
        pending.current -= 1;
        // Refresh once the last save lands, so an older response never flashes an older order.
        if (pending.current === 0) router.refresh();
      }
    });
  }

  function rowControl(key: string, role: string) {
    return listRef.current?.querySelector<HTMLButtonElement>(`[data-fan-key="${CSS.escape(key)}"] [data-role="${role}"]`) ?? null;
  }

  function positionMessage(list: FanItem[], key: string) {
    const index = list.findIndex((item) => item.key === key);
    return index >= 0 ? `${itemTitle(list[index])}, position ${index + 1} of ${list.length}.` : "";
  }

  function move(key: string, delta: number, focus: "button" | "handle") {
    const index = items.findIndex((item) => item.key === key);
    const next = relocate(items, key, index + delta);
    if (next === items) return;
    commit(next, positionMessage(next, key));
    requestAnimationFrame(() => {
      const button = rowControl(key, delta < 0 ? "up" : "down");
      if (focus === "button" && button && !button.disabled) button.focus();
      else rowControl(key, "handle")?.focus();
    });
  }

  function remove(key: string) {
    const index = items.findIndex((item) => item.key === key);
    const next = items.filter((item) => item.key !== key);
    commit(next, `${itemTitle(items[index])} removed from the fan.`);
    const neighbour = next[Math.min(index, next.length - 1)];
    requestAnimationFrame(() => (neighbour ? rowControl(neighbour.key, "remove") : openRef.current)?.focus());
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, key: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    dragStart.current = JSON.stringify(items);
    setDragKey(key);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>, key: string) {
    if (dragKey !== key || !listRef.current) return;
    let target = 0;
    for (const row of listRef.current.querySelectorAll<HTMLElement>("[data-fan-key]")) {
      if (row.dataset.fanKey === key) continue;
      const rect = row.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) target += 1;
    }
    const next = relocate(items, key, target);
    if (next !== items) setItems(next);
  }

  function onPointerEnd(key: string) {
    if (dragKey !== key) return;
    setDragKey(null);
    if (JSON.stringify(items) !== dragStart.current) commit(items, positionMessage(items, key));
  }

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(key, -1, "handle");
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(key, 1, "handle");
    }
  }

  const visible = items.filter((item) => itemArt(item)).length;

  return (
    <fieldset className="space-y-3" aria-describedby="home-fan-summary">
      <legend className="flex min-h-6 items-center gap-2 text-sm font-medium">
        Cover fan
        {items.length ? (
          <>
            <ChangedBadge />
            <ResetIconButton label="the cover fan" defaultLabel="no fan" onReset={() => commit([], "Cover fan cleared.")} />
          </>
        ) : null}
      </legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="home-fan-summary" className="min-w-0 flex-1 text-xs text-muted-foreground">
          {items.length
            ? `${items.length} of ${MAX_FAN_ITEMS} chosen. They fan out left to right beside your greeting.`
            : "Nothing chosen, so Home shows no fan. Pick covers from your entries or add images of your own."}
        </p>
        <Button ref={openRef} type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setPickerOpen(true)}>
          <Layers aria-hidden className="size-3.5 text-amethyst" />
          Customize fan
        </Button>
      </div>

      {visible ? (
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/30 px-3 pt-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
          <CoverFan items={items} preview />
        </div>
      ) : null}

      {items.length ? (
        <>
          <p id="home-fan-instructions" className="text-xs text-muted-foreground">
            Number 1 sits on the left. Drag a row by its handle, use the arrows, or focus a handle and press the arrow keys. Removing artwork
            here never deletes the entry or the image.
          </p>
          <ol ref={listRef} aria-label="Fan artwork, left to right" className={cn("space-y-1.5", dragKey && "select-none")}>
            {items.map((item, index) => {
              const title = itemTitle(item);
              const art = itemArt(item);
              const dragging = dragKey === item.key;
              return (
                <li
                  key={item.key}
                  data-fan-key={item.key}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md border p-1 transition-[background-color,border-color,box-shadow] duration-150",
                    dragging ? "relative z-10 border-amethyst/45 bg-amethyst/[0.1] shadow-lg shadow-black/50" : "border-white/[0.07] bg-black/30",
                  )}
                >
                  <button
                    type="button"
                    data-role="handle"
                    aria-label={`Reorder ${title}`}
                    aria-describedby="home-fan-instructions"
                    className={cn(
                      "grid size-9 shrink-0 touch-none place-items-center rounded text-muted-foreground transition-colors outline-none hover:bg-amethyst/[0.08] hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring",
                      dragging ? "cursor-grabbing text-amethyst" : "cursor-grab",
                    )}
                    onPointerDown={(event) => onPointerDown(event, item.key)}
                    onPointerMove={(event) => onPointerMove(event, item.key)}
                    onPointerUp={() => onPointerEnd(item.key)}
                    onPointerCancel={() => onPointerEnd(item.key)}
                    onLostPointerCapture={() => onPointerEnd(item.key)}
                    onKeyDown={(event) => onHandleKey(event, item.key)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                  <span aria-hidden className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className={cn("relative ml-1 shrink-0 overflow-hidden rounded-sm bg-surface", itemShape(item) === "square" ? "size-9" : "h-11 w-[1.85rem]")}>
                    <MediaImage src={art} alt="" fallbackLabel={title} className="text-[9px]" />
                  </span>
                  <span className="ml-1 min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    {art ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.kind === "entry" ? item.collectionName : item.shape === "square" ? "Square image" : "Portrait image"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">No cover art, so it’s skipped</span>
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    data-role="up"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                    aria-label={`Move ${title} left`}
                    title="Move left"
                    disabled={index === 0}
                    onClick={() => move(item.key, -1, "button")}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    data-role="down"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                    aria-label={`Move ${title} right`}
                    title="Move right"
                    disabled={index === items.length - 1}
                    onClick={() => move(item.key, 1, "button")}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    data-role="remove"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-rose pointer-coarse:size-9"
                    aria-label={`Remove ${title} from the fan`}
                    title="Remove from fan"
                    onClick={() => remove(item.key)}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-4 sm:max-w-2xl">
          <ArtworkPicker
            items={items}
            collections={collections}
            max={MAX_FAN_ITEMS}
            title="Customize cover fan"
            description={`Choose up to ${MAX_FAN_ITEMS} covers or images. They appear in the order you select them; rearrange them afterwards.`}
            emptyText="Nothing selected. With an empty fan, Home simply leaves it out."
            fullText="the fan is full"
            imageHint="Paste a link or upload an image. It only decorates the fan; no entry is created."
            addImageLabel="Add to fan"
            saveLabel="Save fan"
            onCancel={() => setPickerOpen(false)}
            onApply={(next) => {
              setPickerOpen(false);
              if (JSON.stringify(next) !== JSON.stringify(items)) commit(next, `Cover fan updated: ${next.length} of ${MAX_FAN_ITEMS}.`);
            }}
          />
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}

/** Pick and order artwork (entry covers or own images); it mounts with its dialog, so every opening starts from the saved choice. */
export function ArtworkPicker({
  items,
  collections,
  scope = null,
  max,
  title,
  description,
  emptyText,
  fullText,
  imageHint,
  addImageLabel,
  saveLabel,
  reorderable = false,
  preview,
  footerAction,
  onCancel,
  onApply,
}: {
  items: FanItem[];
  collections: FanCollection[];
  /** Limit entry covers to one collection (hides the collection filter). */
  scope?: string | null;
  max: number;
  title: string;
  description: string;
  emptyText: string;
  fullText: string;
  imageHint: string;
  addImageLabel: string;
  saveLabel: string;
  /** Show move buttons on the selected artwork. */
  reorderable?: boolean;
  /** Live preview of the current selection. */
  preview?: (draft: FanItem[]) => ReactNode;
  /** Extra footer control, e.g. a reset; receives a setter for the draft. */
  footerAction?: (setDraft: (items: FanItem[]) => void, draft: FanItem[]) => ReactNode;
  onCancel: () => void;
  onApply: (items: FanItem[]) => void;
}) {
  const [draft, setDraft] = useState(items);
  const [tab, setTab] = useState<"entries" | "image">("entries");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [collection, setCollection] = useState<string | null>(scope);
  const [shape, setShape] = useState<CoverShape>("portrait");
  const [imageError, setImageError] = useState<string | null>(null);
  const [fieldKey, setFieldKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const tabName = useId();
  const shapeName = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["fan-entry-search", debounced, collection],
    queryFn: ({ signal }) =>
      apiFetch<{ entries: EntryResult[] }>(`/api/entries?artwork=1&q=${encodeURIComponent(debounced)}${collection ? `&collection=${collection}` : ""}`, { signal }),
    enabled: tab === "entries",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const full = draft.length >= max;
  const positions = new Map(draft.map((item, index) => [item.key, index + 1]));
  const sources = scope ? [] : collections.filter((item) => item.coverCount > 0);

  function moveDraft(key: string, delta: number) {
    const index = draft.findIndex((item) => item.key === key);
    const next = relocate(draft, key, index + delta);
    if (next === draft) return;
    setDraft(next);
    setAnnouncement(`${itemTitle(draft[index])}, position ${index + delta + 1} of ${next.length}.`);
  }

  function toggleEntry(entry: EntryResult) {
    const key = fanKey({ entryId: entry.id });
    if (positions.has(key)) {
      setDraft(draft.filter((item) => item.key !== key));
      setAnnouncement(`${entry.title} deselected.`);
    } else if (!full) {
      setDraft([
        ...draft,
        { key, kind: "entry", entryId: entry.id, title: entry.title, collectionName: entry.collectionName, coverUrl: entry.coverUrl, coverShape: entry.coverShape, frame: entry.frame },
      ]);
      setAnnouncement(`${entry.title} selected, position ${draft.length + 1}.`);
    }
  }

  function addImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get("fanImageUrl") ?? "").trim();
    const parsed = artworkUrl.safeParse(raw);
    if (!raw || !parsed.success || !parsed.data) {
      setImageError(parsed.success || !raw ? "Add an image link or upload an image." : (parsed.error.issues[0]?.message ?? "That image link can’t be used."));
      return;
    }
    const key = fanKey({ imageUrl: parsed.data });
    if (positions.has(key)) {
      setImageError("That image is already chosen.");
      return;
    }
    if (full) return;
    setImageError(null);
    setDraft([...draft, { key, kind: "image", url: parsed.data, shape }]);
    setFieldKey((value) => value + 1);
    setAnnouncement(`Image added, position ${draft.length + 1}.`);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers aria-hidden className="size-4 text-amethyst" />
          {title}
        </DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {preview?.(draft)}

      {draft.length ? (
        <ol aria-label="Selected artwork" className="flex gap-2 overflow-x-auto pb-1">
          {draft.map((item, index) => (
            <li key={item.key} className="relative shrink-0">
              <span className={cn("relative block overflow-hidden rounded-sm border border-white/[0.1] bg-surface", itemShape(item) === "square" ? "size-12" : "h-14 w-[2.35rem]")}>
                <MediaImage src={itemArt(item)} alt="" fallbackLabel={itemTitle(item)} className="text-[9px]" />
              </span>
              <span aria-hidden className="absolute -bottom-1 -left-1 grid size-4 place-items-center rounded-full bg-amethyst text-[9px] font-semibold text-amethyst-foreground">
                {index + 1}
              </span>
              <button
                type="button"
                aria-label={`Remove ${itemTitle(item)}`}
                onClick={() => {
                  setDraft(draft.filter((other) => other.key !== item.key));
                  setAnnouncement(`${itemTitle(item)} removed.`);
                }}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-white/20 outline-none hover:text-rose focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-3" />
              </button>
              {reorderable && draft.length > 1 ? (
                <span className="mt-1.5 flex justify-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${itemTitle(item)} earlier`}
                    title="Move earlier"
                    disabled={index === 0}
                    onClick={() => moveDraft(item.key, -1)}
                    className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-amethyst/10 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
                  >
                    <ArrowLeft aria-hidden className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${itemTitle(item)} later`}
                    title="Move later"
                    disabled={index === draft.length - 1}
                    onClick={() => moveDraft(item.key, 1)}
                    className="grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-amethyst/10 hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
                  >
                    <ArrowRight aria-hidden className="size-3.5" />
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-white/[0.14] px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
      )}

      <div role="radiogroup" aria-label="Add from" className="inline-flex self-start rounded-md border border-white/[0.1] p-0.5">
        {(["entries", "image"] as const).map((option) => (
          <label
            key={option}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              tab === option ? "bg-amethyst/15 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input type="radio" name={tabName} value={option} checked={tab === option} onChange={() => setTab(option)} className="sr-only" />
            {option === "entries" ? <Sparkles aria-hidden className="size-3.5" /> : <ImageIcon aria-hidden className="size-3.5" />}
            {option === "entries" ? "Entry covers" : "Your own image"}
          </label>
        ))}
      </div>

      {tab === "entries" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="relative">
            <Label htmlFor="fan-search" className="sr-only">
              Search entries
            </Label>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="fan-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entries with cover art" className="h-10 pl-9" maxLength={100} />
          </div>
          {sources.length > 1 ? (
            <div role="group" aria-label="Filter by collection" className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
              {[{ id: null, name: "All collections", icon: null, coverCount: 0 } as const, ...sources].map((item) => {
                const active = collection === item.id;
                return (
                  <button
                    key={item.id ?? "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCollection(item.id)}
                    className={cn(
                      "flex h-7 max-w-48 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-amethyst/50 bg-amethyst/15 text-foreground" : "border-white/[0.1] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.icon ? <span className="flex shrink-0 text-amethyst">{item.icon}</span> : null}
                    <span className="truncate">{item.name}</span>
                    {item.id ? <span className="text-muted-foreground tabular-nums">{item.coverCount}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="min-h-40 flex-1 overflow-y-auto pr-1">
            {results.isPending ? (
              <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 aria-hidden className="size-3.5 animate-spin" /> Searching…
              </p>
            ) : results.isError ? (
              <p role="alert" className="py-2 text-xs text-rose">
                Couldn’t search entries. Try again.
              </p>
            ) : results.data.entries.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">{debounced ? "No entries with cover art match." : "No entries with cover art here yet."}</p>
            ) : (
              <ul aria-label="Entries with cover art" className={cn("grid grid-cols-3 gap-3 sm:grid-cols-5", results.isPlaceholderData && "opacity-60")}>
                {results.data.entries.map((entry) => {
                  const position = positions.get(fanKey({ entryId: entry.id }));
                  const selected = position !== undefined;
                  return (
                    <li key={entry.id} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!selected && full}
                        onClick={() => toggleEntry(entry)}
                        className="group/pick block w-full rounded-md p-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span
                          className={cn(
                            "relative grid aspect-[2/3] place-items-center overflow-hidden rounded-md border bg-black/30 transition-[border-color,box-shadow]",
                            selected ? "border-amethyst shadow-[0_0_0_2px_rgb(var(--accent-rgb)/0.45)]" : "border-white/[0.08] group-hover/pick:border-amethyst/40",
                          )}
                        >
                          <span className={cn("relative block w-full overflow-hidden", entry.coverShape === "square" ? "aspect-square" : "h-full")}>
                            <MediaImage src={entry.coverUrl} alt="" fallbackLabel={entry.title} className="text-xs" />
                          </span>
                          {selected ? (
                            <span aria-hidden className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-amethyst text-xs font-semibold text-amethyst-foreground shadow-md">
                              {position}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1.5 block truncate text-xs font-medium">{entry.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{entry.collectionName}</span>
                        {selected ? <span className="sr-only">, selected, position {position}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={addImage}>
          <div role="radiogroup" aria-label="Image shape" className="inline-flex rounded-md border border-white/[0.1] p-0.5">
            {(["portrait", "square"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  shape === option ? "bg-amethyst/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input type="radio" name={shapeName} value={option} checked={shape === option} onChange={() => setShape(option)} className="sr-only" />
                <span aria-hidden className={cn("inline-block rounded-[2px] border border-current", option === "square" ? "size-3" : "h-3.5 w-2.5")} />
                {option === "portrait" ? "Portrait" : "Square"}
              </label>
            ))}
          </div>
          <ImageUrlField
            key={fieldKey}
            id="fan-image"
            name="fanImageUrl"
            label="Image"
            hint={imageHint}
            error={imageError ?? undefined}
            shape={shape === "square" ? "square" : "poster"}
          />
          <Button type="submit" variant="outline" className="h-9 gap-2 px-4" disabled={full}>
            <Plus aria-hidden className="size-4" /> {addImageLabel}
          </Button>
        </form>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {draft.length} of {max} selected{full ? ` · ${fullText}` : ""}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {footerAction?.(setDraft, draft)}
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" className="gap-2" onClick={() => onApply(draft)}>
            <Check aria-hidden className="size-4" /> {saveLabel}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

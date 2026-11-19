"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { MediaImage } from "@/components/media/media-image";
import { ProgressMeter } from "@/components/media/progress-meter";
import { catalogMatcher } from "@/lib/catalog-search";
import type { Category } from "@/lib/categories";
import { entryPath } from "@/lib/collections";
import { SLIM_BASE } from "@/lib/edition";
import { entryProgress, type LibraryEntry } from "@/lib/progress/library";

type Sort = "activity" | "title" | "added";
const SORTS: { id: Sort; label: string }[] = [
  { id: "activity", label: "Recent activity" },
  { id: "title", label: "Title" },
  { id: "added", label: "Newest added" },
];

/** Width of one tile column, in px, before the grid stretches them. */
const MIN_TILE = 150;
const GAP = 14;

/**
 * A collection's entries for the Slim edition: search, label filters and sort over the same library data the full
 * app loads, drawn as a window-virtualized grid so even very large collections stay quick.
 */
export function SlimLibrary({ entries, categories }: { entries: LibraryEntry[]; categories: Category[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("activity");
  const [labels, setLabels] = useState<string[]>([]);
  const deferred = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      setOffset(element.getBoundingClientRect().top + window.scrollY);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const names = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const shown = useMemo(() => {
    const match = catalogMatcher(deferred);
    const list = entries.filter(
      (entry) => labels.every((id) => entry.categoryIds.includes(id)) && (!match || match(entry.title, ...entry.categoryIds.map((id) => names.get(id)))),
    );
    const sorted = [...list];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
    else if (sort === "added") sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    else sorted.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
    return sorted;
  }, [entries, deferred, labels, sort, names]);

  const columns = Math.max(2, Math.floor((width + GAP) / (MIN_TILE + GAP)) || 2);
  const tile = width ? (width - GAP * (columns - 1)) / columns : MIN_TILE;
  // Cover (2:3) plus two lines of text and the progress line.
  const rowHeight = Math.round(tile * 1.5 + 78);
  const rows = Math.ceil(shown.length / columns);
  const virtualizer = useWindowVirtualizer({ count: rows, estimateSize: () => rowHeight, overscan: 3, scrollMargin: offset });
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, columns, virtualizer]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this collection" aria-label="Search this collection" className="slim-field w-full pl-8" />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort" className="slim-field">
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {categories.length ? (
        <div role="group" aria-label="Filter by label" className="flex flex-wrap gap-1.5">
          {categories.map((category) => {
            const on = labels.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={on}
                className="slim-chip"
                onClick={() => setLabels((current) => (on ? current.filter((id) => id !== category.id) : [...current, category.id]))}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground tabular-nums" role="status">
        {shown.length === entries.length ? `${entries.length.toLocaleString("en")} ${entries.length === 1 ? "entry" : "entries"}` : `${shown.length.toLocaleString("en")} of ${entries.length.toLocaleString("en")}`}
      </p>

      <div ref={listRef} className="relative w-full" style={{ height: rows ? virtualizer.getTotalSize() : undefined }}>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {entries.length ? "No entries match." : "No entries yet. Add the first one."}
          </p>
        ) : (
          virtualizer.getVirtualItems().map((row) => (
            <ul
              key={row.key}
              className="absolute left-0 grid w-full"
              style={{ top: row.start - virtualizer.options.scrollMargin, height: rowHeight, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: GAP }}
            >
              {shown.slice(row.index * columns, row.index * columns + columns).map((entry) => {
                const progress = entryProgress(entry);
                return (
                  <li key={entry.id} className="min-w-0">
                    <Link href={`${SLIM_BASE}${entryPath(entry)}`} className="slim-tile">
                      <span className="slim-tile-art" data-square={entry.coverShape === "square" || undefined}>
                        <MediaImage src={entry.coverUrl} alt="" sizes={`${Math.round(tile)}px`} fallbackLabel={entry.title} />
                      </span>
                      <span className="grid gap-1">
                        <span className="slim-tile-title">{entry.title}</span>
                        {progress.total ? <ProgressMeter done={progress.done} total={progress.total} label={progress.label} compact /> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, use, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LibraryBig, Plus, SearchX } from "lucide-react";
import { EmptyState } from "@/components/media/empty-state";
import { PosterCard, type CardDisplay } from "@/components/media/poster-card";
import { Button } from "@/components/ui/button";
import type { LibraryDensity, PinStyle } from "@/lib/preferences";
import { filterLibrary, type LibraryEntry, type LibrarySearch } from "@/lib/progress/library";

const DENSITY_GRID: Record<LibraryDensity, string> = {
  comfortable: "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  compact: "grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8",
  large: "grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-4",
};

/** Delay before a typed query is written to the address bar. Filtering itself is instant. */
const URL_DELAY_MS = 350;
export const MAX_QUERY_LENGTH = 100;

type LibraryState = {
  /** What is in the search box right now. */
  query: string;
  setQuery: (value: string) => void;
  /** Writes any pending query to the URL right away (Enter, or before other filter changes). */
  flushQuery: () => void;
  /** Trimmed query the results currently reflect. */
  appliedQuery: string;
  total: number;
  visible: LibraryEntry[];
  categoryCounts: Record<string, number>;
  /** True once the person has searched on this page, so new results don't replay entrances. */
  searched: boolean;
};

const LibraryContext = createContext<LibraryState | null>(null);

export function useLibrary(): LibraryState {
  const value = use(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside LibrarySearchProvider");
  return value;
}

function clean(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

function writeQueryToUrl(value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/**
 * Search as you type for one collection. The full collection is already on the
 * page, so typing filters locally (no request per keystroke) and the query is
 * mirrored into the URL with replaceState: shareable and reload-safe, without a
 * history entry per character. Status, labels and sorting still come from the
 * server-validated search params.
 */
export function LibrarySearchProvider({ library, search, children }: { library: LibraryEntry[]; search: LibrarySearch; children: ReactNode }) {
  const params = useSearchParams();
  const urlQuery = clean(params.get("q") ?? "");
  const [query, setQueryState] = useState(search.q);
  const [searched, setSearched] = useState(false);
  // The last query this component put in the URL. A URL query that differs from it came from
  // outside (back/forward, "Clear filters") and replaces what is in the box.
  const [written, setWritten] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const writtenRef = useRef(urlQuery);
  const timer = useRef<number | null>(null);

  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== written) {
      setWritten(urlQuery);
      if (urlQuery !== clean(query)) setQueryState(urlQuery);
    }
  }

  useEffect(() => {
    // An outside change wins over a write that is still waiting.
    if (urlQuery !== writtenRef.current && timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    writtenRef.current = urlQuery;
  }, [urlQuery]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const deferredQuery = useDeferredValue(clean(query));
  const visible = useMemo(() => filterLibrary(library, { ...search, q: deferredQuery }), [library, search, deferredQuery]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of visible) for (const id of entry.categoryIds) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [visible]);

  function commit(value: string) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    // Record the write before the URL changes so the update is recognised as our own.
    writtenRef.current = value;
    setWritten(value);
    writeQueryToUrl(value);
  }

  function setQuery(value: string) {
    setQueryState(value);
    setSearched(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(clean(value)), URL_DELAY_MS);
  }

  const value: LibraryState = {
    query,
    setQuery,
    flushQuery: () => commit(clean(query)),
    appliedQuery: deferredQuery,
    total: library.length,
    visible,
    categoryCounts,
    searched,
  };
  return <LibraryContext value={value}>{children}</LibraryContext>;
}

export function LibraryCount() {
  const { visible, total } = useLibrary();
  return (
    <span className="tabular-nums">
      {visible.length === total ? total : `${visible.length} of ${total}`} {total === 1 ? "entry" : "entries"}
    </span>
  );
}

export function LibraryTitle({ name }: { name: string }) {
  const { appliedQuery } = useLibrary();
  return <>{appliedQuery ? `“${appliedQuery}” in ${name}` : name}</>;
}

export function LibraryResults({
  name,
  newHref,
  clearHref,
  density,
  pinStyle,
  display,
  labelNames,
}: {
  name: string;
  newHref: string;
  clearHref: string;
  density: LibraryDensity;
  pinStyle: PinStyle;
  display: CardDisplay;
  labelNames: Record<string, string>;
}) {
  const { visible, total, searched } = useLibrary();

  if (total === 0) {
    return (
      <EmptyState
        icon={LibraryBig}
        title="No entries yet"
        description={`Add your first entry to ${name}.`}
        action={
          <Button asChild>
            <Link href={newHref}>
              <Plus aria-hidden /> New entry
            </Link>
          </Button>
        }
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing matches"
        description="Try a different search or clear the filters."
        action={
          <Button asChild variant="outline">
            <Link href={clearHref} replace scroll={false}>
              Clear filters
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div data-entrance={searched ? "skip" : undefined} className="contents">
      <ul aria-label={name} className={DENSITY_GRID[density]}>
        {visible.map((entry, index) => (
          <li key={entry.id} className="enter enter-card" style={{ "--enter-index": Math.min(index, 8) + 1 } as React.CSSProperties}>
            <PosterCard
              entry={entry}
              priority={index < (density === "compact" ? 8 : 6)}
              pinStyle={pinStyle}
              display={display}
              labels={display.labels ? entry.categoryIds.flatMap((id) => labelNames[id] ?? []) : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
